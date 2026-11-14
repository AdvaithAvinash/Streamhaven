/* Focus manager: one focused element at a time, spatial navigation, focus groups with memory,
 * and transform-based scrollers. Focus is a CSS class (never DOM focus) so the browser cannot
 * scroll clipped containers behind our back.
 *
 * Focusable element  : class "f". Hooks: el._enter(el), el._focus(el), el._menu(el)
 * Group (data-nav)   : "row" | "col" - arrow keys along the axis walk DOM order.
 *                      "panel" - a region entered as a whole (restores its last focused child).
 * Custom group       : node._nav(dir, cur) -> true if handled; node._enterUnit(dir, originRect) -> element
 * A group the focus is not in is treated as ONE target for spatial search, then resolved to its
 * remembered (or nearest visible) child. That keeps off-screen rail items out of the geometry.
 */
(function () {
  'use strict';
  var SH = window.SH;
  var F = SH.Focus = { current: null, scopes: [] };

  function visible(el) { return !!el && el.offsetParent !== null; }
  function rect(el) { return el.getBoundingClientRect(); }
  function cx(r) { return (r.left + r.right) / 2; }
  function cy(r) { return (r.top + r.bottom) / 2; }
  function isGroup(n) { return !!(n._nav || n._enterUnit || (n.hasAttribute && n.hasAttribute('data-nav'))); }

  F.root = function () { return F.scopes.length ? F.scopes[F.scopes.length - 1] : document.getElementById('ui'); };
  F.inScope = function (el) { return !!el && F.root().contains(el) && visible(el); };
  F.list = function (container) {
    var all = container.querySelectorAll('.f'), out = [];
    for (var i = 0; i < all.length; i++) if (visible(all[i])) out.push(all[i]);
    return out;
  };

  F.set = function (el) {
    if (!el) return false;
    if (F.scopes.length && !F.root().contains(el)) { F.pending = el; return false; }   // a dialog owns focus
    var prev = F.current;
    if (prev !== el) {
      if (prev) prev.classList.remove('is-focused');
      F.current = el;
      el.classList.add('is-focused');
    }
    for (var p = el.parentNode; p && p.nodeType === 1; p = p.parentNode) {
      if (isGroup(p)) p._last = el;
      if (p._scroller) p._scroller.reveal(el);
    }
    if (prev !== el) {
      if (el._focus) el._focus(el);
      SH.Bus.emit('focus', el, prev);
    }
    return true;
  };

  F.first = function (container) {
    var pref = container.querySelector('.f[data-autofocus]');
    if (pref && visible(pref)) return F.set(pref);
    var l = F.list(container);
    return l.length ? F.set(l[0]) : false;
  };

  /* Make sure something sensible is focused inside the active scope. */
  F.ensure = function () {
    if (F.current && document.body.contains(F.current) && F.inScope(F.current)) return true;
    if (F.scopes.length) return F.first(F.root());
    if (SH.Router && SH.Router.current) { SH.Router.focus(); return !!F.current; }
    return F.first(F.root());
  };

  function builtinGroupNav(g, dir, cur) {
    var type = g.getAttribute && g.getAttribute('data-nav');
    if (type !== 'row' && type !== 'col') return false;
    var horiz = dir === 'left' || dir === 'right';
    if ((type === 'row') !== horiz) return false;
    var l = F.list(g), i = l.indexOf(cur);
    var n = l[i + ((dir === 'right' || dir === 'down') ? 1 : -1)];
    if (i >= 0 && n) { F.set(n); return true; }
    return false;
  }

  function resolveUnit(unit, dir, o) {
    if (unit._enterUnit) return unit._enterUnit(dir, o);
    var clip = rect(unit), horiz = unit.getAttribute('data-nav') === 'row';
    function inClip(el) {
      var r = rect(el);
      return horiz ? (r.right > clip.left + 2 && r.left < clip.right - 2) : (r.bottom > clip.top + 2 && r.top < clip.bottom - 2);
    }
    var last = unit._last;
    if (last && unit.contains(last) && visible(last) && inClip(last)) return last;
    var l = F.list(unit), best = null, bd = 1e9;
    if (unit.getAttribute('data-nav') === 'panel') { for (var j = 0; j < l.length; j++) if (inClip(l[j])) return l[j]; return l[0] || null; }
    for (var i = 0; i < l.length; i++) {
      if (!inClip(l[i])) continue;
      var r = rect(l[i]);
      var ov = horiz ? Math.min(r.right, o.right) - Math.max(r.left, o.left) : Math.min(r.bottom, o.bottom) - Math.max(r.top, o.top);
      var span = Math.max(1, Math.min(horiz ? r.width : r.height, horiz ? o.width : o.height));
      var d = ov > 0 ? -ov / span + Math.abs(horiz ? r.left - o.left : r.top - o.top) * 0.00001 : (horiz ? Math.abs(cx(r) - cx(o)) : Math.abs(cy(r) - cy(o)));
      if (d < bd) { bd = d; best = l[i]; }
    }
    return best || l[0] || null;
  }

  F.move = function (dir) {
    var cur = F.current, root = F.root();
    if (!cur || !document.body.contains(cur) || !F.inScope(cur)) return F.ensure();

    /* 1. let enclosing groups handle the move */
    for (var g = cur.parentNode; g && g.nodeType === 1; g = g.parentNode) {
      if (g._nav && g._nav(dir, cur) === true) return true;
      if (builtinGroupNav(g, dir, cur)) return true;
      if (g === root) break;
    }

    /* 2. spatial search */
    var o = rect(cur), T = 10 * (SH.scale || 1), all = root.querySelectorAll('.f'), seen = [], best = null, bestScore = 1e12;
    for (var i = 0; i < all.length; i++) {
      var c = all[i];
      if (c === cur || !visible(c)) continue;
      var unit = c;
      for (var p = c.parentNode; p && p !== root && p.nodeType === 1; p = p.parentNode) {
        if (isGroup(p) && !p.contains(cur)) unit = p;
      }
      if (unit !== c) { if (seen.indexOf(unit) >= 0) continue; seen.push(unit); }
      var r = rect(unit._clip || unit), primary, cross;
      if (dir === 'right') { if (r.left < o.right - T) continue; primary = r.left - o.right; }
      else if (dir === 'left') { if (r.right > o.left + T) continue; primary = o.left - r.right; }
      else if (dir === 'down') { if (r.top < o.bottom - T) continue; primary = r.top - o.bottom; }
      else { if (r.bottom > o.top + T) continue; primary = o.top - r.bottom; }
      if (dir === 'left' || dir === 'right') {
        cross = Math.min(o.bottom, r.bottom) - Math.max(o.top, r.top) > 0 ? 0 : Math.min(Math.abs(r.top - o.bottom), Math.abs(o.top - r.bottom));
        if (cross > 48 * (SH.scale || 1)) continue;        // sideways moves never jump to a different band of the screen
        cross = cross * 4 + Math.abs(cy(r) - cy(o)) * 0.02;
      } else {
        cross = Math.min(o.right, r.right) - Math.max(o.left, r.left) > 0 ? 0 : Math.min(Math.abs(r.left - o.right), Math.abs(o.left - r.right));
        cross = cross * 4 + Math.abs(cx(r) - cx(o)) * 0.02;
      }
      var score = Math.max(primary, 0) + cross;
      if (score < bestScore) { bestScore = score; best = unit; }
    }
    if (!best) return false;
    var target = best.classList.contains('f') && !isGroup(best) ? best : resolveUnit(best, dir, o);
    return target ? F.set(target) : false;
  };

  /* ---- Scroller: clip element + translated track ---- */
  function Scroller(view, track, axis, pad) {
    this.view = view; this.track = track; this.axis = axis; this.pad = pad || 0; this.pos = 0;
    view._scroller = this;
  }
  Scroller.prototype.reveal = function (el) {
    var x = this.axis === 'x', t = el;
    if (!x) { for (var s = el; s && s !== this.track; s = s.parentNode) if (s.hasAttribute && s.hasAttribute('data-reveal')) t = s; }
    var start = 0, n = t;
    while (n && n !== this.track) { start += x ? n.offsetLeft : n.offsetTop; n = n.offsetParent; }
    if (!n) return;
    var size = x ? t.offsetWidth : t.offsetHeight;
    var vs = x ? this.view.clientWidth : this.view.clientHeight;
    var ts = x ? this.track.offsetWidth : this.track.offsetHeight;
    var p = this.pos, pad = this.pad;
    if (size + 2 * pad > vs || start - pad < p) p = start - pad;
    else if (start + size + pad > p + vs) p = start + size + pad - vs;
    this.to(SH.clamp(p, 0, Math.max(0, ts - vs)));
  };
  Scroller.prototype.to = function (p) {
    if (p === this.pos) return;
    this.pos = p;
    var v = this.axis === 'x' ? 'translate3d(' + (-p) + 'px,0,0)' : 'translate3d(0,' + (-p) + 'px,0)';
    this.track.style.webkitTransform = v; this.track.style.transform = v;
    if (SH.UI) SH.UI.lazy();
  };
  SH.Scroller = Scroller;
})();

/* Screen router. Root screens (sidebar destinations) replace the whole stack; pushed screens
 * (detail, player) keep the previous screen alive but hidden so BACK restores it with its
 * exact scroll position and focus. */
(function () {
  'use strict';
  var SH = window.SH;
  var R = SH.Router = { defs: {}, stack: [], current: null };

  R.register = function (name, factory) { R.defs[name] = factory; };

  function host() { return document.getElementById('screens'); }
  function make(name, params) {
    var s = R.defs[name](params || {});
    s.name = name; s.params = params || {};
    s.el.classList.add('screen'); s.el.classList.add('screen-' + name);
    host().appendChild(s.el);
    return s;
  }
  function show(s) {
    s.el.classList.remove('hidden');
    R.current = s;
    document.body.classList.toggle('fs', !!s.fullscreen);
    if (s.onShow) s.onShow();
    SH.Bus.emit('screen', s);
    SH.UI.lazy();
  }
  function hide(s) {
    if (SH.Focus.current && s.el.contains(SH.Focus.current)) s.lastFocus = SH.Focus.current;
    if (s.onHide) s.onHide();
    s.el.classList.add('hidden');
  }
  function destroy(s) { if (s.destroy) s.destroy(); if (s.el.parentNode) s.el.parentNode.removeChild(s.el); }

  R.focus = function (pref) {
    var s = R.current; if (!s) return;
    if (pref && s.el.contains(pref) && pref.offsetParent !== null) { SH.Focus.set(pref); return; }
    if (s.focus && s.focus() !== false) return;
    if (!SH.Focus.first(s.el)) SH.Focus.set(SH.Sidebar.activeEl());
  };

  R.root = function (name, params, opts) {
    while (R.stack.length) { var o = R.stack.pop(); if (o === R.current && o.onHide) o.onHide(); destroy(o); }
    var s = make(name, params); R.stack.push(s); show(s);
    if (!(opts && opts.keepFocus)) R.focus();
  };
  R.push = function (name, params) {
    if (R.current) hide(R.current);
    var s = make(name, params); R.stack.push(s); show(s); R.focus();
  };
  R.back = function () {
    if (R.stack.length < 2) return false;
    var s = R.stack.pop(); if (s.onHide) s.onHide(); destroy(s);
    var p = R.stack[R.stack.length - 1];
    if (p.stale && p.onData) { p.stale = false; p.onData(); }
    else if (p.stale) {
      var fid = p.lastFocus && p.lastFocus.getAttribute('data-fid'), n = make(p.name, p.params);
      destroy(p); R.stack[R.stack.length - 1] = n; p = n;
      if (fid) p.lastFocus = n.el.querySelector('.f[data-fid="' + String(fid).replace(/"/g, '') + '"]');
    }
    show(p); R.focus(p.lastFocus);
    return true;
  };

  /* Catalogue or personal data changed: rebuild what is on screen, keep focus where it was. */
  R.refresh = function () {
    var top = R.current; if (!top) return;
    for (var i = 0; i < R.stack.length - 1; i++) R.stack[i].stale = true;
    if (top.onData) { top.onData(); return; }
    var cur = SH.Focus.current, inScreen = cur && top.el.contains(cur), fid = inScreen && cur.getAttribute('data-fid');
    var n = make(top.name, top.params);
    if (top.onHide) top.onHide(); destroy(top);
    R.stack[R.stack.length - 1] = n; show(n);
    if (inScreen && !SH.UI.topDialog()) {
      var again = fid && n.el.querySelector('.f[data-fid="' + String(fid).replace(/"/g, '') + '"]');
      R.focus(again || null);
    }
  };
})();

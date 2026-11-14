/* Virtualised grid / list. Only the visible window (plus a small buffer) exists in the DOM,
 * so a 20,000-channel playlist costs the same as a 20-channel one.
 * opts: items, cols, cellW, cellH, height, render(item, index) -> focusable element, center, onFocus */
(function () {
  'use strict';
  var SH = window.SH, h = SH.h;

  function VGrid(o) {
    var self = this;
    this.o = o; this.items = o.items || []; this.cols = o.cols || 1; this.index = 0; this.scroll = 0; this.cells = {}; this.touched = false;
    this.track = h('div.vgrid-track');
    this.el = h('div.vgrid', { style: 'height:' + o.height + 'px;width:' + (this.cols * o.cellW + 16) + 'px' }, [this.track]);
    this.el._nav = function (dir, cur) {
      var i = cur._i; if (i === undefined) return false;
      var n = i, c = self.cols;
      if (dir === 'left') { if (i % c === 0) return false; n = i - 1; }
      else if (dir === 'right') { if (i % c === c - 1 || i + 1 >= self.items.length) return false; n = i + 1; }
      else if (dir === 'up') { if (i < c) return false; n = i - c; }
      else { if (Math.floor(i / c) >= Math.floor((self.items.length - 1) / c)) return false; n = Math.min(i + c, self.items.length - 1); }
      self.focus(n); return true;
    };
    this.el._enterUnit = function (dir, origin) {
      if (!self.items.length) return null;
      var i = self.index;
      if (!self.touched && self.cols > 1 && origin) {
        var r = self.el.getBoundingClientRect(), col = Math.floor(((origin.left + origin.right) / 2 - r.left) / (o.cellW * (SH.scale || 1)));
        i = Math.min(SH.clamp(col, 0, self.cols - 1) + Math.floor(self.scroll / o.cellH) * self.cols, self.items.length - 1);
      }
      self.place(i); self.render(); return self.cells[i] || null;
    };
    this.render();
  }
  VGrid.prototype.rows = function () { return Math.ceil(this.items.length / this.cols); };
  VGrid.prototype.place = function (i) {
    var o = this.o, row = Math.floor(i / this.cols), top = row * o.cellH, max = Math.max(0, this.rows() * o.cellH - o.height), s = this.scroll;
    if (o.center) s = top - (o.height - o.cellH) / 2;
    else if (top < s) s = top; else if (top + o.cellH > s + o.height) s = top + o.cellH - o.height;
    s = Math.round(SH.clamp(s, 0, max) / o.cellH) * o.cellH;
    if (s > max) s = max;
    this.index = i;
    if (s !== this.scroll) { this.scroll = s; var v = 'translate3d(0,' + (-s) + 'px,0)'; this.track.style.webkitTransform = v; this.track.style.transform = v; }
  };
  VGrid.prototype.render = function () {
    var o = this.o, first = Math.max(0, (Math.floor(this.scroll / o.cellH) - 2) * this.cols), last = Math.min(this.items.length - 1, (Math.ceil((this.scroll + o.height) / o.cellH) + 2) * this.cols - 1), i, self = this;
    for (var k in this.cells) { i = +k; if (i < first || i > last) { this.track.removeChild(this.cells[k]); delete this.cells[k]; } }
    for (i = first; i <= last; i++) {
      if (this.cells[i]) continue;
      var el = o.render(this.items[i], i), user = el._focus;
      el._i = i; el.style.position = 'absolute'; el.style.left = (8 + (i % this.cols) * o.cellW) + 'px'; el.style.top = (Math.floor(i / this.cols) * o.cellH) + 'px';
      el._focus = (function (idx, uf) { return function (e) { self.index = idx; self.touched = true; if (uf) uf(e); if (o.onFocus) o.onFocus(self.items[idx], idx); }; })(i, user);
      this.cells[i] = el; this.track.appendChild(el);
    }
    SH.UI.lazy();
  };
  VGrid.prototype.focus = function (i) {
    if (!this.items.length) return false;
    i = SH.clamp(i, 0, this.items.length - 1);
    this.place(i); this.render();
    return SH.Focus.set(this.cells[i]);
  };
  VGrid.prototype.setItems = function (items, index) {
    this.items = items || [];
    for (var k in this.cells) this.track.removeChild(this.cells[k]);
    this.cells = {}; this.scroll = -1; this.touched = index !== undefined;
    this.place(SH.clamp(index || 0, 0, Math.max(0, this.items.length - 1)));
    this.render();
  };
  /* Re-render visible cells in place (e.g. favourite or health state changed). */
  VGrid.prototype.redraw = function () {
    var had = SH.Focus.current && SH.Focus.current._i !== undefined && this.el.contains(SH.Focus.current);
    for (var k in this.cells) this.track.removeChild(this.cells[k]);
    this.cells = {}; this.render();
    if (had && this.cells[this.index]) { SH.Focus.current = null; SH.Focus.set(this.cells[this.index]); }
  };
  SH.VGrid = VGrid;
})();

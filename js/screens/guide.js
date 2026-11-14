/* TV Guide: virtualised multi-channel timeline. Only the visible rows and the visible time
 * window are rendered; the grid owns its own four-way navigation. */
(function () {
  'use strict';
  var SH = window.SH, h = SH.h, UI = SH.UI, C = SH.Catalog;
  var ROWS = 8, PPM = 8, VIEW_W = 1404, SPAN = VIEW_W / PPM * 60000, M30 = 1800000;
  function floor30(t) { return Math.floor(t / M30) * M30; }

  SH.Router.register('guide', function () {
    var filter = { mode: 'all' }, channels = C.channels, row = 0, top = 0, subs = [];
    var winStart = floor30(Date.now()) - 2 * M30, winEnd = winStart + (SH.Store.get('guideSpan') || 24) * 3600000;
    var cursor = Date.now(), t0 = floor30(cursor) - M30, focusCell = null;
    var info = h('div.guide-info'), ruler = h('div.guide-ruler'), rowsEl = h('div.guide-rows'), nowLine = h('div.guide-now');
    var grid = h('div.guide-grid', [ruler, rowsEl, nowLine]);
    var filterChip = h('span');
    var actions = h('div.head-actions', { 'data-nav': 'row' });
    var el = h('div', [h('div.screen-head', [h('h1', { text: 'TV Guide' }), actions, h('div.head-right', [UI.clock()])]), info, grid]);

    function drawActions() {
      SH.clear(actions);
      SH.add(actions, [
        UI.button('Now', { small: true, icon: 'clock', fid: 'g-now', run: jumpNow }),
        UI.chip(filter.label || 'All channels', { caret: true, fid: 'g-filter', active: filter.mode !== 'all', run: function () {
          var opts = [{ label: 'All channels', value: 'all' }, { label: 'Favourites', value: 'fav' }].concat(C.groups.map(function (g) { return { label: g.name, value: 'g:' + g.name, note: String(g.count) }; }));
          UI.picker({ title: 'Show channels', options: opts, value: filter.mode === 'group' ? 'g:' + filter.value : filter.mode, onPick: function (v, op) {
            filter = v.indexOf('g:') === 0 ? { mode: 'group', value: v.slice(2), label: op.label } : { mode: v, label: v === 'all' ? '' : op.label };
            channels = C.channelsBy(filter); row = 0; top = 0; drawActions(); render();
            var c = actions.querySelector('[data-fid="g-filter"]'); if (c) SH.Focus.set(c);
          } });
        } }),
        UI.button('Search programmes', { small: true, icon: 'search', fid: 'g-search', run: function () { SH.App.go('search'); } })
      ]);
    }
    function prog() { var ch = channels[row]; return ch ? SH.Epg.at(ch, cursor) : null; }
    function adjust() {
      if (row < top) top = row; if (row >= top + ROWS) top = row - ROWS + 1;
      if (cursor < t0) t0 = floor30(cursor); else if (cursor >= t0 + SPAN - M30) t0 = floor30(cursor) - 2 * M30;
      t0 = SH.clamp(t0, winStart, Math.max(winStart, winEnd - SPAN));
    }
    function cell(ch, p, r, left, width) {
      var now = Date.now(), cls = 'div.g-cell.f';
      if (p) { if (p.s <= now && p.e > now) cls += '.airing'; else if (p.e <= now) cls += '.past'; if (SH.Store.hasReminder(ch.id, p.s)) cls += '.reminded'; } else cls += '.none';
      return h(cls, { style: 'left:' + left + 'px;width:' + Math.max(8, width - 4) + 'px', _enter: function () { SH.App.programmeInfo(ch, p); },
        _focus: function () { if (r !== row || (p && (cursor < p.s || cursor >= p.e))) { row = r; if (p) cursor = Math.max(p.s, t0); drawInfo(); } } }, [
        h('div.g-title', [p && SH.Store.hasReminder(ch.id, p.s) ? h('span.g-bell', { html: SH.icon('bell', 18) }) : null, p ? p.t : 'No programme information']),
        p && width > 150 ? h('div.g-time', { text: SH.fmt.range(p.s, p.e) }) : null
      ]);
    }
    function render() {
      adjust();
      var hadFocus = !SH.Focus.current || grid.contains(SH.Focus.current) || !document.body.contains(SH.Focus.current), t, r;
      SH.clear(ruler); SH.clear(rowsEl); focusCell = null;
      ruler.appendChild(h('div.g-day', { text: SH.fmt.day(t0 + M30) }));
      for (t = t0; t < t0 + SPAN; t += M30) ruler.appendChild(h('div.g-slot', { style: 'left:' + (300 + (t - t0) / 60000 * PPM) + 'px', text: SH.fmt.time(t) }));
      for (r = top; r < Math.min(channels.length, top + ROWS); r++) {
        var ch = channels[r], lane = h('div.g-lane'), list = SH.Epg.range(ch, t0, t0 + SPAN), first = null;
        if (!list.length) { first = cell(ch, null, r, 0, VIEW_W); lane.appendChild(first); if (r === row) focusCell = first; }
        for (var i = 0; i < list.length; i++) {
          var p = list[i], a = Math.max(0, (p.s - t0) / 60000 * PPM), b = Math.min(VIEW_W, (p.e - t0) / 60000 * PPM), c = cell(ch, p, r, a, b - a);
          lane.appendChild(c); if (!first) first = c;
          if (r === row && cursor >= p.s && cursor < p.e) focusCell = c;
        }
        if (r === row && !focusCell) focusCell = first;
        rowsEl.appendChild(h('div.g-row' + (r === row ? '.current' : ''), [h('div.g-ch', [h('span.ch-num', { text: ch.num }), UI.art(ch.logo, ch.name, 'logo', true), h('span.g-ch-name', { text: ch.name })]), lane]));
      }
      if (!channels.length) rowsEl.appendChild(UI.empty('guide', C.channels.length ? 'No channels in this view' : 'No channels yet', C.channels.length ? 'Choose a different filter.' : 'Add a source with live channels to see the guide.',
        C.channels.length ? null : [UI.button('Add a source', { primary: true, run: function () { SH.App.go('sources'); } })]));
      drawNow(); drawInfo(); UI.lazy();
      if (hadFocus && focusCell && !UI.topDialog()) { SH.Focus.current = null; SH.Focus.set(focusCell); }
    }
    function drawNow() {
      var x = (Date.now() - t0) / 60000 * PPM;
      nowLine.style.display = x >= 0 && x <= VIEW_W ? 'block' : 'none'; nowLine.style.left = (300 + x) + 'px';
    }
    function drawInfo() {
      SH.clear(info);
      var ch = channels[row]; if (!ch) return;
      var p = prog(), now = Date.now();
      SH.add(info, [
        h('div.gi-main', [
          h('div.gi-title', { text: p ? p.t : ch.name }),
          h('div.meta', [p ? h('span', { text: SH.fmt.day(p.s) + ' · ' + SH.fmt.range(p.s, p.e) }) : null, h('span', { text: ch.name }), p && p.c ? h('span', { text: p.c }) : null, p && p.s <= now && p.e > now ? UI.live() : null]),
          h('p.gi-desc', { text: p ? (p.d || 'No description available.') : 'This source does not provide programme information for this channel.' })
        ]),
        h('div.gi-hint', { text: p && p.s > now ? 'Press OK to set a reminder' : 'Press OK to watch' })
      ]);
    }
    function jumpNow() { cursor = Date.now(); t0 = floor30(cursor) - M30; render(); if (focusCell) SH.Focus.set(focusCell); }

    grid._nav = function (dir) {
      var ch = channels[row]; if (!ch) return false;
      var p = prog();
      if (dir === 'right') { var nx = p ? p.e : cursor + M30; if (nx >= winEnd) return true; cursor = nx; }
      else if (dir === 'left') {
        var st = p ? p.s : cursor; if (st <= winStart) return false;
        cursor = Math.max(winStart, st - 60000); var q = SH.Epg.at(ch, cursor); cursor = q ? Math.max(q.s, winStart) : Math.max(winStart, st - M30);
      }
      else if (dir === 'up') { if (row === 0) return false; row--; }
      else { if (row >= channels.length - 1) return true; row++; }
      render(); return true;
    };
    grid._enterUnit = function () { return focusCell; };

    function on(ev, fn) { subs.push([ev, SH.Bus.on(ev, fn)]); }
    on('personal', function (what) { if (what === 'reminders') render(); });
    drawActions(); render();

    return {
      el: el,
      focus: function () { if (focusCell) return SH.Focus.set(focusCell); return false; },
      onKey: function (key) {
        if (key === 'chup' || key === 'chdown') { row = SH.clamp(row + (key === 'chup' ? -ROWS : ROWS), 0, Math.max(0, channels.length - 1)); render(); if (focusCell) SH.Focus.set(focusCell); return true; }
        if (key === 'ff' || key === 'rw') { cursor = SH.clamp(cursor + (key === 'ff' ? 6 : -6) * M30, winStart, winEnd - M30); render(); if (focusCell) SH.Focus.set(focusCell); return true; }
        if (key === 'guide') { jumpNow(); return true; }
        return false;
      },
      tick: function () { drawNow(); },
      destroy: function () { subs.forEach(function (s) { SH.Bus.off(s[0], s[1]); }); }
    };
  });
})();

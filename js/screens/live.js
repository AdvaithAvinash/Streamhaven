/* Live TV: video window (about 65% of the content area) + channel browser.
 * Opens already playing (last watched channel), categories are a scrolling rail, number keys zap. */
(function () {
  'use strict';
  var SH = window.SH, h = SH.h, UI = SH.UI, C = SH.Catalog, E = SH.Engine;
  var VIDEO = { x: 160, y: 124, w: 1136, h: 639 };     // stage coordinates, 16:9
  var LIST_H = 704, ROW_H = 88, MAX_CHIPS = 40;

  SH.Router.register('live', function (params) {
    if (!C.channels.length) {
      var empty = UI.page({ title: 'Live TV' });
      empty.track.appendChild(UI.empty('live', 'No channels yet', 'Add a playlist, an Xtream or Stalker provider and its channels appear here.', [UI.button('Add a source', { primary: true, icon: 'plus', run: function () { SH.App.go('sources', { add: true }); } })]));
      return { el: empty.el };
    }
    var filter = params.filter || { mode: 'all' }, tuned = null, tuneTimer = null, subs = [];
    var state = h('div.video-state');
    var win = h('div.video-window.f', { 'data-fid': 'video', _enter: function () { if (tuned && E.state !== 'error') fullscreen(); else if (tuned) tune(tuned); } }, [state]);
    var info = h('div.live-info'), count = h('div.live-count');
    var chipTrack = h('div.chip-track'), chipView = h('div.chip-view', { 'data-nav': 'row' }, [chipTrack]);
    new SH.Scroller(chipView, chipTrack, 'x', 10);
    var anyLogo = false;
    var grid = new SH.VGrid({
      items: [], cols: 1, cellW: 560, cellH: ROW_H, height: LIST_H, center: true,
      render: function (ch) { var r = UI.channelRow(ch, { tuned: tuned && tuned.id === ch.id, anyLogo: anyLogo }); r._enter = function () { if (tuned && tuned.id === ch.id && E.state !== 'error') fullscreen(); else tune(ch); }; return r; },
      onFocus: function (ch) {
        if (SH.Store.get('tuneMode') !== 'focus') return;
        clearTimeout(tuneTimer); tuneTimer = setTimeout(function () { if (!tuned || tuned.id !== ch.id) tune(ch); }, 700);
      }
    });
    var el = h('div', [h('div.screen-head', [h('h1', { text: 'Live TV' }), h('div.head-right', [UI.clock()])]),
      h('div.live-left', { 'data-nav': 'panel' }, [win, info]), h('div.live-right', { 'data-nav': 'panel' }, [chipView, count, grid.el])]);

    function fullscreen() { SH.Router.push('player', { item: tuned, list: grid.items.length ? grid.items : C.channels }); }
    function tune(ch) { tuned = ch; E.play(ch, { rect: VIDEO }); grid.redraw(); drawInfo(); drawState(); }

    function drawState() {
      SH.clear(state); var s = E.state;
      if (!tuned) return;
      if (s === 'loading') SH.add(state, [h('div.spinner'), h('div.vs-sub', { text: E.retries ? 'Reconnecting…' : tuned.name })]);
      else if (s === 'buffering') SH.add(state, [h('div.spinner')]);
      else if (s === 'error') SH.add(state, [h('div.vs-ico', { html: SH.icon('alert', 48) }), h('div.vs-title', { text: tuned.name + ' is not responding' }), h('div.vs-sub', { text: E.error }),
        h('div.vs-sub', { text: tuned.streams.length > 1 ? 'Press OK to retry, or open the channel to try another source.' : 'Press OK to try again.' })]);
    }
    function drawInfo() {
      SH.clear(info);
      if (!tuned) return;
      var p = SH.Epg.now(tuned), n = SH.Epg.next(tuned);
      SH.add(info, [
        h('div.li-head', [UI.logo(tuned, false), h('div.li-id', [h('div.li-name', [h('span.ch-num', { text: tuned.num }), h('span', { text: tuned.name })]), h('div.li-group', { text: tuned.group + (tuned.streams.length > 1 ? ' · ' + tuned.streams.length + ' sources' : '') })]),
          SH.Store.get('showHealth') ? UI.health(tuned, E.item && E.item.id === tuned.id ? E.streamIndex : 0) : null]),
        p ? h('div.li-prog', [h('div.li-title', { text: p.t }), h('div.li-row', [h('span', { text: SH.fmt.range(p.s, p.e) }), UI.progress(SH.Epg.progress(p))]), p.d ? h('div.li-desc', { text: p.d }) : null,
          n ? h('div.li-next', [h('b', { text: 'Next  ' }), SH.fmt.time(n.s) + '  ' + n.t]) : null]) : null
      ]);
    }

    /* ---- categories: one scrolling rail (All, Favourites, Recent, Source/Country pickers, then every category) ---- */
    function same(a, b) { return a.mode === b.mode && (a.value || '') === (b.value || ''); }
    function setFilter(f) { filter = params.filter = f; drawChips(); load(); }
    function chip(label, f, fid) { return UI.chip(label, { active: same(filter, f), fid: fid, run: function () { setFilter(f); } }); }
    function pick(mode, title, options) {
      UI.picker({ title: title, value: filter.mode === mode ? filter.value : null, options: options, onPick: function (v, op) { setFilter({ mode: mode, value: v, label: op.label }); } });
    }
    function pickerChip(label, mode, fid, title, options) {
      return UI.chip(filter.mode === mode ? (filter.label || filter.value) : label, { caret: true, active: filter.mode === mode, fid: fid, run: function () { pick(mode, title, options()); } });
    }
    function drawChips() {
      var d = SH.Store.data(), groups = C.groups.slice().sort(function (a, b) { return b.count - a.count; }), cur = SH.Focus.current, fid = cur && chipTrack.contains(cur) && cur.getAttribute('data-fid');
      var cols = d.collections.filter(function (c) { return c.items.some(function (id) { return id.charAt(0) === 'c'; }); });
      SH.clear(chipTrack);
      SH.add(chipTrack, chip('All', { mode: 'all' }, 'cat-all'));
      SH.add(chipTrack, chip('Favourites', { mode: 'fav' }, 'cat-fav'));
      if (d.recent.length) SH.add(chipTrack, chip('Recent', { mode: 'recent' }, 'cat-recent'));
      if (C.sources.length > 1) SH.add(chipTrack, pickerChip('Source', 'source', 'f-source', 'Sources', function () { return C.sources.map(function (s) { return { label: s.name, value: s.id }; }); }));
      if (C.countries.length > 1) SH.add(chipTrack, pickerChip('Country', 'country', 'f-country', 'Countries', function () { return C.countries.map(function (c) { return { label: c, value: c }; }); }));
      if (cols.length) SH.add(chipTrack, pickerChip('My groups', 'collection', 'f-col', 'My groups', function () { return cols.map(function (c) { return { label: c.name, value: c.id }; }); }));
      groups.slice(0, MAX_CHIPS).forEach(function (g, i) { SH.add(chipTrack, chip(g.name, { mode: 'group', value: g.name }, 'cat' + i)); });
      if (groups.length > MAX_CHIPS) SH.add(chipTrack, UI.chip('More…', { fid: 'cat-more', run: function () { pick('group', 'Categories', C.groups.map(function (g) { return { label: g.name, value: g.name, note: String(g.count) }; })); } }));
      if (fid) { var again = chipTrack.querySelector('[data-fid="' + fid + '"]'); if (again) { SH.Focus.current = null; SH.Focus.set(again); } }
    }
    function load(keep) {
      var l = C.channelsBy(filter), idx = 0;
      if (keep && grid.items[grid.index]) { var id = grid.items[grid.index].id; for (var i = 0; i < l.length; i++) if (l[i].id === id) idx = i; }
      else if (tuned) for (var j = 0; j < l.length; j++) if (l[j].id === tuned.id) idx = j;
      anyLogo = l.some(function (c) { return !!c.logo; });
      grid.setItems(l, idx);
      count.textContent = l.length ? SH.fmt.count(l.length, 'channel') : (filter.mode === 'fav' ? 'No favourites yet. Open a channel and press the heart.' : (filter.mode === 'recent' ? 'Nothing watched yet.' : 'No channels here.'));
    }

    /* ---- number keys: type a channel number ---- */
    function zapTo(n) {
      var ch = C.channels[n - 1];
      if (!ch) return UI.toast('There is no channel ' + n);
      var idx = -1; for (var i = 0; i < grid.items.length; i++) if (grid.items[i].id === ch.id) idx = i;
      if (idx < 0) { setFilter({ mode: 'all' }); idx = ch.num - 1; }
      grid.focus(idx); tune(ch);
    }
    function on(ev, fn) { subs.push([ev, SH.Bus.on(ev, fn)]); }
    on('player:state', function () { drawState(); });
    on('health', function () { drawInfo(); });
    on('personal', function (what) { if (what === 'favs') { var f = SH.Focus.current; grid.redraw(); if (f && !document.body.contains(f)) SH.Focus.ensure(); } });

    /* opens playing: a channel chosen elsewhere, what is already on, the last one watched, else the first */
    if (params.channel) tuned = C.get(params.channel);
    else if (E.isLive() && E.active()) tuned = C.get(E.item.id) || E.item;
    else { var last = SH.Store.data().recent[0]; tuned = (last && C.get(last)) || null; }
    drawChips(); load();
    if (!tuned && grid.items.length) tuned = grid.items[0];
    if (tuned) { var ti = -1; for (var k = 0; k < grid.items.length; k++) if (grid.items[k].id === tuned.id) ti = k; if (ti >= 0) grid.setItems(grid.items, ti); }
    drawInfo(); drawState();

    return {
      el: el,
      focus: function () { if (grid.items.length) return grid.focus(grid.index); return false; },
      onShow: function () {
        var before = tuned && tuned.id;
        if (E.isLive() && E.active()) { tuned = C.get(E.item.id) || E.item; E.setRect(VIDEO); }   // also covers a channel change made in full screen
        else if (tuned) E.play(tuned, { rect: VIDEO });
        load(before === (tuned && tuned.id)); drawInfo(); drawState();
      },
      onData: function () { if (tuned && !C.get(tuned.id)) { tuned = null; E.stop(); } else if (tuned) tuned = C.get(tuned.id); drawChips(); load(true); drawInfo(); drawState(); SH.Focus.ensure(); },
      onKey: function (key) {
        if (key === 'chup' || key === 'chdown') { var i = grid.index + (key === 'chup' ? -1 : 1); if (grid.items[i]) { grid.focus(i); tune(grid.items[i]); } return true; }
        if (/^\d$/.test(key)) { UI.zap.key(key, zapTo); return true; }
        if (key === 'enter' && UI.zap.active()) { UI.zap.flush(); return true; }
        if (key === 'info' && tuned) { var p = SH.Epg.now(tuned); if (p) SH.App.programmeInfo(tuned, p); return true; }
        return false;
      },
      tick: function () { drawInfo(); },
      destroy: function () { clearTimeout(tuneTimer); subs.forEach(function (s) { SH.Bus.off(s[0], s[1]); }); if (!SH.Router.stack.some(function (s) { return s.name === 'player'; })) E.stop(); }
    };
  });
})();

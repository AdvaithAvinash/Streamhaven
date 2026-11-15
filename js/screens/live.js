/* Live TV: video window (about 65% of the content area) + channel browser. */
(function () {
  'use strict';
  var SH = window.SH, h = SH.h, UI = SH.UI, C = SH.Catalog, E = SH.Engine;
  var VIDEO = { x: 160, y: 124, w: 1136, h: 639 };     // stage coordinates, 16:9
  var LIST_H = 704, ROW_H = 88;

  SH.Router.register('live', function (params) {
    var filter = params.filter || { mode: 'all' }, tuned = null, tuneTimer = null, subs = [];
    var hole = h('div.video-hole'), state = h('div.video-state');
    var win = h('div.video-window.f', { 'data-fid': 'video', _enter: function () { if (tuned) fullscreen(); } }, [state]);
    var info = h('div.live-info'), chips = h('div.live-chips'), count = h('div.live-count');
    var grid = new SH.VGrid({
      items: [], cols: 1, cellW: 560, cellH: ROW_H, height: LIST_H, center: true,
      render: function (ch) { var r = UI.channelRow(ch, { tuned: tuned && tuned.id === ch.id }); r._enter = function () { if (tuned && tuned.id === ch.id && E.state !== 'error') fullscreen(); else tune(ch); }; return r; },
      onFocus: function (ch) {
        if (SH.Store.get('tuneMode') !== 'focus') return;
        clearTimeout(tuneTimer); tuneTimer = setTimeout(function () { if (!tuned || tuned.id !== ch.id) tune(ch); }, 700);
      }
    });
    var el = h('div', [hole, h('div.screen-head', [h('h1', { text: 'Live TV' }), h('div.head-right', [UI.clock()])]),
      h('div.live-left', { 'data-nav': 'panel' }, [win, info]), h('div.live-right', { 'data-nav': 'panel' }, [chips, count, grid.el])]);

    function fullscreen() { SH.Router.push('player', { item: tuned, list: grid.items.length ? grid.items : C.channels }); }
    function tune(ch) { tuned = ch; E.play(ch, { rect: VIDEO }); grid.redraw(); drawInfo(); }

    function drawState() {
      SH.clear(state); var s = E.state;
      win.className = 'video-window f' + (win.classList.contains('is-focused') ? ' is-focused' : '') + (tuned ? '' : ' idle');
      if (!tuned) { SH.add(state, [h('div.vs-ico', { html: SH.icon('live', 56) }), h('div.vs-title', { text: C.channels.length ? 'Choose a channel to start watching' : 'No channels yet' })]); return; }
      if (s === 'loading') SH.add(state, [h('div.spinner'), h('div.vs-sub', { text: E.retries ? 'Reconnecting…' : 'Starting ' + tuned.name + '…' })]);
      else if (s === 'buffering') SH.add(state, [h('div.spinner')]);
      else if (s === 'error') SH.add(state, [h('div.vs-ico', { html: SH.icon('alert', 48) }), h('div.vs-title', { text: 'This channel is unavailable right now' }), h('div.vs-sub', { text: E.error }),
        h('div.vs-sub', { text: tuned.streams.length > 1 ? 'Press OK on the channel to retry, or open it to try another source.' : 'Press OK on the channel to try again.' })]);
    }
    function drawInfo() {
      SH.clear(info);
      if (!tuned) return;
      var p = SH.Epg.now(tuned), n = SH.Epg.next(tuned);
      SH.add(info, [
        h('div.li-head', [UI.art(tuned.logo, tuned.name, 'logo', true), h('div.li-id', [h('div.li-name', [h('span.ch-num', { text: tuned.num }), h('span', { text: tuned.name })]), h('div.li-group', { text: tuned.group + (tuned.streams.length > 1 ? ' · ' + tuned.streams.length + ' sources' : '') })]),
          SH.Store.get('showHealth') ? UI.health(tuned, E.item && E.item.id === tuned.id ? E.streamIndex : 0) : null]),
        p ? h('div.li-prog', [h('div.li-title', { text: p.t }), h('div.li-row', [h('span', { text: SH.fmt.range(p.s, p.e) }), UI.progress(SH.Epg.progress(p))]), p.d ? h('div.li-desc', { text: p.d }) : null,
          n ? h('div.li-next', [h('b', { text: 'Next  ' }), SH.fmt.time(n.s) + '  ' + n.t]) : null])
          : h('div.li-prog', [h('div.li-desc', { text: 'No programme information is available for this channel.' })])
      ]);
    }
    function setFilter(f) { filter = params.filter = f; drawChips(); load(); if (grid.items.length) grid.focus(0); }
    function pick(mode, title, options) {
      UI.picker({ title: title, value: filter.mode === mode ? filter.value : null, options: options, onPick: function (v, op) { setFilter({ mode: mode, value: v, label: op.label }); } });
    }
    function drawChips() {
      var fid = SH.Focus.current && chips.contains(SH.Focus.current) && SH.Focus.current.getAttribute('data-fid');
      SH.clear(chips);
      var d = SH.Store.data(), a = [], b = [];
      a.push(UI.chip('All', { active: filter.mode === 'all', fid: 'f-all', run: function () { setFilter({ mode: 'all' }); } }));
      a.push(UI.chip('Favourites', { active: filter.mode === 'fav', fid: 'f-fav', run: function () { setFilter({ mode: 'fav' }); } }));
      a.push(UI.chip('Recent', { active: filter.mode === 'recent', fid: 'f-recent', run: function () { setFilter({ mode: 'recent' }); } }));
      b.push(UI.chip(filter.mode === 'group' ? filter.value : 'Category', { caret: true, active: filter.mode === 'group', fid: 'f-group', run: function () { pick('group', 'Categories', C.groups.map(function (g) { return { label: g.name, value: g.name, note: String(g.count) }; })); } }));
      if (C.countries.length) b.push(UI.chip(filter.mode === 'country' ? filter.value : 'Country', { caret: true, active: filter.mode === 'country', fid: 'f-country', run: function () { pick('country', 'Countries', C.countries.map(function (c) { return { label: c, value: c }; })); } }));
      if (C.sources.length > 1) b.push(UI.chip(filter.mode === 'source' ? filter.label : 'Source', { caret: true, active: filter.mode === 'source', fid: 'f-source', run: function () { pick('source', 'Sources', C.sources.map(function (s) { return { label: s.name, value: s.id }; })); } }));
      var cols = d.collections.filter(function (c) { return c.items.some(function (id) { return id.charAt(0) === 'c'; }); });
      if (cols.length) b.push(UI.chip(filter.mode === 'collection' ? filter.label : 'Groups', { caret: true, active: filter.mode === 'collection', fid: 'f-col', run: function () { pick('collection', 'Custom groups', cols.map(function (c) { return { label: c.name, value: c.id }; })); } }));
      SH.add(chips, [h('div.chip-row', { 'data-nav': 'row' }, a), h('div.chip-row', { 'data-nav': 'row' }, b)]);
      if (fid) { var again = chips.querySelector('[data-fid="' + fid + '"]'); if (again) { SH.Focus.current = null; SH.Focus.set(again); } }
    }
    function load(keep) {
      var l = C.channelsBy(filter), idx = 0;
      if (keep && grid.items[grid.index]) { var id = grid.items[grid.index].id; for (var i = 0; i < l.length; i++) if (l[i].id === id) idx = i; }
      else if (tuned) for (var j = 0; j < l.length; j++) if (l[j].id === tuned.id) idx = j;
      grid.setItems(l, idx);
      count.textContent = l.length ? SH.fmt.count(l.length, 'channel') : (filter.mode === 'fav' ? 'No favourites yet. Open a channel and press the heart to add one.' : (filter.mode === 'recent' ? 'Nothing watched yet.' : 'No channels in this view.'));
    }
    function on(ev, fn) { subs.push([ev, SH.Bus.on(ev, fn)]); }

    on('player:state', function () { drawState(); });
    on('health', function () { drawInfo(); });
    on('personal', function (what) { if (what === 'favs') { var f = SH.Focus.current; grid.redraw(); if (f && !document.body.contains(f)) SH.Focus.ensure(); } });

    /* initial state: keep whatever is already playing, else resume the last watched channel */
    if (params.channel) tuned = C.get(params.channel);
    else if (E.isLive() && E.active()) tuned = E.item;
    else { var last = SH.Store.data().recent[0]; tuned = last ? C.get(last) : null; }
    drawChips(); load(); drawInfo(); drawState();

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
        if (key === 'info' && tuned) { SH.App.programmeInfo(tuned, SH.Epg.now(tuned)); return true; }
        return false;
      },
      tick: function () { drawInfo(); },
      destroy: function () { clearTimeout(tuneTimer); subs.forEach(function (s) { SH.Bus.off(s[0], s[1]); }); if (!SH.Router.stack.some(function (s) { return s.name === 'player'; })) E.stop(); }
    };
  });
})();

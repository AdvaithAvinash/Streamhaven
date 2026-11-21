/* Live Sports (Matchora): match cards, detail dialog, and the embedded player screen. */
(function () {
  'use strict';
  var SH = window.SH, h = SH.h, UI = SH.UI, S = SH.Sports, C = SH.Catalog;

  function badge(url, name, other) { return url ? UI.art(url, name, 'badge', true) : (other ? h('div.badge-gap') : null); }
  function matchCard(m) {
    var live = m.status === 'live', left = h('div.mc-when' + (live ? '.live' : ''), [live ? h('i') : null, h('span', { text: S.when(m) })]), sc = m.score ? m.score.split(' – ') : null;
    return h('div.card.match.f', { 'data-fid': 'm' + m.id, _enter: function () { openMatch(m); } }, [
      h('div.mc-top', [h('div.mc-league', { text: [m.sport, m.league].filter(Boolean).join(' · ') || 'Match' }), left]),
      h('div.mc-teams', [
        h('div.mc-team' + (m.away ? '' : '.single'), [badge(m.homeBadge, m.home, m.awayBadge), h('span', { text: m.home || m.title }), sc ? h('b', { text: sc[0] }) : null]),
        m.away ? h('div.mc-team', [badge(m.awayBadge, m.away, m.homeBadge), h('span', { text: m.away }), sc ? h('b', { text: sc[1] }) : null]) : null
      ]),
      h('div.mc-foot', [m.channelCount ? h('span.tag', { text: SH.fmt.count(m.channelCount, 'channel') }) : null, m.watching ? h('span.mc-watching', { text: SH.fmt.count(m.watching, 'viewer') + ' on Matchora' }) : null])
    ]);
  }

  function openMatch(m) {
    var body = h('div.sp-detail'), d, full = m;
    function draw() {
      SH.clear(body);
      var chans = full.channels, rows = [];
      SH.add(body, [h('div.meta', [h('span', { text: [full.sport, full.league].filter(Boolean).join(' · ') || 'Match' }), h('span', { text: S.when(full) }), full.score ? h('span', { text: full.score }) : null]),
        h('p.dialog-note.soft', { text: 'Matchora does not share stream addresses. Its player runs inside Streamhaven and shows Matchora\u2019s adverts. A channel found in your own sources plays without them.' })]);
      chans.forEach(function (c) {
        var mine = S.local(c.name);
        if (mine) rows.push({ label: c.name, icon: 'play', note: 'Your sources · ' + mine.name, run: function () { SH.Router.push('player', { item: mine, list: C.channels }); } });
      });
      chans.forEach(function (c) {
        rows.push({ label: c.name, icon: 'tv', note: [c.lang, c.quality, c.watching ? c.watching + ' watching' : ''].filter(Boolean).join(' · '), run: function () { SH.Router.push('embed', { url: c.embedUrl, title: full.title + ' · ' + c.name }); } });
      });
      rows.push({ label: chans.length ? 'Whole match page' : 'Open in Matchora player', icon: 'sports', note: 'Matchora player', run: function () { SH.Router.push('embed', { url: full.embedUrl, title: full.title }); } });
      body.appendChild(h('div.menu.sp-menu', { 'data-nav': 'col' }, rows.map(function (r) {
        return h('div.menu-item.f', { _enter: function () { d.close(); r.run(); } }, [h('span.menu-ico', { html: SH.icon(r.icon, 24) }), h('span.mi-label', { text: r.label }), h('span.menu-note', { text: r.note })]);
      })));
      SH.Focus.first(body);
    }
    d = UI.dialog({ title: m.title, wide: true, body: body, buttons: [{ label: 'Close' }] });
    draw();
    if (!m.channels.length) {          // list responses carry channels; only ask again when there are none
      S.event(m.id, function (err, f) { if (d.closed || err || !f.channels.length) return; full = SH.assign({}, m, f); draw(); });
    }
  }

  SH.Router.register('sports', function (params) {
    var st = params.st || { mode: 'live', day: 0, watchable: true, sport: '' }, all = [], matches = [], state = 'loading', err = '', req = 0, lastLoad = 0;
    var actions = h('div.head-actions', { 'data-nav': 'row' }), body = h('div.sports-body'), grid = null;
    var el = h('div', [h('div.screen-head', [h('h1', { text: 'Live Sports' }), actions, h('div.head-right', [UI.clock()])]), body]);

    function sports() { var c = {}, out = []; all.forEach(function (m) { if (m.sport) c[m.sport] = (c[m.sport] || 0) + 1; }); for (var k in c) out.push([k, c[k]]); out.sort(function (x, y) { return y[1] - x[1] || (x[0] < y[0] ? -1 : 1); }); return out; }
    function applyFilter() { matches = st.sport ? all.filter(function (m) { return m.sport === st.sport; }) : all; if (st.sport && !matches.length) { st.sport = ''; matches = all; } }
    function dayDate(n) { var d = new Date(); d.setDate(d.getDate() + n); return d; }
    function dayLabel(n) { return n === 0 ? 'Today' : (n === 1 ? 'Tomorrow' : SH.fmt.day(dayDate(n).getTime())); }
    function drawActions() {
      var cur = SH.Focus.current, fid = cur && actions.contains(cur) && cur.getAttribute('data-fid');
      SH.clear(actions);
      SH.add(actions, [
        UI.chip('Live now', { active: st.mode === 'live', fid: 'sp-live', run: function () { st.mode = 'live'; load(true); } }),
        UI.chip(st.mode === 'date' ? dayLabel(st.day) : 'Schedule', { active: st.mode === 'date', caret: true, fid: 'sp-day', run: function () {
          var opts = []; for (var i = 0; i < 7; i++) opts.push({ label: dayLabel(i), value: i, note: S.dayStr(dayDate(i)) });
          UI.picker({ title: 'Fixtures for', value: st.day, options: opts, onPick: function (v) { st.mode = 'date'; st.day = v; load(true); } });
        } }),
        sports().length > 1 ? UI.chip(st.sport || 'All sports', { active: !!st.sport, caret: true, fid: 'sp-sport', run: function () {
          var opts = [{ label: 'All sports', value: '', note: String(all.length) }].concat(sports().map(function (x) { return { label: x[0], value: x[0], note: String(x[1]) }; }));
          UI.picker({ title: 'Sport', value: st.sport, options: opts, onPick: function (v) { st.sport = v; applyFilter(); draw(); drawActions(); if (grid) grid.focus(0); } });
        } }) : null,
        UI.chip('Only with channels', { active: st.watchable, fid: 'sp-watch', run: function () { st.watchable = !st.watchable; load(true); } }),
        UI.button('Refresh', { small: true, icon: 'refresh', fid: 'sp-refresh', run: function () { load(true, true); } })
      ]);
      if (fid) { var again = actions.querySelector('[data-fid="' + fid + '"]'); if (again) { SH.Focus.current = null; SH.Focus.set(again); } }
    }
    function draw() {
      SH.clear(body); grid = null;
      if (state === 'loading') { body.appendChild(h('div.sp-state', [h('div.spinner'), h('div.vs-sub', { text: 'Loading matches…' })])); return; }
      if (state === 'error') { body.appendChild(UI.empty('alert', 'Matches could not be loaded', err, [UI.button('Try again', { primary: true, icon: 'refresh', fid: 'sp-retry', run: function () { load(true, true); } })])); return; }
      if (!matches.length) { body.appendChild(UI.empty('sports', st.mode === 'live' ? 'No matches are live right now' : 'No matches found for ' + dayLabel(st.day).toLowerCase(), st.watchable ? 'Try turning off "Only with channels" to see every fixture.' : 'Check another day.')); return; }
      body.appendChild(h('div.lib-count', { text: SH.fmt.count(matches.length, 'match', 'matches') + ' · from Matchora' }));
      grid = new SH.VGrid({ items: matches, cols: 3, cellW: 576, cellH: 208, height: 832, render: matchCard });
      body.appendChild(grid.el);
    }
    function load(focusGrid, force) {
      var my = ++req; state = 'loading'; draw(); drawActions();
      S.matches({ mode: st.mode, date: S.dayStr(dayDate(st.day)), watchable: st.watchable, fresh: !!force }, function (e, list) {
        if (my !== req) return;
        lastLoad = Date.now(); params.st = st;
        if (e) { state = 'error'; err = String(e); } else { state = 'ok'; all = list; applyFilter(); }
        draw(); drawActions();
        if (focusGrid && grid && !SH.Sidebar.has(SH.Focus.current) && !UI.topDialog()) grid.focus(0);
      });
    }
    drawActions(); load(true);
    return {
      el: el,
      focus: function () { if (grid) return grid.focus(grid.index); var f = el.querySelector('.f'); return f ? SH.Focus.set(f) : false; },
      onData: function () {},
      tick: function () {
        if (st.mode !== 'live' || state !== 'ok' || UI.topDialog() || Date.now() - lastLoad < 60000) return;
        S.matches({ mode: 'live' }, function (e, list) {              // quiet refresh: keep the highlighted card where it is
          if (e || st.mode !== 'live' || !grid) return;
          var inGrid = SH.Focus.current && grid.el.contains(SH.Focus.current), idx = Math.min(grid.index, Math.max(0, list.length - 1));
          all = list; applyFilter(); lastLoad = Date.now();
          if (!matches.length) { draw(); return; }
          grid.setItems(matches, Math.min(idx, matches.length - 1)); if (inGrid) grid.focus(Math.min(idx, matches.length - 1));
        });
      }
    };
  });

  /* Matchora's embed. Sandboxed without popups or top-level navigation so its adverts cannot take over the app. */
  SH.Router.register('embed', function (params) {
    var frame = document.createElement('iframe'), hint = h('div.embed-hint', { text: (params.title || 'Matchora') + '  ·  BACK to close  ·  Matchora player, may show adverts' });
    frame.className = 'embed-frame'; frame.setAttribute('allowfullscreen', ''); frame.setAttribute('allow', 'autoplay; fullscreen; encrypted-media');
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-forms'); frame.setAttribute('referrerpolicy', 'origin'); frame.src = params.url;
    var el = h('div', [frame, hint]), t = null;
    return {
      el: el, fullscreen: true, focus: function () { return true; }, onData: function () {},
      onShow: function () { SH.Engine.stop(); hint.classList.remove('gone'); clearTimeout(t); t = setTimeout(function () { hint.classList.add('gone'); }, 6000); },
      onKey: function (key) {
        if (UI.topDialog()) return false;
        if (key === 'enter' && SH.hasNativeHttp()) { try { frame.focus(); } catch (e) {} UI.toast('Controls are in the player. BACK closes it.'); return true; }   // Android only: BACK is handled natively, so keys cannot get trapped
        if (key !== 'back') { hint.classList.remove('gone'); clearTimeout(t); t = setTimeout(function () { hint.classList.add('gone'); }, 4000); }
        return key !== 'back';
      },
      destroy: function () { clearTimeout(t); frame.src = 'about:blank'; }
    };
  });
})();

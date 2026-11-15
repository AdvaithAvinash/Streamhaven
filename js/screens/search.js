/* Universal search across every connected source: channels, categories, guide, movies, series, episodes. */
(function () {
  'use strict';
  var SH = window.SH, h = SH.h, UI = SH.UI, C = SH.Catalog;
  var KEYS = 'abcdefghijklmnopqrstuvwxyz1234567890'.split('');

  SH.Router.register('search', function (params) {
    var q = params.q || '', field = h('div.search-field'), page = UI.page({ noHead: true }), firstKey = null;
    page.view.className = 'page-view search-results'; page.view.setAttribute('data-nav', 'panel');

    function type(c) { if (q.length < 40) q += c; changed(); }
    var pad = h('div.kb');
    KEYS.forEach(function (k, i) { var e = h('div.kb-key.f', { text: k, 'data-fid': 'k' + k, _enter: function () { type(k); } }); if (!i) firstKey = e; pad.appendChild(e); });
    var special = h('div.kb-row', { 'data-nav': 'row' }, [
      h('div.kb-key.wide.f', { text: 'Space', 'data-fid': 'k-space', _enter: function () { if (q && q.slice(-1) !== ' ') type(' '); } }),
      h('div.kb-key.wide.f', { html: SH.icon('backspace', 26), 'data-fid': 'k-del', _enter: function () { q = q.slice(0, -1); changed(); } }),
      h('div.kb-key.wide.f', { text: 'Clear', 'data-fid': 'k-clear', _enter: function () { q = ''; changed(); } })
    ]);
    var el = h('div', [h('div.screen-head', [h('h1', { text: 'Search' }), h('div.head-right', [UI.clock()])]), h('div.search-left', { 'data-nav': 'panel' }, [field, pad, special, h('div.kb-hint', { text: 'Searches all sources at once' })]), page.el]);

    var run = SH.debounce(results, 220), remember = SH.debounce(function () { if (q.length >= 3) SH.Store.addSearch(q); }, 2500);
    function changed() { SH.clear(field); SH.add(field, [h('span.search-ico', { html: SH.icon('search', 28) }), q ? h('span.search-q', { text: q }) : h('span.search-ph', { text: 'Channels, programmes, movies, series' }), h('span.search-caret')]); run(); remember(); }

    function results() {
      SH.clear(page.track); page.view._scroller.to(0);
      if (C.isEmpty()) { page.track.appendChild(UI.empty('search', 'Nothing to search yet', 'Add a source and its channels and titles become searchable here.')); return; }
      if (q.replace(/\s/g, '').length < 2) {
        var d = SH.Store.data(), sugg = C.groups.slice(0, 8).map(function (g) { return g.name; });
        if (d.searches.length) page.track.appendChild(h('section.rail', { 'data-reveal': '1' }, [h('div.rail-head', [h('h2', { text: 'Recent searches' })]), h('div.chip-wrap', d.searches.map(function (s) { return UI.chip(s, { fid: 'h' + s, run: function () { q = s; changed(); } }); }))]));
        if (sugg.length) page.track.appendChild(h('section.rail', { 'data-reveal': '1' }, [h('div.rail-head', [h('h2', { text: 'Browse categories' })]), h('div.chip-wrap', sugg.map(function (s) { return UI.chip(s, { fid: 's' + s, run: function () { SH.App.go('live', { filter: { mode: 'group', value: s } }); } }); }))]));
        SH.add(page.track, UI.rail('Recently watched channels', C.channelsBy({ mode: 'recent' }).slice(0, 12).map(function (c) { return UI.channelCard(c); })));
        if (!page.track.firstChild) page.track.appendChild(UI.empty('search', 'Search everything', 'Type at least two characters to search across all connected sources.'));
        return;
      }
      var r = C.search(q), total = r.channels.length + r.categories.length + r.programmes.length + r.movies.length + r.series.length + r.episodes.length;
      if (!total) { page.track.appendChild(UI.empty('search', 'No results for "' + q + '"', 'Check the spelling or try fewer letters.')); return; }
      SH.add(page.track, [
        UI.rail('Live Channels', r.channels.map(function (c) { return UI.channelCard(c, r.channels); }), { hint: String(r.channels.length) }),
        r.categories.length ? h('section.rail', { 'data-reveal': '1' }, [h('div.rail-head', [h('h2', { text: 'Channel Categories' })]), h('div.chip-wrap', r.categories.map(function (g) { return UI.chip(g.name + '  ·  ' + g.count, { fid: 'c' + g.name, run: function () { SH.Store.addSearch(q); SH.App.go('live', { filter: { mode: 'group', value: g.name } }); } }); }))]) : null,
        UI.rail('Programmes', r.programmes.map(function (x) { return UI.progCard(x.ch, x.p, function () { SH.App.programmeInfo(x.ch, x.p); }); }), { hint: 'Now and upcoming' }),
        UI.rail('Movies', r.movies.map(UI.posterCard), { hint: String(r.movies.length) }),
        UI.rail('Series', r.series.map(UI.posterCard), { hint: String(r.series.length) }),
        UI.rail('Episodes', r.episodes.map(function (ep) { var s = C.seriesOf(ep); return h('div.card.prog.f', { 'data-fid': ep.id, _enter: function () { UI.open(ep); } }, [h('div.prog-when', [h('span', { text: 'S' + ep.season + ' E' + ep.number })]), h('div.card-title', { text: ep.title }), h('div.card-sub', { text: s ? s.title : '' })]); }))
      ]);
      UI.lazy();
    }
    changed(); results();
    return {
      el: el,
      focus: function () { return SH.Focus.set(firstKey); },
      onHide: function () { if (q.length >= 2) SH.Store.addSearch(q); },
      onRaw: function (ev) {          // physical keyboard typing (desktop, USB / Bluetooth keyboards)
        if (ev.keyCode === 8) { if (!q) return false; q = q.slice(0, -1); changed(); return true; }
        var k = ev.key; if (k && k.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) { ev.preventDefault(); type(k.toLowerCase()); return true; }
        return false;
      },
      onKey: function (key) { if (/^\d$/.test(key)) { type(key); return true; } return false; }
    };
  });
})();

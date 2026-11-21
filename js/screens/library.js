/* Movies and Series share one screen implementation: a cinematic landing page (featured banner
 * + rails) that switches to a virtualised poster grid as soon as a filter or sort is applied. */
(function () {
  'use strict';
  var SH = window.SH, h = SH.h, UI = SH.UI, C = SH.Catalog;
  var SORTS = [{ label: 'Recently added', value: 'added' }, { label: 'Title A–Z', value: 'title' }, { label: 'Newest release', value: 'year' }, { label: 'Highest rated', value: 'rating' }];

  function make(kind) {
    return function (params) {
      var all = kind === 'movie' ? C.movies : C.series, title = kind === 'movie' ? 'Movies' : 'Series';
      var st = params.st || { grid: !!params.grid, genre: params.genre || '', year: 0, sort: 'added', mine: false };
      var chips = h('div.chip-row.lib-chips', { 'data-nav': 'row' }), body = h('div.lib-body'), grid = null;
      var el = h('div', [h('div.screen-head', [h('h1', { text: title }), h('div.head-right', [UI.clock()])]), chips, body]);

      function filtered() {
        var l = all.filter(function (x) { return (!st.genre || x.genres.indexOf(st.genre) >= 0) && (!st.year || x.year === st.year) && (!st.mine || SH.Store.inList(x.id)); });
        var s = st.sort;
        return l.sort(function (a, b) { return s === 'title' ? (a.title < b.title ? -1 : 1) : (s === 'year' ? (b.year || 0) - (a.year || 0) : (s === 'rating' ? (b.rating || 0) - (a.rating || 0) : (b.added || 0) - (a.added || 0))); });
      }
      function set(k, v) { st[k] = v; st.grid = true; draw(k); }
      function drawChips(keep) {
        SH.clear(chips);
        var genres = C.genres[kind], years = C.years[kind].filter(Boolean), sortLabel = SORTS.filter(function (s) { return s.value === st.sort; })[0].label;
        chips.appendChild(UI.chip(st.grid ? 'Featured view' : 'Browse all', { fid: 'l-mode', run: function () { st = { grid: !st.grid, genre: '', year: 0, sort: 'added', mine: false }; draw('mode'); } }));
        if (genres.length) chips.appendChild(UI.chip(st.genre || 'Genre', { caret: true, active: !!st.genre, fid: 'l-genre', run: function () { UI.picker({ title: 'Genre', value: st.genre, options: [{ label: 'All genres', value: '' }].concat(genres.map(function (g) { return { label: g, value: g }; })), onPick: function (v) { set('genre', v); } }); } }));
        if (years.length) chips.appendChild(UI.chip(st.year ? String(st.year) : 'Year', { caret: true, active: !!st.year, fid: 'l-year', run: function () { UI.picker({ title: 'Release year', value: st.year, options: [{ label: 'Any year', value: 0 }].concat(years.map(function (y) { return { label: String(y), value: y }; })), onPick: function (v) { set('year', v); } }); } }));
        chips.appendChild(UI.chip('Sort: ' + sortLabel, { caret: true, fid: 'l-sort', run: function () { UI.picker({ title: 'Sort by', value: st.sort, options: SORTS, onPick: function (v) { set('sort', v); } }); } }));
        chips.appendChild(UI.chip('My List', { active: st.mine, fid: 'l-mine', run: function () { set('mine', !st.mine); } }));
        if (keep) { var c = chips.querySelector('[data-fid="l-' + keep + '"]'); if (c) { SH.Focus.current = null; SH.Focus.set(c); } }
      }
      function draw(keep) {
        params.st = st; SH.clear(body); grid = null;
        if (!all.length) { chips.classList.add('hidden'); body.appendChild(UI.empty(kind === 'movie' ? 'movies' : 'series', 'No ' + title.toLowerCase() + ' yet', 'Titles appear here when a connected source provides them.', [UI.button('Manage sources', { primary: true, run: function () { SH.App.go('sources'); } })])); return; }
        drawChips(keep);
        if (st.grid) {
          var l = filtered();
          body.appendChild(h('div.lib-count', { text: SH.fmt.count(l.length, 'title') }));
          if (!l.length) { body.appendChild(UI.empty('search', 'Nothing matches these filters', 'Try a different genre or year.')); return; }
          grid = new SH.VGrid({ items: l, cols: 7, cellW: 240, cellH: 424, height: 848, render: UI.posterCard });
          body.appendChild(grid.el);
          return;
        }
        var page = UI.page({ noHead: true }), feat = C.recentlyAdded(kind, 5)[new Date().getDate() % Math.min(5, all.length)];
        page.view.className = 'page-view lib-page';
        SH.add(page.track, [
          UI.hero({ compact: true, item: feat, title: feat.title, eyebrow: [h('span', { text: 'Recently added' })], meta: [feat.year || null, feat.genres.slice(0, 3).join(' · '), feat.duration ? SH.fmt.dur(feat.duration) : null], text: feat.plot,
            buttons: [UI.button('Watch Now', { primary: true, icon: 'play', fid: 'lf-play', run: function () { SH.App.playTitle(feat); } }), UI.button('More Information', { icon: 'info', fid: 'lf-info', run: function () { SH.Router.push('detail', { id: feat.id }); } })] }),
          UI.rail('Recently Added', C.recentlyAdded(kind, 20).map(UI.posterCard)),
          UI.rail('Top Rated in Your Library', C.topRated(kind, 20).map(UI.posterCard)),
          UI.rail('From My List', all.filter(function (x) { return SH.Store.inList(x.id); }).slice(0, 20).map(UI.posterCard))
        ]);
        C.genres[kind].slice(0, 8).forEach(function (g) { var l2 = C.byGenre(kind, g, 20); if (l2.length >= 3) SH.add(page.track, UI.rail(g, l2.map(UI.posterCard))); });
        body.appendChild(page.el);
      }
      draw();
      return {
        el: el,
        focus: function () { if (grid) return grid.focus(grid.index); var f = body.querySelector('.f'); return f ? SH.Focus.set(f) : false; },
        onBack: function () { if (st.grid && !params.grid && !SH.Sidebar.has(SH.Focus.current)) { st = { grid: false, genre: '', year: 0, sort: 'added', mine: false }; draw(); var f = body.querySelector('.f'); if (f) SH.Focus.set(f); return true; } return false; }
      };
    };
  }
  SH.Router.register('movies', make('movie'));
  SH.Router.register('series', make('series'));
})();

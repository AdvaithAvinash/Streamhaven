/* Discover: recommendations computed from what the connected sources actually contain.
 * Nothing here is an external popularity ranking. */
(function () {
  'use strict';
  var SH = window.SH, h = SH.h, UI = SH.UI, C = SH.Catalog;

  SH.Router.register('discover', function () {
    var pool = C.movies.concat(C.series);
    var page = UI.page({ title: 'Discover', actions: pool.length ? [UI.button('Surprise me', { small: true, icon: 'shuffle', fid: 'surprise', run: function () { SH.Router.push('detail', { id: pool[Math.floor(Math.random() * pool.length)].id }); } })] : null });
    if (!pool.length) { page.track.appendChild(UI.empty('discover', 'Nothing to discover yet', 'Recommendations are built from the movies and series in your connected sources.', [UI.button('Manage sources', { primary: true, run: function () { SH.App.go('sources'); } })])); return { el: page.el }; }
    page.track.appendChild(h('p.page-note', { text: 'Everything on this page is available in your connected sources. Suggestions are based on your library and what this profile has watched.' }));

    var seen = {}, based = [];
    SH.Store.data().history.forEach(function (x) { var it = C.get(x.id); if (it && it.kind === 'episode') it = C.seriesOf(it); if (it && !seen[it.id] && based.length < 2) { seen[it.id] = 1; based.push(it); } });
    Object.keys(SH.Store.data().list).slice(0, 1).forEach(function (id) { var it = C.get(id); if (it && !seen[id]) based.push(it); });
    based.forEach(function (it) { SH.add(page.track, UI.rail('Because you watched ' + it.title, C.similar(it, 14).map(UI.posterCard))); });

    SH.add(page.track, [
      UI.rail('Recently Added', C.recentlyAdded(null, 20).map(UI.posterCard)),
      UI.rail('Top Rated in Your Library', C.topRated(null, 20).map(UI.posterCard), { hint: 'Ratings supplied by your sources' })
    ]);
    var genres = C.genres.movie.slice(); C.genres.series.forEach(function (g) { if (genres.indexOf(g) < 0) genres.push(g); });
    var tiles = genres.map(function (g) {
      var n = C.byGenre(null, g).length;
      return h('div.card.genre.f', { 'data-fid': 'g' + g, style: 'background-color:hsl(' + (SH.hash(g) % 360) + ',30%,22%)', _enter: function () { SH.App.go(C.byGenre('movie', g).length ? 'movies' : 'series', { genre: g, grid: true }); } }, [h('div.card-title', { text: g }), h('div.card-sub', { text: SH.fmt.count(n, 'title') })]);
    });
    SH.add(page.track, UI.rail('Genre Collections', tiles));
    genres.slice(0, 6).forEach(function (g) { var l = C.byGenre(null, g, 20); if (l.length >= 4) SH.add(page.track, UI.rail(g, l.map(UI.posterCard))); });
    return { el: page.el };
  });
})();

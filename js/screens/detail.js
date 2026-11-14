/* Movie / series detail page. */
(function () {
  'use strict';
  var SH = window.SH, h = SH.h, UI = SH.UI, C = SH.Catalog;

  SH.Router.register('detail', function (params) {
    var item = C.get(params.id), page = UI.page({ noHead: true });
    if (!item) { page.track.appendChild(UI.empty('alert', 'This title is no longer available', 'Its source may have been removed or changed.', [UI.button('Go back', { primary: true, run: function () { SH.Router.back(); } })])); return { el: page.el }; }
    var season = 0, epWrap = h('div'), actions = h('div.btn-row', { 'data-nav': 'row' });

    function resumeTarget() {            // movie itself, or the episode to continue with
      if (item.kind === 'movie') return item;
      var hist = SH.Store.data().history;
      for (var i = 0; i < hist.length; i++) { var e = C.get(hist[i].id); if (e && e.kind === 'episode' && e.seriesId === item.id) return e; }
      return item.seasons[0] && item.seasons[0].episodes[0];
    }
    function drawActions() {
      var fid = SH.Focus.current && actions.contains(SH.Focus.current) && SH.Focus.current.getAttribute('data-fid');
      SH.clear(actions);
      var t = resumeTarget(), hist = t && SH.Store.progress(t.id), resumable = hist && hist.pos > 20 && (!hist.dur || hist.pos < hist.dur * 0.95), inList = SH.Store.inList(item.id);
      var label = item.kind === 'series' && t ? (resumable ? 'Resume' : 'Play') + ' S' + t.season + ' E' + t.number : (resumable ? 'Resume from ' + SH.fmt.pos(hist.pos) : 'Play');
      if (t) actions.appendChild(UI.button(label, { primary: true, icon: 'play', auto: true, fid: 'd-play', run: function () { SH.Router.push('player', { item: t, resume: true }); } }));
      if (t && resumable) actions.appendChild(UI.button('Start over', { icon: 'restart', fid: 'd-restart', run: function () { SH.Router.push('player', { item: t }); } }));
      actions.appendChild(UI.button(inList ? 'In My List' : 'Add to My List', { icon: inList ? 'check' : 'plus', fid: 'd-list', run: function () { UI.toast(SH.Store.toggleList(item) ? 'Added to My List' : 'Removed from My List'); drawActions(); } }));
      actions.appendChild(UI.button('Collections', { icon: 'folder', fid: 'd-col', run: function () { SH.App.collectionsFor(item); } }));
      if (fid) { var a = actions.querySelector('[data-fid="' + fid + '"]'); if (a) { SH.Focus.current = null; SH.Focus.set(a); } }
    }
    function drawEpisodes() {
      SH.clear(epWrap);
      var se = item.seasons[season]; if (!se) return;
      epWrap.appendChild(h('div.ep-list', { 'data-nav': 'col' }, se.episodes.map(function (ep) {
        var hist = SH.Store.progress(ep.id);
        return h('div.ep-row.f', { 'data-fid': ep.id, _enter: function () { SH.Router.push('player', { item: ep, resume: true }); } }, [
          h('span.ep-num', { text: ep.number }),
          h('div.ep-text', [h('div.ep-title', { text: ep.title }), ep.plot ? h('div.ep-plot', { text: ep.plot }) : null, hist && hist.dur ? UI.progress(hist.pos / hist.dur) : null]),
          h('span.ep-dur', { text: SH.fmt.dur(ep.duration) })
        ]);
      })));
    }

    var srcNames = C.sourceNames(item), people = [];
    if (item.director) people.push(h('div.d-people', [h('b', { text: 'Director  ' }), item.director]));
    if (item.cast && item.cast.length) people.push(h('div.d-people', [h('b', { text: 'Cast  ' }), item.cast.join(', ')]));
    SH.add(page.track, [
      h('section.detail-top', { 'data-reveal': '1' }, [
        UI.art(item.backdrop, item.title, 'hero-art'), h('div.hero-shade'),
        h('div.detail-body', [
          UI.art(item.poster, item.title, 'detail-poster'),
          h('div.detail-text', [
            h('div.hero-eyebrow', [h('span', { text: item.kind === 'series' ? 'Series' : 'Movie' })]),
            h('h1', { text: item.title }),
            h('div.meta', [item.year || null, item.genres.join(' · ') || null, item.duration ? SH.fmt.dur(item.duration) : null, item.kind === 'series' ? SH.fmt.count(item.seasons.length, 'season') : null, item.rating ? '★ ' + item.rating.toFixed(1) : null].filter(Boolean).map(function (m) { return h('span', { text: m }); })),
            h('p.hero-text', { text: item.plot || 'No description is available from this source.' }),
            people, actions,
            h('div.d-sources', [h('b', { text: srcNames.length > 1 ? 'Available from  ' : 'Source  ' }), srcNames.join(', ') || 'Unknown'])
          ])
        ])
      ])
    ]);
    if (item.kind === 'series' && item.seasons.length) {
      var chipRow = h('div.chip-row', { 'data-nav': 'row' });
      var drawSeasons = function () {
        var had = SH.Focus.current && chipRow.contains(SH.Focus.current); SH.clear(chipRow);
        item.seasons.forEach(function (se, i) { chipRow.appendChild(UI.chip('Season ' + se.number, { active: i === season, fid: 'se' + i, run: function () { season = i; drawSeasons(); drawEpisodes(); } })); });
        if (had) { SH.Focus.current = null; SH.Focus.set(chipRow.children[season]); }
      };
      var rt = resumeTarget(); if (rt) item.seasons.forEach(function (se, i) { if (se.number === rt.season) season = i; });
      drawSeasons(); drawEpisodes();
      page.track.appendChild(h('section.detail-episodes', [h('div.rail-head', { 'data-reveal': '1' }, [h('h2', { text: 'Episodes' })]), chipRow, epWrap]));
    }
    SH.add(page.track, UI.rail('More like this', C.similar(item, 14).map(UI.posterCard)));
    drawActions();
    return { el: page.el, onShow: function () { drawActions(); if (item.kind === 'series') drawEpisodes(); } };
  });
})();

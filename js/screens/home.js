/* Home: personalised dashboard built entirely from connected sources and viewing history. */
(function () {
  'use strict';
  var SH = window.SH, h = SH.h, UI = SH.UI, C = SH.Catalog;

  var SECTIONS = [
    ['hero', 'Featured'], ['continue', 'Continue Watching'], ['favs', 'Your Live Channels'], ['onnow', 'On Now'],
    ['recent', 'Recently Added'], ['sources', 'Your Sources'], ['collections', 'Personalised Collections']
  ];
  SH.HomeSections = {
    list: function () {             // user order first, then any sections added since
      var d = SH.Store.data().home, out = [], seen = {};
      (d.order || []).forEach(function (id) { SECTIONS.forEach(function (s) { if (s[0] === id && !seen[id]) { seen[id] = 1; out.push(s); } }); });
      SECTIONS.forEach(function (s) { if (!seen[s[0]]) out.push(s); });
      return out;
    }
  };

  function progBlock(ch) {
    var p = SH.Epg.now(ch), n = SH.Epg.next(ch);
    if (!p) return null;
    return h('div.hero-prog', [
      h('div.hero-prog-title', { text: p.t }),
      h('div.hero-prog-row', [h('span', { text: SH.fmt.range(p.s, p.e) }), UI.progress(SH.Epg.progress(p))]),
      n ? h('div.hero-prog-next', { text: 'Next · ' + SH.fmt.time(n.s) + '  ' + n.t }) : null
    ]);
  }

  var build = {
    hero: function () {
      var d = SH.Store.data(), lastCh = d.recent.length ? C.get(d.recent[0]) : null, vod = C.recentlyAdded(null, 8).filter(function (x) { return x.backdrop || x.poster; });
      if (!vod.length) vod = C.recentlyAdded(null, 8);
      var item = lastCh || vod[new Date().getDate() % (vod.length || 1)] || C.channels[0] || C.movies[0] || C.series[0];
      if (!item) return null;
      if (item.kind === 'channel') {
        var p = SH.Epg.now(item);
        return UI.hero({
          art: null, title: item.name, logo: item.logo ? UI.art(item.logo, item.name, 'logo.hero-logo') : null, eyebrow: [UI.live(), h('span', { text: lastCh ? 'Pick up where you left off' : 'Live TV' })],
          meta: [item.group, C.sourceNames(item).join(', ')], extra: progBlock(item),
          buttons: [UI.button('Watch Now', { primary: true, icon: 'play', auto: true, fid: 'hero-play', run: function () { UI.open(item, C.channels); } }),
            p ? UI.button('More Information', { icon: 'info', fid: 'hero-info', run: function () { SH.App.programmeInfo(item, p); } }) : null]
        });
      }
      return UI.hero({
        item: item, title: item.title, eyebrow: [h('span', { text: (item.kind === 'series' ? 'Series' : 'Movie') + ' · Recently added' })],
        meta: [item.year || null, item.genres.slice(0, 3).join(' · '), item.duration ? SH.fmt.dur(item.duration) : null, item.kind === 'series' ? SH.fmt.count(item.seasons.length, 'season') : null], text: item.plot,
        buttons: [UI.button('Watch Now', { primary: true, icon: 'play', auto: true, fid: 'hero-play', run: function () { SH.App.playTitle(item); } }),
          UI.button('More Information', { icon: 'info', fid: 'hero-info', run: function () { SH.Router.push('detail', { id: item.id }); } })]
      });
    },
    'continue': function () {
      var cards = [];
      SH.Store.data().history.forEach(function (x) { var it = C.get(x.id); if (it && cards.length < 20 && x.pos > 20 && (!x.dur || x.pos < x.dur * 0.95)) cards.push(UI.wideCard(it, x)); });
      return UI.rail('Continue Watching', cards, { hint: 'Hold OK for options' });
    },
    favs: function () { var l = C.channelsBy({ mode: 'fav' }); return UI.rail('Your Live Channels', l.slice(0, 24).map(function (c) { return UI.channelCard(c, l); })); },
    onnow: function () {
      var l = C.channels.filter(function (c) { return SH.Epg.now(c); }).slice(0, 24);
      return UI.rail('On Now', l.map(function (c) { return UI.channelCard(c, C.channels); }));
    },
    recent: function () { return UI.rail('Recently Added', C.recentlyAdded(null, 20).map(UI.posterCard)); },
    sources: function () {
      return UI.rail('Your Sources', C.sources.map(function (s) {
        var n = s.counts, bits = n ? [n.channels ? SH.fmt.count(n.channels, 'channel') : null, n.movies ? SH.fmt.count(n.movies, 'movie') : null, n.series ? n.series + ' series' : null].filter(Boolean).join(' · ') : '';
        return h('div.card.source-mini.f', { 'data-fid': 'src' + s.id, _enter: function () { SH.App.go('sources'); } }, [
          h('div.card-title', { text: s.name }), h('div.card-sub', { text: C.TYPES[s.type].label }), UI.sourceBadge(s), h('div.card-sub', { text: bits || ' ' })]);
      }));
    },
    collections: function () {
      /* Genres ranked by this profile's viewing history, then by library size. */
      var score = {}, out = [];
      SH.Store.data().history.forEach(function (x) { var it = C.get(x.id); if (it && it.kind === 'episode') it = C.seriesOf(it); if (it && it.genres) it.genres.forEach(function (g) { score[g] = (score[g] || 0) + 3; }); });
      C.movies.concat(C.series).forEach(function (x) { x.genres.forEach(function (g) { score[g] = (score[g] || 0) + 0.01; }); });
      Object.keys(score).sort(function (a, b) { return score[b] - score[a]; }).slice(0, 4).forEach(function (g) {
        var l = C.byGenre(null, g, 20); if (l.length >= 3) out.push(UI.rail((score[g] >= 3 ? 'Because you watch ' : '') + g, l.map(UI.posterCard)));
      });
      return out;
    }
  };

  SH.Router.register('home', function () {
    var page = UI.page({ noHead: true });
    page.el.appendChild(h('div.home-clock', [UI.clock()]));
    if (C.isEmpty()) {
      var syncing = C.sources.some(function (s) { return s.status === 'syncing'; });
      page.track.appendChild(h('div.welcome', [
        h('div.welcome-mark', { html: SH.logo(96) }), h('h1', { text: 'Welcome to Streamhaven' }),
        h('p', { text: syncing ? 'Synchronising your sources…' : (C.sources.length ? 'Your sources have no content yet. Check their status or add another one.' : 'Add a playlist, an Xtream, Stalker, Jellyfin, Emby or Plex source, and your home screen builds itself from it.') }),
        h('div.btn-row', { 'data-nav': 'row' }, [
          UI.button(C.sources.length ? 'Manage sources' : 'Add a source', { primary: true, icon: 'plus', auto: true, fid: 'w-add', run: function () { SH.App.go('sources', C.sources.length ? null : { add: true }); } }),
        ])
      ]));
      return { el: page.el };
    }
    var hidden = SH.Store.data().home.hidden || {};
    SH.HomeSections.list().forEach(function (s) {
      if (hidden[s[0]]) return;
      var el = build[s[0]](); if (el) SH.add(page.track, el);
    });
    if (!page.track.querySelector('.f')) page.track.appendChild(UI.empty('home', 'Your home screen is empty', 'All sections are hidden. Turn them back on in Settings.', [UI.button('Home screen layout', { primary: true, run: function () { SH.App.go('settings', { cat: 'appearance' }); } })]));
    return { el: page.el };
  });
})();

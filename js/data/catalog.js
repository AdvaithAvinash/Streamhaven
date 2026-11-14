/* Catalogue: source registry, synchronisation, and the merged multi-source library.
 * Items carrying the same identity in several sources are merged into one entry with
 * several streams (the basis for the channel alternative finder). */
(function () {
  'use strict';
  var SH = window.SH;
  var raw = {};       // sourceId -> parsed data
  var byId = {};
  var ADULT = /adult|xxx|18\s*\+/i;

  var C = SH.Catalog = {
    sources: SH.ls.get('sh.sources', []),
    channels: [], movies: [], series: [], groups: [], countries: [], genres: { movie: [], series: [] }, years: { movie: [], series: [] },
    TYPES: {
      m3u: { label: 'M3U playlist', desc: 'A playlist address ending in .m3u or .m3u8', ready: true },
      direct: { label: 'Direct stream URL', desc: 'A single live stream or video file', ready: true },
      demo: { label: 'Demo library', desc: 'Sample channels, guide and titles for exploring the app', ready: true },
      xtream: { label: 'Xtream Codes', ready: false }, stalker: { label: 'Stalker Portal', ready: false },
      jellyfin: { label: 'Jellyfin', ready: false }, plex: { label: 'Plex', ready: false }, emby: { label: 'Emby', ready: false }
    }
  };

  function saveSources() {
    SH.ls.set('sh.sources', C.sources.map(function (s) { return { id: s.id, type: s.type, name: s.name, url: s.url, status: s.status === 'syncing' ? 'never' : s.status, lastSync: s.lastSync, counts: s.counts, error: s.error }; }));
  }
  var changed = SH.debounce(function () { SH.Bus.emit('catalog:changed'); }, 60);
  function status() { SH.Bus.emit('sources:status'); }

  C.source = function (id) { for (var i = 0; i < C.sources.length; i++) if (C.sources[i].id === id) return C.sources[i]; return null; };
  C.get = function (id) { return byId[id] || null; };
  C.isEmpty = function () { return !C.channels.length && !C.movies.length && !C.series.length; };

  C.addSource = function (cfg) {
    var s = { id: 's' + SH.uid(), type: cfg.type, name: cfg.name, url: cfg.url || '', status: 'never', lastSync: 0, counts: null, error: '' };
    C.sources.push(s); saveSources(); status(); C.sync(s.id);
    return s;
  };
  C.updateSource = function (id, cfg) {
    var s = C.source(id); if (!s) return;
    s.name = cfg.name; var urlChanged = cfg.url && cfg.url !== s.url; if (urlChanged) s.url = cfg.url;
    saveSources(); status(); if (urlChanged) C.sync(id); else rebuild();
  };
  C.removeSource = function (id) {
    C.sources = C.sources.filter(function (s) { return s.id !== id; });
    delete raw[id]; SH.ls.del('sh.cache.' + id); saveSources(); status(); rebuild();
  };

  function finish(s, err, data) {
    if (err) { s.status = 'error'; s.error = String(err.message || err); }
    else {
      raw[s.id] = data; s.status = 'ok'; s.error = ''; s.lastSync = Date.now();
      s.counts = { channels: data.channels.length, movies: data.movies.length, series: data.series.length };
      if (s.type === 'm3u') { var json = JSON.stringify(data); if (json.length < 1500000) { try { localStorage.setItem('sh.cache.' + s.id, json); } catch (e) { SH.ls.del('sh.cache.' + s.id); } } else SH.ls.del('sh.cache.' + s.id); }
    }
    saveSources(); status(); rebuild();
  }

  C.sync = function (id, cb) {
    var s = C.source(id); if (!s || s.status === 'syncing') return;
    function done(err, data) { finish(s, err, data); if (cb) cb(err); }
    s.status = 'syncing'; status();
    if (s.type === 'demo') { setTimeout(function () { done(null, SH.Demo.build()); }, 0); return; }
    if (s.type === 'direct') {
      var d = { channels: [], movies: [], series: [], epg: {} };
      if (SH.M3U.isVod(s.url)) d.movies.push({ title: s.name, url: s.url, genres: [], added: Date.now() });
      else d.channels.push({ name: s.name, url: s.url, group: 'Direct streams', logo: '', country: '', tvgId: '' });
      setTimeout(function () { done(null, d); }, 0); return;
    }
    if (s.type === 'm3u') {
      SH.http(s.url, { timeout: 45000 }, function (err, text) {
        if (err) return done(err);
        var data; try { data = SH.M3U.parse(text); } catch (e) { return done(e); }
        if (!data.channels.length && !data.movies.length && !data.series.length) return done('The playlist is empty');
        done(null, data);
      });
      return;
    }
    done('This source type is not supported yet');
  };
  C.syncAll = function () { C.sources.forEach(function (s) { C.sync(s.id); }); };

  function uniqPush(arr, v) { if (v && arr.indexOf(v) < 0) arr.push(v); }

  function rebuild() {
    var chMap = {}, mvMap = {}, srMap = {}, grpMap = {}, hideAdult = SH.Store.get('hideAdult');
    byId = {}; C.channels = []; C.movies = []; C.series = []; C.groups = []; C.countries = [];
    C.genres = { movie: [], series: [] }; C.years = { movie: [], series: [] };
    SH.Epg.reset();
    C.sources.forEach(function (src) {
      var d = raw[src.id]; if (!d) return;
      d.channels.forEach(function (rc) {
        if (hideAdult && ADULT.test(rc.group)) return;
        var id = 'c:' + (rc.tvgId ? 'id ' + rc.tvgId.toLowerCase() : SH.norm(rc.name)), ch = chMap[id];
        if (!ch) {
          ch = chMap[id] = byId[id] = { id: id, kind: 'channel', name: rc.name, logo: rc.logo, group: rc.group || 'Uncategorised', country: rc.country, streams: [], num: C.channels.length + 1 };
          C.channels.push(ch);
          var g = grpMap[ch.group]; if (!g) { g = grpMap[ch.group] = { name: ch.group, count: 0 }; C.groups.push(g); } g.count++;
          uniqPush(C.countries, ch.country);
        }
        if (!ch.logo && rc.logo) ch.logo = rc.logo;
        ch.streams.push({ sourceId: src.id, url: rc.url });
        if (rc.tvgId && d.epg && d.epg[rc.tvgId] && !SH.Epg.has(ch)) SH.Epg.set(id, d.epg[rc.tvgId]);
      });
      d.movies.forEach(function (rm) {
        if (hideAdult && ADULT.test((rm.genres || []).join(' '))) return;
        var id = 'm:' + SH.norm(rm.title) + (rm.year ? ' ' + rm.year : ''), m = mvMap[id];
        if (!m) {
          m = mvMap[id] = byId[id] = SH.assign({}, rm, { id: id, kind: 'movie', genres: rm.genres || [], streams: [] }); delete m.url;
          C.movies.push(m); m.genres.forEach(function (g) { uniqPush(C.genres.movie, g); }); uniqPush(C.years.movie, m.year);
        }
        m.streams.push({ sourceId: src.id, url: rm.url });
      });
      d.series.forEach(function (rs) {
        if (hideAdult && ADULT.test((rs.genres || []).join(' '))) return;
        var id = 's:' + SH.norm(rs.title), s = srMap[id];
        if (s) { uniqPush(s.sourceIds, src.id); return; }
        s = srMap[id] = byId[id] = SH.assign({}, rs, { id: id, kind: 'series', genres: rs.genres || [], sourceIds: [src.id], seasons: [] }); delete s.episodes;
        var seasons = {};
        rs.episodes.slice().sort(function (a, b) { return a.season - b.season || a.number - b.number; }).forEach(function (re) {
          var ep = { id: id + ':' + re.season + ':' + re.number, kind: 'episode', seriesId: id, season: re.season, number: re.number, title: re.title || ('Episode ' + re.number), plot: re.plot || '', duration: re.duration || 0, streams: [{ sourceId: src.id, url: re.url }] };
          byId[ep.id] = ep;
          if (!seasons[re.season]) { seasons[re.season] = { number: re.season, episodes: [] }; s.seasons.push(seasons[re.season]); }
          seasons[re.season].episodes.push(ep);
        });
        C.series.push(s); s.genres.forEach(function (g) { uniqPush(C.genres.series, g); }); uniqPush(C.years.series, s.year);
      });
    });
    C.genres.movie.sort(); C.genres.series.sort(); C.countries.sort();
    C.years.movie.sort(function (a, b) { return b - a; }); C.years.series.sort(function (a, b) { return b - a; });
    changed();
  }
  C.rebuild = rebuild;

  /* ---- queries ---- */
  C.channelsBy = function (f) {
    var d = SH.Store.data(), mode = f && f.mode || 'all', v = f && f.value;
    if (mode === 'fav') return C.channels.filter(function (c) { return d.favs[c.id]; });
    if (mode === 'recent') return d.recent.map(C.get).filter(Boolean);
    if (mode === 'group') return C.channels.filter(function (c) { return c.group === v; });
    if (mode === 'country') return C.channels.filter(function (c) { return c.country === v; });
    if (mode === 'source') return C.channels.filter(function (c) { for (var i = 0; i < c.streams.length; i++) if (c.streams[i].sourceId === v) return true; return false; });
    if (mode === 'collection') { var col = d.collections.filter(function (x) { return x.id === v; })[0]; return col ? col.items.map(C.get).filter(function (x) { return x && x.kind === 'channel'; }) : []; }
    return C.channels;
  };
  C.recentlyAdded = function (kind, n) {
    var l = kind === 'movie' ? C.movies : (kind === 'series' ? C.series : C.movies.concat(C.series));
    return l.slice().sort(function (a, b) { return (b.added || 0) - (a.added || 0); }).slice(0, n || 20);
  };
  C.topRated = function (kind, n) {
    var l = (kind === 'movie' ? C.movies : (kind === 'series' ? C.series : C.movies.concat(C.series))).filter(function (x) { return x.rating; });
    return l.sort(function (a, b) { return b.rating - a.rating; }).slice(0, n || 20);
  };
  C.byGenre = function (kind, genre, n) {
    var l = (kind === 'movie' ? C.movies : (kind === 'series' ? C.series : C.movies.concat(C.series))).filter(function (x) { return x.genres.indexOf(genre) >= 0; });
    return n ? l.slice(0, n) : l;
  };
  C.similar = function (item, n) {
    var pool = C.movies.concat(C.series), out = [];
    pool.forEach(function (x) { if (x.id === item.id) return; var sc = 0; x.genres.forEach(function (g) { if (item.genres.indexOf(g) >= 0) sc++; }); if (sc) out.push({ x: x, sc: sc + (x.kind === item.kind ? 0.5 : 0) }); });
    out.sort(function (a, b) { return b.sc - a.sc; });
    return out.slice(0, n || 12).map(function (o) { return o.x; });
  };
  C.seriesOf = function (ep) { return byId[ep.seriesId]; };
  C.nextEpisode = function (ep) {
    var s = byId[ep.seriesId]; if (!s) return null; var flat = [];
    s.seasons.forEach(function (se) { flat = flat.concat(se.episodes); });
    var i = flat.indexOf(ep); return i >= 0 ? flat[i + 1] || null : null;
  };
  C.titleOf = function (item) {
    if (item.kind === 'channel') return item.name;
    if (item.kind === 'episode') { var s = byId[item.seriesId]; return (s ? s.title + ' · ' : '') + 'S' + item.season + ' E' + item.number; }
    return item.title;
  };
  C.sourceNames = function (item) {
    var ids = item.sourceIds || (item.streams || []).map(function (s) { return s.sourceId; }), out = [];
    ids.forEach(function (id) { var s = C.source(id); if (s) uniqPush(out, s.name); });
    return out;
  };
  C.search = function (q) {
    var tokens = SH.norm(q).split(' ').filter(Boolean), res = { channels: [], categories: [], programmes: [], movies: [], series: [], episodes: [] };
    if (!tokens.length) return res;
    function hit(s) { var n = SH.norm(s); for (var i = 0; i < tokens.length; i++) if (n.indexOf(tokens[i]) < 0) return false; return true; }
    function take(list, field, out, max) { for (var i = 0; i < list.length && out.length < max; i++) if (hit(list[i][field])) out.push(list[i]); }
    take(C.channels, 'name', res.channels, 30); take(C.groups, 'name', res.categories, 12);
    take(C.movies, 'title', res.movies, 30); take(C.series, 'title', res.series, 30);
    for (var i = 0; i < C.series.length && res.episodes.length < 20; i++) C.series[i].seasons.forEach(function (se) { se.episodes.forEach(function (ep) { if (res.episodes.length < 20 && !/^Episode \d+$/.test(ep.title) && hit(ep.title)) res.episodes.push(ep); }); });
    res.programmes = SH.Epg.search(C.channels, tokens, 24);
    return res;
  };

  /* ---- startup ---- */
  C.init = function () {
    C.sources.forEach(function (s) {
      if (s.type === 'm3u') { var c = SH.ls.get('sh.cache.' + s.id, null); if (c) raw[s.id] = c; }
    });
    rebuild();
    C.sources.forEach(function (s) { if (s.type !== 'm3u' || SH.Store.get('autoRefresh') || !raw[s.id]) C.sync(s.id); });
  };
  SH.Bus.on('settings', function (k) { if (k === 'hideAdult') rebuild(); });
})();

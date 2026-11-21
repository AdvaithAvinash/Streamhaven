/* Catalogue: source registry, synchronisation, and the merged multi-source library.
 * Content providers (SH.Providers[type]) supply raw channels / movies / series; this module merges
 * items with the same identity across sources (basis of the channel alternative finder) and
 * attaches guide data from any source that has it.
 *
 * Provider contract
 *   sync(src, cb(err, data))            data = {channels, movies, series, epg?, epgUrl?, info?}
 *   epg(src, data, cb(err, guide|null)) optional; guide = {byId, names, count}
 *   episodes(src, id, cb(err, eps))     optional; lazy series (id from raw series.lazy.id)
 *   resolve(src, stream, cb(err, url))  optional; for streams that need a request before playing
 *   catchup(src, stream, prog)          optional; returns a URL or ''
 *   form                                optional; add/edit fields, see sources screen */
(function () {
  'use strict';
  var SH = window.SH;
  SH.Providers = SH.Providers || {};
  var raw = {}, epgRaw = {}, lazyCache = {}, byId = {};
  var ADULT = /adult|xxx|18\s*\+/i;

  var C = SH.Catalog = {
    sources: SH.ls.get('sh.sources', []),
    channels: [], movies: [], series: [], groups: [], countries: [], genres: { movie: [], series: [] }, years: { movie: [], series: [] },
    TYPES: {
      m3u: { label: 'M3U playlist', desc: 'A playlist address ending in .m3u or .m3u8', icon: 'sources' },
      xtream: { label: 'Xtream Codes', desc: 'Server address, username and password from your provider', icon: 'sources' },
      stalker: { label: 'Stalker Portal', desc: 'Portal address and MAC address', icon: 'sources' },
      jellyfin: { label: 'Jellyfin', desc: 'Your Jellyfin server: movies and series', icon: 'movies' },
      emby: { label: 'Emby', desc: 'Your Emby server: movies and series', icon: 'movies' },
      plex: { label: 'Plex', desc: 'Link your Plex account with a code', icon: 'movies' },
      xmltv: { label: 'XMLTV guide', desc: 'A programme guide for your channels (.xml or .xml.gz)', icon: 'guide' },
      direct: { label: 'Direct stream URL', desc: 'A single live stream or video file', icon: 'play' }
    },
    ORDER: ['m3u', 'xtream', 'stalker', 'jellyfin', 'emby', 'plex', 'xmltv', 'direct']
  };

  var FIELDS = ['id', 'type', 'name', 'url', 'cfg', 'status', 'lastSync', 'counts', 'error', 'info', 'epgUrl', 'epgStatus', 'epgError', 'epgAt', 'epgCount'];
  function saveSources() {
    SH.ls.set('sh.sources', C.sources.map(function (s) {
      var o = {}; FIELDS.forEach(function (f) { o[f] = s[f]; });
      if (o.status === 'syncing') o.status = 'never'; if (o.epgStatus === 'loading') o.epgStatus = 'none';
      return o;
    }));
  }
  var changed = SH.debounce(function () { SH.Bus.emit('catalog:changed'); }, 60);
  function status() { SH.Bus.emit('sources:status'); }
  function provider(s) { return SH.Providers[s.type]; }

  C.source = function (id) { for (var i = 0; i < C.sources.length; i++) if (C.sources[i].id === id) return C.sources[i]; return null; };
  C.get = function (id) { return byId[id] || null; };
  C.isEmpty = function () { return !C.channels.length && !C.movies.length && !C.series.length; };
  C.host = function (s) { return SH.hostOf((s.cfg && (s.cfg.server || s.cfg.portal)) || s.url); };
  C.ready = function (type) { return !!SH.Providers[type]; };

  C.addSource = function (cfg) {
    var s = { id: 's' + SH.uid(), type: cfg.type, name: cfg.name, url: cfg.url || '', cfg: cfg.cfg || null, epgUrl: cfg.epgUrl || '', status: 'never', lastSync: 0, counts: null, error: '', info: '', epgStatus: 'none' };
    C.sources.push(s); saveSources(); status(); C.sync(s.id);
    return s;
  };
  C.updateSource = function (id, cfg) {
    var s = C.source(id); if (!s) return;
    s.name = cfg.name || s.name;
    var resync = false;
    if (cfg.url !== undefined && cfg.url !== s.url) { s.url = cfg.url; resync = true; }
    if (cfg.epgUrl !== undefined && cfg.epgUrl !== s.epgUrl) { s.epgUrl = cfg.epgUrl; resync = true; }
    if (cfg.cfg) { s.cfg = SH.assign({}, s.cfg, cfg.cfg); resync = true; }
    saveSources(); status(); if (resync) C.sync(id); else rebuild();
  };
  C.removeSource = function (id) {
    C.sources = C.sources.filter(function (s) { return s.id !== id; });
    delete raw[id]; delete epgRaw[id];
    SH.ls.del('sh.cache.' + id); SH.ls.del('sh.epg.' + id);
    for (var k in lazyCache) if (k.indexOf(id + ':') === 0) delete lazyCache[k];
    saveSources(); status(); rebuild();
  };

  function cacheTry(key, obj, limit) {
    var json = JSON.stringify(obj);
    if (json.length < limit) { try { localStorage.setItem(key, json); return; } catch (e) {} }
    SH.ls.del(key);
  }
  function setEpg(s, g) {
    epgRaw[s.id] = g; s.epgStatus = 'ok'; s.epgError = ''; s.epgAt = Date.now(); s.epgCount = g.count || 0;
    cacheTry('sh.epg.' + s.id, g, 1300000);
  }

  function finish(s, err, data) {
    if (err) { s.status = 'error'; s.error = String(err.message || err); saveSources(); status(); rebuild(); return false; }
    var guide = data.epg && data.epg.byId ? data.epg : null; delete data.epg;
    raw[s.id] = data; s.status = 'ok'; s.error = ''; s.lastSync = Date.now(); s.info = data.info || '';
    s.counts = { channels: data.channels.length, movies: data.movies.length, series: data.series.length };
    if (s.type !== 'demo' && s.type !== 'direct') cacheTry('sh.cache.' + s.id, data, 1500000);
    if (guide) setEpg(s, guide);
    saveSources(); status(); rebuild();
    return true;
  }

  C.sync = function (id, cb) {
    var s = C.source(id), pr = s && provider(s); if (!s || s.status === 'syncing') return;
    if (!pr) { s.status = 'error'; s.error = 'This source type is not supported'; status(); if (cb) cb(s.error); return; }
    s.status = 'syncing'; status();
    var done = false;
    pr.sync(s, function (err, data) {
      if (done) return; done = true;
      var hadGuide = !err && !!(data.epg && data.epg.byId);
      var ok = finish(s, err, data);
      if (!ok) { if (cb) cb(err); return; }
      if (hadGuide || !pr.epg) { if (cb) cb(null); return; }
      s.epgStatus = 'loading'; status();
      pr.epg(s, data, function (e2, g) {
        if (e2) { s.epgStatus = 'error'; s.epgError = String(e2.message || e2); }
        else if (g && g.count) setEpg(s, g);
        else s.epgStatus = g ? 'error' : 'none', s.epgError = g ? 'The guide contained no upcoming programmes' : '';
        saveSources(); status(); rebuild(); if (cb) cb(null);
      });
    });
  };
  C.syncAll = function () { C.sources.forEach(function (s) { C.sync(s.id); }); };

  /* ---- stream resolution / catch-up / lazy episodes ---- */
  C.resolve = function (stream, cb) {
    var s = C.source(stream.sourceId), pr = s && provider(s);
    if (!pr || !pr.resolve) return cb('This source cannot start the stream');
    pr.resolve(s, stream, cb);
  };
  C.catchupFor = function (ch, prog) {
    var now = Date.now(); if (!prog) return null;
    for (var i = 0; i < ch.streams.length; i++) {
      var st = ch.streams[i], s = C.source(st.sourceId), pr = s && provider(s);
      if (!st.catchup || !pr || !pr.catchup) continue;
      if (prog.s < now - st.catchup.days * 86400000 || prog.e > now) continue;
      var url = pr.catchup(s, st, prog); if (url) return { url: url, sourceId: st.sourceId };
    }
    return null;
  };
  C.hasCatchup = function (ch) { for (var i = 0; i < ch.streams.length; i++) if (ch.streams[i].catchup) return ch.streams[i].catchup.days; return 0; };

  function addEpisodes(s, srcId, rawEps) {
    var id = s.id, seasons = {};
    s.seasons = [];
    rawEps.slice().sort(function (a, b) { return a.season - b.season || a.number - b.number; }).forEach(function (re) {
      var url = re.url || ('sh-resolve://' + srcId + '/' + SH.hash(JSON.stringify(re.resolve)).toString(36));
      var ep = { id: id + ':' + re.season + ':' + re.number, kind: 'episode', seriesId: id, season: re.season, number: re.number, title: re.title || ('Episode ' + re.number), plot: re.plot || '', duration: re.duration || 0, streams: [{ sourceId: srcId, url: url, resolve: re.resolve || null }] };
      byId[ep.id] = ep;
      if (!seasons[re.season]) { seasons[re.season] = { number: re.season, episodes: [] }; s.seasons.push(seasons[re.season]); }
      seasons[re.season].episodes.push(ep);
    });
  }
  C.loadEpisodes = function (s, cb) {
    var l = s.lazy, src = l && C.source(l.sourceId), pr = src && provider(src);
    if (!l || s.seasons.length || s.loading) return cb(null);
    if (!pr || !pr.episodes) return cb('This source cannot list episodes');
    s.loading = true;
    pr.episodes(src, l.id, function (err, eps) {
      s.loading = false; s.loaded = true;
      if (err) { s.loadError = String(err.message || err); return cb(err); }
      lazyCache[l.sourceId + ':' + l.id] = eps; addEpisodes(s, l.sourceId, eps); cb(null);
    });
  };

  function uniqPush(arr, v) { if (v && arr.indexOf(v) < 0) arr.push(v); }
  function mkStream(src, r) {
    var st = { sourceId: src.id, url: r.url || ('sh-resolve://' + src.id + '/' + SH.hash(JSON.stringify(r.resolve)).toString(36)), resolve: r.resolve || null };
    if (r.catchup) st.catchup = r.catchup;
    return st;
  }

  function rebuild() {
    var chMap = {}, mvMap = {}, srMap = {}, grpMap = {}, hideAdult = SH.Store.get('hideAdult'), epgKeys = {};
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
          C.channels.push(ch); epgKeys[id] = [];
          var g = grpMap[ch.group]; if (!g) { g = grpMap[ch.group] = { name: ch.group, count: 0 }; C.groups.push(g); } g.count++;
          uniqPush(C.countries, ch.country);
        }
        if (!ch.logo && rc.logo) ch.logo = rc.logo;
        ch.streams.push(mkStream(src, rc));
        epgKeys[id].push([src.id, rc.epgKey || rc.tvgId || '']);
      });
      d.movies.forEach(function (rm) {
        if (hideAdult && ADULT.test((rm.genres || []).join(' '))) return;
        var cm = SH.Meta.clean(rm.title), mt = cm.title || rm.title, my = rm.year || cm.year || 0;
        var id = 'm:' + SH.norm(mt) + (my ? ' ' + my : ''), m = mvMap[id];
        if (!m) {
          m = mvMap[id] = byId[id] = SH.assign({}, rm, { id: id, kind: 'movie', title: mt, year: my, genres: rm.genres || [], streams: [] }); delete m.url; delete m.resolve;
          C.movies.push(m); m.genres.forEach(function (g) { uniqPush(C.genres.movie, g); }); uniqPush(C.years.movie, m.year);
        }
        m.streams.push(mkStream(src, rm));
      });
      d.series.forEach(function (rs) {
        if (hideAdult && ADULT.test((rs.genres || []).join(' '))) return;
        var cs = SH.Meta.clean(rs.title), st = cs.title || rs.title;
        var id = 's:' + SH.norm(st), s = srMap[id];
        if (s) { uniqPush(s.sourceIds, src.id); return; }
        s = srMap[id] = byId[id] = SH.assign({}, rs, { id: id, title: st, year: rs.year || cs.year || 0, kind: 'series', genres: rs.genres || [], sourceIds: [src.id], seasons: [], lazy: rs.lazy ? { sourceId: src.id, id: rs.lazy.id } : null });
        delete s.episodes;
        var eps = rs.episodes || (rs.lazy && lazyCache[src.id + ':' + rs.lazy.id]);
        if (eps) addEpisodes(s, src.id, eps);
        C.series.push(s); s.genres.forEach(function (g) { uniqPush(C.genres.series, g); }); uniqPush(C.years.series, s.year);
      });
    });

    /* guide: the channel's own source first, then any source by id, then by display name */
    var ids = {}, names = {}, any = false;
    C.sources.forEach(function (src) {
      var e = epgRaw[src.id]; if (!e) return; any = true;
      for (var k in e.byId) { var lk = k.toLowerCase(); if (!ids[lk]) ids[lk] = e.byId[k]; }
      for (var n in (e.names || {})) if (!names[n]) { var t = ids[String(e.names[n]).toLowerCase()] || e.byId[e.names[n]]; if (t) names[n] = t; }
    });
    if (any) C.channels.forEach(function (ch) {
      var keys = epgKeys[ch.id], list = null, i;
      for (i = 0; i < keys.length && !list; i++) { var e = epgRaw[keys[i][0]]; if (e && keys[i][1]) list = e.byId[keys[i][1]]; }
      for (i = 0; i < keys.length && !list; i++) if (keys[i][1]) list = ids[keys[i][1].toLowerCase()];
      if (!list) list = names[SH.norm(ch.name)];
      if (list) SH.Epg.set(ch.id, list);
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
    if (item.kind === 'catchup') return item.title;
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
      if (s.type !== 'demo' && s.type !== 'direct') { var c = SH.ls.get('sh.cache.' + s.id, null); if (c) raw[s.id] = c; }
      var g = SH.ls.get('sh.epg.' + s.id, null); if (g) epgRaw[s.id] = g;
    });
    rebuild();
    C.sources.forEach(function (s) { if (SH.Store.get('autoRefresh') || !raw[s.id]) C.sync(s.id); });
  };
  SH.Bus.on('settings', function (k) { if (k === 'hideAdult') rebuild(); });
})();

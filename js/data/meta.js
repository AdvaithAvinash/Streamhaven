/* Artwork and metadata for movies and series.
 *   Cinemeta (no key):  GET https://v3-cinemeta.strem.io/catalog/{movie|series}/top/search=<title>.json   -> {metas: [{imdb_id, name, releaseInfo, poster, background}]}
 *                       GET https://v3-cinemeta.strem.io/meta/{type}/{imdb}.json                          -> {meta: {description, cast[], director[]|null, genres[], imdbRating, runtime, videos[]}}
 *                       images: https://images.metahub.space/{poster|background}/{small|medium}/{imdb}/img
 *   TMDB (optional key): GET https://api.themoviedb.org/3/search/{movie|tv}  and  /3/{movie|tv}/{id}?append_to_response=credits
 * Shapes checked against live Cinemeta responses on 2026-11-21 (TMDB: error shape only, no key was available).
 * A cover is only replaced when the match is confident. A wrong cover is worse than the provider's own. */
(function () {
  'use strict';
  var SH = window.SH, M = SH.Meta = {};
  var CM = 'https://v3-cinemeta.strem.io', MH = 'https://images.metahub.space', TM = 'https://api.themoviedb.org/3', TI = 'https://image.tmdb.org/t/p';
  var cache = SH.ls.get('sh.meta', {}), detailMem = {}, inflight = {}, waiting = {}, retryAt = {}, queue = [], running = 0, keyBad = false, MAX_ENTRIES = 3000, MISS_DAYS = 7;
  var persist = SH.debounce(function () {
    var ks = Object.keys(cache);
    if (ks.length > MAX_ENTRIES) { ks.sort(function (a, b) { return cache[a].t - cache[b].t; }); for (var i = 0; i < ks.length - MAX_ENTRIES + 200; i++) delete cache[ks[i]]; }
    SH.ls.set('sh.meta', cache);
  }, 2500);

  function tidy(t) { return t.replace(/\s+/g, ' ').replace(/^[\s\-:|.]+|[\s\-:|.]+$/g, ''); }
  /* "EN - The Matrix (1999) 1080p [4K]"  ->  {title: "The Matrix", year: 1999} */
  M.clean = function (raw) {
    var t = String(raw || ''), year = 0, alt = '', m;
    t = t.replace(/\[[^\]]*\]|\{[^}]*\}/g, ' ');
    if ((m = /\(((?:19|20)\d{2})\)/.exec(t))) year = +m[1];
    t = t.replace(/\([^)]*\)/g, ' ');
    t = t.replace(/^\s*(?:\|[A-Za-z]{2,3}\|\s*|[A-Z]{2,3}\s*[-|]\s+)/, '');          // "EN - ", "|EN| ", "FR | " (never "Up: ...")
    t = t.replace(/\b(?:2160p|1080p|720p|480p|4k|uhd|fhd|hevc|x26[45]|h\.?26[45]|web-?dl|webrip|blu-?ray|brrip|hdrip|dvdrip|hdtv|multi|dual|vostfr)\b/ig, ' ');
    if (!year && (m = /^(.*\S)\s+((?:19|20)\d{2})\s*$/.exec(t)) && +m[2] <= new Date().getFullYear() + 1) { year = +m[2]; alt = tidy(t); t = m[1]; }   // "Wonder Woman 1984": try both readings
    return { title: tidy(t), year: year, alt: alt };
  };

  M.source = function () {
    var mode = SH.Store.get('artSource') || 'auto', key = SH.Store.get('tmdbKey');
    if (mode === 'off') return '';
    if ((mode === 'tmdb' || mode === 'auto') && key && !keyBad) return 't';
    return 'c';
  };
  M.sourceLabel = function () { var s = M.source(); return s === 't' ? 'TMDB' : (s === 'c' ? 'Cinemeta' : 'Provider artwork only'); };
  M.enabled = function () { return !!M.source(); };

  function type(item) { return item.kind === 'series' ? 'series' : 'movie'; }
  function ckey(item) { var c = M.clean(item.title); return type(item).charAt(0) + ':' + SH.norm(c.title) + ':' + (item.year || c.year || 0); }
  function entry(item) { return cache[ckey(item)] || null; }

  /* Best known address for an image: 'poster', 'backdrop' (cards) or 'hero' (large).
   * undefined = a lookup is still needed (the caller shows nothing yet); '' = nothing available. */
  M.art = function (item, kind) {
    var own = kind === 'poster' ? item.poster : (item.backdrop || item.poster) || '';
    if (!M.enabled()) return own || '';
    var e = entry(item);
    if (!e) return undefined;
    if (e.m) return own || '';
    return (kind === 'poster' ? e.p : (kind === 'hero' ? (e.h || e.b) : e.b)) || own || '';
  };
  M.needs = function (item) {
    if (!M.enabled() || item.kind === 'channel') return false;
    var e = entry(item);
    if (!e) return true;
    return e.s !== M.source() || (e.m && Date.now() - e.t > MISS_DAYS * 86400000);
  };

  function score(c, q, year) {
    var n = SH.norm(c.name), sc = 0;
    if (n === q) sc += 4; else if (n.indexOf(q + ' ') === 0 || q.indexOf(n + ' ') === 0) sc += 1.5;
    var cy = parseInt(c.year, 10);
    if (year && cy) { var d = Math.abs(cy - year); sc += d === 0 ? 3 : (d === 1 ? 1.5 : (d <= 2 ? 0 : -3)); }
    return sc;
  }
  function pickBest(cands, title, year) {
    var q = SH.norm(title), best = null, bs = -99;
    for (var i = 0; i < cands.length; i++) { var s = score(cands[i], q, year) - i * 0.02; if (s > bs) { bs = s; best = cands[i]; } }
    return best && bs >= 3.9 ? best : null;                      // exact title, or a near title with the right year; anything weaker is a miss
  }
  function tmdbReq(path, cb) {
    var key = SH.Store.get('tmdbKey'), bearer = key.length > 40, sep = path.indexOf('?') < 0 ? '?' : '&';
    SH.getJson(TM + path + (bearer ? '' : sep + 'api_key=' + encodeURIComponent(key)), { timeout: 15000, headers: bearer ? { Authorization: 'Bearer ' + key, Accept: 'application/json' } : { Accept: 'application/json' } }, function (err, j, info) {
      if (err && info && info.status === 401) { keyBad = true; SH.Bus.emit('meta:keybad'); }
      cb(err, j);
    });
  }

  /* ---- light lookup: find the title, remember its artwork ---- */
  function search(item, cb) {
    var c = M.clean(item.title), year = item.year || c.year || 0, tries = [[c.title, year]];
    if (c.alt) tries.push([c.alt, item.year || 0]);
    (function next(i) {
      search1(item, tries[i][0], tries[i][1], function (err, res) {
        if (err || !res.m || i + 1 >= tries.length) return cb(err, res);
        next(i + 1);
      });
    })(0);
  }
  function search1(item, title, year, cb) {
    var src = M.source(), t = type(item);
    if (title.length < 2) return cb(null, { m: 1 });
    if (src === 't') {
      var isTv = t === 'series';
      tmdbReq('/search/' + (isTv ? 'tv' : 'movie') + '?include_adult=false&query=' + encodeURIComponent(title) + (year ? '&' + (isTv ? 'first_air_date_year' : 'year') + '=' + year : ''), function (err, j) {
        if (err) return cb(err);
        var cands = ((j && j.results) || []).map(function (r) { return { name: r.title || r.name, year: (r.release_date || r.first_air_date || '').slice(0, 4), r: r }; });
        var best = pickBest(cands, title, year);
        if (!best || !(best.r.poster_path || best.r.backdrop_path)) return cb(null, { m: 1 });
        var r = best.r;
        cb(null, { id: String(r.id), p: r.poster_path ? TI + '/w342' + r.poster_path : '', b: r.backdrop_path ? TI + '/w500' + r.backdrop_path : '', h: r.backdrop_path ? TI + '/w1280' + r.backdrop_path : '', y: +best.year || 0 });
      });
      return;
    }
    SH.getJson(CM + '/catalog/' + t + '/top/search=' + encodeURIComponent(title) + '.json', { timeout: 15000 }, function (err, j) {
      if (err) return cb(err);
      var cands = ((j && j.metas) || []).map(function (x) { return { name: x.name, year: x.releaseInfo, x: x }; }), best = pickBest(cands, title, year);
      if (!best) return cb(null, { m: 1 });
      var id = best.x.imdb_id || best.x.id;
      cb(null, { id: id, p: MH + '/poster/small/' + id + '/img', b: MH + '/background/small/' + id + '/img', h: MH + '/background/medium/' + id + '/img', y: parseInt(best.year, 10) || 0 });
    });
  }
  function pump() {
    while (running < 3 && queue.length) {
      (function (job) {
        running++;
        search(job.item, function (err, res) {
          running--;
          var k = job.key, cbs = waiting[k] || []; delete waiting[k]; delete inflight[k];
          if (err) retryAt[k] = Date.now() + 60000;               // offline or rate-limited: nothing is cached, try again later
          else { res.s = job.src; res.t = Date.now(); cache[k] = res; persist(); }
          cbs.forEach(function (f) { f(err ? null : res); });
          pump();
        });
      })(queue.shift());
    }
  }
  M.lookup = function (item, cb) {
    if (!M.needs(item)) return cb && cb(entry(item));
    var k = ckey(item);
    if (retryAt[k] && Date.now() < retryAt[k]) return cb && cb(null);
    (waiting[k] = waiting[k] || []).push(cb || function () {});
    if (!inflight[k]) { inflight[k] = true; queue.push({ key: k, item: item, src: M.source() }); pump(); }
  };

  /* ---- detail: plot, rating, cast, director, genres, runtime, episode info ---- */
  M.detail = function (item, cb) {
    var k = ckey(item) + ':' + M.source();
    if (detailMem[k]) return cb(detailMem[k]);
    M.lookup(item, function (e) {
      if (!e || e.m || !e.id) return cb(null);
      var t = type(item);
      function done(d) { detailMem[k] = d; cb(d); }
      if (e.s === 't') {
        tmdbReq('/' + (t === 'series' ? 'tv' : 'movie') + '/' + e.id + '?append_to_response=credits', function (err, j) {
          if (err || !j) return cb(null);
          var cr = j.credits || {}, dir = (cr.crew || []).filter(function (p) { return p.job === 'Director'; })[0];
          done({ plot: j.overview || '', rating: j.vote_average ? Math.round(j.vote_average * 10) / 10 : 0, genres: (j.genres || []).map(function (g) { return g.name; }), cast: (cr.cast || []).slice(0, 5).map(function (p) { return p.name; }), director: dir ? dir.name : '', runtime: (j.runtime || (j.episode_run_time && j.episode_run_time[0]) || 0) * 60, eps: null });
        });
        return;
      }
      SH.getJson(CM + '/meta/' + t + '/' + e.id + '.json', { timeout: 15000 }, function (err, j) {
        var m = j && j.meta; if (err || !m) return cb(null);
        var eps = null;
        if (m.videos instanceof Array) { eps = {}; m.videos.forEach(function (v) { if (v.season > 0) eps[v.season + ':' + v.number] = { title: v.name || v.title || '', plot: v.overview || v.description || '', thumb: v.thumbnail || '' }; }); }
        done({ plot: m.description || '', rating: parseFloat(m.imdbRating) || 0, genres: m.genres || m.genre || [], cast: (m.cast || []).slice(0, 5), director: (m.director && m.director[0]) || '', runtime: parseInt(m.runtime, 10) * 60 || 0, eps: eps });
      });
    });
  };
  /* Fill gaps (and the generic bits) of an item from detail data. */
  M.apply = function (item, d) {
    if (!d) return;
    if (d.plot && (!item.plot || item.plot.length < 60 || d.plot.length > item.plot.length)) item.plot = d.plot;
    if (d.rating) item.rating = d.rating;
    if (d.genres && d.genres.length && (!item.genres || !item.genres.length)) item.genres = d.genres;
    if (d.cast && d.cast.length) item.cast = d.cast;
    if (d.director) item.director = d.director;
    if (d.runtime && !item.duration) item.duration = d.runtime;
    if (d.eps && item.seasons) item.seasons.forEach(function (se) { se.episodes.forEach(function (ep) {
      var x = d.eps[ep.season + ':' + ep.number]; if (!x) return;
      if (x.title && (!ep.title || /^Episode \d+$/.test(ep.title))) ep.title = x.title;
      if (x.plot && !ep.plot) ep.plot = x.plot;
      if (x.thumb && !ep.thumb) ep.thumb = x.thumb;
    }); });
  };

  M.testKey = function (key, cb) {
    var bearer = key.length > 40;
    SH.getJson(TM + '/configuration' + (bearer ? '' : '?api_key=' + encodeURIComponent(key)), { timeout: 15000, headers: bearer ? { Authorization: 'Bearer ' + key } : {} }, function (err, j, info) {
      if (err) return cb(info && info.status === 401 ? 'TMDB did not accept this key.' : err);
      cb(null);
    });
  };
  M.clear = function () { cache = {}; detailMem = {}; retryAt = {}; SH.ls.del('sh.meta'); };
  M.count = function () { return Object.keys(cache).length; };
  SH.Bus.on('meta:keybad', function () { if (SH.UI) SH.UI.toast('TMDB rejected the saved key. Using Cinemeta instead.', 'error'); });
  SH.Bus.on('settings', function (k) { if (k === 'artSource' || k === 'tmdbKey') { keyBad = false; if (SH.Router) SH.Router.refresh(); } });
})();

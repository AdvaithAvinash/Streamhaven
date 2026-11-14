/* Xtream Codes provider: live channels, movies, series (episodes loaded on demand), XMLTV guide,
 * and catch-up (timeshift) where the provider offers it. */
(function () {
  'use strict';
  var SH = window.SH, P = SH.Providers;

  /* Accepts "host:port", "http://host", a player_api.php address, or a full get.php?username=&password= link. */
  function parseServer(input) {
    var u = String(input || '').replace(/^\s+|\s+$/g, ''), user = '', pass = '', m;
    if (!/^[a-z]+:\/\//i.test(u) && u) u = 'http://' + u;
    var q = u.indexOf('?');
    if (q >= 0) {
      var qs = u.slice(q + 1); u = u.slice(0, q);
      if ((m = /(?:^|&)username=([^&]*)/.exec(qs))) user = decodeURIComponent(m[1]);
      if ((m = /(?:^|&)password=([^&]*)/.exec(qs))) pass = decodeURIComponent(m[1]);
    }
    u = u.replace(/\/(player_api|get|xmltv|panel_api)\.php$/i, '').replace(/\/c$/i, '').replace(/\/+$/, '');
    return { server: u, username: user, password: pass };
  }
  function enc(s) { return encodeURIComponent(s); }
  function api(c, action, extra, cb) {
    var url = c.server + '/player_api.php?username=' + enc(c.username) + '&password=' + enc(c.password) + (action ? '&action=' + action : '') + (extra || '');
    SH.getJson(url, { timeout: 90000 }, cb);
  }
  function auth(c, cb) {
    api(c, '', '', function (err, j) {
      if (err) return cb(err);
      var ui = j && j.user_info;
      if (!ui) return cb('This does not look like an Xtream Codes server');
      if (ui.auth === 0 || ui.auth === '0') return cb('The server rejected the username or password');
      if (ui.status && String(ui.status).toLowerCase() !== 'active') return cb('This account is ' + String(ui.status).toLowerCase());
      cb(null, j);
    });
  }
  function yearOf(s) { var m = /(19|20)\d{2}/.exec(String(s || '')); return m ? +m[0] : 0; }
  function cleanTitle(n) { return String(n || '').replace(/\s*[\(\[]((?:19|20)\d{2})[\)\]]\s*$/, '').replace(/^\s+|\s+$/g, ''); }
  function catMap(list) { var m = {}; (list || []).forEach(function (c) { m[c.category_id] = c.category_name; }); return m; }
  function pad(n) { return SH.pad2(n); }

  P.xtream = {
    parseServer: parseServer,
    form: { fields: [
      { key: 'name', label: 'Name', placeholder: 'My provider' },
      { key: 'server', label: 'Server address', placeholder: 'http://host:port', type: 'url', hint: 'You can also paste the full get.php link from your provider.' },
      { key: 'username', label: 'Username' },
      { key: 'password', label: 'Password', secret: true },
      { key: 'ext', label: 'Live stream format (optional)', placeholder: 'm3u8', hint: 'm3u8 (default) or ts' }
    ], make: function (v, ex, cb) {
      var p = parseServer(v.server), c = { server: p.server, username: v.username || p.username || (ex && ex.cfg.username) || '', password: v.password || p.password || (ex && ex.cfg.password) || '', ext: (v.ext || 'm3u8').replace(/^\./, '') };
      if (!SH.validUrl(c.server)) return cb('Enter the server address, for example http://example.com:8080');
      if (!c.username || !c.password) return cb('Enter the username and password');
      if (!/^(m3u8|ts)$/.test(c.ext)) return cb('The live format must be m3u8 or ts');
      auth(c, function (err, j) {
        if (err) return cb(err);
        var tz = 0; try { var tn = j.server_info && j.server_info.time_now; if (tn) { var t = Date.parse(tn.replace(' ', 'T') + 'Z'); if (t) tz = Math.round((t - Date.now()) / 900000) * 900000; } } catch (e) {}
        c.tzOffset = tz;
        cb(null, { name: v.name || SH.hostOf(c.server), cfg: c });
      });
    } },

    sync: function (s, cb) {
      var c = s.cfg, out = { channels: [], movies: [], series: [], info: '' }, left = 6, failures = 0, lastErr = '';
      auth(c, function (err, j) {
        if (err) return cb(err);
        var ui = j.user_info, bits = [];
        if (ui.exp_date && +ui.exp_date > 0) bits.push('Expires ' + SH.fmt.day(+ui.exp_date * 1000).replace(/^Today$/, 'today'));
        if (ui.max_connections) bits.push(ui.max_connections + (+ui.max_connections === 1 ? ' connection' : ' connections'));
        out.info = bits.join(' · ');
        var res = {};
        function got(key) { return function (e, d) { if (e) { failures++; lastErr = e; } else res[key] = d; if (!--left) assemble(); }; }
        api(c, 'get_live_categories', '', got('lc')); api(c, 'get_live_streams', '', got('ls'));
        api(c, 'get_vod_categories', '', got('vc')); api(c, 'get_vod_streams', '', got('vs'));
        api(c, 'get_series_categories', '', got('sc')); api(c, 'get_series', '', got('ss'));
        function assemble() {
          var any = res.ls instanceof Array || res.vs instanceof Array || res.ss instanceof Array;
          if (!any) return cb(lastErr || 'The server returned no content');
          var lc = catMap(res.lc), vc = catMap(res.vc), sc = catMap(res.sc), ext = c.ext || 'm3u8', base = c.server + '/';
          (res.ls instanceof Array ? res.ls : []).forEach(function (x) {
            var ch = { name: x.name, logo: x.stream_icon || '', group: lc[x.category_id] || 'Uncategorised', country: '', tvgId: '', epgKey: x.epg_channel_id || '', url: base + 'live/' + enc(c.username) + '/' + enc(c.password) + '/' + x.stream_id + '.' + ext };
            if (x.epg_channel_id) ch.tvgId = x.epg_channel_id;
            if (+x.tv_archive === 1) ch.catchup = { days: +x.tv_archive_duration || 3, id: x.stream_id };
            out.channels.push(ch);
          });
          (res.vs instanceof Array ? res.vs : []).forEach(function (x) {
            var r5 = parseFloat(x.rating_5based) * 2, rt = parseFloat(x.rating);
            out.movies.push({ title: cleanTitle(x.name), year: +x.year || yearOf(x.name) || yearOf(x.releaseDate), genres: vc[x.category_id] ? [vc[x.category_id]] : [], poster: x.stream_icon || '', rating: r5 || rt || 0, added: (+x.added || 0) * 1000, url: base + 'movie/' + enc(c.username) + '/' + enc(c.password) + '/' + x.stream_id + '.' + (x.container_extension || 'mp4') });
          });
          (res.ss instanceof Array ? res.ss : []).forEach(function (x) {
            var bd = x.backdrop_path; if (bd instanceof Array) bd = bd[0];
            var g = x.genre ? String(x.genre).split(/\s*[,\/]\s*/).filter(Boolean).slice(0, 3) : (sc[x.category_id] ? [sc[x.category_id]] : []);
            out.series.push({ title: cleanTitle(x.name), year: +yearOf(x.releaseDate || x.name) || 0, genres: g, poster: x.cover || '', backdrop: bd || '', plot: x.plot || '', rating: parseFloat(x.rating) || 0, added: (+x.last_modified || 0) * 1000, director: x.director || '', cast: x.cast ? String(x.cast).split(/\s*,\s*/).slice(0, 4) : [], lazy: { id: x.series_id } });
          });
          cb(null, out);
        }
      });
    },

    episodes: function (s, id, cb) {
      var c = s.cfg;
      api(c, 'get_series_info', '&series_id=' + enc(id), function (err, j) {
        if (err) return cb(err);
        var eps = [], map = (j && j.episodes) || {};
        for (var sn in map) (map[sn] instanceof Array ? map[sn] : []).forEach(function (e) {
          var info = e.info || {};
          eps.push({ season: +(e.season || sn) || 1, number: +e.episode_num || eps.length + 1, title: e.title && !/^S\d+E\d+/i.test(e.title) ? e.title.replace(/^.*?S\d+\s*E\d+\s*[-:.]?\s*/i, '') || e.title : '', plot: info.plot || '', duration: +info.duration_secs || 0, url: c.server + '/series/' + enc(c.username) + '/' + enc(c.password) + '/' + e.id + '.' + (e.container_extension || 'mp4') });
        });
        if (!eps.length) return cb('No episodes are available for this series');
        cb(null, eps);
      });
    },

    epg: function (s, data, cb) {
      var c = s.cfg, url = s.epgUrl || (c.server + '/xmltv.php?username=' + enc(c.username) + '&password=' + enc(c.password));
      SH.Xmltv.fetch(url, {}, cb);
    },

    /* /timeshift/user/pass/<minutes>/<YYYY-MM-DD:HH-MM>/<id>.m3u8, start in the server's local time */
    catchup: function (s, stream, p) {
      var c = s.cfg, d = new Date(p.s + (c.tzOffset || 0));
      var start = d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ':' + pad(d.getUTCHours()) + '-' + pad(d.getUTCMinutes());
      return c.server + '/timeshift/' + enc(c.username) + '/' + enc(c.password) + '/' + Math.ceil((p.e - p.s) / 60000) + '/' + start + '/' + stream.catchup.id + '.m3u8';
    }
  };
})();

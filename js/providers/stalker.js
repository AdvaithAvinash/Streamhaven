/* Stalker (Ministra) portal provider: live channels, movies (VOD), portal guide.
 * Portals identify the device by a MAC address sent in a Cookie header. Browsers refuse to let a page
 * set Cookie / User-Agent, so this provider only works where SH.hasNativeHttp() is true (Android).
 * Series (nested seasons) are not supported. */
(function () {
  'use strict';
  var SH = window.SH, P = SH.Providers;
  var UA = 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3';
  var sessions = {};          // portal+mac -> {token, ts}

  function apiBase(portal) {
    var u = String(portal || '').replace(/^\s+|\s+$/g, '');
    if (u && !/^[a-z]+:\/\//i.test(u)) u = 'http://' + u;
    u = u.replace(/[?#].*$/, '').replace(/\/(c|stalker_portal\/c|portal\.php|server\/load\.php)\/?$/i, function (m) { return /stalker_portal/i.test(m) ? '/stalker_portal' : ''; }).replace(/\/+$/, '');
    return u;
  }
  function normMac(m) {
    var h = String(m || '').toUpperCase().replace(/[^0-9A-F]/g, '');
    if (h.length !== 12) return '';
    return h.match(/.{2}/g).join(':');
  }
  function headers(c, token) {
    var h = { 'Cookie': 'mac=' + c.mac + '; stb_lang=en; timezone=Europe/London', 'User-Agent': UA, 'X-User-Agent': 'Model: MAG250; Link: WiFi', 'Accept': '*/*' };
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
  }
  function load(c, token, query, cb) {
    SH.http(c.portal + '/server/load.php?' + query + '&JsHttpRequest=1-xml', { headers: headers(c, token), timeout: 60000, json: false }, function (err, text) {
      if (err) return cb(err);
      var j; try { j = JSON.parse(text); } catch (e) { return cb('The portal did not answer like a Stalker portal'); }
      cb(null, j && j.js);
    });
  }
  function session(c, cb, fresh) {
    var key = c.portal + '|' + c.mac, ses = sessions[key];
    if (ses && !fresh && Date.now() - ses.ts < 600000) return cb(null, ses.token);
    if (!SH.hasNativeHttp()) return cb('This device cannot send the headers a Stalker portal needs. Stalker portals work in the Android app.');
    load(c, '', 'type=stb&action=handshake&token=', function (err, js) {
      if (err) return cb(err);
      var token = js && js.token;
      if (!token) return cb('The portal refused this MAC address');
      load(c, token, 'type=stb&action=get_profile&hd=1&ver=ImageDescription:%200.2.18-r14-pub-250;%20PORTAL%20version:%205.5.0;%20API%20Version:%20328&num_banks=2&sn=&stb_type=MAG250&client_type=STB&image_version=218&video_out=hdmi&auth_second_step=1&hw_version=1.7-BD-00&not_valid_token=0&api_signature=262', function (e2, prof) {
        if (e2) return cb(e2);
        sessions[key] = { token: token, ts: Date.now() };
        cb(null, token, prof);
      });
    });
  }
  function url(c, p) {
    if (!p) return '';
    if (/^https?:\/\//i.test(p)) return p;
    var origin = /^(https?:\/\/[^\/]+)/i.exec(c.portal)[1];
    return p.charAt(0) === '/' ? origin + p : c.portal + '/' + p;
  }
  function pageAll(c, token, query, onData, cb) {
    var page = 1, total = 0, got = 0;
    (function next() {
      load(c, token, query + '&p=' + page, function (err, js) {
        if (err) return cb(err);
        var data = (js && js.data) || [];
        total = +js.total_items || 0; got += data.length; onData(data);
        if (data.length && got < total && page < 400) { page++; next(); } else cb(null);
      });
    })();
  }

  P.stalker = {
    form: { fields: [
      { key: 'name', label: 'Name', placeholder: 'My portal' },
      { key: 'portal', label: 'Portal address', placeholder: 'http://host/c/', type: 'url' },
      { key: 'mac', label: 'MAC address', placeholder: '00:1A:79:00:00:00' }
    ], make: function (v, ex, cb) {
      var c = { portal: apiBase(v.portal || (ex && ex.cfg.portal)), mac: normMac(v.mac || (ex && ex.cfg.mac)) };
      if (!SH.validUrl(c.portal)) return cb('Enter the portal address, for example http://example.com/c/');
      if (!c.mac) return cb('Enter the 12-digit MAC address registered with your provider');
      session(c, function (err) { if (err) return cb(err); cb(null, { name: v.name || SH.hostOf(c.portal), cfg: c }); }, true);
    } },

    sync: function (s, cb) {
      var c = s.cfg, out = { channels: [], movies: [], series: [], info: 'MAC ' + c.mac };
      session(c, function (err, token) {
        if (err) return cb(err);
        load(c, token, 'type=itv&action=get_genres', function (e1, genres) {
          var gm = {}; (genres instanceof Array ? genres : []).forEach(function (g) { gm[g.id] = g.title; });
          load(c, token, 'type=itv&action=get_all_channels', function (e2, js) {
            if (e2) return cb(e2);
            ((js && js.data) || []).forEach(function (x) {
              if (!x.cmd) return;
              out.channels.push({ name: x.name, logo: url(c, x.logo ? (/^https?:|^\//.test(x.logo) ? x.logo : 'misc/logos/320/' + x.logo) : ''), group: gm[x.tv_genre_id] || 'Uncategorised', country: '', tvgId: '', epgKey: String(x.id), resolve: { t: 'itv', cmd: x.cmd }, catchup: null });
            });
            load(c, token, 'type=vod&action=get_categories', function (e3, cats) {
              var cm = {}; (cats instanceof Array ? cats : []).forEach(function (g) { cm[g.id] = g.title; });
              var ids = Object.keys(cm).filter(function (k) { return k !== '*'; }), i = 0;
              (function nextCat() {
                if (i >= ids.length || i >= 40) return cb(null, out);
                var cat = ids[i++];
                pageAll(c, token, 'type=vod&action=get_ordered_list&category=' + encodeURIComponent(cat) + '&sortby=added', function (data) {
                  data.forEach(function (x) {
                    if (!x.cmd || +x.is_series === 1) return;
                    out.movies.push({ title: x.name, year: +x.year || 0, genres: [cm[cat]], plot: x.description || '', poster: url(c, x.screenshot_uri), rating: parseFloat(x.rating_imdb) || 0, duration: (+x.time || 0) * 60, director: x.director || '', cast: x.actors ? String(x.actors).split(/\s*,\s*/).slice(0, 4) : [], added: Date.parse(x.added) || 0, resolve: { t: 'vod', cmd: x.cmd } });
                  });
                }, function () { nextCat(); });     // a failing category never fails the whole sync
              })();
            });
          });
        });
      });
    },

    epg: function (s, data, cb) {
      var c = s.cfg;
      session(c, function (err, token) {
        if (err) return cb(err);
        load(c, token, 'type=itv&action=get_epg_info&period=48', function (e, js) {
          if (e) return cb(e);
          var byId = {}, n = 0, d = (js && js.data) || {};
          for (var id in d) {
            var l = (d[id] || []).map(function (p) { return { s: +p.start_timestamp * 1000, e: +p.stop_timestamp * 1000, t: p.name, d: p.descr || '', c: p.category || '' }; }).filter(function (p) { return p.s && p.e > p.s && p.t; });
            if (l.length) { l.sort(function (a, b) { return a.s - b.s; }); byId[id] = l; n += l.length; }
          }
          cb(null, { byId: byId, names: {}, count: n });
        });
      });
    },

    /* create_link returns a short-lived address, so it is requested every time playback starts */
    resolve: function (s, stream, cb) {
      var c = s.cfg, r = stream.resolve;
      function attempt(fresh) {
        session(c, function (err, token) {
          if (err) return cb(err);
          load(c, token, 'type=' + r.t + '&action=create_link&cmd=' + encodeURIComponent(r.cmd) + '&series=&forced_storage=0&disable_ad=0&download=0', function (e, js) {
            var cmd = js && js.cmd, m = cmd && /(https?:\/\/\S+)/.exec(cmd);
            if (e || !m) { if (!fresh) return attempt(true); return cb(e || 'The portal did not provide a stream address'); }
            cb(null, m[1]);
          });
        }, fresh);
      }
      attempt(false);
    }
  };
})();

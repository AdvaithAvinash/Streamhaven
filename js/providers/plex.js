/* Plex: sign in with a plex.tv link code (no password on the TV), pick a server, read its
 * movie and show libraries. Playback uses the server's direct file URLs. */
(function () {
  'use strict';
  var SH = window.SH, P = SH.Providers;
  function tv() { return window.SH_PLEX_TV || 'https://plex.tv'; }
  function clientId() { var id = SH.ls.get('sh.clientid', null); if (!id) { id = 'sh-' + SH.uid() + SH.uid(); SH.ls.set('sh.clientid', id); } return id; }
  function enc(s) { return encodeURIComponent(s); }
  function hdrs(token) {
    var h = { 'Accept': 'application/json', 'X-Plex-Client-Identifier': clientId(), 'X-Plex-Product': 'Streamhaven', 'X-Plex-Version': SH.version, 'X-Plex-Platform': 'Web', 'X-Plex-Device': 'TV', 'X-Plex-Device-Name': 'Streamhaven' };
    if (token) h['X-Plex-Token'] = token; return h;
  }
  function srv(c, path, cb) {
    var url = c.server + path + (path.indexOf('?') < 0 ? '?' : '&') + 'X-Plex-Token=' + enc(c.serverToken);
    SH.getJson(url, { timeout: 60000, headers: { 'Accept': 'application/json' } }, function (err, j, info) {
      if (err && info && info.status === 401) err = 'Plex refused access. Edit this source and link your account again.';
      cb(err, j && j.MediaContainer);
    });
  }
  function art(c, p, w, h) { return p ? c.server + '/photo/:/transcode?width=' + w + '&height=' + h + '&minSize=1&upscale=1&url=' + enc(p) + '&X-Plex-Token=' + enc(c.serverToken) : ''; }
  function partUrl(c, m) { var part = m.Media && m.Media[0] && m.Media[0].Part && m.Media[0].Part[0]; return part ? c.server + part.key + '?X-Plex-Token=' + enc(c.serverToken) : ''; }
  function tags(l) { return (l || []).map(function (t) { return t.tag; }); }

  var Plex = P.plex = {
    /* Step 1: request a code. onCode(code) shows it; poll until the user links it. Returns {cancel}. */
    link: function (onCode, cb) {
      var cancelled = false, pin = null, timer = null;
      SH.getJson(tv() + '/api/v2/pins?strong=false', { method: 'POST', headers: hdrs(), timeout: 20000 }, function (err, j) {
        if (cancelled) return;
        if (err || !j || !j.code) return cb(err || 'Could not reach plex.tv');
        pin = j; onCode(j.code);
        var tries = 0;
        (function poll() {
          timer = setTimeout(function () {
            if (cancelled) return;
            SH.getJson(tv() + '/api/v2/pins/' + pin.id + '?code=' + enc(pin.code), { headers: hdrs(), timeout: 15000 }, function (e2, p2) {
              if (cancelled) return;
              if (p2 && p2.authToken) return cb(null, p2.authToken);
              if (++tries > 450 || (e2 && /not found/i.test(e2))) return cb('The code expired. Start again to get a new one.');
              poll();
            });
          }, 2000);
        })();
      });
      return { cancel: function () { cancelled = true; clearTimeout(timer); } };
    },
    /* Step 2: servers on the account */
    servers: function (token, cb) {
      SH.getJson(tv() + '/api/v2/resources?includeHttps=1&includeRelay=1&includeIPv6=0', { headers: hdrs(token), timeout: 25000 }, function (err, j) {
        if (err) return cb(err);
        var list = (j || []).filter(function (d) { return d.provides && d.provides.indexOf('server') >= 0 && d.connections && d.connections.length; })
          .map(function (d) { return { name: d.name, id: d.clientIdentifier, token: d.accessToken || token, owned: !!d.owned, connections: d.connections }; });
        if (!list.length) return cb('No Plex Media Server was found on this account');
        cb(null, list);
      });
    },
    /* Step 3: first connection that answers (direct before relay) */
    connect: function (server, cb) {
      var conns = server.connections.slice().sort(function (a, b) { return (a.relay ? 1 : 0) - (b.relay ? 1 : 0) || (b.local ? 1 : 0) - (a.local ? 1 : 0); }), i = 0;
      (function next() {
        if (i >= conns.length) return cb('Could not connect to ' + server.name + ' from this device');
        var uri = String(conns[i++].uri).replace(/\/+$/, '');
        SH.getJson(uri + '/identity?X-Plex-Token=' + enc(server.token), { timeout: 5000, headers: { 'Accept': 'application/json' } }, function (err) { if (err) next(); else cb(null, uri); });
      })();
    },

    sync: function (s, cb) {
      var c = s.cfg, out = { channels: [], movies: [], series: [], info: c.serverName ? 'Server: ' + c.serverName : '' };
      function run() {
        srv(c, '/library/sections', function (err, mc) {
          if (err) return cb(err);
          var secs = ((mc && mc.Directory) || []).filter(function (d) { return d.type === 'movie' || d.type === 'show'; }), i = 0;
          (function nextSec() {
            if (i >= secs.length) return cb(null, out);
            var sec = secs[i++], start = 0;
            (function page() {
              srv(c, '/library/sections/' + sec.key + '/all?X-Plex-Container-Start=' + start + '&X-Plex-Container-Size=400', function (e, m) {
                if (e) return cb(e);
                var items = (m && m.Metadata) || [];
                items.forEach(function (it) {
                  var base = { title: it.title, year: it.year || 0, genres: tags(it.Genre), plot: it.summary || '', rating: it.rating || it.audienceRating || 0, poster: art(c, it.thumb, 300, 450), backdrop: art(c, it.art, 1280, 720), added: (it.addedAt || 0) * 1000 };
                  if (sec.type === 'movie') { var u = partUrl(c, it); if (u) out.movies.push(SH.assign(base, { duration: Math.round((it.duration || 0) / 1000), director: tags(it.Director)[0] || '', cast: tags(it.Role).slice(0, 4), url: u })); }
                  else out.series.push(SH.assign(base, { cast: tags(it.Role).slice(0, 4), lazy: { id: it.ratingKey } }));
                });
                start += items.length;
                if (items.length && start < (m.totalSize || 0)) page(); else nextSec();
              });
            })();
          })();
        });
      }
      /* self-heal: the saved address may have changed (new IP, relay); look it up again from plex.tv */
      SH.getJson(c.server + '/identity?X-Plex-Token=' + enc(c.serverToken), { timeout: 6000, headers: { 'Accept': 'application/json' } }, function (err) {
        if (!err) return run();
        Plex.servers(c.token, function (e1, list) {
          if (e1) return cb('Could not reach your Plex server (' + e1 + ')');
          var me = list.filter(function (d) { return d.id === c.machineId; })[0];
          if (!me) return cb('Your Plex server is no longer on this account');
          Plex.connect(me, function (e2, uri) { if (e2) return cb(e2); c.server = uri; c.serverToken = me.token; run(); });
        });
      });
    },

    episodes: function (s, id, cb) {
      var c = s.cfg;
      srv(c, '/library/metadata/' + id + '/allLeaves', function (err, m) {
        if (err) return cb(err);
        var eps = [];
        ((m && m.Metadata) || []).forEach(function (e, i) {
          var u = partUrl(c, e); if (!u) return;
          eps.push({ season: e.parentIndex === undefined ? 1 : e.parentIndex, number: e.index || i + 1, title: e.title || '', plot: e.summary || '', duration: Math.round((e.duration || 0) / 1000), url: u });
        });
        if (!eps.length) return cb('No episodes are available for this series');
        cb(null, eps);
      });
    }
  };
})();

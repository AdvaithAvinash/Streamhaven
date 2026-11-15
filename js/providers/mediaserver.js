/* Jellyfin and Emby: the two servers share one API. The password is used once to obtain an access
 * token; only the token is stored. Libraries are read-only (no watch state is written back). */
(function () {
  'use strict';
  var SH = window.SH, P = SH.Providers;
  var FIELDS = 'Overview,Genres,ProductionYear,CommunityRating,People,DateCreated,RunTimeTicks';

  function clientId() { var id = SH.ls.get('sh.clientid', null); if (!id) { id = 'sh-' + SH.uid() + SH.uid(); SH.ls.set('sh.clientid', id); } return id; }
  function enc(s) { return encodeURIComponent(s); }
  function normServer(u) {
    u = String(u || '').replace(/^\s+|\s+$/g, ''); if (u && !/^[a-z]+:\/\//i.test(u)) u = 'http://' + u;
    return u.replace(/[?#].*$/, '').replace(/\/(web|web\/index\.html|emby|jellyfin)?\/?$/i, '').replace(/\/+$/, '');
  }
  function get(c, path, cb) {
    var sep = path.indexOf('?') < 0 ? '?' : '&';
    SH.getJson(c.server + path + sep + 'api_key=' + enc(c.token), { timeout: 60000 }, function (err, j, info) {
      if (err && info && info.status === 401) err = 'Sign-in expired. Edit this source and enter your password again.';
      cb(err, j);
    });
  }
  function authenticate(server, user, pass, cb) {
    var hdr = 'MediaBrowser Client="Streamhaven", Device="Streamhaven TV", DeviceId="' + clientId() + '", Version="' + SH.version + '"';
    SH.getJson(server + '/Users/AuthenticateByName', { method: 'POST', body: JSON.stringify({ Username: user, Pw: pass }), headers: { 'Content-Type': 'application/json', 'X-Emby-Authorization': hdr }, timeout: 20000 }, function (err, j, info) {
      if (err) return cb(info && (info.status === 401 || info.status === 403) ? 'Wrong username or password' : err);
      if (!j || !j.AccessToken || !j.User) return cb('The server did not return a sign-in token');
      cb(null, { server: server, token: j.AccessToken, userId: j.User.Id, user: j.User.Name || user });
    });
  }
  function img(c, id, type, tag, size) { return tag ? c.server + '/Items/' + id + '/Images/' + type + '?' + size + '&quality=85&tag=' + enc(tag) : ''; }
  function streamUrl(c, id) { return c.server + '/Videos/' + id + '/stream?Static=true&MediaSourceId=' + id + '&api_key=' + enc(c.token); }
  function people(it, type) { return (it.People || []).filter(function (p) { return p.Type === type; }).map(function (p) { return p.Name; }); }

  function pageItems(c, query, onItems, cb) {
    var start = 0, size = 300;
    (function next() {
      get(c, '/Users/' + c.userId + '/Items?Recursive=true&Fields=' + FIELDS + '&' + query + '&StartIndex=' + start + '&Limit=' + size, function (err, j) {
        if (err) return cb(err);
        var items = (j && j.Items) || []; onItems(items); start += items.length;
        if (items.length && start < (j.TotalRecordCount || 0)) next(); else cb(null);
      });
    })();
  }

  function make(label, defPort) {
    return {
      form: { fields: [
        { key: 'name', label: 'Name', placeholder: 'My ' + label },
        { key: 'server', label: 'Server address', placeholder: 'http://192.168.1.10:' + defPort, type: 'url' },
        { key: 'username', label: 'Username' },
        { key: 'password', label: 'Password', secret: true, hint: 'Used once to sign in. Streamhaven keeps only the access token.' }
      ], make: function (v, ex, cb) {
        var server = normServer(v.server || (ex && ex.cfg.server));
        if (!SH.validUrl(server)) return cb('Enter the server address, for example http://192.168.1.10:' + defPort);
        if (!v.username) return cb('Enter your ' + label + ' username');
        authenticate(server, v.username, v.password || '', function (err, c) { if (err) return cb(err); cb(null, { name: v.name || label + ' · ' + c.user, cfg: c }); });
      } },

      sync: function (s, cb) {
        var c = s.cfg, out = { channels: [], movies: [], series: [], info: c.user ? 'Signed in as ' + c.user : '' };
        pageItems(c, 'IncludeItemTypes=Movie', function (items) {
          items.forEach(function (it) {
            out.movies.push({ title: it.Name, year: it.ProductionYear || 0, genres: it.Genres || [], plot: it.Overview || '', rating: it.CommunityRating || 0, duration: it.RunTimeTicks ? Math.round(it.RunTimeTicks / 1e7) : 0,
              poster: img(c, it.Id, 'Primary', it.ImageTags && it.ImageTags.Primary, 'maxHeight=450'), backdrop: img(c, it.Id, 'Backdrop', it.BackdropImageTags && it.BackdropImageTags[0], 'maxWidth=1280'),
              director: people(it, 'Director')[0] || '', cast: people(it, 'Actor').slice(0, 4), added: Date.parse(it.DateCreated) || 0, url: streamUrl(c, it.Id) });
          });
        }, function (err) {
          if (err) return cb(err);
          pageItems(c, 'IncludeItemTypes=Series', function (items) {
            items.forEach(function (it) {
              out.series.push({ title: it.Name, year: it.ProductionYear || 0, genres: it.Genres || [], plot: it.Overview || '', rating: it.CommunityRating || 0,
                poster: img(c, it.Id, 'Primary', it.ImageTags && it.ImageTags.Primary, 'maxHeight=450'), backdrop: img(c, it.Id, 'Backdrop', it.BackdropImageTags && it.BackdropImageTags[0], 'maxWidth=1280'),
                director: '', cast: people(it, 'Actor').slice(0, 4), added: Date.parse(it.DateCreated) || 0, lazy: { id: it.Id } });
            });
          }, function (e2) { if (e2) return cb(e2); cb(null, out); });
        });
      },

      episodes: function (s, id, cb) {
        var c = s.cfg;
        get(c, '/Shows/' + id + '/Episodes?UserId=' + c.userId + '&Fields=Overview', function (err, j) {
          if (err) return cb(err);
          var eps = ((j && j.Items) || []).map(function (e, i) {
            return { season: e.ParentIndexNumber === undefined ? 1 : e.ParentIndexNumber, number: e.IndexNumber || i + 1, title: e.Name || '', plot: e.Overview || '', duration: e.RunTimeTicks ? Math.round(e.RunTimeTicks / 1e7) : 0, url: streamUrl(c, e.Id) };
          });
          if (!eps.length) return cb('No episodes are available for this series');
          cb(null, eps);
        });
      }
    };
  }
  P.jellyfin = make('Jellyfin', 8096);
  P.emby = make('Emby', 8096);
})();

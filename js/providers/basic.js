/* Built-in providers: M3U, direct URL, XMLTV-only guide, demo library. */
(function () {
  'use strict';
  var SH = window.SH, P = SH.Providers;
  function validUrl(u) { return /^https?:\/\/[^\s\/]+\S*$/i.test(u); }
  SH.validUrl = validUrl;

  P.m3u = {
    form: { fields: [
      { key: 'name', label: 'Name', placeholder: 'My playlist' },
      { key: 'url', label: 'Playlist address', placeholder: 'https://', type: 'url' },
      { key: 'epgUrl', label: 'Guide address (optional)', placeholder: 'https://… .xml or .xml.gz', type: 'url', hint: 'Leave empty to use the guide address inside the playlist, if it has one.' }
    ], make: function (v, ex, cb) {
      if (!validUrl(v.url)) return cb('Enter a full address starting with http:// or https://');
      if (v.epgUrl && !validUrl(v.epgUrl)) return cb('The guide address must start with http:// or https://');
      cb(null, { name: v.name || SH.hostOf(v.url), url: v.url, epgUrl: v.epgUrl });
    } },
    sync: function (s, cb) {
      SH.http(s.url, { timeout: 60000 }, function (err, text) {
        if (err) return cb(err);
        var data; try { data = SH.M3U.parse(text); } catch (e) { return cb(e); }
        if (!data.channels.length && !data.movies.length && !data.series.length) return cb('The playlist is empty');
        cb(null, data);
      });
    },
    epg: function (s, data, cb) {
      var url = s.epgUrl || data.epgUrl; if (!url) return cb(null, null);
      SH.Xmltv.fetch(url, {}, cb);
    }
  };

  P.direct = {
    form: { fields: [{ key: 'name', label: 'Name', placeholder: 'My stream' }, { key: 'url', label: 'Stream address', placeholder: 'https://', type: 'url' }],
      make: function (v, ex, cb) { if (!validUrl(v.url) && !/^(rtmp|rtsp|udp|rtp):\/\//i.test(v.url)) return cb('Enter a full stream address, for example https://…'); cb(null, { name: v.name || SH.hostOf(v.url) || 'Stream', url: v.url }); } },
    sync: function (s, cb) {
      var d = { channels: [], movies: [], series: [] };
      if (SH.M3U.isVod(s.url)) d.movies.push({ title: s.name, url: s.url, genres: [], added: Date.now() });
      else d.channels.push({ name: s.name, url: s.url, group: 'Direct streams', logo: '', country: '', tvgId: '' });
      setTimeout(function () { cb(null, d); }, 0);
    }
  };

  P.xmltv = {
    form: { fields: [{ key: 'name', label: 'Name', placeholder: 'Programme guide' }, { key: 'url', label: 'Guide address', placeholder: 'https://… .xml or .xml.gz', type: 'url' }],
      make: function (v, ex, cb) { if (!validUrl(v.url)) return cb('Enter a full address starting with http:// or https://'); cb(null, { name: v.name || SH.hostOf(v.url), url: v.url }); } },
    sync: function (s, cb) {
      SH.Xmltv.fetch(s.url, {}, function (err, g) {
        if (err) return cb(err);
        if (!g.count) return cb('The guide has no programmes for the next two days');
        cb(null, { channels: [], movies: [], series: [], epg: g, info: g.count + ' programmes for ' + Object.keys(g.byId).length + ' channels' });
      });
    }
  };

  P.demo = { sync: function (s, cb) { setTimeout(function () { cb(null, SH.Demo.build()); }, 0); } };
})();

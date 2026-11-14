/* M3U / M3U8 playlist parser. Classifies entries into live channels, movies and series episodes. */
(function () {
  'use strict';
  var SH = window.SH;
  var VOD_EXT = /\.(mp4|mkv|avi|mov|wmv|flv|m4v|mpg|mpeg)$/i;
  var EP_RE = /^(.*?)[\s._\-]*S(\d{1,2})[\s._\-]*E(\d{1,3})\b(.*)$/i;

  function path(url) { return String(url).split('?')[0].split('#')[0]; }
  function trim(s) { return String(s || '').replace(/^\s+|\s+$/g, ''); }

  SH.M3U = {
    isVod: function (url) { var p = path(url); return VOD_EXT.test(p) || /\/(movie|series)\//i.test(p); },
    format: function (url) {
      var p = path(url).toLowerCase();
      if (/\.m3u8$/.test(p)) return 'HLS'; if (/\.mpd$/.test(p)) return 'MPEG-DASH'; if (/\.ts$/.test(p)) return 'MPEG-TS';
      if (/\.mp4$|\.m4v$/.test(p)) return 'MP4'; if (/\.mkv$/.test(p)) return 'Matroska'; if (/\.ism/.test(p)) return 'Smooth Streaming';
      return 'Unknown';
    },
    parse: function (text) {
      var out = { channels: [], movies: [], series: [], epgUrl: '' };
      var lines = String(text).split(/\r?\n/), info = null, grp = '', seriesMap = {}, now = Date.now();
      if (!/#EXTM3U|#EXTINF/i.test(text.slice(0, 4096))) throw new Error('This does not look like an M3U playlist');
      for (var i = 0; i < lines.length; i++) {
        var line = trim(lines[i]);
        if (!line) continue;
        if (line.charAt(0) === '#') {
          if (line.indexOf('#EXTINF') === 0) {
            var attrs = {}, rest = line.replace(/([\w-]+)="([^"]*)"/g, function (m, k, v) { attrs[k.toLowerCase()] = v; return ''; });
            var ci = rest.indexOf(',');
            info = { attrs: attrs, name: trim(ci >= 0 ? rest.slice(ci + 1) : '') || attrs['tvg-name'] || '' };
          } else if (line.indexOf('#EXTGRP:') === 0) grp = trim(line.slice(8));
          else if (line.indexOf('#EXTM3U') === 0) { var m = /(?:url-tvg|x-tvg-url)="([^"]+)"/i.exec(line); if (m) out.epgUrl = m[1].split(',')[0]; }
          continue;
        }
        if (!/^[a-z][a-z0-9+.\-]*:\/\//i.test(line)) { info = null; continue; }
        var a = (info && info.attrs) || {}, name = (info && info.name) || 'Untitled', group = a['group-title'] || grp || '';
        if (SH.M3U.isVod(line)) {
          var ep = EP_RE.exec(name);
          if (ep || /\/series\//i.test(path(line))) {
            var st = trim(ep ? ep[1] : name) || name, key = SH.norm(st), sr = seriesMap[key];
            if (!sr) { sr = seriesMap[key] = { title: st, poster: a['tvg-logo'] || '', genres: group ? [group] : [], episodes: [], added: now - i }; out.series.push(sr); }
            sr.episodes.push({ season: ep ? +ep[2] : 1, number: ep ? +ep[3] : sr.episodes.length + 1, title: trim(ep && ep[4].replace(/^[\s\-:.]+/, '')) || '', url: line });
          } else {
            var y = /\((\d{4})\)\s*$/.exec(name);
            out.movies.push({ title: trim(y ? name.slice(0, y.index) : name), year: y ? +y[1] : 0, poster: a['tvg-logo'] || '', genres: group ? [group] : [], url: line, added: now - i });
          }
        } else {
          out.channels.push({ name: name, logo: a['tvg-logo'] || '', group: group, country: (a['tvg-country'] || '').toUpperCase(), tvgId: a['tvg-id'] || '', url: line });
        }
        info = null; grp = '';
      }
      return out;
    }
  };
})();

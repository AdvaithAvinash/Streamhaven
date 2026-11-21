/* Live sports from the Matchora public API (https://matchora.to).
 *   GET /api/v1/live               {count, events: [event]}
 *   GET /api/v1/schedule           {count, events: [event]}   ?date=YYYY-MM-DD  ?watchable=1  ?live=1
 *   GET /api/v1/events/{id}        event (no wrapper)         HTTP 502 {"error": "...unknown fixture"} when the id is not listed
 * event: {id (string), home, away ("" for single-title events), league, sport, watching, home_badge, away_badge,
 *         league_badge, kickoff (unix seconds), status ("LIVE" "1H" "NS" "FT" ""), minute ("28" | null), score ("0-0" | null),
 *         live, finished, channel_count, channels: [channel], page_url, embed_url}
 * channel: {id (string), name, country (flag emoji), quality, lang, watching, playing, dead, embed_url}
 * Shapes verified against live responses on 2026-11-21 (see tools/fixtures/matchora).
 * The API exposes no stream addresses: playback is Matchora's own embed (iframe, with advertising). */
(function () {
  'use strict';
  var SH = window.SH;
  var cache = {};
  var EMBED_HOST = /(^|\.)matchora\.(pro|to)$/i;

  function s(v) { return v === undefined || v === null ? '' : String(v); }

  /* Only ever load Matchora's own pages in the embedded frame, whatever the API says. */
  function safeEmbed(url, fallback) { return url && /^https:\/\//i.test(url) && EMBED_HOST.test(SH.hostOf(url)) ? url : fallback; }

  function normChannel(c, base) {
    if (!c || typeof c !== 'object' || c.id === undefined || c.id === null) return null;
    return { id: s(c.id), name: s(c.name) || 'Channel ' + c.id, lang: s(c.lang), quality: s(c.quality), watching: +c.watching || 0, playing: c.playing === true, dead: c.dead === true,
      embedUrl: safeEmbed(c.embed_url, base + '/embed/channel/' + encodeURIComponent(c.id)) };
  }
  function normalize(o) {
    if (!o || typeof o !== 'object' || o.id === undefined || o.id === null) return null;
    var base = SH.Sports.base, id = s(o.id), home = s(o.home), away = s(o.away), raw = s(o.status).toUpperCase();
    var status = o.live === true || /^(LIVE|1H|2H|HT|ET|BT|P|INT)$/.test(raw) ? 'live' : (o.finished === true || /^(FT|AET|PEN)$/.test(raw) ? 'finished' : 'upcoming');
    var channels = (o.channels instanceof Array ? o.channels : []).map(function (c) { return normChannel(c, base); }).filter(function (c) { return c && !c.dead; });
    channels.sort(function (a, b) { return (b.playing ? 1 : 0) - (a.playing ? 1 : 0) || b.watching - a.watching; });
    var m = /^\s*(\d+)\s*[-:]\s*(\d+)\s*$/.exec(s(o.score));
    return { id: id, home: home, away: away, title: home && away ? home + ' vs ' + away : (home || away || 'Match ' + id), league: s(o.league), sport: s(o.sport),
      start: (+o.kickoff || 0) < 1e11 ? (+o.kickoff || 0) * 1000 : +o.kickoff, status: status, rawStatus: raw, minute: s(o.minute).replace(/'+$/, ''),
      score: m ? m[1] + ' – ' + m[2] : '', watching: +o.watching || 0, homeBadge: s(o.home_badge), awayBadge: s(o.away_badge),
      channels: channels, channelCount: channels.length,
      embedUrl: safeEmbed(o.embed_url, base + '/embed/match/' + encodeURIComponent(id)) };
  }

  function get(path, ttl, cb, fresh) {
    var hit = cache[path];
    if (hit && !fresh && Date.now() - hit.t < ttl) return cb(null, hit.v);
    SH.getJson(SH.Sports.base + path, { timeout: 20000 }, function (err, j, info) {
      if (err) {
        var st = info && info.status;
        if (st === 429) err = 'Matchora is limiting requests from this connection. Try again in a minute.';
        else if (/\/events\//.test(path) && (st === 502 || st === 404)) err = 'Matchora no longer lists this match.';
        else if (st >= 500) err = 'Matchora is having problems right now (' + st + ').';
        return cb(hit && !fresh ? null : err, hit && hit.v);        // stale data beats an error screen, except when the user asked for a refresh
      }
      cache[path] = { t: Date.now(), v: j }; cb(null, j);
    });
  }
  function dayStr(d) { return d.getFullYear() + '-' + SH.pad2(d.getMonth() + 1) + '-' + SH.pad2(d.getDate()); }

  SH.Sports = {
    base: 'https://matchora.to', normalize: normalize, dayStr: dayStr,
    /* opts: {mode: 'live' | 'date', date: 'YYYY-MM-DD', watchable: bool, fresh: bool} */
    matches: function (opts, cb) {
      var path = opts.mode === 'live' ? '/api/v1/live' : '/api/v1/schedule?date=' + encodeURIComponent(opts.date) + (opts.watchable ? '&watchable=1' : '');
      get(path, opts.mode === 'live' ? 45000 : 300000, function (err, j) {
        if (err) return cb(err);
        var arr = j && j.events;
        if (!(arr instanceof Array)) return cb('Matchora answered in a format Streamhaven does not recognise.');
        var out = [];
        arr.forEach(function (o) { var m = normalize(o); if (m) out.push(m); });
        if (opts.mode !== 'live' && opts.watchable) out = out.filter(function (m) { return m.channelCount > 0; });
        var rank = { live: 0, upcoming: 1, finished: 2 };
        out.sort(function (a, b) { return rank[a.status] - rank[b.status] || (a.status === 'finished' ? b.start - a.start : a.start - b.start) || b.watching - a.watching; });
        cb(null, out);
      }, opts.fresh);
    },
    /* Fresh channel list for one match (list responses already carry channels; this only refreshes them). */
    event: function (id, cb) {
      get('/api/v1/events/' + encodeURIComponent(id), 120000, function (err, j) {
        if (err) return cb(err);
        var m = normalize(j); if (!m) return cb('Matchora answered in a format Streamhaven does not recognise.');
        cb(null, m);
      });
    },

    /* The same channel in the user's own sources (ad-free, uses the normal player). */
    local: function (name) {
      function clean(n) { return SH.norm(n).replace(/\b(hd|fhd|uhd|sd|4k|hevc|\d{3,4}p?)\b/g, '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, ''); }
      var q = clean(name); if (q.length < 3) return null;
      var C = SH.Catalog.channels, i, partial = null;
      for (i = 0; i < C.length; i++) { var n = clean(C[i].name); if (n === q) return C[i]; if (!partial && q.length >= 6 && n.length >= 6 && (n.indexOf(q) >= 0 || q.indexOf(n) >= 0)) partial = C[i]; }
      return partial;
    },
    when: function (m) {
      if (m.status === 'live') return 'LIVE' + (m.minute ? ' ' + m.minute + '′' : '');
      if (m.status === 'finished') return 'Full time';
      return m.start ? SH.fmt.day(m.start) + ' · ' + SH.fmt.time(m.start) : 'Time to be confirmed';
    }
  };
})();

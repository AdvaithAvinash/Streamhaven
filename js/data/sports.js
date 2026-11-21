/* Live sports from the Matchora public API (https://matchora.to).
 *   GET /api/v1/live            live matches and current minute
 *   GET /api/v1/schedule        fixtures (?date=YYYY-MM-DD, ?watchable=1, ?live=1)
 *   GET /api/v1/events/{id}     match details and channels
 *   GET /api/v1/channels        indexed channels
 * The API exposes no stream URLs: playback is Matchora's own embed (iframe, with advertising).
 * Because the response shape is not documented here, ALL field mapping lives in normalize() below. */
(function () {
  'use strict';
  var SH = window.SH;
  var BASE = 'https://matchora.to';
  var cache = {};

  function pick(o, keys) { for (var i = 0; i < keys.length; i++) { var v = o[keys[i]]; if (v !== undefined && v !== null && v !== '') return v; } return undefined; }
  function str(v) { if (v === undefined || v === null) return ''; if (typeof v === 'object') return str(pick(v, ['name', 'title', 'short_name', 'shortName', 'label'])); return String(v); }
  function toMs(v) {
    if (v === undefined || v === null || v === '') return 0;
    if (typeof v === 'number' || /^\d+$/.test(String(v))) { var n = +v; return n < 1e11 ? n * 1000 : n; }       // seconds or milliseconds
    var s = String(v).replace(/^\s+|\s+$/g, ''), m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/.exec(s);
    if (!m) { var t = Date.parse(s); return isNaN(t) ? 0 : t; }
    var ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));         // no zone given: treated as UTC
    if (m[7] && m[7] !== 'Z') { var z = /([+-])(\d{2}):?(\d{2})/.exec(m[7]); ms -= (z[1] === '-' ? -1 : 1) * (+z[2] * 60 + +z[3]) * 60000; }
    return ms;
  }
  function list(j) {
    if (j instanceof Array) return j;
    if (!j || typeof j !== 'object') return [];
    var keys = ['data', 'matches', 'events', 'results', 'items', 'schedule', 'live', 'channels', 'fixtures'], i, k;
    for (i = 0; i < keys.length; i++) { k = j[keys[i]]; if (k instanceof Array) return k; if (k && typeof k === 'object') { var inner = list(k); if (inner.length) return inner; } }
    var out = [];                                  // grouped by date or league: { "2026-11-21": [...] }
    for (k in j) if (j.hasOwnProperty(k) && j[k] instanceof Array) out = out.concat(j[k]);
    return out;
  }
  function normChannel(c) {
    if (c === null || c === undefined) return null;
    if (typeof c !== 'object') return { id: String(c), name: 'Channel ' + c };
    var id = pick(c, ['id', 'channel_id', 'channelId', 'slug']);
    return id === undefined ? null : { id: String(id), name: str(pick(c, ['name', 'title', 'channel', 'channel_name'])) || 'Channel ' + id, logo: str(pick(c, ['logo', 'icon', 'image'])), lang: str(pick(c, ['language', 'lang', 'country'])) };
  }
  function normalize(o) {
    if (!o || typeof o !== 'object') return null;
    var id = pick(o, ['id', 'event_id', 'eventId', 'match_id', 'matchId']);
    if (id === undefined) return null;
    var home = str(pick(o, ['home', 'home_team', 'homeTeam', 'team1', 'team_home'])), away = str(pick(o, ['away', 'away_team', 'awayTeam', 'team2', 'team_away']));
    var title = str(pick(o, ['title', 'name', 'match', 'event'])) || (home && away ? home + ' vs ' + away : 'Match ' + id);
    if (!home && !away) { var p = title.split(/\s+(?:vs\.?|v|-|–)\s+/i); if (p.length === 2) { home = p[0]; away = p[1]; } }
    var rawStatus = str(pick(o, ['status', 'state', 'match_status', 'phase'])).toLowerCase(), liveFlag = pick(o, ['is_live', 'isLive', 'live']);
    var status = (liveFlag === true || liveFlag === 1 || liveFlag === '1' || /^(live|inplay|in_play|in-play|playing|1h|2h|ht|et|started)/.test(rawStatus)) ? 'live'
      : (/^(ft|finished|ended|full|final|complete|after)/.test(rawStatus) ? 'finished' : 'upcoming');
    var minute = pick(o, ['minute', 'current_minute', 'currentMinute', 'elapsed', 'time_elapsed', 'match_minute']);
    var hs = pick(o, ['home_score', 'homeScore', 'score_home']), as = pick(o, ['away_score', 'awayScore', 'score_away']), sc = pick(o, ['score', 'result']), score = '';
    if (hs !== undefined && as !== undefined) score = hs + ' – ' + as;
    else if (sc && typeof sc === 'object') { var a = pick(sc, ['home', 'h']), b = pick(sc, ['away', 'a']); if (a !== undefined && b !== undefined) score = a + ' – ' + b; }
    else if (sc) score = String(sc).replace(/\s*[-:]\s*/, ' – ');
    var chRaw = pick(o, ['channels', 'streams', 'sources']), channels = (chRaw instanceof Array ? chRaw : []).map(normChannel).filter(Boolean);
    var count = pick(o, ['channel_count', 'channelCount', 'channels_count']);
    var wat = pick(o, ['watchable', 'has_channels', 'hasChannels']);
    return { id: String(id), title: title, home: home, away: away, league: str(pick(o, ['league', 'competition', 'tournament', 'league_name', 'category'])), country: str(pick(o, ['country', 'region'])),
      start: toMs(pick(o, ['start', 'start_time', 'startTime', 'kickoff', 'kick_off', 'starts_at', 'date', 'time', 'timestamp'])), status: status, rawStatus: rawStatus, minute: minute === undefined ? '' : String(minute).replace(/'+$/, ''),
      score: score, channels: channels, channelCount: channels.length || (count !== undefined ? +count || 0 : 0), watchable: wat === undefined ? (channels.length > 0 || (+count || 0) > 0) : !!wat && wat !== '0' };
  }

  function get(path, ttl, cb, fresh) {
    var hit = cache[path];
    if (hit && !fresh && Date.now() - hit.t < ttl) return cb(null, hit.v);
    SH.getJson(SH.Sports.base + path, { timeout: 20000 }, function (err, j, info) {
      if (err) {
        if (info && info.status === 429) err = 'Matchora is limiting requests from this connection. Try again in a minute.';
        else if (info && info.status >= 500) err = 'Matchora is having problems right now (' + info.status + ').';
        return cb(hit && !fresh ? null : err, hit && hit.v);        // stale data beats an error screen, except when the user asked for a refresh
      }
      cache[path] = { t: Date.now(), v: j }; cb(null, j);
    });
  }
  function dayStr(d) { return d.getFullYear() + '-' + SH.pad2(d.getMonth() + 1) + '-' + SH.pad2(d.getDate()); }

  SH.Sports = {
    base: BASE, normalize: normalize, list: list, dayStr: dayStr,
    /* mode: 'live' | 'date'; opts: {date: 'YYYY-MM-DD', watchable: bool} */
    matches: function (opts, cb) {
      var path = opts.mode === 'live' ? '/api/v1/live' : '/api/v1/schedule?date=' + encodeURIComponent(opts.date) + (opts.watchable ? '&watchable=1' : '');
      get(path, opts.mode === 'live' ? 45000 : 300000, function (err, j) {
        if (err) return cb(err);
        var arr = list(j), out = [];
        arr.forEach(function (o) { var m = normalize(o); if (m) out.push(m); });
        if (!out.length && arr.length) return cb('Matchora answered in a format Streamhaven does not recognise yet.');
        if (opts.mode === 'live') out = out.filter(function (m) { return m.status === 'live'; }).concat(out.filter(function (m) { return m.status !== 'live'; }));
        else if (opts.watchable) out = out.filter(function (m) { return m.watchable; });
        out.sort(function (a, b) { return (a.status === 'live' ? 0 : 1) - (b.status === 'live' ? 0 : 1) || a.start - b.start; });
        cb(null, out);
      }, opts.fresh);
    },
    event: function (id, cb) {
      get('/api/v1/events/' + encodeURIComponent(id), 120000, function (err, j) {
        if (err) return cb(err);
        var o = j && !(j instanceof Array) && typeof j === 'object' ? (j.data && typeof j.data === 'object' && !(j.data instanceof Array) ? j.data : (j.event && typeof j.event === 'object' ? j.event : (j.match && typeof j.match === 'object' ? j.match : j))) : null;
        var m = normalize(o); if (!m) return cb('Matchora answered in a format Streamhaven does not recognise yet.');
        cb(null, m);
      });
    },
    embedMatch: function (id) { return SH.Sports.base + '/embed/match/' + encodeURIComponent(id); },
    embedChannel: function (id) { return SH.Sports.base + '/embed/channel/' + encodeURIComponent(id); },

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

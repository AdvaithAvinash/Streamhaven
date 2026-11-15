/* Smart Source Intelligence: per-stream diagnostics gathered ONLY from real playback attempts.
 * A URL that merely responds is never reported as healthy. */
(function () {
  'use strict';
  var SH = window.SH;
  var db = SH.ls.get('sh.health', {});
  var save = SH.debounce(function () {
    var keys = Object.keys(db);
    if (keys.length > 600) { keys.sort(function (a, b) { return (db[a].ts || 0) - (db[b].ts || 0); }); for (var i = 0; i < keys.length - 500; i++) delete db[keys[i]]; }
    SH.ls.set('sh.health', db);
  }, 1000);
  function key(url) { return SH.hash(url).toString(36); }
  function rec(url) { var k = key(url); return db[k] || (db[k] = { ok: 0, fail: 0, buf: 0, start: 0, lastOk: 0, lastFail: 0, err: '', ts: 0, last: '' }); }

  var H = SH.Health = {
    LABEL: { healthy: 'Healthy', slow: 'Slow', down: 'Unavailable', untested: 'Not tested' },
    get: function (url) { return db[key(url)] || null; },
    ok: function (url, startupMs) { var r = rec(url); r.ok++; r.start = startupMs; r.lastOk = r.ts = Date.now(); r.last = 'ok'; r.sbuf = 0; save(); SH.Bus.emit('health', url); },
    fail: function (url, reason) { var r = rec(url); r.fail++; r.lastFail = r.ts = Date.now(); r.last = 'fail'; r.err = String(reason || ''); save(); SH.Bus.emit('health', url); },
    buffer: function (url) { var r = rec(url); r.buf++; r.sbuf = (r.sbuf || 0) + 1; r.ts = Date.now(); save(); SH.Bus.emit('health', url); },
    statusOf: function (url) {
      var r = db[key(url)];
      if (!r || (!r.ok && !r.fail)) return 'untested';
      if (r.last === 'fail') return 'down';
      if (r.start > 5000 || (r.sbuf || 0) >= 3) return 'slow';
      return 'healthy';
    },
    status: function (item, idx) { var s = item.streams && item.streams[idx || 0]; return s ? H.statusOf(s.url) : 'untested'; },
    clear: function () { db = {}; SH.ls.del('sh.health'); SH.Bus.emit('health'); }
  };
})();

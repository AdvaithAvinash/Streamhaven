/* Programme guide store. Programmes: {s: startMs, e: endMs, t: title, d: description, c: category}. */
(function () {
  'use strict';
  var SH = window.SH, data = {};
  function find(list, ts) {            // binary search for the programme covering ts
    var lo = 0, hi = list.length - 1;
    while (lo <= hi) { var mid = (lo + hi) >> 1, p = list[mid]; if (ts < p.s) hi = mid - 1; else if (ts >= p.e) lo = mid + 1; else return mid; }
    return -1;
  }
  SH.Epg = {
    reset: function () { data = {}; },
    set: function (chId, list) { if (list && list.length) data[chId] = list; },
    has: function (ch) { return !!data[ch.id]; },
    at: function (ch, ts) { var l = data[ch.id]; if (!l) return null; var i = find(l, ts); return i < 0 ? null : l[i]; },
    now: function (ch) { return SH.Epg.at(ch, Date.now()); },
    next: function (ch) { var p = SH.Epg.now(ch); return p ? SH.Epg.at(ch, p.e + 1000) : null; },
    range: function (ch, a, b) { var l = data[ch.id], out = []; if (!l) return out; for (var i = 0; i < l.length; i++) { if (l[i].e <= a) continue; if (l[i].s >= b) break; out.push(l[i]); } return out; },
    bounds: function () { var a = 0, b = 0; for (var k in data) { var l = data[k]; if (!a || l[0].s < a) a = l[0].s; if (l[l.length - 1].e > b) b = l[l.length - 1].e; } return a ? { start: a, end: b } : null; },
    progress: function (p) { return p ? SH.clamp((Date.now() - p.s) / (p.e - p.s), 0, 1) : 0; },
    search: function (channels, tokens, limit) {
      var out = [], now = Date.now();
      for (var i = 0; i < channels.length && out.length < limit; i++) {
        var l = data[channels[i].id]; if (!l) continue;
        for (var j = 0; j < l.length && out.length < limit; j++) {
          var p = l[j]; if (p.e < now) continue;
          var n = SH.norm(p.t), ok = true;
          for (var k = 0; k < tokens.length; k++) if (n.indexOf(tokens[k]) < 0) { ok = false; break; }
          if (ok) out.push({ ch: channels[i], p: p });
        }
      }
      out.sort(function (x, y) { return x.p.s - y.p.s; });
      return out;
    }
  };
})();

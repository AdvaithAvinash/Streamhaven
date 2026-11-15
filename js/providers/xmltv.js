/* XMLTV guide importer. Scans with indexOf (no DOM, no giant regex), keeps only the time window
 * the app can show, and yields to the UI every ~120 ms so a 50 MB guide never freezes the TV. */
(function () {
  'use strict';
  var SH = window.SH;

  function decode(s) {
    return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')
      .replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(+d); })
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
      .replace(/^\s+|\s+$/g, '');
  }
  function parseTime(t) {
    var m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-])?(\d{2})?(\d{2})?/.exec(t || '');
    if (!m) return 0;
    var ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    if (m[7]) ms -= (m[7] === '-' ? -1 : 1) * ((+m[8] || 0) * 60 + (+m[9] || 0)) * 60000;
    return ms;
  }
  function attr(tag, name) { var m = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')').exec(tag); return m ? (m[1] !== undefined ? m[1] : m[2]) : ''; }
  function inner(body, tag) {
    var i = body.indexOf('<' + tag); if (i < 0) return '';
    var j = body.indexOf('>', i); if (j < 0) return '';
    var k = body.indexOf('</' + tag + '>', j); return k < 0 ? '' : body.slice(j + 1, k);
  }

  /* text -> {byId: {id: [prog]}, names: {normName: id}, count} */
  SH.Xmltv = {
    parse: function (text, win, cb) {
      var res = { byId: {}, names: {}, count: 0 }, pos = 0, phase = 0, started = Date.now();
      if (text.indexOf('<tv') < 0) return cb('This does not look like an XMLTV guide');
      function slice() {
        var t0 = Date.now();
        while (Date.now() - t0 < 120) {
          var i = text.indexOf(phase === 0 ? '<channel' : '<programme', pos);
          if (phase === 0 && (i < 0 || (res.firstProg !== undefined && i > res.firstProg))) { phase = 1; pos = 0; continue; }
          if (i < 0) return cb(null, res);
          var j = text.indexOf('>', i); if (j < 0) return cb(null, res);
          var open = text.slice(i + 1, j), selfClose = text.charAt(j - 1) === '/';
          var end = selfClose ? j + 1 : text.indexOf(phase === 0 ? '</channel>' : '</programme>', j);
          if (end < 0) return cb(null, res);
          if (phase === 0) {
            var id = attr(open, 'id');
            if (id && !selfClose) {
              var body = text.slice(j + 1, end), re = /<display-name[^>]*>([\s\S]*?)<\/display-name>/g, m;
              while ((m = re.exec(body))) { var nn = SH.norm(decode(m[1])); if (nn && !res.names[nn]) res.names[nn] = id; }
            }
            pos = end + 1;
          } else {
            var s = parseTime(attr(open, 'start')), e = parseTime(attr(open, 'stop')), cid = attr(open, 'channel');
            pos = (selfClose ? end : end + 12);
            if (s && cid && (!e || e > s) && (!win || (s < win.to && (e || s + 3600000) > win.from))) {
              var b = text.slice(j + 1, end), title = decode(inner(b, 'title'));
              if (title) {
                (res.byId[cid] = res.byId[cid] || []).push({ s: s, e: e || s + 3600000, t: title, d: decode(inner(b, 'desc')), c: decode(inner(b, 'category')) });
                res.count++;
              }
            }
          }
        }
        setTimeout(slice, 0);
      }
      var fp = text.indexOf('<programme'); res.firstProg = fp < 0 ? undefined : fp;
      slice();
    },
    finish: function (res) {
      for (var id in res.byId) { var l = res.byId[id]; l.sort(function (a, b) { return a.s - b.s; }); var out = []; for (var i = 0; i < l.length; i++) if (!out.length || l[i].s >= out[out.length - 1].e - 1000) out.push(l[i]); res.byId[id] = out; }
      delete res.firstProg; return res;
    },
    window: function () { var now = Date.now(); return { from: now - 24 * 3600000, to: now + 50 * 3600000 }; },
    /* fetch (.xml or .xml.gz), decompress, parse */
    fetch: function (url, opts, cb) {
      SH.http(url, SH.assign({ binary: true, timeout: 120000 }, opts), function (err, u8) {
        if (err) return cb(err);
        var text;
        try { if (SH.isGzip(u8)) u8 = SH.gunzip(u8); text = SH.bytesToText(u8); } catch (e) { return cb('The guide file could not be read: ' + e.message); }
        u8 = null;
        SH.Xmltv.parse(text, SH.Xmltv.window(), function (e2, res) { cb(e2, res && SH.Xmltv.finish(res)); });
      });
    }
  };
})();

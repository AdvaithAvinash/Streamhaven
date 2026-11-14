/* Streamhaven core utilities. ES5 only: must run on Tizen 3.0 (Chromium 47). */
(function () {
  'use strict';
  var SH = window.SH = { version: '0.1.0', scale: 1 };

  /* ---- DOM builder: h('div.card.f', {text:'x', _enter:fn}, [children]) ---- */
  SH.h = function (spec, props, kids) {
    var parts = spec.split('.'), tag = parts[0].split('#');
    var el = document.createElement(tag[0] || 'div');
    if (tag[1]) el.id = tag[1];
    if (parts.length > 1) el.className = parts.slice(1).join(' ');
    if (props && (typeof props === 'string' || props.nodeType || props instanceof Array)) { kids = props; props = null; }
    if (props) {
      for (var k in props) {
        if (!props.hasOwnProperty(k)) continue;
        var v = props[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;            // trusted markup only (icons)
        else if (k === 'style') el.style.cssText = v;
        else if (k.charAt(0) === '_') el[k] = v;            // behaviour hooks: _enter, _focus, _menu, _key
        else el.setAttribute(k, v);
      }
    }
    SH.add(el, kids);
    return el;
  };
  SH.add = function (el, kids) {
    if (kids === null || kids === undefined || kids === false) return el;
    if (kids instanceof Array) { for (var i = 0; i < kids.length; i++) SH.add(el, kids[i]); }
    else if (kids.nodeType) el.appendChild(kids);
    else el.appendChild(document.createTextNode(String(kids)));
    return el;
  };
  SH.clear = function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  /* ---- Event bus ---- */
  var subs = {};
  SH.Bus = {
    on: function (ev, fn) { (subs[ev] = subs[ev] || []).push(fn); return fn; },
    off: function (ev, fn) { var l = subs[ev]; if (!l) return; var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    emit: function (ev, a, b, c) {
      var l = subs[ev]; if (!l) return;
      l = l.slice();
      for (var i = 0; i < l.length; i++) { try { l[i](a, b, c); } catch (e) { if (window.console) console.error('[bus ' + ev + ']', e); } }
    }
  };

  /* ---- Misc ---- */
  SH.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  SH.debounce = function (fn, ms) {
    var t = null;
    return function () { var self = this, args = arguments; if (t) clearTimeout(t); t = setTimeout(function () { t = null; fn.apply(self, args); }, ms); };
  };
  SH.hash = function (s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; } return h; };
  SH.norm = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9À-￿]+/g, ' ').replace(/^\s+|\s+$/g, ''); };
  SH.uid = function () { return Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); };
  SH.pad2 = function (n) { return n < 10 ? '0' + n : '' + n; };
  SH.assign = function (a) { for (var i = 1; i < arguments.length; i++) { var b = arguments[i]; if (b) for (var k in b) if (b.hasOwnProperty(k)) a[k] = b[k]; } return a; };
  SH.hostOf = function (url) { var m = /^[a-z]+:\/\/([^\/:?#]+)/i.exec(url || ''); return m ? m[1] : ''; };

  /* ---- Storage (JSON over localStorage, never throws) ---- */
  SH.ls = {
    get: function (k, def) { try { var v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} },
    keys: function (prefix) { var out = []; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf(prefix) === 0) out.push(k); } } catch (e) {} return out; },
    size: function (prefix) { var n = 0, ks = SH.ls.keys(prefix); for (var i = 0; i < ks.length; i++) { try { n += (localStorage.getItem(ks[i]) || '').length; } catch (e) {} } return n; }
  };

  /* ---- HTTP GET ---- */
  SH.http = function (url, opts, cb) {
    var x = new XMLHttpRequest(), done = false;
    function fin(err, res) { if (done) return; done = true; cb(err, res, x); }
    try {
      x.open('GET', url, true);
      x.timeout = (opts && opts.timeout) || 30000;
      x.onload = function () { if (x.status >= 200 && x.status < 400) fin(null, x.responseText); else fin('Server returned ' + x.status); };
      x.onerror = function () { fin('Could not reach the server'); };
      x.ontimeout = function () { fin('The server took too long to respond'); };
      x.send();
    } catch (e) { fin('The address is not valid'); }
    return x;
  };

  /* ---- Formatting ---- */
  SH.fmt = {
    time: function (ts) {
      var d = new Date(ts), hh = d.getHours(), mm = SH.pad2(d.getMinutes());
      if (SH.Store && SH.Store.get('clock24') === false) { var ap = hh >= 12 ? 'PM' : 'AM'; hh = hh % 12 || 12; return hh + ':' + mm + ' ' + ap; }
      return SH.pad2(hh) + ':' + mm;
    },
    range: function (a, b) { return SH.fmt.time(a) + ' – ' + SH.fmt.time(b); },
    day: function (ts) {
      var d = new Date(ts), n = new Date(), days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      var diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 864e5);
      if (diff === 0) return 'Today'; if (diff === 1) return 'Tomorrow'; if (diff === -1) return 'Yesterday';
      return days[d.getDay()] + ' ' + d.getDate() + ' ' + mon[d.getMonth()];
    },
    dur: function (sec) { if (!sec) return ''; var m = Math.round(sec / 60); if (m < 60) return m + ' min'; var hh = Math.floor(m / 60); m = m % 60; return hh + 'h' + (m ? ' ' + m + 'm' : ''); },
    pos: function (sec) { sec = Math.max(0, Math.floor(sec || 0)); var hh = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return (hh ? hh + ':' + SH.pad2(m) : m) + ':' + SH.pad2(s); },
    ago: function (ts) {
      if (!ts) return 'Never'; var s = (Date.now() - ts) / 1000;
      if (s < 60) return 'Just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago';
      if (s < 86400) return Math.floor(s / 3600) + ' h ago'; return Math.floor(s / 86400) + ' d ago';
    },
    bytes: function (n) { if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'; return (n / 1048576).toFixed(2) + ' MB'; },
    count: function (n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  };

  /* Element rect in 1920x1080 stage coordinates (the stage may be scaled on desktop / 4K). */
  SH.stageRect = function (el) {
    var r = el.getBoundingClientRect(), s = document.getElementById('stage').getBoundingClientRect(), k = SH.scale || 1;
    return { x: Math.round((r.left - s.left) / k), y: Math.round((r.top - s.top) / k), w: Math.round(r.width / k), h: Math.round(r.height / k) };
  };
})();

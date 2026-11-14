/* Playback engine. Samsung AVPlay when available, HTML5 <video> otherwise.
 * State machine: idle -> loading -> playing <-> paused/buffering -> ended | error.
 * Watchdogs guarantee the user is never left on a frozen frame: a start-up or stall timeout
 * always resolves into a retry or a visible error state. Health statistics are recorded here,
 * from real playback only. */
(function () {
  'use strict';
  var SH = window.SH;
  var gen = 0, backend = null, watchdog = null, t0 = 0, started = false, lastSave = 0, retryTimer = null;
  var FULL = { x: 0, y: 0, w: 1920, h: 1080 };

  var E = SH.Engine = { state: 'idle', item: null, streamIndex: 0, rect: null, error: '', retries: 0, wasPaused: false };

  function layer() { return document.getElementById('player-layer'); }
  function hasAv() { return !!(window.webapis && webapis.avplay); }
  E.engineName = function () { return hasAv() ? 'Samsung AVPlay' : 'HTML5 video'; };
  E.url = function () { var s = E.item && E.item.streams[E.streamIndex]; return s ? s.url : ''; };
  E.isLive = function () { return !!E.item && E.item.kind === 'channel'; };
  E.active = function () { return E.state !== 'idle'; };

  function setState(s) {
    E.state = s;
    document.body.classList.toggle('video-on', s !== 'idle');
    layer().classList.toggle('hidden', s === 'idle');
    SH.Bus.emit('player:state', s);
  }
  function arm(sec, reason) { disarm(); var g = gen; watchdog = setTimeout(function () { watchdog = null; if (g === gen) fail(reason); }, sec * 1000); }
  function disarm() { if (watchdog) { clearTimeout(watchdog); watchdog = null; } }
  function applyRect() {
    var r = E.rect || FULL, l = layer();
    l.style.left = r.x + 'px'; l.style.top = r.y + 'px'; l.style.width = r.w + 'px'; l.style.height = r.h + 'px';
    if (backend && backend.rect) backend.rect(r);
  }
  function saveProgress(force) {
    if (!E.item || E.isLive() || !started) return;
    var now = Date.now(); if (!force && now - lastSave < 10000) return; lastSave = now;
    var pos = E.position(), dur = E.duration();
    if (pos > 5) SH.Store.setProgress(E.item, pos, dur);
  }
  function stopBackend() {
    disarm(); if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    gen++;
    if (backend) { try { backend.close(); } catch (e) {} backend = null; }
  }
  function fail(reason) {
    var url = E.url(); if (url) SH.Health.fail(url, reason);
    saveProgress(true); stopBackend();
    if (E.retries < (SH.Store.get('autoRetry') || 0)) {
      E.retries++; setState('loading');
      retryTimer = setTimeout(function () { retryTimer = null; start(); }, 900);
    } else { E.error = reason; setState('error'); }
  }

  function start() {
    var url = E.url(), g = ++gen;
    if (!url) { E.error = 'No stream address'; setState('error'); return; }
    started = false; E.error = ''; t0 = Date.now();
    setState('loading');
    arm(SH.Store.get('startTimeout') || 15, 'The stream did not start in time');
    var cb = {
      playing: function () {
        if (g !== gen) return;
        if (!started) { started = true; SH.Health.ok(url, Date.now() - t0); E.retries = 0; if (E.isLive()) SH.Store.pushRecent(E.item.id); }
        if (E.state !== 'loading' && E.state !== 'buffering') return;
        disarm(); setState('playing');
      },
      buffering: function (on) {
        if (g !== gen || !started) return;
        if (on) { if (E.state === 'playing') { SH.Health.buffer(url); setState('buffering'); arm(25, 'Playback stalled'); } }
        else if (E.state === 'buffering') { disarm(); setState('playing'); }
      },
      time: function () { if (g !== gen) return; saveProgress(false); SH.Bus.emit('player:time'); },
      ended: function () { if (g !== gen) return; disarm(); if (!E.isLive()) SH.Store.removeHistory(E.item.id); setState('ended'); },
      error: function (msg) { if (g === gen) fail(msg || 'Playback failed'); }
    };
    backend = hasAv() ? avBackend() : htmlBackend();
    applyRect();
    try { backend.open(url, E.rect || FULL, E.startAt || 0, cb, E.isLive()); } catch (e) { cb.error('The player could not open this stream'); }
  }

  /* ---- public API ---- */
  E.play = function (item, opts) {
    opts = opts || {};
    saveProgress(true); stopBackend();
    E.item = item; E.streamIndex = opts.streamIndex || 0; E.retries = 0; E.startAt = opts.startAt || 0;
    if (opts.rect !== undefined) E.rect = opts.rect;
    start();
  };
  E.setRect = function (r) { E.rect = r; applyRect(); };
  E.stop = function () { saveProgress(true); stopBackend(); E.item = null; setState('idle'); };
  E.retry = function () { if (!E.item) return; E.retries = 0; E.startAt = E.isLive() ? 0 : E.position() || E.startAt; stopBackend(); start(); };
  E.nextStream = function () { if (!E.item || E.item.streams.length < 2) return false; E.streamIndex = (E.streamIndex + 1) % E.item.streams.length; E.retry(); return true; };
  E.useStream = function (i) { if (!E.item || !E.item.streams[i]) return; E.streamIndex = i; E.retry(); };
  E.toggle = function () {
    if (!backend) return;
    if (E.state === 'playing' || E.state === 'buffering') { backend.pause(); disarm(); setState('paused'); saveProgress(true); }
    else if (E.state === 'paused') { backend.resume(); setState('playing'); }
  };
  E.pause = function () { if (E.state === 'playing') E.toggle(); };
  E.resume = function () { if (E.state === 'paused') E.toggle(); };
  E.position = function () { try { return backend ? backend.pos() : 0; } catch (e) { return 0; } };
  E.duration = function () { try { return backend ? backend.dur() : 0; } catch (e) { return 0; } };
  E.seekBy = function (sec) { if (!backend || E.isLive() || !started) return; var d = E.duration(); if (!d) return; try { backend.seek(SH.clamp(E.position() + sec, 0, Math.max(0, d - 2))); } catch (e) {} SH.Bus.emit('player:time'); };

  /* App sent to background / TV standby, and network recovery. */
  E.suspend = function () { if (!E.item || E.state === 'idle') return; E.wasPaused = true; if (E.isLive()) { stopBackend(); setState('paused'); } else E.pause(); };
  E.wake = function () { if (!E.wasPaused) return; E.wasPaused = false; if (!E.item) return; if (E.isLive()) E.retry(); else E.resume(); };
  SH.Bus.on('net', function (online) { if (online && E.item && E.state === 'error') E.retry(); });

  /* ---- HTML5 backend ---- */
  function htmlBackend() {
    var v = document.getElementById('html-player'), cb = null, on = {};
    function bind(ev, fn) { on[ev] = fn; v.addEventListener(ev, fn, false); }
    return {
      open: function (url, rect, startAt, c) {
        cb = c; v.classList.remove('hidden');
        bind('timeupdate', function () { if (!v.paused && v.currentTime > 0) cb.playing(); cb.time(); });
        bind('waiting', function () { cb.buffering(true); });
        bind('playing', function () { cb.buffering(false); });
        bind('ended', function () { cb.ended(); });
        bind('error', function () { cb.error(v.error && v.error.code === 4 ? 'This stream format is not supported on this device' : 'The stream could not be played'); });
        bind('loadedmetadata', function () { if (startAt) { try { v.currentTime = startAt; } catch (e) {} } });
        v.src = url;
        var p = v.play(); if (p && p.then) p.then(null, function () {});
      },
      close: function () { for (var k in on) v.removeEventListener(k, on[k], false); on = {}; try { v.pause(); } catch (e) {} v.removeAttribute('src'); try { v.load(); } catch (e2) {} v.classList.add('hidden'); },
      pause: function () { v.pause(); }, resume: function () { var p = v.play(); if (p && p.then) p.then(null, function () {}); },
      pos: function () { return v.currentTime || 0; }, dur: function () { return isFinite(v.duration) ? v.duration : 0; },
      seek: function (s) { v.currentTime = s; }
    };
  }

  /* ---- Samsung AVPlay backend ---- */
  function avBackend() {
    var av = webapis.avplay, ticked = false;
    function pickTracks() {
      var audio = SH.Store.get('audioLang'), sub = SH.Store.get('subLang');
      try {
        var tr = av.getTotalTrackInfo();
        for (var i = 0; i < tr.length; i++) {
          var info = {}; try { info = JSON.parse(tr[i].extra_info); } catch (e) {}
          var lang = String(info.language || info.track_lang || '').toLowerCase();
          if (audio && tr[i].type === 'AUDIO' && lang.indexOf(audio) === 0) av.setSelectTrack('AUDIO', tr[i].index);
          if (sub && SH.Store.get('subtitles') && tr[i].type === 'TEXT' && lang.indexOf(sub) === 0) av.setSelectTrack('TEXT', tr[i].index);
        }
        av.setSilentSubtitle(!SH.Store.get('subtitles'));
      } catch (e2) {}
    }
    return {
      open: function (url, rect, startAt, cb, live) {
        try { av.close(); } catch (e) {}
        av.open(url);
        av.setDisplayRect(rect.x, rect.y, rect.w, rect.h);
        try { av.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX'); } catch (e1) {}
        var buf = SH.Store.get('bufferSec');
        if (buf) { try { av.setBufferingParam('PLAYER_BUFFER_FOR_PLAY', 'PLAYER_BUFFER_SIZE_IN_SECOND', buf); av.setBufferingParam('PLAYER_BUFFER_FOR_RESUME', 'PLAYER_BUFFER_SIZE_IN_SECOND', buf); } catch (e3) {} }
        av.setListener({
          onbufferingstart: function () { cb.buffering(true); },
          onbufferingcomplete: function () { cb.buffering(false); },
          oncurrentplaytime: function (ms) { if (ms > 0 && !ticked) { ticked = true; } if (ticked) cb.playing(); cb.time(); },
          onstreamcompleted: function () { cb.ended(); },
          onerror: function (type) { cb.error(/CONNECTION|NETWORK/i.test(type) ? 'The stream could not be reached' : (/UNSUPPORTED|NOT_SUPPORTED/i.test(type) ? 'This stream format is not supported on this device' : 'The stream could not be played')); },
          onevent: function () {}
        });
        av.prepareAsync(function () {
          try { pickTracks(); if (startAt && !live) av.seekTo(Math.floor(startAt * 1000)); av.play(); } catch (e) { cb.error('The stream could not be played'); }
        }, function () { cb.error('The stream could not be opened'); });
      },
      rect: function (r) { try { av.setDisplayRect(r.x, r.y, r.w, r.h); } catch (e) {} },
      close: function () { try { av.stop(); } catch (e) {} try { av.close(); } catch (e2) {} },
      pause: function () { av.pause(); }, resume: function () { av.play(); },
      pos: function () { return av.getCurrentTime() / 1000; }, dur: function () { return av.getDuration() / 1000; },
      seek: function (s) { av.seekTo(Math.floor(s * 1000)); }
    };
  }
})();

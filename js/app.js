/* Application bootstrap: key routing, BACK logic, theming, reminders, lifecycle. */
(function () {
  'use strict';
  var SH = window.SH, h = SH.h, UI = SH.UI, C = SH.Catalog, R = SH.Router, F = SH.Focus;
  var App = SH.App = SH.App || {};

  /* ---- navigation ---- */
  App.go = function (name, params, opts) {
    opts = opts || {};
    if (name === 'sources' && SH.Store.get('pin') && SH.Store.get('pinSources') && !opts.unlocked) {
      UI.pin('Enter PIN to open Sources', function (v) { if (v === SH.Store.get('pin')) App.go(name, params, SH.assign({ unlocked: true }, opts)); else UI.toast('Incorrect PIN', 'error'); });
      return;
    }
    SH.Sidebar.setActive(name);
    R.root(name, params, opts);
  };
  App.focusContent = function () {
    var s = R.current; if (!s) return;
    var last = s.lastFocus;
    if (last && s.el.contains(last) && last.offsetParent !== null) { F.set(last); return; }
    if (s.focus && s.focus() !== false && !SH.Sidebar.has(F.current)) return;
    F.first(s.el);
  };
  App.exit = function () {
    if (window.SHNative && window.SHNative.exit) return window.SHNative.exit();
    try { tizen.application.getCurrentApplication().exit(); } catch (e) { UI.toast('Exit is only available on the TV'); }
  };
  App.back = function () {
    var d = UI.topDialog(); if (d) { d.close(); return; }
    var s = R.current;
    if (s && s.onBack && s.onBack()) return;
    if (R.stack.length > 1) { R.back(); return; }
    if (!SH.Sidebar.has(F.current)) { if (s && F.current && s.el.contains(F.current)) s.lastFocus = F.current; F.set(SH.Sidebar.activeEl()); return; }
    if (s && s.name !== 'home') { App.go('home', null, { keepFocus: true }); F.set(SH.Sidebar.activeEl()); return; }
    UI.confirm('Exit Streamhaven?', null, 'Exit', App.exit);
  };

  App.onKey = function (key, ev) {
    var d = UI.topDialog(), s = R.current;
    if (d) { if (d.onKey && d.onKey(key, ev)) return; }
    else if (s && s.onKey && s.onKey(key, ev)) return;
    switch (key) {
      case 'left': case 'right': case 'up': case 'down': if (F.ensure()) F.move(key); break;
      case 'enter': if (F.ensure() && F.current._enter) F.current._enter(F.current); break;
      case 'back': App.back(); break;
      case 'exit': App.exit(); break;
      case 'guide': if (!d) App.go('guide'); break;
      case 'chlist': if (!d) App.go('live'); break;
      case 'playpause': case 'play': case 'pause': if (!d && SH.Engine.active() && !SH.Engine.isLive()) SH.Engine.toggle(); break;
      case 'stop': if (!d && s && s.name === 'live') SH.Engine.stop(); break;
    }
  };
  App.onRaw = function (ev) { var s = R.current; return !UI.topDialog() && s && s.onRaw ? s.onRaw(ev) : false; };

  /* ---- shared actions ---- */
  App.playTitle = function (item) {
    var t = item;
    if (item.kind === 'series' && !item.seasons.length) { R.push('detail', { id: item.id }); return; }
    if (item.kind === 'series') {
      t = item.seasons[0] && item.seasons[0].episodes[0];
      var hist = SH.Store.data().history;
      for (var i = 0; i < hist.length; i++) { var e = C.get(hist[i].id); if (e && e.kind === 'episode' && e.seriesId === item.id) { t = e; break; } }
    }
    if (t) R.push('player', { item: t, resume: true });
  };
  App.programmeInfo = function (ch, p, inPlayer) {
    var now = Date.now(), live = !p || (p.s <= now && p.e > now), future = p && p.s > now, buttons = [{ label: 'Close' }];
    if (future) { var has = SH.Store.hasReminder(ch.id, p.s); buttons.push({ label: has ? 'Remove reminder' : 'Set reminder', primary: true, run: function () { UI.toast(SH.Store.toggleReminder(ch, p) ? 'Reminder set for ' + SH.fmt.time(p.s) : 'Reminder removed'); } }); }
    if (live && !inPlayer) buttons.push({ label: 'Watch ' + ch.name, primary: true, run: function () { R.push('player', { item: ch }); } });
    var cu = p && p.e <= now ? C.catchupFor(ch, p) : null;
    if (cu) buttons.push({ label: 'Watch from the start', primary: true, run: function () {
      var item = { id: 'cu:' + ch.id + ':' + p.s, kind: 'catchup', title: p.t, channel: ch.name, streams: [{ sourceId: cu.sourceId, url: cu.url }] };
      if (inPlayer && R.current && R.current.name === 'player') R.back();
      R.push('player', { item: item });
    } });
    if (p && p.e <= now && !inPlayer) buttons.push({ label: 'Watch ' + ch.name + ' live', run: function () { R.push('player', { item: ch }); } });
    UI.dialog({
      title: p ? p.t : ch.name, wide: true,
      body: [h('div.meta', [p ? h('span', { text: SH.fmt.day(p.s) + ' · ' + SH.fmt.range(p.s, p.e) }) : null, h('span', { text: ch.name }), p && p.c ? h('span', { text: p.c }) : null, p && live ? UI.live() : null]),
        h('p.dialog-text', { text: p ? (p.d || 'No description available.') : 'No programme information is available for this channel.' }),
        p && p.e <= now && !cu ? h('p.dialog-note', { text: 'This programme has ended. ' + (C.hasCatchup(ch) ? 'It is outside this channel\'s catch-up window.' : 'Catch-up is not offered for this channel.') }) : null],
      buttons: buttons
    });
  };

  /* ---- theme: accent colour is injected as a small stylesheet (no CSS variables on Tizen 3.0) ---- */
  function hexA(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
  App.theme = function () {
    var a = SH.Store.get('accent') || '#398BFF', st = document.getElementById('accent-style');
    if (!st) { st = document.createElement('style'); st.id = 'accent-style'; document.head.appendChild(st); }
    st.textContent = [
      '.f.is-focused{box-shadow:0 0 0 3px ' + a + '}',
      '.btn.primary,.chip.active,.switch.on,.kb-key.is-focused,.pin-key.is-focused{background:' + a + '}',
      '.bar i,.guide-now,.pin-dots i.on,.search-caret{background:' + a + '}',
      '.nav-item.active .nav-ico,.nav-item.active .nav-label,.hero-eyebrow,.menu-check,.menu-item.selected,.ch-row.tuned .ch-row-name,.set-cat.active,.g-bell,.ch-fav,.spinner{color:' + a + '}',
      '.nav-item.active:before,.g-row.current .g-ch:before{background:' + a + '}',
      '.field.editing{border-color:' + a + '}', '.spinner{border-top-color:' + a + '}',
      '.g-cell.airing{background:' + hexA(a, 0.16) + '}', '.ch-row.tuned{background:' + hexA(a, 0.12) + '}'
    ].join('\n');
    document.body.classList.toggle('no-motion', !!SH.Store.get('reduceMotion'));
  };

  /* ---- reminders ---- */
  function checkReminders() {
    var d = SH.Store.data(), now = Date.now(), lead = (SH.Store.get('reminderLead') || 0) * 60000, dirty = false;
    d.reminders = d.reminders.filter(function (r) { if (r.e <= now) { dirty = true; return false; } return true; });
    d.reminders.forEach(function (r) {
      if (r.done || r.s - lead > now) return;
      r.done = true; dirty = true;
      var ch = C.get(r.ch); if (!ch || UI.topDialog()) return;
      UI.dialog({ title: r.s > now ? 'Starting soon' : 'On now', text: r.t + ' · ' + ch.name + ' · ' + SH.fmt.time(r.s), buttons: [{ label: 'Dismiss' }, { label: 'Watch', primary: true, run: function () { if (R.current && R.current.name === 'player') R.back(); R.push('player', { item: ch }); } }] });
    });
    if (dirty) SH.Store.save();
  }

  function fit() {
    var k = Math.min(window.innerWidth / 1920, window.innerHeight / 1080), st = document.getElementById('stage');
    SH.scale = k;
    var v = 'translate(' + Math.round((window.innerWidth - 1920 * k) / 2) + 'px,' + Math.round((window.innerHeight - 1080 * k) / 2) + 'px) scale(' + k + ')';
    st.style.webkitTransform = k === 1 ? '' : v; st.style.transform = k === 1 ? '' : v;
  }

  App.init = function () {
    fit(); window.addEventListener('resize', fit, false);
    if (window.webapis === undefined && window.tizen) { var sc = document.createElement('script'); sc.src = '$WEBAPIS/webapis/webapis.js'; document.head.appendChild(sc); }
    if (window.tizen) { var av = document.createElement('object'); av.id = 'av-player'; av.type = 'application/avplayer'; document.getElementById('player-layer').appendChild(av); }
    SH.Keys.init(); SH.Sidebar.init(); App.theme();
    SH.Bus.on('settings', function (k) { if (k === 'accent' || k === 'reduceMotion') App.theme(); });
    SH.Bus.on('catalog:changed', function () { R.refresh(); });
    SH.Bus.on('personal', function () { for (var i = 0; i < R.stack.length - 1; i++) R.stack[i].stale = true; });

    /* pointer support (Samsung smart remote pointer, desktop mouse) */
    document.getElementById('stage').addEventListener('click', function (ev) {
      var el = ev.target; while (el && el.nodeType === 1 && !(el.classList && el.classList.contains('f'))) el = el.parentNode;
      if (!el || el.nodeType !== 1 || !F.root().contains(el)) return;
      F.set(el); if (ev.target.tagName !== 'INPUT' && el._enter) el._enter(el);
    }, false);
    var wheelAt = 0;
    document.addEventListener('wheel', function (ev) { var now = Date.now(); if (now - wheelAt < 90) return; wheelAt = now; App.onKey(ev.deltaY > 0 ? 'down' : 'up', ev); }, false);

    document.addEventListener('visibilitychange', function () { if (document.hidden) { SH.Store.flush(); SH.Engine.suspend(); } else SH.Engine.wake(); }, false);
    window.addEventListener('offline', function () { UI.toast('Network connection lost', 'error'); SH.Bus.emit('net', false); }, false);
    window.addEventListener('online', function () { UI.toast('Back online', 'ok'); SH.Bus.emit('net', true); }, false);

    SH.initProxy(function () { C.init(); });
    var start = SH.Store.get('landing'); if (!R.defs[start] || start === 'sources' || start === 'settings') start = 'home';
    App.go(start);
    setInterval(function () { if (R.current && R.current.tick) R.current.tick(); checkReminders(); }, 30000);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', App.init, false); else App.init();
})();

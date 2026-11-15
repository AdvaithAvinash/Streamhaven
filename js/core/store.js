/* Settings, profiles and per-profile personal data. */
(function () {
  'use strict';
  var SH = window.SH;
  var DEFAULTS = {
    landing: 'home', clock24: true, accent: '#398BFF', reduceMotion: false,
    tuneMode: 'ok', overlayTimeout: 5, showHealth: true,
    startTimeout: 15, autoRetry: 1, bufferSec: 0, audioLang: '', subLang: '', subtitles: false,
    reminderLead: 1, guideSpan: 24, autoRefresh: true,
    pin: '', pinSources: false, hideAdult: false
  };
  var COLORS = ['#398BFF', '#45D6E8', '#8B7CFF', '#F2B84B', '#F2708B', '#5FD39A'];
  var settings = SH.assign({}, DEFAULTS, SH.ls.get('sh.settings', {}));
  var prof = SH.ls.get('sh.profiles', null);
  if (!prof || !prof.list || !prof.list.length) prof = { list: [{ id: 'p1', name: 'Main', color: COLORS[0] }], active: 'p1' };
  var data = null;

  function blank() { return { favs: {}, recent: [], history: [], list: {}, reminders: [], searches: [], collections: [], home: { order: [], hidden: {} } }; }
  function load() { data = SH.assign(blank(), SH.ls.get('sh.p.' + prof.active, {})); if (!data.home) data.home = { order: [], hidden: {} }; }
  load();

  var saveData = SH.debounce(function () { SH.ls.set('sh.p.' + prof.active, data); }, 400);
  function saveProf() { SH.ls.set('sh.profiles', prof); }

  var S = SH.Store = {
    DEFAULTS: DEFAULTS, COLORS: COLORS,
    get: function (k) { return settings[k]; },
    set: function (k, v) { settings[k] = v; SH.ls.set('sh.settings', settings); SH.Bus.emit('settings', k, v); },
    all: function () { return settings; },
    data: function () { return data; },
    save: function () { saveData(); },
    flush: function () { SH.ls.set('sh.p.' + prof.active, data); },

    /* profiles */
    profiles: function () { return prof.list; },
    profile: function () { for (var i = 0; i < prof.list.length; i++) if (prof.list[i].id === prof.active) return prof.list[i]; return prof.list[0]; },
    addProfile: function (name) { var p = { id: 'p' + SH.uid(), name: name, color: COLORS[prof.list.length % COLORS.length] }; prof.list.push(p); saveProf(); SH.Bus.emit('profile'); return p; },
    renameProfile: function (id, name) { for (var i = 0; i < prof.list.length; i++) if (prof.list[i].id === id) prof.list[i].name = name; saveProf(); SH.Bus.emit('profile'); },
    removeProfile: function (id) {
      if (prof.list.length < 2 || id === prof.active) return false;
      prof.list = prof.list.filter(function (p) { return p.id !== id; }); SH.ls.del('sh.p.' + id); saveProf(); SH.Bus.emit('profile'); return true;
    },
    switchProfile: function (id) { if (id === prof.active) return; S.flush(); prof.active = id; saveProf(); load(); SH.Bus.emit('profile'); SH.Bus.emit('catalog:changed'); },

    /* favourites (channels) */
    isFav: function (id) { return !!data.favs[id]; },
    toggleFav: function (id) { if (data.favs[id]) delete data.favs[id]; else data.favs[id] = Date.now(); saveData(); SH.Bus.emit('personal', 'favs', id); return !!data.favs[id]; },

    /* my list (movies / series) */
    inList: function (id) { return !!data.list[id]; },
    toggleList: function (item) { if (data.list[item.id]) delete data.list[item.id]; else data.list[item.id] = { kind: item.kind, ts: Date.now() }; saveData(); SH.Bus.emit('personal', 'list', item.id); return !!data.list[item.id]; },

    /* recently watched channels */
    pushRecent: function (id) { var r = data.recent.filter(function (x) { return x !== id; }); r.unshift(id); data.recent = r.slice(0, 30); saveData(); },

    /* playback progress for movies / episodes */
    progress: function (id) { for (var i = 0; i < data.history.length; i++) if (data.history[i].id === id) return data.history[i]; return null; },
    setProgress: function (item, pos, dur) {
      var hst = data.history.filter(function (x) { return x.id !== item.id; });
      hst.unshift({ id: item.id, kind: item.kind, pos: Math.floor(pos), dur: Math.floor(dur || 0), ts: Date.now() });
      data.history = hst.slice(0, 200); saveData();
    },
    removeHistory: function (id) { data.history = data.history.filter(function (x) { return x.id !== id; }); saveData(); SH.Bus.emit('personal', 'history', id); },

    /* programme reminders */
    hasReminder: function (chId, start) { for (var i = 0; i < data.reminders.length; i++) if (data.reminders[i].ch === chId && data.reminders[i].s === start) return true; return false; },
    toggleReminder: function (ch, p) {
      if (S.hasReminder(ch.id, p.s)) data.reminders = data.reminders.filter(function (r) { return !(r.ch === ch.id && r.s === p.s); });
      else data.reminders.push({ ch: ch.id, s: p.s, e: p.e, t: p.t });
      data.reminders.sort(function (a, b) { return a.s - b.s; }); saveData(); SH.Bus.emit('personal', 'reminders');
      return S.hasReminder(ch.id, p.s);
    },

    /* search history */
    addSearch: function (q) { q = q.replace(/^\s+|\s+$/g, ''); if (q.length < 2) return; var l = data.searches.filter(function (x) { return x.toLowerCase() !== q.toLowerCase(); }); l.unshift(q); data.searches = l.slice(0, 12); saveData(); },

    /* custom collections */
    addCollection: function (name) { var c = { id: 'col' + SH.uid(), name: name, items: [] }; data.collections.push(c); saveData(); SH.Bus.emit('personal', 'collections'); return c; },
    removeCollection: function (id) { data.collections = data.collections.filter(function (c) { return c.id !== id; }); saveData(); SH.Bus.emit('personal', 'collections'); },
    inCollection: function (c, id) { for (var i = 0; i < c.items.length; i++) if (c.items[i] === id) return true; return false; },
    toggleInCollection: function (c, id) { if (S.inCollection(c, id)) c.items = c.items.filter(function (x) { return x !== id; }); else c.items.push(id); saveData(); SH.Bus.emit('personal', 'collections'); },

    /* backup */
    exportAll: function () {
      S.flush();
      var out = { app: 'streamhaven', version: SH.version, ts: Date.now(), keys: {} };
      ['sh.settings', 'sh.profiles', 'sh.sources'].concat(SH.ls.keys('sh.p.')).forEach(function (k) { out.keys[k] = SH.ls.get(k, null); });
      return out;
    },
    importAll: function (obj) {
      if (!obj || obj.app !== 'streamhaven' || !obj.keys) return false;
      for (var k in obj.keys) if (obj.keys.hasOwnProperty(k) && k.indexOf('sh.') === 0) SH.ls.set(k, obj.keys[k]);
      return true;
    }
  };
})();

/* Settings: category list on the left, panel of rows on the right. Every row does something real. */
(function () {
  'use strict';
  var SH = window.SH, h = SH.h, UI = SH.UI, C = SH.Catalog, S = SH.Store;

  var ACCENTS = [['#398BFF', 'Electric blue'], ['#45D6E8', 'Cyan'], ['#8B7CFF', 'Violet'], ['#F2B84B', 'Amber'], ['#F2708B', 'Rose'], ['#5FD39A', 'Green']];
  var LANGS = [['', 'Stream default'], ['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'], ['hi', 'Hindi'], ['ta', 'Tamil'], ['ar', 'Arabic'], ['tr', 'Turkish'], ['ru', 'Russian'], ['ja', 'Japanese'], ['ko', 'Korean'], ['zh', 'Chinese']];
  function toggle(label, key, desc) { return { type: 'toggle', label: label, key: key, desc: desc }; }
  function choice(label, key, options, desc) { return { type: 'choice', label: label, key: key, options: options, desc: desc }; }
  function action(label, value, run, desc) { return { type: 'action', label: label, value: value, run: run, desc: desc }; }
  function info(label, value) { return { type: 'info', label: label, value: value }; }

  function homeLayout() {
    var d = S.data().home, order = SH.HomeSections.list().map(function (s) { return s[0]; }), labels = {}, body = h('div.layout-list'), dlg;
    SH.HomeSections.list().forEach(function (s) { labels[s[0]] = s[1]; });
    function draw(focusFid) {
      SH.clear(body);
      order.forEach(function (id, i) {
        var hid = !!d.hidden[id];
        body.appendChild(h('div.layout-row' + (hid ? '.off' : ''), [h('span.layout-name', { text: labels[id] }), h('div.btn-row', { 'data-nav': 'row' }, [
          UI.button(hid ? 'Hidden' : 'Shown', { small: true, icon: hid ? null : 'check', fid: 'v' + id, run: function () { if (hid) delete d.hidden[id]; else d.hidden[id] = 1; save('v' + id); } }),
          UI.button('', { small: true, icon: 'up', fid: 'u' + id, run: function () { if (i > 0) { order.splice(i, 1); order.splice(i - 1, 0, id); save('u' + id); } } }),
          UI.button('', { small: true, icon: 'down', fid: 'd' + id, run: function () { if (i < order.length - 1) { order.splice(i, 1); order.splice(i + 1, 0, id); save('d' + id); } } })
        ])]));
      });
      var f = focusFid && body.querySelector('[data-fid="' + focusFid + '"]'); if (f) { SH.Focus.current = null; SH.Focus.set(f); }
    }
    function save(fid) { d.order = order.slice(); S.save(); draw(fid); }
    dlg = UI.dialog({ title: 'Home screen layout', text: 'Show, hide and reorder the sections of the home screen for this profile.', wide: true, body: body, buttons: [{ label: 'Done', primary: true }] });
    draw(); SH.Focus.first(body);
  }

  function testSources(done) {
    var list = C.sources.filter(function (s) { return s.url; }), out = [], i = 0;
    if (!list.length) { UI.toast('No sources with a network address to test'); return; }
    UI.toast('Testing ' + SH.fmt.count(list.length, 'source') + '…');
    (function next() {
      if (i >= list.length) { UI.dialog({ title: 'Source connection test', text: 'This measures how quickly each server answers. It does not prove that streams play: playback health is recorded only while you watch.', wide: true, body: h('div.menu', out.map(function (o) { return h('div.menu-item.static', [h('span', { text: o[0] }), h('span.menu-note', { text: o[1] })]); })), buttons: [{ label: 'Close', primary: true }] }); return; }
      var s = list[i++], t = Date.now(), x = SH.http(s.url, { timeout: 8000 }, function (err) { out.push([s.name, err ? String(err) : 'Answered in ' + (Date.now() - t) + ' ms']); next(); });
      x.onprogress = function () { if (x.readyState >= 3 && x.status >= 200 && x.status < 400) { out.push([s.name, 'Answered in ' + (Date.now() - t) + ' ms']); x.onload = x.onerror = x.ontimeout = x.onprogress = null; x.abort(); next(); } };
    })();
  }

  function backupSave() {
    var text = JSON.stringify(S.exportAll());
    if (window.tizen && tizen.filesystem) {
      try {
        tizen.filesystem.resolve('documents', function (dir) {
          try { try { dir.deleteFile(dir.fullPath + '/streamhaven-backup.json', function () { write(); }, function () { write(); }); } catch (e) { write(); } } catch (e2) { UI.toast('Backup failed', 'error'); }
          function write() { try { var f = dir.createFile('streamhaven-backup.json'); f.openStream('w', function (st) { st.write(text); st.close(); UI.toast('Backup saved to Documents/streamhaven-backup.json', 'ok'); }, function () { UI.toast('Backup failed', 'error'); }, 'UTF-8'); } catch (e3) { UI.toast('Backup failed', 'error'); } }
        }, function () { UI.toast('Device storage is not available', 'error'); }, 'rw');
      } catch (e) { UI.toast('Device storage is not available', 'error'); }
      return;
    }
    var a = document.createElement('a'); a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(text); a.download = 'streamhaven-backup.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    UI.toast('Backup downloaded', 'ok');
  }
  function applyBackup(text) {
    var obj = null; try { obj = JSON.parse(text); } catch (e) {}
    if (!S.importAll(obj)) { UI.toast('That file is not a Streamhaven backup', 'error'); return; }
    UI.dialog({ title: 'Backup restored', text: 'Streamhaven will now reload to apply it.', buttons: [{ label: 'Reload', primary: true, run: function () { location.reload(); } }] });
  }
  function backupRestore() {
    if (window.tizen && tizen.filesystem) {
      try { tizen.filesystem.resolve('documents/streamhaven-backup.json', function (f) { f.readAsText(applyBackup, function () { UI.toast('The backup could not be read', 'error'); }, 'UTF-8'); }, function () { UI.toast('No backup found in Documents', 'error'); }, 'r'); } catch (e) { UI.toast('Device storage is not available', 'error'); }
      return;
    }
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = function () { var f = inp.files && inp.files[0]; if (!f) return; var r = new FileReader(); r.onload = function () { applyBackup(String(r.result)); }; r.readAsText(f); };
    inp.click();
  }
  function platform() {
    var v = ''; try { v = tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version'); } catch (e) {}
    return v ? 'Samsung Tizen ' + v : 'Web browser (preview)';
  }
  function setPin() {
    UI.pin('Choose a 4-digit PIN', function (a) { UI.pin('Repeat the PIN', function (b) { if (a === b) { S.set('pin', a); UI.toast('PIN set', 'ok'); } else UI.toast('The PINs did not match', 'error'); }); });
  }

  var CATS = [
    ['general', 'General', function () { return [
      choice('Start screen', 'landing', SH.Sidebar.ITEMS.slice(0, 7), 'The screen shown when Streamhaven opens.'),
      choice('Clock format', 'clock24', [[true, '24-hour'], [false, '12-hour']])
    ]; }],
    ['appearance', 'Appearance', function () { return [
      choice('Accent colour', 'accent', ACCENTS, 'Used for focus, buttons and highlights.'),
      toggle('Reduce motion', 'reduceMotion', 'Turns off focus and scrolling animations. Recommended on older TVs.'),
      action('Home screen layout', 'Customise', homeLayout, 'Show, hide and reorder home sections.')
    ]; }],
    ['playback', 'Playback', function () { return [
      choice('Start-up timeout', 'startTimeout', [[8, '8 seconds'], [15, '15 seconds'], [25, '25 seconds'], [40, '40 seconds']], 'How long to wait for a stream before treating it as failed.'),
      choice('Automatic retries', 'autoRetry', [[0, 'Off'], [1, 'Once'], [2, 'Twice']], 'Retry a failed stream before showing an error.'),
      choice('Buffer size', 'bufferSec', [[0, 'Automatic'], [5, '5 seconds'], [10, '10 seconds'], [20, '20 seconds']], 'Applies to the Samsung AVPlay engine. Larger buffers start slower but stall less.'),
      choice('Preferred audio language', 'audioLang', LANGS, 'Used when a stream offers several audio tracks (AVPlay).'),
      toggle('Subtitles', 'subtitles', 'Show subtitles when the stream provides them (AVPlay).'),
      choice('Preferred subtitle language', 'subLang', LANGS),
      info('Playback engine', SH.Engine.engineName())
    ]; }],
    ['live', 'Live TV', function () { return [
      choice('Channel switching', 'tuneMode', [['ok', 'Press OK to switch'], ['focus', 'Switch when highlighted']], 'How channels start in the Live TV browser.'),
      choice('Mini-guide timeout', 'overlayTimeout', [[3, '3 seconds'], [5, '5 seconds'], [8, '8 seconds'], [15, '15 seconds']], 'How long the overlay stays on screen during playback.'),
      toggle('Show stream health', 'showHealth', 'Healthy, Slow, Unavailable or Not tested, based on real playback on this TV.')
    ]; }],
    ['epg', 'EPG', function () { return [
      choice('Guide range', 'guideSpan', [[12, '12 hours'], [24, '24 hours'], [48, '48 hours']], 'How far ahead the TV Guide can scroll.'),
      choice('Reminder lead time', 'reminderLead', [[0, 'At start time'], [1, '1 minute before'], [5, '5 minutes before'], [10, '10 minutes before']]),
      info('Reminders set', String(S.data().reminders.filter(function (r) { return r.s > Date.now(); }).length))
    ]; }],
    ['sources', 'Sources', function () { return [
      toggle('Refresh playlists on start', 'autoRefresh', 'When off, the last downloaded copy is used until you refresh manually.'),
      action('Manage sources', SH.fmt.count(C.sources.length, 'source'), function () { SH.App.go('sources'); }),
      info('Library', SH.fmt.count(C.channels.length, 'channel') + ' · ' + SH.fmt.count(C.movies.length, 'movie') + ' · ' + C.series.length + ' series')
    ]; }],
    ['profiles', 'Profiles', function () {
      var cur = S.profile(), rows = S.profiles().map(function (p) {
        return action(p.name, p.id === cur.id ? 'Active' : 'Options', function () {
          var opts = [];
          if (p.id !== cur.id) opts.push({ label: 'Switch to this profile', icon: 'user', run: function () { S.switchProfile(p.id); UI.toast('Switched to ' + p.name); } });
          opts.push({ label: 'Rename', icon: 'edit', run: function () { UI.form({ title: 'Rename profile', fields: [{ key: 'name', label: 'Name', value: p.name }], onSubmit: function (v) { if (!v.name) return 'Enter a name.'; S.renameProfile(p.id, v.name.slice(0, 20)); redraw(); } }); } });
          if (p.id !== cur.id) opts.push({ label: 'Delete profile', icon: 'trash', run: function () { UI.confirm('Delete "' + p.name + '"?', 'Its favourites, list and history are erased.', 'Delete', function () { S.removeProfile(p.id); redraw(); }, true); } });
          UI.menu(p.name, opts);
        }, 'Favourites, My List, history, reminders and home layout are kept per profile.');
      });
      if (S.profiles().length < 6) rows.push(action('Add profile', '', function () { UI.form({ title: 'New profile', submit: 'Create', fields: [{ key: 'name', label: 'Name' }], onSubmit: function (v) { if (!v.name) return 'Enter a name.'; S.addProfile(v.name.slice(0, 20)); redraw(); } }); }));
      return rows;
    }],
    ['parental', 'Parental Controls', function () {
      var pin = S.get('pin');
      return [
        action('PIN', pin ? 'Change' : 'Set PIN', function () { UI.guard(setPin); }, pin ? 'A PIN is set.' : 'Protect sources and these controls with a 4-digit PIN.'),
        pin ? action('Remove PIN', '', function () { UI.guard(function () { S.set('pin', ''); S.set('pinSources', false); UI.toast('PIN removed'); }); }) : null,
        pin ? { type: 'toggle', label: 'Require PIN for Sources', key: 'pinSources', guard: true, desc: 'Ask for the PIN before sources can be viewed or changed.' } : null,
        { type: 'toggle', label: 'Hide adult categories', key: 'hideAdult', guard: !!pin, desc: 'Hides channel categories and genres labelled as adult by the source.' }
      ].filter(Boolean);
    }],
    ['network', 'Network Diagnostics', function () {
      var type = ''; try { type = ['Disconnected', 'Wi-Fi', 'Mobile', 'Ethernet'][webapis.network.getActiveConnectionType()] || ''; } catch (e) {}
      return [info('Internet', navigator.onLine === false ? 'Offline' : 'Online' + (type ? ' · ' + type : '')), action('Test source connections', 'Run', testSources, 'Measures server response time for each source.'),
        info('Streams with playback data', String(SH.ls.size('sh.health') > 2 ? Object.keys(SH.ls.get('sh.health', {})).length : 0))];
    }],
    ['storage', 'Storage and Cache', function () { return [
      info('Storage used', SH.fmt.bytes(SH.ls.size('sh.') * 2)),
      action('Clear playlist cache', SH.fmt.bytes(SH.ls.size('sh.cache.') * 2), function () { SH.ls.keys('sh.cache.').forEach(SH.ls.del); UI.toast('Playlist cache cleared'); redraw(); }, 'Playlists are downloaded again the next time they refresh.'),
      action('Clear watch history', SH.fmt.count(S.data().history.length, 'item'), function () { UI.confirm('Clear watch history?', 'Continue Watching and resume positions for this profile are erased.', 'Clear', function () { S.data().history = []; S.data().recent = []; S.save(); redraw(); }, true); }),
      action('Clear search history', SH.fmt.count(S.data().searches.length, 'search', 'searches'), function () { S.data().searches = []; S.save(); redraw(); UI.toast('Search history cleared'); }),
      action('Clear stream health data', '', function () { SH.Health.clear(); UI.toast('Stream health data cleared'); redraw(); }, 'All streams return to Not tested.')
    ]; }],
    ['backup', 'Backup and Restore', function () { return [
      action('Create backup', '', function () { UI.guard(backupSave); }, 'Saves settings, profiles and sources to a file. The file contains your source addresses, so keep it private.'),
      action('Restore backup', '', function () { UI.guard(backupRestore); }, 'Replaces the current settings, profiles and sources.'),
      action('Reset Streamhaven', '', function () { UI.guard(function () { UI.confirm('Reset Streamhaven?', 'All sources, profiles, history and settings on this TV are erased.', 'Reset', function () { SH.ls.keys('sh.').forEach(SH.ls.del); location.reload(); }, true); }); })
    ]; }],
    ['about', 'About Streamhaven', function () { return [
      info('Version', SH.version), info('Platform', platform()), info('Playback engine', SH.Engine.engineName()), info('Network', SH.hasNativeHttp() ? 'Native (headers and CORS handled by the app)' : (SH.proxy ? 'Through this site\'s /proxy' : 'Direct from the page')), info('Screen', window.screen.width + ' × ' + window.screen.height),
      info('Source types', 'M3U, Xtream Codes, Stalker, Jellyfin, Emby, Plex, XMLTV, direct URL'), info('Not yet available', 'QR companion setup')
    ]; }]
  ];
  var redraw = function () {};

  SH.Router.register('settings', function (params) {
    var cat = params.cat || 'general', catEls = {};
    var page = UI.page({ noHead: true }), panelTitle = h('h2.set-title');
    page.view.className = 'page-view set-panel'; page.view.setAttribute('data-nav', 'panel');
    var cats = h('div.set-cats', { 'data-nav': 'col' }, CATS.map(function (c) {
      return (catEls[c[0]] = h('div.set-cat.f', { text: c[1], 'data-fid': 'cat' + c[0], _focus: function () { if (cat !== c[0]) { cat = c[0]; draw(); } } }));
    }));
    var el = h('div', [h('div.screen-head', [h('h1', { text: 'Settings' }), h('div.head-right', [UI.clock()])]), cats, panelTitle, page.el]);

    function label(r) { var v = S.get(r.key); for (var i = 0; i < r.options.length; i++) if (r.options[i][0] === v) return r.options[i][1]; return String(v); }
    function draw(focusIdx) {
      var def = CATS.filter(function (c) { return c[0] === cat; })[0], rows = def[2]();
      for (var k in catEls) catEls[k].classList.toggle('active', k === cat);
      panelTitle.textContent = def[1]; SH.clear(page.track); page.view._scroller.to(0);
      var list = h('div.set-rows', { 'data-nav': 'col' });
      rows.forEach(function (r, i) {
        var val, run = null;
        if (r.type === 'toggle') { var on = !!S.get(r.key); val = h('span.switch' + (on ? '.on' : ''), [h('i')]); run = function () { S.set(r.key, !on); draw(i); }; if (r.guard) { var inner = run; run = function () { UI.guard(inner); }; } }
        else if (r.type === 'choice') { val = h('span.set-value', [h('span', { text: label(r) }), h('span', { html: SH.icon('right', 20) })]); run = function () { UI.picker({ title: r.label, value: S.get(r.key), options: r.options.map(function (o) { return { value: o[0], label: o[1] }; }), onPick: function (v) { S.set(r.key, v); draw(i); } }); }; }
        else if (r.type === 'action') { val = h('span.set-value', [h('span', { text: r.value || '' }), h('span', { html: SH.icon('right', 20) })]); run = r.run; }
        else val = h('span.set-value.plain', { text: r.value });
        list.appendChild(h('div.set-row' + (run ? '.f' : '.static'), { _enter: run, 'data-fid': 'row' + i }, [h('div.set-text', [h('div.set-label', { text: r.label }), r.desc ? h('div.set-desc', { text: r.desc }) : null]), val]));
      });
      page.track.appendChild(list);
      if (focusIdx !== undefined && !UI.topDialog()) { var f = list.querySelector('[data-fid="row' + focusIdx + '"]') || list.querySelector('.f'); SH.Focus.current = null; SH.Focus.set(f || catEls[cat]); }
    }
    redraw = function () { var c = SH.Focus.current, inPanel = c && page.el.contains(c); draw(); if (inPanel || (c && !document.body.contains(c))) { SH.Focus.current = null; if (!UI.topDialog()) SH.Focus.set(page.track.querySelector('.f') || catEls[cat]); } };
    var sub = SH.Bus.on('settings', function () { if (!UI.topDialog()) redraw(); });
    draw();
    return { el: el, focus: function () { return SH.Focus.set(catEls[cat]); }, onData: function () { redraw(); }, onShow: function () { draw(); }, destroy: function () { SH.Bus.off('settings', sub); redraw = function () {}; } };
  });
})();

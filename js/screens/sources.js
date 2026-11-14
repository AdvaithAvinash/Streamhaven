/* Sources: add, refresh, edit and remove providers. Addresses and logins can carry credentials, so
 * only the host name is ever displayed and secret fields are never pre-filled. */
(function () {
  'use strict';
  var SH = window.SH, h = SH.h, UI = SH.UI, C = SH.Catalog;

  function created(res, type) {
    C.addSource({ type: type, name: res.name, url: res.url, cfg: res.cfg, epgUrl: res.epgUrl });
    UI.toast('Source added. Synchronising…');
  }

  function addForm(type) {
    var pr = SH.Providers[type], t = C.TYPES[type];
    if (type === 'demo') {
      if (C.sources.some(function (s) { return s.type === 'demo'; })) { UI.toast('The demo library is already added'); return; }
      C.addSource({ type: 'demo', name: 'Demo library' }); UI.toast('Demo library added'); return;
    }
    if (type === 'plex') return plexFlow(null);
    var note = type === 'stalker' && !SH.hasNativeHttp() ? 'Heads up: Stalker portals need the Android app. This device cannot send the headers they require, so signing in will most likely fail.' : 'Press OK on a field to type.';
    UI.form({ title: 'Add ' + t.label, text: note, submit: 'Add source', async: true, working: 'Checking the connection…', fields: pr.form.fields,
      onSubmit: function (v, done) { pr.form.make(v, null, function (err, res) { if (err) return done(err); created(res, type); done(null); }); } });
  }

  function editForm(s) {
    var pr = SH.Providers[s.type], f = pr && pr.form;
    if (!f) { UI.form({ title: 'Rename source', fields: [{ key: 'name', label: 'Name', value: s.name }], onSubmit: function (v) { if (!v.name) return 'Enter a name.'; C.updateSource(s.id, { name: v.name }); } }); return; }
    var cfg = s.cfg || {}, fields = f.fields.map(function (x) {
      var o = SH.assign({}, x, { value: '' });
      if (x.key === 'name') o.value = s.name;
      else if (x.secret) { o.hint = 'Leave empty to keep the current one.'; o.placeholder = ''; }
      else if (x.key === 'url' || x.key === 'epgUrl') { o.hint = 'Current: ' + (SH.hostOf(s[x.key]) || 'not set') + '. Leave empty to keep it.'; }
      else if (cfg[x.key] !== undefined && x.key !== 'password') o.value = x.key === 'server' || x.key === 'portal' || x.key === 'username' || x.key === 'ext' || x.key === 'mac' ? cfg[x.key] : '';
      return o;
    });
    var before = {}; fields.forEach(function (x) { before[x.key] = x.value; });
    UI.form({ title: 'Edit source', submit: 'Save', async: true, working: 'Checking the connection…', fields: fields,
      onSubmit: function (v, done) {
        if (!v.name) return done('Enter a name.');
        var same = true; fields.forEach(function (x) { if (x.key !== 'name' && v[x.key] !== before[x.key]) same = false; });
        if (same) { C.updateSource(s.id, { name: v.name }); return done(null); }
        var vals = SH.assign({}, v); ['url', 'epgUrl'].forEach(function (k) { if (!vals[k] && s[k]) vals[k] = s[k]; });
        f.make(vals, s, function (err, res) {
          if (err) return done(err);
          C.updateSource(s.id, { name: v.name, url: res.url, epgUrl: res.epgUrl, cfg: res.cfg }); UI.toast('Source updated'); done(null);
        });
      } });
  }

  function finishPlex(token, server, existing) {
    var P = SH.Providers.plex;
    UI.toast('Connecting to ' + server.name + '…');
    P.connect(server, function (err, uri) {
      if (err) return UI.toast(String(err), 'error');
      var cfg = { token: token, server: uri, serverToken: server.token, serverName: server.name, machineId: server.id };
      if (existing) { C.updateSource(existing.id, { cfg: cfg }); UI.toast('Plex account linked'); } else created({ name: 'Plex · ' + server.name, cfg: cfg }, 'plex');
    });
  }
  function plexFlow(existing) {
    var P = SH.Providers.plex, handle = null;
    var codeEl = h('div.link-code', { text: '····' }), status = h('div.form-error.working', { text: 'Contacting plex.tv…' });
    var d = UI.dialog({ title: 'Link Plex', wide: true, onClose: function () { if (handle) handle.cancel(); },
      body: [h('div.link-steps', ['On a phone or computer, open ', h('b', { text: 'plex.tv/link' }), ' and enter this code:']), codeEl, status], buttons: [{ label: 'Cancel' }] });
    function fail(e) { status.className = 'form-error'; status.textContent = String(e.message || e); }
    handle = P.link(function (code) { codeEl.textContent = code; status.textContent = 'Waiting for you to enter the code…'; }, function (err, token) {
      if (err) return fail(err);
      status.textContent = 'Looking for your Plex servers…';
      P.servers(token, function (e2, list) {
        if (e2) return fail(e2);
        if (list.length === 1) { handle = null; d.close(); return finishPlex(token, list[0], existing); }
        handle = null; d.close();
        UI.menu('Choose a Plex server', list.map(function (sv) { return { label: sv.name, icon: 'sources', note: sv.owned ? 'Yours' : 'Shared', run: function () { finishPlex(token, sv, existing); } }; }));
      });
    });
  }

  function addDialog() {
    var d = UI.dialog({ title: 'Add a source', wide: true, body: [h('div.menu.scroll', { 'data-nav': 'col' }, C.ORDER.filter(C.ready.bind(C)).concat(['demo']).filter(function (k, i, a) { return a.indexOf(k) === i; }).map(function (k) {
      return h('div.menu-item.tall.f', { _enter: function () { d.close(); addForm(k); } }, [h('span.menu-ico', { html: SH.icon(C.TYPES[k].icon, 26) }), h('div', [h('div', { text: C.TYPES[k].label }), h('div.menu-desc', { text: C.TYPES[k].desc })])]);
    }))] });
  }

  function stat(v, label) { return h('div', [h('b', { text: v }), h('span', { text: label })]); }

  SH.Router.register('sources', function (params) {
    var list = h('div.source-grid'), subs = [];
    var page = UI.page({ title: 'Sources', actions: [
      UI.button('Add source', { small: true, primary: true, icon: 'plus', fid: 'src-add', run: addDialog }),
      UI.button('Refresh all', { small: true, icon: 'refresh', fid: 'src-all', run: function () { if (!C.sources.length) return; C.syncAll(); UI.toast('Refreshing all sources…'); } })
    ] });
    page.track.appendChild(list);

    function guideLine(s) {
      if (s.epgStatus === 'ok') return h('div.sc-guide', { text: 'Guide · ' + SH.fmt.count(s.epgCount || 0, 'programme') + ' · updated ' + SH.fmt.ago(s.epgAt).toLowerCase() });
      if (s.epgStatus === 'loading') return h('div.sc-guide', { text: 'Guide · downloading…' });
      if (s.epgStatus === 'error') return h('div.sc-guide.err', { text: 'Guide · ' + (s.epgError || 'could not be loaded') });
      return null;
    }
    function draw() {
      var cur = SH.Focus.current, fid = cur && list.contains(cur) ? cur.getAttribute('data-fid') : null;
      SH.clear(list);
      if (!C.sources.length) { list.appendChild(UI.empty('sources', 'No sources connected', 'Add a playlist, an Xtream or Stalker provider, a Jellyfin, Emby or Plex server, or a programme guide. Several sources can be used together and are merged into one library.', [UI.button('Add source', { primary: true, icon: 'plus', fid: 'src-add2', run: addDialog })])); }
      C.sources.forEach(function (s) {
        var n = s.counts, busy = s.status === 'syncing', guideOnly = s.type === 'xmltv', host = C.host(s);
        list.appendChild(h('div.source-card', { 'data-reveal': '1' }, [
          h('div.sc-head', [h('div.sc-ico', { html: SH.icon(C.TYPES[s.type].icon, 30) }), h('div.sc-id', [h('div.sc-name', { text: s.name }), h('div.sc-type', [h('span.tag', { text: C.TYPES[s.type].label }), host ? h('span', { text: host }) : null, s.info ? h('span.sc-info', { text: s.info }) : null])]), UI.sourceBadge(s)]),
          s.status === 'error' ? h('div.sc-error', { text: s.error }) : null,
          h('div.sc-stats', guideOnly ? [stat(String(s.epgCount || 0), 'Programmes'), stat(SH.fmt.ago(s.lastSync), 'Last synchronised')]
            : [stat(n ? String(n.channels) : '–', 'Channels'), stat(n ? String(n.movies) : '–', 'Movies'), stat(n ? String(n.series) : '–', 'Series'), stat(SH.fmt.ago(s.lastSync), 'Last synchronised')]),
          guideOnly ? null : guideLine(s),
          h('div.btn-row', { 'data-nav': 'row' }, [
            UI.button(busy ? 'Refreshing…' : 'Refresh', { small: true, icon: 'refresh', fid: 'r' + s.id, run: function () { if (!busy) C.sync(s.id, function (err) { UI.toast(err ? s.name + ': ' + (err.message || err) : s.name + ' is up to date', err ? 'error' : 'ok'); }); } }),
            s.type === 'plex' ? UI.button('Link again', { small: true, icon: 'user', fid: 'l' + s.id, run: function () { plexFlow(s); } }) : null,
            UI.button('Edit', { small: true, icon: 'edit', fid: 'e' + s.id, run: function () { editForm(s); } }),
            UI.button('Remove', { small: true, icon: 'trash', fid: 'x' + s.id, run: function () { UI.confirm('Remove "' + s.name + '"?', 'Its channels and titles disappear from Streamhaven. Favourites and history are kept in case you add it again.', 'Remove', function () { C.removeSource(s.id); UI.toast('Source removed'); }, true); } })
          ])
        ]));
      });
      if (fid) { var again = list.querySelector('.f[data-fid="' + fid + '"]'); if (again) { SH.Focus.current = null; SH.Focus.set(again); return; } }
      if (cur && !document.body.contains(cur) && !UI.topDialog()) { SH.Focus.current = null; SH.Router.focus(); }
    }
    subs.push(SH.Bus.on('sources:status', draw));
    draw();
    return {
      el: page.el, onData: function () {},
      onShow: function () { if (params.add) { params.add = false; setTimeout(addDialog, 0); } },
      destroy: function () { SH.Bus.off('sources:status', subs[0]); }
    };
  });
})();

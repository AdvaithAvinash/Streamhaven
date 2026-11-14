/* Sources: add, refresh, edit and remove providers. Addresses can carry credentials, so only
 * the host name is ever displayed. */
(function () {
  'use strict';
  var SH = window.SH, h = SH.h, UI = SH.UI, C = SH.Catalog;

  function validUrl(u) { return /^https?:\/\/[^\s\/]+\S*$/i.test(u); }

  function addForm(type) {
    var t = C.TYPES[type];
    if (type === 'demo') {
      if (C.sources.some(function (s) { return s.type === 'demo'; })) { UI.toast('The demo library is already added'); return; }
      C.addSource({ type: 'demo', name: 'Demo library' }); UI.toast('Demo library added'); return;
    }
    UI.form({
      title: 'Add ' + t.label, text: 'Press OK on a field to type. ' + (type === 'm3u' ? 'The playlist is downloaded directly by this TV.' : 'The stream is opened directly by this TV.'), submit: 'Add source',
      fields: [{ key: 'name', label: 'Name', placeholder: type === 'm3u' ? 'My playlist' : 'My stream' }, { key: 'url', label: type === 'm3u' ? 'Playlist address' : 'Stream address', placeholder: 'https://', type: 'url' }],
      onSubmit: function (v) {
        if (!validUrl(v.url)) return 'Enter a full address starting with http:// or https://';
        C.addSource({ type: type, name: v.name || SH.hostOf(v.url) || t.label, url: v.url });
        UI.toast('Source added. Synchronising…');
      }
    });
  }
  function addDialog() {
    var ready = [], planned = [];
    Object.keys(C.TYPES).forEach(function (k) { (C.TYPES[k].ready ? ready : planned).push(k); });
    var d = UI.dialog({ title: 'Add a source', wide: true, body: [
      h('div.menu', { 'data-nav': 'col' }, ready.map(function (k) {
        return h('div.menu-item.tall.f', { _enter: function () { d.close(); addForm(k); } }, [h('span.menu-ico', { html: SH.icon(k === 'demo' ? 'discover' : (k === 'direct' ? 'play' : 'sources'), 26) }), h('div', [h('div', { text: C.TYPES[k].label }), h('div.menu-desc', { text: C.TYPES[k].desc })])]);
      })),
      h('div.planned', [h('span.planned-label', { text: 'Not available in this build yet:' })].concat(planned.map(function (k) { return h('span.tag', { text: C.TYPES[k].label }); })))
    ] });
  }
  function editForm(s) {
    var hasUrl = s.type !== 'demo';
    UI.form({
      title: 'Edit source', submit: 'Save',
      fields: [{ key: 'name', label: 'Name', value: s.name }].concat(hasUrl ? [{ key: 'url', label: 'Address', placeholder: 'Leave empty to keep the current address', type: 'url', hint: 'Current: ' + SH.hostOf(s.url) + ' (full address hidden)' }] : []),
      onSubmit: function (v) {
        if (!v.name) return 'Enter a name.';
        if (v.url && !validUrl(v.url)) return 'Enter a full address starting with http:// or https://';
        C.updateSource(s.id, { name: v.name, url: v.url || '' });
      }
    });
  }

  SH.Router.register('sources', function (params) {
    var list = h('div.source-grid'), subs = [];
    var page = UI.page({ title: 'Sources', actions: [
      UI.button('Add source', { small: true, primary: true, icon: 'plus', fid: 'src-add', run: addDialog }),
      UI.button('Refresh all', { small: true, icon: 'refresh', fid: 'src-all', run: function () { if (!C.sources.length) return; C.syncAll(); UI.toast('Refreshing all sources…'); } })
    ] });
    page.track.appendChild(list);

    function draw() {
      var cur = SH.Focus.current, fid = cur && list.contains(cur) ? cur.getAttribute('data-fid') : null;
      SH.clear(list);
      if (!C.sources.length) { list.appendChild(UI.empty('sources', 'No sources connected', 'Add an M3U playlist or a direct stream address. Several sources can be used together and are merged into one library.', [UI.button('Add source', { primary: true, icon: 'plus', fid: 'src-add2', run: addDialog })])); }
      C.sources.forEach(function (s) {
        var n = s.counts, busy = s.status === 'syncing';
        list.appendChild(h('div.source-card', { 'data-reveal': '1' }, [
          h('div.sc-head', [h('div.sc-ico', { html: SH.icon(s.type === 'demo' ? 'discover' : (s.type === 'direct' ? 'play' : 'sources'), 30) }), h('div.sc-id', [h('div.sc-name', { text: s.name }), h('div.sc-type', [h('span.tag', { text: C.TYPES[s.type].label }), s.url ? h('span', { text: SH.hostOf(s.url) }) : null])]), UI.sourceBadge(s)]),
          s.status === 'error' ? h('div.sc-error', { text: s.error }) : null,
          h('div.sc-stats', [
            h('div', [h('b', { text: n ? String(n.channels) : '–' }), h('span', { text: 'Channels' })]), h('div', [h('b', { text: n ? String(n.movies) : '–' }), h('span', { text: 'Movies' })]),
            h('div', [h('b', { text: n ? String(n.series) : '–' }), h('span', { text: 'Series' })]), h('div', [h('b', { text: SH.fmt.ago(s.lastSync) }), h('span', { text: 'Last synchronised' })])
          ]),
          h('div.btn-row', { 'data-nav': 'row' }, [
            UI.button(busy ? 'Refreshing…' : 'Refresh', { small: true, icon: 'refresh', fid: 'r' + s.id, run: function () { if (!busy) C.sync(s.id, function (err) { UI.toast(err ? s.name + ': ' + (err.message || err) : s.name + ' is up to date', err ? 'error' : 'ok'); }); } }),
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

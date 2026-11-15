/* My List: favourites, saved titles, reminders and custom collections for the active profile. */
(function () {
  'use strict';
  var SH = window.SH, h = SH.h, UI = SH.UI, C = SH.Catalog;

  SH.App = SH.App || {};
  SH.Router.register('mylist', function () {
    var d = SH.Store.data(), now = Date.now();
    var page = UI.page({ title: 'My List', actions: [UI.button('New collection', { small: true, icon: 'plus', fid: 'new-col', run: function () {
      UI.form({ title: 'New collection', submit: 'Create', fields: [{ key: 'name', label: 'Name', placeholder: 'Weekend films' }], onSubmit: function (v) { if (!v.name) return 'Enter a name for the collection.'; SH.Store.addCollection(v.name); SH.Router.refresh(); } });
    } })] });
    var favs = C.channelsBy({ mode: 'fav' }), saved = Object.keys(d.list).map(C.get).filter(Boolean);
    var movies = saved.filter(function (x) { return x.kind === 'movie'; }), series = saved.filter(function (x) { return x.kind === 'series'; });
    var rem = d.reminders.filter(function (r) { return r.e > now && C.get(r.ch); });
    SH.add(page.track, [
      UI.rail('Favourite Channels', favs.map(function (c) { return UI.channelCard(c, favs); })),
      UI.rail('Saved Movies', movies.map(UI.posterCard)),
      UI.rail('Saved Series', series.map(UI.posterCard)),
      UI.rail('Bookmarked Programmes', rem.map(function (r) { var ch = C.get(r.ch), p = SH.Epg.at(ch, r.s + 1000) || r; return UI.progCard(ch, p, function () { SH.App.programmeInfo(ch, p); }); }))
    ]);
    d.collections.forEach(function (col) {
      var items = col.items.map(C.get).filter(Boolean);
      var cards = items.map(function (x) { return x.kind === 'channel' ? UI.channelCard(x, items.filter(function (y) { return y.kind === 'channel'; })) : UI.posterCard(x); });
      cards.push(h('div.card.col-manage.f', { 'data-fid': 'del' + col.id, _enter: function () { UI.confirm('Delete "' + col.name + '"?', 'The collection is removed. The titles and channels in it are not affected.', 'Delete', function () { SH.Store.removeCollection(col.id); SH.Router.refresh(); }, true); } }, [h('div.empty-ico', { html: SH.icon('trash', 32) }), h('div.card-sub', { text: 'Delete collection' })]));
      SH.add(page.track, UI.rail(col.name, cards, { hint: items.length ? SH.fmt.count(items.length, 'item') : 'Empty · add titles from their detail page' }));
    });
    if (!favs.length && !saved.length && !rem.length && !d.collections.length) page.track.appendChild(UI.empty('mylist', 'Your list is empty', 'Favourite channels, saved movies and series, and programme reminders for ' + SH.Store.profile().name + ' appear here.'));
    return { el: page.el };
  });

  /* Add / remove an item in custom collections (used by detail pages and the mini-guide). */
  SH.App.collectionsFor = function (item) {
    var cols = SH.Store.data().collections;
    var opts = cols.map(function (c) { var inC = SH.Store.inCollection(c, item.id); return { label: c.name, icon: inC ? 'check' : 'folder', note: inC ? 'Added' : '', run: function () { SH.Store.toggleInCollection(c, item.id); UI.toast(inC ? 'Removed from ' + c.name : 'Added to ' + c.name); } }; });
    opts.push({ label: 'New collection…', icon: 'plus', run: function () {
      UI.form({ title: 'New collection', submit: 'Create', fields: [{ key: 'name', label: 'Name' }], onSubmit: function (v) { if (!v.name) return 'Enter a name for the collection.'; var c = SH.Store.addCollection(v.name); SH.Store.toggleInCollection(c, item.id); UI.toast('Added to ' + c.name); } });
    } });
    UI.menu('Collections', opts, C.titleOf(item));
  };
})();

/* Persistent navigation sidebar: collapsed to icons, expands while it holds focus. */
(function () {
  'use strict';
  var SH = window.SH, h = SH.h;
  var ITEMS = [['home', 'Home'], ['live', 'Live TV'], ['guide', 'TV Guide'], ['movies', 'Movies'], ['series', 'Series'], ['discover', 'Discover'], ['mylist', 'My List'], ['search', 'Search'], ['sources', 'Sources'], ['settings', 'Settings']];
  var els = {}, active = 'home', profileEl;

  function item(name, label) {
    return (els[name] = h('div.nav-item.f', { _enter: function () { SH.App.go(name); } }, [h('span.nav-ico', { html: SH.icon(name, 30) }), h('span.nav-label', { text: label })]));
  }
  function profileSwitcher() {
    var list = SH.Store.profiles(), cur = SH.Store.profile();
    SH.UI.menu('Who is watching?', list.map(function (p) {
      return { label: p.name, icon: p.id === cur.id ? 'check' : 'user', run: function () { if (p.id !== cur.id) { SH.Store.switchProfile(p.id); SH.UI.toast('Switched to ' + p.name); } } };
    }).concat([{ label: 'Manage profiles', icon: 'settings', run: function () { SH.App.go('settings', { cat: 'profiles' }); } }]));
  }
  function drawProfile() {
    var p = SH.Store.profile();
    SH.clear(profileEl);
    SH.add(profileEl, [h('span.avatar', { text: p.name.charAt(0).toUpperCase(), style: 'background:' + p.color }), h('span.nav-label', [h('span.profile-name', { text: p.name }), h('span.profile-sub', { text: 'Switch profile' })])]);
  }

  var S = SH.Sidebar = {
    ITEMS: ITEMS,
    init: function () {
      profileEl = h('div.nav-item.profile.f', { _enter: profileSwitcher });
      var main = ITEMS.slice(0, 9).map(function (i) { return item(i[0], i[1]); });
      S.el = h('aside#sidebar', { 'data-nav': 'col' }, [
        h('div.brand', [h('span.brand-mark', { html: SH.logo(48) }), h('span.brand-name', { text: 'Streamhaven' })]),
        h('nav.nav-main', main),
        h('div.nav-foot', [item('settings', 'Settings'), profileEl])
      ]);
      S.el._nav = function (dir) {
        if (dir === 'right') { SH.App.focusContent(); return true; }
        return dir === 'left';
      };
      S.el._enterUnit = function () { return els[active] || els.home; };
      document.getElementById('ui').insertBefore(S.el, document.getElementById('screens'));
      drawProfile();
      SH.Bus.on('profile', drawProfile);
      SH.Bus.on('focus', function (el) { S.el.classList.toggle('expanded', S.el.contains(el)); });
    },
    setActive: function (name) { if (els[active]) els[active].classList.remove('active'); active = name; if (els[name]) els[name].classList.add('active'); },
    activeEl: function () { return els[active] || els.home; },
    has: function (el) { return !!el && S.el.contains(el); }
  };
})();

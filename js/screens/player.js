/* Full-screen player with the mini-guide overlay (live) and transport controls (movies, episodes). */
(function () {
  'use strict';
  var SH = window.SH, h = SH.h, UI = SH.UI, C = SH.Catalog, E = SH.Engine;

  SH.Router.register('player', function (params) {
    var item = params.item, list = params.list && params.list.length ? params.list : (item.kind === 'channel' ? C.channels : []), subs = [], hideTimer = null, visible = false, leaving = false;
    var stateEl = h('div.p-state'), bar = h('div.p-bar'), top = h('div.p-top');
    var el = h('div', [stateEl, top, bar]);
    var live = function () { return item.kind === 'channel'; };
    var seekEl = null, timeEl = null, fillEl = null;

    function begin(startAt) {
      if (live() && E.item && E.item.id === item.id && E.active() && E.state !== 'error') E.setRect(null);
      else E.play(item, { rect: null, startAt: startAt || 0 });
    }
    function idx() { for (var i = 0; i < list.length; i++) if (list[i].id === item.id) return i; return -1; }
    function neighbour(d) { var i = idx(), n = list.length; return n > 1 && i >= 0 ? list[(i + d + n) % n] : null; }
    function switchTo(d) { var n = neighbour(d); if (!n) return; item = n; E.play(item, { rect: null }); draw(); show(); }

    function show() {
      if (!visible) { visible = true; bar.classList.remove('hidden'); top.classList.remove('hidden'); draw(); if (!bar.contains(SH.Focus.current) && !stateEl.contains(SH.Focus.current)) SH.Focus.first(bar); }
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function () { if (E.state === 'playing') hide(); }, (SH.Store.get('overlayTimeout') || 5) * 1000);
    }
    function hide() { visible = false; bar.classList.add('hidden'); top.classList.add('hidden'); clearTimeout(hideTimer); }

    function sourcesMenu() {
      UI.menu('Sources for ' + C.titleOf(item), item.streams.map(function (s, i) {
        var src = C.source(s.sourceId);
        return { label: (src ? src.name : 'Source ' + (i + 1)), icon: i === E.streamIndex ? 'check' : 'sources', note: SH.Health.LABEL[SH.Health.statusOf(s.url)], run: function () { E.useStream(i); } };
      }), 'Status reflects real playback attempts on this device.');
    }
    function draw() {
      var fid = SH.Focus.current && bar.contains(SH.Focus.current) ? SH.Focus.current.getAttribute('data-fid') : null;
      SH.clear(bar); SH.clear(top); seekEl = timeEl = fillEl = null;
      top.appendChild(h('div.p-top-right', [UI.clock()]));
      var buttons = [];
      if (live()) {
        var p = SH.Epg.now(item), n = SH.Epg.next(item), prev = neighbour(-1), next = neighbour(1), fav = SH.Store.isFav(item.id);
        buttons.push(UI.button(fav ? 'Favourite' : 'Add to favourites', { icon: fav ? 'heartOn' : 'heart', fid: 'p-fav', auto: true, run: function () { SH.Store.toggleFav(item.id); draw(); show(); } }));
        if (item.streams.length > 1) buttons.push(UI.button('Sources (' + item.streams.length + ')', { icon: 'sources', fid: 'p-src', run: sourcesMenu }));
        if (p) buttons.push(UI.button('Programme info', { icon: 'info', fid: 'p-info', run: function () { SH.App.programmeInfo(item, SH.Epg.now(item), true); } }));
        SH.add(bar, [
          prev ? h('div.p-neighbour', [h('span', { html: SH.icon('up', 20) }), h('span.ch-num', { text: prev.num }), h('span', { text: prev.name })]) : null,
          h('div.p-main', [
            UI.art(item.logo, item.name, 'logo', true),
            h('div.p-info', [
              h('div.p-ch', [h('span.ch-num', { text: item.num }), h('span.p-ch-name', { text: item.name }), UI.live(), SH.Store.get('showHealth') ? UI.health(item, E.streamIndex) : null]),
              h('div.p-title', { text: p ? p.t : 'No programme information' }),
              p ? h('div.p-row', [h('span', { text: SH.fmt.range(p.s, p.e) }), UI.progress(SH.Epg.progress(p))]) : null,
              n ? h('div.p-next', { text: 'Next · ' + SH.fmt.time(n.s) + '  ' + n.t }) : null
            ]),
            h('div.btn-row', { 'data-nav': 'row' }, buttons)
          ]),
          next ? h('div.p-neighbour', [h('span', { html: SH.icon('down', 20) }), h('span.ch-num', { text: next.num }), h('span', { text: next.name })]) : null
        ]);
      } else {
        var paused = E.state === 'paused', nextEp = item.kind === 'episode' ? C.nextEpisode(item) : null;
        fillEl = h('i'); timeEl = h('div.p-times', [h('span'), h('span')]);
        seekEl = h('div.p-seek.f', { 'data-fid': 'p-seek' }, [h('div.bar.big', [fillEl])]);
        buttons.push(UI.button(paused ? 'Play' : 'Pause', { icon: paused ? 'play' : 'pause', primary: true, fid: 'p-pp', auto: true, run: function () { E.toggle(); } }));
        buttons.push(UI.button('Start over', { icon: 'restart', fid: 'p-restart', run: function () { E.play(item, { rect: null }); } }));
        if (nextEp) buttons.push(UI.button('Next episode', { icon: 'next', fid: 'p-next', run: function () { item = nextEp; E.play(item, { rect: null }); draw(); show(); } }));
        if (item.streams.length > 1) buttons.push(UI.button('Sources (' + item.streams.length + ')', { icon: 'sources', fid: 'p-src', run: sourcesMenu }));
        var ser = item.kind === 'episode' ? C.seriesOf(item) : null;
        SH.add(bar, [h('div.p-main.vod', [
          h('div.p-info', [h('div.p-title', { text: ser ? ser.title : item.title }), ser ? h('div.p-next', { text: 'S' + item.season + ' E' + item.number + ' · ' + item.title }) : null]),
          seekEl, timeEl, h('div.btn-row', { 'data-nav': 'row' }, buttons)
        ])]);
        drawTime();
      }
      if (fid) { var again = bar.querySelector('[data-fid="' + fid + '"]'); if (again) { SH.Focus.current = null; SH.Focus.set(again); } }
      else if (visible && !stateEl.contains(SH.Focus.current)) SH.Focus.first(bar);
    }
    function drawTime() {
      if (!fillEl) return; var pos = E.position(), dur = E.duration();
      fillEl.style.width = (dur ? SH.clamp(pos / dur, 0, 1) * 100 : 0) + '%';
      timeEl.firstChild.textContent = SH.fmt.pos(pos); timeEl.lastChild.textContent = dur ? '-' + SH.fmt.pos(dur - pos) : '';
    }
    function drawState() {
      var s = E.state; SH.clear(stateEl);
      if (s === 'loading') SH.add(stateEl, [h('div.spinner'), h('div.vs-sub', { text: E.retries ? 'Reconnecting…' : 'Starting ' + C.titleOf(item) + '…' })]);
      else if (s === 'buffering') stateEl.appendChild(h('div.spinner'));
      else if (s === 'error') {
        var multi = item.streams.length > 1;
        SH.add(stateEl, [h('div.p-error', [
          h('div.vs-ico', { html: SH.icon('alert', 52) }), h('h2', { text: live() ? 'This channel is unavailable right now' : 'This title could not be played' }), h('p', { text: E.error }),
          h('div.btn-row', { 'data-nav': 'row' }, [
            UI.button('Try again', { primary: true, icon: 'refresh', run: function () { E.retry(); } }),
            multi ? UI.button('Try another source', { icon: 'sources', run: function () { E.nextStream(); } }) : null,
            UI.button('Go back', { icon: 'back', run: function () { SH.Router.back(); } })
          ])
        ])]);
        hide(); SH.Focus.first(stateEl);
      }
      if (s === 'ended' && !leaving) {
        var nx = item.kind === 'episode' ? C.nextEpisode(item) : null;
        if (nx) { item = nx; UI.toast('Next: S' + nx.season + ' E' + nx.number + ' · ' + nx.title); E.play(item, { rect: null }); draw(); show(); }
        else { leaving = true; SH.Router.back(); }
        return;
      }
      if (s === 'playing' || s === 'paused') { if (visible) draw(); if (!SH.Focus.current || !document.body.contains(SH.Focus.current)) { SH.Focus.current = null; if (visible) SH.Focus.first(bar); } if (s === 'paused') show(); }
    }
    function on(ev, fn) { subs.push([ev, SH.Bus.on(ev, fn)]); }
    on('player:state', drawState);
    on('player:time', function () { if (visible) drawTime(); });
    on('health', function () { if (visible && live()) draw(); });

    hide();
    return {
      el: el, fullscreen: true,
      focus: function () { return true; },
      onShow: function () {
        var hist = params.resume && !live() ? SH.Store.progress(item.id) : null;
        begin(hist && (!hist.dur || hist.pos < hist.dur * 0.95) ? hist.pos : 0);
        drawState(); show();
      },
      onData: function () {},
      tick: function () { if (visible && live()) draw(); },
      onKey: function (key) {
        if (UI.topDialog()) return false;
        if (E.state === 'error') return false;                 // error panel: normal focus navigation
        if (key === 'back') { if (visible && E.state === 'playing') { hide(); return true; } return false; }
        if (key === 'stop') { SH.Router.back(); return true; }
        if (key === 'playpause' || key === 'play' || key === 'pause') { if (!live()) E.toggle(); show(); return true; }
        if (key === 'chup' || key === 'chdown') { if (live()) switchTo(key === 'chup' ? 1 : -1); return true; }
        if (live() && (key === 'up' || key === 'down')) { switchTo(key === 'up' ? -1 : 1); return true; }
        if (!live() && (key === 'ff' || key === 'rw')) { E.seekBy(key === 'ff' ? 30 : -30); show(); return true; }
        if (!live() && (key === 'left' || key === 'right') && (!visible || SH.Focus.current === seekEl)) { E.seekBy(key === 'right' ? 10 : -10); show(); if (seekEl) SH.Focus.set(seekEl); drawTime(); return true; }
        if (!visible) { show(); return true; }
        show(); return false;                                  // overlay visible: default navigation
      },
      destroy: function () {
        clearTimeout(hideTimer); subs.forEach(function (s) { SH.Bus.off(s[0], s[1]); });
        var below = SH.Router.stack[SH.Router.stack.length - 1];
        if (!(below && below.name === 'live' && E.isLive())) E.stop();
        if (below && (below.name === 'home' || below.name === 'mylist' || below.name === 'discover')) below.stale = true;   // history changed
      }
    };
  });
})();

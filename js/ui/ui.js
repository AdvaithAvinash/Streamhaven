/* Reusable UI components: artwork, cards, rails, hero, page scaffold, dialogs, forms, toasts. */
(function () {
  'use strict';
  var SH = window.SH, h = SH.h;
  var UI = SH.UI = { dialogs: [] };

  /* ---- lazy images: only load artwork that is on or near the screen ---- */
  UI.lazy = SH.debounce(function () {
    var imgs = document.querySelectorAll('img[data-src]'), W = window.innerWidth, H = window.innerHeight;
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i], p = im.parentNode;
      if (!p || p.offsetParent === null) continue;
      var r = p.getBoundingClientRect();
      if (r.right > -W * 0.4 && r.left < W * 1.4 && r.bottom > -H * 0.4 && r.top < H * 1.4) { im.src = im.getAttribute('data-src'); im.removeAttribute('data-src'); }
    }
  }, 100);
  SH.Bus.on('focus', function () { UI.lazy(); });

  /* Artwork with a typographic fallback tile, so a missing logo or poster never leaves a hole. */
  UI.art = function (url, label, cls, initials) {
    var el = h('div.art' + (cls ? '.' + cls : '')), text = label || '';
    if (initials) text = text.replace(/[^A-Za-z0-9À-￿ ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(function (x) { return x.charAt(0).toUpperCase(); }).join('');
    el.style.backgroundColor = 'hsl(' + (SH.hash(label || '') % 360) + ',26%,19%)';
    el.appendChild(h('span.art-label', { text: text }));
    if (url) {
      var img = document.createElement('img');
      img.setAttribute('data-src', url); img.alt = '';
      img.onload = function () { img.className = 'loaded'; };
      img.onerror = function () { if (img.parentNode) img.parentNode.removeChild(img); };
      el.appendChild(img);
    }
    return el;
  };

  /* ---- small pieces ---- */
  UI.clock = function () { return h('span.clock', { text: SH.fmt.time(Date.now()) }); };
  setInterval(function () { var c = document.querySelectorAll('.clock'), t = SH.fmt.time(Date.now()); for (var i = 0; i < c.length; i++) c[i].textContent = t; }, 15000);

  UI.button = function (label, o) {
    o = o || {};
    var b = h('div.btn.f' + (o.primary ? '.primary' : '') + (o.small ? '.small' : '') + (o.danger ? '.danger' : ''), { _enter: o.run, 'data-fid': o.fid, 'data-autofocus': o.auto ? '1' : null });
    if (o.icon) b.appendChild(h('span.btn-ico', { html: SH.icon(o.icon, o.small ? 22 : 26) }));
    if (label) b.appendChild(h('span.btn-label', { text: label }));
    return b;
  };
  UI.chip = function (label, o) {
    o = o || {};
    var c = h('div.chip.f' + (o.active ? '.active' : ''), { _enter: o.run, 'data-fid': o.fid }, [h('span', { text: label })]);
    if (o.caret) c.appendChild(h('span.chip-caret', { html: SH.icon('caret', 20) }));
    return c;
  };
  UI.progress = function (frac, cls) { return h('div.bar' + (cls ? '.' + cls : ''), [h('i', { style: 'width:' + Math.round(SH.clamp(frac, 0, 1) * 100) + '%' })]); };
  UI.live = function () { return h('span.live', [h('i'), 'LIVE']); };
  UI.health = function (item, idx, dotOnly) {
    var st = SH.Health.status(item, idx);
    return h('span.health.h-' + st + (dotOnly ? '.dot-only' : ''), [h('i'), dotOnly ? null : h('span', { text: SH.Health.LABEL[st] })]);
  };
  UI.empty = function (icon, title, text, buttons) {
    return h('div.empty', [h('div.empty-ico', { html: SH.icon(icon, 56) }), h('h2', { text: title }), text ? h('p', { text: text }) : null, buttons && buttons.length ? h('div.btn-row', { 'data-nav': 'row' }, buttons) : null]);
  };

  /* ---- page scaffold: optional header + vertically scrolling track ---- */
  UI.page = function (o) {
    o = o || {};
    var el = h('div'), head = null;
    if (!o.noHead) {
      head = h('div.screen-head', [h('h1', { text: o.title || '' }), o.actions ? h('div.head-actions', { 'data-nav': 'row' }, o.actions) : null, h('div.head-right', [UI.clock()])]);
      el.appendChild(head);
    }
    var track = h('div.page-track'), view = h('div.page-view' + (o.noHead ? '.full' : ''), [track]);
    new SH.Scroller(view, track, 'y', 28);
    el.appendChild(view);
    return { el: el, head: head, view: view, track: track };
  };

  /* ---- horizontal rail ---- */
  UI.rail = function (title, cards, o) {
    if (!cards || !cards.length) return null;
    o = o || {};
    var track = h('div.rail-track', cards), view = h('div.rail-view', { 'data-nav': 'row' }, [track]);
    new SH.Scroller(view, track, 'x', 12);
    return h('section.rail', { 'data-reveal': '1' }, [h('div.rail-head', [h('h2', { text: title }), o.hint ? h('span.rail-hint', { text: o.hint }) : null]), view]);
  };

  /* ---- hero banner ---- */
  UI.hero = function (o) {
    var body = h('div.hero-body', [
      o.eyebrow ? h('div.hero-eyebrow', o.eyebrow) : null,
      o.logo ? h('div.hero-titlerow', [o.logo, h('h1', { text: o.title })]) : h('h1', { text: o.title }),
      o.meta && o.meta.length ? h('div.meta', o.meta.filter(Boolean).map(function (m) { return h('span', { text: m }); })) : null,
      o.extra || null,
      o.text ? h('p.hero-text', { text: o.text }) : null,
      h('div.btn-row', { 'data-nav': 'row' }, o.buttons)
    ]);
    return h('section.hero' + (o.compact ? '.compact' : ''), { 'data-reveal': '1' }, [UI.art(o.art, o.title, 'hero-art'), h('div.hero-shade'), body]);
  };

  /* ---- cards ---- */
  UI.open = function (item, list) {
    if (item.kind === 'channel') SH.Router.push('player', { item: item, list: list });
    else if (item.kind === 'episode') SH.Router.push('player', { item: item, resume: true });
    else SH.Router.push('detail', { id: item.id });
  };
  UI.posterCard = function (item) {
    var sub = [item.year || null, item.kind === 'series' ? SH.fmt.count(item.seasons.length, 'season') : null].filter(Boolean).join(' · ');
    return h('div.card.poster.f', { 'data-fid': item.id, _enter: function () { UI.open(item); } }, [
      UI.art(item.poster, item.title), h('div.card-title', { text: item.title }), h('div.card-sub', { text: sub || (item.genres[0] || '') })
    ]);
  };
  UI.wideCard = function (item, hist) {
    var parent = item.kind === 'episode' ? SH.Catalog.seriesOf(item) : item, left = hist.dur ? Math.max(1, Math.round((hist.dur - hist.pos) / 60)) + ' min left' : 'Resume';
    var el = h('div.card.wide.f', { 'data-fid': 'cw' + item.id, _enter: function () { SH.Router.push('player', { item: item, resume: true }); } }, [
      UI.art(parent.backdrop || parent.poster, parent.title),
      hist.dur ? UI.progress(hist.pos / hist.dur, 'on-art') : null,
      h('div.card-title', { text: parent.title }),
      h('div.card-sub', { text: (item.kind === 'episode' ? 'S' + item.season + ' E' + item.number + ' · ' : '') + left })
    ]);
    el._menu = function () {
      UI.menu(SH.Catalog.titleOf(item), [
        { label: 'Resume', icon: 'play', run: function () { SH.Router.push('player', { item: item, resume: true }); } },
        { label: 'Start from the beginning', icon: 'restart', run: function () { SH.Router.push('player', { item: item }); } },
        { label: 'Details', icon: 'info', run: function () { SH.Router.push('detail', { id: parent.id }); } },
        { label: 'Remove from history', icon: 'trash', run: function () { SH.Store.removeHistory(item.id); SH.Router.refresh(); } }
      ]);
    };
    return el;
  };
  UI.channelCard = function (ch, list) {
    var p = SH.Epg.now(ch);
    return h('div.card.channel.f', { 'data-fid': ch.id, _enter: function () { UI.open(ch, list); } }, [
      h('div.ch-top', [UI.art(ch.logo, ch.name, 'logo', true), h('div.ch-id', [h('div.card-title', { text: ch.name }), h('div.ch-group', { text: ch.group })]), UI.live()]),
      h('div.ch-now', { text: p ? p.t : 'No programme information' }),
      p ? UI.progress(SH.Epg.progress(p)) : h('div.bar.off')
    ]);
  };
  UI.progCard = function (ch, p, run) {
    var now = Date.now(), live = p.s <= now && p.e > now;
    return h('div.card.prog.f', { 'data-fid': 'p' + ch.id + p.s, _enter: run }, [
      h('div.prog-when', [live ? UI.live() : h('span', { text: SH.fmt.day(p.s) + ' · ' + SH.fmt.time(p.s) })]),
      h('div.card-title', { text: p.t }),
      h('div.card-sub', { text: ch.name })
    ]);
  };
  /* Channel row used by the Live TV browser and guide pickers. */
  UI.channelRow = function (ch, o) {
    o = o || {};
    var p = SH.Epg.now(ch);
    return h('div.ch-row.f' + (o.tuned ? '.tuned' : ''), { 'data-fid': ch.id }, [
      h('span.ch-num', { text: ch.num }),
      UI.art(ch.logo, ch.name, 'logo', true),
      h('div.ch-row-text', [h('div.ch-row-name', { text: ch.name }), h('div.ch-row-now', { text: p ? p.t : ch.group })]),
      SH.Store.isFav(ch.id) ? h('span.ch-fav', { html: SH.icon('heartOn', 20) }) : null,
      SH.Store.get('showHealth') ? UI.health(ch, 0, true) : null
    ]);
  };
  UI.sourceBadge = function (src) {
    var map = { ok: ['Connected', 'healthy'], error: ['Connection failed', 'down'], syncing: ['Synchronising…', 'slow'], never: ['Not synchronised', 'untested'] }, m = map[src.status] || map.never;
    return h('span.health.h-' + m[1], [h('i'), h('span', { text: m[0] })]);
  };

  /* ---- dialogs ---- */
  UI.topDialog = function () { return UI.dialogs.length ? UI.dialogs[UI.dialogs.length - 1] : null; };
  UI.dialog = function (o) {
    var box = h('div.dialog' + (o.wide ? '.wide' : ''), [o.title ? h('h2', { text: o.title }) : null, o.text ? h('p.dialog-text', { text: o.text }) : null]);
    var body = h('div.dialog-body'); if (o.body) SH.add(body, o.body); box.appendChild(body);
    var d = { el: h('div.overlay', [box]), body: body, onKey: o.onKey, prev: SH.Focus.current, closed: false };
    d.close = function () {
      if (d.closed) return; d.closed = true;
      var i = UI.dialogs.indexOf(d); if (i >= 0) UI.dialogs.splice(i, 1);
      i = SH.Focus.scopes.indexOf(d.el); if (i >= 0) SH.Focus.scopes.splice(i, 1);
      if (d.el.parentNode) d.el.parentNode.removeChild(d.el);
      var want = SH.Focus.pending || d.prev; SH.Focus.pending = null;
      if (want && document.body.contains(want) && SH.Focus.inScope(want)) SH.Focus.set(want);
      else if (d.prev && document.body.contains(d.prev) && SH.Focus.inScope(d.prev)) SH.Focus.set(d.prev);
      else { SH.Focus.current = null; SH.Focus.ensure(); }
      if (o.onClose) o.onClose();
    };
    if (o.buttons) {
      box.appendChild(h('div.btn-row.dialog-actions', { 'data-nav': 'row' }, o.buttons.map(function (b) {
        return UI.button(b.label, { primary: b.primary, danger: b.danger, auto: b.primary, run: function () { if (!b.keep) d.close(); if (b.run) b.run(d); } });
      })));
    }
    document.getElementById('overlays').appendChild(d.el);
    UI.dialogs.push(d); SH.Focus.scopes.push(d.el); SH.Focus.pending = null;
    if (!SH.Focus.first(d.el)) { if (SH.Focus.current) SH.Focus.current.classList.remove('is-focused'); SH.Focus.current = null; }
    return d;
  };
  UI.confirm = function (title, text, okLabel, run, danger) {
    return UI.dialog({ title: title, text: text, buttons: [{ label: 'Cancel' }, { label: okLabel, primary: !danger, danger: danger, run: run }] });
  };
  UI.menu = function (title, options, text) {
    var d = UI.dialog({ title: title, text: text, body: h('div.menu', { 'data-nav': 'col' }, options.map(function (op) {
      return h('div.menu-item.f', { _enter: function () { if (!op.keep) d.close(); op.run(d); } }, [op.icon ? h('span.menu-ico', { html: SH.icon(op.icon, 24) }) : null, h('span', { text: op.label }), op.note ? h('span.menu-note', { text: op.note }) : null]);
    })) });
    return d;
  };
  /* Long option lists (categories, countries, years) - virtualised. */
  UI.picker = function (o) {
    var rowH = 68, rows = Math.min(o.options.length, 9), start = 0, d;
    for (var i = 0; i < o.options.length; i++) if (o.options[i].value === o.value) start = i;
    var grid = new SH.VGrid({
      items: o.options, cols: 1, cellW: 700, cellH: rowH, height: rows * rowH, center: true,
      render: function (op) { return h('div.menu-item.f' + (op.value === o.value ? '.selected' : ''), { _enter: function () { d.close(); o.onPick(op.value, op); } }, [h('span', { text: op.label }), op.note ? h('span.menu-note', { text: op.note }) : null, op.value === o.value ? h('span.menu-check', { html: SH.icon('check', 22) }) : null]); }
    });
    d = UI.dialog({ title: o.title, body: grid.el });
    grid.focus(start);
    return d;
  };
  /* Text entry uses the platform keyboard (Samsung IME on TV): press OK on a field to edit. */
  UI.form = function (o) {
    var inputs = {}, err = h('div.form-error'), d;
    var fields = o.fields.map(function (f, i) {
      var input = h('input', { type: f.type || 'text', value: f.value || '', placeholder: f.placeholder || '', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', tabindex: '-1' });
      var wrap = h('div.field.f', { 'data-autofocus': i === 0 ? '1' : null, _enter: function () { input.focus(); } }, [h('label', { text: f.label }), input, f.hint ? h('div.field-hint', { text: f.hint }) : null]);
      input.addEventListener('focus', function () { wrap.classList.add('editing'); }, false);
      input.addEventListener('blur', function () { wrap.classList.remove('editing'); }, false);
      inputs[f.key] = input; return wrap;
    });
    d = UI.dialog({
      title: o.title, text: o.text, wide: true, body: [h('div.form', { 'data-nav': 'col' }, fields), err],
      buttons: [{ label: 'Cancel' }, { label: o.submit || 'Save', primary: true, keep: true, run: function () {
        var vals = {}; for (var k in inputs) vals[k] = inputs[k].value.replace(/^\s+|\s+$/g, '');
        var e = o.onSubmit(vals); if (e) err.textContent = e; else d.close();
      } }]
    });
    return d;
  };
  UI.pin = function (title, cb) {
    var val = '', dots = h('div.pin-dots'), d;
    function draw() { SH.clear(dots); for (var i = 0; i < 4; i++) dots.appendChild(h('i' + (i < val.length ? '.on' : ''))); }
    function press(k) {
      if (k === 'del') val = val.slice(0, -1); else if (val.length < 4) val += k;
      draw(); if (val.length === 4) { var v = val; d.close(); cb(v); }
    }
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map(function (k) {
      if (!k) return h('div.pin-key.blank');
      return h('div.pin-key.f', { _enter: function () { press(k); }, 'data-autofocus': k === '1' ? '1' : null, html: k === 'del' ? SH.icon('backspace', 26) : null, text: k === 'del' ? null : k });
    });
    d = UI.dialog({ title: title, body: [dots, h('div.pin-pad', keys)], onKey: function (key) { if (/^\d$/.test(key)) { press(key); return true; } return false; } });
    draw(); return d;
  };

  UI.toast = function (msg, kind) {
    var host = document.getElementById('toasts'), t = h('div.toast' + (kind ? '.' + kind : ''), { text: msg });
    host.appendChild(t);
    while (host.children.length > 3) host.removeChild(host.firstChild);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 4000);
  };

  /* Ask for the parental PIN when one is set. */
  UI.guard = function (run) {
    var pin = SH.Store.get('pin'); if (!pin) return run();
    UI.pin('Enter PIN', function (v) { if (v === pin) run(); else UI.toast('Incorrect PIN', 'error'); });
  };
})();

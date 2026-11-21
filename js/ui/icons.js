/* Inline icon set: 24px grid, 1.8 stroke, rounded joins. One visual language across the app. */
(function () {
  'use strict';
  var P = {
    home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6.5 10v9.5h11V10"/><path d="M10 19.5v-5h4v5"/>',
    live: '<rect x="3" y="6" width="18" height="12.5" rx="2.2"/><path d="M8.5 3 12 6l3.5-3"/><path d="m10.5 10 4 2.3-4 2.3z" fill="currentColor"/>',
    guide: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.2"/><path d="M3.5 9.5h17M9 9.5v10M9 14.5h11.5"/>',
    movies: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.2"/><path d="M8 4.5v15M16 4.5v15M3.5 9.5H8M3.5 14.5H8M16 9.5h4.5M16 14.5h4.5"/>',
    series: '<rect x="3" y="8" width="14" height="11" rx="2"/><path d="M7 5h12a2 2 0 0 1 2 2v9"/>',
    discover: '<circle cx="12" cy="12" r="8.5"/><path d="m15.2 8.8-1.9 4.5-4.5 1.9 1.9-4.5z"/>',
    mylist: '<path d="M6.5 4h11a1 1 0 0 1 1 1v15l-6.5-4.2L5.5 20V5a1 1 0 0 1 1-1z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    sources: '<ellipse cx="12" cy="6.5" rx="7.5" ry="3"/><path d="M4.5 6.5v5.5c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6.5M4.5 12v5.5c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V12"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>',
    sports: '<circle cx="12" cy="12" r="8.5"/><path d="m12 8.2 3.5 2.5-1.3 4.1H9.8l-1.3-4.1zM12 3.5v4.7M15.5 10.7l4.3-1.4M14.2 14.8l2.7 3.6M9.8 14.8l-2.7 3.6M8.5 10.7 4.2 9.3"/>',
    play: '<path d="M7.5 4.8v14.4L19.5 12z" fill="currentColor"/>',
    pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
    heartOn: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" fill="currentColor"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.2"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
    edit: '<path d="M5 19h3.5L19 8.5 15.5 5 5 15.5z"/>',
    trash: '<path d="M5 7h14M9.5 7V4.5h5V7M7 7l1 12.5h8L17 7"/>',
    bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5h-14z"/><path d="M10.5 20.5h3"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
    caret: '<path d="m7 10 5 5 5-5"/>',
    right: '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
    up: '<path d="m6 14.5 6-6 6 6"/>', down: '<path d="m6 9.5 6 6 6-6"/>',
    shuffle: '<path d="M4 7h3.5c5 0 5 10 10 10H20M4 17h3.5c1.6 0 2.7-1 3.6-2.4M20 7h-2.5c-1.6 0-2.7 1-3.6 2.4"/><path d="m17.5 4.5 2.5 2.5-2.5 2.5M17.5 14.5 20 17l-2.5 2.5"/>',
    restart: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>',
    next: '<path d="M6 5v14l10-7z" fill="currentColor"/><path d="M18.5 5v14"/>',
    user: '<circle cx="12" cy="8.5" r="3.7"/><path d="M4.5 20c.8-3.8 3.8-5.5 7.5-5.5s6.700 1.700 7.500 5.500"/>',
    lock: '<rect x="5.500" y="10.500" width="13" height="9.500" rx="2"/><path d="M8.500 10.500V8a3.500 3.500 0 0 1 7 0v2.500"/>',
    backspace: '<path d="M9 5.500h10.500v13H9L3.500 12z"/><path d="m11.500 9.500 5 5M16.500 9.500l-5 5"/>',
    tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8.500 20h7"/>',
    folder: '<path d="M3.500 7a1.500 1.500 0 0 1 1.500-1.500h4.500l2 2.500H19a1.500 1.500 0 0 1 1.500 1.500v8A1.500 1.500 0 0 1 19 19H5a1.500 1.500 0 0 1-1.500-1.500z"/>',
    alert: '<path d="M12 4.500 21 19.500H3z"/><path d="M12 10.500v4M12 17v.2"/>'
  };
  window.SH.icon = function (name, size) {
    return '<svg class="ico" viewBox="0 0 24 24" width="' + (size || 28) + '" height="' + (size || 28) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (P[name] || '') + '</svg>';
  };
  window.SH.logo = function (size) {
    return '<svg viewBox="0 0 48 48" width="' + size + '" height="' + size + '" fill="none"><rect x="2" y="2" width="44" height="44" rx="12" fill="#398BFF"/><path d="M11 30a13 13 0 0 1 26 0" stroke="#F5F7FC" stroke-width="3.6" stroke-linecap="round"/><path d="M20.500 24.500v11l9-5.500z" fill="#F5F7FC"/><path d="M24 11v3.500" stroke="#45D6E8" stroke-width="3.600" stroke-linecap="round"/></svg>';
  };
})();

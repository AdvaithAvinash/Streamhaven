/* Samsung remote + desktop keyboard mapping. Emits logical key names to SH.App.onKey. */
(function () {
  'use strict';
  var SH = window.SH;
  var MAP = {
    37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'enter',
    10009: 'back', 27: 'back', 8: 'back',
    10252: 'playpause', 415: 'play', 19: 'pause', 413: 'stop', 412: 'rw', 417: 'ff',
    427: 'chup', 428: 'chdown', 33: 'chup', 34: 'chdown', 179: 'playpause', 178: 'stop', 176: 'ff', 177: 'rw',
    403: 'red', 404: 'green', 405: 'yellow', 406: 'blue',
    457: 'info', 458: 'guide', 10073: 'chlist', 10182: 'exit'
  };
  var TIZEN_KEYS = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaRewind', 'MediaFastForward',
    'ChannelUp', 'ChannelDown', 'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', 'Info', 'Guide', 'ChannelList',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  var IME_DONE = 65376, IME_CANCEL = 65385;
  var enterDown = false, longTimer = null;

  function send(key, ev) { if (SH.App) SH.App.onKey(key, ev); }

  SH.Keys = {
    init: function () {
      if (window.tizen && tizen.tvinputdevice) {
        for (var i = 0; i < TIZEN_KEYS.length; i++) { try { tizen.tvinputdevice.registerKey(TIZEN_KEYS[i]); } catch (e) {} }
      }
      document.addEventListener('keydown', function (ev) {
        var code = ev.keyCode, ae = document.activeElement;
        /* Native text entry (Samsung IME / desktop keyboard) owns the keys until it is dismissed. */
        if (ae && ae.tagName === 'INPUT') {
          if (code === 13 || code === IME_DONE || code === IME_CANCEL || code === 10009 || code === 27 || code === 38 || code === 40) {
            ev.preventDefault(); ae.blur();
            if (code === 38 || code === 40) send(MAP[code], ev);
          }
          return;
        }
        var key = MAP[code];
        if (!key && code >= 48 && code <= 57 && !ev.shiftKey) key = String(code - 48);
        if (!key && code >= 96 && code <= 105) key = String(code - 96);
        if (!key) { if (SH.App && SH.App.onRaw) SH.App.onRaw(ev); return; }
        if (code === 8 && SH.App && SH.App.onRaw && SH.App.onRaw(ev)) { ev.preventDefault(); return; }
        ev.preventDefault();
        if (key === 'enter') {
          if (enterDown) return;            // ignore auto-repeat while held
          enterDown = true;
          var el = SH.Focus.current;
          if (el && el._menu && SH.Focus.inScope(el)) {
            longTimer = setTimeout(function () { longTimer = null; el._menu(el); }, 550);
          } else send('enter', ev);
          return;
        }
        send(key, ev);
      }, false);
      document.addEventListener('keyup', function (ev) {
        if (ev.keyCode !== 13) return;
        enterDown = false;
        if (longTimer) { clearTimeout(longTimer); longTimer = null; send('enter', ev); }
      }, false);
    }
  };
})();

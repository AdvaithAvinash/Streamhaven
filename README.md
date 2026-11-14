# Streamhaven

A clean, premium IPTV and media app for Samsung Tizen TVs. Dependency-free web app: plain ES5 JavaScript, flexbox-only CSS, no build step.

## Status

This is the first milestone: the complete UI shell and navigation system, driven by real data.

| Area | State |
| --- | --- |
| Sidebar, Home, Live TV, TV Guide, Movies, Series, Discover, My List, Search, Sources, Settings, detail page, full-screen player | Implemented |
| Samsung remote navigation (arrows, OK, BACK, media keys, CH+/-, long-press OK) | Implemented |
| M3U playlists, direct stream URLs, multi-source merge, alternative streams | Implemented |
| Playback engine (AVPlay with HTML5 fallback), watchdogs, retry, stream health | Implemented, **AVPlay path not yet run on a TV** |
| Profiles, favourites, My List, collections, reminders, PIN, backup | Implemented |
| Xtream Codes, Stalker, Jellyfin, Plex, Emby | Not yet (listed as unavailable in the app) |
| XMLTV guide import, catch-up, QR companion setup | Not yet |

Guide data currently comes only from the opt-in demo library; M3U channels show "No programme information" until XMLTV import lands.

## Run

Desktop preview (arrow keys, Enter, Esc = BACK, PageUp/PageDown = CH+/-):

```bash
node tools/dev-server.js
```

Then open http://localhost:8080. Choose "Explore the demo library" or add `http://localhost:8080/tools/sample.m3u` as an M3U source. Desktop browsers block cross-origin playlists without CORS headers and most cannot play HLS; the TV has neither limit.

On a TV: import the folder into Tizen Studio as a TV web app (or `tizen package -t wgt`), sign it with your certificate and install. `config.xml` targets Tizen 3.0+.

## Architecture

```
index.html, config.xml
css/        base (stage, sidebar, focus) · components · screens
js/core/    util (DOM builder, bus, storage) · store (settings, profiles) · keys · focus · router
js/data/    m3u parser · epg · health · demo library · catalog (sources, sync, merge, search)
js/player/  engine (AVPlay / HTML5 backends, state machine, watchdogs)
js/ui/      icons · ui (cards, rails, hero, dialogs, forms) · vgrid (virtual list/grid) · sidebar
js/screens/ one file per screen
js/app.js   key routing, BACK logic, theming, reminders, lifecycle
```

- **Focus** is a CSS class managed by `js/core/focus.js`, never DOM focus. Elements with class `f` are focusable; `data-nav="row|col|panel"` groups remember their last item, and off-screen rail items never take part in spatial search.
- **Long lists** (channels, poster grids, pickers, guide rows) are virtualised.
- **Stream health** is recorded only from real playback (start-up time, failures, stalls), never from a URL check.
- **Compatibility**: no CSS variables, grid or `gap`; the accent colour is injected as a small stylesheet. The layout is authored at 1920×1080 and scaled.

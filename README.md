# Streamhaven

A clean, premium IPTV and media app for Samsung Tizen TVs. Dependency-free web app: plain ES5 JavaScript, flexbox-only CSS, no build step.

## Status

| Area | State |
| --- | --- |
| UI shell: Home, Live TV, TV Guide, Movies, Series, Discover, My List, Search, Sources, Settings, detail page, full-screen player | Implemented |
| Samsung remote navigation (arrows, OK, BACK, media keys, CH+/-, long-press OK) | Implemented, tested with simulated keys only |
| M3U playlists, direct stream URLs, multi-source merge, alternative streams | Implemented |
| **Xtream Codes** (live, movies, series, guide, catch-up) | Implemented, tested against a mock server |
| **XMLTV guide** (`.xml` and `.xml.gz`, from playlists, Xtream, or a standalone source) | Implemented, tested |
| **Jellyfin** and **Emby** (movies, series) | Implemented, tested against a mock server |
| **Plex** (link with a plex.tv code, movies, shows) | Implemented, tested against a mock server |
| **Stalker Portal** (live, movies, guide) | Implemented, tested against a mock server, **Android only** (see below) |
| Playback engine (AVPlay with HTML5 + hls.js fallback), watchdogs, retry, stream health | Implemented; **AVPlay path never run on a real TV** |
| Profiles, favourites, My List, collections, reminders, PIN, backup | Implemented |
| **Live Sports** (Matchora API: live matches, fixtures, channels, embedded player) | Implemented against the documented endpoints; **response format unverified** (see below) |
| QR companion setup, Stalker series, Jellyfin/Emby live TV, watch-state sync back to servers | Not yet |

Nothing has been tried against a real Xtream, Stalker, Jellyfin, Emby or Plex server yet; the clients follow the public protocols and were exercised against mocks written from them.

### Live Sports (Matchora)

The Live Sports section uses the public Matchora API at `https://matchora.to` (`/api/v1/live`, `/schedule`, `/events/{id}`).

- **No stream addresses are exposed by the API.** Matchora's player runs in an embedded frame inside Streamhaven and shows Matchora's adverts. The frame is sandboxed without pop-ups or top-level navigation.
- **Ad-free option.** For each channel Matchora lists, Streamhaven looks for the same channel by name in your own sources ("HD" and similar suffixes are ignored). If it finds one, it offers to play it with the normal player.
- **The JSON field names are a best guess.** The documentation I was given lists endpoints and filters but not response bodies, and the host could not be reached from the build environment. All mapping is in one function, `normalize()` in `js/data/sports.js`, written to accept the common spellings and to show a placeholder rather than crash. It was tested against two invented response shapes only. If matches show wrong or missing details, send a sample response and that function is the only thing to adjust.
- **Remote control on Tizen.** Keys pressed while the embedded frame has focus may not reach Streamhaven. Streamhaven keeps focus itself, so BACK closes the player; controls inside the frame are reached with the pointer. On Android, OK hands keys to the frame and BACK always closes it.
- **Rate limits** apply per IP: live results are cached for 45 seconds and fixtures for 5 minutes; Refresh always asks again.

### Provider notes

- **Stalker needs the Android app.** Portals identify the device with a `Cookie: mac=...` header, which browsers (including Tizen's) will not let a page set. The Android build sends requests through a native bridge that can. On Tizen the form says so and sign-in fails with a clear message.
- **Credentials.** Jellyfin, Emby and Plex use your password / link code once and keep only an access token. Xtream needs its password for every stream address, so it is stored in the app's private storage, and so are stream addresses that contain it. Source cards show only the host name. A backup file contains these secrets, so keep it private.
- **Guide window.** The importer keeps programmes from 24 hours ago to 50 hours ahead. Catch-up needs the programme to still be inside that window and inside the channel's archive period.
- **Catch-up** is implemented for Xtream (`timeshift`), using the server's own clock offset. It has not been checked against a real provider.
- **Large libraries.** Catalogues over about 1.5 MB are not cached, so they are downloaded again at start-up.

## Install

Both packages are built into `dist/` by `tools/build-wgt.sh` and `tools/build-apk.sh`.

### Samsung TV: `dist/Streamhaven.wgt`

The widget is **unsigned**. Samsung TVs only install signed widgets, and signing needs your own Samsung certificate, which cannot be generated here. Either:

1. In Tizen Studio, create a certificate profile (Tools, Certificate Manager), then import this folder as a TV web project, add your TV in Device Manager (developer mode on, host PC IP set), and Run As Tizen Web Application; or
2. Sign the widget from the command line: `TIZEN_PROFILE=<your profile name> tools/build-wgt.sh`

### Android and Android TV: `dist/Streamhaven.apk`

Signed with a **debug** key (`android/debug.keystore`, password `android`), so it installs by sideloading but is not suitable for a store. Enable installs from unknown sources, then:

```bash
adb install -r dist/Streamhaven.apk
```

To sign a release build with your own key: `KEYSTORE=... KS_PASS=... KEY_ALIAS=... tools/build-apk.sh`. The build needs `aapt`, `zipalign`, `apksigner`, an `android.jar` and the dx jar; on Ubuntu: `apt-get install aapt apksigner zipalign libandroid-23-java dalvik-exchange`.

The APK is a WebView wrapper around the same web app. The page plays HLS natively where the system WebView can, and through the bundled hls.js (`vendor/`) where it cannot. It has not been run on a device or emulator; the Java HTTP bridge was unit-tested on a JVM.

## Architecture

```
index.html, config.xml
css/        base (stage, sidebar, focus) · components · screens
js/core/    util (DOM builder, bus, storage) · store (settings, profiles) · keys · focus · router
js/data/    m3u parser · epg store · health · demo library · catalog (sources, sync, merge, search)
js/providers/ xmltv · basic (m3u, direct, xmltv, demo) · xtream · stalker · mediaserver (Jellyfin, Emby) · plex
android/    WebView wrapper (manifest, Java HTTP bridge, icons)
tools/      dev server, packaging scripts
js/player/  engine (AVPlay / HTML5 backends, state machine, watchdogs)
js/ui/      icons · ui (cards, rails, hero, dialogs, forms) · vgrid (virtual list/grid) · sidebar
js/screens/ one file per screen
js/app.js   key routing, BACK logic, theming, reminders, lifecycle
```

- **Focus** is a CSS class managed by `js/core/focus.js`, never DOM focus. Elements with class `f` are focusable; `data-nav="row|col|panel"` groups remember their last item, and off-screen rail items never take part in spatial search.
- **Long lists** (channels, poster grids, pickers, guide rows) are virtualised.
- **Stream health** is recorded only from real playback (start-up time, failures, stalls), never from a URL check.
- **Compatibility**: no CSS variables, grid or `gap`; the accent colour is injected as a small stylesheet. The layout is authored at 1920×1080 and scaled.

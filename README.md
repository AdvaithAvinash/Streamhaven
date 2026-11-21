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
| **Covers and metadata** from Cinemeta (no key) or TMDB (optional key in Settings) | Implemented; Cinemeta checked against the live service, TMDB against its documented format only |
| Profiles, favourites, My List, collections, reminders, PIN, backup | Implemented |
| **Live Sports** (Matchora API: live matches, fixtures, channels, embedded player) | Implemented; response format verified against live responses |
| QR companion setup, Stalker series, Jellyfin/Emby live TV, watch-state sync back to servers | Not yet |

Nothing has been tried against a real Xtream, Stalker, Jellyfin, Emby or Plex server yet; the clients follow the public protocols and were exercised against mocks written from them.

## Test in a browser: Cloudflare Pages

The web build runs on Cloudflare Pages so you can try the interface, sources, guide and Live Sports without a TV. `tools/build-web.sh` copies only the web app into `public/` (no keystore, packages or Android sources), and `functions/proxy.js` is a Pages Function at `/proxy`.

**Why the proxy.** A page cannot call most IPTV, Jellyfin, Plex or Stalker servers: they send no CORS headers, they are often plain `http` (blocked on an `https` page), and Stalker needs a `Cookie` header that pages may not set. The app detects `/proxy` at start-up and sends its API calls through it. Settings, About, shows "Through this site's /proxy" when it is in use. With no proxy (for example `node tools/dev-server.js`) it talks to servers directly, as before.

### Deploy

Option A, from Git (preview deploys for every branch):

1. Cloudflare dashboard, Workers & Pages, Create, Pages, Connect to Git, choose this repository.
2. Build command `bash tools/build-web.sh public`, build output directory `public`, root directory left empty.
3. Deploy. Pushes to `claude/eager-bohr-88pjs4` get their own preview address; Cloudflare finds `functions/` automatically.

Option B, from this machine:

```bash
bash tools/build-web.sh
npx wrangler pages deploy public --project-name streamhaven
```

Run it locally first with `npx wrangler pages dev public`. Add `--binding PROXY_ALLOW_PRIVATE=1` only if you need the proxy to reach a server on your own network; by default private and local addresses are refused.

### What the proxy allows

- Only the app's own page can use it (same origin); other sites and plain `curl` get 403.
- `http` and `https` only. `localhost`, private ranges, link-local and cloud-metadata addresses, internal names and IPv6 literals are refused.
- Only these request headers are forwarded: `Cookie`, `User-Agent`, `X-User-Agent`, `Authorization`, `Accept`, `Content-Type`, `X-Emby-*`, `X-Plex-*`.
- Video and audio responses are refused (415). It relays API calls, playlists and guides, not streams.
- Optional setting `PROXY_ALLOW` (comma-separated host names) limits it to those hosts.

The proxy is for testing. Anyone who can open your Pages site can use it within these limits, so put the site behind Cloudflare Access if it should stay private. Every provider call is one Function request, and the free plan has a daily request limit.

### What works in the browser

Works: navigation with the keyboard (arrows, Enter, Esc, PageUp/PageDown), sources of every type including Stalker (through the proxy), guide, search, My List, profiles, Live Sports and its embedded player.

Limits:
- **Playback.** A plain `http` stream cannot play on an `https` page; the player says so. `https` streams play if the browser supports their format; HLS in browsers without native support goes through hls.js, which also needs CORS on the stream host. Use the Tizen or Android app for real viewing.
- **AVPlay** and the Samsung remote keys exist only on a TV.
- Tested here with the local Pages runtime (`wrangler pages dev`) against mock servers; not yet deployed to Cloudflare. Outbound connections to unusual server ports from a deployed Function have not been tried.

### Covers and metadata

Movie and series covers, backdrops, plots, ratings, cast and episode stills come from **Cinemeta** (the free Stremio metadata service, no account) by default. Add a **TMDB** API key under Settings, Artwork and Metadata and Streamhaven uses TMDB instead (a v3 key or a v4 read access token both work; the key is checked before it is saved). "Provider artwork only" turns the lookups off.

- **Only titles are sent** to Cinemeta or TMDB, never logins or source addresses. Results are cached on the device.
- **Matching is strict.** Titles are cleaned first (`EN - Interstellar (2014) 1080p` becomes `Interstellar`, 2014), then a cover is only used for an exact title, or a close title with the right year. When nothing matches with confidence, the provider's own cover is kept; with none, the title is shown as plain type. A wrong picture is treated as worse than none.
- **No placeholders.** Channel logos, team badges and covers that are missing or fail to load leave an empty slot rather than a letter tile, and screens never fill space with "No programme information" style text. The invented demo library was removed from the app (it lives in `tools/testdata` for tests only).
- The TMDB path was written from TMDB's documented format and its real error response; no TMDB key was available to try a successful call.

### Live TV

Live TV opens already playing (last watched channel, else the first). Categories are one scrolling rail above the list (All, Favourites, Recent, Source and Country pickers, then every category); picking one keeps focus on the rail so you can keep browsing. Number keys type a channel number, in the list and in the full-screen player: it tunes after a short pause, or at once on OK.

### Live Sports (Matchora)

The Live Sports section uses the public Matchora API at `https://matchora.to` (`/api/v1/live`, `/schedule`, `/events/{id}`).

- **No stream addresses are exposed by the API.** Matchora's player runs in an embedded frame inside Streamhaven and shows Matchora's adverts. The frame is sandboxed without pop-ups or top-level navigation.
- **Ad-free option.** For each channel Matchora lists, Streamhaven looks for the same channel by name in your own sources ("HD" and similar suffixes are ignored). If it finds one, it offers to play it with the normal player.
- **Response shape.** Checked against real responses from `/live`, `/schedule` and `/events/{id}` on 2026-11-21 (kept in `tools/fixtures/matchora`). Channels come nested inside every event. Embed addresses are taken from the API's own `embed_url` (hosts seen: `matchora.pro`, `es.matchora.pro`, `matchora.to`) and anything outside Matchora's domains is ignored. Channels flagged `dead` are hidden. `/api/v1/channels` (a different, grouped shape) is not used.
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
functions/  Cloudflare Pages Function (/proxy)
tools/      dev server, packaging and web build scripts
js/player/  engine (AVPlay / HTML5 backends, state machine, watchdogs)
js/ui/      icons · ui (cards, rails, hero, dialogs, forms) · vgrid (virtual list/grid) · sidebar
js/screens/ one file per screen
js/app.js   key routing, BACK logic, theming, reminders, lifecycle
```

- **Focus** is a CSS class managed by `js/core/focus.js`, never DOM focus. Elements with class `f` are focusable; `data-nav="row|col|panel"` groups remember their last item, and off-screen rail items never take part in spatial search.
- **Long lists** (channels, poster grids, pickers, guide rows) are virtualised.
- **Stream health** is recorded only from real playback (start-up time, failures, stalls), never from a URL check.
- **Compatibility**: no CSS variables, grid or `gap`; the accent colour is injected as a small stylesheet. The layout is authored at 1920×1080 and scaled.

# Analytics and statistics

Two independent layers. Neither is required for the game to run.

## 1. Local stats panel (always on, never leaves the device)

Open with `?stats=1` — for example
<https://havban.github.io/rhino-rex/?stats=1> — or call `__stats()` in the
console. A small panel in the bottom-left shows first visit, last visit, active
days, games played, time played, rhinos beaten, Matriarchs, total and best
score, average wave, and the share of use for each weapon.

Stored in `localStorage` under `rr.stats` and `rr.visit`, with a reset button.
Ordinary players never see it.

## 2. GoatCounter (aggregate counters)

The official snippet lives in `index.html`:

```html
<script data-goatcounter="https://havban.goatcounter.com/count"
        async src="//gc.zgo.at/count.js"></script>
```

`count.js` counts the page view itself. [`js/analytics.js`](../js/analytics.js)
adds custom events through `window.goatcounter.count()`, queuing anything
logged before the script finishes loading. If an ad blocker eats `count.js`,
the module falls back to the pixel endpoint after 6 seconds.

The endpoint is written in exactly one place — the `data-goatcounter`
attribute — and the module reads it from the DOM.

### Events

| Event | When |
| --- | --- |
| `visitor-new` | first ever load from this browser |
| `visitor-returning` | first load on a later day |
| `hari-aktif-1 / 2-5 / 6-19 / 20+` | how many distinct days this device has played |
| `run-start` | a run begins |
| `wave-<1..4 / 5-9 / 10-14 / 15-19 / 20+>` | wave reached when the run ends |
| `score-<under-500 … 50k+>` | score bracket at the end of a run |
| `weapon-<bite\|tail\|fire\|fireball>` | most-used weapon that run |
| `boss-killed` | a Matriarch died that run |
| `mode-solo` / `mode-coop` | which kind of run just started |
| `device-touch` / `device-desktop` | once per load, from `pointer: coarse` |
| `screen-portrait` / `screen-landscape` | once, at the first run |
| `quality-<low\|medium\|high>` | graphics preset actually in use, once |
| `perf-downscale` | the adaptive resolution had to drop — this device is struggling |
| `open-coop` / `open-scores` / `open-help` | menu opened, once each per load |
| `music-<ceria\|stomp\|chip\|synth>` | a track was chosen, once per style |
| `coop-host-room` / `coop-host-fail` | a room was created, or creation failed |
| `coop-join-try` / `coop-join-ok` | join funnel |
| `coop-join-fail-<kode-salah\|room-tutup\|room-penuh\|tuan-rumah-diam\|jaringan\|lain>` | why a join failed |
| `coop-players-<2..4>` | how many connected, host side only |
| `coop-start-<1..4>p` | the host started a session of that size |
| `score-submit-ok` / `score-submit-fail` | global leaderboard outcome |
| `update-available` / `update-reloaded` / `reload-manual` | new-build notice and reloads |

The co-op funnel is the interesting one: `open-coop` → `coop-host-room` or
`coop-join-try` → `coop-join-ok` shows exactly where people fall out, and the
`coop-join-fail-*` split says whether it is mistyped codes or NAT trouble.

Session-shaped events (device, screen, quality, menu opens) use
`Stats.once()`, which de-duplicates per page load. Everything else fires at
most once per run. Nothing fires per frame.

Waves and scores are bucketed on purpose: the dashboard shows a distribution
instead of thousands of unique numbers.

### Unique visitors

GoatCounter already separates **Visits** from **Pageviews** — that is its
unique count, derived server-side from a daily hash of IP and user agent, and
needs nothing from us. What it cannot know is whether a browser has been here
before, which is what `visitor-new` / `visitor-returning` add. At most one pair
of those events fires per device per day.

No identifier is stored — only a first-seen date, a last-seen date and a count
of active days.

### Privacy

No cookies, no personal data, Do Not Track respected, and GoatCounter never
counts `localhost` (so local development cannot dirty the dashboard — or
verify tracking). Remove the `<script>` tag to disable everything; the local
panel keeps working. To use a different provider, remove the tag and set
`window.__rrTrack = (path, title, isEvent) => {...}` before the game loads.

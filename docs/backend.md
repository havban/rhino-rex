# Backend — Cloudflare Worker + D1

One Worker serves two unrelated jobs: the global leaderboard, and brokering
WebRTC handshakes for co-op. Source is [`worker/src/index.js`](../worker/src/index.js).

- **Deployed at** `https://rhino-rex-scores.hidayat-febiansyah.workers.dev`
- **Database** `rhino-rex` (D1, APAC)
- **Config** [`worker/wrangler.toml`](../worker/wrangler.toml)

The game only knows about it through `API` in
[`js/leaderboard.js`](../js/leaderboard.js). Blank that constant and everything
falls back to local play.

## Endpoints

### Leaderboard

| Method | Path | Returns |
| --- | --- | --- |
| `GET` | `/health` | `{ ok: true }` |
| `GET` | `/scores?limit=20` | `{ scores: [{ name, score, wave, kills, created_at }] }`, edge-cached 20 s, max 50 |
| `POST` | `/run` | `{ token }` — call when a run starts |
| `POST` | `/scores` | `{ ok, rank, name }` — submit `{ name, score, wave, kills, seconds, token }` |

### Multiplayer signalling

| Method | Path | Returns |
| --- | --- | --- |
| `POST` | `/mp/room` | `{ code, host }` |
| `POST` | `/mp/join/:code` | `{ peer }` |
| `GET` | `/mp/peers/:code` | `{ peers: [{ id, name, offered, answered, answer }] }` |
| `POST` | `/mp/sdp/:peer` | store `{ kind: 'offer' \| 'answer', sdp }` |
| `GET` | `/mp/sdp/:peer` | `{ offer, answer, closed }` |
| `POST` | `/mp/close/:code` | `{ ok }` |

Rooms and peers are swept opportunistically (8 % of requests) after 2 hours.

## CORS

`ALLOW_ORIGIN` is a comma-separated allow-list, currently
`https://havban.github.io,http://localhost:8777`. Anything else gets **403**,
including preflight. Set it to `*` only for throwaway testing.

## Anti-cheat

A browser game cannot be made honest; the aim is to make forgery annoying.
Every rejection below is covered by a test.

1. **Run token.** `/run` issues `t0.nonce.HMAC(t0.nonce, RUN_SECRET)` when a
   run starts. A submission without a valid signature is refused, and the
   claimed duration may not exceed the token's age — so a score cannot be
   posted faster than it could be played.
2. **Plausibility**, mirroring the rules in `js/config.js`:
   - kills ≤ everything that could have spawned up to that wave
   - score ≤ `kills × 1800 + 120 × wave(wave+1)/2 + 1000` (every kill a
     Matriarch at max combo, every wave bonus collected)
   - `seconds ≥ 5 × (wave − 1)`
   - absolute sanity bounds on all four numbers
3. **Rate limit** — 6 submissions per hour per IP, stored as a salted hash.
   The address itself is never written.
4. **Name sanitising** — control characters and angle brackets stripped, 14
   characters max, and the client escapes on render.

Not covered: a token can be replayed inside its window (bounded by the rate
limit), and a patient cheater can fake a plausible run.

## Schema

```sql
scores(id, name, score, wave, kills, seconds, created_at, ip_hash)
rooms(code PK, host, name, created_at, seen_at, closed)
peers(id PK, code, name, offer, answer, created_at)
```

Indexes on `scores(score DESC, created_at)`, `scores(ip_hash, created_at)`,
`peers(code, created_at)` and `rooms(seen_at)`.

## Operations

All commands run from `worker/` and need a Cloudflare API token. `wrangler
login` does **not** work from a non-interactive shell — it detects
`isInteractive: false` and gives up after ~7 seconds. Create a scoped token
(Workers Scripts:Edit + D1:Edit + Account:Read) and keep it in `~/.cf-token`,
mode 600.

```bash
export CF="CLOUDFLARE_API_TOKEN=$(cat ~/.cf-token)"

env $CF npx wrangler whoami
env $CF npx wrangler deploy
env $CF npx wrangler d1 execute rhino-rex --remote --file=./schema.sql
env $CF npx wrangler secret put RUN_SECRET        # reads the value from stdin
env $CF npx wrangler tail                         # live logs
```

Moderation:

```bash
env $CF npx wrangler d1 execute rhino-rex --remote \
  --command "SELECT id, name, score, wave, kills FROM scores ORDER BY score DESC LIMIT 20"
env $CF npx wrangler d1 execute rhino-rex --remote --command "DELETE FROM scores WHERE id = 42"
```

Rotating `RUN_SECRET` invalidates every outstanding run token and resets the
rate-limit hashes.

## Free-tier headroom

Workers: 100k requests/day. D1: 5 GB, 5M row reads and 100k row writes per day.
A leaderboard view is one read, a submission one write, and multiplayer traffic
never touches the Worker after the handshake. Nothing sleeps.

## Local development

The Worker code is plain JavaScript, so it can run in Node with D1 shimmed over
`node:sqlite`. See [testing.md](testing.md#worker) — this is how the validation
rules were tested without touching production.

# Multiplayer

Two to four players against the same herd. Menu → **👥 Main Bersama** → *Buat
Room* produces a four-letter code; a friend enters it to join.

## Ownership model

Deliberately simple — a "trusted friends" model:

| | Owner |
| --- | --- |
| Each dinosaur's position and health | that player |
| Rhinos, waves, pickups, score | the host |

Guests do not compute damage on rhinos. They **claim** it (`I bit #7 for 26`)
and the host decides. A guest could lie — but a guest can also just edit their
own copy of the game, and this is co-op with people invited by room code. The
payoff is that no rewrite into authoritative netcode was needed: guests keep
running the normal game loop for their own dinosaur, with wave logic and rhino
AI switched off.

## Transport

Gameplay traffic is **browser to browser over WebRTC**. The Cloudflare Worker
only brokers the handshake, over plain HTTP polling — no WebSockets, no
Durable Objects, so it fits the free plan and costs nothing per packet.

Two data channels per peer:

| Channel | Reliability | Carries |
| --- | --- | --- |
| `state` | unordered, `maxRetransmits: 0` | 15 Hz snapshots, 20 Hz player poses — a stale one is worthless |
| `evt` | ordered, reliable | joins, attacks, damage claims, wave announcements |

ICE is **non-trickle**: the SDP is posted once gathering completes (or after
2.5 s), which is what lets the handshake work over simple polling. STUN is
Google's public servers; there is **no TURN**, so a minority of strict NATs
will fail to connect. The lobby reports that instead of hanging.

## Handshake

```
host                      Worker                       guest
  │  POST /mp/room ────────→ │
  │  ←──────────── { code }  │
  │                          │ ←──── POST /mp/join/:code
  │                          │ ────→ { peer }
  │  GET /mp/peers/:code ──→ │                (polled every 700 ms)
  │  ←── [{ id, name }]      │
  │  POST /mp/sdp/:peer ───→ │   (offer)
  │                          │ ←──── GET /mp/sdp/:peer   (polled)
  │                          │ ────→ { offer }
  │                          │ ←──── POST /mp/sdp/:peer  (answer)
  │  GET /mp/peers/:code ──→ │
  │  ←── [{ answer }]        │
  │                          │
  └────────── data channels open, Worker no longer involved ──────────┘
```

Typical connect time on a LAN: **about one second**.

## Wire protocol

All messages are JSON with a `t` (type) field. Coordinates are rounded to one
decimal. Every message that identifies a player carries `i`, the sender's id —
**never key a player off the connection**, or relayed messages from a third
player get attributed to the host.

| `t` | Direction | Channel | Payload |
| --- | --- | --- | --- |
| `p` | any → all | `state` | `i`, `n` name, `x`, `z`, `y` yaw, `hp`, `d` downed. Host relays to the others. |
| `s` | host → guests | `state` | `r` rhinos `[id, x, z, yaw, hp, variant, scale]`, `p` players, `w` wave, `rt` rest timer, `sc` score |
| `atk` | any → all | `evt` | `i`, `k` kind, `a` aim yaw — plays the swing on the twin |
| `hit` | guest → host | `evt` | `r` rhino id, `d` damage, `k` kind, `kx`/`kz` knockback direction |
| `ph` | host → guest | `evt` | `d` damage that player's dinosaur just took |
| `fx` | any → all | `evt` | `k` kind, `x`, `y`, `z` — shared one-off effects |
| `wave` | host → guests | `evt` | `n` number, `c` count, `b` boss flag |
| `welcome` | host → guest | `evt` | `wave`, `score` for a late joiner |
| `over` | host → guests | `evt` | everyone is down; end the run |

Rhinos and players that stop appearing in snapshots are faded out by the
guest. A guest creates a replicated rhino the first time it sees an unknown id,
using the `variant` in the row.

## Replicated entities

`Rex` and `Rhino` both support a `remote` flag. Their `updateRemote(dt)` skips
physics and AI entirely and eases position and yaw toward the last networked
pose (exponential, ~12/s), deriving speed from the movement so the walk cycle
still animates. Remote dinosaurs are tinted per player so you can tell each
other apart.

`Rex.damage()` on a remote twin does not apply damage; it records it into
`takenDamage`, which the host drains each frame and forwards to that player as
a `ph` event.

## Known gaps

- Healing melons are not replicated; only the host sees them.
- No TURN server, so strict NATs fail.
- No versus mode.
- A guest's damage claim is trusted (see the ownership model).

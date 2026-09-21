# Rhino Rex — documentation

Technical documentation for the game, its backend and its tooling. Player- and
owner-facing docs are in the Indonesian [`README.md`](../README.md) at the repo
root; everything here is for people working on the code.

| Document | What it covers |
| --- | --- |
| [architecture.md](architecture.md) | Module map, the frame, rendering, animation rules, how the pieces fit |
| [gameplay.md](gameplay.md) | Weapons, items, enemies, waves, scoring, wildlife, hunters, arenas, flying |
| [multiplayer.md](multiplayer.md) | Co-op design, ownership model, wire protocol |
| [backend.md](backend.md) | Worker API reference, D1 schema, deploy and ops runbook |
| [analytics.md](analytics.md) | GoatCounter integration, event list, local stats panel |
| [testing.md](testing.md) | How this project is tested, harnesses, environment quirks |
| [troubleshooting.md](troubleshooting.md) | Symptom → cause → fix, from bugs actually hit |

Start with [`../AGENTS.md`](../AGENTS.md) for the short version: conventions,
hard rules and the list of traps.

## The one-paragraph version

A third-person 3D browser game built on Three.js r160 (vendored), with no build
step and no asset files — every model, texture, sound and music track is
generated in code, including four playable hunters, three arenas and six
species of wildlife. It runs as a static site on GitHub Pages. A Cloudflare
Worker with a D1 database provides an optional global leaderboard and brokers
WebRTC handshakes for co-op; the game degrades gracefully to solo play with a
local leaderboard when that backend is absent.

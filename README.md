# Lagbot — System Circuit Map

Interactive architecture map of the whole Lagbot system: WhatsApp → backend →
AI agents → API/data layer → mobile app, including deployment infrastructure
and middleware. Built from `docs/frontend-map.md` and `docs/backend-map.md`
(generated from the codebase @ `2f4eafe` / `64f0b48`, 2026-06-10).

## Run it

```sh
python3 -m http.server 8755 --bind 127.0.0.1
```

from this folder, then open **http://localhost:8755/** in a browser.
(Don't open `index.html` directly via file:// — the AI persona file and
team sync need a local server.)

## Features

- **Map** — drag nodes, ⌁ connect, double-click orange pages for tappable
  app wireframes that trace their backend circuit.
- **⚠ Gap reports** — select a flagged node: what's wrong, recommended
  additions (one-tap add), and how to fix it.
- **✦ AI bar ("Circuit")** — ask the map anything. Offline brain works with
  no key; an Anthropic API key (⚙ on the bar) switches on Claude reasoning.
  All AI suggestions are proposals — nothing is drawn without approval.
  Personality/instructions live in `lagbot-map-ai.md` (edit freely).
- **≡ Log** — every change is signed: who · what · date · time. Each page
  load starts with a profile picker (Andre / David / Joseph) so changes are
  always attributed; switch profile any time via ≡ Log.
- **☁ Sync** — connect a Supabase project so the whole team shares one live
  map. One-time setup: run `lagbot-map-team-sync.sql` in the project's SQL
  editor, then put the project URL + anon key in `team-config.js` (copy
  `team-config.example.js`) — everyone with that file auto-connects. Or paste
  them manually into ☁ Sync.

## Files

| File | What it is |
|---|---|
| `index.html` | the entire app — single file, no build step |
| `lagbot-map-ai.md` | the AI's persona/instructions (loaded fresh each page load) |
| `lagbot-map-team-sync.sql` | one-time Supabase setup for team sync |
| `team-config.example.js` | template for `team-config.js` — shared team keys (Supabase + AI). The real file is gitignored: share it privately, never commit it |
| `docs/frontend-map.md` | source document — app architecture |
| `docs/backend-map.md` | source document — backend architecture |

## Keeping it honest

The map is a snapshot, not wired to the codebase. After real development,
regenerate/compare against the code and update both the map and the docs.

# Code sync — keeping the map true to the real codebase

`sync-from-code.mjs` reads the Lagbot app codebase
(`github.com/Joseph-Banke/lagbot-mobile-main`) **read-only** and writes
sanitized structural facts into `docs/code-facts.md` / `docs/code-facts.json`,
which the map and the Circuit AI read. The GitHub Action
`.github/workflows/sync-from-code.yml` runs it nightly and on demand.

## It is read-only, by construction

- The pipeline only `git clone`s the codebase — it never pushes to it and never
  calls a write API. It writes only to *this* repo's `docs/`.
- The credential is a GitHub **fine-grained token, Contents: Read-only**, scoped
  to the codebase repo only — it physically cannot write.
- The token lives **only** as the Actions secret `CODEBASE_RO_TOKEN` in this
  repo. It is never in the website, the browser, Vercel, or `team-config.js`.
- The extractor copies **no source** — only route signatures + their auth
  guards, table/policy/function names, service names + their top doc-comment,
  and screen paths. It refuses to open `.env*`/key/secret files, and a
  secret-scanner aborts the run if any key pattern reaches the output.

## One-time setup

1. **Create the read-only token** (whoever owns the codebase repo):
   GitHub → profile → Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token.
   - Resource owner: the codebase repo's owner
   - Repository access: Only select repositories → `lagbot-mobile-main`
   - Permissions → Repository permissions → **Contents: Read-only**
   - Generate and copy the `github_pat_…` value.
2. **Add it to this repo:** Settings → Secrets and variables → Actions →
   New repository secret → name `CODEBASE_RO_TOKEN`, paste the value.
3. Done. The nightly job refreshes the facts; trigger it now from the
   **Actions** tab → *Sync code facts* → **Run workflow**.

## Run it locally (optional)

```sh
CODEBASE_DIR=/path/to/lagbot-mobile-main node tools/sync-from-code.mjs
```

## Automatic deploy + instant updates

Three workflows make "change the code → the live site updates" automatic:

- `.github/workflows/deploy.yml` — deploys to Vercel on every push to the map
  repo (covers map-feature changes).
- `.github/workflows/sync-from-code.yml` — refreshes the code facts and deploys
  if they changed. Runs nightly, on demand, and on a `codebase-updated` signal.
- `tools/codebase-notify-map.yml` — copy into the **codebase** repo at
  `.github/workflows/notify-map.yml`; it sends that signal on each push.

One-time setup (in addition to `CODEBASE_RO_TOKEN` above):

1. **Vercel token** → map repo. Create at vercel.com → Account Settings → Tokens.
   Add it as the map repo secret **`VERCEL_TOKEN`** (Settings → Secrets and
   variables → Actions).
2. **Map dispatch token** → codebase repo. Create a fine-grained PAT with
   **Contents: Read and write**, scoped to the **lagbot-system-map** repo only.
   Add it as the codebase repo secret **`MAP_DISPATCH_TOKEN`**.
3. Copy `tools/codebase-notify-map.yml` into the codebase repo at
   `.github/workflows/notify-map.yml` and commit it.

Note: the facts are *structure* (routes, guards, tables, services, screens), so
the site redeploys when the **structure** changes — a new route, table, screen,
or changed auth guard. Edits inside a function body don't move the facts and
won't trigger a deploy (by design).

## ⟐ Improve the Circuit (self-editing)

The in-app **⟐ Improve** panel lets the team ask the Circuit to change its own
code. Flow: panel → `/api/improve` → fires the `improve-circuit.yml` workflow →
a sandboxed coding agent edits the repo and **opens a PR** → a human merges →
auto-deploy ships it. It never merges itself and never touches the Lagbot
codebase.

Safety design (no passcode, but hardened):
- The agent runs with **file-editing tools only — no shell, no network** — so it
  cannot read or exfiltrate secrets even from a hostile request.
- `guard-protected-paths.yml` **fails any agent PR** that touches `.github/**`,
  `api/improve.js`, `tools/sync-from-code.mjs`, or `team-config*`.
- `/api/improve` refuses (fail-closed) when 3 agent PRs are already open.

One-time setup:
1. **ANTHROPIC_API_KEY** as a map-repo **Actions secret** (the workflow needs
   it). Use a **dedicated, spend-capped** Anthropic key here.
2. **GH_DISPATCH_TOKEN** as a Vercel env var — a fine-grained PAT, this repo
   only, **Contents: Read and write** (to send the dispatch + read open PRs).
3. **Protect `main`** (Settings → Branches → add rule): require a pull request
   and at least one approval before merging, and require the **Guard protected
   paths** check. This is the backstop that makes "a human merges" real — with
   it, nothing reaches the live site without your review.

Before relying on it, trigger one verification run (Actions → *Improve the
Circuit* → Run workflow) and confirm it only edited files and opened a PR.

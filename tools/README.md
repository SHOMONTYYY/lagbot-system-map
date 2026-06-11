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

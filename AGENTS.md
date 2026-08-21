# AGENTS.md

## Repository Scope

`FirstLutheranIfalls-Editor` contains the editor UI, the Cloudflare Worker API, and operational documentation. It does not contain the canonical public website.

The paired repository, `FirstLutheranIfalls-Website`, contains the canonical deployable website content. Recovery requires both repositories.

## Current State

- **Active branch:** `migration/github-pages-worker-test` is `origin/HEAD` in both repositories and is where the editor and website actually run. `main` is not the active branch.
- **RyskStick is retired.** There is no production Linux host, systemd service, Cloudflare Tunnel, Cloudflare Access, or Basic Auth in the current path. Do not assume any of that infrastructure exists unless explicitly reintroduced.
- The editor frontend (`index.html`, `admin/`) is deployed by GitHub Pages from this repository's branch root at `admin.firstlutheranifalls.site`.
- The editor backend is a Cloudflare Worker (`worker/`), deployed separately via `npx wrangler deploy`, reachable at `firstlutheranifalls-editor.ryan-skogstad.workers.dev`.
- `server/` (the earlier Node server that read/wrote a local `WEBSITE_ROOT` checkout) is legacy code, retained for reference and still covered by `tests/publish.test.mjs` and `tests/server-smoke.test.mjs`. It is not deployed.

## Architecture

```text
Browser -> GitHub Pages (this repo) -> Cloudflare Worker (worker/) -> GitHub API -> Website repo branches
```

The Worker holds `GITHUB_TOKEN` (a fine-grained token scoped to `FirstLutheranIfalls-Website`) and `EDITOR_API_TOKEN` as runtime secrets. Neither is ever sent to or stored in the browser beyond the current tab's memory. See `docs/WORKER-MIGRATION-TEST.md` for the full configuration.

## Save, Publish, Discard

Save, Publish, and Discard are Worker endpoints operating directly on GitHub branches — there is no local checkout and no local commit/push step:

- **Save Draft** (`POST /api/editor/save`, `/api/editor/upload`) commits to `editor-test-draft` via the GitHub Contents API.
- **Publish Test Branch** (`POST /api/editor/publish`) fast-forwards `migration/github-pages-worker-test` to the draft commit, and only if the draft is strictly ahead with no divergence. It never force-pushes.
- **Discard Draft** (`POST /api/editor/discard`) force-resets only `editor-test-draft` to the current published branch, behind an explicit `confirm: true`.

Do not add force-push behavior to `publish`, and do not let `discard` touch any branch other than the draft branch.

## Safety Rules

- Never commit credentials, tokens, or `.dev.vars` to either repository. `worker/.dev.vars` is git-ignored; only `worker/.dev.vars.example` is tracked.
- Keep editor implementation and public website content in their separate repositories.
- Use small, reversible changes. Run `npm test` and `npm run lint` for changes to `server/`, `admin/`, or tests; there is currently no automated test coverage for `worker/src/index.js`, so verify Worker changes against `docs/WORKER-MIGRATION-TEST.md`'s test checklist.
- The Worker's editable-page and upload-path allowlists (in `worker/src/index.js`) are the actual security boundary, not CORS. Do not loosen `validatePagePath`, the upload MIME/size limits, or `ALLOWED_ORIGINS` without a specific reason.

## Recovery

Recovery requires the Editor repository, the Website repository, the Cloudflare Worker's runtime secrets (`GITHUB_TOKEN`, `EDITOR_API_TOKEN`), and the GitHub Pages configuration for both `admin.firstlutheranifalls.site` and `firstlutheranifalls.site`. The Editor repository alone cannot restore the public site.

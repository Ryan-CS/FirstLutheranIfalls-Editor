# Decisions

## 2026-08-21: RyskStick Retired; GitHub Pages + Cloudflare Worker Is The Current Architecture

- `RyskStick` is retired as a production target. There is no local Node server, `WEBSITE_ROOT` checkout, systemd service, Cloudflare Tunnel, Cloudflare Access, or Basic Auth in the current deployment.
- `migration/github-pages-worker-test` is the active branch in both repositories (`origin/HEAD` in each), not a side experiment. `main` is inactive.
- The editor frontend deploys via GitHub Pages from this repository's branch root to `admin.firstlutheranifalls.site`. The editor backend is the Cloudflare Worker in `worker/`, talking directly to the GitHub Contents/Git API — no local checkout, no local Git commit/push.
- Save writes a commit to the `editor-test-draft` branch. Publish fast-forwards `migration/github-pages-worker-test` to that commit. Discard force-resets only the draft branch. See `docs/WORKER-MIGRATION-TEST.md` for the authoritative description.
- `server/`, `tests/publish.test.mjs`, `tests/server-smoke.test.mjs`, and `docs/PUBLISHING.md`, `docs/BACKUPS.md`, `docs/AUDIT_LOG.md` describe the retired local-server design below and in the entries that follow. They are kept for historical/recovery reference, not current operating guidance.
- The prior entry below ("Repository Boundary And Migration") described the RyskStick target as the still-current production plan; it is superseded by this entry and is retained as historical context only.

## 2026-08-18: Repository Boundary And Migration

- `FirstLutheranIfalls-Editor` is the editor application repository. It contains the admin UI, Node server, tests, and operational documentation.
- `FirstLutheranIfalls-Website` is the canonical public-content repository.
- The editor uses `WEBSITE_ROOT` to operate on the external Website checkout. `public/` is only a development fallback when the variable is absent.
- Save writes locally to the Website checkout; Publish will be a future explicit Git commit/push operation.
- The eventual public deployment target is Cloudflare Pages. The eventual admin path is `admin.firstlutheranifalls.org` through Cloudflare Access/MFA and Cloudflare Tunnel to RyskStick.
- `/opt/firstlutheran/site` remains the current production rollback copy until cutover is complete.

## Historical Notes

The following entries describe the pre-separation architecture. They are retained as historical context and must not be read as current operating guidance.

## 2026-06-24: Initial Scaffolding

- Initialized repository scaffolding (Node, lint/format/test, base folders) before the Linux production target was established.
- Prettier and ESLint ignore public/ legacy copies that include unformatted/minified files from the scrape; we will tighten this once we rebuild cleaned pages.
- README set from the previous START_HERE instructions for immediate onboarding.
- Testing gate in AGENTS.md requires server + admin editor + save flow; these are not implemented yet, so that gate cannot be executed today. We will enforce it once those components exist.

## 2026-02-10: Build History

- Added a minimal Node server with HTTP Basic auth that served editor and public content together.
- Built a browser editor that loaded HTML from the combined repository and saved it through the API.
- Added smoke tests, timestamped backups, image uploads, audit logging, and site cleanup work.

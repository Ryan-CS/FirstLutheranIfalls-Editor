# Changelog

All notable changes to this project will be documented in this file.

## 2026-08-21

- Rewrote README, AGENTS.md, docs/DECISIONS.md, docs/EDITOR.md, and docs/STAFF_GUIDE.md to describe the architecture that is actually deployed: GitHub Pages (editor frontend + website) plus a Cloudflare Worker (`worker/`) talking directly to the GitHub API. RyskStick, the local Node server, and `WEBSITE_ROOT` are retired.
- Marked docs/PUBLISHING.md, docs/BACKUPS.md, docs/AUDIT_LOG.md, and docs/FONTS.md as legacy documentation for the retired `server/` Node app, which at the time still remained in the repository but was not deployed.
- No code changes in this pass; `worker/src/index.js` and `admin/` already implemented the current architecture, the documentation had not caught up.
- Removed `server/` and its dedicated tests (`tests/publish.test.mjs`, `tests/server-smoke.test.mjs`) entirely, dropped the `npm run dev` script that launched it, removed its now-unused `.gitignore` entries, and updated `tests/smoke.test.mjs`'s folder check to expect `worker/` instead of `server/`. docs/PUBLISHING.md, docs/BACKUPS.md, and docs/AUDIT_LOG.md are updated to reflect that the code they describe no longer exists.

## 2026-02-10

- Bootstrap repo scaffold and tooling (Node, lint/format/test, base folders).
- Add README onboarding guide.
- Seed public with legacy site copy (initial baseline).

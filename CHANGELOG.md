# Changelog

All notable changes to this project will be documented in this file.

## 2026-08-21

- Rewrote README, AGENTS.md, docs/DECISIONS.md, docs/EDITOR.md, and docs/STAFF_GUIDE.md to describe the architecture that is actually deployed: GitHub Pages (editor frontend + website) plus a Cloudflare Worker (`worker/`) talking directly to the GitHub API. RyskStick, the local Node server, and `WEBSITE_ROOT` are retired.
- Marked docs/PUBLISHING.md, docs/BACKUPS.md, docs/AUDIT_LOG.md, and docs/FONTS.md as legacy documentation for the retired `server/` Node app, which remains in the repository but is not deployed.
- No code changes; `worker/src/index.js` and `admin/` already implemented the current architecture, the documentation had not caught up.

## 2026-02-10

- Bootstrap repo scaffold and tooling (Node, lint/format/test, base folders).
- Add README onboarding guide.
- Seed public with legacy site copy (initial baseline).

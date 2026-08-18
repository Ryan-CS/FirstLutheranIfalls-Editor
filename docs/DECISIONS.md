# Decisions Log

## 2026-02-10

- Initialized repo scaffolding (Node, lint/format/test, base folders) to meet the Windows 10 + Node 20 contract.
- ESLint/Prettier explicitly ignore previous_version/ to preserve the historical archive unchanged.
- Prettier and ESLint ignore public/ legacy copies that include unformatted/minified files from the scrape; we will tighten this once we rebuild cleaned pages.
- README set from the previous START_HERE instructions for immediate onboarding.
- Testing gate in AGENTS.md requires server + admin editor + save flow; these are not implemented yet, so that gate cannot be executed today. We will enforce it once those components exist.

## 2026-02-10 (Build Step)

- Added a minimal Node server with HTTP Basic auth that serves `public/`, `admin/`, and a save API to write edited HTML back to disk.
- Built a browser editor that loads HTML from `public/`, allows direct in-place edits, and saves through the API.
- Documented editor usage and environment variables in `docs/EDITOR.md`.

## 2026-02-10 (Testing + Backup)

- Added a smoke test that starts the server and verifies `/admin` auth and the pages API response.
- Implemented automatic timestamped backups of HTML before each save in `public/_backups/`.
- Documented backups in `docs/BACKUPS.md`.

## 2026-02-10 (Site + Editor Expansion)

- Rebuilt all public pages with a shared layout and new warm earth-tone design system in `public/assets/site.css` and `public/assets/site.js`.
- Preserved legacy page content by extracting `#wsite-content` into the new layout, with local asset URL cleanup.
- Added image uploads, template insertion, and safer link handling in the admin editor.
- Hardened the server with audit logging, backup retention, and safer save behavior.
- Added a restore helper script for recovering pages from backups.

## 2026-02-10 (Homepage Cleanup)

- Replaced the homepage legacy block with curated, clean sections that link into the rest of the site.

## 2026-02-10 (Fonts + Contact)

- Self-hosted the site fonts in `public/assets/fonts/` and documented the download script.
- Rebuilt the contact page with clean, readable contact information and removed the legacy block.
- Decoded Cloudflare email obfuscation in legacy content so staff emails and post emails are usable without scripts.

## 2026-02-10 (Posts Cleanup)

- Rebuilt all `public/posts/*.html` with the new layout while preserving post content.

## 2026-02-10 (Page Cleanup)

- Replaced legacy content blocks on the remaining top-level pages with curated, readable HTML that matches the new design.
- Removed the external volunteer form embed and routed volunteer inquiries to the church office to avoid SaaS dependency.

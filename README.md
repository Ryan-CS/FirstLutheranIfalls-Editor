# First Lutheran Editor

This repository is the editor application for First Lutheran Church: the browser editor UI and its Cloudflare Worker API. The canonical public content is kept separately in [FirstLutheranIfalls-Website](https://github.com/Ryan-CS/FirstLutheranIfalls-Website).

**`migration/github-pages-worker-test` is the active branch in both repositories** (it is `origin/HEAD` in each) despite its name. It is not a side experiment — it is where the editor and website currently run. `main` and the RyskStick-hosted Node server it describes are retired.

## Current Architecture

```text
Staff browser
      |
      v
GitHub Pages (this repo, branch root) -> admin.firstlutheranifalls.site
      |
      | HTTPS + Bearer editor token
      v
Cloudflare Worker (worker/)  -> firstlutheranifalls-editor.ryan-skogstad.workers.dev
      |
      | GITHUB_TOKEN held only as a Worker secret
      v
GitHub API -> Ryan-CS/FirstLutheranIfalls-Website
      |- migration/github-pages-worker-test   (published test site, deployed by GitHub Pages)
      `- editor-test-draft                    (unpublished editor saves)
```

There is no server to run, no `WEBSITE_ROOT` checkout, and no RyskStick host in this path. The Worker talks to the GitHub Contents/Git API directly; GitHub Pages deploys the website branch on push. See `docs/WORKER-MIGRATION-TEST.md` for the full setup, deployment, and verification steps — it is the current source of truth for how this system runs.

The website repository's own `docs/GITHUB-PAGES-WORKER-TEST.md` documents the matching public-site side (GitHub Pages for `firstlutheranifalls.site` plus its own public Cloudflare Worker for the YouTube API).

## Save, Publish, Discard

These are Worker operations against GitHub, not local filesystem operations:

- **Save Draft** commits a page or upload straight to the `editor-test-draft` branch via the GitHub Contents API.
- **Publish Test Branch** fast-forwards `migration/github-pages-worker-test` to the draft commit, only if the draft is a clean, undiverged ahead-of-target history. It never force-pushes or auto-merges.
- **Discard Draft** force-resets only `editor-test-draft` back to the current published branch, behind an explicit confirmation.

A successful publish triggers the website's GitHub Pages workflow, so it is followed by an actual deployment to `firstlutheranifalls.site`.

## Legacy: local Node server

`server/`, `tests/publish.test.mjs`, `tests/server-smoke.test.mjs`, and `docs/PUBLISHING.md`, `docs/BACKUPS.md`, `docs/AUDIT_LOG.md`, `docs/FONTS.md` describe an earlier design: a Node server on a Linux host (`RyskStick`) editing a `WEBSITE_ROOT` checkout on disk and pushing to it with local Git. That host and workflow are retired and are not part of the current deployment. That code and its docs remain in the repository for historical/recovery reference and because `npm test` still exercises it; treat `docs/WORKER-MIGRATION-TEST.md` as authoritative for how the editor actually works today.

## Development Checks

```sh
npm ci
npm test
npm run lint
```

`npm test` currently only covers the legacy local server in `server/`; there is no automated test suite for `worker/src/index.js` yet.

See `docs/EDITOR.md` and `docs/STAFF_GUIDE.md` for current operating guidance, and `docs/DECISIONS.md` for the migration history. Recovery requires both repositories, not this Editor repository alone.

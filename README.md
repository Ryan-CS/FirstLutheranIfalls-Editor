# First Lutheran Editor

This repository is the operational editor application for First Lutheran Church. It contains the browser editor, Node server, tests, and operational documentation.

The canonical public content is kept separately in [FirstLutheranIfalls-Website](https://github.com/Ryan-CS/FirstLutheranIfalls-Website). That repository contains the HTML, assets, files, posts, uploads, and `robots.txt` that will be deployed through Cloudflare Pages.

## Target Architecture

```text
Administrator -> Cloudflare Access/MFA -> Cloudflare Tunnel -> RyskStick:8787
Editor -> WEBSITE_ROOT -> Website checkout -> GitHub -> Cloudflare Pages -> Public website
```

The production target is the Linux host `RyskStick`. The editor runtime listens on port `8787`. After Cloudflare Pages is live, the public website must remain available even when RyskStick is offline.

`admin.firstlutheranifalls.org` is the intended admin hostname. It will ultimately reach the editor through Cloudflare Access/MFA and Cloudflare Tunnel. Existing HTTP Basic Auth remains an additional control during the initial migration.

## Local Content Root

The server operates on an external website directory supplied by `WEBSITE_ROOT`:

```sh
WEBSITE_ROOT=/opt/firstlutheran/website npm run dev
```

When `WEBSITE_ROOT` is not set, the server uses `public/` as a development fallback. The production migration must set `WEBSITE_ROOT` explicitly. `/opt/firstlutheran/site` remains the current running rollback copy and must not be changed during this migration phase.

## Save And Publish

Saving writes changes, uploads, and backups to the local Website checkout. Saving does not publish a website.

**Publish to Website GitHub** is a deliberate Git operation. It reviews and stages only allowed Website-content paths, creates a local commit, and pushes it to Website `origin/main` without force. It does not configure or trigger Cloudflare Pages, so a successful push is not yet public deployment. See `docs/PUBLISHING.md` for staging and retry rules.

## Development Checks

```sh
npm ci
npm test
npm run lint
```

See `docs/EDITOR.md`, `docs/BACKUPS.md`, and `docs/STAFF_GUIDE.md` for operating guidance. Recovery requires both repositories, not this Editor repository alone.

## Migration test

The `migration/github-pages-worker-test` branch is also used to test the serverless editor architecture at `admin.firstlutheranifalls.site`. For that test, GitHub Pages should deploy the migration branch from `/(root)`. Root `index.html` loads the existing browser-editor assets from `admin/`; root `CNAME` and `.nojekyll` support the Pages custom-domain deployment. The `docs/` directory remains documentation only.

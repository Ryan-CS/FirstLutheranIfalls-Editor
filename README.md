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

```bash
WEBSITE_ROOT=/opt/firstlutheran/website npm run dev
```

## Migration test

The `migration/github-pages-worker-test` branch is also used to test the serverless editor architecture at `admin.firstlutheranifalls.site`. For that test, GitHub Pages should deploy the migration branch from `/(root)`, where `index.html`, `app.js`, `styles.css`, `config.js`, `CNAME`, and `.nojekyll` form the Pages frontend. The `docs/` directory remains documentation only.

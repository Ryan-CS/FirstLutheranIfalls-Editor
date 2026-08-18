# AGENTS.md

## Repository Scope

`FirstLutheranIfalls-Editor` contains the editor UI, Node server, tests, and operational documentation. It does not contain the canonical public website.

The paired repository, `FirstLutheranIfalls-Website`, contains the canonical deployable website content. Recovery requires both repositories.

## Current Migration State

- Production target: Linux host `RyskStick`.
- Current editor runtime port: `8787`.
- `/opt/firstlutheran/site` remains the running production rollback copy during migration. Do not modify, delete, or repurpose it without an explicit cutover plan.
- The editor is being prepared to run from `/opt/firstlutheran/editor` against an external website checkout at `/opt/firstlutheran/website`.
- The production systemd service, Cloudflare, DNS, Basic Auth, and tunnel configuration are out of scope unless explicitly requested.

## Architecture

The editor reads and writes its content through `WEBSITE_ROOT`:

```text
Editor repository -> editor UI, server, tests, documentation
Website repository -> HTML, assets, files, posts, uploads, robots.txt
```

For development only, the server falls back to `public/` when `WEBSITE_ROOT` is unset. The production migration must set `WEBSITE_ROOT` explicitly to the Website checkout.

The future public website will deploy from `FirstLutheranIfalls-Website` through Cloudflare Pages. Once that cutover is complete, public availability must not depend on RyskStick.

The future admin route is `admin.firstlutheranifalls.org`, protected by Cloudflare Access/MFA and Cloudflare Tunnel, with the editor on RyskStick. Existing Basic Auth remains in place during the initial migration.

## Save And Publish

Save and Publish are separate operations.

- **Save** writes a page, upload, and backup to the local Website checkout at `WEBSITE_ROOT`. It does not make a Git commit or push a deployment.
- **Create publish commit** reviews and stages only allowed Website-repository changes, then creates a local Git commit. It does not push or deploy.
- **Publish to GitHub** is a future operation. It may push a reviewed local commit and allow Cloudflare Pages to deploy it.

Do not implement GitHub push behavior, modify the production service, or change Cloudflare configuration without an explicitly scoped migration phase.

## Safety Rules

- Never commit credentials, access tokens, Cloudflare tunnel data, Basic Auth values, runtime logs, or backups.
- Keep editor implementation and public website content in their separate repositories.
- Use small, reversible changes and run `npm test` and `npm run lint` for editor changes.
- Preserve `/opt/firstlutheran/site` as the rollback copy until final cutover is confirmed.

## Recovery

Recovery requires the Editor repository, the Website repository, documented runtime configuration, and any required hosting/identity configuration. The Editor repository alone cannot restore the public site.

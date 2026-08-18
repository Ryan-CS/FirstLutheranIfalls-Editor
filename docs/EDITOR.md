# Editor And Server Usage

## Scope

The editor UI and server live in `FirstLutheranIfalls-Editor`. Website pages and assets live in the separate `FirstLutheranIfalls-Website` checkout.

## Runtime

The production target is Linux host `RyskStick`. The current editor runtime port is `8787`.

Run a non-production instance against an explicit external website checkout:

```sh
WEBSITE_ROOT=/opt/firstlutheran/website \
BASIC_USER=admin \
BASIC_PASS='<set outside source control>' \
npm run dev
```

`WEBSITE_ROOT` is the canonical path for page listing, page load/save, uploads, backups, previews, and static content. If it is not defined, the server falls back to `public/` for development compatibility only.

Do not change `firstlutheran.service` during the current migration phase. `/opt/firstlutheran/site` remains the running rollback copy.

## Editing Flow

1. Open `/admin` on the editor runtime.
2. Authenticate with the configured editor credentials.
3. Choose a page from the Website checkout.
4. Edit the page and click **Save**.

Save writes the local file under `WEBSITE_ROOT`. Image uploads are written under `WEBSITE_ROOT/uploads/editor/`, and page backups are written under `WEBSITE_ROOT/_backups/`.

Save does not commit, push, or deploy. **Create publish commit** is a separate local-only action that creates a Git commit for reviewed Website-repository changes. It does not push or deploy. See `docs/PUBLISHING.md` for allowed staging paths and rejection rules.

## Planned Public And Admin Hosting

The public website will ultimately deploy from `FirstLutheranIfalls-Website` through Cloudflare Pages. `admin.firstlutheranifalls.org` will ultimately reach the editor through Cloudflare Access/MFA and Cloudflare Tunnel. Existing Basic Auth remains in place during the initial migration.

# Editor Usage

## Scope

The editor frontend (`index.html`, `admin/`) and its Cloudflare Worker API (`worker/`) live in `FirstLutheranIfalls-Editor`. Website pages and assets live in the separate `FirstLutheranIfalls-Website` checkout. There is no local server and no `WEBSITE_ROOT` in the current architecture — see `docs/WORKER-MIGRATION-TEST.md` for the full deployment and configuration reference this document summarizes.

## Runtime

- Frontend: GitHub Pages, deployed from this repository's `migration/github-pages-worker-test` branch root, at `admin.firstlutheranifalls.site`.
- API: Cloudflare Worker `firstlutheranifalls-editor`, deployed from `worker/` via `npx wrangler deploy`, at `firstlutheranifalls-editor.ryan-skogstad.workers.dev`.
- The Worker holds `GITHUB_TOKEN` and `EDITOR_API_TOKEN` as runtime secrets (Cloudflare dashboard → Worker → Variables and Secrets). Neither value lives in this repository or in browser code.

## Editing Flow

1. Open `admin.firstlutheranifalls.site`.
2. Enter the `EDITOR_API_TOKEN` value and click **Connect**. The token is kept only in the browser tab's memory for that session.
3. Choose a page from the list (top-level `*.html` files on the draft branch).
4. Edit the page and click **Save Draft**.

Save Draft commits the page to the `editor-test-draft` branch via the GitHub Contents API. Image uploads go to `uploads/editor/` on the same branch. Save does not touch the published branch and does not deploy anything.

**Publish Test Branch** fast-forwards `migration/github-pages-worker-test` to the draft commit — only if the draft is a clean, undiverged fast-forward of the target. It is rejected (never auto-merged or force-pushed) if the target branch has moved independently. A successful publish is followed by the website repository's GitHub Pages workflow deploying to `firstlutheranifalls.site`.

**Discard Draft** force-resets only `editor-test-draft` back to the current published branch, behind an explicit confirmation. It never touches the published branch.

Full endpoint list, Cloudflare setup, DNS, and a manual test checklist: `docs/WORKER-MIGRATION-TEST.md`.

## Legacy local server

An earlier design ran a Node server (`server/`) against a local `WEBSITE_ROOT` checkout on a Linux host (`RyskStick`), with its own save/backup/publish flow. That host and workflow are retired. The code remains in `server/` and is still covered by `tests/publish.test.mjs` and `tests/server-smoke.test.mjs`, but it is not part of the current deployment. `docs/PUBLISHING.md`, `docs/BACKUPS.md`, and `docs/AUDIT_LOG.md` describe that legacy server, not the current Worker.

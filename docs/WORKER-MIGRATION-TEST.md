# Editor migration test: GitHub Pages + Cloudflare Worker

This branch demonstrates the planned serverless editor architecture against the isolated website branch `migration/github-pages-worker-test` and the test domain `firstlutheranifalls.site`. Production `main` and `firstlutheranifalls.org` are not publishing targets.

## Architecture

```text
admin.firstlutheranifalls.site
        |
        v
GitHub Pages (admin/ frontend only)
        |
        | HTTPS + Bearer editor token
        v
firstlutheranifalls-editor.ryan-skogstad.workers.dev
        |
        | GITHUB_TOKEN stored only as Worker runtime secret
        v
Ryan-CS/FirstLutheranIfalls-Website
        |- migration/github-pages-worker-test  <- published test site
        `- editor-test-draft                   <- unpublished editor saves
```

The browser never receives `GITHUB_TOKEN`. The test editor token is entered manually for each browser session and kept only in JavaScript memory. It is not embedded in the repository, HTML, config, URL, localStorage, or sessionStorage.

For production, replace the simple bearer-token gate with an identity system such as Cloudflare Access while retaining the Worker-side authorization checks.

## Cloudflare Worker setup

Create/import a Worker from the `worker/` directory on this branch.

- Worker name: `firstlutheranifalls-editor`
- Root directory: `worker`
- Deploy command: `npx wrangler deploy`
- Build variable: `SKIP_DEPENDENCY_INSTALL=true`
- Runtime Worker secret: `GITHUB_TOKEN`
- Runtime Worker secret: `EDITOR_API_TOKEN`

The Wrangler config intentionally does not declare required secrets during bootstrap. This allows the Worker to deploy before runtime secrets exist. Until both runtime secrets are added, `/api/health` reports their configuration state and protected editor routes remain unusable.

After the first successful deployment, add `GITHUB_TOKEN` and `EDITOR_API_TOKEN` under the deployed Worker's runtime **Variables and Secrets** settings. They are not build variables and are not required during `npx wrangler deploy` itself.

`GITHUB_TOKEN` should be a fine-grained GitHub credential limited to the `FirstLutheranIfalls-Website` repository with only the permissions necessary to read/write contents and refs. Do not use a broad account token.

Generate `EDITOR_API_TOKEN` as a long random value. Staff enter it into the test editor when connecting. Never put it in `admin/config.js`.

The non-secret Worker variables are declared in `worker/wrangler.jsonc`:

- GitHub owner: `Ryan-CS`
- Website repo: `FirstLutheranIfalls-Website`
- Publish target: `migration/github-pages-worker-test`
- Draft branch: `editor-test-draft`

## Editor API

Public diagnostic endpoint:

- `GET /api/health`

Authenticated endpoints:

- `GET /api/editor/pages`
- `GET /api/editor/page?path=index.html`
- `GET /api/editor/status`
- `POST /api/editor/save`
- `POST /api/editor/upload`
- `POST /api/editor/publish`
- `POST /api/editor/discard`

The editor only permits top-level HTML page edits through the page endpoint. Uploads are limited to supported image formats and are stored under `uploads/editor/`.

## Save and publish semantics

**Save Draft** commits changes to `editor-test-draft`. It does not alter the test site's published branch.

**Publish Test Branch** checks that the draft is strictly ahead of the test branch with no divergence, then performs a non-force fast-forward of `migration/github-pages-worker-test` to the draft commit. If the target branch advanced independently, publishing is blocked instead of auto-merging.

The website GitHub Pages workflow is triggered when the migration test branch advances, so a successful publish is followed by a Pages deployment to `firstlutheranifalls.site`.

**Discard Draft** force-resets only `editor-test-draft` to the current test branch after an explicit confirmation. It never resets production `main`.

## GitHub Pages editor setup

Repository Settings → Pages must use **GitHub Actions**. `.github/workflows/test-pages.yml` deploys the contents of `admin/` as the root of `admin.firstlutheranifalls.site`.

The repository may need to be public, or the GitHub account must support Pages for private repositories.

## Test checklist

1. Deploy the Worker successfully.
2. Add `GITHUB_TOKEN` and `EDITOR_API_TOKEN` as runtime Worker secrets.
3. Confirm `https://firstlutheranifalls-editor.ryan-skogstad.workers.dev/api/health` reports both Worker secrets configured.
4. Open `https://admin.firstlutheranifalls.site/`.
5. Enter the test `EDITOR_API_TOKEN` and Connect.
6. Load a page and make a harmless visible test edit.
7. Save Draft and verify the public site has not changed yet.
8. Publish Test Branch.
9. Wait for the Website GitHub Pages workflow to complete.
10. Refresh `https://firstlutheranifalls.site/` and verify the change.
11. Make another draft edit, choose Discard Draft, and verify it never reaches the published test branch.

## Security notes

CORS is not the security boundary. Direct requests to the Worker are expected to be possible. Sensitive endpoints still require Worker-side authentication and narrow GitHub operations. The Worker is not a generic GitHub proxy: repository, branches, editable page paths, upload path, and supported methods are constrained by code and configuration.

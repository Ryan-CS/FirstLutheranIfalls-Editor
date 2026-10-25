# Architecture and Backend Handoff

**Status date:** 2026-08-21

This document is the detailed handoff for the First Lutheran website/editor migration. It explains not only what is deployed, but why the architecture ended up this way, which earlier designs are retired, where state lives, what the branch rules mean, and which failures are dangerous versus merely confusing.

The short version is: **GitHub is the content database and version history, GitHub Pages serves both static frontends, and a narrowly scoped Cloudflare Worker is the only backend used by the editor.** There is no production Node server and no production filesystem checkout.

## 1. Current system at a glance

There are two repositories with deliberately separate responsibilities:

- `Ryan-CS/FirstLutheranIfalls-Website` owns the public website content.
- `Ryan-CS/FirstLutheranIfalls-Editor` owns the staff editor UI and the Cloudflare Worker API.

At the time of this handoff, both repositories use `migration/github-pages-worker-test` as their active/default branch. Despite the name, this branch is the current working architecture. `main` should not be assumed to be current.

```text
Staff browser
    |
    | HTTPS
    v
admin.firstlutheranifalls.site
GitHub Pages: FirstLutheranIfalls-Editor
branch: migration/github-pages-worker-test
folder: /(root)
    |
    | Bearer EDITOR_API_TOKEN
    | JSON / HTML API requests
    v
Cloudflare Worker: firstlutheranifalls-editor
    |
    | GITHUB_TOKEN (Worker secret; never sent to browser)
    v
GitHub API
Ryan-CS/FirstLutheranIfalls-Website
    |
    +-- editor-test-draft
    |      unpublished editor work
    |
    `-- migration/github-pages-worker-test
           published test/public site
           |
           v
       GitHub Pages
       firstlutheranifalls.site
```

The public website is static. The editor frontend is also static. The Worker exists only because a browser must not receive a GitHub write credential.

## 2. Why the architecture changed

The original design evolved through several stages. Understanding this matters because old documentation and old code paths can otherwise look plausible.

### Earlier combined/local-server design

The editor initially had a Node server that served files, wrote a local website checkout, made backups, and was intended to run on the Linux host `RyskStick`. The planned access path involved Cloudflare Tunnel/Access and a `WEBSITE_ROOT` filesystem path.

That design had several disadvantages for this project:

- the church website depended on a particular local machine being online;
- editor writes depended on a local Git checkout being healthy and synchronized;
- deployment, authentication, backup, and filesystem state were spread across several layers;
- the public site and editing runtime were unnecessarily coupled;
- stale copies of the site could become competing sources of truth.

### Current serverless/GitHub-backed design

The migration replaced the local runtime with GitHub and a Worker:

- GitHub is already the canonical versioned store;
- GitHub Pages is sufficient for static HTML/CSS/JS;
- the Worker can make constrained GitHub API calls without exposing credentials;
- the public site remains available regardless of any local computer;
- Save and Publish can be represented explicitly as Git branch operations;
- Git history becomes the audit/recovery mechanism instead of ad-hoc filesystem copies.

The old Node server, `WEBSITE_ROOT`, RyskStick deployment, systemd service, Cloudflare Tunnel, and Basic Auth are **retired architecture**. Historical documents may mention them, but they are not dependencies of the current system.

## 3. Repository boundary

### Website repository

`FirstLutheranIfalls-Website` is the source of truth for public content. It contains top-level HTML pages, assets, uploaded files, site scripts/styles, `CNAME`, and the GitHub Pages deployment configuration.

The editor Worker writes only to this repository. It does not write editor application code.

### Editor repository

`FirstLutheranIfalls-Editor` contains:

- `index.html` — GitHub Pages entry point for the editor;
- `admin/` — browser editor assets;
- `worker/` — Cloudflare Worker backend;
- `docs/` — operational and architectural documentation;
- tests/configuration for the editor project.

The `docs/` folder is documentation only. A major source of confusion during migration was treating `docs/` as if it were the GitHub Pages publication root. The editor Pages configuration is **Deploy from a branch**, `migration/github-pages-worker-test`, `/(root)`. The root `index.html` is intentional.

## 4. Branch model: the central design decision

The website repository uses two branches for the editor transaction model:

```text
migration/github-pages-worker-test  = published state
editor-test-draft                    = unpublished editor state
```

This is intentionally simple. There is no database and no separate draft storage service.

### Save Draft

A Save operation writes the edited file directly to `editor-test-draft` through the GitHub Contents API. Image uploads also go to the draft branch under `uploads/editor/`.

Saving does **not** alter the published branch and therefore should not alter the live site.

### Publish

Publish compares the target and draft branches. Publication is allowed only when the draft is a clean descendant of the target: draft is ahead and is not behind.

If that condition holds, the Worker updates the target branch ref to the draft SHA with `force: false`. In Git terms, this is a fast-forward, not a merge commit and not a force push.

This is an important safety property. The Worker does not try to resolve conflicts or silently merge independent edits.

### Divergence

If somebody changes the published target branch independently while an older draft contains unpublished work, the branches can diverge. The Worker deliberately returns a conflict instead of guessing which content wins.

When this happens, an administrator must decide whether to preserve/reconcile the draft or discard it. Do not “fix” this by making Publish force-update the target branch; that would remove the main protection against overwriting newer work.

### Discard Draft

Discard resets `editor-test-draft` to the current target SHA using a force update. Force is acceptable here because the draft branch is explicitly disposable unpublished state. It never force-resets the published target branch.

If the draft branch does not exist, the Worker creates it from the target.

## 5. Worker responsibilities

The Worker is intentionally not a general GitHub proxy. Its current responsibilities are narrow:

- authenticate editor API requests;
- list editable top-level HTML pages;
- retrieve a page from the draft branch;
- save a page to the draft branch;
- upload supported images to the draft branch;
- report draft/target branch status;
- fast-forward the published branch when safe;
- reset the draft branch when explicitly discarded.

The public diagnostic endpoint is `GET /api/health`.

Authenticated editor endpoints are:

```text
GET  /api/editor/pages
GET  /api/editor/page?path=index.html
GET  /api/editor/status
POST /api/editor/save
POST /api/editor/upload
POST /api/editor/publish
POST /api/editor/discard
```

Editable page paths are deliberately constrained to top-level `*.html` filenames. The API rejects arbitrary repository paths. Uploads are constrained to supported image MIME types, size limits, sanitized filenames, and the `uploads/editor/` directory.

These restrictions are security boundaries as well as application behavior. Preserve them unless a replacement mechanism provides equivalent path/operation constraints.

## 6. Credentials and trust boundaries

Two credentials have very different purposes.

### `EDITOR_API_TOKEN`

This authenticates a staff browser to the Worker. In the current test architecture the user enters it manually. The browser keeps it in JavaScript memory for the session. It must not be committed to Git, embedded in `admin/config.js`, placed in a URL, or stored as the GitHub credential.

This token is a transitional/simple authentication mechanism. A future production deployment can put Cloudflare Access or another identity layer in front, but the backend should still enforce authorization rather than treating CORS as authentication.

### `GITHUB_TOKEN`

This is the Worker's service credential for GitHub. It exists only as a Cloudflare Worker runtime secret. The browser must never receive it.

It should be fine-grained and limited to the Website repository with only the repository permissions needed for content/ref operations. A broad personal token would unnecessarily increase impact if the Worker environment were compromised.

### CORS

The Worker limits browser origins, but CORS is not the security boundary. Anyone can make a direct HTTP request outside a browser. Protected endpoints must continue to require authentication and must continue to constrain repository/branch/path operations server-side.

## 7. Editor preview and content ownership

The editor loads the selected website HTML into an iframe using `srcdoc`. A `<base>` element is injected so site-relative assets resolve against the live site.

The preview should behave enough like the real site that staff understand what page they are editing, but it must not make global site chrome accidentally editable.

The current editor therefore treats page content and site chrome differently:

- primary page content (`.hero` and `main#main`, where present) is editable;
- top navigation/header is locked;
- footer is locked;
- other document chrome outside editable regions is locked;
- internal navigation links in the preview are intercepted and load the corresponding page into the editor instead of navigating the outer admin application away;
- menu/dropdown behavior is reproduced in the preview because arbitrary embedded site scripts are not relied on for editor operation.

On save, the editor reconstructs the document using the original locked structure plus the edited content regions. This is intentional: transient preview state, an opened menu, or an accidental DOM mutation in the header/footer should not become published website source.

This separation is an important editor invariant. If page templates evolve, update the editable-region logic deliberately rather than reverting to whole-document `designMode` editing.

## 8. GitHub Pages configuration

### Editor

Repository: `FirstLutheranIfalls-Editor`

```text
Source: Deploy from a branch
Branch: migration/github-pages-worker-test
Folder: /(root)
Custom domain: admin.firstlutheranifalls.site
```

The root contains `index.html`, `.nojekyll`, and `CNAME`; `index.html` references assets under `admin/`.

### Website

Repository: `FirstLutheranIfalls-Website`

The active website branch is `migration/github-pages-worker-test`, and the custom domain is `firstlutheranifalls.site`. Changes published by the Worker advance this branch, after which GitHub Pages deploys the new static state.

Do not attach the same apex custom domain to multiple active Pages sites. During migration this created confusing certificate/routing symptoms and made diagnosis harder.

## 9. DNS and HTTPS lessons from the migration

The `.site` domain was used to validate the architecture without moving the eventual production `.org` site prematurely.

During troubleshooting, Cloudflare still showed a zone even after authoritative nameservers had been moved to GoDaddy. A Cloudflare dashboard zone can exist or be “paused” without being authoritative. The authoritative answer is the domain's delegated NS records, not the fact that a provider still displays the zone.

For the GoDaddy-hosted DNS test, public recursive resolvers eventually agreed that the authoritative nameservers were:

```text
ns39.domaincontrol.com
ns40.domaincontrol.com
```

The GitHub Pages apex uses GitHub's documented A records (and optionally the documented AAAA records). `www` or other subdomains should only have the CNAME records actually required. Extra A/AAAA/ALIAS/ANAME records on the apex, or conflicting CNAMEs on a Pages hostname, can prevent GitHub from issuing the custom-domain certificate.

A particularly misleading symptom was HTTP and HTTPS appearing to reach different sites. That can happen during DNS/certificate transition because HTTP routing may already point at the intended Pages site while HTTPS is still presenting/routing through a stale or wrong endpoint/certificate. A `*.github.io` certificate on the custom domain means GitHub has not yet provisioned/selected the custom-domain certificate; it is not evidence that mixed content caused the TLS failure.

“Mixed content” happens after a valid HTTPS page loads and then requests insecure `http://` subresources. It does not cause `ERR_CERT_COMMON_NAME_INVALID` during the TLS handshake.

GoDaddy forwarding/parking should not be used as a substitute for the DNS records GitHub Pages expects. A `/lander` GoDaddy parking page was evidence that a request was reaching GoDaddy parking/forwarding infrastructure, not the GitHub Pages site.

## 10. CNAME files and the `docs/` trap

A GitHub Pages custom domain is represented by a `CNAME` file in the publication source. Because the editor was at one point mistakenly treated as a `/docs` Pages site, historical/duplicate `docs/CNAME` material may exist.

For the current editor configuration, the meaningful Pages source is the repository root. Root `CNAME` is the one associated with the current root deployment. Documentation under `docs/` should not be treated as deployable site content simply because GitHub Pages supports `/docs` as an optional source mode.

If changing Pages source mode in the future, audit all CNAME files and deployment assumptions at the same time.

## 11. Cloudflare Worker deployment details

The backend code lives in `worker/`. The intended Worker is `firstlutheranifalls-editor`.

Non-secret configuration identifies:

```text
GITHUB_OWNER = Ryan-CS
GITHUB_REPO = FirstLutheranIfalls-Website
TARGET_BRANCH = migration/github-pages-worker-test
DRAFT_BRANCH = editor-test-draft
```

Required runtime secrets:

```text
GITHUB_TOKEN
EDITOR_API_TOKEN
```

The secrets are runtime Worker secrets, not values to bake into the build or repository.

A separate Worker named `firstlutheranifalls-website` / configuration referencing `first-lutheran-site-api` was used while testing website API behavior (including the YouTube RSS endpoint). Do not confuse that with the editor backend. The editor UI should talk to the editor Worker configured in `admin/config.js`.

When Wrangler reports that the config `name` differs from the CI-connected Worker name, resolve the mismatch rather than assuming the warning is cosmetic. Cloudflare connected builds can override the local Worker name and make it easy to deploy correct code under an unexpected Worker identity.

## 12. Failure modes and what they mean

### Editor loads, but Connect fails

Check Worker `/api/health`, then verify `EDITOR_API_TOKEN` and `GITHUB_TOKEN` are present as runtime secrets. A healthy static editor page does not prove the API is configured.

### Pages list fails after authentication

Likely causes include GitHub token permissions, wrong owner/repository variables, missing target branch, or GitHub API failure.

### Save succeeds but live site does not change

That is expected. Save changes only `editor-test-draft`. Publish is a separate operation.

### Publish returns conflict/409

Treat this as a safety stop. Inspect branch status. The draft is no longer a clean fast-forward. Decide whether to reconcile manually or discard draft. Do not force-publish.

### Publish succeeds but website appears unchanged

Check the Website repository target branch SHA, then its GitHub Pages deployment/workflow, then browser/CDN caching. Publication and Pages deployment are separate steps.

### GitHub Pages shows 404 at a custom domain

First verify the selected Pages source branch/folder contains `index.html`. This happened when source/root assumptions were wrong. Then verify the CNAME/custom-domain setting and DNS.

### HTTPS unavailable / certificate name invalid

Check DNS records and competing custom-domain configuration before changing application code. Certificate issuance is infrastructure state. Mixed content is a different class of problem.

### GoDaddy lander appears

Look for forwarding/parking or DNS pointing to GoDaddy infrastructure. Do not “fix” the application repository until DNS routing is proven correct.

### Header/footer becomes editable again

Treat this as an editor regression. The intended model is content-region editing with locked site chrome and reconstructed saves.

## 13. Operational workflow

For normal staff editing:

1. Open `admin.firstlutheranifalls.site`.
2. Authenticate/connect to the editor API.
3. Select a page.
4. Use the preview navigation or page list to move among pages.
5. Edit page content; header/navigation/footer should remain locked.
6. Save Draft.
7. Review as needed; the public site should still be unchanged.
8. Publish when ready.
9. Allow GitHub Pages deployment to finish and verify the public site.

For administrators changing code or site templates, remember that direct commits to the website target branch can intentionally trigger the Worker's divergence protection if an unpublished draft already exists. Check editor branch status before making large direct website changes.

## 14. Recovery model

Git history is the primary recovery mechanism.

Because Save creates commits on the draft branch and Publish advances the target branch, prior states are Git commits. There is no current local backup directory required for normal operation.

If the published site must be rolled back, prefer an explicit, reviewed Git operation on the Website repository rather than modifying the Worker to force refs. After a rollback, realign/reset the draft branch deliberately so the next Publish has a comprehensible ancestry relationship.

The retired `BACKUPS.md`/audit/local-server material describes the previous filesystem design and should not be interpreted as the current recovery mechanism.

## 15. Invariants future maintainers should preserve

These are more important than any particular implementation detail:

1. The Website repository remains the canonical public-content source of truth.
2. The browser never receives a GitHub write credential.
3. The backend is not a generic arbitrary-path GitHub proxy.
4. Save does not publish.
5. Publish never force-overwrites the published branch.
6. Divergence causes a visible stop, not an automatic merge or overwrite.
7. Discard may destroy only the explicitly disposable draft state.
8. Site chrome is not casually editable through the page-content editor.
9. The public website must not depend on a local church computer being online.
10. DNS authority, GitHub Pages configuration, and Cloudflare dashboard state are separate concepts; diagnose each layer independently.

## 16. What is still transitional

Names containing `migration`, `test`, and `.site` reflect how the architecture was introduced, not necessarily the final naming scheme. Before a production `.org` cutover, decide explicitly whether to rename branches/Workers or keep the stable working names. Renaming is cosmetic unless every dependent configuration is changed consistently.

The bearer editor token is adequate for the current controlled test but is the obvious authentication component to improve for broader staff use. Cloudflare Access/MFA is a reasonable future front door, but it should complement rather than weaken Worker-side authorization.

The editor currently assumes editable pages are top-level HTML documents with recognizable content regions. If the website later becomes template-driven or moves to a CMS/build system, the editor/save contract will need to change; do not stretch the current DOM reconstruction approach into an unrelated content model.

## 17. Where to look in the repository

Use these files as the starting points:

```text
admin/app.js                  browser editor behavior, preview, save/publish UI
admin/config.js               browser-visible API/live-site configuration
worker/src/index.js           backend API and GitHub branch operations
worker/wrangler.jsonc         Worker non-secret deployment configuration
docs/DECISIONS.md             chronological architecture decisions
docs/WORKER-MIGRATION-TEST.md setup-oriented Worker migration notes
docs/ARCHITECTURE-HANDOFF.md  this system-level handoff
```

When documentation disagrees, prefer current deployed code plus the newest dated decision record. Several older documents were intentionally retained for history and recovery context, and their existence does not mean their architecture is active.

## 18. Final mental model

The easiest way to reason about the system is to stop thinking of the editor as a web server with a filesystem.

It is a **Git-backed publishing client**:

```text
GitHub Pages = UI hosting
Cloudflare Worker = credential boundary + constrained publishing API
GitHub draft branch = draft database
GitHub published branch = published database
GitHub history = audit/recovery history
GitHub Pages website deployment = static delivery
```

That model explains most of the implementation choices and is the model future changes should either preserve or consciously replace.
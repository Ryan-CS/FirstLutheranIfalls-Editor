# Publishing Website Changes (Legacy Local Server)

> This document describes the retired Node server (`server/`) that ran against a local `WEBSITE_ROOT` checkout on `RyskStick`. That host and workflow are no longer deployed. For how publishing actually works today (a Cloudflare Worker fast-forwarding a GitHub branch), see `docs/WORKER-MIGRATION-TEST.md`. This page is kept because `server/` and its tests remain in the repository.

**Save** writes page, upload, and backup changes locally under `WEBSITE_ROOT`. It does not commit or push.

**Publish to Website GitHub** performs a guarded Git workflow:

1. Fetch `origin`.
2. Require the Website checkout to be on the configured branch (`main` by default) and exactly synchronized with `origin/main`.
3. Stage only allowed content paths.
4. Create one local commit.
5. Push that commit to `origin/main` without force.

A successful Publish response includes the commit SHA, branch, and `pushed: true`. It does not configure or trigger Cloudflare Pages, so a successful Git push does not yet guarantee a public internet deployment.

## Staging Rules

The editor stages individual changed paths only. It never runs `git add .`.

Allowed paths are top-level `*.html`, top-level `robots.txt`, and content beneath `assets/`, `files/`, `gdpr/`, `posts/`, and `uploads/`.

The operation rejects backups, logs, temporary files, editor/server/test/documentation paths, hidden environment files, symlinks, unsupported paths, and common credential material in text content. Ignored `_backups/` content is not staged.

## Safe Failure And Retry

Publish fails before committing if `origin/main` has advanced, history has diverged, or unrelated local commits are already ahead of origin. It never auto-merges or force-pushes.

If commit creation succeeds but the push fails, the local commit remains intact and the response includes its SHA with `pushed: false`. The editor records a local pending marker for that exact commit. After the remote problem is corrected, selecting Publish again retries only that marked commit; it does not commit or push unrelated local history.

Cloudflare Pages deployment remains intentionally out of scope.

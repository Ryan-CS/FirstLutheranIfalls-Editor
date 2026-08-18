# Local Publish Commits

The **Create publish commit** control creates a local Git commit in the Website checkout. It does not push to GitHub, deploy Cloudflare Pages, or make a page live on the internet.

## Preconditions

- `WEBSITE_ROOT` must be a Git working tree.
- The checkout must be on the expected branch. The default is `main`; set `WEBSITE_GIT_BRANCH` only for an explicitly scoped workflow.
- There must be no pre-staged changes.

## Staging Rules

The editor stages individual changed paths only. It never runs `git add .`.

Allowed paths are top-level `*.html`, top-level `robots.txt`, and content beneath `assets/`, `files/`, `gdpr/`, `posts/`, and `uploads/`.

The operation rejects backups, logs, temporary files, editor/server/test/documentation paths, hidden environment files, symlinks, unsupported paths, and common credential material in text content. Ignored `_backups/` content is not staged.

## Next Phase

A future Publish-to-GitHub operation may push a reviewed local commit to the Website repository. That operation is intentionally not implemented here.

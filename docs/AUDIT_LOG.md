# Audit Log (Legacy Local Server)

> This document describes the retired Node server (`server/`), which wrote a local audit log on `RyskStick`. That host and workflow are no longer deployed. The current Cloudflare Worker has no separate audit log; the GitHub commit history on `editor-test-draft` and `migration/github-pages-worker-test` (with commit messages like `Editor draft: update index.html`) is the audit trail. This page is kept because `server/` and its tests remain in the repository.

The server writes an audit log to `logs/audit.log`.

Each line format:

```
ISO_TIMESTAMP | action | user | detail
```

Examples:

- `2026-02-10T03:45:12.123Z | save | admin | index.html (10524 chars)`
- `2026-02-10T03:46:07.040Z | upload | admin | 1707546367040-banner.jpg`

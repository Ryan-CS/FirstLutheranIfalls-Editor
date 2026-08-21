# Audit Log (Legacy Local Server)

> This document describes the retired Node server, which wrote a local audit log on `RyskStick`. That code (`server/`) has been removed from the repository. The current Cloudflare Worker has no separate audit log. Published changes on `migration/github-pages-worker-test` (with commit messages like `Editor draft: update index.html`) are a permanent audit trail. Draft-only saves on `editor-test-draft` are not permanent: Discard Draft force-resets that branch, which can make an unpublished save's commit unreachable. This page is kept only as historical/recovery reference.

The server writes an audit log to `logs/audit.log`.

Each line format:

```
ISO_TIMESTAMP | action | user | detail
```

Examples:

- `2026-02-10T03:45:12.123Z | save | admin | index.html (10524 chars)`
- `2026-02-10T03:46:07.040Z | upload | admin | 1707546367040-banner.jpg`

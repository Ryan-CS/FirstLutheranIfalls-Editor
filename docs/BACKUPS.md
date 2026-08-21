# Backups (Legacy Local Server)

> This document describes the retired Node server, which wrote timestamped local backups on `RyskStick`. That code (`server/`) has been removed from the repository. The current Cloudflare Worker architecture has no separate backup step — every save and publish is a normal Git commit, so GitHub history is the recovery mechanism. See `docs/WORKER-MIGRATION-TEST.md` for the current system; this page is kept only as historical/recovery reference.

Every Save creates a timestamped backup of the prior HTML file inside the external Website checkout:

```text
$WEBSITE_ROOT/_backups/
```

- Format: `<filename>.<timestamp>.html`
- Example: `index.2026-02-10T03-15-22-123Z.html`
- Retention: the most recent 20 backups per page by default

Set `BACKUP_RETENTION` in the editor runtime environment to change retention. Backups are runtime recovery material and must not be committed to either repository.

Save is local only. A future Publish operation will separately commit and push reviewed Website-repository changes. Do not treat a backup or save as a public deployment.

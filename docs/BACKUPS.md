## Backups

Every save creates a timestamped backup of the prior HTML file in `public/_backups/`.

- Format: `<filename>.<timestamp>.html`
- Example: `index.2026-02-10T03-15-22-123Z.html`
- Retention: the most recent 20 backups per page by default

You can change retention with:

```powershell
$env:BACKUP_RETENTION = "30"
```

## Restore a backup

```powershell
node scripts/restore-backup.mjs index.html
```

To restore a specific backup file:

```powershell
node scripts/restore-backup.mjs index.html index.2026-02-10T03-15-22-123Z.html
```

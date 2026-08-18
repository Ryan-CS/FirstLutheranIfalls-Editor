# Audit Log

The server writes an audit log to `logs/audit.log`.

Each line format:

```
ISO_TIMESTAMP | action | user | detail
```

Examples:

- `2026-02-10T03:45:12.123Z | save | admin | index.html (10524 chars)`
- `2026-02-10T03:46:07.040Z | upload | admin | 1707546367040-banner.jpg`

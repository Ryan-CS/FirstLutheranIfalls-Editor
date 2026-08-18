# Editor & Server Usage

## Start the server

```powershell
npm run dev
```

The server runs on `http://localhost:8787`.

- Public site: `http://localhost:8787/`
- Admin editor: `http://localhost:8787/admin`

## Basic authentication

Set credentials using environment variables before starting the server:

```powershell
$env:BASIC_USER = "admin"
$env:BASIC_PASS = "change-this"
npm run dev
```

Optional:

- `BASIC_REALM` controls the browser prompt label.
- `BASIC_PROTECT_ALL=1` protects the public site with Basic Auth as well.

## Editing flow

1. Open the editor at `/admin`.
2. Choose a page from the left list (HTML files in `public/`).
3. Edit directly in the preview.
4. Click **Save** to write changes back to the original file.

## Images

Use **Upload Image** to add a photo. The file is stored in `public/uploads/editor/` and inserted into the page.

## Templates

Use the template picker to insert common layout blocks such as callouts, two-column sections, and event cards.

All edits update the real HTML file inside `public/`.

## Backups

Every save creates a timestamped backup of the prior file in `public/_backups/`.

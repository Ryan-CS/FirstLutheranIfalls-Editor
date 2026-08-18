# Staff Guide

This guide is for non-technical staff who need to update the website.

## Start the website

```powershell
$env:BASIC_USER = "admin"
$env:BASIC_PASS = "change-this"
npm run dev
```

Open the editor in your browser:

- `http://localhost:8787/admin`

## Edit a page

1. Pick a page from the left list.
2. Click inside the page and edit text directly.
3. Use the toolbar for headings, lists, and links.
4. Click **Save** when finished.

## Add images

1. Click **Upload Image**.
2. Choose a file from your computer.
3. The image is inserted where your cursor is.

## Insert a template

Use the template picker to insert a callout, two-column section, or event card.

## Important reminders

- Always click **Save** when you are done.
- Changes update the real files in `public/` immediately.
- Backups are stored in `public/_backups/`.

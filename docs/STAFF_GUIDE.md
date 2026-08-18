# Staff Guide

## Editing A Page

Use the administrator URL supplied by the church technical administrator. During migration, the editor runs on RyskStick at port `8787`; the intended long-term address is `https://admin.firstlutheranifalls.org` behind Cloudflare Access/MFA and Cloudflare Tunnel.

1. Sign in.
2. Select a page from the left list.
3. Edit text directly in the preview.
4. Use the toolbar for headings, lists, links, and images.
5. Click **Save** when finished.

## Images

Choose **Upload Image**, select a file, and the editor inserts it at the current cursor position. Uploaded images are stored in the local Website checkout.

## Important Reminders

- Save writes changes to the local Website checkout and creates a backup.
- Save does not make a public website change by itself.
- Publish is a separate future action that will send reviewed Website-repository changes to GitHub and Cloudflare Pages.
- The public site will ultimately remain online through Cloudflare Pages even if RyskStick is offline.

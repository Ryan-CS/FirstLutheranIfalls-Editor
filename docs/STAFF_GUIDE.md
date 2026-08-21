# Staff Guide

## Editing A Page

Go to `https://admin.firstlutheranifalls.site/`.

1. Enter the editor token you were given, and click **Connect**.
2. Select a page from the left list.
3. Edit text directly in the preview. The header and footer are locked; only the main page content is editable.
4. Use the toolbar for headings, lists, links, and images.
5. Click **Save Draft** when finished with a page.

## Images

Click **Upload Image**, choose a file, and the editor inserts it at the current cursor position. Uploaded images are saved to the draft branch under `uploads/editor/`.

## Publishing

**Save Draft** does not change the public website. It only records your change.

When you are ready for your edits to go live, click **Publish Test Branch**. This is a separate, deliberate step — nothing you save is public until you publish. A few minutes after publishing, the change should appear on `https://firstlutheranifalls.site/`.

If you made changes you don't want, click **Discard Draft** to throw away every unpublished change and start over from the current live version. This cannot be undone.

## Important Reminders

- Save Draft ≠ Publish. Always publish deliberately when you want a change to go live.
- There is no separate "backup" step to remember — every save and every publish is a normal Git commit. Anything you've **published** stays in the site's permanent history and can be recovered. A **draft** you save but never publish is not guaranteed recoverable once you Discard it — see the warning above. Ask the technical administrator if you need something restored.
- This is the `firstlutheranifalls.site` test domain, not `firstlutheranifalls.org`. Confirm with the technical administrator which domain is currently the live production site before treating a change as final.

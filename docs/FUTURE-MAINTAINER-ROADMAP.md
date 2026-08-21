# Future Maintainer Roadmap: “I Was Given This System and Told to Fix It”

**Audience:** a technically experienced person who did not design this system.

**Purpose:** prevent a future maintainer from accidentally dismantling the properties that make the First Lutheran website/editor durable while trying to repair an unfamiliar failure.

If you have inherited this system because somebody said “the church website is broken; fix it,” start here before redesigning anything.

## 1. First principle: understand the roles, not the vendors

The architecture is deliberately based on old, boring Internet primitives:

```text
Static HTML/CSS/JavaScript
+ version-controlled files
+ HTTPS API boundary
+ authenticated publishing
+ DNS
```

Today those roles are implemented with GitHub, GitHub Pages, Cloudflare Workers, and GoDaddy DNS. Those companies are **implementations**, not the architecture.

The system does not require GitHub or Cloudflare to exist forever. It requires equivalents of:

- a versioned file store;
- a static web host;
- a small trusted server-side/edge runtime capable of making authenticated repository operations;
- DNS and HTTPS.

If a provider disappears, becomes too expensive, or changes incompatibly, replace that provider's role. Do not assume the whole system needs to be rebuilt.

## 2. Why this system can have an unusually long life

Most church and small-organization websites eventually become difficult to maintain because their content is trapped in a specific CMS, database schema, server image, plugin ecosystem, local computer, or proprietary export format. This system intentionally avoids those dependencies.

The public content is ordinary files. The editor edits those files. Git records every published and draft change. The public website is static. The privileged backend is intentionally small. There is no production database that must be kept alive and migrated forever.

That gives the system a useful property: **every major infrastructure component can be replaced independently while the content model remains understandable.**

A future static host can serve the HTML. A future Git provider can hold the files. A future edge/runtime provider can implement the constrained publishing API. DNS can move between registrars/providers. None of those migrations inherently require converting the church's content into a new application.

This does not guarantee a 50-year lifespan. No one can guarantee that. It does mean the design is intended to survive normal generations of hosting products and infrastructure by depending on portable fundamentals rather than a particular product stack.

## 3. Mental model in one diagram

```text
                 PUBLIC / UNPRIVILEGED

Visitor browser
      |
      v
firstlutheranifalls.site
      |
      v
Static GitHub Pages site
      |
      | files come from published Website branch
      v
FirstLutheranIfalls-Website repository


                 STAFF / PRIVILEGED

Staff browser
      |
      v
admin.firstlutheranifalls.site
      |
      v
Static editor UI (GitHub Pages)
      |
      | authenticated HTTPS requests
      v
Cloudflare Editor Worker
      |
      | GitHub credential exists HERE ONLY
      v
GitHub API
      |
      +--> editor-test-draft              unpublished state
      |
      `--> migration/github-pages-worker-test   published state
```

The Worker is not hosting the editor and is not hosting the website. It is a credential and policy boundary between an untrusted browser and GitHub write access.

## 4. The most important distinction: replaceable details vs. design invariants

When repairing the system, separate these two categories.

### Replaceable implementation details

These can change if necessary:

- GitHub as Git host;
- GitHub Pages as static host;
- Cloudflare Workers as API runtime;
- GoDaddy as registrar/DNS host;
- domain names;
- the exact authentication provider;
- the exact branch names, if migration is done carefully;
- the editor's visual implementation.

### Architectural invariants

Preserve these concepts unless you are intentionally replacing them with something equally safe:

1. **Content remains portable and file-based.** Do not trap the website in an opaque proprietary database or CMS without a compelling migration/recovery story.
2. **Published and draft states remain separate.** Saving a draft must not silently change the live website.
3. **Secrets never enter browser code or the repository.** A browser is not a trusted secret store.
4. **The backend's write capability remains narrowly scoped.** Do not turn the Worker into a generic authenticated GitHub proxy.
5. **Publishing is explicit and non-destructive.** A publish operation should not overwrite independent newer work.
6. **History remains recoverable.** Git history is part of the backup/audit/recovery design, not clutter.
7. **Content editing remains separate from site-template/chrome editing.** Staff should not accidentally rewrite navigation, footer, scripts, metadata, or global structure while editing a paragraph.
8. **No local machine is required for production availability.** A church PC, Raspberry Pi, NAS, or volunteer laptop may be useful tooling, but it must not become a hidden production dependency again.

If your proposed fix violates one of these, stop and understand why the existing system was designed that way before proceeding.

## 5. Things that may look unnecessarily complicated but are deliberate

### Two Website branches

`editor-test-draft` is unpublished state. `migration/github-pages-worker-test` is published state. This substitutes a transparent Git transaction model for a CMS database.

Do not collapse them simply because “one branch is simpler.” Doing so removes the distinction between Save and Publish.

### Fast-forward-only Publish

The Worker publishes only when the draft is a clean descendant of the published branch. If published content changed independently, Publish stops instead of guessing.

A `409` conflict is therefore not merely an error to suppress. It is the system protecting newer work.

**Never repair this by making Publish force-push the published branch.** Reconcile the histories or intentionally discard the draft.

### A separate Worker token and GitHub token

`EDITOR_API_TOKEN` authenticates the staff request to the Worker. `GITHUB_TOKEN` authorizes the Worker to GitHub. They are different trust relationships and should remain separate.

The GitHub credential must never be delivered to the browser.

### Locked header and footer in the editor

The editor intentionally edits content regions rather than the entire DOM. Header/navigation and footer are site chrome. They are visible for context and navigation but not normal staff-editable content.

Do not re-enable whole-document `designMode` merely because it reduces editor code. That reintroduces accidental template corruption.

### Static frontends plus a tiny backend

It may be tempting to combine everything into a full-stack application. Resist that unless there is a concrete requirement. Static hosting is operationally simple, portable, cheap, and difficult to break. The backend exists only for operations that genuinely require trusted credentials.

## 6. What the architecture intentionally does NOT have

There is no production:

- bespoke content database;
- WordPress/plugin stack;
- Node server that must remain running;
- filesystem checkout that is the canonical live site;
- systemd service required for public availability;
- church-local computer required for hosting;
- opaque CMS export format;
- generic repository-write API;
- broad GitHub credential in frontend JavaScript.

If you find historical code or documentation for RyskStick, `WEBSITE_ROOT`, local filesystem backups, Cloudflare Tunnel to a Node server, or Basic Auth on that server, you are looking at retired architecture unless a later handoff explicitly says otherwise.

## 7. “The site is broken”: diagnosis order

Do not start by editing code. Determine which layer is failing.

### A. Does DNS resolve to the intended provider?

Check authoritative nameservers and actual A/AAAA/CNAME answers. The provider dashboard is not proof of authority. During the migration, a Cloudflare zone still existed in the dashboard after GoDaddy nameservers had become authoritative.

If DNS is wrong, application changes will not repair it.

### B. Does HTTPS work before the page loads?

A certificate name error is a TLS/infrastructure problem, not JavaScript mixed content. Fix custom-domain/DNS/certificate provisioning first.

### C. Does the static website load?

If the custom domain returns a GitHub Pages 404, verify the Pages source branch and folder actually contain `index.html`, then verify the custom domain/CNAME and DNS.

### D. Does the editor static UI load?

If `admin.firstlutheranifalls.site` loads, that proves only the editor frontend is being hosted. It does **not** prove the Worker or credentials work.

### E. Does the Worker health endpoint respond?

Check the Editor Worker independently. If health fails, investigate Worker deployment/routing before GitHub permissions.

### F. Can the editor authenticate and list pages?

If health works but editor API calls fail, inspect `EDITOR_API_TOKEN`, `GITHUB_TOKEN`, Worker variables, GitHub permissions, CORS/origin configuration, and branch existence.

### G. Does Save work?

A successful Save should advance only the draft branch. The live website should remain unchanged.

### H. Does Publish work?

If Publish returns a conflict, inspect branch history. Do not force it. If Publish succeeds but the site is stale, inspect the target branch SHA and then GitHub Pages deployment/caching.

This layer-by-layer approach prevents a DNS problem from becoming an application rewrite or a branch conflict from becoming a dangerous force push.

## 8. Recovery mindset

Git is not merely where the source code happens to live. In this design it is also the content journal and recovery mechanism.

Before destructive repair work:

- inspect branch heads;
- inspect recent commits;
- compare draft and published branches;
- create a temporary recovery branch/tag if you are uncertain;
- prefer reversible ref/file operations;
- never delete history merely because it looks untidy.

The published branch should be treated as durable state. The draft branch is intentionally disposable only when somebody explicitly chooses **Discard Draft**.

A local clone is useful for investigation and backup, but it is not the production source of truth.

## 9. Provider migration roadmap

If a current provider must be replaced, migrate one role at a time.

### Replacing GitHub Pages

Choose a static host that can publish the Website files and Editor files from version control. Keep the repositories and Worker behavior unchanged initially. Move DNS only after the replacement static sites are verified.

### Replacing Cloudflare Workers

Port the small editor API to another trusted serverless/edge/runtime environment. Preserve authentication, path restrictions, branch rules, fast-forward-only publishing, and secret isolation. Point the editor frontend at the new API only after it passes Save/Publish/Discard tests.

### Replacing GitHub

Migrate the Git repositories with history to another Git provider. Reimplement the Worker's repository API calls against the replacement provider while preserving the draft/published transaction semantics. Then move static hosting integration.

### Replacing DNS/registrar

Replicate records first, change authoritative nameservers/delegation, verify using independent public resolvers, and only then retire the old DNS zone. A dashboard saying “active” or “paused” is less important than what the public DNS hierarchy delegates.

The principle is **role substitution, not wholesale redesign**.

## 10. Security model in plain language

Assume everything sent to a browser can be read or modified by the person operating that browser. Therefore the browser gets only the minimum credential needed to authenticate to the editor API; it never gets GitHub's write credential.

Assume the Worker is publicly reachable on the Internet. That is normal. Its safety comes from authentication plus server-side restrictions, not from being difficult to discover.

The Worker should know exactly which repository, branches, paths, MIME types, and operations it is willing to modify. Requests outside those boundaries should fail even if the caller is authenticated.

CORS is a browser policy convenience. It is not authentication. A command-line HTTP client ignores CORS entirely.

Keep the GitHub credential fine-grained and limited to the repository/permissions actually required. If credentials are suspected compromised, rotate them; do not redesign the site.

## 11. Operational tests after any meaningful change

Run a small transaction test rather than assuming a successful deployment means the system works end-to-end:

1. Verify the public website loads over HTTPS.
2. Verify the admin site loads over HTTPS.
3. Connect/authenticate the editor.
4. Open a normal content page.
5. Confirm header/navigation and footer are not editable.
6. Confirm preview navigation changes editor pages without leaving the admin application.
7. Make a harmless content edit.
8. Save Draft.
9. Verify the draft branch advanced and the public site did **not** change.
10. Publish.
11. Verify the published branch advanced and Pages deployed the change.
12. Make a second harmless draft.
13. Discard it.
14. Verify draft and published branches are synchronized again.

If those pass, the important transaction path is intact.

## 12. Documentation is part of the system

The largest long-term risk is institutional drift rather than code failure: forgotten account ownership, lost credentials, undocumented DNS, somebody changing Pages source folders, or a well-meaning maintainer “simplifying” away a safety property.

Keep documentation near the code and update it when architecture changes. Document **why**, not only which buttons to click. Provider dashboards will change; the reasons for the trust boundaries and branch model are much more durable.

At minimum, future documentation should identify:

- registrar/domain ownership and renewal responsibility;
- authoritative DNS provider and intended records;
- Git repositories and current production branches;
- static hosting configuration;
- Worker name/runtime and routes;
- required Worker variables and secret names (never secret values);
- credential ownership/rotation procedure;
- draft/publish/discard semantics;
- recovery procedure;
- which old architecture is retired.

## 13. A note to the person who inherited this

You do not need to understand every line of the editor before fixing a broken layer. Start with the system map, identify which role is failing, and test that layer independently.

Also, do not mistake unfamiliarity for bad architecture. Several parts of this system are deliberately conservative because the goal is not maximum framework sophistication; it is for a small organization to retain control of its website for a very long time.

The safest repair is usually the smallest one that restores a role while preserving the invariants above.

If you eventually decide the architecture itself must change, write down which invariant no longer serves the organization and what replaces it. That turns a redesign into an intentional engineering decision rather than accidental erosion.

## 14. The durable core

If all current vendor names in this documentation become obsolete, preserve this:

```text
portable static content
        |
        v
versioned canonical storage
        |
        +---- unpublished state
        |
        `---- published state ----> static public hosting
                    ^
                    |
          explicit safe publish
                    |
          constrained trusted API
                    ^
                    |
             staff editor UI
```

That is the system. Everything else is replaceable machinery around it.

For implementation-specific details, read `docs/ARCHITECTURE-HANDOFF.md` next.
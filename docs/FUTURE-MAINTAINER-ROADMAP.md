# Future Maintainer Roadmap: “I Was Given This System and Told to Fix It”

**Audience:** a technically experienced person who did not design this system.

**Purpose:** prevent a future maintainer from accidentally dismantling the properties that make the First Lutheran website/editor durable while trying to repair an unfamiliar failure.

If you inherited this system because somebody said “the church website is broken; fix it,” start here before redesigning anything.

## A note about terminology

This document is meant to remain useful even if today's product names and technical vocabulary become dated.

For that reason, it tries to describe **what a component does before naming the current technology that implements it**. Where a modern term is useful, it is given as a secondary label rather than treated as the definition.

For example:

- “versioned canonical file store” is the role; Git and GitHub are the current implementation;
- “static public file host” is the role; GitHub Pages is the current implementation;
- “trusted server-side publishing service” is the role; Cloudflare Workers is the current implementation;
- “domain-name records” are the role; DNS is the current and longstanding protocol name;
- “encrypted web connection” is the role; HTTPS/TLS is the current protocol family;
- “content-management product” means software that stores and edits website content in its own managed system; such products are commonly called a CMS today.

If some of these names are unfamiliar when you read this, follow the role descriptions. The roles are more important than the vocabulary.

## 1. First principle: understand the roles, not the vendors

The architecture is deliberately based on old, boring Internet ideas:

```text
ordinary website files
+ versioned canonical storage
+ encrypted network requests
+ a trusted publishing boundary
+ domain-name routing
```

In 2026 those roles are implemented with HTML/CSS/JavaScript, Git/GitHub, HTTPS, Cloudflare Workers, GitHub Pages, and GoDaddy-managed domain-name records. Those products are **implementations**, not the architecture.

The system does not require GitHub, Cloudflare, or GoDaddy to exist forever. It requires equivalents of:

- a place that stores ordinary website files with reliable version history;
- a service that can publish those files directly to the public web;
- a small trusted server-side service capable of performing authenticated repository operations without exposing privileged credentials to a browser;
- a way to map the church's domain name to the correct public services;
- an encrypted connection between users and those services.

If a provider disappears, becomes too expensive, or changes incompatibly, replace that provider's **role**. Do not assume the whole system must be rebuilt.

## 2. Why this system can have an unusually long life

Many small-organization websites become difficult to maintain because their content becomes trapped inside a particular content-management product, private database design, server operating-system image, plugin ecosystem, local computer, or proprietary export format.

A “content-management product” here means software that stores and edits website content inside its own managed application. In 2026 this category is commonly called a **CMS**. The specific term is not important; the risk is that the organization's content stops being understandable and portable without that product.

This system intentionally avoids that dependency.

The public content is ordinary files. The editor edits those files. A version-control system records every published and draft change. The public website is served as static files. The privileged server-side component is intentionally small. There is no production content database that must be kept alive and migrated forever.

That gives the system a useful property: **every major infrastructure component can be replaced independently while the content model remains understandable.**

A future static-file host can serve the site. A future version-control provider can hold the files and their history. A future trusted server-side execution service can implement the constrained publishing operations. Domain-name service can move between providers. None of those migrations inherently requires converting the church's content into a new application.

This does not guarantee a 50-year lifespan. No one can guarantee that. It means the design is intended to survive ordinary generations of hosting products and infrastructure by depending on portable fundamentals rather than a particular product stack.

## 3. Mental model in one diagram

```text
                 PUBLIC / UNPRIVILEGED

Visitor browser
      |
      v
church domain name
      |
      v
Static public file host
      |
      | files come from published Website history
      v
Versioned Website file store


                 STAFF / PRIVILEGED

Staff browser
      |
      v
admin domain name
      |
      v
Static editor interface
      |
      | authenticated encrypted requests
      v
Trusted publishing service
      |
      | privileged repository credential exists HERE ONLY
      v
Versioned Website file store
      |
      +--> unpublished state
      |
      `--> published state
```

In the current implementation:

```text
Static public file host        = GitHub Pages
Versioned Website file store   = GitHub repository using Git history
Trusted publishing service     = Cloudflare Worker
Unpublished state              = editor-test-draft branch
Published state                = migration/github-pages-worker-test branch
```

The trusted publishing service is not hosting the editor and is not hosting the website. Its purpose is to be a **credential and policy boundary** between an untrusted browser and privileged write access to the website's canonical files.

## 4. The most important distinction: replaceable details vs. design invariants

When repairing the system, separate these two categories.

### Replaceable implementation details

These can change if necessary:

- GitHub as the current version-control/file-history provider;
- GitHub Pages as the current static public host;
- Cloudflare Workers as the current trusted server-side execution environment;
- GoDaddy as the current registrar/domain-name service provider;
- domain names;
- the exact staff authentication system;
- the exact branch names, if migration is done carefully;
- the editor's visual implementation.

### Architectural invariants

Preserve these concepts unless you intentionally replace them with something equally safe:

1. **Content remains portable and file-based.** Do not trap the website in an opaque proprietary data store or content-management product without a compelling migration and recovery story.
2. **Published and unpublished states remain separate.** Saving work must not silently change the live website.
3. **Privileged credentials never enter browser code or the repository.** A browser is not a trusted secret store.
4. **The trusted backend's write capability remains narrowly scoped.** Do not turn it into a general-purpose remote control for the entire repository account.
5. **Publishing is explicit and non-destructive.** A publish operation should not overwrite independent newer work.
6. **History remains recoverable.** Version history is part of the backup, audit, and recovery design, not clutter.
7. **Content editing remains separate from site-template editing.** Staff should not accidentally rewrite navigation, footer, scripts, metadata, or global structure while editing a paragraph.
8. **No church-local machine is required for public availability.** A church PC, small server, appliance, or volunteer laptop may be useful tooling, but it must not become a hidden production dependency again.

If your proposed fix violates one of these, stop and understand why the existing system was designed that way before proceeding.

## 5. Things that may look unnecessarily complicated but are deliberate

### Two Website histories for published and unpublished state

The current version-control system represents these as two branches:

```text
editor-test-draft                  = unpublished state
migration/github-pages-worker-test = published state
```

This substitutes a transparent file-history transaction model for a separate content-management database.

Do not collapse them merely because “one branch is simpler.” Doing so removes the distinction between **Save** and **Publish**.

### Publish only advances history when it is safe

The publishing service advances the published state only when the unpublished state is a clean descendant of it. In current Git terminology, this is a **fast-forward-only publish**.

If the published content changed independently, Publish stops instead of guessing which version should win.

The current system reports this safety stop as an HTTP `409 Conflict`. The number and protocol label may eventually become unimportant; the principle is that **divergent histories must stop automatic publication**.

Never repair this by allowing the publishing service to overwrite the published history forcibly. Reconcile the histories or intentionally discard the unpublished work.

### A staff-authentication credential and a repository credential are separate

The current implementation uses:

```text
EDITOR_API_TOKEN = proves a staff request is authorized to use the publishing service
GITHUB_TOKEN     = allows the publishing service itself to modify the Website repository
```

They represent different trust relationships and should remain separate even if the authentication technologies are replaced.

The repository credential must never be delivered to the browser.

### Locked header and footer in the editor

The editor intentionally edits content regions rather than the entire page document. Header/navigation and footer are site-wide structure. They are visible for context and navigation but are not normal staff-editable content.

The current browser editing implementation uses DOM/content-editing features such as `designMode` internally. That implementation detail is not the important part. The durable rule is: **ordinary content editing must not grant accidental control over global site structure.**

### Static frontends plus a tiny trusted backend

It may be tempting to combine everything into one large application. Resist that unless there is a concrete requirement.

Serving ordinary files directly is operationally simple, portable, inexpensive, and difficult to break. The trusted backend exists only for operations that genuinely require privileged credentials or publication policy.

## 6. What the architecture intentionally does NOT have

There is no production requirement for:

- a bespoke content database;
- a large content-management application or plugin stack;
- a continuously running application server for ordinary page delivery;
- a local filesystem checkout that is the canonical live site;
- an operating-system service manager that must keep a web application alive;
- a computer physically located at the church that must remain online for the website to function;
- an opaque proprietary content export format;
- a general-purpose repository-write service;
- a broad repository credential embedded in frontend/browser code.

Historical documentation may mention specific retired technologies such as WordPress, Node, systemd, Cloudflare Tunnel, or a local server called RyskStick. Those names describe old implementation choices. Unless a later handoff explicitly reinstates them, they are not dependencies of the current system.

## 7. “The site is broken”: diagnosis order

Do not start by editing application code. Determine which **role** is failing.

### A. Does the domain name resolve to the intended service?

Check the publicly authoritative domain-name records and actual address/alias answers. In current terminology this means checking DNS nameservers and A/AAAA/CNAME records.

A provider dashboard is not proof that provider is authoritative. During the migration, Cloudflare still displayed a domain zone after GoDaddy-hosted nameservers had become authoritative.

If domain-name routing is wrong, application changes will not repair it.

### B. Does the encrypted connection succeed before the page loads?

A certificate-name error occurs before the browser can run the website application. It is an encrypted-connection/routing problem, not a page-content problem.

In current web terminology: fix HTTPS/TLS certificate, custom-domain, and DNS provisioning before investigating JavaScript “mixed content.”

### C. Does the static public website load?

If the public host returns a not-found page, verify that its configured publication source actually contains the site's entry file (`index.html` in the current system), then verify the custom domain and domain-name routing.

### D. Does the static editor interface load?

If `admin.firstlutheranifalls.site` loads, that proves only the editor's public files are being hosted. It does **not** prove the trusted publishing service or credentials work.

### E. Does the trusted publishing service respond independently?

The current implementation exposes a health-check URL on the Cloudflare Worker. Test the trusted service separately from the editor interface.

If its health check fails, investigate service deployment/routing before repository permissions.

### F. Can the editor authenticate and read the page list?

If the trusted service works but privileged editor operations fail, inspect:

- staff authentication configuration;
- repository credential configuration;
- target repository and published/unpublished state identifiers;
- repository permissions;
- browser-origin restrictions, if present;
- existence of the expected published and unpublished histories.

### G. Does Save work?

A successful Save should advance only the unpublished state. The public website should remain unchanged.

### H. Does Publish work?

If Publish reports divergent histories, treat that as a safety stop. Do not override it automatically.

If Publish succeeds but the public website remains stale, inspect the published-state revision first, then the static host's deployment state and caching.

This layer-by-layer approach prevents a domain-name problem from becoming an application rewrite or a history conflict from becoming a destructive overwrite.

## 8. Recovery mindset

The version-control system is not merely where source code happens to live. In this design it is also the **content journal and recovery mechanism**.

Before destructive repair work:

- inspect current published and unpublished revision identifiers;
- inspect recent history;
- compare unpublished and published histories;
- create a temporary recovery copy/reference if uncertain;
- prefer reversible operations;
- never delete history merely because it looks untidy.

In today's Git implementation, that may mean inspecting branch heads, commits, comparisons, and creating a temporary branch or tag.

The published state should be treated as durable state. The unpublished state is intentionally disposable only when somebody explicitly chooses **Discard Draft**.

A local copy of the repository is useful for investigation and backup, but it is not the production source of truth.

## 9. Provider migration roadmap

If a current provider must be replaced, migrate one role at a time.

### Replacing the static public host

Choose a service that can publish the Website files and Editor files from the canonical versioned store. Keep the versioned store and trusted publishing behavior unchanged initially. Move domain-name routing only after replacement static sites are verified.

### Replacing the trusted publishing runtime

Port the small privileged publishing service to another trusted server-side execution environment. Preserve authentication, path restrictions, published/unpublished state rules, non-destructive publication, and secret isolation. Point the editor interface at the replacement only after Save/Publish/Discard tests pass.

### Replacing the version-control/file-history provider

Migrate the repositories with complete history to another system capable of versioned file storage. Reimplement the publishing service's repository operations against the replacement while preserving the published/unpublished transaction semantics. Then migrate any static-host integration.

### Replacing the registrar or domain-name service

Replicate records first, change authoritative delegation, verify using independent public resolvers, and only then retire the old provider's zone.

A dashboard saying “active” or “paused” matters less than what the public domain-name hierarchy actually delegates.

The principle is **role substitution, not wholesale redesign**.

## 10. Security model in plain language

Assume everything sent to a browser can be read or modified by the person operating that browser. Therefore the browser receives only what it needs to prove it may use the editor; it never receives the credential that can directly modify the canonical Website store.

Assume the trusted publishing service is publicly reachable on the Internet. That is normal. Its safety comes from authentication plus server-side restrictions, not from being difficult to discover.

The publishing service should know exactly which repository/store, published state, unpublished state, file paths, file types, and operations it is willing to modify. Requests outside those boundaries should fail even if the caller is authenticated.

Modern browsers also enforce a policy commonly called **CORS** that controls which web pages may read responses from other origins. That is useful browser behavior, but it is not authentication. A non-browser network client is not constrained by it.

Keep the repository credential narrowly permissioned. If a credential is suspected compromised, rotate it and audit access; do not redesign the website merely because a credential changed.

## 11. Operational tests after any meaningful change

Run a small transaction test rather than assuming a successful deployment means the system works end to end:

1. Verify the public website loads over an encrypted connection.
2. Verify the admin/editor site loads over an encrypted connection.
3. Authenticate the editor.
4. Open a normal content page.
5. Confirm header/navigation and footer are not editable.
6. Confirm preview navigation changes editor pages without leaving the admin interface.
7. Make a harmless content edit.
8. Save Draft.
9. Verify unpublished history advanced and the public site did **not** change.
10. Publish.
11. Verify published history advanced and the static public host deployed the change.
12. Make a second harmless draft.
13. Discard it.
14. Verify unpublished and published states are synchronized again.

If those pass, the important transaction path is intact.

## 12. Documentation is part of the system

The largest long-term risk is institutional drift rather than code failure: forgotten account ownership, lost credentials, undocumented domain-name control, somebody changing publication-source folders, or a well-meaning maintainer “simplifying” away a safety property.

Keep documentation near the implementation and update it when architecture changes. Document **why**, not only which buttons to click. Product interfaces will change; the reasons for the trust boundaries and publication model are much more durable.

At minimum, future documentation should identify:

- who legally/administratively controls domain registration and renewal;
- which service is authoritative for domain-name records and what the intended records are;
- where the canonical versioned website and editor files are stored;
- which revisions/states are published and unpublished;
- how public static hosting is configured;
- where the trusted publishing service runs;
- what configuration and secret **names** it requires (never secret values);
- who can rotate credentials and how;
- Save/Publish/Discard semantics;
- recovery procedures;
- which older architectures are retired.

## 13. A note to the person who inherited this

You do not need to understand every line of the editor before fixing a broken layer. Start with the system map, identify which role is failing, and test that role independently.

Do not mistake unfamiliarity for bad architecture. Several parts of this system are deliberately conservative because the goal is not maximum framework sophistication. The goal is for a small organization to retain control of its website for a very long time.

The safest repair is usually the smallest one that restores a role while preserving the invariants above.

If you eventually decide the architecture itself must change, write down which invariant no longer serves the organization and what replaces it. That turns a redesign into an intentional engineering decision rather than accidental erosion.

## 14. The durable core

If every current company name, product name, protocol acronym, and framework in this documentation becomes obsolete, preserve this model:

```text
portable website content
        |
        v
versioned canonical storage
        |
        +---- unpublished state
        |
        `---- published state ----> public static delivery
                    ^
                    |
          explicit safe publish
                    |
          constrained trusted service
                    ^
                    |
             staff editing interface
```

That is the system. Everything else is replaceable machinery around it.

For the current 2026 implementation details, read `docs/ARCHITECTURE-HANDOFF.md` next.
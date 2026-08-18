# AGENTS.md

**Project:** First Lutheran Church Website
**Purpose:** Build and preserve a fully church-owned, self-hostable, beautifully designed website that remains editable, recoverable, and sustainable for decades without reliance on proprietary vendors.

---

# 1. Absolute Goal

This repository must produce a website that is:

- **Owned entirely by the church**
- **Editable by non-technical staff**
- **Free from required paid SaaS**
- **Recoverable from this repository alone**
- **Stable and maintainable for 10+ years**
- **Visually warm, welcoming, and intentional**

This is **permanent community infrastructure**.

---

# 2. Non-Negotiable Principles

## Ownership

- Domain, files, and hosting remain under **church control**.
- No dependency may exist that could **lock the church out**.

## Cost

- Operation must be possible with **zero required subscriptions**.

## Longevity

- Must run on **ordinary Windows consumer hardware**.
- Must be restorable by a **future volunteer with minimal context**.
- All knowledge must exist inside:
  - `AGENTS.md`
  - `README.md`
  - the repository itself
    **Never only in memory.**

## Safety

- Every change must be **reversible via git**.
- Core layout (navigation, header, footer) must always be **recoverable**.

---

# 3. Design Is Equal to Engineering

The finished site must feel:

- **Warm**
- **Human**
- **Community-centered**
- **Clear and calm**

### Visual language

- Earth tones: **browns, reds, tans, whites**
- Clean typography
- Strong mobile usability
- No generic template appearance
- No corporate SaaS aesthetic

**Good design is required for success.
Technical correctness alone is failure.**

---

# 4. Repository Reality

Current starting contents:

```
firstlutheranifalls/
├─ AGENTS.md
├─ previous_version/   ← historical scrape (read-only archive)
```

### Historical archive rule

`previous_version/`:

- Must **never be modified or deleted**
- Exists for:
  - content recovery
  - verification
  - continuity of community history

---

# 5. Required Final Architecture

The completed system will contain:

```
server/   → local web server + save API
public/   → canonical live website files
admin/    → browser WYSIWYG editor
docs/     → human documentation
```

Edits made in the editor must:

- Modify **real site files**
- Be **immediately live**
- Be **captured in git history**

---

# 6. Environment Contract

The finished system runs on:

- **Windows 10**
- **Node.js 20**
- **npm**
- **PowerShell**
- **Local port 8787**
- **HTTP Basic authentication**

No additional mandatory runtime is allowed.

---

# 7. Agent Development Law

Agents working in this repository must follow strict discipline.

## Documentation

- Record **every structural decision**.
- Explain reasoning in **plain language**.
- Make **no hidden assumptions**.

## Commits

- Commit **frequently**.
- Messages must explain:
  - what changed
  - why
  - risk or impact

## Testing Before Commit

Before any commit:

- Server starts
- Editor loads
- Saving a page preserves valid content

If uncertain → **do not commit**.

## Branch Safety

Breaking or structural work must:

1. Occur on a **separate branch**
2. Be **validated**
3. Merge only when stable

`main` must remain **recoverable at all times**.

---

# 8. Deployment End State

The website must be deployable using:

- A **local mini-PC or small server**
- **Cloudflare Tunnel** or equivalent for public access
- **Static hosting fallback** if needed

Deployment must preserve:

- Ownership
- zero-subscription operation
- long-term recoverability

---

# 9. Definition of Success

The project is successful only when:

- The church **fully controls** its website.
- A future volunteer can **restore everything from this repo alone**.
- The site is:
  - **beautiful**
  - **welcoming**
  - **easy to edit**
  - **stable for decades**

If any of these are untrue,
**the project is not complete.**

---

**End of AGENTS.md**

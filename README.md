Below is a **drop-in “START HERE” instruction set** you can paste into `README.md` (or `docs/START_HERE.md`). It assumes the repo currently contains only `AGENTS.md` and `previous_version/`, and it establishes **git + Python venv (optional tooling) + Node baseline** in a deterministic way on **Windows 10 / PowerShell**.

> If you want this as `README.md`, just tell me and I’ll format it as the full README with sections.

````md
# START HERE (Windows 10 / PowerShell)

This project is being built from a legacy scrape (`previous_version/`) into a modern, editable, church-owned site.

## 0) Ground rules before you touch anything

1. Read `AGENTS.md` fully.
2. `previous_version/` is **read-only**. Do not modify its contents.
3. Work in small steps:
   - write notes
   - test
   - commit
4. For breaking changes: use a branch.

---

## 1) Install prerequisites (one-time on your machine)

- Git (2.13+)
- Node.js 20.x (recommend installing via nvm-windows if you already use it)
- Python 3.11 (only for optional tooling; safe to install now)

Verify:

```powershell
git --version
node -v
npm -v
python --version
```
````

---

## 2) Create / enter the repo

If you already have the folder, `cd` into it:

```powershell
cd C:\Users\Ryan\internetProjects\firstlutheranifalls-v2
```

If you are creating it from scratch:

```powershell
mkdir firstlutheranifalls-v2
cd firstlutheranifalls-v2
```

Confirm you see:

- `AGENTS.md`
- `previous_version\`

---

## 3) Initialize git (required)

If this is not already a git repo:

```powershell
git init
git branch -M main
```

Create a `.gitignore`:

```powershell
@"
# Node
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Env
.env
.env.*

# Python
.venv/
__pycache__/
*.pyc

# OS / Editor
.DS_Store
Thumbs.db
.vscode/
"@ | Out-File -Encoding utf8 .gitignore
```

Make the first commit:

```powershell
git add .
git commit -m "Initialize repo with AGENTS.md and previous_version archive"
```

---

## 4) Create a Python venv (optional but recommended)

Even if we don’t use Python yet, this prevents future tooling drift.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
```

Freeze file (empty is fine for now):

```powershell
if (!(Test-Path requirements.txt)) { "" | Out-File -Encoding utf8 requirements.txt }
git add .venv requirements.txt
git commit -m "Add Python venv scaffold for future tooling"
```

> If you do NOT want to commit `.venv/` (common), then keep `.venv/` ignored (it is in .gitignore already) and only commit `requirements.txt`.

Recommended approach:

- DO NOT commit `.venv/`
- DO commit `requirements.txt`

If you accidentally staged `.venv/`:

```powershell
git reset .venv
```

---

## 5) Node project scaffold (required for editor/server)

Create a minimal `package.json`:

```powershell
npm init -y
```

Set project name + type module (keeps ESM consistent):

```powershell
node -e "let p=require('./package.json'); p.name='firstlutheranifalls'; p.private=true; p.type='module'; p.scripts={...p.scripts, dev:'node server/dev.mjs'}; require('fs').writeFileSync('package.json', JSON.stringify(p,null,2));"
```

Commit:

```powershell
git add package.json
git commit -m "Add Node project scaffold"
```

Add this **right after “Node project scaffold”** (or as its own section). It sets an explicit goal: **formatting + linting + basic smoke tests are mandatory**, and gives you a minimal, low-friction setup that works on Windows.

````md
---

## 5b) Linters + Formatters + Tests (required)

This repo must always have:

- A formatter (so diffs stay readable)
- A linter (so errors get caught early)
- A smoke-test runner (so agents can’t commit broken behavior)

### JavaScript / Node tooling

We use:

- **Prettier** for formatting
- **ESLint** for linting
- **Node’s built-in test runner** (`node --test`) for smoke tests

Install dev dependencies:

```powershell
npm install -D prettier eslint @eslint/js globals
```
````

Create `.prettierrc.json`:

```powershell
@"
{
  "semi": true,
  "singleQuote": false,
  "printWidth": 100
}
"@ | Out-File -Encoding utf8 .prettierrc.json
```

Create `.eslint.config.js` (ESLint v9 “flat config”):

```powershell
@"
import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser
      }
    },
    rules: {
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
      "no-undef": "error"
    }
  }
];
"@ | Out-File -Encoding utf8 .eslint.config.js
```

Add scripts to `package.json`:

```powershell
node -e "let p=require('./package.json'); p.scripts={...p.scripts, format:'prettier . --write', lint:'eslint .', test:'node --test'}; require('fs').writeFileSync('package.json', JSON.stringify(p,null,2));"
```

### Smoke tests (minimum)

Create `tests/smoke.test.mjs`:

```powershell
mkdir tests
@"
import test from "node:test";
import assert from "node:assert/strict";

test("repo has required folders", async () => {
  const fs = await import("node:fs/promises");
  const required = ["public", "admin", "server", "docs", "previous_version"];
  for (const d of required) {
    await fs.access(d);
  }
  assert.ok(true);
});
"@ | Out-File -Encoding utf8 tests\smoke.test.mjs
```

### Required pre-commit routine

Before every commit, run:

```powershell
npm run format
npm run lint
npm test
```

Commit:

```powershell
git add .
git commit -m "Add formatter, linter, and smoke tests"
```

---

```

### Why this is the right level of “tester”
You don’t need Playwright/Cypress yet. Early-stage, you mainly need:
- consistent formatting so agents don’t create unreadable diffs
- linting so obvious mistakes fail fast
- a minimal test harness so there is *always* a `npm test` gate

Later, when `/admin` and save APIs exist, the smoke test can expand to:
- start server on a random port
- fetch `/` and `/admin` (expects 401)
- fetch a sample page load endpoint
- verify save writes a file


```

---

## 6) Create the working folders (starting structure)

```powershell
mkdir server, public, admin, docs, scripts
```

Add placeholder files so git tracks them:

```powershell
"_" | Out-File -Encoding utf8 public\.keep
"_" | Out-File -Encoding utf8 admin\.keep
"_" | Out-File -Encoding utf8 server\.keep
"_" | Out-File -Encoding utf8 docs\.keep
"_" | Out-File -Encoding utf8 scripts\.keep
```

Commit:

```powershell
git add public admin server docs scripts
git commit -m "Add initial project folder structure"
```

---

## 7) Work mode rules (do this every time)

### Start a feature branch for any risky work

```powershell
git checkout -b feature/<short-name>
```

### Before every commit, run a minimal checklist

- Does the project still run?
- Did I write notes?
- Did I verify behavior in browser (if UI touched)?
- Is rollback possible?

### Commit frequently

Good commits are small and explain intent.

---

## 8) Next milestone (what to do after setup)

1. Extract the legacy content from `previous_version/` into a clean, editable `public/` baseline.
2. Establish the admin editor loading a real page from `/public`.
3. Implement save → writes HTML back to `/public`.
4. Add automated “smoke tests” script for agentic testing before commit.

Stop after each milestone and document what changed in `docs/`.

---

```

If you want, I can also generate a **single PowerShell “bootstrap.ps1”** that performs steps 3–6 automatically (git init, ignore, folders, package.json scaffold, initial commits) in a repeatable way.
::contentReference[oaicite:0]{index=0}
```

const DEFAULT_CONFIG = Object.freeze({
  owner: "Ryan-CS",
  repo: "FirstLutheranIfalls-Website",
  targetBranch: "migration/github-pages-worker-test",
  draftBranch: "editor-test-draft",
});

const ALLOWED_ORIGINS = new Set([
  "https://admin.firstlutheranifalls.site",
  "https://ryan-cs.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function config(env) {
  return {
    owner: env.GITHUB_OWNER || DEFAULT_CONFIG.owner,
    repo: env.GITHUB_REPO || DEFAULT_CONFIG.repo,
    targetBranch: env.TARGET_BRANCH || DEFAULT_CONFIG.targetBranch,
    draftBranch: env.DRAFT_BRANCH || DEFAULT_CONFIG.draftBranch,
  };
}

function corsHeaders(request, extra = {}) {
  const origin = request.headers.get("Origin");
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Authorization, Content-Type",
    "Cache-Control": "no-store",
    Vary: "Origin",
    ...extra,
  };

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(request, body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: corsHeaders(request, headers),
  });
}

function text(request, body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: corsHeaders(request, {
      "Content-Type": "text/plain; charset=utf-8",
      ...headers,
    }),
  });
}

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    mismatch |= (left.charCodeAt(i % Math.max(left.length, 1)) || 0) ^
      (right.charCodeAt(i % Math.max(right.length, 1)) || 0);
  }
  return mismatch === 0;
}

function isAuthorized(request, env) {
  const expected = env.EDITOR_API_TOKEN?.trim();
  if (!expected) return false;
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return Boolean(match && constantTimeEqual(match[1].trim(), expected));
}

function utf8ToBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToUtf8(value) {
  const binary = atob((value || "").replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeRepoPath(value) {
  return value.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function validatePagePath(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.html$/.test(trimmed)) return null;
  if (trimmed.includes("..")) return null;
  return trimmed;
}

function sanitizeFilename(value) {
  return String(value || "file").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
}

function parseDataUrl(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const content = match[2].replace(/\s/g, "");
  const approximateBytes = Math.floor((content.length * 3) / 4);
  return { mime, content, approximateBytes };
}

class GitHubError extends Error {
  constructor(message, status = 502, details = null) {
    super(message);
    this.name = "GitHubError";
    this.status = status;
    this.details = details;
  }
}

async function githubRequest(env, apiPath, options = {}) {
  const token = env.GITHUB_TOKEN?.trim();
  if (!token) throw new GitHubError("GitHub service is not configured", 503);

  const cfg = config(env);
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}${apiPath}`,
    {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "First-Lutheran-Editor-Worker",
        ...(options.headers || {}),
      },
    },
  );

  let payload = null;
  const contentType = response.headers.get("Content-Type") || "";
  if (response.status !== 204) {
    if (contentType.includes("application/json")) {
      payload = await response.json().catch(() => null);
    } else {
      payload = await response.text().catch(() => null);
    }
  }

  if (!response.ok) {
    const message = payload?.message || `GitHub API returned ${response.status}`;
    throw new GitHubError(message, response.status, payload);
  }

  return payload;
}

async function getRefSha(env, branch) {
  const result = await githubRequest(env, `/git/ref/heads/${encodeURIComponent(branch)}`);
  return result?.object?.sha || null;
}

async function createDraftBranch(env, targetSha) {
  const cfg = config(env);
  await githubRequest(env, "/git/refs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ref: `refs/heads/${cfg.draftBranch}`,
      sha: targetSha,
    }),
  });
  return targetSha;
}

async function ensureDraftBranch(env) {
  const cfg = config(env);
  try {
    return await getRefSha(env, cfg.draftBranch);
  } catch (error) {
    if (!(error instanceof GitHubError) || error.status !== 404) throw error;
    const targetSha = await getRefSha(env, cfg.targetBranch);
    return createDraftBranch(env, targetSha);
  }
}

async function getContent(env, path, branch) {
  return githubRequest(
    env,
    `/contents/${encodeRepoPath(path)}?ref=${encodeURIComponent(branch)}`,
  );
}

async function putContent(env, { path, branch, content, message, sha }) {
  const body = {
    message,
    content,
    branch,
  };
  if (sha) body.sha = sha;

  return githubRequest(env, `/contents/${encodeRepoPath(path)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function listPages(env) {
  const cfg = config(env);
  await ensureDraftBranch(env);
  const items = await githubRequest(env, `/contents?ref=${encodeURIComponent(cfg.draftBranch)}`);
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.type === "file" && /^[A-Za-z0-9][A-Za-z0-9._-]*\.html$/.test(item.name || ""))
    .map((item) => item.name)
    .sort();
}

async function readPage(env, path) {
  const cfg = config(env);
  await ensureDraftBranch(env);
  const item = await getContent(env, path, cfg.draftBranch);
  if (!item?.content || item.encoding !== "base64") {
    throw new GitHubError("Page content is unavailable", 502);
  }
  return base64ToUtf8(item.content);
}

async function savePage(env, path, html) {
  const cfg = config(env);
  await ensureDraftBranch(env);

  let existing = null;
  try {
    existing = await getContent(env, path, cfg.draftBranch);
  } catch (error) {
    if (!(error instanceof GitHubError) || error.status !== 404) throw error;
  }

  const result = await putContent(env, {
    path,
    branch: cfg.draftBranch,
    content: utf8ToBase64(html),
    message: `Editor draft: update ${path}`,
    sha: existing?.sha,
  });

  return {
    ok: true,
    path,
    commit: result?.commit?.sha || null,
    branch: cfg.draftBranch,
  };
}

async function saveUpload(env, name, dataUrl) {
  const allowedTypes = new Map([
    ["image/png", ".png"],
    ["image/jpeg", ".jpg"],
    ["image/gif", ".gif"],
    ["image/webp", ".webp"],
    ["image/svg+xml", ".svg"],
  ]);

  const parsed = parseDataUrl(dataUrl);
  if (!parsed || !allowedTypes.has(parsed.mime)) {
    throw new GitHubError("Unsupported image type", 400);
  }
  if (parsed.approximateBytes > MAX_UPLOAD_BYTES) {
    throw new GitHubError("Image is too large", 413);
  }

  const cfg = config(env);
  await ensureDraftBranch(env);
  const requiredExtension = allowedTypes.get(parsed.mime);
  let cleanName = sanitizeFilename(name);
  if (!cleanName.toLowerCase().endsWith(requiredExtension)) {
    cleanName += requiredExtension;
  }
  const stampedName = `${Date.now()}-${cleanName}`;
  const path = `uploads/editor/${stampedName}`;

  const result = await putContent(env, {
    path,
    branch: cfg.draftBranch,
    content: parsed.content,
    message: `Editor draft: upload ${stampedName}`,
  });

  return {
    ok: true,
    path: `/${path}`,
    commit: result?.commit?.sha || null,
    branch: cfg.draftBranch,
  };
}

async function branchStatus(env) {
  const cfg = config(env);
  const targetSha = await getRefSha(env, cfg.targetBranch);
  let draftSha = null;

  try {
    draftSha = await getRefSha(env, cfg.draftBranch);
  } catch (error) {
    if (!(error instanceof GitHubError) || error.status !== 404) throw error;
  }

  if (!draftSha) {
    return {
      targetBranch: cfg.targetBranch,
      targetSha,
      draftBranch: cfg.draftBranch,
      draftExists: false,
      status: "not-created",
      aheadBy: 0,
      behindBy: 0,
    };
  }

  const comparison = await githubRequest(env, `/compare/${targetSha}...${draftSha}`);
  return {
    targetBranch: cfg.targetBranch,
    targetSha,
    draftBranch: cfg.draftBranch,
    draftSha,
    draftExists: true,
    status: comparison?.status || "unknown",
    aheadBy: comparison?.ahead_by ?? null,
    behindBy: comparison?.behind_by ?? null,
    files: (comparison?.files || []).map((file) => file.filename),
  };
}

async function publishDraft(env) {
  const cfg = config(env);
  await ensureDraftBranch(env);
  const status = await branchStatus(env);

  if (status.status === "identical") {
    return { ok: true, published: false, message: "No draft changes to publish", ...status };
  }
  if (status.status !== "ahead" || status.behindBy !== 0) {
    throw new GitHubError(
      "Draft branch is not a clean fast-forward of the test website branch. Discard or reconcile the draft before publishing.",
      409,
      status,
    );
  }

  await githubRequest(env, `/git/refs/heads/${encodeURIComponent(cfg.targetBranch)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sha: status.draftSha, force: false }),
  });

  return {
    ok: true,
    published: true,
    commit: status.draftSha,
    branch: cfg.targetBranch,
    files: status.files || [],
  };
}

async function discardDraft(env) {
  const cfg = config(env);
  const targetSha = await getRefSha(env, cfg.targetBranch);
  try {
    await githubRequest(env, `/git/refs/heads/${encodeURIComponent(cfg.draftBranch)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha: targetSha, force: true }),
    });
  } catch (error) {
    if (!(error instanceof GitHubError) || error.status !== 404) throw error;
    await createDraftBranch(env, targetSha);
  }

  return {
    ok: true,
    draftBranch: cfg.draftBranch,
    resetTo: targetSha,
  };
}

async function readJsonBody(request) {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_UPLOAD_BYTES * 2) {
    throw new GitHubError("Payload is too large", 413);
  }
  try {
    return await request.json();
  } catch {
    throw new GitHubError("Invalid JSON", 400);
  }
}

function githubErrorResponse(request, error) {
  const status = error instanceof GitHubError && error.status >= 400 && error.status < 600
    ? error.status
    : 500;
  const safeMessage = status >= 500 && !(error instanceof GitHubError)
    ? "Unexpected server error"
    : error.message || "Request failed";
  const body = { ok: false, error: safeMessage };
  if (status === 409 && error.details) body.details = error.details;
  return json(request, body, status);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      const cfg = config(env);
      return json(request, {
        ok: true,
        service: "first-lutheran-editor-api",
        environment: "firstlutheranifalls.site test",
        githubConfigured: Boolean(env.GITHUB_TOKEN),
        editorAuthConfigured: Boolean(env.EDITOR_API_TOKEN),
        target: `${cfg.owner}/${cfg.repo}:${cfg.targetBranch}`,
        timestamp: new Date().toISOString(),
      });
    }

    if (!url.pathname.startsWith("/api/editor/")) {
      return json(request, { ok: false, error: "Not found" }, 404);
    }

    if (!isAuthorized(request, env)) {
      return json(request, { ok: false, error: "Authentication required" }, 401, {
        "WWW-Authenticate": "Bearer",
      });
    }

    try {
      if (request.method === "GET" && url.pathname === "/api/editor/pages") {
        return json(request, { pages: await listPages(env) });
      }

      if (request.method === "GET" && url.pathname === "/api/editor/page") {
        const path = validatePagePath(url.searchParams.get("path"));
        if (!path) return json(request, { ok: false, error: "Invalid page path" }, 400);
        return text(request, await readPage(env, path), 200, {
          "Content-Type": "text/html; charset=utf-8",
        });
      }

      if (request.method === "GET" && url.pathname === "/api/editor/status") {
        return json(request, { ok: true, ...(await branchStatus(env)) });
      }

      if (request.method === "POST" && url.pathname === "/api/editor/save") {
        const data = await readJsonBody(request);
        const path = validatePagePath(data?.path);
        const html = data?.html;
        if (!path || typeof html !== "string") {
          return json(request, { ok: false, error: "Missing or invalid path/html" }, 400);
        }
        if (new TextEncoder().encode(html).length > MAX_HTML_BYTES) {
          return json(request, { ok: false, error: "Page is too large" }, 413);
        }
        return json(request, await savePage(env, path, html));
      }

      if (request.method === "POST" && url.pathname === "/api/editor/upload") {
        const data = await readJsonBody(request);
        if (typeof data?.name !== "string" || typeof data?.dataUrl !== "string") {
          return json(request, { ok: false, error: "Missing name or dataUrl" }, 400);
        }
        return json(request, await saveUpload(env, data.name, data.dataUrl));
      }

      if (request.method === "POST" && url.pathname === "/api/editor/publish") {
        return json(request, await publishDraft(env));
      }

      if (request.method === "POST" && url.pathname === "/api/editor/discard") {
        const data = await readJsonBody(request);
        if (data?.confirm !== true) {
          return json(request, { ok: false, error: "Explicit confirmation is required" }, 400);
        }
        return json(request, await discardDraft(env));
      }

      return json(request, { ok: false, error: "Not found" }, 404);
    } catch (error) {
      console.error("Editor API error", error?.message || error);
      return githubErrorResponse(request, error);
    }
  },
};

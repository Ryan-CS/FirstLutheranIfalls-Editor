import http from "node:http";
import { createPublishCommit } from "./publish.mjs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const websiteRoot = process.env.WEBSITE_ROOT
  ? path.resolve(process.env.WEBSITE_ROOT)
  : path.join(projectRoot, "public");
const publicDir = websiteRoot;
const adminDir = path.join(projectRoot, "admin");
const backupDir = path.join(websiteRoot, "_backups");
const uploadDir = path.join(websiteRoot, "uploads", "editor");
const logsDir = path.join(projectRoot, "logs");
const auditFile = path.join(logsDir, "audit.log");

const PORT = Number(process.env.PORT || 8787);
const BASIC_USER = process.env.BASIC_USER || "admin";
const BASIC_PASS = process.env.BASIC_PASS || "admin";
const BASIC_REALM = process.env.BASIC_REALM || "First Lutheran Admin";
const PROTECT_ALL = process.env.BASIC_PROTECT_ALL === "1";
const BACKUP_RETENTION = Number(process.env.BACKUP_RETENTION || 20);
const WEBSITE_GIT_BRANCH = process.env.WEBSITE_GIT_BRANCH || "main";

const MAX_BODY_BYTES = 5 * 1024 * 1024;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2"
};

function send(res, status, body, headers = {}) {
  const payload = body ?? "";
  const baseHeaders = {
    "Content-Length": Buffer.byteLength(payload),
    ...headers
  };
  res.writeHead(status, baseHeaders);
  res.end(payload);
}

function sendJson(res, status, data) {
  send(res, status, JSON.stringify(data, null, 2), {
    "Content-Type": "application/json; charset=utf-8"
  });
}

function isProtectedPath(pathname) {
  if (PROTECT_ALL) return true;
  if (pathname === "/__api/youtube-latest") return false;
  if (pathname === "/__api/facebook-posts") return false;
  return pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/__api/");
}

function parseBasicAuth(headerValue) {
  if (!headerValue || !headerValue.startsWith("Basic ")) return null;
  const encoded = headerValue.slice("Basic ".length).trim();
  if (!encoded) return null;
  let decoded = "";
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return null;
  }
  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) return null;
  return {
    user: decoded.slice(0, separatorIndex),
    pass: decoded.slice(separatorIndex + 1)
  };
}

function requireAuth(req, res) {
  const auth = parseBasicAuth(req.headers.authorization);
  if (!auth || auth.user !== BASIC_USER || auth.pass !== BASIC_PASS) {
    send(res, 401, "Authentication required", {
      "WWW-Authenticate": `Basic realm="${BASIC_REALM}"`
    });
    return false;
  }
  req.authUser = auth.user;
  return true;
}

function safeResolve(baseDir, targetPath) {
  const base = path.resolve(baseDir);
  const cleaned = targetPath.replace(/^\/+/, "");
  const resolved = path.resolve(base, cleaned);
  const relative = path.relative(base, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return resolved;
}

async function logAudit(action, detail, user = "unknown") {
  try {
    await fs.mkdir(logsDir, { recursive: true });
    const stamp = new Date().toISOString();
    const line = `${stamp} | ${action} | ${user} | ${detail}\n`;
    await fs.appendFile(auditFile, line, "utf8");
  } catch {
    // Logging must never block core operations.
  }
}

function sanitizeFilename(filename) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function decodeDataUrl(dataUrl) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const buffer = Buffer.from(match[2], "base64");
  return { mime: match[1], buffer };
}

async function writeFileAtomic(targetPath, content) {
  const tempPath = `${targetPath}.tmp`;
  await fs.writeFile(tempPath, content, "utf8");
  try {
    await fs.rename(tempPath, targetPath);
  } catch {
    await fs.rm(targetPath, { force: true });
    await fs.rename(tempPath, targetPath);
  }
}

async function enforceBackupRetention(baseName) {
  if (!Number.isFinite(BACKUP_RETENTION) || BACKUP_RETENTION <= 0) return;
  const entries = await fs.readdir(backupDir);
  const prefix = `${baseName}.`;
  const matches = entries.filter((entry) => entry.startsWith(prefix) && entry.endsWith(".html"));
  if (matches.length <= BACKUP_RETENTION) return;
  const sorted = matches.sort().reverse();
  const toDelete = sorted.slice(BACKUP_RETENTION);
  await Promise.all(toDelete.map((entry) => fs.rm(path.join(backupDir, entry), { force: true })));
}

async function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function listPages() {
  const entries = await fs.readdir(publicDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => entry.name)
    .sort();
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/__api/pages") {
    try {
      const pages = await listPages();
      return sendJson(res, 200, { pages });
    } catch {
      return sendJson(res, 500, { error: "Failed to list pages" });
    }
  }

  if (req.method === "GET" && url.pathname === "/__api/page") {
    const target = url.searchParams.get("path") || "";
    const resolved = safeResolve(publicDir, target);
    if (!resolved || !target) {
      return sendJson(res, 400, { error: "Invalid path" });
    }
    if (!resolved.endsWith(".html")) {
      return sendJson(res, 400, { error: "Only .html files are supported" });
    }
    try {
      const html = await fs.readFile(resolved, "utf8");
      return send(res, 200, html, { "Content-Type": "text/html; charset=utf-8" });
    } catch {
      return sendJson(res, 404, { error: "Page not found" });
    }
  }

  if (req.method === "POST" && url.pathname === "/__api/save") {
    let payload = "";
    try {
      payload = await readBody(req, MAX_BODY_BYTES);
    } catch {
      return sendJson(res, 413, { error: "Payload too large" });
    }

    let data;
    try {
      data = JSON.parse(payload);
    } catch {
      return sendJson(res, 400, { error: "Invalid JSON" });
    }

    const { path: target, html } = data || {};
    if (!target || typeof target !== "string" || typeof html !== "string") {
      return sendJson(res, 400, { error: "Missing path or html" });
    }

    const resolved = safeResolve(publicDir, target);
    if (!resolved || !resolved.endsWith(".html")) {
      return sendJson(res, 400, { error: "Invalid path" });
    }

    try {
      await fs.mkdir(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const baseName = path.basename(target, ".html");
      const backupName = `${baseName}.${stamp}.html`;
      const backupPath = path.join(backupDir, backupName);
      try {
        const existing = await fs.readFile(resolved, "utf8");
        await fs.writeFile(backupPath, existing, "utf8");
      } catch {
        // New file, no backup needed.
      }
      await writeFileAtomic(resolved, html);
      await enforceBackupRetention(baseName);
      await logAudit("save", `${target} (${html.length} chars)`, req.authUser);
      return sendJson(res, 200, { ok: true });
    } catch {
      return sendJson(res, 500, { error: "Failed to save file" });
    }
  }

  if (req.method === "POST" && url.pathname === "/__api/publish") {
    let data = {};
    try {
      const payload = await readBody(req, MAX_BODY_BYTES);
      data = payload ? JSON.parse(payload) : {};
    } catch {
      return sendJson(res, 400, { ok: false, error: "Invalid JSON" });
    }
    if (data.message !== undefined && typeof data.message !== "string") {
      return sendJson(res, 400, { ok: false, error: "Publish message must be text" });
    }

    try {
      const result = await createPublishCommit({
        websiteRoot,
        expectedBranch: WEBSITE_GIT_BRANCH,
        message: data.message
      });
      if (result.ok) await logAudit("publish", `${result.commit} (${result.files.length} files)`, req.authUser);
      return sendJson(res, result.status, result);
    } catch {
      return sendJson(res, 500, { ok: false, error: "Publish failed unexpectedly" });
    }
  }
  if (req.method === "POST" && url.pathname === "/__api/upload") {
    let payload = "";
    try {
      payload = await readBody(req, MAX_BODY_BYTES);
    } catch {
      return sendJson(res, 413, { error: "Payload too large" });
    }

    let data;
    try {
      data = JSON.parse(payload);
    } catch {
      return sendJson(res, 400, { error: "Invalid JSON" });
    }

    const { name, dataUrl } = data || {};
    if (!name || typeof name !== "string" || !dataUrl || typeof dataUrl !== "string") {
      return sendJson(res, 400, { error: "Missing name or dataUrl" });
    }

    const decoded = decodeDataUrl(dataUrl);
    if (!decoded) {
      return sendJson(res, 400, { error: "Invalid data URL" });
    }

    const allowed = new Map([
      ["image/png", ".png"],
      ["image/jpeg", ".jpg"],
      ["image/gif", ".gif"],
      ["image/webp", ".webp"],
      ["image/svg+xml", ".svg"]
    ]);

    const ext = allowed.get(decoded.mime);
    if (!ext) {
      return sendJson(res, 400, { error: "Unsupported image type" });
    }

    if (decoded.buffer.length > MAX_BODY_BYTES) {
      return sendJson(res, 413, { error: "Image too large" });
    }

    const cleanName = sanitizeFilename(name);
    const safeName = cleanName.endsWith(ext) ? cleanName : `${cleanName}${ext}`;
    const stampedName = `${Date.now()}-${safeName}`;
    const targetPath = path.join(uploadDir, stampedName);

    try {
      await fs.mkdir(uploadDir, { recursive: true });
      await fs.writeFile(targetPath, decoded.buffer);
      await logAudit("upload", stampedName, req.authUser);
      return sendJson(res, 200, { ok: true, path: `/uploads/editor/${stampedName}` });
    } catch {
      return sendJson(res, 500, { error: "Failed to save upload" });
    }
  }

  if (req.method === "GET" && url.pathname === "/__api/facebook-posts") {
    const FB_TOKEN = process.env.FB_ACCESS_TOKEN;
    const FB_PAGE_ID = process.env.FB_PAGE_ID || "FLCIFalls";
    if (!FB_TOKEN) {
      return sendJson(res, 500, { error: "FB_ACCESS_TOKEN not configured" });
    }
    const limit = Math.min(Number(url.searchParams.get("limit")) || 8, 20);
    const after = url.searchParams.get("after") || "";
    const fields = "id,permalink_url,created_time";
    let graphUrl = `https://graph.facebook.com/v21.0/${FB_PAGE_ID}/posts?fields=${fields}&limit=${limit}&access_token=${FB_TOKEN}`;
    if (after) graphUrl += `&after=${encodeURIComponent(after)}`;
    try {
      const resp = await fetch(graphUrl);
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Facebook API ${resp.status}: ${err}`);
      }
      const json = await resp.json();
      const posts = (json.data || []).map((p) => ({
        id: p.id,
        url: p.permalink_url,
        date: p.created_time
      }));
      const afterCursor = json.paging?.cursors?.after || null;
      const hasMore = !!json.paging?.next;
      return sendJson(res, 200, { posts, after: afterCursor, hasMore });
    } catch (err) {
      return sendJson(res, 502, { error: err.message });
    }
  }

  if (req.method === "GET" && url.pathname === "/__api/youtube-latest") {
    const channelId = "UC4mlfLEMZkdyfi7KMcvzYmw";
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    try {
      const resp = await fetch(feedUrl);
      if (!resp.ok) throw new Error(`YouTube feed returned ${resp.status}`);
      const xml = await resp.text();
      // Extract first video ID from <yt:videoId>...</yt:videoId>
      const match = xml.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
      if (!match) throw new Error("No video found in feed");
      res.setHeader("Access-Control-Allow-Origin", "*");
      return sendJson(res, 200, { videoId: match[1] });
    } catch (err) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      return sendJson(res, 502, { error: err.message });
    }
  }

  return sendJson(res, 404, { error: "Not found" });
}

async function serveStatic(res, baseDir, pathname) {
  let relativePath = pathname;
  if (!relativePath || relativePath === "/") {
    relativePath = "/index.html";
  }
  const resolved = safeResolve(baseDir, relativePath);
  if (!resolved) {
    return send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
  }

  try {
    const stat = await fs.stat(resolved);
    if (stat.isDirectory()) {
      return serveStatic(res, baseDir, path.join(relativePath, "index.html"));
    }

    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const file = await fs.readFile(resolved);
    return send(res, 200, file, { "Content-Type": contentType });
  } catch {
    return send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname);

  if (isProtectedPath(pathname)) {
    const ok = requireAuth(req, res);
    if (!ok) return;
  }

  if (pathname.startsWith("/__api/")) {
    return handleApi(req, res, url);
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const adminPath = pathname === "/admin" ? "/index.html" : pathname.replace("/admin", "");
    return serveStatic(res, adminDir, adminPath);
  }

  return serveStatic(res, publicDir, pathname);
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Admin editor at http://localhost:${PORT}/admin`);
  console.log(`Website root: ${websiteRoot}`);
  console.log(`Basic auth user: ${BASIC_USER}`);
});

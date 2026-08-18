import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const MAX_PUBLISH_FILE_BYTES = 10 * 1024 * 1024;
const PUBLISHABLE_DIRECTORIES = ["assets", "files", "gdpr", "posts", "uploads"];
const PUBLISHABLE_ROOT_FILES = new Set(["robots.txt"]);
const BLOCKED_PUBLISH_SEGMENTS = new Set([
  ".git",
  "_backups",
  "admin",
  "docs",
  "logs",
  "node_modules",
  "previous_version",
  "scripts",
  "server",
  "tests"
]);
const SECRET_PATTERNS = [
  /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/i,
  /github_pat_[A-Za-z0-9_]+/,
  /gh[pousr]_[A-Za-z0-9_]+/,
  /(?:cloudflare|cf)[_-]?(?:api[_-]?)?(?:token|key)\s*[:=]\s*["']?\S+/i,
  /(?:api[_-]?key|access[_-]?token|secret)\s*[:=]\s*["'][^"']{8,}["']/i
];

function runProcess(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8")
      });
    });
  });
}

function normalizeRepositoryPath(relativePath) {
  if (!relativePath || relativePath.includes("\0")) return null;
  const normalized = path.posix.normalize(relativePath.replace(/\\/g, "/"));
  if (normalized === "." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    return null;
  }
  return normalized;
}

function isPublishablePath(relativePath) {
  const normalized = normalizeRepositoryPath(relativePath);
  if (!normalized) return false;
  const segments = normalized.split("/");
  if (segments.some((segment) => BLOCKED_PUBLISH_SEGMENTS.has(segment))) return false;
  if (segments.some((segment) => segment.startsWith(".env") || /^(secrets?|credentials?)$/i.test(segment))) {
    return false;
  }
  if (/\.(?:bak|swp|temp|tmp)$/i.test(normalized)) return false;
  if (!normalized.includes("/")) {
    return normalized.endsWith(".html") || PUBLISHABLE_ROOT_FILES.has(normalized);
  }
  return PUBLISHABLE_DIRECTORIES.includes(segments[0]);
}

function parsePorcelainStatus(output) {
  return output
    .split("\0")
    .filter(Boolean)
    .map((entry) => ({
      indexStatus: entry.slice(0, 1),
      worktreeStatus: entry.slice(1, 2),
      path: entry.slice(3)
    }));
}

async function verifyPublishableFile(websiteRoot, relativePath, worktreeStatus) {
  if (worktreeStatus === "D") return;
  const resolved = path.resolve(websiteRoot, relativePath);
  const relative = path.relative(websiteRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Invalid publish path: ${relativePath}`);
  }
  const stat = await fs.lstat(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Only regular files may be published: ${relativePath}`);
  }
  if (stat.size > MAX_PUBLISH_FILE_BYTES) {
    throw new Error(`Publish file is too large: ${relativePath}`);
  }
  if (/\.(?:css|html|js|json|md|mjs|svg|txt|xml)$/i.test(relativePath)) {
    const contents = await fs.readFile(resolved, "utf8");
    if (SECRET_PATTERNS.some((pattern) => pattern.test(contents))) {
      throw new Error(`Possible credential material in publish path: ${relativePath}`);
    }
  }
}

function publishError(status, error) {
  return { ok: false, status, error };
}

export async function createPublishCommit({ websiteRoot, expectedBranch, message }) {
  const runGit = (args) => runProcess("git", args, websiteRoot);
  const repositoryCheck = await runGit(["rev-parse", "--is-inside-work-tree"]);
  if (repositoryCheck.code !== 0 || repositoryCheck.stdout.trim() !== "true") {
    return publishError(400, "WEBSITE_ROOT is not a Git working tree");
  }

  const branchCheck = await runGit(["branch", "--show-current"]);
  const branch = branchCheck.stdout.trim();
  if (branchCheck.code !== 0 || !branch) {
    return publishError(409, "Website repository must be on a branch before publishing");
  }
  if (branch !== expectedBranch) {
    return publishError(409, `Website repository must be on branch ${expectedBranch}`);
  }

  const stagedCheck = await runGit(["diff", "--cached", "--quiet"]);
  if (stagedCheck.code === 1) {
    return publishError(409, "Website repository has pre-staged changes; review them before publishing");
  }
  if (stagedCheck.code !== 0) return publishError(500, "Failed to inspect staged Website changes");

  const statusResult = await runGit(["status", "--porcelain=v1", "-z"]);
  if (statusResult.code !== 0) return publishError(500, "Failed to inspect Website status");
  const entries = parsePorcelainStatus(statusResult.stdout);
  if (entries.length === 0) return publishError(409, "Nothing to publish");

  const paths = [];
  try {
    for (const entry of entries) {
      if (
        (entry.indexStatus !== " " && entry.indexStatus !== "?") ||
        /[RC]/.test(`${entry.indexStatus}${entry.worktreeStatus}`)
      ) {
        return publishError(409, "Website repository has unsupported staged, renamed, or copied changes");
      }
      if (!isPublishablePath(entry.path)) {
        return publishError(400, `Unsupported publish path: ${entry.path}`);
      }
      await verifyPublishableFile(websiteRoot, entry.path, entry.worktreeStatus);
      paths.push(entry.path);
    }
  } catch (error) {
    return publishError(400, error.message);
  }

  const addResult = await runGit(["add", "--", ...paths]);
  if (addResult.code !== 0) return publishError(500, "Failed to stage Website changes");

  const commitMessage = typeof message === "string" && message.trim()
    ? message.trim().slice(0, 120)
    : `Publish website changes (${paths.length} file${paths.length === 1 ? "" : "s"})`;
  const commitResult = await runGit(["commit", "-m", commitMessage]);
  if (commitResult.code !== 0) return publishError(500, "Failed to create Website publish commit");

  const shaResult = await runGit(["rev-parse", "HEAD"]);
  if (shaResult.code !== 0) return publishError(500, "Publish commit was created but SHA lookup failed");
  return { ok: true, status: 201, commit: shaResult.stdout.trim(), files: paths };
}
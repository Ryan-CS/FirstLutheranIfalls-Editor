import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const MAX_PUBLISH_FILE_BYTES = 10 * 1024 * 1024;
const PUBLISHABLE_DIRECTORIES = ["assets", "files", "gdpr", "posts", "uploads"];
const PUBLISHABLE_ROOT_FILES = new Set(["robots.txt"]);
const BLOCKED_PUBLISH_SEGMENTS = new Set([
  ".git", "_backups", "admin", "docs", "logs", "node_modules", "previous_version", "scripts", "server", "tests"
]);
const PENDING_REF = "refs/firstlutheran/publish-pending";
const SECRET_PATTERNS = [
  /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/i,
  /github_pat_[A-Za-z0-9_]+/,
  /gh[pousr]_[A-Za-z0-9_]+/,
  /(?:cloudflare|cf)[_-]?(?:api[_-]?)?(?:token|key)\s*[:=]\s*["']?\S+/i,
  /(?:api[_-]?key|access[_-]?token|secret)\s*[:=]\s*["'][^"']{8,}["']/i
];

function runProcess(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") }));
  });
}

function publishError(status, error, details = {}) {
  return { ok: false, status, pushed: false, ...details, error };
}

function normalizeRepositoryPath(relativePath) {
  if (!relativePath || relativePath.includes("\0")) return null;
  const normalized = path.posix.normalize(relativePath.replace(/\\/g, "/"));
  if (normalized === "." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) return null;
  return normalized;
}

function isPublishablePath(relativePath) {
  const normalized = normalizeRepositoryPath(relativePath);
  if (!normalized) return false;
  const segments = normalized.split("/");
  if (segments.some((segment) => BLOCKED_PUBLISH_SEGMENTS.has(segment))) return false;
  if (segments.some((segment) => segment.startsWith(".env") || /^(secrets?|credentials?)$/i.test(segment))) return false;
  if (/\.(?:bak|swp|temp|tmp)$/i.test(normalized)) return false;
  if (!normalized.includes("/")) return normalized.endsWith(".html") || PUBLISHABLE_ROOT_FILES.has(normalized);
  return PUBLISHABLE_DIRECTORIES.includes(segments[0]);
}

function parsePorcelainStatus(output) {
  return output.split("\0").filter(Boolean).map((entry) => ({
    indexStatus: entry.slice(0, 1),
    worktreeStatus: entry.slice(1, 2),
    path: entry.slice(3)
  }));
}

function validBranchName(branch) {
  return typeof branch === "string" && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch) && !branch.includes("..") && !branch.endsWith("/");
}

async function verifyPublishableFile(websiteRoot, relativePath, worktreeStatus) {
  if (worktreeStatus === "D") return;
  const resolved = path.resolve(websiteRoot, relativePath);
  const relative = path.relative(websiteRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Invalid publish path: ${relativePath}`);
  const stat = await fs.lstat(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Only regular files may be published: ${relativePath}`);
  if (stat.size > MAX_PUBLISH_FILE_BYTES) throw new Error(`Publish file is too large: ${relativePath}`);
  if (/\.(?:css|html|js|json|md|mjs|svg|txt|xml)$/i.test(relativePath)) {
    const contents = await fs.readFile(resolved, "utf8");
    if (SECRET_PATTERNS.some((pattern) => pattern.test(contents))) {
      throw new Error(`Possible credential material in publish path: ${relativePath}`);
    }
  }
}

async function currentSha(runGit, ref) {
  const result = await runGit(["rev-parse", "--verify", ref]);
  return result.code === 0 ? result.stdout.trim() : null;
}

async function verifyRemoteState(runGit, expectedBranch) {
  const fetch = await runGit(["fetch", "origin"]);
  if (fetch.code !== 0) return publishError(502, "Failed to fetch Website origin", { branch: expectedBranch });
  const remoteRef = `origin/${expectedBranch}`;
  const remoteSha = await currentSha(runGit, remoteRef);
  if (!remoteSha) return publishError(409, `Website origin branch ${expectedBranch} was not found`, { branch: expectedBranch });
  const head = await currentSha(runGit, "HEAD");
  if (!head) return publishError(500, "Failed to read Website HEAD", { branch: expectedBranch });
  const counts = await runGit(["rev-list", "--left-right", "--count", `HEAD...${remoteRef}`]);
  if (counts.code !== 0) return publishError(500, "Failed to compare Website and origin history", { branch: expectedBranch });
  const [localOnly, remoteOnly] = counts.stdout.trim().split(/\s+/).map(Number);
  const pending = await currentSha(runGit, PENDING_REF);

  if (localOnly === 0 && remoteOnly === 0) return { ok: true, head, remoteSha, retry: false };
  if (pending === head && localOnly === 1 && remoteOnly === 0) {
    return { ok: true, head, remoteSha, retry: true };
  }
  if (localOnly > 0 && remoteOnly > 0) {
    return publishError(409, "Website history diverged from origin; resolve it manually before publishing", { branch: expectedBranch });
  }
  if (remoteOnly > 0) {
    return publishError(409, "Website origin has advanced; update the checkout before publishing", { branch: expectedBranch });
  }
  return publishError(409, "Website has local commits not created by this Publish operation", { branch: expectedBranch });
}

async function pushPendingCommit(runGit, expectedBranch, commit, retried) {
  const push = await runGit(["push", "origin", `HEAD:refs/heads/${expectedBranch}`]);
  if (push.code !== 0) {
    return publishError(502, "Website commit was created but push failed; retry after resolving remote state", {
      branch: expectedBranch,
      commit,
      retried
    });
  }
  await runGit(["update-ref", "-d", PENDING_REF]);
  return { ok: true, status: retried ? 200 : 201, pushed: true, branch: expectedBranch, commit, retried };
}

export async function createPublishCommit({ websiteRoot, expectedBranch, message }) {
  if (!validBranchName(expectedBranch)) return publishError(400, "Configured Website branch is invalid", { branch: expectedBranch });
  const runGit = (args) => runProcess("git", args, websiteRoot);
  const repositoryCheck = await runGit(["rev-parse", "--is-inside-work-tree"]);
  if (repositoryCheck.code !== 0 || repositoryCheck.stdout.trim() !== "true") {
    return publishError(400, "WEBSITE_ROOT is not a Git working tree", { branch: expectedBranch });
  }
  const branchCheck = await runGit(["branch", "--show-current"]);
  const branch = branchCheck.stdout.trim();
  if (branchCheck.code !== 0 || !branch) return publishError(409, "Website repository must be on a branch before publishing", { branch: expectedBranch });
  if (branch !== expectedBranch) return publishError(409, `Website repository must be on branch ${expectedBranch}`, { branch: expectedBranch });

  const remoteState = await verifyRemoteState(runGit, expectedBranch);
  if (!remoteState.ok) return remoteState;
  if (remoteState.retry) return pushPendingCommit(runGit, expectedBranch, remoteState.head, true);

  const stagedCheck = await runGit(["diff", "--cached", "--quiet"]);
  if (stagedCheck.code === 1) return publishError(409, "Website repository has pre-staged changes; review them before publishing", { branch: expectedBranch });
  if (stagedCheck.code !== 0) return publishError(500, "Failed to inspect staged Website changes", { branch: expectedBranch });
  const statusResult = await runGit(["status", "--porcelain=v1", "-z"]);
  if (statusResult.code !== 0) return publishError(500, "Failed to inspect Website status", { branch: expectedBranch });
  const entries = parsePorcelainStatus(statusResult.stdout);
  if (entries.length === 0) return publishError(409, "Nothing to publish", { branch: expectedBranch });

  const paths = [];
  try {
    for (const entry of entries) {
      if ((entry.indexStatus !== " " && entry.indexStatus !== "?") || /[RC]/.test(`${entry.indexStatus}${entry.worktreeStatus}`)) {
        return publishError(409, "Website repository has unsupported staged, renamed, or copied changes", { branch: expectedBranch });
      }
      if (!isPublishablePath(entry.path)) return publishError(400, `Unsupported publish path: ${entry.path}`, { branch: expectedBranch });
      await verifyPublishableFile(websiteRoot, entry.path, entry.worktreeStatus);
      paths.push(entry.path);
    }
  } catch (error) {
    return publishError(400, error.message, { branch: expectedBranch });
  }

  const addResult = await runGit(["add", "--", ...paths]);
  if (addResult.code !== 0) return publishError(500, "Failed to stage Website changes", { branch: expectedBranch });
  const commitMessage = typeof message === "string" && message.trim()
    ? message.trim().slice(0, 120)
    : `Publish website changes (${paths.length} file${paths.length === 1 ? "" : "s"})`;
  const commitResult = await runGit(["commit", "-m", commitMessage]);
  if (commitResult.code !== 0) return publishError(500, "Failed to create Website publish commit", { branch: expectedBranch });
  const commit = await currentSha(runGit, "HEAD");
  if (!commit) return publishError(500, "Publish commit was created but SHA lookup failed", { branch: expectedBranch });
  const marker = await runGit(["update-ref", PENDING_REF, commit]);
  if (marker.code !== 0) return publishError(500, "Publish commit was created but retry marker failed", { branch: expectedBranch, commit });
  const pushed = await pushPendingCommit(runGit, expectedBranch, commit, false);
  return pushed.ok ? { ...pushed, files: paths } : { ...pushed, files: paths };
}

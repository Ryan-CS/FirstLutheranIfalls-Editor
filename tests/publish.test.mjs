import test from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

const execFileAsync = promisify(execFile);

function waitForLine(stream, matcher, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for server start"));
    }, timeoutMs);
    function onData(chunk) {
      if (matcher.test(chunk.toString("utf8"))) {
        cleanup();
        resolve();
      }
    }
    function cleanup() {
      clearTimeout(timeout);
      stream.off("data", onData);
    }
    stream.on("data", onData);
  });
}

async function git(cwd, ...args) {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args]);
  return stdout.trim();
}

function stableEditorStatus(status) {
  return status
    .split("\n")
    .filter((line) => line && !line.includes("?? .tmp-"))
    .join("\n");
}

async function setupWebsiteRepository(websiteRoot, remoteRoot) {
  await fs.mkdir(websiteRoot, { recursive: true });
  await fs.writeFile(path.join(websiteRoot, ".gitignore"), "_backups/\n", "utf8");
  await fs.writeFile(path.join(websiteRoot, "index.html"), "<!doctype html><html><body>Initial</body></html>", "utf8");
  await git(websiteRoot, "init", "-b", "main");
  await git(websiteRoot, "config", "user.name", "Publish Test");
  await git(websiteRoot, "config", "user.email", "publish@example.test");
  await git(websiteRoot, "add", ".gitignore", "index.html");
  await git(websiteRoot, "commit", "-m", "Initial website");
  await execFileAsync("git", ["init", "--bare", remoteRoot]);
  await git(websiteRoot, "remote", "add", "origin", remoteRoot);
  await git(websiteRoot, "push", "-u", "origin", "main");
}

test("publish creates a local Website commit without pushing", async () => {
  const port = 8860 + Math.floor(Math.random() * 50);
  const testRoot = path.join(process.cwd(), ".tmp-publish-smoke");
  const websiteRoot = path.join(testRoot, "website");
  const remoteRoot = path.join(testRoot, "website-remote.git");
  await fs.rm(testRoot, { recursive: true, force: true });
  await setupWebsiteRepository(websiteRoot, remoteRoot);
  const initialRemoteHead = await git(remoteRoot, "rev-parse", "refs/heads/main");
  const editorStatusBefore = stableEditorStatus(await git(process.cwd(), "status", "--porcelain"));
  const credentials = Buffer.from("admin:secret").toString("base64");
  const child = spawn(process.execPath, ["server/dev.mjs"], {
    env: {
      ...process.env,
      PORT: String(port),
      BASIC_USER: "admin",
      BASIC_PASS: "secret",
      WEBSITE_ROOT: websiteRoot,
      WEBSITE_GIT_BRANCH: "main"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForLine(child.stdout, /Server running/);
    const traversal = await fetch(`http://localhost:${port}/__api/page?path=${encodeURIComponent("../package.json")}`, {
      headers: { Authorization: `Basic ${credentials}` }
    });
    assert.equal(traversal.status, 400);

    const save = await fetch(`http://localhost:${port}/__api/save`, {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
      body: JSON.stringify({ path: "index.html", html: "<!doctype html><html><body>Saved</body></html>" })
    });
    assert.equal(save.status, 200);
    assert.equal((await fs.readdir(path.join(websiteRoot, "_backups"))).length, 1);

    const publish = await fetch(`http://localhost:${port}/__api/publish`, {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(publish.status, 201);
    const published = await publish.json();
    assert.match(published.commit, /^[0-9a-f]{40}$/);
    assert.deepEqual(published.files, ["index.html"]);
    assert.equal(await git(websiteRoot, "rev-parse", "HEAD"), published.commit);
    assert.equal(await git(websiteRoot, "status", "--porcelain"), "");
    assert.equal(await git(websiteRoot, "ls-tree", "-r", "--name-only", "HEAD", "_backups"), "");
    assert.equal(await git(remoteRoot, "rev-parse", "refs/heads/main"), initialRemoteHead);
    assert.notEqual(await git(websiteRoot, "rev-parse", "HEAD"), initialRemoteHead);
    assert.equal(stableEditorStatus(await git(process.cwd(), "status", "--porcelain")), editorStatusBefore);

    const noOp = await fetch(`http://localhost:${port}/__api/publish`, {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(noOp.status, 409);
    assert.equal((await noOp.json()).error, "Nothing to publish");

    await fs.mkdir(path.join(websiteRoot, "server"));
    await fs.writeFile(path.join(websiteRoot, "server", "blocked.txt"), "blocked", "utf8");
    const blocked = await fetch(`http://localhost:${port}/__api/publish`, {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(blocked.status, 400);
    assert.match((await blocked.json()).error, /Unsupported publish path/);
    await fs.rm(path.join(websiteRoot, "server"), { recursive: true, force: true });
    assert.equal(await git(websiteRoot, "status", "--porcelain"), "");
  } finally {
    child.kill();
    await delay(100);
    await fs.rm(testRoot, { recursive: true, force: true });
  }
});
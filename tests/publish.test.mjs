import test from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { createPublishCommit } from "../server/publish.mjs";

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

async function setupWebsiteRepository(testName) {
  const testRoot = path.join(process.cwd(), `.tmp-publish-${testName}`);
  const websiteRoot = path.join(testRoot, "website");
  const remoteRoot = path.join(testRoot, "website-remote.git");
  await fs.rm(testRoot, { recursive: true, force: true });
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
  return { testRoot, websiteRoot, remoteRoot };
}

function stableEditorStatus(status) {
  return status
    .split("\n")
    .filter((line) => line && !line.includes("?? .tmp-"))
    .join("\n");
}

async function publish(websiteRoot) {
  return createPublishCommit({ websiteRoot, expectedBranch: "main", message: undefined });
}

test("Publish API commits and pushes only allowed Website content", async () => {
  const port = 8860 + Math.floor(Math.random() * 50);
  const { testRoot, websiteRoot, remoteRoot } = await setupWebsiteRepository("api");
  const initialRemoteHead = await git(remoteRoot, "rev-parse", "refs/heads/main");
  const editorStatusBefore = stableEditorStatus(await git(process.cwd(), "status", "--porcelain"));
  const credentials = Buffer.from("admin:secret").toString("base64");
  const child = spawn(process.execPath, ["server/dev.mjs"], {
    env: { ...process.env, PORT: String(port), BASIC_USER: "admin", BASIC_PASS: "secret", WEBSITE_ROOT: websiteRoot, WEBSITE_GIT_BRANCH: "main" },
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
    const response = await fetch(`http://localhost:${port}/__api/publish`, {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.equal(result.ok, true);
    assert.equal(result.pushed, true);
    assert.deepEqual(result.files, ["index.html"]);
    assert.equal(await git(websiteRoot, "rev-parse", "HEAD"), result.commit);
    assert.equal(await git(remoteRoot, "rev-parse", "refs/heads/main"), result.commit);
    assert.notEqual(result.commit, initialRemoteHead);
    assert.equal(await git(websiteRoot, "status", "--porcelain"), "");
    assert.equal(await git(websiteRoot, "ls-tree", "-r", "--name-only", "HEAD", "_backups"), "");
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
  } finally {
    child.kill();
    await delay(100);
    await fs.rm(testRoot, { recursive: true, force: true });
  }
});

test("Publish rejects remote-ahead and diverged histories", async () => {
  const remoteAhead = await setupWebsiteRepository("remote-ahead");
  const peerRoot = path.join(remoteAhead.testRoot, "peer");
  try {
    await execFileAsync("git", ["clone", "--branch", "main", remoteAhead.remoteRoot, peerRoot]);
    await git(peerRoot, "config", "user.name", "Peer");
    await git(peerRoot, "config", "user.email", "peer@example.test");
    await fs.writeFile(path.join(peerRoot, "index.html"), "<!doctype html><html><body>Remote</body></html>", "utf8");
    await git(peerRoot, "add", "index.html");
    await git(peerRoot, "commit", "-m", "Remote change");
    await git(peerRoot, "push", "origin", "main");
    const remoteAheadResult = await publish(remoteAhead.websiteRoot);
    assert.equal(remoteAheadResult.status, 409);
    assert.match(remoteAheadResult.error, /origin has advanced/);
  } finally {
    await fs.rm(remoteAhead.testRoot, { recursive: true, force: true });
  }

  const diverged = await setupWebsiteRepository("diverged");
  const divergedPeer = path.join(diverged.testRoot, "peer");
  try {
    await fs.writeFile(path.join(diverged.websiteRoot, "index.html"), "<!doctype html><html><body>Local</body></html>", "utf8");
    await git(diverged.websiteRoot, "add", "index.html");
    await git(diverged.websiteRoot, "commit", "-m", "Unrelated local change");
    await execFileAsync("git", ["clone", "--branch", "main", diverged.remoteRoot, divergedPeer]);
    await git(divergedPeer, "config", "user.name", "Peer");
    await git(divergedPeer, "config", "user.email", "peer@example.test");
    await fs.writeFile(path.join(divergedPeer, "index.html"), "<!doctype html><html><body>Remote</body></html>", "utf8");
    await git(divergedPeer, "add", "index.html");
    await git(divergedPeer, "commit", "-m", "Remote change");
    await git(divergedPeer, "push", "origin", "main");
    const divergedResult = await publish(diverged.websiteRoot);
    assert.equal(divergedResult.status, 409);
    assert.match(divergedResult.error, /diverged/);
  } finally {
    await fs.rm(diverged.testRoot, { recursive: true, force: true });
  }
});

test("Publish retains a failed local commit and safely retries only that commit", async () => {
  const failed = await setupWebsiteRepository("push-failure");
  try {
    const initialRemoteHead = await git(failed.remoteRoot, "rev-parse", "refs/heads/main");
    await fs.writeFile(path.join(failed.websiteRoot, "index.html"), "<!doctype html><html><body>Retry</body></html>", "utf8");
    const hookPath = path.join(failed.websiteRoot, ".git", "hooks", "pre-push");
    await fs.writeFile(hookPath, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    const failedPush = await publish(failed.websiteRoot);
    assert.equal(failedPush.status, 502);
    assert.equal(failedPush.pushed, false);
    assert.match(failedPush.commit, /^[0-9a-f]{40}$/);
    assert.equal(await git(failed.remoteRoot, "rev-parse", "refs/heads/main"), initialRemoteHead);
    assert.equal(await git(failed.websiteRoot, "rev-parse", "refs/firstlutheran/publish-pending"), failedPush.commit);
    await fs.rm(hookPath);
    const retried = await publish(failed.websiteRoot);
    assert.equal(retried.ok, true);
    assert.equal(retried.retried, true);
    assert.equal(retried.commit, failedPush.commit);
    assert.equal(await git(failed.remoteRoot, "rev-parse", "refs/heads/main"), failedPush.commit);
    await assert.rejects(git(failed.websiteRoot, "rev-parse", "--verify", "refs/firstlutheran/publish-pending"));
    const implementation = await fs.readFile(path.join(process.cwd(), "server", "publish.mjs"), "utf8");
    assert.equal(implementation.includes("--force"), false);
  } finally {
    await fs.rm(failed.testRoot, { recursive: true, force: true });
  }
});

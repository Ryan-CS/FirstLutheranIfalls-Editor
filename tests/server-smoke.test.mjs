import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

function waitForLine(stream, matcher, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for server start"));
    }, timeoutMs);

    function onData(chunk) {
      const text = chunk.toString("utf8");
      if (matcher.test(text)) {
        cleanup();
        resolve(text);
      }
    }

    function onError(err) {
      cleanup();
      reject(err);
    }

    function cleanup() {
      clearTimeout(timeout);
      stream.off("data", onData);
      stream.off("error", onError);
    }

    stream.on("data", onData);
    stream.on("error", onError);
  });
}

test("server starts and protects admin + api", async () => {
  const port = 8790 + Math.floor(Math.random() * 50);
  const websiteRoot = path.join(process.cwd(), ".tmp-server-smoke-website");
  await fs.rm(websiteRoot, { recursive: true, force: true });
  await fs.mkdir(websiteRoot, { recursive: true });
  await fs.writeFile(path.join(websiteRoot, "index.html"), "<!doctype html><html><body>Smoke</body></html>", "utf8");

  const env = {
    ...process.env,
    PORT: String(port),
    BASIC_USER: "admin",
    BASIC_PASS: "secret",
    WEBSITE_ROOT: websiteRoot
  };

  const child = spawn(process.execPath, ["server/dev.mjs"], {
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForLine(child.stdout, /Server running/);

    const adminRes = await fetch(`http://localhost:${port}/admin`, {
      redirect: "manual"
    });
    assert.equal(adminRes.status, 401);

    const credentials = Buffer.from("admin:secret").toString("base64");
    const apiRes = await fetch(`http://localhost:${port}/__api/pages`, {
      headers: {
        Authorization: `Basic ${credentials}`
      }
    });
    assert.equal(apiRes.status, 200);
    const data = await apiRes.json();
    assert.deepEqual(data.pages, ["index.html"]);

    const traversalRes = await fetch(`http://localhost:${port}/__api/page?path=${encodeURIComponent("../package.json")}`, {
      headers: {
        Authorization: `Basic ${credentials}`
      }
    });
    assert.equal(traversalRes.status, 400);

    const saveRes = await fetch(`http://localhost:${port}/__api/save`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        path: "index.html",
        html: "<!doctype html><html><body>Saved externally</body></html>"
      })
    });
    assert.equal(saveRes.status, 200);
    assert.equal(await fs.readFile(path.join(websiteRoot, "index.html"), "utf8"), "<!doctype html><html><body>Saved externally</body></html>");

    const uploadRes = await fetch(`http://localhost:${port}/__api/upload`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "test-image.png",
        dataUrl:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="
      })
    });

    assert.equal(uploadRes.status, 200);
    const uploadData = await uploadRes.json();
    assert.ok(uploadData.path.startsWith("/uploads/editor/"));
    const localPath = path.join(websiteRoot, uploadData.path.replace(/^\//, ""));
    await fs.access(localPath);
  } finally {
    child.kill();
    await delay(100);
    await fs.rm(websiteRoot, { recursive: true, force: true });
  }
});

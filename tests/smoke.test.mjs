import test from "node:test";
import assert from "node:assert/strict";

test("repo has required folders", async () => {
  const fs = await import("node:fs/promises");
  const required = ['admin', 'worker', 'docs', 'scripts'];
  for (const d of required) {
    await fs.access(d);
  }
  assert.ok(true);
});

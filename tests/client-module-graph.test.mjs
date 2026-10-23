import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server.mjs";
test("every real browser module import is publicly served at the same revision", async (t) => {
  const app = createApp();
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  const html = await (await fetch(base + "/")).text();
  const entry = html.match(/src="(\/src\/app\.mjs\?v=[a-f0-9]+)"/)?.[1];
  assert.ok(entry);
  const visited = new Set();
  async function read(path) {
    if (visited.has(path)) return;
    visited.add(path);
    const r = await fetch(base + path);
    assert.equal(r.status, 200, path);
    const source = await r.text();
    for (const match of source.matchAll(
      /from\s+["'](\.\/[^"']+\.mjs\?v=[a-f0-9]+)["']/g,
    )) {
      const url = new URL(match[1], base + path);
      assert.equal(url.search, new URL(base + entry).search);
      await read(url.pathname + url.search);
    }
  }
  await read(entry);
  assert.ok([...visited].some((p) => p.includes("quote-support.mjs")));
  assert.equal(
    (await fetch(base + "/server/issuer-conversions.mjs")).status,
    404,
  );
});

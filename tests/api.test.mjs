import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../server.mjs";
import { validateComparison } from "../server/quotes.mjs";

test("health reports the packaged release version", async (t) => {
  const app = createApp();
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => app.close(resolve)));
  const response = await fetch(
    `http://127.0.0.1:${app.address().port}/api/health`,
  );
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url)),
  );
  assert.deepEqual(await response.json(), {
    status: "ok",
    version: pkg.version,
  });
});

test("comparison validation rejects ambiguous coercions and unsupported chains", () => {
  assert.deepEqual(
    validateComparison(
      new URLSearchParams("ticker=NVDA&amount=1000&chain=Solana"),
    ),
    { id: "NVDA", amount: "1000", chain: "Solana" },
  );
  for (const q of [
    "amount=1e3",
    "chain=javascript:bad",
    "stock=<script>",
    "amount=-10",
    "amount=10.001",
  ])
    assert.throws(() => validateComparison(new URLSearchParams(q)));
});
test("HTTP app serves API and app assets, and excludes source/server files", async (t) => {
  const app = createApp({
    getCatalog: async () => ({ stocks: [], warnings: [] }),
    compare: async (params) => ({ checked: params, rows: [] }),
  });
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  const good = await fetch(base + "/api/compare?ticker=NVDA&amount=1000");
  assert.equal(good.status, 200);
  assert.equal((await good.json()).checked.id, "NVDA");
  for (const path of [
    "/server/config.mjs",
    "/.env",
    "/research/NVDAx.json",
    "/PRODUCT.md",
  ])
    assert.equal((await fetch(base + path)).status, 404);
  assert.equal((await fetch(base + "/api/compare?amount=1e6")).status, 400);
  assert.equal((await fetch(base + "/", { method: "POST" })).status, 405);
  const home = await fetch(base + "/");
  assert.equal(home.status, 200);
  assert.ok(
    home.headers.get("content-security-policy").includes("default-src 'self'"),
  );
});
test("upstream failure is a service error rather than a success with invented data", async (t) => {
  const app = createApp({
    getCatalog: async () => {
      throw new Error("Catalog offline");
    },
  });
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => app.close(resolve)));
  const response = await fetch(
    `http://127.0.0.1:${app.address().port}/api/catalog`,
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "Catalog offline");
});

test("workspace API serves independent views and rejects invalid query/history scope", async (t) => {
  const app = createApp({
    products: async (q) => ({ view: "products", id: q.id }),
    markets: async (q) => ({ view: "markets", chain: q.chain }),
  });
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  assert.equal(
    (
      await (
        await fetch(base + "/api/products?stock=cg:nvidia&chain=Base")
      ).json()
    ).id,
    "cg:nvidia",
  );
  assert.equal(
    (
      await (
        await fetch(base + "/api/markets?stock=NVDA&chain=Robinhood")
      ).json()
    ).chain,
    "Robinhood",
  );
  assert.equal(
    (await fetch(base + "/api/products?stock=%3Cscript%3E")).status,
    400,
  );
  assert.equal((await fetch(base + "/api/markets?chain=fake")).status, 400);
  assert.equal(
    (await fetch(base + "/api/history?stock=NVDA&pool=https://evil.test"))
      .status,
    400,
  );
});

test("large catalog responses negotiate gzip without changing data or HEAD semantics", async (t) => {
  const { get } = await import("node:http");
  const { gunzipSync } = await import("node:zlib");
  const catalog = { stocks: [{ name: "NVIDIA ".repeat(14000) }], warnings: [] };
  const app = createApp({ getCatalog: async () => catalog });
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  const raw = (encoding, method = "GET") =>
    new Promise((resolve, reject) => {
      get(
        base + "/api/catalog",
        { method, headers: { "Accept-Encoding": encoding } },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () =>
            resolve({ headers: res.headers, body: Buffer.concat(chunks) }),
          );
          res.on("error", reject);
        },
      ).on("error", reject);
    });
  const compressed = await raw("br, gzip");
  assert.equal(compressed.headers["content-encoding"], "gzip");
  assert.match(compressed.headers.vary, /Accept-Encoding/);
  assert.deepEqual(JSON.parse(gunzipSync(compressed.body)), catalog);
  assert.ok(compressed.body.length < JSON.stringify(catalog).length / 10);
  for (const encoding of ["gzip;q=0, *;q=1", "identity", "gzip;q=0.0"]) {
    const plain = await raw(encoding);
    assert.equal(plain.headers["content-encoding"], undefined);
    assert.deepEqual(JSON.parse(plain.body), catalog);
  }
  const head = await raw("gzip", "HEAD");
  assert.equal(head.body.length, 0);
});

test("a release uses one content revision across HTML, styles and module imports", async (t) => {
  const app = createApp();
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  const html = await (await fetch(base + "/")).text();
  const scripts = html.match(/\/src\/app\.mjs\?v=([a-f0-9]+)/);
  assert.ok(scripts, "HTML entry must invalidate old cached modules");
  const revision = scripts[1];
  assert.ok(html.includes("/src/styles.css?v=" + revision));
  const source = await (await fetch(base + scripts[0])).text();
  assert.ok(source.includes("./model.mjs?v=" + revision));
  assert.equal(
    (await fetch(base + "/server/market-details.mjs?v=" + revision)).status,
    404,
  );
});

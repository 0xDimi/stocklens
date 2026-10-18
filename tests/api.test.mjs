import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server.mjs";
import { validateComparison } from "../server/quotes.mjs";

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

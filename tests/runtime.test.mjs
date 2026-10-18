import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server.mjs";

async function listening(t, options) {
  const app = createApp(options);
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => app.close(resolve)));
  return `http://127.0.0.1:${app.address().port}`;
}
test("health bypasses exhausted API limits and readiness requires usable catalog", async (t) => {
  const base = await listening(t, {
    getCatalog: async () => ({ stocks: [] }),
    runtime: { rateLimit: 1 },
  });
  assert.equal((await fetch(base + "/api/catalog")).status, 200);
  assert.equal((await fetch(base + "/api/catalog")).status, 429);
  assert.equal((await fetch(base + "/api/health")).status, 200);
  assert.equal((await fetch(base + "/api/ready")).status, 503);
});
test("spoofed forwarding cannot rotate rate identity on an untrusted peer", async (t) => {
  const base = await listening(t, {
    getCatalog: async () => ({ stocks: [{ id: "NVDA" }] }),
    runtime: { rateLimit: 1 },
  });
  assert.equal(
    (
      await fetch(base + "/api/catalog", {
        headers: { "X-Forwarded-For": "198.51.100.1" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(base + "/api/catalog", {
        headers: { "X-Forwarded-For": "198.51.100.2" },
      })
    ).status,
    429,
  );
});
test("trusted proxy parses address chain from nearest untrusted hop", async (t) => {
  const base = await listening(t, {
    getCatalog: async () => ({ stocks: [{ id: "NVDA" }] }),
    runtime: { rateLimit: 1, trustedProxies: ["127.0.0.1"] },
  });
  const headers = { "X-Forwarded-For": "198.51.100.1, 192.0.2.1" };
  assert.equal((await fetch(base + "/api/catalog", { headers })).status, 200);
  assert.equal(
    (
      await fetch(base + "/api/catalog", {
        headers: { "X-Forwarded-For": "198.51.100.2, 192.0.2.1" },
      })
    ).status,
    429,
  );
  assert.equal(
    (
      await fetch(base + "/api/catalog", {
        headers: { "X-Forwarded-For": "192.0.2.2" },
      })
    ).status,
    200,
  );
});
test("readiness and production asset responses carry restrictive security and cache headers", async (t) => {
  const base = await listening(t, {
    getCatalog: async () => ({ stocks: [{ id: "NVDA" }] }),
    runtime: { production: true },
  });
  const ready = await fetch(base + "/api/ready");
  assert.equal(ready.status, 200);
  const asset = await fetch(base + "/src/app.mjs");
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("cache-control"), /max-age=300/);
  assert.equal(asset.headers.get("x-frame-options"), "DENY");
  assert.match(
    asset.headers.get("strict-transport-security"),
    /max-age=31536000/,
  );
  for (const path of [
    "/server/runtime.mjs",
    "/.env",
    "/DEPLOY.md",
    "/package.json",
    "/src/../server.mjs",
  ])
    assert.equal((await fetch(base + path)).status, 404);
});
test("runtime rejects unsafe bind, proxy, duration and cache settings", async () => {
  const { readRuntime } = await import("../server/runtime.mjs");
  assert.equal(readRuntime({ NODE_ENV: "production" }).host, "0.0.0.0");
  assert.equal(readRuntime({}).host, "127.0.0.1");
  for (const env of [
    { PORT: "12x" },
    { HOST: "https://localhost" },
    { TRUST_PROXY: "true" },
    { SOURCE_CONCURRENCY: "0" },
    { SOURCE_MAX_QUEUE: "10001" },
    { CACHE_DIR: "\0bad" },
    { COINGECKO_PLAN: "oops" },
    { ETHEREUM_RPC_URL: "file:///etc/passwd" },
  ])
    assert.throws(() => readRuntime(env));
});

test("concurrent readiness probes share real catalog work without consuming API quota", async (t) => {
  let loads = 0;
  const base = await listening(t, {
    getCatalog: async () => {
      loads++;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { stocks: [{ id: "NVDA" }] };
    },
    runtime: { rateLimit: 1 },
  });
  const probes = await Promise.all(
    Array.from({ length: 6 }, () => fetch(base + "/api/ready")),
  );
  assert.deepEqual(
    probes.map((r) => r.status),
    [200, 200, 200, 200, 200, 200],
  );
  assert.equal(loads, 1);
  assert.equal((await fetch(base + "/api/missing")).status, 404);
  assert.equal((await fetch(base + "/api/missing")).status, 429);
});
test("market desk routes enforce stock scope and preserve separate screener parameters", async (t) => {
  const base = await listening(t, {
    screener: async (params) => ({ page: params.get("page") }),
    venues: async (query, params) => ({
      stock: query.id,
      coin: params.get("coin"),
    }),
  });
  assert.deepEqual(await (await fetch(base + "/api/screener?page=2")).json(), {
    page: "2",
  });
  assert.deepEqual(
    await (
      await fetch(base + "/api/venues?stock=NVDA&coin=nvidia-xstock")
    ).json(),
    { stock: "NVDA", coin: "nvidia-xstock" },
  );
  assert.equal(
    (await fetch(base + "/api/venues?stock=%3Cscript%3E")).status,
    400,
  );
});

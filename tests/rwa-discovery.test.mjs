import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as cg from "../server/coingecko.mjs";
import { createRwaDiscovery } from "../server/rwa-discovery.mjs";
const at = "2026-10-26T13:00:00.000Z";
const contract = "0x1111111111111111111111111111111111111111";
const coin = {
  id: "apple-new-token",
  symbol: "apple-v2",
  name: "Unconventional product name",
  platforms: { ethereum: contract },
};
const base = {
  retrievedAt: at,
  stocks: [
    {
      id: "cg:apple",
      rwaId: "apple",
      ticker: "AAPL",
      name: "Apple",
      category: "Stock",
      sourceAt: at,
      products: [],
    },
  ],
  registry: [],
  universe: { securities: 1 },
};
const native = {
  id: "apple",
  symbol: "AAPL",
  name: "Apple",
  tokens: [
    { ...coin, issuer_details: { id: "coinbase-ecosystem", name: "Coinbase" } },
  ],
};
async function setup(t, options = {}) {
  const cacheDir = await mkdtemp(join(tmpdir(), "stocklens-rwa-"));
  t.after(() => rm(cacheDir, { recursive: true, force: true }));
  const calls = [];
  const read = async (path) => {
    calls.push(path);
    const data =
      path === "/rwas/issuers/list"
        ? [{ id: "coinbase-ecosystem", name: "Coinbase" }]
        : path === "/rwas/issuers/coinbase-ecosystem"
          ? { id: "coinbase-ecosystem", name: "Coinbase", tokens: [coin] }
          : native;
    return { data, retrievedAt: at };
  };
  return { cacheDir, calls, read, ...options };
}
test("issuer endpoints validate their own identity rather than treating issuers as underlying securities", () => {
  assert.equal(
    cg.validateCoinGeckoResponse(
      [{ id: "coinbase-ecosystem", name: "Coinbase" }],
      "/rwas/issuers/list",
    ),
    true,
  );
  assert.equal(
    cg.validateCoinGeckoResponse(
      { id: "coinbase-ecosystem", tokens: [coin] },
      "/rwas/issuers/coinbase-ecosystem",
    ),
    true,
  );
  assert.equal(
    cg.validateCoinGeckoResponse(
      { id: "wrong", tokens: [] },
      "/rwas/issuers/coinbase-ecosystem",
    ),
    false,
  );
});
test("background native mappings add tokens without naming conventions and disclose dated issuer coverage", async (t) => {
  const opts = await setup(t);
  const scan = createRwaDiscovery({
    ...opts,
    now: () => Date.parse(at),
    seedPath: null,
  });
  await scan.refresh(base);
  const result = await scan.augment(base, { refresh: false });
  assert.equal(result.stocks[0].products.length, 1);
  assert.equal(result.stocks[0].products[0].coinId, "apple-new-token");
  assert.equal(result.stocks[0].products[0].issuer, "coinbase");
  assert.equal(result.stocks[0].products[0].sourceAt, at);
  assert.equal(result.registry[0].issuer_details.id, "coinbase-ecosystem");
  assert.equal(result.universe.issuerCatalogs, 1);
  assert.equal(result.universe.nativeMappings, 1);
});
test("exact issuer contract attaches market IDs even when names and token symbols differ", () => {
  const result = cg.attachKnownProducts(
    [
      {
        id: "US0378331005",
        ticker: "AAPL",
        products: [
          {
            issuer: "coinbase",
            symbol: "AAPLc",
            deployments: [{ chain: "Ethereum", address: contract }],
          },
        ],
      },
    ],
    [
      {
        ...coin,
        issuer_details: { id: "coinbase-ecosystem", name: "Coinbase" },
      },
    ],
    at,
  );
  assert.equal(result[0].products[0].coinId, "apple-new-token");
});
test("catalog reads return before a held upstream scan and concurrent reads share one worker", async (t) => {
  const opts = await setup(t);
  let release;
  const held = new Promise((resolve) => (release = resolve));
  const scan = createRwaDiscovery({
    ...opts,
    seedPath: null,
    now: () => Date.parse(at),
    read: async (path, ...rest) => {
      await held;
      return opts.read(path, ...rest);
    },
  });
  const result = await Promise.race([
    scan.augment(base),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("blocked catalog")), 200),
    ),
  ]);
  assert.equal(result.stocks.length, 1);
  await scan.augment(base);
  await scan.augment(base);
  release();
  await scan.refresh(base);
  assert.equal(opts.calls.filter((p) => p === "/rwas/issuers/list").length, 1);
});
test("daily request budget survives process restart and calls resume only on the next UTC day", async (t) => {
  const opts = await setup(t);
  let clock = Date.parse(at);
  const config = {
    ...opts,
    seedPath: null,
    now: () => clock,
    dailyLimit: 2,
    nativeLimit: 1,
  };
  await createRwaDiscovery(config).refresh(base);
  assert.equal(opts.calls.length, 2);
  await createRwaDiscovery(config).refresh(base);
  assert.equal(opts.calls.length, 2);
  clock += 86400000;
  await createRwaDiscovery(config).refresh(base);
  assert.equal(opts.calls.length, 4);
});
test("a failed source refresh preserves independent catalogs and original native dates", async (t) => {
  const opts = await setup(t);
  await createRwaDiscovery({
    ...opts,
    now: () => Date.parse(at),
    seedPath: null,
  }).refresh(base);
  const scan = createRwaDiscovery({
    ...opts,
    seedPath: null,
    now: () => Date.parse(at) + 86400001,
    read: async () => {
      throw new Error("HTTP 429");
    },
  });
  await scan.refresh(base);
  const result = await scan.augment(base, { refresh: false });
  assert.equal(result.stocks[0].products[0].sourceAt, at);
  assert.equal(
    result.discoveryState.issuers["coinbase-ecosystem"].retrievedAt,
    at,
  );
  assert.ok(result.discoveryCoverage.errors.length);
});
test("expired and future native observations cannot renew a catalog identity", async (t) => {
  const opts = await setup(t);
  await createRwaDiscovery({
    ...opts,
    now: () => Date.parse(at),
    seedPath: null,
  }).refresh(base);
  for (const offset of [-1000, 4 * 86400000]) {
    const scan = createRwaDiscovery({
      ...opts,
      seedPath: null,
      now: () => Date.parse(at) + offset,
    });
    const result = await scan.augment(base, { refresh: false });
    assert.equal(result.stocks[0].products.length, 0);
  }
});

test("existing native observations enrich discovery without another upstream request and keep their original date", async (t) => {
  const { writeFile } = await import("node:fs/promises");
  const opts = await setup(t);
  await writeFile(
    join(opts.cacheDir, "coingecko-observations.json"),
    JSON.stringify({
      version: 1,
      observations: [
        [
          "/rwas/apple?tokens=true&tokenized_market_data=true",
          { data: native, retrievedAt: at, expires: Date.parse(at) + 86400000 },
        ],
      ],
    }),
  );
  const scan = createRwaDiscovery({
    ...opts,
    now: () => Date.parse(at),
    seedPath: null,
  });
  const result = await scan.augment(base, { refresh: false });
  assert.equal(result.stocks[0].products[0].sourceAt, at);
  assert.equal(result.universe.nativeMappings, 1);
  assert.equal(opts.calls.length, 0);
});

test("one unavailable issuer endpoint cannot starve other issuers or native mappings", async (t) => {
  const opts = await setup(t);
  const read = async (path, ...args) => {
    if (path === "/rwas/issuers/list")
      return {
        data: [
          { id: "gone-ecosystem", name: "Gone" },
          { id: "coinbase-ecosystem", name: "Coinbase" },
        ],
        retrievedAt: at,
      };
    if (path.endsWith("/gone-ecosystem"))
      throw Object.assign(new Error("HTTP 404"), { status: 404 });
    return opts.read(path, ...args);
  };
  const scan = createRwaDiscovery({
    ...opts,
    read,
    now: () => Date.parse(at),
    seedPath: null,
  });
  await scan.refresh(base);
  const result = await scan.augment(base, { refresh: false });
  assert.equal(result.universe.issuerCatalogs, 1);
  assert.equal(result.universe.nativeMappings, 1);
  assert.ok(
    result.discoveryCoverage.errors.some((e) => e.message.includes("404")),
  );
});

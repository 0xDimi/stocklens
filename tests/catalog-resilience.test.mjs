import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as catalog from "../server/catalog.mjs";

const at = "2026-10-19T10:00:00.000Z";
const address = (c) => "0x" + c.repeat(40);
const apple = {
  id: "apple-product",
  symbol: "AAPLx",
  isin: "CH0000000001",
  name: "Apple xStock",
  underlying: {
    symbol: "AAPL",
    isin: "US0378331005",
    currency: "USD",
    type: "Equity",
  },
  deployments: [{ network: "Ethereum", address: address("1") }],
};
const discovery = {
  retrievedAt: at,
  registry: [],
  universe: { underlyingAssets: 1 },
  stocks: [
    {
      id: "cg:other",
      rwaId: "other",
      ticker: "OTHER",
      name: "Other company",
      products: [],
      sourceAt: at,
    },
  ],
};
const offline = async () => {
  throw new Error("HTTP 503 issuer unavailable");
};
async function temporary(t) {
  const root = await mkdtemp(join(tmpdir(), "stocklens-catalog-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("a failed refresh and process restart retain exact canonical identities and original observation dates", async (t) => {
  assert.equal(
    typeof catalog.createCatalogLoader,
    "function",
    "catalog must retain last-good verified identities",
  );
  const cacheDir = await temporary(t);
  let fail = false;
  const options = {
    cacheDir,
    seedPath: null,
    now: () => Date.parse(at),
    getXstocks: async () => (fail ? offline() : [apple]),
    getOndo: async () => [],
    getDiscovery: async () => (fail ? offline() : discovery),
  };
  const load = catalog.createCatalogLoader(options);
  const first = await load();
  assert.deepEqual(
    first.stocks.map((s) => s.id),
    ["US0378331005", "cg:other"],
  );
  fail = true;
  const second = await catalog.createCatalogLoader({
    ...options,
    now: () => Date.parse(at) + 3600000,
  })();
  assert.deepEqual(
    second.stocks.map((s) => s.id),
    first.stocks.map((s) => s.id),
  );
  assert.equal(second.stocks[0].products[0].sourceAt, at);
  assert.equal(
    second.stocks[0].products[0].deployments[0].address,
    address("1"),
  );
  assert.ok(second.warnings.some((w) => /retained|snapshot/i.test(w)));
  const source = second.sources.find((s) => s.name === "xStocks public API");
  assert.equal(source.available, false);
  assert.equal(source.stale, true);
  assert.equal(source.retrievedAt, at);
  assert.match(source.error, /503/);
});

async function sourceServer(t, handler) {
  const app = createServer(handler);
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => app.close(resolve)));
  return `http://127.0.0.1:${app.address().port}`;
}

test("xStocks scans a large live-style paginated registry in bounded parallel windows without discarding late pages", async (t) => {
  assert.equal(
    typeof catalog.xStocksCatalog,
    "function",
    "pagination needs complete bounded parallel scans",
  );
  let active = 0,
    maximum = 0;
  const base = await sourceServer(t, (req, res) => {
    const page = Number(
      new URL(req.url, "http://localhost").searchParams.get("page"),
    );
    maximum = Math.max(maximum, ++active);
    setTimeout(() => {
      active--;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          nodes: [{ id: `product-${page}`, symbol: `P${page}x` }],
          page: { currentPage: page, hasNextPage: page < 19 },
        }),
      );
    }, 25);
  });
  const nodes = await catalog.xStocksCatalog({ base, deadlineMs: 2000 });
  assert.equal(nodes.length, 20);
  assert.equal(nodes.at(-1).id, "product-19");
  assert.ok(maximum > 1 && maximum <= 4, `concurrent requests: ${maximum}`);
});

test("a missing middle page never becomes a partial last-good issuer snapshot", async (t) => {
  assert.equal(typeof catalog.xStocksCatalog, "function");
  const base = await sourceServer(t, (req, res) => {
    const page = Number(
      new URL(req.url, "http://localhost").searchParams.get("page"),
    );
    res.setHeader("Content-Type", "application/json");
    if (page === 2) {
      res.writeHead(503);
      res.end("{}");
      return;
    }
    res.end(
      JSON.stringify({
        nodes: [{ id: `product-${page}`, symbol: `P${page}x` }],
        page: { currentPage: page, hasNextPage: page < 3 },
      }),
    );
  });
  await assert.rejects(catalog.xStocksCatalog({ base }), /503/);
});

test("canonical retention never joins two securities by ticker or a same-name product with a different contract", () => {
  assert.equal(typeof catalog.retainCatalogIdentities, "function");
  const stock = (id, contract) => ({
    id,
    ticker: "SAME",
    name: "Same company",
    products: [
      {
        issuer: "xstocks",
        symbol: "SAMEx",
        deployments: [{ chain: "Ethereum", address: contract }],
      },
    ],
  });
  const result = catalog.retainCatalogIdentities(
    [stock("old", address("1"))],
    [stock("new", address("2"))],
    true,
  );
  assert.deepEqual(
    result.map((s) => s.id),
    ["new", "old"],
  );
  assert.equal(result[1].stale, true);
});

test("a cold deployment loads its checksummed source seed and discloses each failed live source", async (t) => {
  const { gzipSync } = await import("node:zlib");
  const { createHash } = await import("node:crypto");
  const { writeFile } = await import("node:fs/promises");
  const root = await temporary(t);
  const original = catalog.createCatalogLoader({
    cacheDir: join(root, "capture"),
    seedPath: null,
    now: () => Date.parse(at),
    getXstocks: async () => [apple],
    getOndo: async () => [],
    getDiscovery: async () => discovery,
  });
  await original();
  const snapshot = JSON.parse(
    await readFile(join(root, "capture", "canonical-catalog-v1.json"), "utf8"),
  );
  const seedPath = join(root, "seed.json.gz");
  await writeFile(
    seedPath,
    gzipSync(
      JSON.stringify({
        snapshot,
        sha256: createHash("sha256")
          .update(JSON.stringify(snapshot))
          .digest("hex"),
      }),
    ),
  );
  const result = await catalog.createCatalogLoader({
    cacheDir: join(root, "restart"),
    seedPath,
    now: () => Date.parse(at) + 3600000,
    getXstocks: offline,
    getOndo: offline,
    getDiscovery: offline,
  })();
  assert.deepEqual(
    result.stocks.map((s) => s.id),
    ["US0378331005", "cg:other"],
  );
  assert.equal(
    result.sources.every(
      (s) => s.stale && !s.available && s.retrievedAt === at,
    ),
    true,
  );
  const corrupted = JSON.parse(
    (await import("node:zlib")).gunzipSync(await readFile(seedPath)),
  );
  corrupted.snapshot.catalog.stocks[0].ticker = "FORGED";
  await writeFile(seedPath, gzipSync(JSON.stringify(corrupted)));
  await assert.rejects(
    catalog.createCatalogLoader({
      cacheDir: join(root, "empty"),
      seedPath,
      now: () => Date.parse(at) + 3600000,
      getXstocks: offline,
      getOndo: offline,
      getDiscovery: offline,
    })(),
    /unavailable/,
  );
});

test("a healthy refresh can remove delisted identities while preserving a corroborated canonical ID", () => {
  const old = {
    id: "US0378331005",
    rwaId: "apple",
    ticker: "AAPL",
    name: "Apple",
    products: [],
  };
  const current = { ...old, id: "cg:apple" };
  const result = catalog.retainCatalogIdentities(
    [old, { ...old, id: "old-delisted", rwaId: "gone" }],
    [current],
    false,
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "US0378331005");
});

test("readiness serves a dated catalog immediately while a slow failed refresh runs once and publishes its result", async (t) => {
  assert.equal(
    typeof catalog.createCachedCatalogLoader,
    "function",
    "cold readiness must not wait for issuer requests",
  );
  const { createApp } = await import("../server.mjs");
  const root = await temporary(t);
  await catalog.createCatalogLoader({
    cacheDir: root,
    seedPath: null,
    now: () => Date.parse(at),
    getXstocks: async () => [apple],
    getOndo: async () => [],
    getDiscovery: async () => discovery,
  })();
  let failSource;
  const held = new Promise((resolve) => {
    failSource = resolve;
  });
  let calls = 0;
  const base = await sourceServer(t, async (req, res) => {
    calls++;
    await held;
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end("{}");
  });
  const getCatalog = catalog.createCachedCatalogLoader({
    cacheDir: root,
    seedPath: null,
    now: () => Date.parse(at) + 3600000,
    getXstocks: () => catalog.xStocksCatalog({ base }),
    getOndo: offline,
    getDiscovery: offline,
  });
  const app = createApp({ getCatalog });
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => app.close(resolve)));
  t.after(() => failSource());
  const origin = `http://127.0.0.1:${app.address().port}`;
  const readiness = await fetch(origin + "/api/ready", {
    signal: AbortSignal.timeout(500),
  });
  assert.equal(readiness.status, 200);
  const initial = await (await fetch(origin + "/api/catalog")).json();
  assert.equal(initial.mode, "cached");
  assert.equal(initial.cachedAt, at);
  assert.equal(initial.fetchedAt, at);
  assert.equal(
    initial.sources.every(
      (s) => s.cached && s.available === null && s.lastKnownAvailable === true,
    ),
    true,
  );
  assert.equal(initial.stocks[0].products[0].sourceAt, at);
  failSource();
  let refreshed;
  for (let i = 0; i < 100; i++) {
    refreshed = await getCatalog();
    if (refreshed.mode !== "cached") break;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(refreshed.mode, "retained");
  assert.equal(
    refreshed.sources.find((s) => s.name === "xStocks public API").available,
    false,
  );
  assert.match(
    refreshed.sources.find((s) => s.name === "xStocks public API").error,
    /503/,
  );
  assert.equal(refreshed.stocks.length, 2);
  const attempted = calls;
  await Promise.all([getCatalog(), getCatalog(), getCatalog()]);
  assert.equal(
    calls,
    attempted,
    "failed refreshes must respect the catalog cooldown",
  );
});

test("official underlying references replace token marketing names and corroborate native RWA by exact product contracts", () => {
  const records = [
    {
      symbol: "SPYx",
      isin: "CH1436219716",
      name: "SP500 xStock",
      underlying: { symbol: "SPY", isin: "US78462F1030", type: null },
      deployments: [
        {
          network: "Ethereum",
          address: "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48",
        },
      ],
    },
    {
      symbol: "QQQx",
      isin: "CH1436219724",
      name: "Nasdaq xStock",
      underlying: { symbol: "QQQ", isin: "US46090E1038", type: null },
      deployments: [
        {
          network: "Ethereum",
          address: "0xa753a7395cae905cd615da0b82a53e0560f250af",
        },
      ],
    },
    {
      symbol: "NVDLx",
      isin: "CH1588665104",
      name: "GraniteShares 2x Long NVDA Daily ETF xStock",
      underlying: { symbol: "NVDL", isin: "US38747R8271", type: null },
      deployments: [
        {
          network: "Ethereum",
          address: "0xbd8ee984ca75475161d38facbec2749276012737",
        },
      ],
    },
  ];
  const stocks = catalog.buildCatalog(records, [], at);
  const spy = stocks.find((stock) => stock.ticker === "SPY");
  const qqq = stocks.find((stock) => stock.ticker === "QQQ");
  const nvdl = stocks.find((stock) => stock.ticker === "NVDL");
  assert.equal(spy.name, "SPDR S&P 500 ETF Trust");
  assert.equal(spy.rwaId, "spdr-s-p-500-etf-trust");
  assert.equal(qqq.name, "Invesco QQQ Trust");
  assert.equal(qqq.rwaId, "invesco-qqq-etf");
  assert.equal(nvdl.category, "ETF");
  assert.equal(
    nvdl.rwaId,
    undefined,
    "a missing native underlying must not be invented",
  );
  assert.equal(spy.id, "US78462F1030");
  assert.equal(spy.products[0].sourceAt, at);
  assert.match(spy.rwaSource.url, /rwas\/spdr-s-p-500-etf-trust/);
  const forged = catalog.buildCatalog(
    [
      {
        ...records[0],
        deployments: [{ network: "Ethereum", address: address("9") }],
      },
    ],
    [],
    at,
  )[0];
  assert.equal(forged.rwaId, undefined);
  assert.equal(forged.name, "SP500");
});

test("consolidating an exactly corroborated native RWA preserves its issuer ISIN and resolves its previous registry URL", async () => {
  const old = {
    id: "US78462F1030",
    rwaId: "spdr-s-p-500-etf-trust",
    ticker: "SPY",
    name: "SPDR S&P 500 ETF Trust",
    products: [],
  };
  const registry = { ...old, id: "cg:spdr-s-p-500-etf-trust" };
  const stocks = catalog.retainCatalogIdentities([old, registry], [old], true);
  assert.equal(stocks[0].id, "US78462F1030");
  assert.ok(stocks[0].aliases.includes("cg:spdr-s-p-500-etf-trust"));
  const resolved = await catalog.resolveStock(
    "cg:spdr-s-p-500-etf-trust",
    false,
    { getCatalog: async () => ({ stocks, warnings: [], fetchedAt: at }) },
  );
  assert.equal(resolved.stock.id, "US78462F1030");
});

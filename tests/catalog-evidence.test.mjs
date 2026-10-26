import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { attachKnownProducts } from "../server/coingecko.mjs";
import {
  mergeIssuerCatalog,
  parseRealityCatalog,
} from "../server/issuer-catalog.mjs";
import { createCatalogLoader } from "../server/catalog.mjs";
import { sourceClient } from "../server/source-client.mjs";
const a = "0x1111111111111111111111111111111111111111",
  b = "0x2222222222222222222222222222222222222222";
const old = "2026-10-24T10:00:00.000Z",
  fresh = "2026-10-26T13:00:00.000Z";
const security = {
  id: "US67066G1040",
  ticker: "NVDA",
  name: "NVIDIA",
  sourceAt: old,
  products: [
    {
      issuer: "reality",
      symbol: "rNVDA",
      coinId: "nvidia-reality",
      sourceAt: old,
      deployments: [
        { chain: "Arbitrum", address: a },
        { chain: "Morph", address: b },
      ],
    },
  ],
};
const official = (at) =>
  parseRealityCatalog(
    {
      code: 200,
      data: [
        {
          isin: security.id,
          ticker: "NVDA",
          title: "NVIDIA",
          status: "active",
          type: "equity",
          tokens: [{ network: "ARB", address: a, symbol: "rNVDA" }],
        },
      ],
    },
    at,
  );
test("one registry coin cannot assign contracts already owned by two different canonical securities", () => {
  const stocks = [
    {
      id: "US0378331005",
      ticker: "AAPL",
      products: [
        {
          issuer: "xstocks",
          symbol: "AAPLx",
          deployments: [{ chain: "Arbitrum", address: a }],
        },
      ],
    },
    {
      id: "US67066G1040",
      ticker: "NVDA",
      products: [
        {
          issuer: "xstocks",
          symbol: "NVDAx",
          deployments: [{ chain: "Ethereum", address: b }],
        },
      ],
    },
  ];
  const result = attachKnownProducts(
    stocks,
    [
      {
        id: "apple-xstock",
        name: "Apple xStock",
        symbol: "aaplx",
        platforms: { "arbitrum-one": a, ethereum: b },
      },
    ],
    fresh,
  );
  assert.equal(result[0].products[0].coinId, undefined);
  assert.equal(result[1].products[0].coinId, undefined);
  assert.equal(result[0].products[0].deployments.length, 1);
  assert.equal(result[1].products[0].deployments.length, 1);
});
test("fresh issuer identity preserves the older dates of an independent market ID and registry-only deployment", () => {
  const merged = mergeIssuerCatalog([security], official(fresh)).stocks[0]
    .products[0];
  assert.equal(merged.sourceAt, fresh);
  assert.equal(merged.coinIdSourceAt, old);
  assert.equal(
    merged.deployments.find((d) => d.chain === "Morph").sourceAt,
    old,
  );
});
test("fresh Reality evidence cannot keep an expired registry-only deployment or market mapping alive", async (t) => {
  const cacheDir = await mkdtemp(join(tmpdir(), "stocklens-evidence-"));
  t.after(() => rm(cacheDir, { recursive: true, force: true }));
  const now = Date.parse(old) + 4 * 86400000;
  const raw = {
    code: 200,
    data: [
      {
        isin: security.id,
        ticker: "NVDA",
        title: "NVIDIA",
        status: "active",
        type: "equity",
        tokens: [{ network: "ARB", address: a, symbol: "rNVDA" }],
      },
    ],
  };
  const result = await createCatalogLoader({
    cacheDir,
    seedPath: null,
    now: () => now,
    getXstocks: async () => [],
    getOndo: async () => [],
    getReality: async () => raw,
    getDiscovery: async () => ({
      stocks: [security],
      registry: [],
      retrievedAt: new Date(now).toISOString(),
    }),
  })();
  const p = result.stocks[0].products[0];
  assert.equal(p.coinId, undefined);
  assert.deepEqual(
    p.deployments.map((d) => d.chain),
    ["Arbitrum"],
  );
});
test("a background catalog can await an actual refreshed observation rather than receiving stale-while-revalidate data", async (t) => {
  let count = 0;
  const app = createServer((req, res) => {
    const body = { value: ++count };
    setTimeout(() => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(body));
    }, 10);
  });
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => app.close(resolve)));
  const read = sourceClient(
    "catalog-refresh-test",
    () => `http://127.0.0.1:${app.address().port}`,
    0,
    () => ({}),
    { staleWhileRevalidate: true },
  );
  const first = await read("/issuer", 0);
  assert.equal(first.data.value, 1);
  const second = await read("/issuer", 0, { waitForFresh: true });
  assert.equal(second.data.value, 2);
  assert.equal(second.stale, false);
});

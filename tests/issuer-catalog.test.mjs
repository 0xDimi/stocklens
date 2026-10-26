import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as issuer from "../server/issuer-catalog.mjs";
import { createCatalogLoader } from "../server/catalog.mjs";
const at = "2026-10-26T13:00:00.000Z";
const nvda = {
  title: "Nvidia",
  ticker: "NVDA",
  isin: "US67066G1040",
  status: "active",
  type: "equity",
  tokens: [
    {
      network: "ARB",
      address: "0x1111111111111111111111111111111111111111",
      symbol: "rNVDA",
      decimals: 18,
    },
  ],
};
const apple = {
  ...nvda,
  title: "Apple",
  ticker: "AAPL",
  isin: "US0378331005",
  tokens: [
    {
      ...nvda.tokens[0],
      address: "0x2222222222222222222222222222222222222222",
      symbol: "rAAPL",
    },
  ],
};
const parse = (rows) =>
  issuer.parseRealityCatalog({ code: 200, data: rows }, at);

test("Reality admits active identified stocks and ETFs while holding incomplete identities outside comparison", () => {
  const parsed = parse([
    nvda,
    { ...apple, type: "etf" },
    { ...apple, status: "inactive" },
    { ...apple, type: "bond" },
    {
      ...apple,
      isin: "",
      tokens: [
        {
          ...apple.tokens[0],
          address: "0x3333333333333333333333333333333333333333",
        },
      ],
    },
    {
      ...apple,
      isin: "US0378331006",
      tokens: [
        {
          ...apple.tokens[0],
          address: "0x4444444444444444444444444444444444444444",
        },
      ],
    },
  ]);
  assert.deepEqual(
    parsed.stocks.map((s) => [s.id, s.category]),
    [
      ["US67066G1040", "Stock"],
      ["US0378331005", "ETF"],
    ],
  );
  assert.equal(parsed.pendingProducts.length, 2);
  assert.equal(parsed.stocks[0].products[0].sourceAt, at);
  assert.equal(
    parsed.stocks[0].products[0].conversion,
    undefined,
    "discovery cannot assume one token equals one share",
  );
  assert.equal(parsed.stocks[0].products[0].deployments[0].chain, "Arbitrum");
});

test("Reality rejects malformed envelopes, unsupported networks, conflicting contracts and invalid addresses", () => {
  assert.throws(
    () => issuer.parseRealityCatalog({ code: 500, data: [nvda] }, at),
    /Reality/,
  );
  assert.throws(
    () => issuer.parseRealityCatalog({ code: 200, data: {} }, at),
    /Reality/,
  );
  assert.equal(
    parse([{ ...nvda, tokens: [{ ...nvda.tokens[0], network: "unknown" }] }])
      .stocks.length,
    0,
  );
  assert.equal(
    parse([{ ...nvda, tokens: [{ ...nvda.tokens[0], address: "NVDA" }] }])
      .stocks.length,
    0,
  );
  const conflict = parse([nvda, { ...apple, tokens: nvda.tokens }]);
  assert.equal(
    conflict.stocks.length,
    0,
    "a contract claimed for two securities cannot be trusted",
  );
  assert.equal(conflict.pendingProducts.length, 2);
});

test("official ISIN and exact-contract joins consolidate registry URLs without ticker-only merging", () => {
  const existing = [
    {
      id: "cg:nvidia",
      rwaId: "nvidia",
      ticker: "NVDA",
      name: "NVIDIA Corporation",
      category: "Stock",
      products: [
        {
          issuer: "reality",
          symbol: "RNVDA",
          coinId: "nvidia-reality",
          sourceAt: at,
          deployments: [{ chain: "Arbitrum", address: nvda.tokens[0].address }],
        },
      ],
    },
    {
      id: "cg:unrelated",
      ticker: "AAPL",
      name: "Unrelated security",
      products: [],
    },
  ];
  const before = structuredClone(existing);
  const result = issuer.mergeIssuerCatalog(existing, parse([nvda, apple]));
  assert.equal(result.stocks.length, 3);
  const stock = result.stocks.find((s) => s.id === nvda.isin);
  assert.ok(stock.aliases.includes("cg:nvidia"));
  assert.equal(stock.rwaId, "nvidia");
  assert.equal(stock.products.length, 1);
  assert.equal(stock.products[0].coinId, "nvidia-reality");
  assert.match(stock.products[0].source, /realityfinance/);
  assert.deepEqual(existing, before);
});

test("conflicting official ISINs or tickers are held without reassigning an existing contract", () => {
  const old = parse([nvda]).stocks;
  const result = issuer.mergeIssuerCatalog(
    old,
    parse([{ ...apple, tokens: nvda.tokens }]),
  );
  assert.equal(result.stocks.length, 1);
  assert.equal(result.stocks[0].id, nvda.isin);
  assert.equal(result.pendingProducts.length, 1);
  const mismatch = issuer.mergeIssuerCatalog(
    old,
    parse([{ ...nvda, ticker: "NVDS" }]),
  );
  assert.equal(mismatch.stocks[0].ticker, "NVDA");
  assert.equal(mismatch.pendingProducts.length, 1);
});

test("ISIN join adds an issuer version once and corrects a generic category without erasing an existing product", () => {
  const old = [
    {
      id: nvda.isin,
      ticker: "NVDA",
      name: "NVIDIA",
      category: "Listed security",
      products: [
        {
          issuer: "xstocks",
          symbol: "NVDAx",
          deployments: [
            { chain: "Ethereum", address: apple.tokens[0].address },
          ],
        },
      ],
    },
  ];
  const first = issuer.mergeIssuerCatalog(old, parse([nvda]));
  const second = issuer.mergeIssuerCatalog(first.stocks, parse([nvda]));
  assert.equal(second.stocks.length, 1);
  assert.equal(second.stocks[0].category, "Stock");
  assert.equal(second.stocks[0].products.length, 2);
});

test("Reality alone can establish catalog readiness and survives a failed refresh with original dates", async (t) => {
  const cacheDir = await mkdtemp(join(tmpdir(), "stocklens-reality-"));
  t.after(() => rm(cacheDir, { recursive: true, force: true }));
  const offline = async () => {
    throw new Error("source unavailable");
  };
  const options = {
    cacheDir,
    seedPath: null,
    now: () => Date.parse(at),
    getXstocks: offline,
    getOndo: offline,
    getDiscovery: offline,
    getReality: async () => ({ code: 200, data: [nvda] }),
  };
  const first = await createCatalogLoader(options)();
  assert.equal(first.stocks[0].id, nvda.isin);
  const second = await createCatalogLoader({
    ...options,
    now: () => Date.parse(at) + 3600000,
    getReality: offline,
  })();
  assert.equal(second.stocks[0].products[0].sourceAt, at);
  const source = second.sources.find(
    (s) => s.name === "Reality public catalog",
  );
  assert.equal(source.stale, true);
  assert.equal(source.retrievedAt, at);
});

test("actual Reality public response preserves all three observed security identities", async () => {
  const { readFile } = await import("node:fs/promises");
  const body = JSON.parse(
    await readFile(new URL("./fixtures/reality-catalog.json", import.meta.url)),
  );
  assert.deepEqual(
    issuer.parseRealityCatalog(body, at).stocks.map((s) => s.id),
    ["US88160R1014", "US67066G1040", "US0378331005"],
  );
});

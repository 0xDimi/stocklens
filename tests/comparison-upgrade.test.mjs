import test from "node:test";
import assert from "node:assert/strict";
import { discoverProducts, parseRwaTokens } from "../server/coingecko.mjs";
import { coverageSummary } from "../server/coverage.mjs";
import { safeLogo, logo } from "../src/brands.mjs";
import { selectMarketRows, premium } from "../src/market-model.mjs";

const address = "0x" + "1".repeat(40);
test("underlying registry assets remain searchable before their token mapping is loaded", () => {
  const rows = discoverProducts(
    [
      {
        id: "new-stock",
        symbol: "NEW",
        name: "New Stock",
        asset_type: "stock",
      },
    ],
    [],
    "now",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].products.length, 0);
});
test("native grouping can include explicitly marked wrappers without inheriting share normalization", () => {
  const rows = parseRwaTokens(
    {
      id: "nvidia",
      symbol: "nvda",
      tokens: [
        {
          id: "wrapped-nvidia-xstock",
          name: "Wrapped NVIDIA xStock",
          symbol: "wnvdax",
          issuer_details: { id: "xstocks-ecosystem", name: "xStocks" },
          platforms: { ethereum: address, unknownnet: address },
        },
      ],
    },
    { rwaId: "nvidia", ticker: "NVDA" },
    { includeWrapped: true },
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].wrapped, true);
  assert.deepEqual(rows[0].unmappedPlatforms, ["unknownnet"]);
});
test("coverage reports observed deployments, pending discovery, legal-review gaps and unsupported quotes independently", () => {
  const c = coverageSummary([
    {
      id: "a",
      products: [
        {
          issuer: "xstocks",
          deployments: [
            { chain: "Solana", address: "mint" },
            { chain: "Robinhood", address },
          ],
        },
      ],
    },
    { id: "b", products: [] },
  ]);
  assert.equal(c.assets, 2);
  assert.equal(c.versions, 1);
  assert.equal(c.deployments, 2);
  assert.equal(c.pendingAssets, 1);
  assert.equal(c.quoteNetworks, 1);
  assert.equal(c.issuers[0].versions, 1);
});
test("logos only load reviewed image hosts or local assets and keep escaped readable fallbacks", () => {
  assert.equal(safeLogo("https://evil.example/x.png"), null);
  assert.equal(safeLogo("javascript:alert(1)"), null);
  assert.equal(
    safeLogo("https://coin-images.coingecko.com/coins/images/1/large/x.png"),
    "https://coin-images.coingecko.com/coins/images/1/large/x.png",
  );
  assert.ok(
    logo({ name: "<NVIDIA>", url: "https://evil.example/x.png" }).includes(
      "&lt;",
    ),
  );
  assert.ok(
    !logo({ name: "NVIDIA", url: "https://evil.example/x.png" }).includes(
      "evil.example",
    ),
  );
});
test("market sorting keeps missing observations last, search matches token symbols, and saved filters share canonical IDs", () => {
  const rows = [
    {
      id: "a",
      ticker: "NVDA",
      name: "NVIDIA",
      category: "Stock",
      products: [{ symbol: "NVDAx" }],
      market: { volume24h: 10, change24h: 2 },
    },
    {
      id: "b",
      ticker: "NEW",
      name: "New",
      category: "Stock",
      products: [],
      market: null,
    },
  ];
  assert.deepEqual(
    selectMarketRows(rows, { sort: "gainers" }).map((r) => r.id),
    ["a", "b"],
  );
  assert.equal(selectMarketRows(rows, { query: "nvdax" })[0].id, "a");
  assert.equal(
    selectMarketRows(rows, { savedOnly: true, saved: new Set(["b"]) })[0].id,
    "b",
  );
});
test("premium requires verified comparable shares, USD prices, and fresh aligned timestamps", () => {
  const now = Date.now();
  const observation = {
    price: 110,
    sharesPerToken: 1,
    conversionVerified: true,
    currency: "USD",
    at: now,
  };
  const benchmark = { price: 100, currency: "USD", at: now };
  assert.ok(Math.abs(premium(observation, benchmark, now) - 10) < 1e-8);
  assert.equal(
    premium({ ...observation, conversionVerified: false }, benchmark, now),
    null,
  );
  assert.equal(
    premium(observation, { ...benchmark, at: now - 86400000 }, now),
    null,
  );
  assert.equal(
    premium(observation, { ...benchmark, currency: "EUR" }, now),
    null,
  );
});

test("listed references require corroborated names and preserve market times and unavailable P/E", async () => {
  const { parseFundamentals, easternTime } =
    await import("../server/fundamentals.mjs");
  const stock = {
    id: "security",
    ticker: "NVDA",
    name: "NVIDIA",
    category: "Stock",
  };
  const info = {
    data: {
      symbol: "NVDA",
      companyName: "NVIDIA Corporation Common Stock",
      primaryData: {
        lastSalePrice: "$216.79",
        lastTradeTimestamp: "Oct 19, 2026 5:42 AM ET",
      },
      marketStatus: "Pre-Market",
    },
  };
  const result = parseFundamentals(
    info,
    {
      data: {
        symbol: "NVDA",
        summaryData: { MarketCap: { value: "5,226,487,470,000" } },
      },
    },
    stock,
    "now",
  );
  assert.equal(result.marketCap, 5226487470000);
  assert.equal(result.pe, null);
  assert.equal(result.at, Date.parse("2026-10-19T09:42:00Z"));
  assert.throws(() =>
    parseFundamentals(
      info,
      null,
      { ...stock, name: "Unrelated Company" },
      "now",
    ),
  );
  assert.equal(easternTime("Bad timestamp"), null);
});

test("Ondo contracts can be added independently without assigning an uncorroborated ISIN to a saved asset", async () => {
  const { attachOndoCatalog } = await import("../server/catalog.mjs");
  const stocks = [
    {
      id: "cg:citigroup",
      rwaId: "citigroup",
      ticker: "C",
      name: "Citigroup",
      products: [
        {
          issuer: "ondo",
          coinId: "citigroup-ondo-tokenized-stock",
          symbol: "Con",
          deployments: [{ chain: "Ethereum", address }],
        },
      ],
    },
  ];
  const result = attachOndoCatalog(
    stocks,
    [
      {
        Type: "Stock",
        ISIN: "US19260Q1076",
        "Stock Ticker": "C",
        "CoinGecko API ID": "citigroup-ondo-tokenized-stock",
        "Ethereum Deployed Address": address,
        "HyperEVM Deployed Address": "0x" + "2".repeat(40),
      },
    ],
    "now",
  );
  assert.equal(result[0].id, "cg:citigroup");
  assert.equal(result[0].products[0].deployments.length, 2);
  assert.equal(result[0].products[0].reportedUnderlyingIsin, "US19260Q1076");
});
test("native issuer corrections replace an inferred issuer for the exact token rather than duplicating a version", async () => {
  const { mergeDiscovery } = await import("../server/coingecko.mjs");
  const base = {
    id: "cg:company",
    rwaId: "company",
    ticker: "ABC",
    name: "Company",
    products: [
      {
        coinId: "same-token",
        symbol: "RABC",
        issuer: "rstock",
        deployments: [{ chain: "Base", address }],
      },
    ],
  };
  const result = mergeDiscovery(
    [base],
    [
      {
        ...base,
        products: [
          {
            ...base.products[0],
            issuer: "reality",
            mapping: "CoinGecko RWA grouping",
          },
        ],
      },
    ],
  );
  assert.equal(result[0].products.length, 1);
  assert.equal(result[0].products[0].issuer, "reality");
});

test("company references remain retryable after missing, stale or expired observations", async () => {
  const { needsReference } = await import("../src/market-model.mjs");
  const now = Date.now();
  assert.equal(needsReference(null, now), true);
  assert.equal(
    needsReference({ retrievedAt: new Date(now).toISOString() }, now),
    false,
  );
  assert.equal(
    needsReference({ retrievedAt: new Date(now - 600000).toISOString() }, now),
    true,
  );
  assert.equal(
    needsReference(
      { retrievedAt: new Date(now).toISOString(), stale: true },
      now,
    ),
    true,
  );
});

test("ST0x wtStock wrappers are classified by issuer and documented form, not only an English name prefix", async () => {
  const { isWrappedProduct } = await import("../server/coingecko.mjs");
  assert.equal(
    isWrappedProduct({
      issuer: "st0x",
      symbol: "WTNVDA",
      name: "NVIDIA (ST0x Tokenized Stock)",
    }),
    true,
  );
  assert.equal(
    isWrappedProduct({ issuer: "other", symbol: "WTNVDA", name: "NVIDIA" }),
    false,
  );
});

test("held-back issuer records remain inspectable without becoming canonical comparison products", async () => {
  const { pendingIssuerRecords } = await import("../server/catalog.mjs");
  const result = pendingIssuerRecords(
    [
      {
        Symbol: "Con",
        "Stock Ticker": "C",
        "Stock Name": "Citigroup",
        ISIN: "US19260Q1076",
        "Ethereum Deployed Address": address,
        "Solana Deployed Address": "not-an-address",
      },
    ],
    [{ symbol: "Con", ticker: "C", isin: "US19260Q1076" }],
    "now",
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].deployments.length, 1);
  assert.equal(result[0].claimedUnderlying.ticker, "C");
  assert.match(result[0].reason, /not corroborated/);
});

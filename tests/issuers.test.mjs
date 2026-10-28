import test from "node:test";
import assert from "node:assert/strict";
import {
  buildIssuerLandscape,
  issuerAssetRows,
  selectIssuerAssets,
  createIssuerDesk,
} from "../server/issuers.mjs";

const now = Date.parse("2026-10-28T12:00:00Z");
const product = (issuer, coinId, extra = {}) => ({
  issuer,
  coinId,
  symbol: coinId,
  deployments: [
    { chain: "Ethereum", address: "0x1" },
    { chain: "Solana", address: "mint" },
  ],
  ...extra,
});

test("issuer refresh work coalesces across visits and does not refetch a fresh report", async () => {
  const requested = [],
    pending = [];
  const desk = createIssuerDesk({
    getCatalog: async () => catalog,
    getReports: async () => [reports[0]],
    now: () => now,
    request: (path) =>
      new Promise((resolve) => {
        requested.push(path);
        pending.push(resolve);
      }),
  });
  const first = await desk.landscape();
  const second = await desk.landscape();
  assert.equal(first.refreshing, true);
  assert.equal(second.totals.reportingIssuers, 1);
  assert.deepEqual(requested, ["/rwas/issuers/ondo-tokenized-assets"]);
  pending[0](reports[1]);
  await new Promise(setImmediate);
  const third = await desk.landscape();
  assert.equal(third.refreshing, false);
  assert.equal(third.totals.reportingIssuers, 2);
  assert.equal(requested.length, 1);
});

test("issuer asset API validates queries before market I/O and fetches one bounded canonical page", async () => {
  const calls = [];
  const desk = createIssuerDesk({
    getCatalog: async () => catalog,
    getReports: async () => reports,
    now: () => now,
    getMarkets: async (ids) => {
      calls.push(ids);
      return { rows: [], retrievedAt: null };
    },
  });
  for (const query of [
    "issuer=ondo&page=0",
    "issuer=not-an-issuer",
    "issuer=ondo&q=" + "a".repeat(81),
    "issuer=ondo&chain=unmapped",
    "issuer=ondo&type=Crypto",
  ])
    await assert.rejects(desk.assets(new URLSearchParams(query)), {
      status: 400,
    });
  assert.equal(calls.length, 0);
  const result = await desk.assets(new URLSearchParams("issuer=ondo&q=NVDA"));
  assert.deepEqual(calls, [["nvda-on"]]);
  assert.equal(result.total, 1);
  assert.equal(result.rows[0].id, catalog.stocks[0].id);
  assert.equal(result.rows[0].marketCap, null);
});

test("an issuer source outage retains dated reports and backs off instead of fanning out", async () => {
  let requests = 0;
  const desk = createIssuerDesk({
    getCatalog: async () => catalog,
    getReports: async () => [],
    now: () => now,
    request: async () => {
      requests++;
      throw Object.assign(new Error("rate limited"), { status: 429 });
    },
  });
  await desk.landscape();
  await new Promise(setImmediate);
  const result = await desk.landscape();
  assert.equal(requests, 1);
  assert.equal(result.issuers.length, 3);
  assert.equal(result.totals.marketCap, null);
  assert.ok(result.refreshWarning);
  assert.equal(Date.parse(result.retryAt), now + 3600000);
});
test("an unsupported issuer market feed remains missing without reporting a whole-page outage", async () => {
  const scoped = {
    ...catalog,
    stocks: [{ ...catalog.stocks[0], products: [product("stove", "token")] }],
  };
  const desk = createIssuerDesk({
    getCatalog: async () => scoped,
    getReports: async () => [],
    now: () => now,
    request: async () => {
      throw Object.assign(new Error("not found"), { status: 404 });
    },
  });
  await desk.landscape();
  await new Promise(setImmediate);
  const result = await desk.landscape();
  assert.equal(result.issuers[0].market, null);
  assert.equal(result.totals.reportingIssuers, 0);
  assert.equal(result.refreshWarning, null);
});
const catalog = {
  fetchedAt: new Date(now).toISOString(),
  stocks: [
    {
      id: "US67066G1040",
      ticker: "NVDA",
      name: "NVIDIA",
      category: "Stock",
      products: [
        product("xstocks", "nvda-x"),
        product("xstocks", "nvda-x"),
        product("ondo", "nvda-on"),
        product("xstocks", "wrapped-nvda", { wrapped: true }),
      ],
    },
    {
      id: "fund",
      ticker: "SPY",
      name: "S&P 500",
      category: "ETF",
      products: [product("ondo", "spy-on"), product("rstock", "spy-r")],
    },
  ],
};
const report = (id, cap, change = 10) => ({
  data: {
    id,
    name: id,
    market_cap: cap,
    market_cap_change_24h: change,
    volume_24h: 50,
    updated_at: "2026-10-28T11:00:00Z",
    tokens: [{ id: "one" }, { id: "two" }],
  },
  retrievedAt: "2026-10-28T11:01:00Z",
});
const reports = [
  report("xstocks-ecosystem", 100),
  report("ondo-tokenized-assets", 300),
];
test("a newly source-identified issuer enters the landscape without a hardcoded family limit", () => {
  const newer = {
    ...catalog,
    stocks: [
      { ...catalog.stocks[0], products: [product("new-equity", "new-token")] },
    ],
  };
  const result = buildIssuerLandscape(
    newer,
    [report("new-equity-ecosystem", 50)],
    now,
  );
  assert.equal(result.totals.marketCap, 50);
  assert.equal(result.issuers[0].market.share, 100);
});

test("unclassified and wrapped-only securities have explicit coverage and can be browsed without being called native stocks", () => {
  const expanded = {
    ...catalog,
    stocks: [
      ...catalog.stocks,
      {
        id: "unclassified",
        ticker: "OTHER",
        name: "Other security",
        category: "Listed security",
        products: [product("xstocks", "other-x")],
      },
      {
        id: "wrapped-only",
        ticker: "WRAP",
        name: "Wrapped",
        category: "Stock",
        products: [product("st0x", "wrapped-stock", { wrapped: true })],
      },
    ],
  };
  const result = buildIssuerLandscape(expanded, reports, now);
  assert.equal(result.issuers.find((r) => r.id === "xstocks").unclassified, 1);
  assert.equal(result.issuers.find((r) => r.id === "st0x").nativeAssetCount, 0);
  assert.equal(
    result.issuers.find((r) => r.id === "st0x").wrappedAssetCount,
    1,
  );
  assert.equal(
    selectIssuerAssets(expanded, { issuer: "xstocks", type: "Unclassified" })
      .length,
    1,
  );
  assert.equal(
    selectIssuerAssets(expanded, { issuer: "st0x", includeWrapped: true })
      .length,
    1,
  );
});

test("an invalid financial refresh and newer invalid discovery report cannot replace the last usable report", async () => {
  const prior = {
    ...reports[0],
    retrievedAt: "2026-10-28T04:00:00Z",
    data: { ...reports[0].data, updated_at: "2026-10-28T04:00:00Z" },
  };
  const invalid = {
    ...reports[0],
    retrievedAt: new Date(now).toISOString(),
    data: { ...reports[0].data, updated_at: null },
  };
  let snapshots = [prior, reports[1]];
  const desk = createIssuerDesk({
    getCatalog: async () => catalog,
    getReports: async () => snapshots,
    now: () => now,
    request: async () => invalid,
  });
  assert.equal(
    (await desk.landscape()).issuers.find((r) => r.id === "xstocks").market
      .marketCap,
    100,
  );
  await new Promise(setImmediate);
  snapshots = [invalid, reports[1]];
  const result = await desk.landscape();
  assert.equal(
    result.issuers.find((r) => r.id === "xstocks").market.marketCap,
    100,
  );
  assert.ok(result.refreshWarning);
  assert.equal(
    result.issuers.find((r) => r.id === "xstocks").market.retrievedAt,
    prior.retrievedAt,
  );
});

test("issuer accounting counts each token once across chains and excludes wrappers from native counts", () => {
  const result = buildIssuerLandscape(catalog, reports, now);
  const x = result.issuers.find((r) => r.id === "xstocks");
  assert.equal(x.nativeProducts, 1);
  assert.equal(x.wrappedProducts, 1);
  assert.equal(x.assetCount, 1);
  assert.equal(x.networks.length, 2);
  assert.equal(
    result.totals.assetCount,
    2,
    "overlapping issuers do not multiply underlying assets",
  );
  assert.equal(
    result.totals.marketCap,
    400,
    "never multiply issuer cap by network or product count",
  );
  assert.equal(x.market.share, 25);
  assert.equal(result.issuers.find((r) => r.id === "ondo").market.share, 75);
  assert.equal(result.totals.reportingIssuers, 2);
  assert.equal(
    result.issuers.length,
    3,
    "unreported issuers stay discoverable",
  );
  assert.equal(result.issuers.find((r) => r.id === "rstock").market, null);
});
test("source cap change is dollars; percent uses the previous cap and is not a token price change", () => {
  const row = buildIssuerLandscape(catalog, reports, now).issuers.find(
    (r) => r.id === "xstocks",
  );
  assert.equal(row.market.capChange24h, 10);
  assert.ok(Math.abs(row.market.capChangePercent24h - 100 / 9) < 1e-9);
  assert.equal(row.market.turnover24h, 50);
  assert.equal(row.market.sourceAt, "2026-10-28T11:00:00Z");
});
test("invalid, future, expired and unknown-issuer reports cannot enter totals or the share denominator", () => {
  for (const broken of [
    { ...reports[0], data: { ...reports[0].data, updated_at: null } },
    {
      ...reports[0],
      data: { ...reports[0].data, updated_at: "2026-10-29T12:00:00Z" },
    },
    { ...reports[0], retrievedAt: "2026-10-24T00:00:00Z" },
    { ...reports[0], data: { ...reports[0].data, market_cap: null } },
  ]) {
    const result = buildIssuerLandscape(
      catalog,
      [broken, report("paxos-ecosystem", 10000000)],
      now,
    );
    assert.equal(result.totals.marketCap, null);
    assert.equal(result.totals.reportingIssuers, 0);
    assert.ok(result.issuers.every((r) => r.market?.share == null));
  }
});
test("retained reports keep source dates and are marked older; malformed numbers remain missing", () => {
  const result = buildIssuerLandscape(
    catalog,
    [
      {
        ...reports[0],
        data: {
          ...reports[0].data,
          market_cap: 0,
          volume_24h: false,
          market_cap_change_24h: "",
        },
        retrievedAt: "2026-10-28T01:00:00Z",
      },
    ],
    now,
  );
  const market = result.issuers.find((r) => r.id === "xstocks").market;
  assert.equal(market.marketCap, 0);
  assert.equal(market.volume24h, null);
  assert.equal(market.capChange24h, null);
  assert.equal(
    market.share,
    null,
    "a zero-sized denominator cannot establish shares",
  );
  assert.equal(market.stale, true);
  assert.equal(market.sourceAt, "2026-10-28T11:00:00Z");
});
test("issuer products use canonical assets, exclude wrappers by default and filter the requested issuer/network together", () => {
  const rows = selectIssuerAssets(catalog, {
    issuer: "ondo",
    query: "nvda",
    chain: "Ethereum",
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].products.length, 1);
  assert.equal(rows[0].products[0].issuer, "ondo");
  assert.equal(
    selectIssuerAssets(catalog, { issuer: "xstocks" })[0].products.length,
    1,
  );
  assert.equal(
    selectIssuerAssets(catalog, { issuer: "ondo", type: "ETF" }).length,
    1,
  );
  assert.equal(
    selectIssuerAssets(catalog, { issuer: "xstocks", chain: "Base" }).length,
    0,
  );
});
test("asset financial rows join exact coin IDs once and never turn missing or partial observations into complete totals", () => {
  const selected = selectIssuerAssets(catalog, { issuer: "ondo" });
  const rows = issuerAssetRows(selected, [
    {
      coinId: "nvda-on",
      price: 100,
      marketCap: 200,
      volume24h: null,
      updatedAt: "2026-10-28T11:00:00Z",
    },
    { coinId: "nvda-x", marketCap: 99999, volume24h: 999 },
  ]);
  assert.equal(rows.find((r) => r.ticker === "NVDA").marketCap, 200);
  assert.equal(rows.find((r) => r.ticker === "NVDA").volume24h, null);
  assert.equal(rows.find((r) => r.ticker === "SPY").marketCap, null);
  assert.equal(
    rows.find((r) => r.ticker === "NVDA").products[0].market.price,
    100,
  );
});

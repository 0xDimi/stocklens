import test from "node:test";
import assert from "node:assert/strict";
import * as model from "../src/market-model.mjs";

const now = 1_000_000;
const stock = {
  id: "a",
  ticker: "A",
  name: "Asset",
  products: [
    { issuer: "issuer-a", deployments: [{ chain: "Solana", address: "mint" }] },
    {
      issuer: "issuer-b",
      deployments: [{ chain: "Ethereum", address: "0x1" }],
    },
  ],
};
const chains = [
  { id: "Solana", quotable: true },
  { id: "Ethereum", quotable: false },
];
const spot = {
  chain: "Solana",
  issuer: "issuer-a",
  sharesPerToken: 1.2,
  conversionVerified: true,
  conversionSource: "https://issuer.test/units",
  source: "https://pool.test/price",
  at: now,
  retrievedAt: new Date(now).toISOString(),
};

test("supported network coverage does not imply liquidity or verified conversion", () => {
  const readiness = model.marketReadiness(stock, { chains, now });
  assert.deepEqual(readiness.quoteNetworks, ["Solana"]);
  assert.equal(readiness.conversion, "unchecked");
  assert.equal(
    model.marketReadiness(stock, { chains, issuer: "issuer-b", now })
      .quoteNetworks.length,
    0,
  );
});

test("verified conversion requires current sourced observed units and respects selected scope", () => {
  const detail = { status: "ready", spot };
  assert.equal(
    model.marketReadiness(stock, { chains, detail, now }).conversion,
    "verified",
  );
  for (const change of [
    { conversionSource: null },
    { sharesPerToken: null },
    { conversionVerified: false },
  ])
    assert.equal(
      model.marketReadiness(stock, {
        chains,
        detail: { ...detail, spot: { ...spot, ...change } },
        now,
      }).conversion,
      "not-verified",
    );
  assert.equal(
    model.marketReadiness(stock, { chains, detail, chain: "Ethereum", now })
      .conversion,
    "not-verified",
  );
  assert.equal(
    model.marketReadiness(stock, { chains, detail, now: now + 300001 })
      .conversion,
    "expired",
  );
  assert.equal(
    model.marketReadiness(stock, { chains, detail: { status: "error" }, now })
      .conversion,
    "unavailable",
  );
});

test("actual quote snapshots can verify units without a listed-stock reference", () => {
  const quotes = {
    rows: [
      {
        ...spot,
        status: "quoted",
        fetchedAt: now,
        expiresAt: now + 30000,
        equivalentShares: 2.4,
        quoteSource: "https://quote.test/route",
      },
    ],
  };
  assert.equal(
    model.marketReadiness(stock, { chains, quotes, now }).conversion,
    "verified",
  );
  assert.equal(
    model.marketReadiness(stock, { chains, quotes, now: now + 30000 })
      .conversion,
    "expired",
  );
  assert.equal(
    model.marketReadiness(stock, {
      chains,
      quotes: { rows: [{ ...quotes.rows[0], expiresAt: null }] },
      now,
    }).conversion,
    "not-verified",
  );
});

test("a sourced normalized buy observation verifies conversion without a listed reference or pool", () => {
  const buyObservation = { ...spot, priceAt: now, expiresAt: now + 30000, budgetUsd: 1000 };
  const state = (changes = {}, scope = {}) => model.marketReadiness(stock, {
    chains, now, detail: { status: "ready", buyObservation: { ...buyObservation, ...changes } }, ...scope,
  }).conversion;
  assert.equal(state(), "verified");
  assert.equal(state({}, { issuer: "issuer-b" }), "not-verified");
  assert.equal(state({}, { chain: "Ethereum" }), "not-verified");
  assert.equal(state({ priceAt: now - 300001, expiresAt: now + 30000 }), "expired");
  assert.equal(state({ expiresAt: now }), "expired");
  for (const changes of [{ conversionVerified: false }, { conversionVerified: undefined },
    { sharesPerToken: 0 }, { conversionSource: null }, { source: "http://untrusted.test" },
    { priceAt: null }, { priceAt: now + 1 }, { expiresAt: null }]) assert.equal(state(changes), "not-verified");
});

test("issuer and network filters refer to the same product deployment", () => {
  assert.equal(
    model.selectMarketRows([stock], { chain: "Ethereum", issuer: "issuer-a" })
      .length,
    0,
  );
  assert.equal(
    model.selectMarketRows([stock], { chain: "Solana", issuer: "issuer-a" })
      .length,
    1,
  );
  assert.equal(model.selectMarketRows([{ ...stock, products: [] }]).length, 1);
});

test("readiness filtering excludes unchecked and failed assets without calling them unverified", () => {
  const rows = [stock, { ...stock, id: "b" }, { ...stock, id: "c" }];
  const getReadiness = (row) => ({
    quoteNetworks: ["Solana"],
    conversion:
      row.id === "a"
        ? "verified"
        : row.id === "b"
          ? "not-verified"
          : "unavailable",
  });
  assert.deepEqual(
    model
      .selectMarketRows(rows, { conversion: "verified", getReadiness })
      .map((r) => r.id),
    ["a"],
  );
  assert.deepEqual(
    model
      .selectMarketRows(rows, { conversion: "not-verified", getReadiness })
      .map((r) => r.id),
    ["b"],
  );
});

test("column preferences keep identity fixed and recover safely from old or corrupt storage", () => {
  assert.deepEqual(
    model.normalizeMarketColumns(null),
    model.DEFAULT_MARKET_COLUMNS,
  );
  assert.deepEqual(
    model.normalizeMarketColumns(["pe", "stock", "pe", "removed"]),
    ["stock", "pe"],
  );
  assert.deepEqual(
    model.normalizeMarketColumns([]),
    model.DEFAULT_MARKET_COLUMNS,
  );
});

test("ingesting shared details is silent and retains original observation clocks", () => {
  let changes = 0;
  const loader = model.createMarketDetailsLoader({
    fetchDetails: async () => ({ rows: [] }),
    onChange: () => changes++,
    now: () => now + 20000,
  });
  const row = {
    status: "ready",
    retrievedAt: new Date(now).toISOString(),
    spot,
    reference: {
      price: 100,
      at: now,
      retrievedAt: new Date(now).toISOString(),
    },
  };
  loader.ingestDetails("a", row);
  assert.equal(changes, 0);
  assert.equal(loader.get("a").spot.at, now);
  assert.equal(loader.get("a").retrievedAt, row.retrievedAt);
  assert.equal(loader.get("a").checkedAt, now);
  loader.ingestDetails("a", {
    ...row,
    spot: { ...spot, at: now - 10000 },
    reference: { ...row.reference, at: now - 10000 },
  });
  assert.equal(loader.get("a").spot.at, now);
  assert.equal(loader.get("a").reference.at, now);
});

test("shared failed refresh invalidates retained conversion without changing source date", () => {
  const loader = model.createMarketDetailsLoader({
    fetchDetails: async () => ({ rows: [] }),
    now: () => now + 20000,
  });
  loader.ingestDetails("a", { spot, checkedAt: now });
  loader.ingestDetails("a", { spot: null, checkedAt: now + 10000 });
  assert.equal(loader.get("a").spot.at, now);
  assert.equal(loader.get("a").spot.stale, true);
  assert.equal(
    model.marketReadiness(stock, {
      chains,
      detail: loader.get("a"),
      now: now + 10000,
    }).conversion,
    "expired",
  );
  loader.ingestDetails("a", {
    spot: { ...spot, at: now + 15000 },
    checkedAt: now + 15000,
  });
  loader.ingestDetails("a", {
    spot: { ...spot, at: now - 10000, stale: true },
    checkedAt: now + 20000,
  });
  assert.equal(loader.get("a").spot.at, now + 15000);
  assert.equal(loader.get("a").spot.stale, true);
});

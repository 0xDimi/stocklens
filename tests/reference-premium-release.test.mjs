import test from "node:test";
import assert from "node:assert/strict";
import { parseFundamentals } from "../server/fundamentals.mjs";
const stock = {
  id: "US67066G1040",
  ticker: "NVDA",
  name: "NVIDIA",
  category: "Stock",
};
const closeInfo = {
  data: {
    symbol: "NVDA",
    companyName: "NVIDIA Corporation Common Stock",
    exchange: "NASDAQ-GS",
    assetClass: "STOCKS",
    marketStatus: "Closed",
    primaryData: {
      lastSalePrice: "$217.09",
      percentageChange: "+1.38%",
      lastTradeTimestamp: "Oct 19, 2026",
      isRealTime: false,
    },
    secondaryData: null,
  },
};
test("date-only Nasdaq close retains reported price and date without claiming a trade time", () => {
  const result = parseFundamentals(
    closeInfo,
    null,
    stock,
    "2026-10-20T07:58:08.860Z",
  );
  assert.equal(result.price, 217.09);
  assert.equal(result.priceDate, "2026-10-19");
  assert.equal(result.timePrecisionMs, 86400000);
  assert.equal(result.priceSession, "Closed");
  assert.equal(result.isRealTime, false);
  assert.equal(result.exchange, "NASDAQ-GS");
  assert.equal(result.priceTimestamp, "Oct 19, 2026");
  assert.match(result.priceTimeBasis, /date only/i);
});
test("undated and invalid dates cannot authorize a listed price, and date-only quotes require a closed session", () => {
  for (const [stamp, status] of [
    ["N/A", "Closed"],
    ["Feb 31, 2026", "Closed"],
    ["Oct 19, 2026", "Open"],
  ]) {
    const info = structuredClone(closeInfo);
    info.data.primaryData.lastTradeTimestamp = stamp;
    info.data.marketStatus = status;
    const result = parseFundamentals(
      info,
      null,
      stock,
      "2026-10-20T07:58:08.860Z",
    );
    assert.equal(result.price, null);
  }
});

import { marketDetailsView } from "../server/market-details.mjs";
const now = Date.now();
const reference = {
  price: 100,
  currency: "USD",
  at: now,
  retrievedAt: new Date(now).toISOString(),
  priceSource: "https://listed.test/quote",
};
const spot = {
  price: 102,
  rawPrice: 204,
  sharesPerToken: 2,
  conversionVerified: true,
  currency: "USD",
  at: now,
  source: "https://dexscreener.com/bsc/pool",
  conversionSource: "https://explorer.test/oracle",
  symbol: "NVDAon",
  issuer: "ondo",
  chain: "BinanceSmartChain",
  address: "0xabc",
  method: "dex-pool-snapshot",
  priceTimeBasis: "snapshot-retrieval",
};
test("spot premium is separate from the size-specific buy premium and carries both prices", async () => {
  const result = await marketDetailsView(
    new URLSearchParams({ ids: stock.id }),
    {
      getCatalog: async () => ({ stocks: [{ ...stock, products: [] }] }),
      getReference: async () => reference,
      quote: async () => ({ status: "unavailable" }),
      getSpots: async () => new Map([[stock.id, spot]]),
    },
  );
  assert.equal(result.rows[0].premium, null);
  assert.equal(result.rows[0].spotPremium.deltaUsd, 2);
  assert.ok(Math.abs(result.rows[0].spotPremium.value - 2) < 1e-8);
  assert.equal(result.rows[0].spotPremium.price, 102);
  assert.equal(result.rows[0].spotPremium.referencePrice, 100);
  assert.equal(result.rows[0].spotPremium.method, "dex-pool-snapshot");
});
test("date-only fresh close supports explicitly dated spot vs-close comparison", async () => {
  const result = await marketDetailsView(
    new URLSearchParams({ ids: stock.id }),
    {
      getCatalog: async () => ({ stocks: [{ ...stock, products: [] }] }),
      getReference: async () => ({
        ...reference,
        at: now - 2 * 86400000,
        priceDate: "2026-10-18",
        timePrecisionMs: 86400000,
        priceSession: "Closed",
      }),
      quote: async () => ({ status: "unavailable" }),
      getSpots: async () => new Map([[stock.id, spot]]),
    },
  );
  assert.equal(result.rows[0].spotPremium.referenceBasis, "last-close");
  assert.match(result.rows[0].spotPremium.basis, /last close/i);
  assert.equal(result.rows[0].spotPremium.referenceDate, "2026-10-18");
});
test("unverified spot units or old spot snapshots never authorize a premium", async () => {
  for (const change of [{ conversionVerified: false }, { at: now - 600000 }]) {
    const result = await marketDetailsView(
      new URLSearchParams({ ids: stock.id }),
      {
        getCatalog: async () => ({ stocks: [{ ...stock, products: [] }] }),
        getReference: async () => reference,
        quote: async () => ({ status: "unavailable" }),
        getSpots: async () => new Map([[stock.id, { ...spot, ...change }]]),
      },
    );
    assert.equal(result.rows[0].spotPremium, null);
    assert.ok(result.rows[0].spotPremiumReason);
  }
});
test("invalid minute-level dates and clock values cannot become listed-stock observations", () => {
  for (const stamp of [
    "Feb 31, 2026 10:00 AM ET",
    "Oct 19, 2026 13:00 AM ET",
    "Oct 19, 2026 10:99 AM ET",
  ]) {
    const info = structuredClone(closeInfo);
    info.data.primaryData.lastTradeTimestamp = stamp;
    assert.equal(
      parseFundamentals(info, null, stock, "2026-10-20T07:58:08.860Z").price,
      null,
    );
  }
});
test("a reference without a listed price explains that gap instead of blaming time alignment", async () => {
  const result = await marketDetailsView(
    new URLSearchParams({ ids: stock.id }),
    {
      getCatalog: async () => ({ stocks: [{ ...stock, products: [] }] }),
      getReference: async () => ({
        ...reference,
        price: null,
        priceReason: "Source reported no dated price.",
      }),
      quote: async () => ({ status: "unavailable" }),
      getSpots: async () => new Map([[stock.id, spot]]),
    },
  );
  assert.match(result.rows[0].premiumReason, /listed-stock.*unavailable/i);
  assert.equal(
    result.rows[0].referenceReason,
    "Source reported no dated price.",
  );
});

test("indicative providers receive the shorter market-detail deadline", async () => {
  let passed;
  const started = Date.now();
  await marketDetailsView(new URLSearchParams({ ids: stock.id }), {
    getCatalog: async () => ({
      stocks: [
        {
          ...stock,
          products: [
            {
              issuer: "xstocks",
              symbol: "NVDAx",
                name: "NVIDIA xStock",
              deployments: [{ chain: "Solana", address: "Mint" }],
            },
          ],
        },
      ],
    }),
    getReference: async () => reference,
    getSpots: async () => new Map(),
    quote: async (_product, _deployment, _amount, options) => {
      passed = options.deadlineAt;
      return { status: "unavailable" };
    },
  });
  assert.ok(passed > started);
  assert.ok(
    passed <= started + 10000,
    "providers must settle before the enclosing ten-second observation expires",
  );
});

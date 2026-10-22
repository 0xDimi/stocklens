import test from "node:test";
import assert from "node:assert/strict";
import { priceComparison } from "../src/reference-view.mjs";
import { marketDetailsView } from "../server/market-details.mjs";
const now = Date.now();
const reference = {
  price: 100,
  at: now,
  currency: "USD",
  source: "https://exchange.test/stock",
};
const buy = {
  price: 102,
  value: 2,
  referencePrice: 100,
  referenceAt: now,
  priceAt: now,
  expiresAt: now + 300000,
  symbol: "MSFTx",
  issuer: "xstocks",
  chain: "Solana",
  source: "https://quotes.test/msft",
  conversionSource: "https://issuer.test/units",
  budget: 1000,
  basis: "$1,000 indicative buy before gas.",
};
test("a comparable current buy price leads over a raw pool that cannot establish a premium", () => {
  const html = priceComparison({
    reference,
    premium: buy,
    spot: {
      price: 101,
      at: now,
      conversionVerified: true,
      expiresAt: now + 300000,
      symbol: "MSFTon",
      issuer: "ondo",
    },
  });
  assert.match(html, /\$102\.00/);
  assert.match(html, /\+2\.00%/);
  assert.match(html, /\$1,000 buy/);
  assert.doesNotMatch(html, /Prices not time-aligned/);
});
test("Home uses the verified indicative buy price when no normalized pool price exists", () => {
  const html = priceComparison({ reference, premium: buy });
  assert.match(html, /\$102\.00/);
  assert.match(html, /\+2\.00%/);
  assert.match(html, /\$1,000 buy/);
  assert.match(html, /quotes\.test/);
  assert.doesNotMatch(html, /No current share-normalized pool price/);
});
test("Home displays normalized onchain price even without a listed reference", () => {
  const html = priceComparison({
    spot: {
      price: 102,
      at: now,
      symbol: "SOXLx",
      issuer: "xstocks",
      chain: "Ethereum",
      conversionVerified: true,
      source: "https://pool.test/exact",
    },
  });
  assert.match(html, /\$102\.00/);
  assert.match(html, /Listed price required/);
  assert.doesNotMatch(html, /\+2\.00%/);
});
test("Home retains dated prices after expiry and prefers a current buy observation over an old pool", () => {
  const old = {
    ...buy,
    price: 99,
    value: -1,
    priceAt: now - 600000,
    expiresAt: now - 300000,
    venue: "Uniswap",
  };
  const retained = priceComparison({ reference, spotPremium: old });
  assert.match(retained, /\$99\.00/);
  assert.match(retained, /Older observation/);
  const recovered = priceComparison({
    reference,
    spotPremium: old,
    premium: buy,
  });
  assert.match(recovered, /\$102\.00/);
  assert.doesNotMatch(recovered, /\$99\.00/);
});
test("normalized buy observation survives a missing listed reference without inventing a premium", async () => {
  const stock = {
    id: "stock",
    products: [
      {
        issuer: "xstocks",
        symbol: "MSFTx",
        name: "Microsoft xStock",
        deployments: [{ chain: "Solana", address: "mint" }],
      },
    ],
  };
  const d = await marketDetailsView(new URLSearchParams({ ids: "stock" }), {
    getCatalog: async () => ({ stocks: [stock] }),
    getReference: async () => null,
    getSpots: async () => new Map(),
    quote: async () => ({
      status: "quoted",
      effectivePrice: 102,
      equivalentShares: 1000 / 102,
      sharesPerToken: 1.1,
      fetchedAt: now,
      symbol: "MSFTx",
      issuer: "xstocks",
      chain: "Solana",
      quoteSource: buy.source,
      conversionSource: buy.conversionSource,
    }),
  });
  assert.equal(d.rows[0].buyObservation?.price, 102);
  assert.equal(d.rows[0].premium, null);
  assert.equal(d.rows[0].buyObservation?.priceAt, now);
});

test("buy premium carries the exact listed price used by Home", async () => {
  const stock = {
    id: "stock",
    products: [
      {
        issuer: "xstocks",
        symbol: "MSFTx",
        name: "Microsoft xStock",
        deployments: [{ chain: "Solana", address: "mint" }],
      },
    ],
  };
  const data = await marketDetailsView(new URLSearchParams({ ids: "stock" }), {
    getCatalog: async () => ({ stocks: [stock] }),
    getReference: async () => reference,
    getSpots: async () => new Map(),
    quote: async () => ({
      status: "quoted",
      effectivePrice: 102,
      equivalentShares: 1000 / 102,
      sharesPerToken: 1.1,
      fetchedAt: now,
      symbol: "MSFTx",
      issuer: "xstocks",
      chain: "Solana",
      quoteSource: buy.source,
      conversionSource: buy.conversionSource,
    }),
  });
  assert.equal(data.rows[0].premium.referencePrice, 100);
  assert.match(priceComparison(data.rows[0]), /\+2\.00%/);
});

test("a slow quote network does not serialize independent representative-price candidates", async () => {
  let firstFinished = false,
    independentStarted = false;
  const stock = {
    id: "stock",
    products: [
      {
        issuer: "xstocks",
        symbol: "TESTx",
        name: "Test xStock",
        deployments: [
          { chain: "Solana", address: "sol" },
          { chain: "Ethereum", address: "eth" },
        ],
      },
    ],
  };
  const data = await marketDetailsView(new URLSearchParams({ ids: "stock" }), {
    getCatalog: async () => ({ stocks: [stock] }),
    getReference: async () => reference,
    getSpots: async () => new Map(),
    quote: async (p, d) => {
      if (d.chain === "Solana") {
        await new Promise((resolve) => setImmediate(resolve));
        firstFinished = true;
        return { status: "unavailable" };
      }
      independentStarted = !firstFinished;
      return {
        status: "quoted",
        effectivePrice: 102,
        equivalentShares: 1000 / 102,
        sharesPerToken: 1,
        fetchedAt: now,
        symbol: p.symbol,
        issuer: p.issuer,
        chain: d.chain,
        quoteSource: buy.source,
        conversionSource: buy.conversionSource,
      };
    },
  });
  assert.equal(independentStarted, true);
  assert.equal(data.rows[0].buyObservation.price, 102);
});

test("a single-stock Home lookup waits for native verified versions before deciding price coverage", async () => {
  const listed = { id: "stock", rwaId: "stock", products: [] };
  let lookedUp = false;
  const d = await marketDetailsView(new URLSearchParams({ ids: "stock" }), {
    getCatalog: async () => ({ stocks: [listed] }),
    getReference: async () => reference,
    getSpots: async () => new Map(),
    getEnrichedStock: async (id) => {
      lookedUp = id === "stock";
      return {
        stock: {
          ...listed,
          products: [
            {
              issuer: "ondo",
              symbol: "TESTon",
              name: "Test (Ondo Tokenized ETF)",
              deployments: [{ chain: "BinanceSmartChain", address: "mint" }],
            },
          ],
        },
      };
    },
    quote: async (p, d) => ({
      status: "quoted",
      effectivePrice: 102,
      equivalentShares: 1000 / 102,
      sharesPerToken: 1,
      fetchedAt: now,
      symbol: p.symbol,
      issuer: p.issuer,
      chain: d.chain,
      quoteSource: buy.source,
      conversionSource: buy.conversionSource,
    }),
  });
  assert.equal(lookedUp, true);
  assert.equal(d.rows[0].buyObservation?.price, 102);
});

test("Ondo native ETF and stock labels keep issuer verification and oracle-backed normalization reachable", async () => {
  const { conversionIssuer } = await import("../server/providers.mjs");
  for (const suffix of [
    "Ondo Tokenized",
    "Ondo Tokenized ETF",
    "Ondo Tokenized Stock",
  ])
    assert.equal(
      conversionIssuer({
        issuer: "ondo",
        name: `Test (${suffix})`,
        source: "https://www.coingecko.com/en/coins/test",
      }),
      "ondo",
    );
  assert.equal(
    conversionIssuer({
      issuer: "unreviewed",
      name: "Test (Ondo Tokenized ETF)",
    }),
    null,
  );
  assert.equal(
    conversionIssuer({
      issuer: "ondo",
      name: "Wrapped Test (Ondo Tokenized ETF)",
      wrapped: true,
    }),
    null,
  );
});

test("Home representative prices cover supported Base and Arbitrum deployments", async () => {
  for (const chain of ["Base", "Arbitrum"]) {
    const stock = {
      id: "stock",
      products: [
        {
          issuer: "xstocks",
          symbol: "TESTx",
          name: "Test xStock",
          deployments: [{ chain, address: "token" }],
        },
      ],
    };
    const d = await marketDetailsView(new URLSearchParams({ ids: "stock" }), {
      getCatalog: async () => ({ stocks: [stock] }),
      getReference: async () => reference,
      getSpots: async () => new Map(),
      quote: async (p, d) => ({
        status: "quoted",
        effectivePrice: 102,
        equivalentShares: 1000 / 102,
        sharesPerToken: 1,
        fetchedAt: now,
        symbol: p.symbol,
        issuer: p.issuer,
        chain: d.chain,
        quoteSource: buy.source,
        conversionSource: buy.conversionSource,
      }),
    });
    assert.equal(d.rows[0].buyObservation?.chain, chain);
  }
});

test("representative buy price uses the best completed normalized candidate rather than the fastest expensive response", async () => {
  const stock = {
    id: "stock",
    products: [
      {
        issuer: "xstocks",
        symbol: "TESTx",
        name: "Test xStock",
        deployments: [
          { chain: "Solana", address: "sol" },
          { chain: "Ethereum", address: "eth" },
        ],
      },
    ],
  };
  const data = await marketDetailsView(new URLSearchParams({ ids: "stock" }), {
    getCatalog: async () => ({ stocks: [stock] }),
    getReference: async () => reference,
    getSpots: async () => new Map(),
    quote: async (p, d) => {
      if (d.chain === "Solana")
        await new Promise((resolve) => setImmediate(resolve));
      const price = d.chain === "Solana" ? 102 : 110;
      return {
        status: "quoted",
        effectivePrice: price,
        equivalentShares: 1000 / price,
        sharesPerToken: 1,
        fetchedAt: now,
        symbol: p.symbol,
        issuer: p.issuer,
        chain: d.chain,
        quoteSource: buy.source,
        conversionSource: buy.conversionSource,
      };
    },
  });
  assert.equal(data.rows[0].buyObservation.price, 102);
});

test("an intraday comparison does not inherit a newer listed close date", async () => {
  const { comparisonReference } = await import("../src/reference-view.mjs");
  const old = comparisonReference(
    { price: 110, at: now, priceDate: "2026-10-21" },
    { referencePrice: 100, referenceAt: now - 600000, referenceDate: null },
  );
  assert.equal(old.price, 100);
  assert.equal(old.at, now - 600000);
  assert.equal(old.priceDate, null);
});

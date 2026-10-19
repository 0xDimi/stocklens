import test from "node:test";
import assert from "node:assert/strict";
import { marketDetailsView } from "../server/market-details.mjs";
const stock = {
  id: "US67066G1040",
  ticker: "NVDA",
  name: "NVIDIA",
  category: "Stock",
  products: [
    {
      issuer: "xstocks",
      symbol: "NVDAx",
      name: "NVIDIA xStock",
      deployments: [{ chain: "Solana", address: "mint" }],
    },
  ],
};
const setup = () => {
  const now = Date.now();
  return {
    getCatalog: async () => ({ stocks: [stock] }),
    getReference: async () => ({
      price: 100,
      currency: "USD",
      at: now,
      retrievedAt: new Date(now).toISOString(),
    }),
    quote: async () => ({
      status: "quoted",
      effectivePrice: 101,
      equivalentShares: 1000 / 101,
      sharesPerToken: 1,
      fetchedAt: now,
      symbol: "NVDAx",
      chain: "Solana",
      quoteSource: "https://quotes.test/exact",
      conversionSource: "https://issuer.test/multiplier",
    }),
  };
};
test("Markets obtains a normalized premium without a browser buy comparison session", async () => {
  const result = await marketDetailsView(
    new URLSearchParams({ ids: stock.id }),
    setup(),
  );
  assert.equal(result.rows[0].premium.budget, 1000);
  assert.ok(Math.abs(result.rows[0].premium.value - 1) < 1e-8);
  assert.equal(result.rows[0].premium.symbol, "NVDAx");
  assert.match(result.rows[0].premium.basis, /representative/i);
  assert.equal(result.rows[0].reference.price, 100);
});
test("stale reference and unverified quote units explain missing premium instead of inventing one", async () => {
  for (const change of [
    {
      getReference: async () => ({
        price: 100,
        currency: "USD",
        at: Date.now() - 86400000,
      }),
    },
    {
      quote: async () => ({
        status: "quoted",
        effectivePrice: null,
        equivalentShares: null,
        fetchedAt: Date.now(),
      }),
    },
  ]) {
    const result = await marketDetailsView(
      new URLSearchParams({ ids: stock.id }),
      { ...setup(), ...change },
    );
    assert.equal(result.rows[0].premium, null);
    assert.ok(result.rows[0].premiumReason.length > 0);
  }
});
test("market details validates exact canonical IDs and never uses a ticker collision", async () => {
  await assert.rejects(
    marketDetailsView(new URLSearchParams({ ids: "NVDA" }), setup()),
    { status: 400 },
  );
  await assert.rejects(
    marketDetailsView(new URLSearchParams({ ids: "" }), setup()),
    { status: 400 },
  );
});
test("Nasdaq minute-precision reference times tolerate rounding, but unqualified future timestamps do not", async () => {
  const now = Date.now();
  for (const [timePrecisionMs, valid] of [
    [60000, true],
    [undefined, false],
  ]) {
    const deps = setup();
    deps.getReference = async () => ({
      price: 100,
      currency: "USD",
      at: now + 30000,
      timePrecisionMs,
      priceStale: false,
    });
    const result = await marketDetailsView(
      new URLSearchParams({ ids: stock.id }),
      deps,
    );
    assert.equal(!!result.rows[0].premium, valid);
  }
});

test("outside market hours a fresh official last-close reference produces an explicitly labeled premium", async () => {
  const deps = setup();
  const now = Date.now();
  deps.getReference = async () => ({
    price: 100,
    currency: "USD",
    at: now - 3 * 86400000,
    priceSession: "Closed",
    retrievedAt: new Date(now).toISOString(),
    priceStale: false,
  });
  const data = await marketDetailsView(
    new URLSearchParams({ ids: stock.id }),
    deps,
  );
  assert.ok(Math.abs(data.rows[0].premium.value - 1) < 1e-8);
  assert.equal(data.rows[0].premium.referenceBasis, "last-close");
  assert.match(data.rows[0].premium.basis, /last close/i);
  assert.ok(data.rows[0].premium.expiresAt > now);
});

test("premium preserves provider price impact so thin-pool observations can be identified", async () => {
  const deps = setup();
  const original = deps.quote;
  deps.quote = async () => ({ ...(await original()), priceImpactPct: 70.53 });
  const result = await marketDetailsView(
    new URLSearchParams({ ids: stock.id }),
    deps,
  );
  assert.equal(result.rows[0].premium.priceImpactPct, 70.53);
  const unknown = await marketDetailsView(
    new URLSearchParams({ ids: stock.id }),
    setup(),
  );
  assert.equal(unknown.rows[0].premium.priceImpactPct, null);
});

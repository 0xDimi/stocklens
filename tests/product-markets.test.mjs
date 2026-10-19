import test from "node:test";
import assert from "node:assert/strict";
import { productMarkets } from "../server/product-markets.mjs";
const stock = {
  products: [
    {
      coinId: "nvidia-xstock",
      issuer: "xstocks",
      symbol: "NVDAx",
      deployments: [{ chain: "Solana", address: "exact-mint" }],
    },
  ],
};
test("CoinGecko outage uses exact-contract indicative quotes with explicit price basis and no invented market cap", async () => {
  const now = Date.now();
  const result = await productMarkets(stock, {
    primary: async () => {
      throw new Error("rate limit");
    },
    quote: async (p, d) => {
      assert.equal(d.address, "exact-mint");
      return {
        status: "quoted",
        tokenQuantity: 4,
        fetchedAt: now,
        quoteSource: "https://quotes.test/exact",
      };
    },
  });
  assert.equal(result.rows[0].price, 250);
  assert.equal(result.rows[0].marketCap, null);
  assert.equal(result.rows[0].volume24h, null);
  assert.equal(result.rows[0].priceType, "indicative-buy");
  assert.match(result.warning, /indicative/i);
});
test("an unavailable quote cannot invent a product price", async () => {
  const result = await productMarkets(stock, {
    primary: async () => {
      throw new Error("rate limit");
    },
    quote: async () => ({ status: "unavailable" }),
  });
  assert.equal(result.rows.length, 0);
  assert.match(result.warning, /unavailable/i);
});
test("a stalled aggregate request cannot prevent the independent quote fallback", async () => {
  const result = await productMarkets(stock, {
    primary: () => new Promise(() => {}),
    timeoutMs: 20,
    quote: async () => ({
      status: "quoted",
      tokenQuantity: 5,
      fetchedAt: Date.now(),
    }),
  });
  assert.equal(result.rows[0].price, 200);
});
test(
  "stalled independent providers leave a partial response within a shared deadline",
  { timeout: 2000 },
  async () => {
    const result = await productMarkets(
      { products: [...stock.products, ...stock.products] },
      {
        primary: async () => {
          throw new Error("offline");
        },
        quote: () => new Promise(() => {}),
        budgetMs: 25,
      },
    );
    assert.deepEqual(result.rows, []);
    assert.match(result.warning, /unavailable/i);
  },
);

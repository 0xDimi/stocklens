import test from "node:test";
import assert from "node:assert/strict";
import { createGeckoClient } from "../server/gecko.mjs";
const one = "0x1111111111111111111111111111111111111111";
const two = "0x2222222222222222222222222222222222222222";
const poolAddress = "0x3333333333333333333333333333333333333333";
const at = new Date().toISOString();
const stock = {
  ticker: "AAPL",
  products: [
    {
      issuer: "reality",
      symbol: "rAAPL",
      deployments: [{ chain: "Arbitrum", address: one }],
    },
  ],
};
function pool(token = one, orientation = "base") {
  return {
    data: [
      {
        id: "arbitrum_" + poolAddress,
        type: "pool",
        attributes: {
          address: poolAddress,
          name: "AAPL / USD",
          base_token_price_usd: "205",
          quote_token_price_usd: "203",
          reserve_in_usd: "10000",
        },
        relationships: {
          base_token: {
            data: {
              id:
                "arbitrum_" +
                (orientation === "base"
                  ? token
                  : "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"),
            },
          },
          quote_token: {
            data: {
              id:
                "arbitrum_" +
                (orientation === "quote"
                  ? token
                  : "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"),
            },
          },
        },
      },
    ],
  };
}
for (const orientation of ["base", "quote"])
  test(`missing search results are enriched through the exact contract in ${orientation} orientation`, async () => {
    const calls = [];
    const client = createGeckoClient({
      hasApiKey: () => false,
      publicRequest: async (path) => {
        calls.push(path);
        return {
          data: path.startsWith("/search/")
            ? pool(two)
            : pool(one, orientation),
          retrievedAt: at,
        };
      },
    });
    const result = await client.getPools(stock);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].address, one);
    assert.equal(result.rows[0].orientation, orientation);
    assert.equal(result.rows[0].price, orientation === "base" ? 205 : 203);
    assert.ok(
      calls.some((p) =>
        p.startsWith("/networks/arbitrum/tokens/" + one + "/pools"),
      ),
    );
    assert.equal(
      result.rows[0].effectivePrice,
      undefined,
      "pool observations cannot be promoted to executable order prices",
    );
  });
test("exact discovery is bounded and failed lookups retain successful search observations", async () => {
  const products = Array.from({ length: 8 }, (_, i) => ({
    issuer: "reality",
    symbol: "T" + i,
    deployments: [
      { chain: "Arbitrum", address: "0x" + String(i + 1).repeat(40) },
    ],
  }));
  const calls = [];
  const client = createGeckoClient({
    hasApiKey: () => false,
    publicRequest: async (path) => {
      calls.push(path);
      if (path.startsWith("/search/"))
        return { data: pool(one), retrievedAt: at };
      return { data: { data: [] }, retrievedAt: at };
    },
  });
  const result = await client.getPools({ ticker: "AAPL", products });
  assert.equal(result.rows.length, 1);
  assert.ok(calls.length <= 4);
  assert.ok(calls.length > 1);
});

import test from "node:test";
import assert from "node:assert/strict";
import { retainedTokenMarkets } from "../server/coingecko.mjs";
test("token price lookup reuses a USD batch by exact coin ID and preserves source times", () => {
  const at = new Date().toISOString();
  const result = retainedTokenMarkets(
    ["nvidia-xstock"],
    [
      [
        "/coins/markets?vs_currency=usd&ids=nvidia-xstock,apple-xstock",
        {
          retrievedAt: at,
          data: [
            { id: "nvidia-xstock", current_price: 217, last_updated: at },
            { id: "apple-xstock", current_price: 250, last_updated: at },
          ],
        },
      ],
      [
        "/coins/markets?vs_currency=eur&ids=nvidia-xstock",
        {
          retrievedAt: at,
          data: [{ id: "nvidia-xstock", current_price: 190, last_updated: at }],
        },
      ],
    ],
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].price, 217);
  assert.equal(result.rows[0].updatedAt, at);
  assert.equal(result.retrievedAt, at);
  assert.equal(retainedTokenMarkets(["unrelated"], []).rows.length, 0);
});

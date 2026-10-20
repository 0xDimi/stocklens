import test from "node:test";
import assert from "node:assert/strict";
import { createReferenceRetention } from "../server/reference-retention.mjs";
const now = Date.now();
const good = {
  id: "NVDA-id",
  ticker: "NVDA",
  companyName: "NVIDIA",
  price: 100,
  currency: "USD",
  at: now - 3600000,
  priceRetrievedAt: new Date(now).toISOString(),
  retrievedAt: new Date(now).toISOString(),
  marketCap: 1,
  pe: 20,
};
test("a newly missing listed price retains only the prior price with original provenance", async () => {
  const cache = createReferenceRetention();
  await cache.merge(good, now);
  const result = await cache.merge(
    {
      ...good,
      price: null,
      at: null,
      currency: null,
      marketCap: 2,
      pe: null,
      retrievedAt: new Date(now + 1000).toISOString(),
    },
    now + 1000,
  );
  assert.equal(result.price, 100);
  assert.equal(result.at, good.at);
  assert.equal(result.priceRetrievedAt, good.priceRetrievedAt);
  assert.equal(result.priceStale, true);
  assert.equal(result.marketCap, 2);
  assert.equal(result.pe, null);
  assert.ok(result.priceAgeMs > 0);
});
test("expired or mismatched identities never revive a listed price", async () => {
  const cache = createReferenceRetention();
  await cache.merge(good, now);
  for (const change of [{ ticker: "FAKE" }, { id: "different" }]) {
    const result = await cache.merge(
      { ...good, ...change, price: null, at: null },
      now + 1000,
    );
    assert.equal(result.price, null);
  }
  const expired = await cache.merge(
    { ...good, price: null, at: null },
    now + 2 * 86400000,
  );
  assert.equal(expired.price, null);
});
test("an old source-reported price is removed even when the response was retrieved today", async () => {
  const result = await createReferenceRetention().merge(
    { ...good, at: now - 8 * 86400000 },
    now,
  );
  assert.equal(result.price, null);
  assert.equal(result.available, false);
  assert.match(result.priceReason, /expired/i);
});

import test from "node:test";
import assert from "node:assert/strict";
import { createMarketDetailsLoader } from "../src/market-model.mjs";

const now = 1000000;
const buy = {
  price: 102,
  priceAt: now - 1000,
  expiresAt: now + 299000,
  conversionVerified: true,
};
const metric = { ...buy, value: 2, referencePrice: 100 };

test("shared detail ingestion retains a failed buy observation with its original clock and a stale label", () => {
  const loader = createMarketDetailsLoader({
    fetchDetails: async () => ({}),
    now: () => now,
  });
  loader.ingestDetails("asset", {
    buyObservation: buy,
    premium: metric,
    checkedAt: now - 500,
  });
  loader.ingestDetails("asset", {
    buyObservation: null,
    premium: null,
    checkedAt: now,
  });
  assert.equal(loader.get("asset").buyObservation.price, 102);
  assert.equal(loader.get("asset").buyObservation.priceAt, buy.priceAt);
  assert.equal(loader.get("asset").buyObservation.stale, true);
  assert.equal(loader.get("asset").premium.stale, true);
});

test("a successful missing-source response retains buy price and premium as older observations", async () => {
  const loader = createMarketDetailsLoader({
    now: () => now,
    fetchDetails: async () => ({
      rows: [{ id: "asset", buyObservation: null, premium: null }],
    }),
  });
  loader.ingestDetails("asset", { buyObservation: buy, premium: metric });
  loader.load(["asset"], { force: true });
  await new Promise(setImmediate);
  assert.equal(loader.get("asset").buyObservation.priceAt, buy.priceAt);
  assert.equal(loader.get("asset").buyObservation.stale, true);
  assert.equal(loader.get("asset").premium.stale, true);
});

test("transport failure marks retained listed and buy observations stale instead of appearing newly confirmed", async () => {
  const loader = createMarketDetailsLoader({
    now: () => now,
    fetchDetails: async () => {
      throw new Error("Source offline");
    },
  });
  loader.ingestDetails("asset", {
    reference: { price: 100, at: now - 1000 },
    buyObservation: buy,
    premium: metric,
  });
  loader.load(["asset"], { force: true });
  await new Promise(setImmediate);
  const row = loader.get("asset");
  assert.equal(row.status, "error");
  for (const field of ["reference", "buyObservation", "premium"])
    assert.equal(row[field].stale, true, field);
  assert.equal(row.buyObservation.priceAt, buy.priceAt);
});

test("an older shared buy response cannot replace a newer observation", () => {
  const loader = createMarketDetailsLoader({
    fetchDetails: async () => ({}),
    now: () => now,
  });
  loader.ingestDetails("asset", { buyObservation: buy });
  loader.ingestDetails("asset", {
    buyObservation: { ...buy, price: 90, priceAt: now - 2000 },
  });
  assert.equal(loader.get("asset").buyObservation.price, 102);
});

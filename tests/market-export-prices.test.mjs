import test from "node:test";
import assert from "node:assert/strict";
import * as page from "../src/markets-page.mjs";

const now = 1000000;
const buy = {
  price: 102,
  value: 2,
  referencePrice: 100,
  referenceAt: now - 1000,
  referenceDate: null,
  priceAt: now,
  expiresAt: now + 300000,
};
test("Markets exports the displayed buy premium and exact listed comparison instead of an absent pool metric", () => {
  assert.equal(typeof page.marketExportPrices, "function");
  const value = page.marketExportPrices(
    {
      reference: { price: 110, at: now, priceDate: "2026-10-20" },
      premium: buy,
    },
    now,
  );
  assert.equal(value.listedPrice, 100);
  assert.equal(value.listedAt, now - 1000);
  assert.equal(value.onchainPrice, 102);
  assert.equal(value.premium, 2);
  assert.match(value.basis, /\$1,000.*before gas/);
});
test("Markets exports a raw verified price without inventing its premium", () => {
  const value = page.marketExportPrices(
    { buyObservation: { ...buy, conversionVerified: true } },
    now,
  );
  assert.equal(value.onchainPrice, 102);
  assert.equal(value.premium, null);
  assert.equal(value.listedPrice, null);
});
test("Markets exports retained observation clocks and their older label", () => {
  const value = page.marketExportPrices(
    { spotPremium: { ...buy, stale: true } },
    now,
  );
  assert.equal(value.onchainAt, now);
  assert.match(value.basis, /Older observation/);
  assert.match(value.basis, /Pool snapshot/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { selectOnchainPrice } from "../src/reference-view.mjs";
import {
  premium,
  needsReference,
  createMarketDetailsLoader,
  marketReadiness,
} from "../src/market-model.mjs";
import { quoteTable } from "../src/views.mjs";

const now = Date.now(),
  at = now + 200;
const observation = {
  price: 102,
  value: 2,
  priceAt: at,
  at,
  referencePrice: 100,
  referenceAt: now,
  sharesPerToken: 1,
  conversionVerified: true,
  expiresAt: at + 30000,
  currency: "USD",
  chain: "Solana",
  issuer: "xstocks",
  source: "https://pool.test/asset",
  conversionSource: "https://issuer.test/units",
};
const reference = {
  price: 100,
  at,
  currency: "USD",
  retrievedAt: new Date(at).toISOString(),
};

test("small source clock differences preserve exact observation timestamps without hiding prices", () => {
  assert.equal(selectOnchainPrice({ premium: observation }, now)?.at, at);
  assert.equal(
    selectOnchainPrice(
      { premium: { ...observation, priceAt: now + 1001 } },
      now,
    ),
    null,
  );
});
test("premium allows subsecond clock skew but rejects an actually future observation", () => {
  assert.ok(Math.abs(premium(observation, reference, now) - 2) < 1e-12);
  assert.equal(
    premium({ ...observation, at: now + 1001 }, reference, now),
    null,
  );
  assert.equal(
    premium(observation, { ...reference, at: now + 1001 }, now),
    null,
  );
});
test("a freshly retrieved dated close remains comparable across subsecond clock differences", () => {
  assert.ok(
    Number.isFinite(
      premium(
        observation,
        { ...reference, at: now - 86400000, priceSession: "Closed" },
        now,
      ),
    ),
  );
  assert.equal(needsReference(reference, now), false);
  assert.equal(
    needsReference(
      { ...reference, retrievedAt: new Date(now + 1001).toISOString() },
      now,
    ),
    true,
  );
});
test("buy quote rendering does not hide its premium because the source clock is milliseconds ahead", (t) => {
  t.mock.method(Date, "now", () => now);
  const html = quoteTable(
    [
      {
        id: "q",
        issuer: "xstocks",
        symbol: "STOCKx",
        chain: "Solana",
        status: "quoted",
        rankable: true,
        effectivePrice: 102,
        equivalentShares: 10,
        inputQuantity: 1020,
        fetchedAt: at,
        expiresAt: at + 30000,
      },
    ],
    { reference },
  );
  assert.match(html, /\+2\.00% vs listed reference/);
});
test("conversion readiness accepts bounded clock skew and rejects later future timestamps", () => {
  const stock = {
    products: [{ issuer: "xstocks", deployments: [{ chain: "Solana" }] }],
  };
  const state = (priceAt) =>
    marketReadiness(stock, {
      detail: { buyObservation: { ...observation, priceAt } },
      now,
    });
  assert.equal(state(at).conversion, "verified");
  assert.notEqual(state(now + 1001).conversion, "verified");
});
test("shared detail cache keeps the original server check time within the bounded clock difference", () => {
  const loader = createMarketDetailsLoader({
    fetchDetails: async () => ({}),
    now: () => now,
  });
  loader.ingestDetails("asset", {
    retrievedAt: reference.retrievedAt,
    buyObservation: observation,
  });
  assert.equal(loader.get("asset").checkedAt, at);
});

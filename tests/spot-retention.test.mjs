import test from "node:test";
import assert from "node:assert/strict";
import {
  createMarketDetailsLoader,
  observedPremiumState,
} from "../src/market-model.mjs";
const settle = async () => {
  for (let i = 0; i < 10; i++)
    await new Promise((resolve) => setImmediate(resolve));
};
test("missing spot refresh retains its original date and marks the observation stale immediately", async () => {
  let now = Date.now(),
    calls = 0;
  const at = now;
  const loader = createMarketDetailsLoader({
    now: () => now,
    fetchDetails: async () => ({
      rows: [
        calls++
          ? {
              id: "NVDA",
              reference: null,
              spot: null,
              spotPremium: null,
              spotPremiumReason: "Source unavailable",
            }
          : {
              id: "NVDA",
              reference: { price: 100 },
              spot: { price: 102, at },
              spotPremium: { value: 2, priceAt: at, expiresAt: at + 300000 },
            },
      ],
      retrievedAt: new Date(now).toISOString(),
    }),
  });
  loader.load(["NVDA"]);
  await settle();
  assert.equal(loader.get("NVDA").spotPremium.value, 2);
  now += 60001;
  loader.load(["NVDA"]);
  await settle();
  const row = loader.get("NVDA");
  assert.equal(row.reference.priceStale, true);
  assert.equal(row.spot.at, at);
  assert.equal(row.spot.stale, true);
  assert.equal(row.spotPremium.priceAt, at);
  assert.equal(observedPremiumState(row.spotPremium, now).stale, true);
});
test("a failed details transport marks the retained pool observation stale without renewing its times", async () => {
  let now = Date.now(),
    calls = 0;
  const at = now;
  const loader = createMarketDetailsLoader({
    now: () => now,
    fetchDetails: async () => {
      if (calls++) throw new Error("Transport unavailable");
      return {
        rows: [
          {
            id: "NVDA",
            spot: { price: 102, at },
            spotPremium: { value: 2, priceAt: at, expiresAt: at + 300000 },
          },
        ],
      };
    },
  });
  loader.load(["NVDA"]);
  await settle();
  now += 60001;
  loader.load(["NVDA"]);
  await settle();
  assert.equal(loader.get("NVDA").status, "error");
  assert.equal(loader.get("NVDA").spot.stale, true);
  assert.equal(loader.get("NVDA").spot.at, at);
  assert.equal(
    observedPremiumState(loader.get("NVDA").spotPremium, now).stale,
    true,
  );
});

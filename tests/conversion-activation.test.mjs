import test from "node:test";
import assert from "node:assert/strict";
import { multiplierValidUntil, normalizeQuote } from "../src/model.mjs";
import { parseSolanaMint } from "../server/providers.mjs";
const activation = 1792755000000;
const state = {
  multiplier: 1,
  newMultiplier: 2,
  newMultiplierEffectiveTimestamp: activation / 1000,
};
test("a scheduled multiplier bounds validity without inventing an expiry after activation", () => {
  assert.equal(multiplierValidUntil(state, activation - 1), activation);
  assert.equal(multiplierValidUntil(state, activation), null);
  assert.equal(
    multiplierValidUntil({ ...state, newMultiplier: 1 }, activation - 1),
    null,
  );
});
test("normalization never extends a quote beyond its verified conversion interval", () => {
  const q = {
    inputAmount: "1000000",
    inputDecimals: 6,
    outputAmount: "1000000",
    outputDecimals: 6,
    sharesPerToken: 1,
    fetchedAt: activation - 100,
    conversionValidUntil: activation,
  };
  assert.equal(normalizeQuote(q).expiresAt, activation);
  assert.ok(
    normalizeQuote({ ...q, fetchedAt: activation + 1 }).expiresAt <= activation,
  );
  const parsed = parseSolanaMint(
    {
      value: {
        data: {
          parsed: {
            type: "mint",
            info: {
              decimals: 6,
              extensions: [{ extension: "scaledUiAmountConfig", state }],
            },
          },
        },
      },
    },
    activation - 1,
  );
  assert.equal(parsed.conversionValidUntil, activation);
});

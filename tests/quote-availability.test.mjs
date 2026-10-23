import test from "node:test";
import assert from "node:assert/strict";
import {
  quoteFailure,
  quoteUnavailable,
  quoteFeeView,
  scheduleQuoteJobs,
} from "../src/quote-support.mjs";

test("source failures preserve a useful distinction from a valid empty route", () => {
  assert.equal(
    quoteFailure(Object.assign(new Error("Provider failed"), { status: 429 }))
      .kind,
    "rate-limited",
  );
  assert.equal(
    quoteFailure(new Error("Quote deadline reached.")).kind,
    "timeout",
  );
  assert.equal(
    quoteFailure(
      new Error("No verified Raydium route is available for this amount."),
    ).kind,
    "no-route",
  );
  assert.equal(
    quoteFailure(Object.assign(new Error("bad response"), { status: 503 }))
      .kind,
    "source-unavailable",
  );
  assert.equal(
    quoteUnavailable([{ provider: "A", kind: "no-route" }]).availability,
    "no-route",
  );
  assert.equal(
    quoteUnavailable([
      { provider: "A", kind: "no-route" },
      { provider: "B", kind: "rate-limited" },
    ]).availability,
    "rate-limited",
  );
  assert.match(
    quoteUnavailable([{ provider: "A", kind: "timeout" }]).reason,
    /respond|time|refresh/i,
  );
});
test("walletless fees are explicit and cannot become a free gas claim", () => {
  const f = quoteFeeView({
    status: "quoted",
    networkFeeUsd: null,
    providerFeeBps: 10,
  });
  assert.equal(f.label, "At venue");
  assert.match(f.detail, /wallet|transaction/);
  assert.equal(f.providerFee, "0.10% provider fee included");
  assert.equal(
    quoteFeeView({ networkFeeUsd: 0, providerFeeBps: 0 }).label,
    "$0.00",
  );
  assert.equal(quoteFeeView({ networkFeeUsd: 0.25 }).label, "$0.25");
  assert.equal(quoteFeeView({ networkFeeUsd: 0.0007 }).label, "<$0.01");
  assert.equal(
    quoteFeeView({ networkFeeUsd: NaN, providerFeeBps: null }).providerFee,
    null,
  );
});
test("quote scheduling offers each issuer a supported deployment before repeating one issuer", () => {
  const chains = { A: { usdc: "a" }, B: { usdc: "b" }, Other: {} };
  const a = {
    issuer: "xstocks",
    symbol: "X",
    deployments: [{ chain: "Other" }, { chain: "A" }, { chain: "B" }],
  };
  const b = { issuer: "coinbase", symbol: "C", deployments: [{ chain: "B" }] };
  const result = scheduleQuoteJobs([a, b], chains);
  assert.deepEqual(
    result.map((x) => x.product.symbol + ":" + x.deployment.chain),
    ["X:A", "C:B", "X:B", "X:Other"],
  );
  assert.deepEqual(
    scheduleQuoteJobs([a, b], chains, "B").map((x) => x.product.symbol),
    ["X", "C"],
  );
  assert.equal(a.deployments[0].chain, "Other");
});

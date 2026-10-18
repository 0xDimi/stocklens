import test from "node:test";
import assert from "node:assert/strict";
import {
  parseRaydium,
  parseKyber,
  parseSolanaMint,
} from "../server/providers.mjs";

const deployment = { chain: "Solana", address: "mint" };
test("Raydium response must match the requested input, output, and amount", () => {
  const data = {
    success: true,
    data: {
      inputMint: "usdc",
      outputMint: "mint",
      inputAmount: "1000000",
      outputAmount: "500",
      otherAmountThreshold: "490",
      priceImpactPct: 0.1,
      routePlan: [{ poolId: "pool" }],
    },
  };
  assert.equal(
    parseRaydium(data, deployment, { usdc: "usdc" }, "1000000").outputAmount,
    "500",
  );
  assert.throws(() =>
    parseRaydium(
      data,
      { ...deployment, address: "other" },
      { usdc: "usdc" },
      "1000000",
    ),
  );
  assert.throws(() =>
    parseRaydium(
      { ...data, success: false },
      deployment,
      { usdc: "usdc" },
      "1000000",
    ),
  );
});
test("missing price impact stays unknown and unsafe raw numbers are rejected", () => {
  const data = {
    success: true,
    data: {
      inputMint: "usdc",
      outputMint: "mint",
      inputAmount: "100",
      outputAmount: "500",
      priceImpactPct: null,
    },
  };
  assert.equal(
    parseRaydium(data, deployment, { usdc: "usdc" }, "100").priceImpactPct,
    null,
  );
  assert.throws(() =>
    parseRaydium(
      { ...data, data: { ...data.data, outputAmount: 9007199254740992 } },
      deployment,
      { usdc: "usdc" },
      "100",
    ),
  );
});
test("Kyber responses reject unrelated or zero-output routes and preserve unknown gas", () => {
  const response = {
    code: 0,
    data: {
      routeSummary: {
        tokenIn: "0xIN",
        tokenOut: "0xOUT",
        amountIn: "100",
        amountOut: "200",
        route: [],
      },
    },
  };
  assert.equal(
    parseKyber(response, { address: "0xout" }, { usdc: "0xin" }, "100")
      .networkFeeUsd,
    null,
  );
  assert.throws(() =>
    parseKyber(response, { address: "0xBAD" }, { usdc: "0xin" }, "100"),
  );
  assert.throws(() =>
    parseKyber(
      { ...response, code: 1 },
      { address: "0xout" },
      { usdc: "0xin" },
      "100",
    ),
  );
});
test("Solana mint conversion uses its active onchain multiplier and detects a paused mint", () => {
  const account = {
    value: {
      data: {
        parsed: {
          type: "mint",
          info: {
            decimals: 9,
            extensions: [
              {
                extension: "scaledUiAmountConfig",
                state: {
                  multiplier: "1.1",
                  newMultiplier: "1.2",
                  newMultiplierEffectiveTimestamp: 200,
                },
              },
              { extension: "pausableConfig", state: { paused: false } },
            ],
          },
        },
      },
    },
  };
  assert.equal(parseSolanaMint(account, 199000).outputDecimals, 9);
  assert.equal(parseSolanaMint(account, 199000).sharesPerToken, 1.1);
  assert.equal(parseSolanaMint(account, 200000).sharesPerToken, 1.2);
  account.value.data.parsed.info.extensions[1].state.paused = true;
  assert.throws(() => parseSolanaMint(account, 200000));
});

test("Ondo oracle preserves the 18-decimal ratio and blocks a paused conversion", async () => {
  const { parseOndoOracle } = await import("../server/providers.mjs");
  const encoded =
    "0x" + 1250000000000000000n.toString(16).padStart(64, "0") + "0".repeat(64);
  assert.equal(parseOndoOracle(encoded), 1.25);
  assert.throws(() => parseOndoOracle(encoded.slice(0, -1) + "1"), /paused/);
  assert.throws(() => parseOndoOracle("0x"));
});

test("Kyber handoff uses website chain slugs, independent of API slugs", async () => {
  const { purchaseUrl } = await import("../server/providers.mjs");
  assert.match(
    purchaseUrl({ chain: "BinanceSmartChain", address: "0xtoken" }),
    /swap\/bnb\?/,
  );
  assert.match(
    purchaseUrl({ chain: "Ethereum", address: "0xtoken" }),
    /swap\/ethereum\?/,
  );
  assert.match(
    purchaseUrl({ chain: "Solana", address: "mint" }),
    /outputMint=mint/,
  );
});

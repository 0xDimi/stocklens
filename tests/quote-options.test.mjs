import test from "node:test";
import assert from "node:assert/strict";
import * as providers from "../server/providers.mjs";

// These are sanitized response shapes observed from the public APIs, not price fixtures.
const jupiter = {
  inputMint: "usdc",
  outputMint: "mint",
  inAmount: "1000000",
  outAmount: "4500",
  swapMode: "ExactIn",
  otherAmountThreshold: "4400",
  priceImpactPct: "0.001",
  feeBps: 10,
  routePlan: [{ swapInfo: { label: "Orca", ammKey: "pool" } }],
};
const velora = {
  priceRoute: {
    network: 1,
    side: "SELL",
    srcToken: "0xIN",
    destToken: "0xOUT",
    srcAmount: "1000000",
    destAmount: "5000",
    destAmountAfterFee: "4999",
    srcDecimals: 6,
    destDecimals: 18,
    partnerFee: 0.01,
    bestRoute: [
      {
        swaps: [
          {
            swapExchanges: [
              { exchange: "UniswapV3", poolAddresses: ["0xpool"] },
            ],
          },
        ],
      },
    ],
  },
};

test("Jupiter quote validates exact amount and contracts and identifies liquidity separately", async () => {
  assert.equal(typeof providers.parseJupiter, "function");
  const q = providers.parseJupiter(
    jupiter,
    { address: "mint" },
    { usdc: "usdc" },
    "1000000",
  );
  assert.equal(q.outputAmount, "4500");
  assert.deepEqual(q.liquidityVenues, ["Orca"]);
  assert.deepEqual(q.poolIds, ["pool"]);
  assert.throws(() =>
    providers.parseJupiter(
      { ...jupiter, inAmount: "999" },
      { address: "mint" },
      { usdc: "usdc" },
      "1000000",
    ),
  );
  assert.throws(() =>
    providers.parseJupiter(
      { ...jupiter, outputMint: "other" },
      { address: "mint" },
      { usdc: "usdc" },
      "1000000",
    ),
  );
  assert.throws(() =>
    providers.parseJupiter(
      { ...jupiter, outAmount: 4500 },
      { address: "mint" },
      { usdc: "usdc" },
      "1000000",
    ),
  );
});

test("Velora uses output after provider fees and rejects mismatched units, chain and side", () => {
  assert.equal(typeof providers.parseVelora, "function");
  const parse = (data) =>
    providers.parseVelora(
      data,
      { address: "0xout" },
      { usdc: "0xin", decimals: 6, evmId: 1 },
      "1000000",
      { outputDecimals: 18 },
    );
  const q = parse(velora);
  assert.equal(q.outputAmount, "4999");
  assert.deepEqual(q.liquidityVenues, ["UniswapV3"]);
  for (const changed of [
    { network: 56 },
    { side: "BUY" },
    { srcAmount: "999" },
    { destDecimals: 6 },
    { destToken: "0xother" },
    { destAmountAfterFee: "5001" },
  ])
    assert.throws(() =>
      parse({ priceRoute: { ...velora.priceRoute, ...changed } }),
    );
  const { destAmountAfterFee, ...withoutNet } = velora.priceRoute;
  assert.throws(() => parse({ priceRoute: withoutNet }));
});

test("quote option API keeps one actionable unavailable row for unsupported or halted deployments", async () => {
  assert.equal(typeof providers.getQuoteOptions, "function");
  const product = { issuer: "xstocks", symbol: "NVDAx", halted: false };
  const unsupported = await providers.getQuoteOptions(
    product,
    { chain: "Tron", address: "unsupported" },
    "1000",
  );
  assert.equal(unsupported.length, 1);
  assert.equal(unsupported[0].status, "unavailable");
  assert.match(unsupported[0].reason, /not supported/i);
  const halted = await providers.getQuoteOptions(
    { ...product, halted: true },
    { chain: "Ethereum", address: "0xout" },
    "1000",
  );
  assert.equal(halted.length, 1);
  assert.match(halted[0].reason, /halted/i);
});

test("Solana metadata rejects negative decimals before quote normalization", () => {
  assert.throws(() =>
    providers.parseSolanaMint({
      value: { data: { parsed: { type: "mint", info: { decimals: -1 } } } },
    }),
  );
});

test("comparison quote collection stops waiting before older observations expire", async (t) => {
  const { collectQuoteOptions } = await import("../server/quotes.mjs");
  assert.equal(typeof collectQuoteOptions, "function");
  const jobs = Array.from({ length: 3 }, (_, index) => ({
    product: { issuer: "test", symbol: `T${index}` },
    deployment: { chain: "Ethereum", address: `0x${index}` },
  }));
  const calls = [];
  let clock = 1_000;
  t.mock.method(Date, "now", () => clock);
  const rows = await collectQuoteOptions(jobs, "1000", {
    budgetMs: 25,
    concurrency: 1,
    getOptions: async (product) => {
      calls.push(product.symbol);
      if (product.symbol === "T0")
        return [{ id: "live", status: "quoted", fetchedAt: 1, expiresAt: 2 }];
      // Advance the clock to the comparison deadline while this source stays
      // pending. Native timers may fire just before Date.now reaches a wall
      // deadline; scheduler precision must not decide the queued-job assertion.
      clock += 25;
      return new Promise(() => {});
    },
  });
  assert.equal(rows.length, 3);
  assert.equal(rows[0].id, "live");
  assert.equal(rows[0].fetchedAt, 1);
  assert.equal(rows[1].status, "unavailable");
  assert.equal(rows[2].status, "unavailable");
  assert.deepEqual(calls, ["T0", "T1"]);
});

test("a catalog wrapper flag cannot authorize issuer share normalization", () => {
  assert.equal(
    providers.conversionIssuer({
      issuer: "xstocks",
      wrapped: true,
      symbol: "NVDAx",
      source: "https://api.xstocks.fi/api/v2/public/assets/NVDAx",
    }),
    null,
  );
});

test("Jupiter source expiry is preserved and current price impact takes precedence", () => {
  const expiry = "2026-10-20T08:00:00.000Z";
  const q = providers.parseJupiter(
    { ...jupiter, expireAt: expiry, priceImpact: -0.2 },
    { address: "mint" },
    { usdc: "usdc" },
    "1000000",
  );
  assert.equal(q.sourceExpiresAt, Date.parse(expiry));
  assert.equal(q.priceImpactPct, -0.2);
  assert.throws(() =>
    providers.parseJupiter(
      { ...jupiter, expireAt: "undated" },
      { address: "mint" },
      { usdc: "usdc" },
      "1000000",
    ),
  );
});

test("indicative getQuote forwards an expired caller deadline without starting source requests", async (t) => {
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("An expired quote must not start source work.");
  });
  const row = await providers.getQuote(
    { issuer: "test", symbol: "DEADLINE" },
    {
      chain: "Ethereum",
      address: "0x1111111111111111111111111111111111111111",
    },
    "1000",
    { deadlineAt: 0 },
  );
  assert.equal(row.status, "unavailable");
  assert.match(row.reason, /Quote deadline reached/);
});

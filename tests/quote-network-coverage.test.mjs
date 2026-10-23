import test from "node:test";
import assert from "node:assert/strict";
import { CHAINS } from "../server/config.mjs";
import * as adapters from "../server/public-quote-providers.mjs";

const expanded = {
  Optimism: [10, "optimism", true],
  Polygon: [137, "polygon", true],
  Avalanche: [43114, "avalanche", true],
  Mantle: [5000, null, false],
  HyperEVM: [999, "hyperevm", false],
  Monad: [143, "monad", false],
  Gnosis: [100, null, true],
  Ink: [57073, null, false],
  XLayer: [196, null, false],
  Morph: [2818, null, false],
};
test("expanded EVM quote networks have explicit provider capabilities and verified token units", () => {
  for (const [id, [evmId, kyber, velora]] of Object.entries(expanded)) {
    const chain = CHAINS[id];
    assert.equal(chain.evmId, evmId, id);
    assert.match(chain.usdc, /^0x[\da-f]{40}$/i, id);
    assert.equal(chain.decimals, 6, id);
    assert.match(chain.rpc(), /^https:\/\//, id);
    assert.equal(chain.quoteProviders.kyber, !!kyber, id);
    assert.equal(chain.quoteProviders.velora, velora, id);
    assert.equal(chain.kyber ?? null, kyber, id);
  }
});
test("public provider requests never assume all EVM networks support Velora", () => {
  for (const [id, chain] of Object.entries(CHAINS)) {
    assert.ok(chain.quoteProviders, id);
    const result = adapters.additionalQuoteProviders(
      { chain: id, address: "0x1111111111111111111111111111111111111111" },
      chain,
      "1000000",
      { outputDecimals: 18 },
    );
    assert.equal(
      result.some((x) => x.id === "velora"),
      chain.quoteProviders.velora,
      id,
    );
    assert.equal(
      result.some((x) => x.id === "lifi"),
      chain.quoteProviders.lifi,
      id,
    );
  }
});
test("networks with no verified USDC route retain an explicit coverage reason", () => {
  for (const id of ["Robinhood", "Tron", "TON"]) {
    assert.equal(CHAINS[id].usdc, undefined);
    assert.ok(CHAINS[id].quoteUnavailableReason);
    assert.equal(Object.values(CHAINS[id].quoteProviders).some(Boolean), false);
  }
});
test("LI.FI uses wallet-free same-chain route requests and pair-preserving handoffs", () => {
  for (const id of ["Ink", "XLayer", "Morph"]) {
    const chain = CHAINS[id],
      address = "0x1111111111111111111111111111111111111111";
    const adapter = adapters
      .additionalQuoteProviders({ chain: id, address }, chain, "123000000", {
        outputDecimals: 18,
      })
      .find((a) => a.id === "lifi");
    assert.ok(adapter, id);
    const url = new URL(adapter.buyUrl);
    assert.equal(url.origin, "https://jumper.exchange");
    assert.equal(url.searchParams.get("fromChain"), String(chain.evmId));
    assert.equal(url.searchParams.get("toChain"), String(chain.evmId));
    assert.equal(url.searchParams.get("fromToken"), chain.usdc);
    assert.equal(url.searchParams.get("toToken"), address);
    assert.equal(url.searchParams.get("fromAmount"), "123.000000");
  }
});

const lifiRoute = () => {
  const token = { address: CHAINS.Ink.usdc, chainId: 57073, decimals: 6 };
  const output = {
    address: "0xc845b2894dbddd03858fd2d643b4ef725fe0849d",
    chainId: 57073,
    decimals: 18,
  };
  return {
    fromChainId: 57073,
    toChainId: 57073,
    containsSwitchChain: false,
    fromAmount: "1000000000",
    fromToken: token,
    toToken: output,
    toAmount: "4647508243457491541",
    toAmountMin: "4624270702240204083",
    gasCostUSD: "0.0001",
    steps: [
      {
        action: { fromChainId: 57073, toChainId: 57073 },
        estimate: {
          feeCosts: [
            { amount: "2500000", percentage: "0.0025", included: true },
          ],
        },
        includedSteps: [
          { type: "swap", tool: "fly", toolDetails: { name: "Fly" } },
        ],
      },
    ],
  };
};
const parseRoute = (route) =>
  adapters.parseLifi(
    { routes: [route] },
    { address: "0xc845b2894dbddd03858fd2d643b4ef725fe0849d" },
    CHAINS.Ink,
    "1000000000",
    { outputDecimals: 18 },
  );
test("LI.FI preserves exact fee-inclusive output, slippage floor and underlying venue", () => {
  const parsed = parseRoute(lifiRoute());
  assert.equal(parsed.outputAmount, "4647508243457491541");
  assert.equal(parsed.minimumOutputAmount, "4624270702240204083");
  assert.equal(parsed.providerFeeBps, 25);
  assert.equal(parsed.networkFeeUsd, 0.0001);
  assert.deepEqual(parsed.liquidityVenues, ["Fly"]);
});
test("LI.FI rejects wrong token, network, amount, decimals, bridging and undisclosed fees", () => {
  const mutations = [
    (q) => (q.fromChainId = 1),
    (q) => (q.toChainId = 1),
    (q) => (q.containsSwitchChain = true),
    (q) => (q.fromAmount = "1000000001"),
    (q) => (q.fromToken.address = q.toToken.address),
    (q) => (q.toToken.address = q.fromToken.address),
    (q) => (q.toToken.chainId = 1),
    (q) => (q.fromToken.decimals = 18),
    (q) => (q.toToken.decimals = 6),
    (q) => (q.toAmount = "0"),
    (q) => (q.toAmountMin = "4647508243457491542"),
    (q) => (q.steps[0].action.toChainId = 1),
    (q) => delete q.steps[0].estimate.feeCosts,
    (q) => (q.steps[0].estimate.feeCosts[0].included = false),
    (q) => delete q.steps[0].estimate.feeCosts[0].included,
    (q) => (q.steps[0].estimate.feeCosts[0].percentage = "NaN"),
    (q) => (q.steps[0].estimate.feeCosts[0].amount = "-1"),
  ];
  for (const mutate of mutations) {
    const q = lifiRoute();
    mutate(q);
    assert.throws(() => parseRoute(q));
  }
});
test("LI.FI keyless requester preserves POST payload and caps actual requests in the rolling quota", async () => {
  let clock = 100,
    calls = [];
  const load = adapters.createLifiRequester({
    maxRequests: 2,
    windowMs: 100,
    intervalMs: 1,
    now: () => clock,
    send: async (url, options) => {
      calls.push({ url, options });
      return { routes: [] };
    },
  });
  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"fromAmount":"1000000"}',
  };
  await load("https://li.quest/v1/advanced/routes", options);
  await load("https://li.quest/v1/advanced/routes", options);
  await assert.rejects(
    load("https://li.quest/v1/advanced/routes", options),
    /quota reached/,
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.body, options.body);
  clock = 201;
  await load("https://li.quest/v1/advanced/routes", options);
  assert.equal(calls.length, 3);
  await assert.rejects(
    load("https://li.quest/v1/advanced/routes", { deadlineAt: 0 }),
    /deadline/,
  );
  assert.equal(calls.length, 3);
});
test("LI.FI stops outbound requests after a shared-IP 429 response", async () => {
  let calls = 0,
    clock = 100;
  const load = adapters.createLifiRequester({
    windowMs: 100,
    intervalMs: 1,
    now: () => clock,
    send: async () => {
      calls++;
      const error = new Error("limited");
      error.status = 429;
      throw error;
    },
  });
  await assert.rejects(load("https://li.quest/v1/advanced/routes"), /limited/);
  await assert.rejects(
    load("https://li.quest/v1/advanced/routes"),
    /quota reached/,
  );
  assert.equal(calls, 1);
  clock = 201;
  await assert.rejects(load("https://li.quest/v1/advanced/routes"), /limited/);
  assert.equal(calls, 2);
});
test("a malformed LI.FI candidate cannot hide another valid exact route", () => {
  const invalid = lifiRoute();
  invalid.toToken.address = "0x1111111111111111111111111111111111111111";
  const valid = lifiRoute();
  const parsed = adapters.parseLifi(
    { routes: [invalid, valid] },
    { address: valid.toToken.address },
    CHAINS.Ink,
    "1000000000",
    { outputDecimals: 18 },
  );
  assert.equal(parsed.outputAmount, valid.toAmount);
});

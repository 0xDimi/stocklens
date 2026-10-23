import test from "node:test";
import assert from "node:assert/strict";
import {
  getIssuerConversion,
  supportsIssuerConversion,
} from "../server/issuer-conversions.mjs";

const address = "0xb20000000000000000000078ee7ce2fe4908108c";
const product = {
  issuer: "coinbase",
  symbol: "NVDAC",
  name: "NVIDIA (Coinbase Tokenized Stock)",
};
const deployment = { chain: "Base", address };
const chain = {
  id: "Base",
  evmId: 8453,
  rpc: () => "https://base-rpc.publicnode.com",
};
const word = (n) => "0x" + BigInt(n).toString(16).padStart(64, "0");
const options = (tokens, multiplier = 1000537939576369481n) => ({
  chain,
  now: 1792749900000,
  read: async () => ({ tokens }),
  rpc: async (_url, method, params) => {
    if (method === "eth_chainId")
      return (
        "0x" +
        BigInt(
          _url.includes("arbitrum") ? 42161 : _url.includes("bsc") ? 56 : 8453,
        ).toString(16)
      );
    assert.equal(method, "eth_call");
    assert.equal(params[0].data, "0xa60bf13d");
    return word(multiplier);
  },
});

test("Coinbase raw token quantities use the live current share multiplier", async () => {
  const result = await getIssuerConversion(
    product,
    deployment,
    options([
      {
        contract_address: address,
        multiplier: 1.0005379395763694,
        decimals: 8,
      },
    ]),
  );
  assert.equal(result.sharesPerToken, 1.0005379395763694);
  assert.equal(result.outputUnit, "raw-token");
  assert.match(result.conversionSource, /docs.base.org/);
  assert.equal(result.conversionObservedAt, "2026-10-23T10:05:00.000Z");
});

test("same ticker and B20 prefix cannot authorize a counterfeit contract", async () => {
  assert.equal(
    await getIssuerConversion(
      product,
      { ...deployment, address: "0xb2000000000000000000000000000000000001" },
      options([{ contract_address: address, multiplier: 1 }]),
    ),
    null,
  );
});

test("same Coinbase contract on another chain cannot authorize conversion", async () => {
  assert.equal(
    await getIssuerConversion(
      product,
      { ...deployment, chain: "Ethereum" },
      options([{ contract_address: address, multiplier: 1 }]),
    ),
    null,
  );
});

test("missing, malformed and zero live multipliers fail closed", async () => {
  for (const response of ["0x", word(0), word(1) + "00", null]) {
    const opts = options([{ contract_address: address, multiplier: 1 }]);
    opts.rpc = async (_url, method) => method === 'eth_chainId' ? '0x2105' : response;
    assert.equal(await getIssuerConversion(product, deployment, opts), null);
  }
});

test("Coinbase registry pages are followed to match the exact contract", async () => {
  let count = 0;
  const opts = options([]);
  opts.read = async (url) => {
    count++;
    return url.includes("page_token=next")
      ? { tokens: [{ contract_address: address, decimals: 8 }] }
      : { tokens: [], next_page_token: "next" };
  };
  assert.ok(
    (await getIssuerConversion(product, deployment, opts)).sharesPerToken > 1,
  );
  assert.equal(count, 2);
});

test("failed issuer/RPC responses and wrapped unknown assets retain raw quotes", async () => {
  const opts = options([]);
  opts.read = async () => {
    throw new Error("upstream unavailable");
  };
  assert.equal(await getIssuerConversion(product, deployment, opts), null);
  assert.equal(
    await getIssuerConversion({ ...product, wrapped: true }, deployment, opts),
    null,
  );
  assert.equal(supportsIssuerConversion({ issuer: "unknown" }), false);
  assert.equal(supportsIssuerConversion(product), true);
});

const realityAddress = "0x0a85b6ebe3c150a1979a65656e304033d62b1e12";
const reality = { issuer: "reality", symbol: "RNVDA" };
const arb = {
  id: "Arbitrum",
  evmId: 42161,
  rpc: () => "https://arbitrum-one-rpc.publicnode.com",
};
test("Reality uses the published exact network contract and ERC8056 multiplier", async () => {
  const opts = {
    ...options([], 2000000000000000000n),
    chain: arb,
    read: async () => ({
      code: "200",
      data: [
        {
          status: "active",
          tokens: [{ address: realityAddress, network: "ARB", decimals: 18 }],
        },
      ],
    }),
  };
  const result = await getIssuerConversion(
    reality,
    { chain: "Arbitrum", address: realityAddress },
    opts,
  );
  assert.equal(result.sharesPerToken, 2);
  assert.equal(result.outputUnit, "raw-token");
});
test("Reality ticker or wrong network cannot authorize a conversion", async () => {
  const opts = {
    ...options([]),
    chain: arb,
    read: async () => ({
      code: "200",
      data: [
        {
          status: "active",
          tokens: [{ address: realityAddress, network: "Morph", decimals: 18 }],
        },
      ],
    }),
  };
  assert.equal(
    await getIssuerConversion(
      reality,
      { chain: "Arbitrum", address: realityAddress },
      opts,
    ),
    null,
  );
});

const st0xWrapper = "0xfb5b41acdba20a3230f84be995173cfb98b8d6e7";
const st0xAsset = "0x7271a3c91bb6070ed09333b84a815949d4f16d14";
const st0x = { issuer: "st0x", symbol: "WTNVDA", wrapped: true };
const issuerMarkdown = `# NVIDIA Corporation\nNVDA · NasdaqGS · \`tNVDA\` / \`wtNVDA\`\n## Addresses\n### Base\nchain id 8453\n- **tNVDA**: \`${st0xAsset}\`\n- **wtNVDA**: \`${st0xWrapper}\`\n### Ethereum\nchain id 1\n- **tNVDA**: \`0x1111111111111111111111111111111111111111\`\n- **wtNVDA**: \`0x2222222222222222222222222222222222222222\`\n`;
const st0xOptions = () => ({
  ...options([]),
  read: async () => issuerMarkdown,
  rpc: async (_url, method, params) => {
    if (method === "eth_chainId") return "0x2105";
    assert.equal(method, "eth_call");
    const call = params[0];
    if (call.data === "0x38d52e0f")
      return "0x" + st0xAsset.slice(2).padStart(64, "0");
    if (call.data === "0x313ce567") return word(18);
    if (call.data.startsWith("0x07a2d13a")) return word(1001000000000000000n);
    throw new Error("unexpected call");
  },
});
test("ST0x wrapper shares are converted through the current issuer-bound vault", async () => {
  const result = await getIssuerConversion(
    st0x,
    { chain: "Base", address: st0xWrapper },
    st0xOptions(),
  );
  assert.equal(result.sharesPerToken, 1.001);
  assert.equal(result.outputUnit, "raw-token");
});
test("a vault naming a different asset cannot authorize underlying shares", async () => {
  const opts = st0xOptions();
  const rpc = opts.rpc;
  opts.rpc = async (url, method, params) =>
    params[0].data === "0x38d52e0f" ? word(1) : rpc(url, method, params);
  assert.equal(
    await getIssuerConversion(
      st0x,
      { chain: "Base", address: st0xWrapper },
      opts,
    ),
    null,
  );
});
test("ST0x contract list must match the exact chain and wrapper address", async () => {
  assert.equal(
    await getIssuerConversion(
      st0x,
      { chain: "Base", address: "0x2222222222222222222222222222222222222222" },
      st0xOptions(),
    ),
    null,
  );
});

const bstockAddress = "0x02fca66c1d1afb4e2a7884261eb00f63598a7436";
const bstock = { issuer: "bstocks", symbol: "NVDAB" };
const bsc = {
  id: "BinanceSmartChain",
  evmId: 56,
  rpc: () => "https://bsc-rpc.publicnode.com",
};
test("bStocks use current onchain units after Binance type=3 exact contract authorization", async () => {
  const opts = {
    ...options([], 1000778228650247609n),
    chain: bsc,
    read: async (url) => {
      assert.match(url, /type=3$/);
      return {
        code: "000000",
        success: true,
        data: [
          {
            chainId: "56",
            contractAddress: bstockAddress,
            type: 3,
            symbol: "NVDAB",
            multiplier: "1.000778223752807865",
          },
        ],
      };
    },
  };
  const result = await getIssuerConversion(
    bstock,
    { chain: "BinanceSmartChain", address: bstockAddress },
    opts,
  );
  assert.ok(result);
  assert.equal(result.sharesPerToken, 1.0007782286502476);
  assert.equal(result.outputUnit, "raw-token");
});
test("bStocks reject another issuer type even with the same contract or ticker", async () => {
  const opts = {
    ...options([]),
    chain: bsc,
    read: async () => ({
      code: "000000",
      success: true,
      data: [
        {
          chainId: "56",
          contractAddress: bstockAddress,
          type: 1,
          symbol: "NVDAB",
        },
      ],
    }),
  };
  assert.equal(
    await getIssuerConversion(
      bstock,
      { chain: "BinanceSmartChain", address: bstockAddress },
      opts,
    ),
    null,
  );
});

test("an RPC connected to another EVM network cannot supply share units", async () => {
  const opts = options([{ contract_address: address, symbol: "NVDAc" }]);
  opts.rpc = async (_url, method) =>
    method === "eth_chainId" ? "0x1" : word(1000000000000000000n);
  assert.equal(await getIssuerConversion(product, deployment, opts), null);
});
test("issuer registry symbols cannot contradict the catalog product identity", async () => {
  assert.equal(
    await getIssuerConversion(
      product,
      deployment,
      options([{ contract_address: address, symbol: "AAPLc" }]),
    ),
    null,
  );
});

const rhAddress = "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec";
test("Robinhood reads the shares per token from an exact active native deployment", async () => {
  const opts = {
    ...options([]),
    chain: {
      id: "Robinhood",
      evmId: 4663,
      rpc: () => "https://rpc.mainnet.chain.robinhood.com",
    },
    read: async () => ({
      assets: [
        {
          status: "ASSET_STATUS_ACTIVE",
          tokenSymbol: "NVDA",
          deployments: [{ chainId: 4663, contractAddress: rhAddress }],
        },
      ],
    }),
    rpc: async (_url, method) =>
      method === "eth_chainId" ? "0x1237" : word(1000775159164630595n),
  };
  const result = await getIssuerConversion(
    { issuer: "robinhood", symbol: "NVDA" },
    { chain: "Robinhood", address: rhAddress },
    opts,
  );
  assert.ok(result);
  assert.equal(result.sharesPerToken, 1.0007751591646306);
});

const backpackMint = "NVDAVuiB7hwd3m5Wa1JuHNovPaPG6BH1QNztbKFxNjv";
const backpack = { issuer: "backpack", symbol: "NVDA" };
const backpackAccount = (
  state = {
    multiplier: "1",
    newMultiplier: "2",
    newMultiplierEffectiveTimestamp: 1792749900,
  },
) => ({
  value: {
    owner: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
    data: {
      parsed: {
        type: "mint",
        info: {
          decimals: 6,
          isInitialized: true,
          extensions: [
            { extension: "scaledUiAmountConfig", state },
            { extension: "pausableConfig", state: { paused: false } },
          ],
        },
      },
    },
  },
});
const backpackOptions = () => ({
  chain: { id: "Solana", rpc: () => "https://api.mainnet-beta.solana.com" },
  now: 1792749900000,
  read: async () => [
    {
      symbol: "NVDA.US",
      tokens: [
        {
          blockchain: "Solana",
          contractAddress: backpackMint,
          nativeDecimals: 6,
        },
      ],
    },
  ],
  mintAccount: backpackAccount(),
  rpc: async () => {
    throw new Error("already fetched mint must be reused");
  },
});
test("Backpack converts exact listed Solana raw mint units using scheduled current scaling", async () => {
  const result = await getIssuerConversion(
    backpack,
    { chain: "Solana", address: backpackMint },
    backpackOptions(),
  );
  assert.ok(result);
  assert.equal(result.sharesPerToken, 2);
  assert.equal(result.outputUnit, "raw-token");
});
test("Backpack rejects unknown mint identity and paused token programs", async () => {
  assert.equal(
    await getIssuerConversion(
      backpack,
      { chain: "Solana", address: "FakeMint11111111111111111111111111111111" },
      backpackOptions(),
    ),
    null,
  );
  const opts = backpackOptions();
  opts.mintAccount.value.data.parsed.info.extensions[1].state.paused = true;
  assert.equal(
    await getIssuerConversion(
      backpack,
      { chain: "Solana", address: backpackMint },
      opts,
    ),
    null,
  );
});

const dinariAddress = "0x4dafffddea93ddf1e0e7b61e844331455053ce5c";
test("native Dinari rebasing ERC20 units are shares only if its published production factory confirms membership", async () => {
  const opts = {
    ...options([]),
    chain: arb,
    read: async () => ({
      deployments: {
        production: { 42161: "0xb4ca72ea4d072c779254269fd56093d3adf603b8" },
      },
    }),
    rpc: async (_url, method, params) => {
      if (method === "eth_chainId") return "0xa4b1";
      if (params[0].data === "0x313ce567") return word(18);
      if (params[0].data.startsWith("0x25f28f16")) return word(1);
      throw new Error("unexpected call");
    },
  };
  const result = await getIssuerConversion(
    { issuer: "dinari", symbol: "NVDA" },
    { chain: "Arbitrum", address: dinariAddress },
    opts,
  );
  assert.ok(result);
  assert.equal(result.sharesPerToken, 1);
});
test("a Dinari staging factory never authorizes a production token", async () => {
  const opts = {
    ...options([]),
    chain: arb,
    read: async () => ({
      deployments: {
        staging: { 42161: "0xb4ca72ea4d072c779254269fd56093d3adf603b8" },
      },
    }),
  };
  assert.equal(
    await getIssuerConversion(
      { issuer: "dinari", symbol: "NVDA" },
      { chain: "Arbitrum", address: dinariAddress },
      opts,
    ),
    null,
  );
});

test("Backpack scheduled scaling uses the clock after the issuer registry read completes", async (t) => {
  const activation = 1792749900000;
  let clock = activation - 1;
  t.mock.method(Date, "now", () => clock);
  const opts = backpackOptions();
  delete opts.now;
  const read = opts.read;
  opts.read = async (...args) => {
    const result = await read(...args);
    clock = activation;
    return result;
  };
  const result = await getIssuerConversion(backpack, { chain: "Solana", address: backpackMint }, opts);
  assert.ok(result);
  assert.equal(result.sharesPerToken, 2);
  assert.equal(result.conversionObservedAt, new Date(activation).toISOString());
});

test("Backpack conversion validity ends when a pending multiplier activates", async () => {
  const activation = 1792749900000;
  const opts = backpackOptions();
  opts.now = activation - 1;
  const result = await getIssuerConversion(backpack, { chain: "Solana", address: backpackMint }, opts);
  assert.ok(result);
  assert.equal(result.sharesPerToken, 1);
  assert.equal(result.conversionValidUntil, activation);
});

test("Backpack active scheduled multiplier has no obsolete activation deadline", async () => {
  const opts = backpackOptions();
  const result = await getIssuerConversion(backpack, { chain: "Solana", address: backpackMint }, opts);
  assert.ok(result);
  assert.equal(result.sharesPerToken, 2);
  assert.equal(result.conversionValidUntil, null);
});

test("issuer conversion starts no registry request after its deadline expires during the chain read", async (t) => {
  let clock = 15;
  t.mock.method(Date, "now", () => clock);
  let registryReads = 0;
  const opts = {
    ...options([{ contract_address: address, symbol: "NVDAc" }]),
    deadlineAt: 30,
    read: async () => { registryReads++; return { tokens: [{ contract_address: address }] }; },
    rpc: async (_url, method) => {
      assert.equal(method, "eth_chainId");
      clock = 40;
      return "0x2105";
    },
  };
  assert.equal(await getIssuerConversion(product, deployment, opts), null);
  assert.equal(registryReads, 0);
});

test("issuer conversion starts no token RPC after its registry read consumes the deadline", async (t) => {
  let clock = 15;
  t.mock.method(Date, "now", () => clock);
  let tokenReads = 0;
  const opts = {
    ...options([{ contract_address: address, symbol: "NVDAc" }]),
    deadlineAt: 30,
    read: async () => { clock = 40; return { tokens: [{ contract_address: address, symbol: "NVDAc" }] }; },
    rpc: async (_url, method) => {
      if (method === "eth_chainId") return "0x2105";
      tokenReads++;
      return word(1000000000000000000n);
    },
  };
  assert.equal(await getIssuerConversion(product, deployment, opts), null);
  assert.equal(tokenReads, 0);
});

import test from "node:test";
import assert from "node:assert/strict";
import { parseSpotPairs, getSpotObservations } from "../server/public-spot.mjs";
const stock = {
  id: "stock",
  products: [
    {
      issuer: "xstocks",
      name: "NVIDIA xStock",
      symbol: "NVDAx",
      deployments: [
        {
          chain: "Ethereum",
          address: "0x1111111111111111111111111111111111111111",
        },
      ],
    },
  ],
};
const product = stock.products[0],
  deployment = product.deployments[0];
const candidate = { stock, product, deployment };
const at = new Date().toISOString();
const pair = {
  chainId: "ethereum",
  pairAddress: "0x2222222222222222222222222222222222222222",
  baseToken: { address: deployment.address },
  priceUsd: "102",
  liquidity: { usd: 50000 },
  volume: { h24: 1000 },
  dexId: "uniswap",
};
test("exact-contract spot selection excludes ticker collisions, wrong chains, quote-token orientation, and dust pools", () => {
  const rows = parseSpotPairs(
    [
      { ...pair, chainId: "bsc" },
      {
        ...pair,
        baseToken: { address: "0x3333333333333333333333333333333333333333" },
      },
      { ...pair, liquidity: { usd: 0.22 } },
      pair,
    ],
    [candidate],
    at,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].rawPrice, 102);
  assert.equal(rows[0].address, deployment.address);
  assert.equal(rows[0].at, Date.parse(at));
  assert.equal(rows[0].priceTimeBasis, "snapshot-retrieval");
});
test("spot lookup batches contracts and normalizes only verified exact-deployment units", async () => {
  const requests = [];
  const result = await getSpotObservations([stock], {
    getSource: async (path) => {
      requests.push(path);
      return { data: [pair], retrievedAt: at };
    },
    getUnits: async () => ({
      sharesPerToken: 2,
      conversionSource: "https://issuer.test/units",
      outputUnit: "raw-token",
    }),
  });
  assert.equal(result.get("stock").price, 51);
  assert.equal(requests.length, 1);
  assert.match(requests[0], /^\/tokens\/v1\/ethereum\//);
});
test("stale pool sources and undisclosed Solana scaled-price units cannot authorize normalization", async () => {
  const stale = await getSpotObservations([stock], {
    getSource: async () => ({ data: [pair], retrievedAt: at, stale: true }),
    getUnits: async () => ({
      sharesPerToken: 1,
      conversionSource: "https://issuer.test/units",
    }),
  });
  assert.equal(stale.size, 0);
  const sol = {
    id: "sol",
    products: [
      {
        ...product,
        deployments: [
          {
            chain: "Solana",
            address: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
          },
        ],
      },
    ],
  };
  const result = await getSpotObservations([sol], {
    getSource: async () => ({
      data: [
        {
          ...pair,
          chainId: "solana",
          baseToken: { address: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh" },
        },
      ],
      retrievedAt: at,
    }),
    getUnits: async () => ({
      sharesPerToken: 1.1,
      conversionSource: "https://issuer.test/units",
      outputUnit: "raw-token",
    }),
  });
  assert.equal(result.size, 0);
});
test("multiple pools for an unnormalizable deployment cannot hide a verified alternative deployment", async () => {
  const bscProduct = {
    issuer: "ondo",
    name: "NVIDIA (Ondo Tokenized Stock)",
    symbol: "NVDAon",
    deployments: [
      {
        chain: "BinanceSmartChain",
        address: "0x4444444444444444444444444444444444444444",
      },
    ],
  };
  const solAddress = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
  const many = {
    id: "many",
    products: [
      { ...product, deployments: [{ chain: "Solana", address: solAddress }] },
      bscProduct,
    ],
  };
  const rows = [
    ...Array.from({ length: 7 }, (_, i) => ({
      ...pair,
      chainId: "solana",
      pairAddress: "A".repeat(25) + String(i),
      baseToken: { address: solAddress },
      liquidity: { usd: 50000 + i },
    })),
    {
      ...pair,
      chainId: "bsc",
      baseToken: { address: bscProduct.deployments[0].address },
      liquidity: { usd: 5000 },
    },
  ];
  const result = await getSpotObservations([many], {
    getSource: async () => ({ data: rows, retrievedAt: at }),
    getUnits: async (_product, dep) => ({
      sharesPerToken: dep.chain === "Solana" ? 1.1 : 1,
      conversionSource: "https://issuer.test/units",
    }),
  });
  assert.equal(result.get("many")?.chain, "BinanceSmartChain");
});

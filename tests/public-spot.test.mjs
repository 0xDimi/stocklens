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

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const bscDeployment = {
  chain: "BinanceSmartChain",
  address: "0x4444444444444444444444444444444444444444",
};
const multiChainStock = {
  ...stock,
  products: [{ ...product, deployments: [deployment, bscDeployment] }],
};
const bscPair = {
  ...pair,
  chainId: "bsc",
  baseToken: { address: bscDeployment.address },
  liquidity: { usd: 5000 },
};
const verifiedUnits = {
  sharesPerToken: 1,
  conversionSource: "https://issuer.test/units",
};

test("a slow unrelated chain cannot consume the time needed to normalize a ready chain", async () => {
  const result = await getSpotObservations([multiChainStock], {
    budgetMs: 150,
    getSource: async (path) => {
      if (path.includes("/bsc/")) {
        await delay(220);
        throw new Error("Chain source timed out");
      }
      return { data: [pair], retrievedAt: new Date().toISOString() };
    },
    getUnits: async () => {
      await delay(25);
      return verifiedUnits;
    },
  });
  assert.equal(result.get("stock")?.price, 102);
  assert.equal(result.get("stock")?.chain, "Ethereum");
});

test("a slow high-liquidity conversion cannot hide a ready verified alternative", async () => {
  const result = await getSpotObservations([multiChainStock], {
    budgetMs: 150,
    getSource: async () => ({
      data: [pair, bscPair],
      retrievedAt: new Date().toISOString(),
    }),
    getUnits: async (_product, dep) => {
      await delay(dep.chain === "Ethereum" ? 220 : 10);
      return verifiedUnits;
    },
  });
  assert.equal(result.get("stock")?.chain, "BinanceSmartChain");
});

test("the highest-liquidity verified deployment wins regardless of completion order", async () => {
  for (const slowChain of ["Ethereum", "BinanceSmartChain"]) {
    const result = await getSpotObservations([multiChainStock], {
      budgetMs: 300,
      getSource: async () => ({
        data: [bscPair, pair],
        retrievedAt: new Date().toISOString(),
      }),
      getUnits: async (_product, dep) => {
        await delay(dep.chain === slowChain ? 30 : 5);
        return verifiedUnits;
      },
    });
    assert.equal(result.get("stock")?.chain, "Ethereum");
  }
});

test("changing batch composition retains fresh verified deployment observations with their original time", async () => {
  let currentTime = Date.now();
  const observedAt = new Date(currentTime).toISOString();
  let failing = false;
  const getSource = async () => {
    if (failing) throw new Error("Source temporarily unavailable");
    return { data: [pair], retrievedAt: observedAt };
  };
  const getUnits = async () => verifiedUnits;
  const options = { getSource, getUnits, now: () => currentTime };
  assert.equal((await getSpotObservations([stock], options)).get("stock")?.price, 102);
  failing = true;
  currentTime += 60000;
  const addedStock = { ...stock, id: "other-stock", products: [] };
  const retained = await getSpotObservations([stock, addedStock], options);
  assert.equal(retained.get("stock")?.price, 102);
  assert.equal(retained.get("stock")?.at, Date.parse(observedAt));
  assert.equal(retained.get("stock")?.retrievedAt, observedAt);
  assert.equal(retained.get("stock")?.retained, true);
  currentTime += 300001;
  assert.equal((await getSpotObservations([stock], options)).size, 0);
});

test("retention cannot authorize a different contract or units loader after a source failure", async () => {
  let failing = false;
  const getSource = async () => {
    if (failing) throw new Error("Source unavailable");
    return { data: [pair], retrievedAt: new Date().toISOString() };
  };
  const getUnits = async () => verifiedUnits;
  await getSpotObservations([stock], { getSource, getUnits });
  failing = true;
  const changed = {
    ...stock,
    products: [{ ...product, deployments: [bscDeployment] }],
  };
  assert.equal((await getSpotObservations([changed], { getSource, getUnits })).size, 0);
  assert.equal((await getSpotObservations([stock], {
    getSource,
    getUnits: async () => verifiedUnits,
  })).size, 0);
});

test("a refreshed verified pool outranks a retained higher-liquidity pool", async () => {
  let currentTime = Date.now();
  let failingEthereum = false;
  const getSource = async (path) => {
    const ethereum = path.includes("/ethereum/");
    if (ethereum && failingEthereum) throw new Error("Ethereum source unavailable");
    return {
      data: [ethereum ? pair : bscPair],
      retrievedAt: new Date(currentTime).toISOString(),
    };
  };
  const getUnits = async () => verifiedUnits;
  const options = { getSource, getUnits, now: () => currentTime };
  const original = await getSpotObservations([multiChainStock], options);
  assert.equal(original.get("stock")?.chain, "Ethereum");
  currentTime += 60000;
  failingEthereum = true;
  const refreshed = await getSpotObservations([multiChainStock], options);
  assert.equal(refreshed.get("stock")?.chain, "BinanceSmartChain");
  assert.equal(refreshed.get("stock")?.at, currentTime);
  assert.notEqual(refreshed.get("stock")?.retained, true);
});

test("a ready chain gets conversion capacity before one large slow chain exhausts the budget", async () => {
  const stocks = Array.from({ length: 12 }, (_, i) => ({
    ...stock,
    id: "stock-" + i,
    products: [{
      ...product,
      deployments: [
        { chain: "Ethereum", address: "0x" + (i + 1).toString(16).padStart(40, "0") },
        { chain: "BinanceSmartChain", address: "0x" + (i + 101).toString(16).padStart(40, "0") },
      ],
    }],
  }));
  let active = 0, maximum = 0;
  const result = await getSpotObservations(stocks, {
    budgetMs: 200,
    getSource: async (path) => {
      const bsc = path.includes("/bsc/");
      if (bsc) await delay(10);
      return {
        data: stocks.map((s) => ({
          ...pair,
          chainId: bsc ? "bsc" : "ethereum",
          baseToken: { address: s.products[0].deployments[bsc ? 1 : 0].address },
        })),
        retrievedAt: new Date().toISOString(),
      };
    },
    getUnits: async (_product, dep) => {
      maximum = Math.max(maximum, ++active);
      try {
        await delay(dep.chain === "Ethereum" ? 150 : 1);
        return verifiedUnits;
      } finally {
        active--;
      }
    },
  });
  assert.ok(maximum <= 6, "unit refresh concurrency must remain bounded");
  assert.ok(result.size > 6, "ready-chain conversions must run before more slow-chain jobs");
});

test("a timed-out conversion cannot later populate or renew retained observations", async () => {
  let failing = false;
  const getSource = async () => {
    if (failing) throw new Error("Source unavailable");
    return { data: [pair], retrievedAt: new Date().toISOString() };
  };
  const getUnits = async () => {
    await delay(100);
    return verifiedUnits;
  };
  const result = await getSpotObservations([stock], { getSource, getUnits, budgetMs: 30 });
  assert.equal(result.size, 0);
  await delay(110);
  assert.equal(result.size, 0);
  failing = true;
  assert.equal((await getSpotObservations([stock], { getSource, getUnits })).size, 0);
});

test("large contract batches do not queue every source request for one chain ahead of another", async () => {
  const stocks = Array.from({ length: 61 }, (_, i) => ({
    ...stock,
    id: "large-stock-" + i,
    products: [{
      ...product,
      deployments: [
        { chain: "Ethereum", address: "0x" + (i + 1).toString(16).padStart(40, "0") },
        ...(i === 60 ? [bscDeployment] : []),
      ],
    }],
  }));
  const result = await getSpotObservations(stocks, {
    budgetMs: 150,
    getSource: async (path) => {
      if (path.includes("/ethereum/")) {
        await delay(220);
        throw new Error("Chain unavailable");
      }
      return { data: [bscPair], retrievedAt: new Date().toISOString() };
    },
    getUnits: async () => verifiedUnits,
  });
  assert.equal(result.get("large-stock-60")?.chain, "BinanceSmartChain");
});

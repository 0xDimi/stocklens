import test from "node:test";
import assert from "node:assert/strict";
import { parseSpotPairs, getSpotObservations } from "../server/public-spot.mjs";
const address = "0xb20000000000000000000078ee7ce2fe4908108c";
for (const [chain, chainId, issuer] of [
  ["Base", "base", "coinbase"],
  ["Ink", "ink", "xstocks"],
]) {
  test(`verified exact-contract pools on ${chain} can supply a normalized onchain price`, async () => {
    const product = {
      issuer,
      name: issuer === "xstocks" ? "NVIDIA xStock" : "NVIDIA Coinbase",
      symbol: "NVDAC",
      deployments: [{ chain, address }],
    };
    const stock = { id: "nvda", products: [product] };
    const candidate = { stock, product, deployment: product.deployments[0] };
    const at = new Date().toISOString();
    const pair = {
      chainId,
      pairAddress: "0x" + "1".repeat(40),
      baseToken: { address },
      priceUsd: "200",
      liquidity: { usd: 50000 },
      volume: { h24: 100 },
      dexId: "uniswap",
    };
    assert.equal(parseSpotPairs([pair], [candidate], at).length, 1);
    assert.equal(
      parseSpotPairs([{ ...pair, chainId: "wrong-chain" }], [candidate], at)
        .length,
      0,
    );
    const result = await getSpotObservations([stock], {
      getSource: async () => ({ data: [pair], retrievedAt: at }),
      getUnits: async () => ({
        sharesPerToken: 2,
        conversionSource: "https://issuer.test/current-units",
      }),
    });
    assert.equal(result.get("nvda")?.price, 100);
  });
}

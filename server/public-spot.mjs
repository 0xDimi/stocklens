import { sourceClient } from "./source-client.mjs";
import { conversionIssuer, getTokenUnits } from "./providers.mjs";
import { mapLimit, observeWithin } from "./http.mjs";
import { validAddress } from "./config.mjs";

const NETWORKS = {
  Ethereum: "ethereum",
  BinanceSmartChain: "bsc",
  Solana: "solana",
};
const API = "https://api.dexscreener.com";
const read = sourceClient(
  "DEX Screener",
  () => API,
  250,
  () => ({}),
  {
    validate: Array.isArray,
  },
);
const key = (chain, address) =>
  chain === "Solana" ? address : String(address).toLowerCase();
const positive = (value) =>
  value != null &&
  value !== "" &&
  typeof value !== "boolean" &&
  Number.isFinite(Number(value)) &&
  Number(value) > 0
    ? Number(value)
    : null;

// priceUsd belongs to the pair's base token. Quote-token matches and symbol
// matches cannot authorize a join. DEX Screener does not disclose trade times:
// at is explicitly the retrieval time of a pool-price snapshot.
export function parseSpotPairs(data, candidates, retrievedAt) {
  if (!Array.isArray(data))
    throw new Error("Unexpected DEX Screener response.");
  const at = Date.parse(retrievedAt);
  if (!Number.isFinite(at)) return [];
  const rows = [];
  for (const pair of data) {
    const rawPrice = positive(pair?.priceUsd);
    const liquidity = positive(pair?.liquidity?.usd);
    if (!rawPrice || !(liquidity >= 1000) || !positive(pair?.volume?.h24))
      continue;
    if (
      typeof pair.pairAddress !== "string" ||
      !/^[A-Za-z0-9]{20,100}$/.test(pair.pairAddress)
    )
      continue;
    for (const candidate of candidates) {
      const { deployment, product, stock } = candidate;
      if (
        pair.chainId !== NETWORKS[deployment.chain] ||
        !pair.baseToken?.address ||
        key(deployment.chain, pair.baseToken.address) !==
          key(deployment.chain, deployment.address)
      )
        continue;
      rows.push({
        id: stock.id,
        product,
        deployment,
        rawPrice,
        liquidity,
        symbol: product.symbol,
        issuer: product.issuer,
        chain: deployment.chain,
        address: deployment.address,
        venue: pair.dexId || null,
        pairAddress: pair.pairAddress,
        source: `https://dexscreener.com/${pair.chainId}/${encodeURIComponent(pair.pairAddress)}`,
        apiSource: `${API}/tokens/v1/${pair.chainId}/${encodeURIComponent(deployment.address)}`,
        at,
        retrievedAt,
        priceTimeBasis: "snapshot-retrieval",
        method: "dex-pool-snapshot",
      });
    }
  }
  return rows.sort((a, b) => b.liquidity - a.liquidity);
}

export async function getSpotObservations(
  stocks,
  {
    getSource = read,
    getUnits = getTokenUnits,
    now = Date.now,
    budgetMs = 8000,
  } = {},
) {
  const deadline = Date.now() + budgetMs;
  const remaining = () => Math.max(1, deadline - Date.now());
  const candidates = stocks.flatMap((stock) =>
    stock.products
      .filter(
        (product) =>
          !product.wrapped && !product.halted && conversionIssuer(product),
      )
      .flatMap((product) =>
        product.deployments
          .filter(
            (deployment) =>
              NETWORKS[deployment.chain] &&
              validAddress(deployment.chain, deployment.address),
          )
          .map((deployment) => ({ stock, product, deployment })),
      ),
  );
  const groups = [];
  for (const [chain, network] of Object.entries(NETWORKS)) {
    const selected = candidates.filter((c) => c.deployment.chain === chain);
    const addresses = [
      ...new Set(selected.map((c) => c.deployment.address)),
    ].sort();
    for (let i = 0; i < addresses.length; i += 30)
      groups.push({ network, selected, addresses: addresses.slice(i, i + 30) });
  }
  const snapshots = await mapLimit(
    groups,
    3,
    async ({ network, selected, addresses }) => {
      try {
        const result = await observeWithin(
          () =>
            getSource(
              `/tokens/v1/${network}/${addresses.map(encodeURIComponent).join(",")}`,
              60000,
            ),
          Math.min(6000, remaining()),
        );
        const at = Date.parse(result?.retrievedAt);
        if (
          result?.stale ||
          !Number.isFinite(at) ||
          at > now() ||
          now() - at > 300000
        )
          return [];
        return parseSpotPairs(result.data, selected, result.retrievedAt);
      } catch {
        return [];
      }
    },
  );
  const pairs = snapshots.flat().sort((a, b) => b.liquidity - a.liquidity);
  const output = new Map();
  await mapLimit(stocks, 5, async (stock) => {
    const deployments = new Set();
    const selected = pairs.filter((pair) => {
      const id = pair.chain + ":" + key(pair.chain, pair.address);
      if (pair.id !== stock.id || deployments.has(id)) return false;
      deployments.add(id);
      return true;
    });
    for (const row of selected.slice(0, 6)) {
      if (Date.now() >= deadline) break;
      try {
        const units = await observeWithin(
          () => getUnits(row.product, row.deployment),
          Math.min(3000, remaining()),
        );
        if (
          !(units?.sharesPerToken > 0) ||
          !Number.isFinite(units.sharesPerToken) ||
          !units.conversionSource
        )
          continue;
        // Public indexers do not disclose whether a Solana scaled-UI price is
        // already adjusted. Applying a non-unit multiplier could double-adjust.
        if (row.chain === "Solana" && units.sharesPerToken !== 1) continue;
        const { product, deployment, ...observation } = row;
        output.set(stock.id, {
          ...observation,
          price: row.rawPrice / units.sharesPerToken,
          sharesPerToken: units.sharesPerToken,
          conversionVerified: true,
          conversionSource: units.conversionSource,
          currency: "USD",
          basis:
            "Representative exact-contract DEX pool snapshot, normalized to one underlying-equivalent share using verified issuer units. Pools need at least $1,000 reported liquidity and nonzero 24h volume. Snapshot retrieval time is shown; last-trade time is not disclosed. Not an executable offer or a market-wide aggregate.",
        });
        break;
      } catch {
        /* Unsupported units cannot authorize a price comparison. */
      }
    }
  });
  return output;
}

import { sourceClient } from "./source-client.mjs";
import { conversionIssuer, getSpotUnits } from "./providers.mjs";
import { mapLimit, observeWithin } from "./http.mjs";
import { validAddress } from "./config.mjs";

const NETWORKS = {
  Ethereum: "ethereum",
  BinanceSmartChain: "bsc",
  Solana: "solana",
  Base: "base",
  Ink: "ink",
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
const MAX_AGE_MS = 300000;
// Source requests are batched by the current stock selection. Retain verified
// deployment observations independently so a different batch cannot erase one.
const retainedBySource = new WeakMap();
const observationKey = (row) =>
  JSON.stringify([
    row.stock?.id ?? row.id,
    row.product?.issuer ?? row.issuer,
    row.product?.symbol ?? row.symbol,
    row.deployment?.chain ?? row.chain,
    key(
      row.deployment?.chain ?? row.chain,
      row.deployment?.address ?? row.address,
    ),
  ]);
const rank = (a, b) =>
  b.liquidity - a.liquidity ||
  observationKey(a).localeCompare(observationKey(b)) ||
  a.pairAddress.localeCompare(b.pairAddress);

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
  return rows.sort(rank);
}

export async function getSpotObservations(
  stocks,
  {
    getSource = read,
    getUnits = getSpotUnits,
    now = Date.now,
    budgetMs = 8000,
    onObservation = () => {},
    onMissing = () => {},
  } = {},
) {
  const deadline = Date.now() + budgetMs;
  const remaining = () => Math.max(1, deadline - Date.now());
  const fresh = (at) =>
    Number.isFinite(at) && at <= now() && now() - at <= MAX_AGE_MS;
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
    for (let i = 0; i < addresses.length; i += 30) {
      const batch = addresses.slice(i, i + 30);
      groups.push({
        network,
        batchIndex: i / 30,
        selected: selected.filter((c) => batch.includes(c.deployment.address)),
        addresses: batch,
      });
    }
  }
  // The first request slots cover independent chains before additional batches
  // from one chain, so a slow large chain cannot delay every other source.
  groups.sort((a, b) => a.batchIndex - b.batchIndex);
  if (!retainedBySource.has(getSource))
    retainedBySource.set(getSource, new WeakMap());
  const retainedByUnits = retainedBySource.get(getSource);
  if (!retainedByUnits.has(getUnits)) retainedByUnits.set(getUnits, new Map());
  const saved = retainedByUnits.get(getUnits);
  for (const [id, row] of saved) if (!fresh(row.at)) saved.delete(id);
  const observations = new Map();
  for (const candidate of candidates) {
    const id = observationKey(candidate);
    const row = saved.get(id);
    if (row) observations.set(id, { ...row, retained: true });
  }
  const resolvedStocks = new Set(
    [...observations.values()].map((row) => row.id),
  );
  let accepting = true;

  const normalize = async (row) => {
    if (!accepting || Date.now() >= deadline) return;
    const conversionDeadline = Math.min(deadline, Date.now() + 3000);
    try {
      // Keep this worker occupied until its actual request settles. A timeout
      // stops the batch waiting; it cannot authorize another concurrent request.
      const units = await getUnits(row.product, row.deployment);
      if (
        !accepting ||
        Date.now() >= conversionDeadline ||
        !(units?.sharesPerToken > 0) ||
        !Number.isFinite(units.sharesPerToken) ||
        !units.conversionSource ||
        !fresh(row.at)
      )
        return;
      // Public indexers do not disclose whether a Solana scaled-UI price is
      // already adjusted. Applying a non-unit multiplier could double-adjust.
      if (row.chain === "Solana" && units.sharesPerToken !== 1) return;
      const price = row.rawPrice / units.sharesPerToken;
      if (!Number.isFinite(price) || price <= 0) return;
      const { product, deployment, ...observation } = row;
      const normalized = {
        ...observation,
        price,
        sharesPerToken: units.sharesPerToken,
        conversionVerified: true,
        conversionSource: units.conversionSource,
        currency: "USD",
        basis:
          "Representative exact-contract DEX pool snapshot, normalized to one underlying-equivalent share using verified issuer units. Pools need at least $1,000 reported liquidity and nonzero 24h volume. Snapshot retrieval time is shown; last-trade time is not disclosed. Not an executable offer or a market-wide aggregate.",
      };
      const id = observationKey(row);
      observations.set(id, normalized);
      resolvedStocks.add(row.id);
      onObservation(normalized);
      // A slower concurrent refresh must not overwrite a newer snapshot.
      if (!saved.has(id) || saved.get(id).at <= normalized.at) {
        if (saved.size >= 1000 && !saved.has(id))
          saved.delete(saved.keys().next().value);
        saved.set(id, normalized);
      }
    } catch {
      /* Unsupported units cannot authorize a price comparison. */
    }
  };
  // Start conversions as each chain arrives, with one bounded queue shared by
  // all chains. A slow conversion must not serialize alternatives for a stock.
  const queued = [],
    jobs = [];
  const chains = Object.keys(NETWORKS);
  let active = 0,
    nextChain = 0;
  const pump = () => {
    while (accepting && Date.now() < deadline && active < 6 && queued.length) {
      // Alternate ready chains when capacity opens instead of letting the first
      // large response monopolize all subsequent conversion slots.
      let index = -1;
      for (let offset = 0; offset < chains.length; offset++) {
        const chainIndex = (nextChain + offset) % chains.length;
        const chain = chains[chainIndex];
        index = queued.findIndex(
          (job) => job.row.chain === chain && !resolvedStocks.has(job.row.id),
        );
        if (index < 0)
          index = queued.findIndex((job) => job.row.chain === chain);
        if (index < 0) continue;
        nextChain = (chainIndex + 1) % chains.length;
        break;
      }
      const [{ row, resolve }] = queued.splice(index, 1);
      active++;
      normalize(row).finally(() => {
        active--;
        resolve();
        pump();
      });
    }
  };
  const poolStocks = new Set();
  const enqueue = (row) => {
    poolStocks.add(row.id);
    jobs.push(new Promise((resolve) => queued.push({ row, resolve })));
    pump();
  };
  await mapLimit(groups, 3, async ({ network, selected, addresses }) => {
    try {
      if (Date.now() >= deadline) return;
      const result = await observeWithin(
        () =>
          getSource(
            `/tokens/v1/${network}/${addresses.map(encodeURIComponent).join(",")}`,
            60000,
          ),
        Math.min(6000, remaining()),
      );
      const at = Date.parse(result?.retrievedAt);
      if (result?.stale || !fresh(at)) return;
      const deployments = new Set();
      for (const row of parseSpotPairs(
        result.data,
        selected,
        result.retrievedAt,
      )) {
        const id = observationKey(row);
        if (deployments.has(id)) continue;
        deployments.add(id);
        enqueue(row);
      }
    } catch {
      /* Independent chain observations can still be usable. */
    }
  });
  onMissing(
    stocks.filter(
      (stock) => !poolStocks.has(stock.id) && !resolvedStocks.has(stock.id),
    ),
  );
  try {
    await observeWithin(() => Promise.all(jobs), remaining());
  } catch {
    /* Return completed observations within budget; in-flight work stays bounded. */
  } finally {
    accepting = false;
    for (const job of queued.splice(0)) job.resolve();
  }
  const output = new Map();
  for (const row of [...observations.values()]
    .filter((row) => fresh(row.at))
    .sort(
      (a, b) => Number(!!a.retained) - Number(!!b.retained) || rank(a, b),
    )) {
    if (!output.has(row.id)) {
      output.set(
        row.id,
        row.retained
          ? {
              ...row,
              basis:
                row.basis +
                " Previously verified observation retained while a current refresh is unavailable or incomplete; original snapshot time is preserved.",
            }
          : row,
      );
    }
  }
  return output;
}

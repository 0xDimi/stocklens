import { CHAINS, validAddress } from "./config.mjs";
import { sourceClient } from "./source-client.mjs";
import { cgRequest } from "./coingecko.mjs";
export function validOnchainResponse(body, path) {
  if (body?.error || body?.errors || body?.status?.error_code) return false;
  return path.includes("/ohlcv/")
    ? Array.isArray(body?.data?.attributes?.ohlcv_list)
    : Array.isArray(body?.data);
}
const gt = sourceClient(
  "GeckoTerminal",
  () => "https://api.geckoterminal.com/api/v2",
  6100,
  () => ({ Accept: "application/json;version=20230203" }),
  { validate: validOnchainResponse },
);
const numeric = (v) =>
  v != null && v !== "" && typeof v !== "boolean" && Number.isFinite(Number(v)) && Number(v) >= 0
    ? Number(v)
    : null;
const addrKey = (chain, address) =>
  chain === "Solana" || chain === "TON" || chain === "Tron"
    ? address
    : address.toLowerCase();
export function parsePools(response, stock, at) {
  if (!Array.isArray(response?.data))
    throw new Error("Unexpected GeckoTerminal pool response.");
  const included = new Map((response.included || []).map((v) => [v.id, v]));
  const output = [];
  for (const p of response.data) {
    if (p.type !== "pool") continue;
    const chain = Object.values(CHAINS).find((c) =>
      p.id?.startsWith(c.gecko + "_"),
    );
    if (!chain) continue;
    const a = p.attributes,
      rel = p.relationships;
    if (
      !a ||
      !validAddress(chain.id, a.address) ||
      p.id !== chain.gecko + "_" + a.address
    )
      continue;
    const base = rel?.base_token?.data?.id,
      quote = rel?.quote_token?.data?.id;
    for (const product of stock.products)
      for (const d of product.deployments.filter((d) => d.chain === chain.id)) {
        const expected = chain.gecko + "_" + d.address;
        const orientation =
          addrKey(chain.id, base || "") === addrKey(chain.id, expected)
            ? "base"
            : addrKey(chain.id, quote || "") === addrKey(chain.id, expected)
              ? "quote"
              : null;
        if (!orientation) continue;
        const other = included.get(
          orientation === "base" ? quote : base,
        )?.attributes;
        const change =
          orientation === "base" ? a.price_change_percentage?.h24 : null;
        output.push({
          id: p.id + ":" + product.issuer + ":" + product.symbol,
          poolId: p.id,
          poolAddress: a.address,
          chain: chain.id,
          chainLabel: chain.label,
          address: d.address,
          issuer: product.issuer,
          symbol: product.symbol,
          orientation,
          pair: a.name,
          dex:
            included.get(rel?.dex?.data?.id)?.attributes?.name ||
            rel?.dex?.data?.id ||
            "DEX",
          price: numeric(
            orientation === "base"
              ? a.base_token_price_usd
              : a.quote_token_price_usd,
          ),
          liquidity: numeric(a.reserve_in_usd),
          volume24h: numeric(a.volume_usd?.h24),
          change24h:
            change != null && Number.isFinite(Number(change))
              ? Number(change)
              : null,
          otherSymbol: other?.symbol || null,
          retrievedAt: at,
          source: `https://www.geckoterminal.com/${chain.gecko}/pools/${encodeURIComponent(a.address)}`,
        });
      }
  }
  return output.sort((a, b) => (b.liquidity ?? -1) - (a.liquidity ?? -1));
}
async function readPools(stock, chain, deployment, read) {
  const path = deployment
    ? `/networks/${CHAINS[deployment.chain].gecko}/tokens/${encodeURIComponent(deployment.address)}/pools?include=base_token,quote_token,dex`
    : "/search/pools?" +
      new URLSearchParams({
        query: stock.ticker,
        include: "base_token,quote_token,dex",
        page: "1",
      });
  const result = await read(path, 90_000);
  return {
    rows: parsePools(result.data, stock, result.retrievedAt).filter(
      (p) => chain === "all" || p.chain === chain,
    ),
    retrievedAt: result.retrievedAt,
    stale: result.stale === true,
    warning: result.warning || null,
    lastAttemptAt: result.lastAttemptAt || null,
    source: result.provider,
    apiSource: result.apiSource,
    coverage: deployment
      ? "Top pools for this exact token"
      : "First page of search pools, filtered to catalog contracts",
  };
}
export function parseHistory(
  response,
  { since = -Infinity, until = Infinity } = {},
) {
  const rows = response?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(rows))
    throw new Error("Pool price history is unavailable.");
  return rows
    .filter(
      (r) =>
        Array.isArray(r) &&
        Number.isFinite(r[0]) &&
        r[0] > 0 &&
        [r[1], r[2], r[3], r[4]].every((value) => numeric(value) > 0) &&
        Number(r[2]) >= Math.max(Number(r[1]), Number(r[4]), Number(r[3])) &&
        Number(r[3]) <= Math.min(Number(r[1]), Number(r[4])),
    )
    .map((r) => ({
      time: r[0] * 1000,
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      price: Number(r[4]),
      volume: numeric(r[5]),
    }))
    .filter((p) => p.time >= since && p.time <= until)
    .sort((a, b) => a.time - b.time);
}
async function readHistory(stock, poolId, range, deployment, read) {
  const pools = await readPools(stock, "all", deployment, read);
  const pool = pools.rows.find((p) => p.id === poolId);
  if (!pool) {
    const error = new Error("Choose a pool from this stock’s market results.");
    error.status = 400;
    throw error;
  }
  const result = await read(
    `/networks/${CHAINS[pool.chain].gecko}/pools/${encodeURIComponent(pool.poolAddress)}/ohlcv/hour?` +
      new URLSearchParams({
        aggregate: "1",
        limit: range === "7d" ? "168" : "24",
        currency: "usd",
        include_empty_intervals: "false",
        token: pool.orientation,
      }),
    300_000,
  );
  const observedToken = result.data.meta?.[pool.orientation]?.address;
  if (
    observedToken &&
    addrKey(pool.chain, observedToken) !== addrKey(pool.chain, pool.address)
  )
    throw new Error("Pool price history returned an unrelated token.");
  return {
    points: parseHistory(result.data, {
      since: Date.now() - (range === "7d" ? 7 : 1) * 86400_000,
      until: Date.now(),
    }),
    pool,
    range,
    retrievedAt: result.retrievedAt,
    stale: result.stale === true || pools.stale === true,
    warning: result.warning || pools.warning || null,
    lastAttemptAt: result.lastAttemptAt || null,
    unit: "USD per token unit",
    source: pool.source,
    provider: result.provider,
    apiSource: result.apiSource,
  };
}

export function createGeckoClient({
  publicRequest = gt,
  authenticatedRequest = cgRequest,
  hasApiKey = () => Boolean(process.env.COINGECKO_API_KEY),
} = {}) {
  const provenance = (result, path, authenticated = false) => ({
    ...result,
    provider: authenticated ? "CoinGecko Onchain API" : "GeckoTerminal",
    apiSource: authenticated
      ? `https://${process.env.COINGECKO_PLAN === "pro" ? "pro-api" : "api"}.coingecko.com/api/v3/onchain${path}`
      : `https://api.geckoterminal.com/api/v2${path}`,
  });
  const read = async (path, ttl) => {
    let retained, publicError;
    try {
      const result = await publicRequest(path, ttl);
      retained = provenance(result, path);
      if (!result.stale) return retained;
    } catch (error) {
      if (
        error.status &&
        error.status !== 408 &&
        error.status !== 429 &&
        error.status < 500
      )
        throw error;
      publicError = error;
    }
    if (!hasApiKey()) {
      if (retained) return retained;
      throw publicError;
    }
    try {
      const result = await authenticatedRequest("/onchain" + path, ttl);
      if (!validOnchainResponse(result.data, path))
        throw new Error("CoinGecko onchain returned an invalid provider response.");
      return provenance(
        result,
        path,
        true,
      );
    } catch (error) {
      if (!retained) throw publicError || error;
      return {
        ...retained,
        warning: [
          retained.warning,
          `CoinGecko onchain fallback unavailable: ${error.message}`,
        ].filter(Boolean).join(" "),
      };
    }
  };
  return {
    getPools: (stock, chain = "all", deployment = null) =>
      readPools(stock, chain, deployment, read),
    getHistory: (stock, poolId, range, deployment = null) =>
      readHistory(stock, poolId, range, deployment, read),
  };
}

export const { getPools, getHistory } = createGeckoClient();

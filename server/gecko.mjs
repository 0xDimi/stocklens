import { CHAINS, validAddress } from "./config.mjs";
import { sourceClient } from "./source-client.mjs";
const gt = sourceClient(
  "GeckoTerminal",
  () => "https://api.geckoterminal.com/api/v2",
  6100,
  () => ({ Accept: "application/json;version=20230203" }),
);
const numeric = (v) =>
  v != null && v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0
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
export async function getPools(stock, chain = "all", deployment = null) {
  const path = deployment
    ? `/networks/${CHAINS[deployment.chain].gecko}/tokens/${encodeURIComponent(deployment.address)}/pools?include=base_token,quote_token,dex`
    : "/search/pools?" +
      new URLSearchParams({
        query: stock.ticker,
        include: "base_token,quote_token,dex",
        page: "1",
      });
  const result = await gt(path, 90_000);
  return {
    rows: parsePools(result.data, stock, result.retrievedAt).filter(
      (p) => chain === "all" || p.chain === chain,
    ),
    retrievedAt: result.retrievedAt,
    source: "GeckoTerminal",
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
        numeric(r[4]) > 0,
    )
    .map((r) => ({
      time: r[0] * 1000,
      price: Number(r[4]),
      volume: numeric(r[5]),
    }))
    .filter((p) => p.time >= since && p.time <= until)
    .sort((a, b) => a.time - b.time);
}
export async function getHistory(stock, poolId, range, deployment = null) {
  const pools = await getPools(stock, "all", deployment);
  const pool = pools.rows.find((p) => p.id === poolId);
  if (!pool) {
    const error = new Error("Choose a pool from this stock’s market results.");
    error.status = 400;
    throw error;
  }
  const interval = range === "7d" ? "hour" : "hour";
  const result = await gt(
    `/networks/${CHAINS[pool.chain].gecko}/pools/${encodeURIComponent(pool.poolAddress)}/ohlcv/${interval}?` +
      new URLSearchParams({
        aggregate: "1",
        limit: range === "7d" ? "168" : "24",
        currency: "usd",
        token: pool.orientation,
      }),
    300_000,
  );
  return {
    points: parseHistory(result.data, {
      since: Date.now() - (range === "7d" ? 7 : 1) * 86400_000,
      until: Date.now(),
    }),
    pool,
    range,
    retrievedAt: result.retrievedAt,
    unit: "USD per token unit",
    source: pool.source,
  };
}

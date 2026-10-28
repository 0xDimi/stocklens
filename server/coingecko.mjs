import { memo, observeWithin } from "./http.mjs";
import { join } from "node:path";
import { readRuntime } from "./runtime.mjs";
import { observationStore } from "./observation-store.mjs";
import {
  discoverProducts,
  isWrappedProduct,
  parseRwaTokens,
} from "./coingecko-identities.mjs";
import { createRwaDiscovery } from "./rwa-discovery.mjs";
export {
  cleanName,
  issuerName,
  normalizeIssuer,
  isWrappedProduct,
  discoverProducts,
  mergeDiscovery,
  parseRwaTokens,
  attachKnownProducts,
} from "./coingecko-identities.mjs";
import { sourceClient, persistentCatalog } from "./source-client.mjs";

export function validateCoinGeckoResponse(body, path) {
  const pathname = new URL(path, "https://api.coingecko.com").pathname;
  if (/^\/onchain\/networks\/[^/]+\/pools\/[^/]+\/ohlcv\/[^/]+$/.test(pathname))
    return Array.isArray(body?.data?.attributes?.ohlcv_list);
  if (
    pathname === "/onchain/search/pools" ||
    /^\/onchain\/networks\/[^/]+\/tokens\/[^/]+\/pools$/.test(pathname)
  )
    return Array.isArray(body?.data);
  if (
    [
      "/rwas/list",
      "/rwas/markets",
      "/rwas/issuers/list",
      "/coins/list",
      "/coins/markets",
    ].includes(pathname)
  )
    return Array.isArray(body);
  if (/^\/rwas\/issuers\/[^/]+$/.test(pathname))
    return (
      body?.id === decodeURIComponent(pathname.slice(14)) &&
      Array.isArray(body.tokens)
    );
  if (pathname.startsWith("/rwas/"))
    return (
      body?.id === decodeURIComponent(pathname.slice(6)) &&
      Array.isArray(body.tokens)
    );
  if (/^\/coins\/[^/]+\/tickers$/.test(pathname))
    return Array.isArray(body?.tickers);
  return !body?.error && !body?.status?.error_code;
}

const cg = sourceClient(
  "CoinGecko",
  () =>
    process.env.COINGECKO_PLAN === "pro"
      ? "https://pro-api.coingecko.com/api/v3"
      : "https://api.coingecko.com/api/v3",
  process.env.COINGECKO_API_KEY ? 2200 : 12500,
  () =>
    process.env.COINGECKO_API_KEY
      ? {
          [process.env.COINGECKO_PLAN === "pro"
            ? "x-cg-pro-api-key"
            : "x-cg-demo-api-key"]: process.env.COINGECKO_API_KEY,
        }
      : {},
  {
    validate: validateCoinGeckoResponse,
    concurrency: 1,
    staleWhileRevalidate: true,
    queueTimeoutMs: 60000,
    cacheFile: join(readRuntime().cacheDir, "coingecko-observations.json"),
    seedFile: new URL("./data/coingecko-observations.json.gz", import.meta.url),
  },
);
export const cgRequest = (path, ttl = 60_000, options) =>
  cg(path, ttl, options);
export function discoveryObservation(r, c) {
  const retrievedAt = new Date(
    Math.min(Date.parse(r.retrievedAt), Date.parse(c.retrievedAt)),
  ).toISOString();
  return {
    stocks: discoverProducts(r.data, c.data, retrievedAt),
    universe: {
      underlyingRecords: r.data.length,
      securities: r.data.filter((r) => ["stock", "etf"].includes(r.asset_type))
        .length,
      coinRegistryRecords: c.data.length,
    },
    registry: c.data.filter(
      (coin) =>
        typeof coin.name === "string" &&
        !/^wrapped /i.test(coin.name) &&
        typeof coin.id === "string",
    ),
    retrievedAt,
    stale: r.stale === true || c.stale === true,
    warning: [r.warning, c.warning].filter(Boolean).join(" ") || null,
  };
}
const discoveryEnricher = createRwaDiscovery({ read: cgRequest });
export const getIssuerObservations = () => discoveryEnricher.issuerObservations();
export async function getDiscovery() {
  const data = await memo("cg-discovery", 3600_000, () =>
    persistentCatalog("coingecko-discovery-v3", async () => {
      const [r, c] = await Promise.all([
        cg("/rwas/list", 3600_000),
        cg("/coins/list?include_platform=true", 3600_000),
      ]);
      return discoveryObservation(r, c);
    }).then((data) => ({
      ...data,
      stocks: data.stocks.map((stock) => ({
        ...stock,
        products: stock.products.map((p) => ({
          ...p,
          wrapped: isWrappedProduct(p),
        })),
      })),
    })),
  );
  return discoveryEnricher.augment(data);
}
export async function getRwa(stock) {
  if (!stock.rwaId) return { products: [], warning: null };
  try {
    const result = await observeWithin(
      () =>
        cg(
          `/rwas/${encodeURIComponent(stock.rwaId)}?tokens=true&tokenized_market_data=true`,
          12 * 3600_000,
        ),
      8000,
    );
    return {
      products: parseRwaTokens(result.data, stock, {
        includeWrapped: true,
        retrievedAt: result.retrievedAt,
      }),
      logo: result.data.image?.small || result.data.image?.large || null,
      checkedAt: result.retrievedAt,
      aggregate: result.data.tokenized_market_data || null,
      stale: result.stale === true,
      warning: result.warning || null,
    };
  } catch (error) {
    return {
      products: [],
      warning:
        "CoinGecko native RWA grouping unavailable; catalog mapping retained.",
    };
  }
}
export function parseTokenMarkets(data, ids) {
  if (!Array.isArray(data))
    throw new Error("Unexpected CoinGecko market response.");
  const numeric = (v, min = 0) =>
    v != null && Number.isFinite(Number(v)) && Number(v) >= min
      ? Number(v)
      : null;
  return data
    .filter((c) => ids.includes(c.id))
    .map((c) => ({
      coinId: c.id,
      price: numeric(c.current_price),
      change24h: numeric(c.price_change_percentage_24h, -Infinity),
      volume24h: numeric(c.total_volume),
      marketCap: numeric(c.market_cap),
      updatedAt: c.last_updated || null,
      source: `https://www.coingecko.com/en/coins/${encodeURIComponent(c.id)}`,
    }));
}
const marketStore = observationStore(
  join(readRuntime().cacheDir, "coingecko-observations.json"),
  new URL("./data/coingecko-observations.json.gz", import.meta.url),
);
export function retainedTokenMarkets(ids, observations, now = Date.now()) {
  const rows = new Map();
  for (const [path, value] of observations) {
    const url = new URL(path, "https://api.coingecko.com");
    const at = Date.parse(value.retrievedAt);
    if (
      url.pathname !== "/coins/markets" ||
      url.searchParams.get("vs_currency") !== "usd" ||
      !Number.isFinite(at) ||
      at > now ||
      now - at > 86400000
    )
      continue;
    for (const row of parseTokenMarkets(value.data, ids)) {
      if (!rows.has(row.coinId) || at > rows.get(row.coinId).at)
        rows.set(row.coinId, { row, at });
    }
  }
  const oldest = rows.size
    ? Math.min(...[...rows.values()].map((v) => v.at))
    : null;
  return {
    rows: [...rows.values()].map((v) => v.row),
    retrievedAt: oldest ? new Date(oldest).toISOString() : null,
  };
}
export async function getTokenMarkets(ids) {
  if (!ids.length) return { rows: [], retrievedAt: new Date().toISOString() };
  const unique = [...new Set(ids)].sort();
  const retained = retainedTokenMarkets(unique, await marketStore.load());
  const refresh = () =>
    cg(
      "/coins/markets?" +
        new URLSearchParams({
          vs_currency: "usd",
          ids: unique.join(","),
          per_page: "250",
          page: "1",
          sparkline: "false",
        }),
      300000,
    );
  if (retained.rows.length === unique.length) {
    if (Date.now() - Date.parse(retained.retrievedAt) < 300000) return retained;
    refresh().catch(() => {});
    return {
      ...retained,
      stale: true,
      warning:
        "Dated CoinGecko observations retained while market prices refresh in the background.",
    };
  }
  try {
    const result = await refresh();
    return {
      rows: parseTokenMarkets(result.data, unique),
      retrievedAt: result.retrievedAt,
      stale: result.stale === true,
      warning: result.warning || null,
    };
  } catch (error) {
    if (!retained.rows.length) throw error;
    return {
      ...retained,
      stale: true,
      warning:
        "Last successful CoinGecko prices retained with original timestamps while the source refreshes.",
    };
  }
}

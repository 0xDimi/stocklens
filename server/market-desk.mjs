import { loadCatalog, resolveStock } from "./catalog.mjs";
import { cgRequest } from "./coingecko.mjs";
import { CHAINS } from "./config.mjs";
import { sourceStatus } from "./source-client.mjs";

const MARKET_BASIS =
  "Aggregated tokenized onchain market observations in USD; not underlying exchange prices or executable quotes.";
const badRequest = (message) =>
  Object.assign(new Error(message), { status: 400 });
const numeric = (value, minimum = 0) =>
  value != null &&
  value !== "" &&
  typeof value !== "boolean" &&
  Number.isFinite(Number(value)) &&
  Number(value) >= minimum
    ? Number(value)
    : null;
const timestamp = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : null;
const rwaId = (stock) =>
  stock.rwaId || (stock.id.startsWith("cg:") ? stock.id.slice(3) : null);
function pageNumber(params) {
  const value = params.get("page") ?? "1";
  if (!/^(?:[1-9]|10)$/.test(value))
    throw badRequest("Choose a page from 1 through 10.");
  return Number(value);
}
function marketObservation(row) {
  const data = row?.tokenized_market_data;
  if (!data || typeof data !== "object") return null;
  const rawSparkline = data.sparkline_in_7d?.price;
  // Do not compress invalid samples into apparently adjacent valid prices.
  const sparkline =
    Array.isArray(rawSparkline) &&
    rawSparkline.every((value) => numeric(value) > 0)
      ? rawSparkline.map(Number)
      : [];
  return {
    price: numeric(data.current_price),
    change24h: numeric(data.price_change_percentage_24h, -Infinity),
    volume24h: numeric(data.total_volume),
    marketCap: numeric(data.market_cap),
    high24h: numeric(data.high_24h),
    low24h: numeric(data.low_24h),
    updatedAt: timestamp(data.last_updated),
    sparkline,
  };
}
function sourceState(result) {
  return {
    stale: result?.stale === true,
    lastAttemptAt: result?.lastAttemptAt || null,
    sources: sourceStatus(),
  };
}

export async function screenerView(
  params = new URLSearchParams(),
  { getCatalog = loadCatalog, request = cgRequest } = {},
) {
  const page = pageNumber(params);
  const selected = params.get("ids");
  const ids = selected == null ? null : selected.split(",");
  if (
    ids &&
    (!ids.length ||
      ids.length > 250 ||
      ids.some((id) => !/^[A-Za-z0-9.:-]{1,100}$/.test(id)))
  )
    throw badRequest("Choose up to 250 catalog asset IDs.");
  const catalog = await getCatalog();
  const selectedStocks = ids
    ? ids.map((id) => {
        const matches = catalog.stocks.filter(
          (stock) => stock.id === id || rwaId(stock) === id,
        );
        if (matches.length !== 1 || !rwaId(matches[0]))
          throw badRequest(
            "Choose exact catalog assets with a CoinGecko RWA ID.",
          );
        return matches[0];
      })
    : catalog.stocks;
  const query = new URLSearchParams({
    per_page: "250",
    page: String(page),
    order: "volume_desc",
    sparkline: "true",
  });
  if (ids)
    query.set("ids", [...new Set(selectedStocks.map(rwaId))].sort().join(","));
  let result = null;
  const warnings = [...(catalog.warnings || [])];
  try {
    result = await request("/rwas/markets?" + query, 60_000);
    if (!Array.isArray(result.data))
      throw new Error("Unexpected CoinGecko RWA market response.");
    if (result.warning) warnings.push(result.warning);
  } catch (error) {
    result = null;
    warnings.push(
      "CoinGecko aggregate market data unavailable: " + error.message,
    );
  }
  // Identity is supplied by the canonical catalog. A matching ticker never authorizes a join.
  const observations = new Map();
  for (const row of result?.data || []) {
    if (typeof row?.id !== "string") continue;
    if (observations.has(row.id)) observations.set(row.id, null);
    else observations.set(row.id, marketObservation(row));
  }
  const rows = selectedStocks.map((stock) => ({
    id: stock.id,
    rwaId: rwaId(stock),
    ticker: stock.ticker,
    name: stock.name,
    category: stock.category,
    products: stock.products.length,
    issuers: new Set(stock.products.map((product) => product.issuer)).size,
    chains: new Set(
      stock.products.flatMap((product) =>
        product.deployments.map((deployment) => deployment.chain),
      ),
    ).size,
    market: observations.get(rwaId(stock)) || null,
  }));
  const hasMore = !ids && (result?.data.length || 0) === 250 && page < 10;
  return {
    rows,
    retrievedAt: result?.retrievedAt || null,
    catalogAt: catalog.fetchedAt,
    warnings,
    ...sourceState(result),
    scope: {
      page,
      perPage: 250,
      returned: result?.data.length || 0,
      matched: rows.filter((row) => row.market).length,
      observedIds: rows.filter((row) => row.market).map((row) => row.id),
      hasMore,
      nextPage: hasMore ? page + 1 : null,
      marketBasis: MARKET_BASIS,
      coverage: ids
        ? "Requested catalog assets only."
        : "Catalog retained; market observations cover this CoinGecko volume-ranked page only. Merge observed IDs when loading further pages.",
    },
  };
}

// Only provider links for these known centralized exchanges can be shown directly.
// DEX URLs can contain incorrectly lowercased case-sensitive token addresses.
const CEX_HOSTS = {
  gate: ["gate.com", "gate.io"],
  gate_io: ["gate.com", "gate.io"],
  kraken: ["kraken.com"],
  kucoin: ["kucoin.com"],
  bybit_spot: ["bybit.com"],
  bitget: ["bitget.com"],
  mexc: ["mexc.com"],
  binance: ["binance.com"],
  okx: ["okx.com"],
  coinbase_exchange: ["coinbase.com"],
  bitmart: ["bitmart.com"],
  lbank: ["lbank.com"],
  bingx: ["bingx.com"],
};
function marketLink(ticker, coinId) {
  const fallback = {
    url: `https://www.coingecko.com/en/coins/${encodeURIComponent(coinId)}#markets`,
    urlLabel: "CoinGecko markets",
    urlKind: "market-directory",
  };
  const allowed = CEX_HOSTS[ticker.market?.identifier];
  if (!allowed || typeof ticker.trade_url !== "string") return fallback;
  try {
    const url = new URL(ticker.trade_url);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    )
      return fallback;
    if (
      !allowed.some(
        (host) => url.hostname === host || url.hostname.endsWith("." + host),
      )
    )
      return fallback;
    return {
      url: url.href,
      urlLabel: "Exchange market page",
      urlKind: "exchange-market",
    };
  } catch {
    return fallback;
  }
}
function venueObservation(ticker, coinId, index, product, sourceStale) {
  if (ticker?.coin_id !== coinId || !ticker.market?.name) return null;
  const base =
    typeof ticker.base === "string" && ticker.base.length <= 20
      ? ticker.base
      : product.symbol;
  const target =
    typeof ticker.target === "string" && ticker.target.length <= 20
      ? ticker.target
      : ticker.target_coin_id?.toUpperCase() || "Quote token";
  return {
    id: `${coinId}:${ticker.market.identifier || ticker.market.name}:${index}`,
    coinId,
    exchange: ticker.market.name,
    exchangeId: ticker.market.identifier || null,
    pair: `${base} / ${target}`,
    base,
    target,
    priceUsd: numeric(ticker.converted_last?.usd),
    volumeUsd: numeric(ticker.converted_volume?.usd),
    spreadPct: numeric(ticker.bid_ask_spread_percentage),
    depthUpUsd: numeric(ticker.cost_to_move_up_usd),
    depthDownUsd: numeric(ticker.cost_to_move_down_usd),
    depthBasis:
      "Provider-reported USD cost to move the market price by 2%; not an executable quote.",
    sourceAt: timestamp(ticker.timestamp),
    lastTradedAt: timestamp(ticker.last_traded_at),
    lastFetchAt: timestamp(ticker.last_fetch_at),
    isStale: sourceStale
      ? true
      : typeof ticker.is_stale === "boolean"
        ? ticker.is_stale
        : null,
    isAnomaly:
      typeof ticker.is_anomaly === "boolean" ? ticker.is_anomaly : null,
    ...marketLink(ticker, coinId),
  };
}
export async function venuesView(
  { id, chain = "all" },
  params = new URLSearchParams(),
  { resolve = resolveStock, request = cgRequest } = {},
) {
  const page = pageNumber(params);
  if (typeof id !== "string" || !/^[A-Za-z0-9.:-]{1,100}$/.test(id))
    throw badRequest("Choose a valid underlying asset.");
  if (chain !== "all" && !CHAINS[chain])
    throw badRequest("Choose a supported chain.");
  const { stock, warnings: originalWarnings = [] } = await resolve(id);
  const products = stock.products.filter(
    (product) =>
      chain === "all" ||
      product.deployments.some((deployment) => deployment.chain === chain),
  );
  const coinId =
    params.get("coin") ||
    params.get("coinId") ||
    products.find((product) => product.coinId)?.coinId;
  const product = products.find((product) => product.coinId === coinId);
  if (!coinId || !/^[a-z0-9-]{1,150}$/.test(coinId) || !product)
    throw badRequest(
      "Choose a catalog token belonging to the selected stock and chain.",
    );
  const warnings = [...originalWarnings];
  let result = null;
  let rows = [];
  try {
    result = await request(
      `/coins/${encodeURIComponent(coinId)}/tickers?` +
        new URLSearchParams({
          order: "volume_desc",
          page: String(page),
          depth: "true",
        }),
      60_000,
    );
    if (!Array.isArray(result.data?.tickers))
      throw new Error("Unexpected CoinGecko venue response.");
    rows = result.data.tickers
      .map((ticker, index) =>
        venueObservation(ticker, coinId, index, product, result.stale === true),
      )
      .filter(Boolean)
      .sort((a, b) => (b.volumeUsd ?? -1) - (a.volumeUsd ?? -1));
    if (result.warning) warnings.push(result.warning);
  } catch (error) {
    result = null;
    warnings.push("CoinGecko venue observations unavailable: " + error.message);
  }
  const hasMore = (result?.data?.tickers.length || 0) >= 100 && page < 10;
  return {
    stock,
    coinId,
    rows,
    warnings,
    retrievedAt: result?.retrievedAt || null,
    ...sourceState(result),
    page,
    hasMore,
    nextPage: hasMore ? page + 1 : null,
    basis:
      "CoinGecko reported venue observations in USD, not executable quotes. Reported depth is not verified liquidity. Venue coverage is token-wide and is not chain-filtered.",
    coverage:
      "CoinGecko token-wide exchange tickers; chain selects eligible catalog products, not venue networks.",
  };
}

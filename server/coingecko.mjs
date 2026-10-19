import { memo } from "./http.mjs";
import { CHAINS, validAddress } from "./config.mjs";
import { sourceClient, persistentCatalog } from "./source-client.mjs";

const cg = sourceClient(
  "CoinGecko",
  () =>
    process.env.COINGECKO_PLAN === "pro"
      ? "https://pro-api.coingecko.com/api/v3"
      : "https://api.coingecko.com/api/v3",
  2200,
  () =>
    process.env.COINGECKO_API_KEY
      ? {
          [process.env.COINGECKO_PLAN === "pro"
            ? "x-cg-pro-api-key"
            : "x-cg-demo-api-key"]: process.env.COINGECKO_API_KEY,
        }
      : {},
);
export const cgRequest = (path, ttl = 60_000) => cg(path, ttl);
export const cleanName = (value) =>
  String(value)
    .toLowerCase()
    .replace(
      /\b(incorporated|inc|corporation|corp|company|limited|ltd|plc)\b/g,
      "",
    )
    .replace(/[^a-z0-9]/g, "");
const symbolKey = (value) => String(value).toLowerCase().replace(/[.\-]/g, "");
const families = [
  ["xstocks", / xStock$/i, /-xstock$/, (s) => s + "x"],
  [
    "ondo",
    / \(Ondo Tokenized Stock\)$/i,
    /-ondo-tokenized-stock$/,
    (s) => s + "on",
  ],
  ["bstocks", / \(bStocks Tokenized Stock\)$/i, /-bstocks?$/, (s) => s + "b"],
  [
    "coinbase",
    / \(Coinbase Tokenized Stock\)$/i,
    /-coinbase-tokenized-stock$/,
    (s) => s + "c",
  ],
  [
    "dinari",
    / \(Dinari Tokenized Stock\)$/i,
    /-dinari-tokenized-stock$/,
    (s) => s,
  ],
  ["backpack", / \(Backpack Securities\)$/i, /-backpack-securities$/, (s) => s],
  [
    "robinhood",
    / [•·] Robinhood Token$/i,
    /-robinhood-tokenized-stock$/,
    (s) => s,
  ],
  ["anchored", / aStock$/i, /-astock$/, (s) => "a" + s],
  ["rstock", / rStock$/i, /-rstock$/, (s) => s + "r"],
  ["reality", / Tokenized Stock \(Reality\)$/i, /-rstock-2$/, (s) => "r" + s],
  [
    "st0x",
    / \(ST0x Tokenized Stock\)$/i,
    /-st0x-tokenized-stock$/,
    (s) => "wt" + s,
  ],
  [
    "stove",
    / \(Stove Tokenized Stock\)$/i,
    /-stove-tokenized-stock$/,
    (s) => s + "s",
  ],
];
const names = {
  xstocks: "xStocks",
  ondo: "Ondo",
  bstocks: "bStocks",
  coinbase: "Coinbase",
  dinari: "Dinari",
  backpack: "Backpack Securities",
  robinhood: "Robinhood",
  anchored: "Anchored",
  rstock: "rStocks",
  reality: "Reality",
  st0x: "ST0x",
  stove: "Stove",
};
export const issuerName = (id) =>
  names[id] || id.replace(/-ecosystem$/, "").replaceAll("-", " ");
function deployments(platforms) {
  return Object.entries(platforms || {}).flatMap(([platform, address]) => {
    const chain = Object.values(CHAINS).find((c) => c.platform === platform);
    return chain && validAddress(chain.id, address)
      ? [
          {
            chain: chain.id,
            address,
            provenance: "CoinGecko platform registry",
          },
        ]
      : [];
  });
}
export function isWrappedProduct(coin) {
  const issuer = coin.issuer || coin.issuer_details?.id;
  return (
    coin.wrapped === true ||
    /^wrapped[ -]/i.test(coin.name || coin.coinId || coin.id || "") ||
    (["st0x", "st0x-ecosystem"].includes(issuer) &&
      /^wt[a-z0-9]+$/i.test(coin.symbol || "") &&
      /ST0x Tokenized Stock/i.test(coin.name || ""))
  );
}
function product(coin, issuer, at, mapping) {
  return {
    issuer,
    issuerName: issuerName(issuer),
    symbol: coin.symbol.toUpperCase(),
    name: coin.name,
    coinId: coin.id,
    source: `https://www.coingecko.com/en/coins/${encodeURIComponent(coin.id)}`,
    sourceAt: at,
    mapping,
    logo:
      typeof coin.image === "string"
        ? coin.image
        : coin.image?.small || coin.image?.large || null,
    wrapped: isWrappedProduct({ ...coin, issuer }),
    unmappedPlatforms: Object.keys(coin.platforms || {}).filter(
      (platform) => !Object.values(CHAINS).some((c) => c.platform === platform),
    ),
    halted: false,
    deployments: deployments(coin.platforms),
  };
}
export function discoverProducts(rwas, coins, at) {
  if (!Array.isArray(rwas) || !Array.isArray(coins))
    throw new Error("Unexpected CoinGecko catalog response.");
  const securities = rwas
    .filter(
      (r) =>
        ["stock", "etf"].includes(r.asset_type) &&
        /^[a-z0-9-]+$/.test(r.id) &&
        typeof r.symbol === "string",
    )
    .map((r) => ({
      id: "cg:" + r.id,
      rwaId: r.id,
      ticker: r.symbol.toUpperCase(),
      name: r.name,
      category: r.asset_type === "etf" ? "ETF" : "Stock",
      exchange: "",
      sourceAt: at,
      products: [],
    }));
  for (const coin of coins) {
    if (
      !coin?.id ||
      !coin?.symbol ||
      typeof coin.name !== "string" ||
      /^wrapped /i.test(coin.name)
    )
      continue;
    const family = families.find(([, pattern]) => pattern.test(coin.name));
    if (!family) continue;
    const [issuer, pattern, suffix, tokenSymbol] = family;
    const stem = coin.id.replace(suffix, "");
    const matches = securities.filter(
      (s) =>
        (stem === s.rwaId ||
          cleanName(coin.name.replace(pattern, "")) === cleanName(s.name)) &&
        symbolKey(coin.symbol) === tokenSymbol(symbolKey(s.ticker)),
    );
    if (matches.length !== 1) continue;
    const p = product(
      coin,
      issuer,
      at,
      "CoinGecko underlying and token-symbol mapping",
    );
    if (p.deployments.length) matches[0].products.push(p);
  }
  return securities;
}
export function mergeDiscovery(existing, discovered) {
  const output = structuredClone(existing);
  for (const item of discovered) {
    const matches = output.filter(
      (s) =>
        symbolKey(s.ticker) === symbolKey(item.ticker) &&
        (cleanName(s.name) === cleanName(item.name) ||
          s.products.some((p) =>
            item.products.some(
              (q) =>
                p.issuer === q.issuer &&
                p.deployments.some((d) =>
                  q.deployments.some(
                    (e) =>
                      d.chain === e.chain &&
                      (d.chain === "Solana"
                        ? d.address === e.address
                        : d.address.toLowerCase() === e.address.toLowerCase()),
                  ),
                ),
            ),
          )),
    );
    const target = matches.length === 1 ? matches[0] : null;
    if (!target) {
      output.push(item);
      continue;
    }
    target.rwaId = item.rwaId || target.rwaId;
    if (item.category) target.category = item.category;
    if (item.logo) target.logo = item.logo;
    if (item.nativeCheckedAt) target.nativeCheckedAt = item.nativeCheckedAt;
    for (const p of item.products) {
      const match =
        target.products.find((v) => p.coinId && v.coinId === p.coinId) ||
        target.products.find(
          (v) =>
            v.issuer === p.issuer &&
            symbolKey(v.symbol) === symbolKey(p.symbol),
        );
      if (!match) {
        target.products.push(p);
        continue;
      }
      if (p.mapping === "CoinGecko RWA grouping") {
        match.issuer = p.issuer;
        match.issuerName = p.issuerName;
      }
      match.coinId = p.coinId;
      match.issuerName = p.issuerName;
      match.mapping = p.mapping;
      if (p.logo) match.logo = p.logo;
      match.wrapped = p.wrapped === true;
      match.unmappedPlatforms = p.unmappedPlatforms || [];
      match.marketSource = p.source;
      for (const d of p.deployments)
        if (
          !match.deployments.some(
            (v) =>
              v.chain === d.chain &&
              (d.chain === "Solana"
                ? v.address === d.address
                : v.address.toLowerCase() === d.address.toLowerCase()),
          )
        )
          match.deployments.push(d);
    }
  }
  return output;
}
export function parseRwaTokens(data, stock, { includeWrapped = false } = {}) {
  if (
    data?.id !== stock.rwaId ||
    symbolKey(data.symbol) !== symbolKey(stock.ticker) ||
    !Array.isArray(data.tokens)
  )
    throw new Error("CoinGecko returned an unrelated underlying asset.");
  return data.tokens
    .filter(
      (c) =>
        /^[a-z0-9-]+$/.test(c.id) &&
        typeof c.symbol === "string" &&
        (includeWrapped || !/^wrapped[ -]/i.test(c.name || c.id)),
    )
    .map((c) => {
      const native = c.issuer_details?.id;
      const alias = {
        "xstocks-ecosystem": "xstocks",
        "ondo-tokenized-assets": "ondo",
        "robinhood-chain-stocks-ecosystem": "robinhood",
        "bstocks-ecosystem": "bstocks",
        "backpack-securities-ecosystem": "backpack",
        "anchored-ecosystem": "anchored",
      };
      const issuer =
        alias[native] || native?.replace(/-ecosystem$/, "") || "unreviewed";
      return {
        ...product(
          c,
          issuer,
          new Date().toISOString(),
          "CoinGecko RWA grouping",
        ),
        issuerName: c.issuer_details?.name || issuerName(issuer),
      };
    })
    .filter((p) => p.deployments.length && (includeWrapped || !p.wrapped));
}
export function attachKnownProducts(stocks, coins, at) {
  const registry = new Map();
  for (const coin of coins) {
    if (
      !coin?.symbol ||
      typeof coin.name !== "string" ||
      /^wrapped /i.test(coin.name)
    )
      continue;
    const family = families.find(([, pattern]) => pattern.test(coin.name));
    if (!family) continue;
    const p = product(coin, family[0], at, "CoinGecko exact-contract mapping");
    const key = p.issuer + ":" + symbolKey(p.symbol);
    if (!registry.has(key)) registry.set(key, []);
    registry.get(key).push(p);
  }
  const copy = structuredClone(stocks);
  for (const stock of copy)
    for (const p of stock.products) {
      const candidates = (
        registry.get(p.issuer + ":" + symbolKey(p.symbol)) || []
      ).filter((q) =>
        p.deployments.some((d) =>
          q.deployments.some(
            (e) =>
              d.chain === e.chain &&
              (d.chain === "Solana"
                ? d.address === e.address
                : d.address.toLowerCase() === e.address.toLowerCase()),
          ),
        ),
      );
      if (candidates.length !== 1) continue;
      const q = candidates[0];
      p.coinId = q.coinId;
      p.marketSource = q.source;
      p.issuerName = q.issuerName;
      for (const d of q.deployments)
        if (
          !p.deployments.some(
            (e) =>
              e.chain === d.chain &&
              (d.chain === "Solana"
                ? d.address === e.address
                : d.address.toLowerCase() === e.address.toLowerCase()),
          )
        )
          p.deployments.push(d);
    }
  return copy;
}
export async function getDiscovery() {
  return memo("cg-discovery", 3600_000, () =>
    persistentCatalog("coingecko-discovery-v3", async () => {
      const [r, c] = await Promise.all([
        cg("/rwas/list", 3600_000),
        cg("/coins/list?include_platform=true", 3600_000),
      ]);
      return {
        stocks: discoverProducts(r.data, c.data, c.retrievedAt),
        universe: {
          underlyingRecords: r.data.length,
          securities: r.data.filter((r) =>
            ["stock", "etf"].includes(r.asset_type),
          ).length,
          coinRegistryRecords: c.data.length,
        },
        registry: c.data.filter(
          (coin) =>
            typeof coin.name === "string" &&
            !/^wrapped /i.test(coin.name) &&
            families.some(([, pattern]) => pattern.test(coin.name)),
        ),
        retrievedAt: c.retrievedAt,
      };
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
}
export async function getRwa(stock) {
  if (!stock.rwaId) return { products: [], warning: null };
  try {
    const result = await cg(
      `/rwas/${encodeURIComponent(stock.rwaId)}?tokens=true&tokenized_market_data=true`,
      300_000,
    );
    return {
      products: parseRwaTokens(result.data, stock, { includeWrapped: true }),
      logo: result.data.image?.small || result.data.image?.large || null,
      checkedAt: result.retrievedAt,
      aggregate: result.data.tokenized_market_data || null,
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
export async function getTokenMarkets(ids) {
  if (!ids.length) return { rows: [], retrievedAt: new Date().toISOString() };
  const unique = [...new Set(ids)].sort();
  const result = await cg(
    "/coins/markets?" +
      new URLSearchParams({
        vs_currency: "usd",
        ids: unique.join(","),
        per_page: "250",
        page: "1",
        sparkline: "false",
      }),
    60_000,
  );
  return {
    rows: parseTokenMarkets(result.data, unique),
    retrievedAt: result.retrievedAt,
  };
}

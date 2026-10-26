import { CHAINS, validAddress } from "./config.mjs";
export function normalizeIssuer(id) {
  const aliases = {
    "xstocks-ecosystem": "xstocks",
    "ondo-tokenized-assets": "ondo",
    "robinhood-chain-stocks-ecosystem": "robinhood",
    "bstocks-ecosystem": "bstocks",
    "backpack-securities-ecosystem": "backpack",
    "anchored-ecosystem": "anchored",
  };
  return aliases[id] || id?.replace(/-ecosystem$/, "") || "unreviewed";
}
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
    coinIdSourceAt: at,
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
        ((s.rwaId && s.rwaId === item.rwaId) ||
          cleanName(s.name) === cleanName(item.name) ||
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
      match.coinIdSourceAt = p.coinIdSourceAt;
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
          match.deployments.push({
            ...d,
            sourceAt: p.sourceAt,
            source: p.source,
          });
    }
  }
  return output;
}
export function parseRwaTokens(
  data,
  stock,
  { includeWrapped = false, retrievedAt = new Date().toISOString() } = {},
) {
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
      const issuer = normalizeIssuer(native);
      return {
        ...product(c, issuer, retrievedAt, "CoinGecko RWA grouping"),
        issuerName: c.issuer_details?.name || issuerName(issuer),
      };
    })
    .filter((p) => p.deployments.length && (includeWrapped || !p.wrapped));
}
export function attachKnownProducts(stocks, coins, at) {
  const registry = new Map();
  const key = (issuer, d) =>
    issuer +
    ":" +
    d.chain +
    ":" +
    (["Solana", "TON", "Tron"].includes(d.chain)
      ? d.address
      : d.address.toLowerCase());
  for (const coin of coins) {
    if (
      !coin?.id ||
      !coin?.symbol ||
      typeof coin.name !== "string" ||
      isWrappedProduct(coin)
    )
      continue;
    const family = families.find(([, pattern]) => pattern.test(coin.name));
    const issuer = coin.issuer_details?.id
      ? normalizeIssuer(coin.issuer_details.id)
      : family?.[0];
    if (!issuer) continue;
    const p = product(
      coin,
      issuer,
      coin.sourceAt || at,
      "CoinGecko exact-contract mapping",
    );
    for (const d of p.deployments) {
      const k = key(issuer, d);
      if (!registry.has(k)) registry.set(k, new Map());
      registry.get(k).set(p.coinId, p);
    }
  }
  const copy = structuredClone(stocks);
  const owners = new Map();
  for (const stock of stocks)
    for (const product of stock.products)
      for (const d of product.deployments) {
        const k = key(product.issuer, d);
        if (!owners.has(k)) owners.set(k, new Set());
        owners.get(k).add(stock.id);
      }
  for (const stock of copy)
    for (const p of stock.products) {
      const candidates = new Map();
      for (const d of p.deployments)
        for (const [id, q] of registry.get(key(p.issuer, d)) || [])
          candidates.set(id, q);
      if (candidates.size !== 1) continue;
      const q = [...candidates.values()][0];
      if (
        q.deployments.some((d) =>
          [...(owners.get(key(q.issuer, d)) || [])].some(
            (id) => id !== stock.id,
          ),
        )
      )
        continue;
      p.coinId = q.coinId;
      p.coinIdSourceAt = q.coinIdSourceAt;
      p.marketSource = q.source;
      p.issuerName = q.issuerName;
      for (const d of q.deployments)
        if (!p.deployments.some((e) => key(p.issuer, e) === key(p.issuer, d)))
          p.deployments.push({ ...d, sourceAt: q.sourceAt, source: q.source });
    }
  return copy;
}

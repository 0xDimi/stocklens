import { CHAINS, validAddress } from "./config.mjs";
import { request } from "./http.mjs";

export const REALITY_API =
  "https://api.realityfinance.xyz/api/v1/rwa/assets/tickers";
const networks = { ARB: "Arbitrum", Morph: "Morph" };
export const contractKey = ({ chain, address }) =>
  chain +
  ":" +
  (["Solana", "TON", "Tron"].includes(chain) ? address : address.toLowerCase());
const tickerKey = (value) =>
  String(value || "")
    .toUpperCase()
    .replace(/[.\-]/g, "");
export function validIsin(value) {
  if (typeof value !== "string" || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(value))
    return false;
  const digits = [...value]
    .map((c) => (/[A-Z]/.test(c) ? parseInt(c, 36) : c))
    .join("");
  return (
    [...digits].reverse().reduce((total, c, i) => {
      const n = Number(c) * (i % 2 ? 2 : 1);
      return total + Math.floor(n / 10) + (n % 10);
    }, 0) %
      10 ===
    0
  );
}
const pending = (stock, product, reason) => ({
  issuer: product.issuer,
  symbol: product.symbol,
  claimedUnderlying: { isin: stock.id, ticker: stock.ticker, name: stock.name },
  source: product.source,
  sourceAt: product.sourceAt,
  deployments: product.deployments,
  reason,
});
export function parseRealityCatalog(data, at) {
  if (
    ![200, "200"].includes(data?.code) ||
    !Array.isArray(data.data) ||
    !Number.isFinite(Date.parse(at))
  )
    throw new Error("Unexpected Reality catalog response.");
  const stocks = [],
    pendingProducts = [],
    owners = new Map();
  const candidates = [];
  for (const row of data.data) {
    if (
      !row ||
      row.status !== "active" ||
      !["equity", "etf"].includes(row.type)
    )
      continue;
    const groups = new Map();
    for (const token of Array.isArray(row.tokens) ? row.tokens : []) {
      const chain = networks[token?.network];
      if (
        !CHAINS[chain] ||
        !validAddress(chain, token.address) ||
        typeof token.symbol !== "string" ||
        !/^[A-Za-z0-9.\-]{1,80}$/.test(token.symbol)
      )
        continue;
      const symbol = token.symbol;
      if (!groups.has(symbol)) groups.set(symbol, []);
      const deployment = {
        chain,
        address: token.address,
        provenance: "Reality official token catalog",
      };
      if (
        !groups
          .get(symbol)
          .some((d) => contractKey(d) === contractKey(deployment))
      )
        groups.get(symbol).push(deployment);
    }
    for (const [symbol, deployments] of groups) {
      const stock = {
        id: row.isin || "",
        ticker: row.ticker,
        name: row.title || row.name || row.ticker,
        category: row.type === "etf" ? "ETF" : "Stock",
        sourceAt: at,
        currency: "USD",
        exchange: "",
        logo:
          typeof row.icon === "string" && row.icon.startsWith("https://")
            ? row.icon
            : null,
        products: [],
      };
      const product = {
        issuer: "reality",
        issuerName: "Reality",
        symbol,
        name: stock.name + " (Reality)",
        source: REALITY_API,
        sourceAt: at,
        mapping: "Official issuer underlying ISIN and token contract",
        halted: false,
        wrapped: false,
        deployments,
      };
      candidates.push({ stock, product });
      for (const d of deployments) {
        const key = contractKey(d);
        if (!owners.has(key)) owners.set(key, new Set());
        owners.get(key).add(stock.id + ":" + tickerKey(stock.ticker));
      }
    }
  }
  for (const { stock, product } of candidates) {
    const reason =
      !validIsin(stock.id) || !/^[A-Za-z0-9.\-]{1,40}$/.test(stock.ticker || "")
        ? "Issuer record lacks a valid underlying security identifier."
        : product.deployments.some((d) => owners.get(contractKey(d)).size > 1)
          ? "Issuer catalog assigns this token contract to conflicting underlying securities."
          : null;
    if (reason) pendingProducts.push(pending(stock, product, reason));
    else stocks.push({ ...stock, products: [product] });
  }
  return {
    stocks,
    pendingProducts,
    counts: {
      records: data.data.length,
      identified: stocks.length,
      pending: pendingProducts.length,
    },
  };
}
export const realityCatalog = () => request(REALITY_API);

// The security identifier or an issuer's exact token contract is the join key.
// Names and tickers never establish an association on their own.
export function mergeIssuerCatalog(existing, incoming) {
  const stocks = structuredClone(existing);
  const pendingProducts = [...(incoming.pendingProducts || [])];
  const byId = new Map(),
    byContract = new Map();
  const index = (stock) => {
    byId.set(stock.id, stock);
    for (const p of stock.products)
      for (const d of p.deployments) {
        const key = p.issuer + ":" + contractKey(d);
        if (!byContract.has(key)) byContract.set(key, new Set());
        byContract.get(key).add(stock);
      }
  };
  stocks.forEach(index);
  for (const row of incoming.stocks) {
    const product = row.products[0];
    const exact = new Set(
      product.deployments.flatMap((d) => [
        ...(byContract.get(product.issuer + ":" + contractKey(d)) || []),
      ]),
    );
    const official = byId.get(row.id);
    const targets = new Set([...exact, ...(official ? [official] : [])]);
    if (
      [...targets].some(
        (s) =>
          tickerKey(s.ticker) !== tickerKey(row.ticker) ||
          (validIsin(s.id) && s.id !== row.id),
      ) ||
      [...targets].filter((s) => validIsin(s.id)).length > 1
    ) {
      pendingProducts.push(
        pending(
          row,
          product,
          "Issuer identity conflicts with an existing canonical security.",
        ),
      );
      continue;
    }
    let target =
      official || [...targets].find((s) => validIsin(s.id)) || [...targets][0];
    if (!target) {
      target = structuredClone(row);
      stocks.push(target);
      index(target);
      continue;
    }
    // A registry-only row becomes an alias once its exact issuer contract proves the ISIN.
    if (!validIsin(target.id)) {
      target.aliases = [...new Set([...(target.aliases || []), target.id])];
      target.id = row.id;
    }
    for (const duplicate of targets) {
      if (duplicate === target) continue;
      target.aliases = [
        ...new Set([
          ...(target.aliases || []),
          ...(duplicate.aliases || []),
          duplicate.id,
        ]),
      ].filter((id) => id !== target.id);
      target.rwaId ||= duplicate.rwaId;
      target.products.push(
        ...duplicate.products.filter(
          (p) =>
            !target.products.some((q) => p.coinId && p.coinId === q.coinId),
        ),
      );
      stocks.splice(stocks.indexOf(duplicate), 1);
      // Repoint the index so subsequent contracts cannot resurrect the duplicate.
      for (const owners of byContract.values())
        if (owners.delete(duplicate)) owners.add(target);
      byId.set(duplicate.id, target);
    }
    const matched = target.products.find(
      (p) =>
        p.issuer === product.issuer &&
        p.deployments.some((d) =>
          product.deployments.some((e) => contractKey(d) === contractKey(e)),
        ),
    );
    if (matched) {
      const deployments = [...product.deployments];
      for (const d of matched.deployments)
        if (!deployments.some((e) => contractKey(d) === contractKey(e)))
          deployments.push({
            ...d,
            sourceAt: d.sourceAt || matched.sourceAt,
            source: d.source || matched.source,
          });
      Object.assign(matched, {
        ...product,
        coinId: matched.coinId,
        coinIdSourceAt: matched.coinIdSourceAt || matched.sourceAt,
        marketSource: matched.marketSource,
        deployments,
      });
    } else target.products.push(structuredClone(product));
    if (!["Stock", "ETF"].includes(target.category))
      target.category = row.category;
    target.logo ||= row.logo;
    index(target);
  }
  return { stocks, pendingProducts };
}

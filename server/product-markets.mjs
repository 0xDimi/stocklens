import { getPools } from "./gecko.mjs";
import { contractKey } from "./issuer-catalog.mjs";
import { getTokenMarkets } from "./coingecko.mjs";
import { getQuote } from "./providers.mjs";
import { mapLimit, observeWithin } from "./http.mjs";

export async function productMarkets(
  stock,
  {
    primary = getTokenMarkets,
    quote = getQuote,
    pools = getPools,
    timeoutMs = 8000,
    budgetMs = 20000,
  } = {},
) {
  const deadline = Date.now() + budgetMs;
  const remaining = () => Math.max(1, deadline - Date.now());
  let retained = null;
  try {
    retained = await observeWithin(
      () => primary(stock.products.map((p) => p.coinId).filter(Boolean)),
      Math.min(timeoutMs, remaining()),
    );
    if (
      stock.products.every(
        (p) =>
          p.coinId &&
          retained.rows?.some((r) => r.coinId === p.coinId && r.price > 0),
      )
    )
      return retained;
  } catch {
    /* Exact-contract quote observations are an independent source. */
  }
  const poolRows = [];
  if (stock.products.some((p) => !p.coinId && !p.halted)) {
    try {
      const observed = await observeWithin(
        () => pools(stock),
        Math.min(18000, remaining()),
      );
      for (const p of stock.products.filter((p) => !p.coinId && !p.halted)) {
        const pool = observed.rows.find(
          (row) =>
            row.issuer === p.issuer &&
            row.symbol === p.symbol &&
            row.price > 0 &&
            p.deployments.some(
              (d) =>
                contractKey(d) ===
                contractKey({ chain: row.chain, address: row.address }),
            ),
        );
        if (!pool) continue;
        poolRows.push({
          productKey: p.issuer + ":" + p.symbol,
          price: pool.price,
          change24h: pool.change24h ?? null,
          volume24h: pool.volume24h ?? null,
          marketCap: null,
          updatedAt: pool.retrievedAt,
          source: pool.source,
          priceType: "pool-snapshot",
          chain: pool.chain,
          address: pool.address,
          basis:
            "USD per raw token from an exact-contract pool observation; not an executable order quote or a share conversion.",
        });
      }
    } catch {
      /* Verified products remain visible if the pool feed has no observation. */
    }
  }
  const observations = await mapLimit(
    stock.products.filter(
      (p) =>
        p.coinId &&
        !p.halted &&
        !retained?.rows?.some((r) => r.coinId === p.coinId && r.price > 0),
    ),
    4,
    async (product) => {
      const order = [
        "Solana",
        "BinanceSmartChain",
        "Ethereum",
        "Base",
        "Arbitrum",
      ];
      const deployments = product.deployments
        .filter((d) => order.includes(d.chain))
        .sort((a, b) => order.indexOf(a.chain) - order.indexOf(b.chain));
      for (const deployment of deployments.slice(0, 2)) {
        const result = await observeWithin(
          () => quote(product, deployment, "1000"),
          Math.min(8000, remaining()),
        ).catch(() => ({ status: "unavailable" }));
        if (result.status !== "quoted" || !(result.tokenQuantity > 0)) continue;
        return {
          coinId: product.coinId,
          price: 1000 / result.tokenQuantity,
          change24h: null,
          volume24h: null,
          marketCap: null,
          updatedAt: new Date(result.fetchedAt).toISOString(),
          source: result.quoteSource,
          priceType: "indicative-buy",
          budget: 1000,
          chain: deployment.chain,
          basis:
            "USD per raw token from a $1,000 USDC indicative buy, before gas; USDC assumed $1. Not a last-traded price.",
        };
      }
      return null;
    },
  );
  const fallback = observations.filter(Boolean);
  const rows = [...(retained?.rows || []), ...poolRows];
  for (const row of fallback) {
    const index = rows.findIndex((r) => r.coinId === row.coinId);
    if (index >= 0) rows[index] = row;
    else rows.push(row);
  }
  return {
    rows,
    retrievedAt: fallback.length
      ? new Date().toISOString()
      : retained?.retrievedAt || poolRows[0]?.updatedAt || null,
    stale: !fallback.length && retained?.stale === true,
    warning: fallback.length
      ? "Some prices use exact-contract indicative $1,000 buys while the aggregate feed refreshes. See each price basis."
      : poolRows.length
        ? "Some prices are exact-contract pool observations. See each price basis."
        : "Market observations are temporarily unavailable; verified products and their venue links remain available.",
  };
}

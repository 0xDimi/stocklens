import { getTokenMarkets } from "./coingecko.mjs";
import { getQuote } from "./providers.mjs";
import { mapLimit, observeWithin } from "./http.mjs";

export async function productMarkets(
  stock,
  {
    primary = getTokenMarkets,
    quote = getQuote,
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
    if (retained.rows?.length || !retained.stale) return retained;
  } catch {
    /* Exact-contract quote observations are an independent source. */
  }
  const observations = await mapLimit(
    stock.products.filter((p) => p.coinId && !p.halted),
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
  const rows = [...(retained?.rows || [])];
  for (const row of fallback) {
    const index = rows.findIndex((r) => r.coinId === row.coinId);
    if (index >= 0) rows[index] = row;
    else rows.push(row);
  }
  return {
    rows,
    retrievedAt: fallback.length
      ? new Date().toISOString()
      : retained?.retrievedAt || null,
    stale: !fallback.length && retained?.stale === true,
    warning: fallback.length
      ? "Some prices use exact-contract indicative $1,000 buys while the aggregate feed refreshes. See each price basis."
      : "Market observations are temporarily unavailable; verified products and their venue links remain available.",
  };
}

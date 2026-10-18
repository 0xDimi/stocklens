// Pure calculations. Demo assumptions live in data.mjs, never in the UI.
export function quoteRoute(stock, route, budget) {
  if (
    typeof budget !== "number" ||
    !Number.isFinite(budget) ||
    budget <= route.networkFee ||
    budget > 1_000_000
  )
    return null;
  const impactBps = (route.impactBpsPerThousand * budget) / 1000;
  const tokenPrice =
    stock.referencePrice *
    route.shareRatio *
    (1 + (route.spreadBps + impactBps) / 10000);
  const tokenQuantity =
    (budget - route.networkFee) / (tokenPrice * (1 + route.feeBps / 10000));
  const equivalentShares = tokenQuantity * route.shareRatio;
  const effectivePrice = budget / equivalentShares;
  return {
    ...route,
    tokenPrice,
    tokenQuantity,
    equivalentShares,
    effectivePrice,
    impactBps,
    premiumBps: (effectivePrice / stock.referencePrice - 1) * 10000,
    totalCost: budget - equivalentShares * stock.referencePrice,
  };
}

export function compareRoutes(stock, routes, budget, chain = "All chains") {
  return routes
    .filter((route) => chain === "All chains" || route.chain === chain)
    .map((route) => quoteRoute(stock, route, budget))
    .filter(Boolean)
    .sort(
      (a, b) => a.effectivePrice - b.effectivePrice || a.id.localeCompare(b.id),
    );
}

export function findStocks(stocks, query) {
  const search = query.trim().toLowerCase();
  return stocks.filter((stock) =>
    `${stock.ticker} ${stock.name}`.toLowerCase().includes(search),
  );
}

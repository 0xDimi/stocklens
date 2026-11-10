export function pagePath(pathname) {
  const match = /^\/(stock|issuer)\/([A-Za-z0-9.:-]{1,100})\/?$/.exec(pathname);
  return match ? { type: match[1], key: match[2] } : null;
}

export function pageParams(location) {
  const params = new URLSearchParams(location.search);
  const route = pagePath(location.pathname);
  if (route?.type === "stock") {
    params.set("page", params.get("view") ? "comparison" : "stock");
    params.set("stock", route.key);
  } else if (route?.type === "issuer") {
    params.set("page", "issuers");
    params.set("issuer", route.key);
  }
  return params;
}

export function stockPath(stock, universe) {
  const unique =
    /^[A-Za-z0-9.-]+$/.test(stock.ticker) &&
    universe.filter((asset) => asset.ticker === stock.ticker).length === 1;
  return "/stock/" + (unique ? stock.ticker : stock.id);
}

export function findRouteStock(stocks, key) {
  const exact = stocks.find((stock) => stock.id === key);
  if (exact) return exact;
  const matches = stocks.filter((stock) => stock.ticker === key.toUpperCase());
  return matches.length === 1 ? matches[0] : null;
}

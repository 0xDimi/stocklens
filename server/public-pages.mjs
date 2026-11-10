import { pagePath, stockPath, findRouteStock } from "../src/page-routes.mjs";
import { issuers } from "../src/data.mjs";
import { escape } from "../src/views.mjs";

const DEFAULT_ORIGIN = "https://stocklens-osft.onrender.com";
export function siteOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password)
      return url.origin;
  } catch {}
  return DEFAULT_ORIGIN;
}

function issuerIds(stocks) {
  return new Set(
    stocks.flatMap((stock) => stock.products.map((p) => p.issuer)),
  );
}

export function sitemap(stocks, origin) {
  const tickerCounts = new Map();
  for (const { ticker } of stocks)
    tickerCounts.set(ticker, (tickerCounts.get(ticker) || 0) + 1);
  const paths = ["/", "/?page=markets", "/?page=issuers"];
  for (const stock of stocks) {
    if (!stock.products.length || stock.category === "Pre-IPO") continue;
    paths.push(
      stockPath(stock, tickerCounts.get(stock.ticker) === 1 ? [stock] : []),
    );
  }
  for (const id of issuerIds(stocks))
    paths.push("/issuer/" + encodeURIComponent(id));
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    paths
      .map((path) => "<url><loc>" + escape(origin + path) + "</loc></url>")
      .join("") +
    "</urlset>"
  );
}

export function publicPage(url, stocks, origin) {
  const route = pagePath(url.pathname);
  const page = url.searchParams.get("page");
  const key =
    route?.key ||
    url.searchParams.get("stock") ||
    url.searchParams.get("ticker");
  const stock =
    key && route?.type !== "issuer" ? findRouteStock(stocks, key) : null;
  const issuer =
    route?.type === "issuer"
      ? route.key
      : page === "issuers"
        ? url.searchParams.get("issuer")
        : null;
  if (
    route &&
    (route.type === "stock" ? !stock : !issuerIds(stocks).has(issuer))
  )
    return null;
  let title = "Stocklens — Compare tokenized stocks";
  let description =
    "Compare tokenized stocks and ETFs by issuer, network, terms and share-equivalent buy quotes.";
  let path = "/";
  if (issuer && issuerIds(stocks).has(issuer)) {
    const name = Object.hasOwn(issuers, issuer) ? issuers[issuer].name : issuer;
    title = name + " tokenized stocks — Stocklens";
    description =
      "Explore " +
      name +
      " tokenized stocks, supported networks and issuer disclosures.";
    path = "/issuer/" + encodeURIComponent(issuer);
  } else if (stock && !["markets", "issuers", "compare"].includes(page)) {
    title =
      stock.name +
      " (" +
      stock.ticker +
      ") tokenized stock comparison — Stocklens";
    description =
      "Compare tokenized versions of " +
      stock.name +
      " by issuer, network, product terms and supported buy quotes.";
    path = stockPath(stock, stocks);
  } else if (page === "markets" || page === "issuers") {
    title =
      (page === "markets"
        ? "Tokenized stock markets"
        : "Tokenized stock issuers") + " — Stocklens";
    path = "/?page=" + page;
  }
  return { title, description, canonical: origin + path };
}

export function addPageMetadata(html, { title, description, canonical }) {
  return html
    .replace(
      /<title>[^<]*<\/title>/,
      () =>
        "<title>" +
        escape(title) +
        "</title>\n" +
        '<link rel="canonical" href="' +
        escape(canonical) +
        '" />\n' +
        '<meta property="og:type" content="website" />\n' +
        '<meta property="og:title" content="' +
        escape(title) +
        '" />\n' +
        '<meta property="og:description" content="' +
        escape(description) +
        '" />\n' +
        '<meta property="og:url" content="' +
        escape(canonical) +
        '" />',
    )
    .replace(
      /(<meta\s+name="description"\s+content=")[^"]*/,
      (_, prefix) => prefix + escape(description),
    )
    .replace(
      "<body>",
      () =>
        "<body><noscript><main><h1>" +
        escape(title) +
        "</h1><p>" +
        escape(description) +
        "</p></main></noscript>",
    );
}

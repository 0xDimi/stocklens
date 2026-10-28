// Real source images only. This allowlist also defines the page's image CSP.
export const IMAGE_HOSTS = [
  "coin-images.coingecko.com",
  "assets.coingecko.com",
  "xstocks-metadata.backed.fi",
  "cdn.ondo.finance",
];
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function safeLogo(value) {
  if (typeof value !== "string") return null;
  if (/^\/assets\/logos\/[a-zA-Z0-9_.-]+\.(png|webp|svg)$/.test(value))
    return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      IMAGE_HOSTS.includes(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function logo({ name = "?", url = null, kind = "", size = "" } = {}) {
  const src = safeLogo(url),
    fallback =
      String(name)
        .replace(/[^\p{L}\p{N}]/gu, "")
        .slice(0, 2) || "?";
  return `<span class="entity-logo ${escape(kind)} ${escape(size)}" title="${escape(name)}"><span aria-hidden="true">${escape(fallback)}</span>${src ? `<img src="${escape(src)}" alt="" width="40" height="40" loading="lazy" decoding="async" referrerpolicy="no-referrer" />` : ""}</span>`;
}
export const brandPath = (kind, id) =>
  `/assets/logos/${kind}-${String(id).replace(/[^a-zA-Z0-9_.-]/g, "")}.png`;
const companyTickers = new Set([
  "NVDA",
  "AAPL",
  "TSLA",
  "MSFT",
  "AMZN",
  "GOOGL",
  "GOOG",
  "META",
  "COIN",
  "AMD",
  "SPY",
  "QQQ",
  "SOXL",
  "MSTR",
  "INTC",
  "CRCL",
  "MU",
  "AVGO",
  "PLTR",
  "ORCL",
  "GLD",
  "NFLX",
  "COST",
  "TSM",
  "JPM",
  "WMT",
  "LLY",
  "BRK.B",
]);
export function stockLogo(stock, image = null) {
  const local =
    companyTickers.has(stock.ticker) &&
    (stock.id?.startsWith("US") || stock.rwaId)
      ? brandPath("stock", stock.ticker.replace(".", "-"))
      : null;
  return logo({
    name: stock.ticker || stock.name,
    url:
      local ||
      image ||
      stock.logo ||
      stock.products?.find((p) => p.logo)?.logo ||
      null,
    kind: "stock-logo",
  });
}
const issuerMarks = new Set([
  "xstocks",
  "ondo",
  "bstocks",
  "robinhood",
  "dinari",
  "coinbase",
  "backpack",
  "anchored",
  "reality",
  "st0x",
  "stove",
]);
export const issuerLogo = (product) =>
  logo({
    name: product.issuerName || product.issuer,
    url: issuerMarks.has(product.issuer)
      ? brandPath("issuer", product.issuer)
      : null,
    kind: "issuer-logo",
  });
export const chainLogo = (id, name = id) =>
  logo({ name, url: brandPath("chain", id), kind: "chain-logo" });
const venueAliases = [
  ["raydium", "raydium"],
  ["kyber", "kyberswap"],
  ["uniswap", "uniswap"],
  ["pancake", "pancakeswap"],
  ["jupiter", "jupiter"],
  ["kraken", "kraken"],
  ["gate", "gate"],
  ["coinbase", "coinbase"],
  ["backpack", "backpack"],
  ["meteora", "meteora"],
  ["binance", "binance"],
];
export const venueLogo = (name) => {
  const id = venueAliases.find(([match]) =>
    String(name).toLowerCase().includes(match),
  )?.[1];
  return logo({
    name,
    url: id ? brandPath("venue", id) : null,
    kind: "venue-logo",
  });
};
export function observeLogoErrors(root = document) {
  root.addEventListener(
    "error",
    (event) => {
      if (event.target.matches?.(".entity-logo img")) event.target.remove();
    },
    true,
  );
}

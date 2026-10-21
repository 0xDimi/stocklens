import { renderProductTerms } from "./product-terms.mjs";
import { escape, usd, compact, number, stamp, provider } from "./views.mjs";
import {
  stockLogo,
  issuerLogo,
  chainLogo,
  observeLogoErrors,
} from "./brands.mjs";
import {
  canonicalSelection,
  productCoverage,
  chartSeries,
  profileMetric,
  profileSpot,
  createVenueLoader,
  observationIsStale,
  profileComparisonSelection,
  mergeProfileDetails,
  createVisiblePageRefresh,
} from "./asset-comparison-model.mjs";

const signed = (value) =>
  Number.isFinite(value)
    ? `${value > 0 ? "+" : ""}${number(value)}%`
    : "Unavailable";
const tone = (value) => (value < 0 ? "negative" : value > 0 ? "positive" : "");
function link(url, label, className = "") {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password)
      return escape(label);
    return `<a class="${className}" href="${escape(parsed.href)}" target="_blank" rel="noopener noreferrer">${escape(label)} ↗</a>`;
  } catch {
    return escape(label);
  }
}
const referenceTime = (r) =>
  r?.priceDate
    ? `${escape(r.priceDate)} · date supplied by source`
    : stamp(r?.at);
const older = (at) => observationIsStale(at);

// The overview extends Stocklens's daylight table language. Two distinct price
// bases lead; observed history and expandable contracts carry the evidence.
export function createStockPages({
  root,
  compareRoot,
  getStocks,
  getMarkets,
  getChains = () => [],
  getSaved = () => new Set(),
  getDetails = () => null,
  getComparison = () => [],
  onDetails = () => {},
  onToggleSave,
  onCompareVersions,
  onOpenStock,
  onCompareAssets,
  api,
}) {
  const document = root.ownerDocument;
  const cache = new Map();
  let active = null,
    tab = "overview",
    generation = 0,
    controller = null,
    destroyed = false,
    pendingLoad = null,
    loadKey = null;
  let comparisonIds = [],
    selectedIds = [],
    chooserOpener = null;
  const dialog = document.createElement("dialog");
  dialog.className = "stock-chooser";
  dialog.setAttribute("aria-labelledby", "stock-chooser-title");
  dialog.innerHTML = `<form method="dialog" class="stock-chooser-heading"><div><h2 id="stock-chooser-title">Compare stocks</h2><p>Choose 2–5 underlying assets.</p></div><button aria-label="Close stock chooser" value="cancel">×</button></form><label class="stock-chooser-search">Find a stock or ETF<input type="search" placeholder="Search company or ticker" autocomplete="off" /></label><div class="stock-chooser-selected" aria-label="Selected stocks"></div><p class="stock-chooser-count" aria-live="polite"></p><div class="stock-chooser-options" aria-label="Available stocks"></div><div class="stock-chooser-footer"><span>Token versions are compared separately.</span><button class="stock-primary" data-stock-confirm>Compare stocks</button></div>`;
  document.body.append(dialog);
  observeLogoErrors(root);
  observeLogoErrors(compareRoot);
  observeLogoErrors(dialog);
  const find = (id) => getStocks().find((stock) => stock.id === id);
  const entry = (id) => mergeProfileDetails(cache.get(id), getDetails(id));
  const stockFor = (id) => entry(id).stock || find(id);
  const marketFor = (id) => entry(id).market ?? getMarkets().get(id);
  const chain = (id) =>
    getChains().find((network) => network.id === id) || { id, label: id };
  const networkName = (id) => chain(id).label;
  const request =
    api ||
    (async (path, { signal }) => {
      const response = await fetch(path, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(40000)]),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Source request failed");
      return data;
    });
  const venues = createVenueLoader({
    fetchVenues: ({ stockId, coinId, signal }) =>
      request(
        `/api/venues?${new URLSearchParams({ stock: stockId, coin: coinId, chain: "all" })}`,
        { signal },
      ),
    onChange: () => render(),
  });
  function venueMarkup(stockId, product) {
    if (!product.coinId)
      return '<p class="stock-muted">Trading venue observations are not connected for this product.</p>';
    const key = stockId + ":" + product.coinId,
      data = venues.get(key),
      busy = data?.status === "loading";
    return `<div class="stock-trading-venues"><button data-stock-venues="${escape(product.coinId)}" data-stock-venue-asset="${escape(stockId)}" ${focusKey("venues:" + key)} ${busy ? "disabled" : ""}>${busy ? "Loading trading venues…" : data?.status === "error" ? "Retry trading venues" : data?.status === "ready" ? "Refresh trading venues" : "Show trading venues"}</button>${data?.status === "error" ? `<p class="stock-venue-error" role="status">${escape(data.error)}</p>` : ""}${data?.rows?.length ? `<p class="stock-venue-basis">Token-wide venue observations across networks, separate from executable buy quotes. ${data.basis ? escape(data.basis) : "The destination sets access rules and refreshes its price."}</p><div class="stock-venue-scroll" data-stock-scroll="venues:${escape(key)}"><table class="stock-venue-table"><caption class="sr-only">Trading venues observed for ${escape(product.symbol)}</caption><thead><tr><th scope="col">Venue / pair</th><th scope="col">Observed price</th><th scope="col">24h volume</th><th scope="col">Source</th></tr></thead><tbody>${data.rows.map((row) => `<tr><th scope="row"><strong>${escape(row.exchange)}</strong><small>${escape(row.pair)}${row.isAnomaly ? " · Flagged anomaly" : ""}</small></th><td>${Number.isFinite(row.priceUsd) ? usd(row.priceUsd) : "Not supplied"}<small>${row.isStale ? "Older observation · " : ""}${stamp(row.sourceAt)}</small></td><td>${Number.isFinite(row.volumeUsd) ? compact(row.volumeUsd) : "Not supplied"}</td><td>${link(row.url, row.urlKind === "exchange-market" ? "Open exchange" : "View source directory")}</td></tr>`).join("")}</tbody></table></div><p class="stock-muted">${data.total > 10 ? `Showing 10 of ${data.total} returned observations. ` : ""}Retrieved ${stamp(data.retrievedAt)}. Refresh is available once per minute.</p>` : data?.status === "ready" ? '<p class="stock-muted">No venue observations returned for this exact product. Use Compare buy quotes to check supported routes.</p>' : ""}${(data?.warnings || []).length ? `<details class="stock-source-warning" data-stock-detail="venue-notes:${escape(key)}"><summary>Venue coverage notes</summary>${data.warnings.map((warning) => `<p>${escape(warning)}</p>`).join("")}</details>` : ""}</div>`;
  }
  const focusKey = (key) => `data-stock-focus="${escape(key)}"`;
  function replace(container, markup) {
    const focused = document.activeElement;
    const key = container.contains(focused) ? focused.dataset.stockFocus : null;
    const opened = new Set(
      [...container.querySelectorAll("details[open][data-stock-detail]")].map(
        (node) => node.dataset.stockDetail,
      ),
    );
    const scrolls = new Map(
      [...container.querySelectorAll("[data-stock-scroll]")].map((node) => [
        node.dataset.stockScroll,
        { left: node.scrollLeft, top: node.scrollTop },
      ]),
    );
    container.innerHTML = markup;
    container.querySelectorAll("[data-stock-scroll]").forEach((node) => {
      const position = scrolls.get(node.dataset.stockScroll);
      if (position) {
        node.scrollLeft = position.left;
        node.scrollTop = position.top;
      }
    });
    container.querySelectorAll("details[data-stock-detail]").forEach((node) => {
      node.open = opened.has(node.dataset.stockDetail);
    });
    if (key && [focused, document.body].includes(document.activeElement))
      [...container.querySelectorAll("[data-stock-focus]")]
        .find((node) => node.dataset.stockFocus === key)
        ?.focus({ preventScroll: true });
  }
  const actions = (id) =>
    `<button class="stock-primary" data-stock-versions="${escape(id)}" ${focusKey("versions")}>Compare token versions</button><button data-stock-quotes="${escape(id)}" ${focusKey("quotes")}>Compare buy quotes</button>`;
  function listedPrice(stock, data) {
    const r = data.reference;
    return `<div class="stock-price"><span>Listed ${stock.category === "ETF" ? "ETF" : "stock"} <small>USD</small></span><strong>${Number.isFinite(r?.price) ? usd(r.price) : data.loading ? "Loading…" : "Unavailable"}</strong><p>${r ? `${escape(r.exchange || "Nasdaq reference")} · ${escape(r.priceSession || "Session not supplied")}${observationIsStale(r) ? " · Older observation" : ""}` : escape(data.referenceReason || "Listed-security source has not returned a price.")}</p><small>${r ? `${referenceTime(r)} · ${link(r.priceSource || r.source, "Source")}` : "No listed price estimated"}</small></div>`;
  }
  function tokenPrice(id) {
    const market = marketFor(id);
    return `<div class="stock-price stock-aggregate-reference"><span>Tokenized aggregate <small>USD market reference</small></span><strong>${Number.isFinite(market?.price) ? usd(market.price) : entry(id).loading ? "Loading…" : "Unavailable"}</strong><p>${Number.isFinite(market?.change24h) ? `<b class="${tone(market.change24h)}">${signed(market.change24h)}</b> past 24h` : "24h change not supplied"}</p><small>${link("https://www.coingecko.com/en/categories/tokenized-stock", "CoinGecko")} · ${market?.updatedAt ? `${older(market) ? "Older observation · " : ""}${stamp(market.updatedAt)}` : "Observation time not supplied"}</small></div>`;
  }
  function poolPrice(data) {
    const p = data.spotPremium,
      observed = profileSpot(data);
    const available = Number.isFinite(p?.price) && p.price > 0;
    return `<div class="stock-price stock-pool-price"><span>Representative pool <small>USD per equivalent share</small></span><strong>${available ? usd(p.price) : data.loading ? "Loading…" : "Unavailable"}</strong><p>${available ? `${observed?.stale ? "Older observation · " : ""}${escape(p.symbol || "Representative token")}${p.chain ? " on " + escape(networkName(p.chain)) : ""}` : escape(data.spotPremiumReason || "A pool price with verified share conversion is required.")}</p><small>${available ? `${stamp(p.priceAt)} · ${link(p.source, "Pool source")}` : "No pool price estimated"}</small></div>`;
  }
  function spotPanel(data) {
    const observed = profileSpot(data),
      p = data.spotPremium;
    return `<div class="stock-spot"><span>Share-normalized spot premium</span><strong class="${observed ? tone(observed.value) : ""}">${observed ? signed(observed.value) : data.loading ? "Loading…" : "Unavailable"}</strong><p>${observed ? `${observed.stale ? "Older observation · " : ""}${p.referenceBasis === "last-close" ? "Versus listed last close" : "Versus listed reference"} · ${escape(p.symbol || "Representative token")}${p.chain ? " on " + escape(networkName(p.chain)) : ""}` : escape(data.spotPremiumReason || "A comparable spot price and verified share conversion are required.")}</p>${observed ? `<details data-stock-detail="spot"><summary ${focusKey("spot-source")}>Price basis & sources</summary><p>${escape(p.basis)} Observed spot ${usd(p.price)} per equivalent share versus listed ${usd(p.referencePrice)}. ${Number.isFinite(p.sharesPerToken) ? number(p.sharesPerToken, 8) + " shares per token." : ""} Token observed ${stamp(p.priceAt)}${p.priceTimeBasis ? " (" + escape(p.priceTimeBasis) + ")" : ""}; listed reference ${referenceTime(data.reference)}. ${link(p.source, "Token price")} · ${link(p.referenceSource, "Listed reference")}${p.conversionSource ? " · " + link(p.conversionSource, "Share conversion") : ""}</p></details>` : ""}</div>`;
  }
  function fundamental(stock, data, field) {
    const metric = profileMetric(stock, data, field),
      r = data.reference;
    const formatted = Number.isFinite(metric.value)
      ? field === "pe"
        ? `${number(metric.value)}×`
        : compact(metric.value)
      : metric.label;
    const source =
      field === "pe"
        ? r?.peSource || r?.peSourceURL || r?.source
        : r?.marketCapSource || r?.source;
    return `<strong>${formatted}</strong><small>${escape(metric.note)}${r?.[field + "Stale"] ? " · Older observation" : ""}</small>${source && stock.category !== "ETF" ? `<small>${link(source, "Nasdaq")} · retrieved ${stamp(r[field + "RetrievedAt"] || r.retrievedAt)}</small>` : ""}`;
  }
  function metrics(stock, data) {
    const coverage = productCoverage(stock.products),
      market = marketFor(stock.id);
    return `<dl class="stock-metrics"><div><dt>Company market cap</dt><dd>${fundamental(stock, data, "marketCap")}</dd></div><div><dt>Fiscal-year P/E</dt><dd>${fundamental(stock, data, "pe")}</dd></div><div><dt>Tokenized market cap</dt><dd><strong>${Number.isFinite(market?.marketCap) ? compact(market.marketCap) : "Not supplied"}</strong><small>CoinGecko aggregate · USD</small></dd></div><div><dt>Tokenized 24h volume</dt><dd><strong>${Number.isFinite(market?.volume24h) ? compact(market.volume24h) : "Not supplied"}</strong><small>Reported market activity · USD</small></dd></div><div><dt>Token versions</dt><dd><strong>${coverage.versions}</strong><small>${coverage.issuers} issuers · ${coverage.networks.length} networks in connected sources</small></dd></div></dl>`;
  }
  function history(id) {
    const series = chartSeries(marketFor(id)?.sparkline);
    return `<section class="stock-history" aria-labelledby="stock-history-title"><div class="stock-section-heading"><div><h2 id="stock-history-title">Tokenized price history</h2><p>CoinGecko aggregate · USD reference</p></div><span class="stock-period">Past 7 days</span></div>${series ? `<div class="stock-chart-layout"><div class="stock-chart" role="img" aria-label="Seven-day tokenized aggregate prices. Low ${usd(series.min)}, high ${usd(series.max)}, first observation ${usd(series.first)}, last observation ${usd(series.last)}."><svg viewBox="-2 -8 724 236" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="720" y1="0" y2="0" /><line x1="0" x2="720" y1="110" y2="110" /><line x1="0" x2="720" y1="220" y2="220" /><polyline points="${series.points}" /></svg></div><div class="stock-chart-scale"><span>${usd(series.max)}</span><span>${usd((series.min + series.max) / 2)}</span><span>${usd(series.min)}</span></div></div><div class="stock-chart-bottom"><span>Earlier observations</span><span>Latest observations</span></div><p class="stock-chart-note">${series.count} source samples in the provider’s 7-day series. Individual sample timestamps are not supplied. The provider does not disclose aggregate share normalization. This series does not show the listed stock or establish a share-normalized premium.</p>` : `<div class="stock-chart-empty"><strong>${entry(id).loading ? "Loading observed history…" : "No seven-day series supplied"}</strong><p>A chart appears when CoinGecko provides at least two valid price observations.</p></div>`}</section>`;
  }
  function deploymentRows(product) {
    return (
      (product.deployments || [])
        .map((deployment) => {
          const network = chain(deployment.chain);
          return `<div class="stock-contract"><span class="stock-network">${chainLogo(network.id, network.label)}${escape(network.label)}</span><span><small>Contract</small>${network.explorer ? link(network.explorer + deployment.address, deployment.address, "stock-address") : `<code class="stock-address">${escape(deployment.address)}</code>`}</span></div>`;
        })
        .join("") ||
      '<p class="stock-muted">No contract deployment supplied.</p>'
    );
  }
  function issuerRows(stock) {
    const groups = new Map();
    for (const product of stock.products) {
      if (!groups.has(product.issuer)) groups.set(product.issuer, []);
      groups.get(product.issuer).push(product);
    }
    return [...groups]
      .map(([id, products]) => {
        const info = provider(products[0]),
          coverage = productCoverage(products);
        return `<details class="stock-issuer-row" data-stock-detail="issuer:${escape(id)}"><summary ${focusKey("issuer:" + id)}><span class="stock-issuer-name">${issuerLogo(products[0])}<span><strong>${escape(info.name)}</strong><small>${products.length} ${products.length === 1 ? "version" : "versions"} · ${escape(products.map((product) => product.symbol).join(", "))}</small></span></span><span class="stock-issuer-structure">${escape(info.structure)}</span><span class="stock-issuer-networks">${coverage.networks
          .slice(0, 3)
          .map(
            (network) =>
              `<span>${chainLogo(network, networkName(network))}${escape(networkName(network))}</span>`,
          )
          .join(
            "",
          )}${coverage.networks.length > 3 ? `<small>+${coverage.networks.length - 3} more</small>` : ""}</span><span class="stock-expand" aria-hidden="true">⌄</span></summary><div class="stock-issuer-expanded">${products.map((product) => `<section class="stock-product-contracts"><div class="stock-product-heading"><h3>${escape(product.symbol)} <small>${product.wrapped ? "Wrapped version" : "Token version"}</small></h3><span>${usd(product.market?.price)} <small>/ token${product.market?.priceType === "indicative-buy" ? " · $1,000 buy estimate" : ""}${product.market?.updatedAt ? " · " + stamp(product.market.updatedAt) : ""}</small></span></div>${product.market?.basis ? '<p class="stock-muted">' + escape(product.market.basis) + "</p>" : ""}${renderProductTerms(product)}${deploymentRows(product)}<p>${link(product.marketSource || product.source, "Product source")}</p>${venueMarkup(stock.id, product)}</section>`).join("")}<p class="stock-muted">${info.reviewedAt ? `Disclosure reviewed ${escape(info.reviewedAt)}.` : "Issuer terms have not been independently reviewed."} Identity mapping does not establish holder rights or venue access.</p></div></details>`;
      })
      .join("");
  }
  function networkRows(stock) {
    const networks = productCoverage(stock.products).networks;
    return (
      networks
        .map((id) => {
          const products = stock.products.filter((product) =>
            product.deployments?.some((deployment) => deployment.chain === id),
          );
          return `<details class="stock-network-row" data-stock-detail="network:${escape(id)}"><summary ${focusKey("network:" + id)}><span class="stock-network">${chainLogo(id, networkName(id))}<strong>${escape(networkName(id))}</strong></span><span>${products.length} token ${products.length === 1 ? "version" : "versions"}</span><span>${escape([...new Set(products.map((product) => provider(product).name))].join(", "))}</span><span class="stock-expand" aria-hidden="true">⌄</span></summary><div class="stock-network-expanded">${products.map((product) => `<section><h3>${escape(product.symbol)} <small>${escape(provider(product).name)}</small></h3>${deploymentRows({ ...product, deployments: product.deployments.filter((deployment) => deployment.chain === id) })}${link(product.marketSource || product.source, "Product source")}${venueMarkup(stock.id, product)}</section>`).join("")}</div></details>`;
        })
        .join("") ||
      '<p class="stock-empty">No deployments supplied by connected sources.</p>'
    );
  }
  function status(data) {
    const errors = Object.values(data.errors || {}).filter(Boolean),
      warnings = data.warnings || [];
    return `<div class="stock-load-status" role="status">${data.loading ? "<span>Updating observed prices and source details…</span>" : ""}${errors.length ? `<p>${escape(errors.join(" "))} <button data-stock-refresh ${focusKey("retry")}>Retry source requests</button></p>` : ""}</div>${warnings.length ? `<details class="stock-source-warning" data-stock-detail="source-warnings"><summary ${focusKey("source-warnings")}>Source coverage notes (${warnings.length})</summary>${warnings.map((warning) => `<p>${escape(warning)}</p>`).join("")}</details>` : ""}`;
  }
  function renderStock() {
    const id = active?.id,
      stock = stockFor(id);
    if (!stock) {
      replace(
        root,
        '<div class="stock-empty"><h1>Stock unavailable</h1><p>This exact asset is not in the connected catalog.</p></div>',
      );
      return;
    }
    const data = entry(id),
      coverage = productCoverage(stock.products),
      saved = getSaved().has(id);
    root.setAttribute("aria-busy", String(!!data.loading));
    replace(
      root,
      `<div class="stock-page-inner"><a class="stock-back" href="/?page=markets" data-stock-markets>← Markets</a><header class="stock-profile-heading"><div class="stock-profile-identity">${stockLogo(stock, marketFor(id)?.image)}<div><div class="stock-title-line"><h1>${escape(stock.name)}</h1><span class="stock-security-type">${escape(stock.ticker)} · ${escape(stock.category || "Security")}</span></div><p>${coverage.issuers} issuers · ${coverage.networks.length} networks · ${coverage.versions} mapped versions</p></div></div><div class="stock-header-actions"><button data-stock-save="${escape(id)}" aria-pressed="${saved}" aria-label="${saved ? "Unsave" : "Save"} ${escape(stock.name)}" ${focusKey("save")}>${saved ? "★ Saved" : "☆ Save"}</button><button data-stock-choose ${focusKey("choose")}>Compare stocks</button><button data-stock-refresh ${focusKey("refresh")} ${data.loading ? "disabled" : ""}>${data.loading ? "Updating…" : "Refresh"}</button></div></header><div class="stock-price-band">${listedPrice(stock, data)}${poolPrice(data)}${spotPanel(data)}</div>${tokenPrice(id)}<p class="stock-price-basis">The representative pool price uses verified share conversion. The aggregate is a separate market reference; CoinGecko does not disclose its share normalization. Neither is an executable buy quote.</p><div class="stock-profile-actions">${actions(id)}</div>${status(data)}<div class="stock-tabs" role="tablist" aria-label="Stock details">${[
        ["overview", "Overview"],
        ["issuers", `Issuers (${coverage.issuers})`],
        ["networks", `Networks (${coverage.networks.length})`],
      ]
        .map(
          ([value, label]) =>
            `<button role="tab" id="stock-tab-${value}" aria-controls="stock-tab-panel" aria-selected="${tab === value}" tabindex="${tab === value ? 0 : -1}" data-stock-tab="${value}" ${focusKey("tab:" + value)}>${escape(label)}</button>`,
        )
        .join(
          "",
        )}</div><div id="stock-tab-panel" role="tabpanel" aria-labelledby="stock-tab-${tab}" tabindex="0">${tab === "overview" ? `<div class="stock-overview-grid">${history(id)}<section class="stock-key-metrics" aria-labelledby="stock-metrics-title"><h2 id="stock-metrics-title">Key metrics</h2>${metrics(stock, data)}</section></div><section class="stock-products-section"><div class="stock-section-heading"><div><h2>Issuers & token versions</h2><p>Expand an issuer for rights, networks and exact contracts.</p></div><button data-stock-tab="issuers">View all issuers →</button></div>${issuerRows(stock)}</section>` : `<section class="stock-products-section"><div class="stock-section-heading"><div><h2>${tab === "issuers" ? "Issuers & token versions" : "Networks & contracts"}</h2><p>${tab === "issuers" ? "Select an issuer to inspect its products and disclosures." : "Select a network to inspect each exact token contract."}</p></div><button data-stock-versions="${escape(id)}">Compare token versions →</button></div>${tab === "issuers" ? issuerRows(stock) : networkRows(stock)}</section>`}</div><footer class="stock-page-footer"><p>Coverage follows connected catalogs and can omit products or venues. Order quotes include size and route effects; use Compare buy quotes to inspect them.</p><span>${data.checkedAt ? "Page checked " + stamp(data.checkedAt) : "Catalog coverage"}${stock.nativeCheckedAt ? " · Product grouping checked " + stamp(stock.nativeCheckedAt) : ""}</span></footer></div>`,
    );
  }
  function compareCell(stock, metric) {
    const data = entry(stock.id),
      market = marketFor(stock.id),
      coverage = productCoverage(stock.products),
      spot = profileSpot(data);
    if (metric === "listed")
      return `<strong>${Number.isFinite(data.reference?.price) ? usd(data.reference.price) : data.loading ? "Loading…" : "Unavailable"}</strong><small>${data.reference ? `${escape(data.reference.priceSession || "Session not supplied")}${observationIsStale(data.reference) ? " · Older observation" : ""} · ${referenceTime(data.reference)}` : escape(data.referenceReason || "Listed reference not supplied")}</small>${data.reference ? `<small>${link(data.reference.source, "Nasdaq reference")}</small>` : ""}`;
    if (metric === "pool") {
      const p = data.spotPremium;
      return `<strong>${Number.isFinite(p?.price) && p.price > 0 ? usd(p.price) : data.loading ? "Loading…" : "Unavailable"}</strong><small>USD per equivalent share${spot?.stale ? " · Older observation" : ""}</small><small>${p?.price ? `${escape(p.symbol || "Representative token")}${p.chain ? " · " + escape(networkName(p.chain)) : ""} · ${stamp(p.priceAt)}` : escape(data.spotPremiumReason || "Verified pool conversion not supplied")}</small>${p?.source ? `<small>${link(p.source, "Pool source")}</small>` : ""}`;
    }
    if (metric === "token")
      return `<strong>${Number.isFinite(market?.price) ? usd(market.price) : "Unavailable"}</strong><small>USD aggregate reference · ${market?.updatedAt ? `${older(market) ? "Older observation · " : ""}${stamp(market.updatedAt)}` : "Not observed"}</small>`;
    if (metric === "change")
      return `<strong class="${tone(market?.change24h)}">${signed(market?.change24h)}</strong><small>Tokenized aggregate</small>`;
    if (metric === "premium")
      return `<strong class="${tone(spot?.value)}">${spot ? signed(spot.value) : data.loading ? "Loading…" : "Unavailable"}</strong><small>${spot ? `${spot.stale ? "Older observation · " : ""}${data.spotPremium.referenceBasis === "last-close" ? "Versus listed last close" : "Verified share conversion"}` : escape(data.spotPremiumReason || "Comparable spot conversion not supplied")}</small>`;
    if (metric === "marketCap" || metric === "pe")
      return fundamental(stock, data, metric);
    if (metric === "tokenCap" || metric === "volume")
      return `<strong>${Number.isFinite(market?.[metric === "tokenCap" ? "marketCap" : "volume24h"]) ? compact(market[metric === "tokenCap" ? "marketCap" : "volume24h"]) : "Not supplied"}</strong><small>CoinGecko aggregate · USD</small>`;
    if (metric === "issuers")
      return `<strong>${coverage.issuers}</strong><small>${escape([...new Set(stock.products.map((product) => provider(product).name))].join(", ") || "No issuer supplied")}</small>`;
    if (metric === "networks")
      return `<strong>${coverage.networks.length}</strong><small>${escape(coverage.networks.map(networkName).join(", ") || "No network supplied")}</small>`;
    return `<strong>${coverage.versions}</strong><small>Connected-source products</small>`;
  }
  function renderComparison() {
    const stocks = comparisonIds.map(stockFor).filter(Boolean);
    compareRoot.setAttribute(
      "aria-busy",
      String(stocks.some((stock) => entry(stock.id).loading)),
    );
    const rows = [
      ["Listed price", "listed"],
      ["Normalized pool price", "pool"],
      ["Tokenized aggregate", "token"],
      ["24h change", "change"],
      ["Spot premium", "premium"],
      ["Company market cap", "marketCap"],
      ["Fiscal-year P/E", "pe"],
      ["Tokenized market cap", "tokenCap"],
      ["Tokenized 24h volume", "volume"],
      ["Issuers", "issuers"],
      ["Networks", "networks"],
      ["Token versions", "versions"],
    ];
    replace(
      compareRoot,
      `<div class="stock-comparison-inner"><a class="stock-back" href="/?page=markets" data-stock-markets>← Markets</a><header class="stock-comparison-heading"><div><h1>Compare stocks</h1><p>Different underlying assets. One consistent view.</p></div><div class="stock-header-actions"><button class="stock-primary" data-stock-choose ${focusKey("choose")}>${stocks.length ? "Edit stocks" : "Choose stocks"} <span aria-hidden="true">+</span></button>${stocks.length ? `<button data-stock-refresh ${focusKey("refresh")} ${stocks.some((stock) => entry(stock.id).loading) ? "disabled" : ""}>Refresh</button>` : ""}</div></header>${stocks.length ? `<p class="stock-comparison-note">${stocks.length} of 5 assets selected. Prices are in USD. Aggregate share normalization is not disclosed; spot premiums use a separate representative token and verified share conversion.</p>${stocks.length < 2 ? '<p class="stock-comparison-hint">Add another stock to compare it side by side.</p>' : ""}<p class="stock-scroll-hint">Swipe across to compare all selected stocks →</p><div class="stock-comparison-scroll" data-stock-scroll="comparison" tabindex="0" role="region" aria-label="Stock comparison table, scroll horizontally for all assets"><table class="stock-comparison-table"><caption class="sr-only">Underlying stock and tokenized market comparison</caption><thead><tr><th scope="col">Metric</th>${stocks.map((stock) => `<th scope="col"><div class="stock-comparison-company"><button class="stock-comparison-remove" data-stock-remove="${escape(stock.id)}" aria-label="Remove ${escape(stock.name)} from comparison" ${focusKey("remove:" + stock.id)}>×</button><a href="/?page=stock&stock=${encodeURIComponent(stock.id)}" data-stock-open="${escape(stock.id)}" ${focusKey("open:" + stock.id)}>${stockLogo(stock, marketFor(stock.id)?.image)}<strong>${escape(stock.ticker)}</strong><span>${escape(stock.name)}</span></a><small>${escape(stock.category || "Security")}</small></div></th>`).join("")}</tr></thead><tbody>${rows.map(([label, metric]) => `<tr><th scope="row">${label}</th>${stocks.map((stock) => `<td>${compareCell(stock, metric)}</td>`).join("")}</tr>`).join("")}<tr class="stock-comparison-actions"><th scope="row">Inspect products</th>${stocks.map((stock) => `<td><button data-stock-versions="${escape(stock.id)}">Compare token versions</button><button data-stock-quotes="${escape(stock.id)}">Compare buy quotes</button></td>`).join("")}</tr></tbody></table></div>${stocks.map((stock) => status(entry(stock.id))).join("")}<footer class="stock-page-footer"><p>Fiscal-year P/E is historical, not a current trailing-twelve-month ratio. Tokenized market cap and volume describe the connected provider’s aggregate. Product counts follow connected catalogs and may be incomplete.</p><p>The aggregate token price does not establish equivalent share exposure. Inspect issuer terms and verified conversion before comparing costs.</p></footer>` : '<div class="stock-comparison-empty"><h2>Put your next comparison in view.</h2><p>Choose two to five stocks or ETFs to compare listed prices, tokenized activity, issuers and network coverage.</p><button class="stock-primary" data-stock-choose>Choose stocks</button></div>'}</div>`,
    );
  }
  function render() {
    if (destroyed) return;
    if (active?.kind === "stock") renderStock();
    else if (active?.kind === "comparison") renderComparison();
  }
  function load(ids, options = {}) {
    const key = ids.join(",") + ":" + Boolean(options.products);
    if (pendingLoad && loadKey === key && !controller?.signal.aborted)
      return pendingLoad;
    loadKey = key;
    const task = performLoad(ids, options);
    pendingLoad = task;
    return task.finally(() => {
      if (pendingLoad === task) {
        pendingLoad = null;
        loadKey = null;
      }
    });
  }
  async function performLoad(ids, { products = false, force = false } = {}) {
    controller?.abort();
    for (const [id, data] of cache)
      if (data.loading) cache.set(id, { ...data, loading: false });
    controller = new AbortController();
    const signal = controller.signal,
      token = ++generation;
    const wanted = ids.filter(
      (id) =>
        force ||
        !entry(id).checkedAt ||
        Date.now() - entry(id).checkedAt >= 60000 ||
        (products && !entry(id).productsLoaded),
    );
    if (!wanted.length) {
      render();
      return;
    }
    for (const id of wanted)
      cache.set(id, { ...entry(id), loading: true, errors: {} });
    render();
    const query = new URLSearchParams({ ids: wanted.join(",") });
    const detailIds = wanted.filter(
      (id) =>
        force ||
        !entry(id).detailsCheckedAt ||
        Date.now() - entry(id).detailsCheckedAt >= 60000,
    );
    const tasks = [
      [
        "screener",
        `/api/screener?${query}`,
        (data) => {
          if (!Array.isArray(data?.rows))
            throw new Error("Invalid market observation response.");
          for (const id of wanted) {
            const row = data.rows.find((row) => row.id === id);
            if (!row)
              throw new Error(
                "Asset missing from market observation response.",
              );
            cache.set(id, {
              ...entry(id),
              market:
                row.market && data.stale
                  ? { ...row.market, stale: true }
                  : row.market,
              warnings: [
                ...new Set([
                  ...(entry(id).warnings || []),
                  ...(data.warnings || []),
                ]),
              ],
            });
          }
        },
      ],
    ];
    if (detailIds.length)
      tasks.push([
        "details",
        `/api/market-details?${new URLSearchParams({ ids: detailIds.join(",") })}`,
        (data) => {
          if (!Array.isArray(data?.rows))
            throw new Error("Invalid listed-security response.");
          for (const id of detailIds) {
            const row = data.rows.find((row) => row.id === id);
            if (!row)
              throw new Error("Asset missing from listed-security response.");
            const checkedAt = Date.now();
            cache.set(id, mergeProfileDetails(entry(id), row, checkedAt));
            onDetails(id, { ...row, checkedAt });
          }
        },
      ]);
    if (products && (force || !entry(wanted[0]).productsLoaded))
      tasks.push([
        "products",
        `/api/products?${new URLSearchParams({ stock: wanted[0], chain: "all", enrich: "true" })}`,
        (data) => {
          if (!data?.stock || !Array.isArray(data.rows))
            throw new Error("Invalid product source response.");
          const current = entry(wanted[0]);
          cache.set(wanted[0], {
            ...current,
            stock: { ...data.stock, products: data.rows },
            reference: Object.hasOwn(current, "reference")
              ? current.reference
              : data.reference,
            productsLoaded: true,
            warnings: [
              ...new Set([
                ...(current.warnings || []),
                ...(data.warnings || []),
              ]),
            ],
          });
        },
      ]);
    await Promise.allSettled(
      tasks.map(async ([kind, path, apply]) => {
        try {
          const data = await request(path, { signal });
          if (signal.aborted || token !== generation || destroyed) return;
          apply(data);
        } catch (error) {
          if (signal.aborted || token !== generation || destroyed) return;
          for (const id of kind === "details" ? detailIds : wanted)
            cache.set(id, {
              ...entry(id),
              ...(kind === "screener" && entry(id).market
                ? { market: { ...entry(id).market, stale: true } }
                : {}),
              ...(kind === "details"
                ? {
                    reference: entry(id).reference
                      ? {
                          ...entry(id).reference,
                          priceStale: true,
                          stale: true,
                        }
                      : null,
                    spotPremium: entry(id).spotPremium
                      ? { ...entry(id).spotPremium, stale: true }
                      : null,
                  }
                : {}),
              errors: {
                ...entry(id).errors,
                [kind]: `${kind === "screener" ? "Tokenized market" : kind === "products" ? "Issuer product" : "Listed-security"} source: ${error.message || "Request failed."}`,
              },
            });
        }
        if (!signal.aborted && token === generation) render();
      }),
    );
    if (signal.aborted || token !== generation || destroyed) return;
    for (const id of wanted)
      cache.set(id, { ...entry(id), loading: false, checkedAt: Date.now() });
    render();
  }
  function renderChooser() {
    const query = dialog
      .querySelector("input")
      .value.trim()
      .toLocaleLowerCase();
    const stocks = getStocks(),
      selected = canonicalSelection(selectedIds, stocks);
    selectedIds = selected;
    dialog.querySelector(".stock-chooser-selected").innerHTML =
      selected
        .map((id) => {
          const stock = find(id);
          return `<button data-stock-pick="${escape(id)}" aria-label="Remove ${escape(stock.name)}">${escape(stock.ticker)} <span aria-hidden="true">×</span></button>`;
        })
        .join("") || "<span>No stocks selected yet</span>";
    dialog.querySelector(".stock-chooser-count").textContent =
      `${selected.length} of 5 selected${selected.length === 5 ? " · Remove a stock to choose another." : ""}`;
    const matches = stocks.filter((stock) =>
      `${stock.ticker} ${stock.name} ${stock.id}`
        .toLocaleLowerCase()
        .includes(query),
    );
    dialog.querySelector(".stock-chooser-options").innerHTML =
      matches
        .slice(0, 80)
        .map((stock) => {
          const checked = selected.includes(stock.id);
          return `<button class="stock-chooser-option" data-stock-pick="${escape(stock.id)}" aria-pressed="${checked}" ${!checked && selected.length === 5 ? "disabled" : ""}>${stockLogo(stock, marketFor(stock.id)?.image)}<span><strong>${escape(stock.ticker)}</strong><small>${escape(stock.name)}</small></span><span class="stock-choice-mark" aria-hidden="true">${checked ? "✓" : "+"}</span></button>`;
        })
        .join("") ||
      '<p class="stock-empty">No matching assets. Try a company name or ticker.</p>';
    if (matches.length > 80)
      dialog
        .querySelector(".stock-chooser-options")
        .insertAdjacentHTML(
          "beforeend",
          '<p class="stock-muted">Showing the first 80 matches. Refine your search to find another asset.</p>',
        );
    dialog.querySelector("[data-stock-confirm]").disabled = selected.length < 2;
  }
  function choose(ids) {
    chooserOpener = document.activeElement;
    selectedIds = profileComparisonSelection(
      ids ?? getComparison(),
      active?.kind === "stock" ? active.id : null,
      getStocks(),
    );
    dialog.querySelector("input").value = "";
    renderChooser();
    if (!dialog.open) dialog.showModal();
    dialog.querySelector("input").focus();
  }
  function click(event) {
    const button = event.target.closest("button, a");
    if (!button) return;
    const data = button.dataset;
    if ("stockChoose" in data)
      choose(active?.kind === "stock" ? getComparison() : comparisonIds);
    if ("stockRefresh" in data)
      void load(active.kind === "stock" ? [active.id] : comparisonIds, {
        products: active.kind === "stock",
        force: true,
      });
    if (data.stockVenues) {
      const stock = stockFor(data.stockVenueAsset),
        product = stock?.products.find(
          (product) => product.coinId === data.stockVenues,
        );
      if (product)
        venues.load(stock.id + ":" + product.coinId, {
          stockId: stock.id,
          coinId: product.coinId,
        });
    }
    if (data.stockSave) {
      onToggleSave?.(data.stockSave);
      render();
    }
    if (data.stockVersions) onCompareVersions?.(data.stockVersions, "products");
    if (data.stockQuotes) onCompareVersions?.(data.stockQuotes, "quotes");
    if (data.stockOpen) {
      event.preventDefault();
      onOpenStock?.(data.stockOpen);
    }
    if (data.stockRemove)
      onCompareAssets?.(comparisonIds.filter((id) => id !== data.stockRemove));
    if (data.stockTab) {
      tab = data.stockTab;
      renderStock();
    }
  }
  root.addEventListener("click", click);
  compareRoot.addEventListener("click", click);
  const keydown = (event) => {
    if (!event.target.matches('[role="tab"]')) return;
    const tabs = ["overview", "issuers", "networks"],
      i = tabs.indexOf(tab);
    const next =
      event.key === "ArrowRight"
        ? tabs[(i + 1) % 3]
        : event.key === "ArrowLeft"
          ? tabs[(i + 2) % 3]
          : event.key === "Home"
            ? tabs[0]
            : event.key === "End"
              ? tabs[2]
              : null;
    if (next) {
      event.preventDefault();
      tab = next;
      renderStock();
      root.querySelector(`[data-stock-tab="${next}"]`).focus();
    }
  };
  root.addEventListener("keydown", keydown);
  dialog.querySelector("input").addEventListener("input", renderChooser);
  dialog.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.stockPick) {
      const id = button.dataset.stockPick;
      selectedIds = selectedIds.includes(id)
        ? selectedIds.filter((value) => value !== id)
        : canonicalSelection([...selectedIds, id], getStocks());
      const wasSelectedChip = !!button.closest(".stock-chooser-selected");
      renderChooser();
      const options = [...dialog.querySelectorAll("[data-stock-pick]")];
      (
        options.find(
          (option) =>
            option.dataset.stockPick === id &&
            (wasSelectedChip
              ? !!option.closest(".stock-chooser-options")
              : true),
        ) || dialog.querySelector("input")
      ).focus({ preventScroll: true });
    }
    if ("stockConfirm" in button.dataset && selectedIds.length >= 2) {
      const ids = [...selectedIds];
      dialog.close();
      onCompareAssets?.(ids);
    }
  });
  dialog.addEventListener("close", () => {
    if (chooserOpener?.isConnected)
      chooserOpener.focus({ preventScroll: true });
  });
  const automaticRefresh = createVisiblePageRefresh({
    isVisible: () =>
      !!active &&
      !destroyed &&
      !document.hidden &&
      !(active.kind === "stock" ? root : compareRoot).hidden,
    isBusy: () => !!pendingLoad,
    refresh: () =>
      load(active.kind === "stock" ? [active.id] : comparisonIds, {
        force: true,
      }),
  });
  function refreshVisible() {
    if (!active || document.hidden || destroyed) return;
    render();
    void automaticRefresh.tick();
  }
  const freshnessTimer = setInterval(refreshVisible, 15000);
  document.addEventListener("visibilitychange", refreshVisible);
  return {
    openStock(id) {
      if (destroyed) return;
      venues.cancel();
      active = { kind: "stock", id };
      automaticRefresh.reset();
      tab = "overview";
      root.hidden = false;
      compareRoot.hidden = true;
      renderStock();
      return load([id], { products: true });
    },
    openComparison(ids = []) {
      if (destroyed) return;
      venues.cancel();
      comparisonIds = canonicalSelection(ids, getStocks());
      active = { kind: "comparison" };
      automaticRefresh.reset();
      root.hidden = true;
      compareRoot.hidden = false;
      renderComparison();
      return load(comparisonIds);
    },
    chooseComparison(ids) {
      choose(ids);
    },
    ingestDetails(id, data) {
      if (destroyed || !data) return;
      cache.set(
        id,
        mergeProfileDetails(cache.get(id), data, data.checkedAt ?? Date.now()),
      );
      render();
    },
    details(id) {
      const data = cache.get(id);
      return data
        ? { ...data, checkedAt: data.detailsCheckedAt || 0 }
        : undefined;
    },
    refresh() {
      if (!active || destroyed) return;
      return load(active.kind === "stock" ? [active.id] : comparisonIds, {
        products: active.kind === "stock",
        force: true,
      });
    },
    hide() {
      venues.cancel();
      controller?.abort();
      generation++;
      active = null;
      root.hidden = true;
      compareRoot.hidden = true;
      for (const [id, data] of cache)
        if (data.loading) cache.set(id, { ...data, loading: false });
      if (dialog.open) dialog.close();
    },
    destroy() {
      venues.cancel();
      clearInterval(freshnessTimer);
      controller?.abort();
      generation++;
      destroyed = true;
      root.removeEventListener("click", click);
      compareRoot.removeEventListener("click", click);
      root.removeEventListener("keydown", keydown);
      document.removeEventListener("visibilitychange", refreshVisible);
      dialog.remove();
    },
  };
}

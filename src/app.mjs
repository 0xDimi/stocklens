import { findStocks, validBudget, assetById } from "./model.mjs";
import {
  escape,
  number,
  stamp,
  provider,
  external,
  productsTable,
  purchaseSummary,
  marketsTable,
  termsTable,
  venuesTable,
  csvText,
  exportColumns,
} from "./views.mjs";
import { createMarketsPage } from "./markets-page.mjs";
import { createStockPages } from "./stock-pages.mjs";
import {
  readComparison,
  comparisonStorage,
  restoreComparison,
  saveComparison,
} from "./comparison-state.mjs";
import { canonicalSelection } from "./asset-comparison-model.mjs";
import {
  quoteComparison,
  quoteCoverage,
  quoteCoverageMarkup,
} from "./comparison-ui.mjs";
import {
  stockLogo,
  issuerLogo,
  chainLogo,
  observeLogoErrors,
} from "./brands.mjs";
import { createTerminal } from "./terminal.mjs";
import { createDiscover, routePage } from "./discover.mjs";
import { createIssuersPage } from "./issuers-page.mjs";
let desk = null,
  marketsPage = null,
  issuersPage = null,
  stockPages = null,
  catalogCoverage = null,
  pendingProducts = [];
const quoteSnapshots = new Map();
observeLogoErrors();
const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const comparisonStore = comparisonStorage();
let page = routePage(params);
let issuerSelection = page === "issuers" ? params.get("issuer") || "" : "";
let assetCompareIds = params.has("stocks")
  ? params.get("stocks").split(",").filter(Boolean)
  : readComparison(comparisonStore);
const homeDetails = new Map();
let detailAbort = null,
  detailSequence = 0,
  homeAssetId = null;
let stocks = [],
  chains = [],
  selected = null,
  view = ["products", "quotes", "markets", "venues", "terms"].includes(
    params.get("view"),
  )
    ? params.get("view")
    : "products";
let snapshot = null,
  visibleRows = [],
  catalogSources = [],
  catalogWarnings = [],
  savedOnly = false,
  limit = 80,
  token = params.get("token") || "",
  requestId = 0,
  controller = null,
  debounce = null;
let saved = new Set();
try {
  const values = JSON.parse(localStorage.getItem("stocklens:saved") || "[]");
  if (Array.isArray(values))
    saved = new Set(
      values.filter(
        (v) => typeof v === "string" && /^[A-Za-z0-9:.-]{1,100}$/.test(v),
      ),
    );
} catch {}
if (validBudget(params.get("amount")))
  $("#budget").value = params.get("amount");
function updateUrl(mode = "replace") {
  if (page === "issuers") {
    const query = new URLSearchParams({ page: "issuers" });
    if (issuerSelection) query.set("issuer", issuerSelection);
    const url = "/?" + query;
    if (location.search !== "?" + query)
      history[mode === "push" ? "pushState" : "replaceState"](null, "", url);
    return;
  }
  if (page === "discover") {
    if (location.search)
      history[mode === "push" ? "pushState" : "replaceState"](null, "", "/");
    return;
  }
  if (!selected) {
    const url = "/?" + new URLSearchParams({ page });
    history[mode === "push" ? "pushState" : "replaceState"](null, "", url);
    return;
  }
  const query = new URLSearchParams({
    stock: selected.id,
    amount: validBudget($("#budget").value) ? $("#budget").value : "1000",
    chain: $("#chain").value,
    view,
  });
  if ($("#issuer").value !== "all") query.set("issuer", $("#issuer").value);
  if ($("#include-wrappers").checked) query.set("wrappers", "1");
  if (token && view === "markets") query.set("token", token);
  query.set("page", page);
  query.set("stocks", assetCompareIds.join(","));
  const url = "/?" + query;
  if (mode === "push" && location.search !== "?" + query)
    history.pushState(null, "", url);
  else history.replaceState(null, "", url);
}
function renderStocks() {
  const type = $("#asset-type").value;
  const found = findStocks(stocks, $("#search").value).filter(
    (s) =>
      (!savedOnly || saved.has(s.id)) &&
      (type === "all" || s.category.toLowerCase() === type.toLowerCase()),
  );
  $("#stock-list").innerHTML = found.length
    ? desk.universe(found, limit, saved)
    : `<p class="empty-search">${savedOnly ? "No saved assets match. Use the star next to a company to save it." : "No matching security. Try a company, ticker, token or ISIN."}</p>`;
  $("#list-status").textContent =
    `${Math.min(found.length, limit).toLocaleString()} of ${found.length.toLocaleString()} assets`;
  $("#saved-count").textContent = saved.size;
  $("#all-stocks").setAttribute("aria-pressed", !savedOnly);
  $("#saved-stocks").setAttribute("aria-pressed", savedOnly);
}
function renderHeading() {
  if (!selected) return;
  const focusTitle = document.activeElement?.id === "stock-title";
  const chainCount = new Set(
    selected.products.flatMap((p) => p.deployments.map((d) => d.chain)),
  ).size;
  $("#stock-heading").innerHTML =
    `<div class="company">${stockLogo(selected, desk?.getMarkets().get(selected.id)?.image)}<div><div class="company-name"><h1 id="stock-title" tabindex="-1">${escape(selected.name)}</h1><button id="favorite" class="favorite-button" aria-label="${saved.has(selected.id) ? "Unsave" : "Save"} ${escape(selected.name)}" aria-pressed="${saved.has(selected.id)}">${saved.has(selected.id) ? "★" : "☆"}</button></div><p><b>${escape(selected.ticker)}</b> · ${escape(selected.category)} · ${selected.products.filter((p) => !p.wrapped).length} issuer versions${selected.products.some((p) => p.wrapped) ? ` + ${selected.products.filter((p) => p.wrapped).length} wrapped` : ""} · ${new Set(selected.products.map((p) => p.issuer)).size} ${new Set(selected.products.map((p) => p.issuer)).size === 1 ? "issuer" : "issuers"} · ${chainCount} networks</p></div></div><div class="stock-heading-actions"><a class="text-button" href="/?page=stock&amp;stock=${encodeURIComponent(selected.id)}" data-open-stock-page="${escape(selected.id)}">Overview →</a><button class="primary-button" data-action="quotes" ${view === "quotes" ? "hidden" : ""}>Compare buy quotes <span aria-hidden="true">→</span></button></div>`;
  if (focusTitle) $("#stock-title").focus({ preventScroll: true });
  const wrappers = selected.products.filter((p) => p.wrapped).length;
  $("#wrapper-control").hidden =
    !wrappers || !["products", "terms", "quotes"].includes(view);
  $("#wrapper-count").textContent = wrappers ? `(${wrappers})` : "";
  $("#verification-note").innerHTML = selected.nativeCheckedAt
    ? `<span class="proof-dot" aria-hidden="true"></span> Asset grouping checked ${stamp(selected.nativeCheckedAt)}<span class="verification-detail"> · contracts and issuer terms below.</span>`
    : "Source-mapped identity · native asset grouping has not been confirmed.";
  const priorCoin = $("#venue-product").value;
  $("#venue-product").innerHTML = selected.products
    .filter(
      (p) =>
        p.coinId &&
        ($("#chain").value === "all" ||
          p.deployments.some((d) => d.chain === $("#chain").value)),
    )
    .map(
      (p) =>
        `<option value="${escape(p.coinId)}">${escape(p.symbol)} · ${escape(provider(p).name)}</option>`,
    )
    .join("");
  if ([...$("#venue-product").options].some((o) => o.value === priorCoin))
    $("#venue-product").value = priorCoin;
  desk?.renderMarket();
  const prior = $("#issuer").value;
  $("#issuer").innerHTML =
    '<option value="all">All issuers</option>' +
    [...new Map(selected.products.map((p) => [p.issuer, provider(p).name]))]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(
        ([id, name]) =>
          `<option value="${escape(id)}">${escape(name)}</option>`,
      )
      .join("");
  $("#issuer").value = selected.products.some((p) => p.issuer === prior)
    ? prior
    : "all";
}
const sortOptions = {
  products: [
    ["volume", "24h volume"],
    ["price", "Token price"],
    ["cap", "Market cap"],
    ["name", "Issuer name"],
  ],
  quotes: [
    ["exposure", "Equivalent exposure"],
    ["name", "Issuer name"],
  ],
  markets: [
    ["liquidity", "Pool liquidity"],
    ["volume", "24h volume"],
    ["price", "Token price"],
  ],
  venues: [
    ["volume", "24h volume"],
    ["price", "Token price"],
    ["name", "Exchange name"],
  ],
  terms: [["name", "Issuer name"]],
};
function setView(next, fetch = true) {
  if (fetch && page !== "comparison") setPage("comparison");
  view = next;
  $("#comparison").dataset.mode = view;
  $("#comparison-intent").innerHTML = {
    products: "Select 2–3 tokens for a terms comparison.",
    quotes: "Compare what the same USDC budget buys on each network.",
    terms:
      "<strong>Read the product terms.</strong> These summaries cover rights, dividends and eligibility. Select versions in Token versions for a side-by-side comparison.",
    markets:
      "<strong>Explore market liquidity.</strong> These are pool observations, not quotes for your order size.",
    venues:
      "<strong>Explore exchange markets.</strong> Select a token to see reported prices and trading venues.",
  }[view];
  const prior = $("#sort").value;
  document.querySelectorAll("[data-view]").forEach((b) => {
    const primary = b.getAttribute("role") === "tab";
    const active = primary
      ? b.dataset.view === (view === "quotes" ? "quotes" : "products")
      : b.dataset.view === view;
    b.setAttribute(primary ? "aria-selected" : "aria-pressed", active);
    b.tabIndex = primary && !active ? -1 : 0;
  });
  $("#view-footnote").textContent = "";
  $("#view-panel").setAttribute("aria-labelledby", "tab-" + view);
  $("#sort").innerHTML = sortOptions[view]
    .map(([id, name]) => `<option value="${id}">${name}</option>`)
    .join("");
  if (sortOptions[view].some(([id]) => id === prior)) $("#sort").value = prior;
  $("#stock-heading [data-action=quotes]")?.toggleAttribute(
    "hidden",
    view === "quotes",
  );
  $("#quote-controls").hidden = view !== "quotes";
  $("#decision-summary").hidden = view !== "quotes";
  $("#decision-summary").innerHTML = "";
  $("#venue-control").hidden = view !== "venues";
  $("#issuer").disabled = view === "venues";
  $("#budget-error").hidden = true;
  $("#basis-note").textContent = {
    products:
      "Prices are per token. Buy comparison shows verified share exposure.",
    quotes:
      "Same budget in destination-network USDC. Gas, bridging and exit costs are separate.",
    markets:
      "Pool observations from GeckoTerminal. Liquidity is the pool’s total reserve value, not a slippage guarantee.",
    venues:
      "CoinGecko exchange observations for the selected token. Venue results are token-wide, regardless of chain. Reported depth is not an executable quote.",
    terms:
      "Read product-specific documents and access rules. Unreviewed terms remain explicitly labeled.",
  }[view];
  $("#view-heading").innerHTML =
    {
      products: "Token versions",
      quotes: "Compare buy quotes",
      markets: "Onchain liquidity",
      venues: "Exchanges",
      terms: "Product terms",
    }[view] + ' <span id="result-count">—</span>';
  if (view !== "markets") token = "";
  $("#wrapper-control").hidden =
    !selected?.products.some((p) => p.wrapped) ||
    !["products", "terms", "quotes"].includes(view);
  document
    .querySelectorAll(".comparison-path strong")
    .forEach(
      (el) =>
        (el.textContent =
          view === "quotes" ? "Compare share exposure" : "Compare versions"),
    );
  if (fetch) loadView();
}
function filters(rows) {
  const issuer = $("#issuer").value,
    sort = $("#sort").value;
  const filtered = rows.filter(
    (r) =>
      (view === "venues" || issuer === "all" || r.issuer === issuer) &&
      ($("#include-wrappers").checked || !r.wrapped),
  );
  const val = (r) =>
    sort === "liquidity"
      ? r.liquidity
      : sort === "volume"
        ? (r.market?.volume24h ?? r.volume24h ?? r.volumeUsd)
        : sort === "cap"
          ? r.market?.marketCap
          : sort === "price"
            ? (r.market?.price ?? r.price ?? r.priceUsd)
            : null;
  return filtered.sort((a, b) =>
    sort === "name"
      ? (a.exchange || provider(a).name).localeCompare(
          b.exchange || provider(b).name,
        )
      : sort === "exposure"
        ? 0
        : sort === "price"
          ? (val(a) ?? Infinity) - (val(b) ?? Infinity)
          : (val(b) ?? -1) - (val(a) ?? -1),
  );
}
function sourceDetails(data = {}) {
  const warnings = [...new Set([...catalogWarnings, ...(data.warnings || [])])];
  $("#source-summary").textContent = warnings.length
    ? `${warnings.length} coverage ${warnings.length === 1 ? "note" : "notes"}`
    : "Source timestamps & scope";
  $("#source-details").innerHTML =
    `<div class="source-list">${catalogSources.map((s) => `<p>${external(s.url, s.name)} <strong>${s.cached ? "Saved catalog · " + stamp(s.retrievedAt) : s.available ? "Catalog loaded" : s.stale ? "Retained observation" : "Unavailable"}</strong></p>`).join("")}${(data.sources || []).map((s) => `<p>${escape(s.name)} <strong>${escape(s.status)}</strong> · ${stamp(s.checkedAt)}</p>`).join("")}</div><p>Catalog retrieved ${stamp(data.catalogAt || selected?.sourceAt)}. CoinGecko prices use source timestamps. GeckoTerminal pool results are a filtered search page, not all venues.</p>${warnings.map((w) => `<p class="coverage-warning">${escape(w)}</p>`).join("")}<p>Term summaries carry their source review dates. Wrapped versions are opt-in; ambiguous identity matches are excluded.</p>`;
}
function renderResults() {
  if (!snapshot) return;
  visibleRows = filters(snapshot.rows);
  const sourceWarnings = (snapshot.warnings || []).filter((w) =>
    /CoinGecko prices unavailable/.test(w),
  );
  $("#view-source-warning").hidden = !sourceWarnings.length;
  $("#view-source-warning").textContent = sourceWarnings.length
    ? "CoinGecko prices could not refresh. Check each observation’s source and time; refresh to retry."
    : "";
  $("#result-count").textContent = visibleRows.length;
  if (view === "products")
    $("#results").innerHTML = visibleRows.length
      ? productsTable(visibleRows, chains, $("#chain").value)
      : '<p class="empty-results">No products match these filters.</p>';
  if (view === "quotes")
    $("#results").innerHTML = visibleRows.length
      ? quoteComparison(visibleRows, {
          reference:
            snapshot.reference || sharedDetails(selected.id)?.reference,
        })
      : '<p class="empty-results">No quoted-chain deployments match these filters. Try All chains or explore Markets.</p>';
  if (view === "markets")
    $("#results").innerHTML = visibleRows.length
      ? marketsTable(visibleRows)
      : `<div class="empty-results"><p>${escape(snapshot.error || "No pools in these results match this asset and filters. Open a product’s exact-token Markets link to search its pools.")}</p>${token ? '<button id="clear-token" class="provider-link">Show stock-wide markets</button>' : ""}</div>`;
  if (view === "venues")
    $("#results").innerHTML = visibleRows.length
      ? venuesTable(visibleRows)
      : '<p class="empty-results">No exchange observations for this token. Try another product.</p>';
  if (view === "terms")
    $("#results").innerHTML = visibleRows.length
      ? termsTable(visibleRows)
      : '<p class="empty-results">No issuer terms match these filters.</p>';
  const prices = visibleRows.filter((r) => r.market?.price > 0).length,
    quotes = visibleRows.filter((r) => r.status === "quoted").length;
  $("#comparison-status").textContent =
    view === "products"
      ? `${visibleRows.length} versions · ${prices} with prices`
      : view === "quotes"
        ? `${quoteCoverage(visibleRows).providers.join(" · ") || "No current quote providers"}`
        : view === "markets"
          ? `${visibleRows.length} exact-contract pools${token ? " · filtered to one deployment" : ""}`
          : view === "venues"
            ? `${visibleRows.length} reported venue markets · ${snapshot.coinId || ""}`
            : `${visibleRows.length} issuer ${visibleRows.length === 1 ? "product" : "products"} · source documents linked below`;
  $("#view-footnote").textContent = {
    products:
      "Token-unit prices are not directly comparable share prices. Volume and market cap describe the token, not the underlying company. Expand a product for contracts and access terms.",
    quotes:
      "Ranked by verified equivalent shares before network costs. Jupiter and Raydium quote Solana; KyberSwap, Velora and LI.FI quote supported EVM networks. Liquidity sources are shown separately. A route can be unavailable even when its token is listed.",
    markets:
      "Pool prices are observations, not size-specific quotes. Search results can omit venues. Check the exact contract, venue access and final trade quote.",
    venues:
      "USD prices and reported ±2% market depth come from CoinGecko. Anomaly and stale flags are preserved. Exchange links open provider pages; venue access varies.",
    terms:
      "Summaries are product context. The linked prospectus, final terms and issuer eligibility rules control the actual rights.",
  }[view];
  $("#export").disabled = !visibleRows.length;
  if (view !== "quotes")
    $("#freshness").textContent = snapshot.retrievedAt
      ? "Retrieved " + stamp(snapshot.retrievedAt)
      : view === "terms"
        ? "Source-linked summaries"
        : "No market observation";
  $("#decision-summary").innerHTML =
    view === "quotes" ? purchaseSummary(visibleRows) : "";
  sourceDetails(snapshot);
  desk?.ingest(view, snapshot);
  if (snapshot.reference)
    marketsPage?.ingestReference(selected.id, snapshot.reference);
  if (view === "quotes") {
    quoteSnapshots.set(selected.id, { ...snapshot, rows: visibleRows });
    if (quoteSnapshots.size > 20)
      quoteSnapshots.delete(quoteSnapshots.keys().next().value);
  }
  marketsPage?.render();
  tick();
}
async function loadView(enrich = false) {
  clearTimeout(debounce);
  if (page !== "comparison") return;
  controller?.abort();
  const id = ++requestId;
  snapshot = null;
  $("#results").setAttribute("aria-busy", "false");
  $("#view-source-warning").hidden = true;
  $("#decision-summary").innerHTML = "";
  if (view === "quotes") desk?.ingest("quotes", { rows: [] });
  visibleRows = [];
  $("#export").disabled = true;
  if (!selected) return;
  const valid = validBudget($("#budget").value);
  document
    .querySelectorAll("[data-budget]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        button.dataset.budget === $("#budget").value,
      ),
    );
  $("#budget-error").hidden = view !== "quotes" || valid;
  $("#budget").setAttribute("aria-invalid", !valid);
  if (view === "quotes" && !valid) {
    $("#results").innerHTML =
      '<p class="empty-results">Set a valid USDC amount to compare.</p>';
    $("#result-count").textContent = "0";
    $("#comparison-status").textContent = "";
    $("#freshness").textContent = "";
    $("#refresh").disabled = false;
    return;
  }
  updateUrl();
  if (view === "terms") {
    snapshot = {
      rows: selected.products.filter(
        (p) =>
          $("#chain").value === "all" ||
          p.deployments.some((d) => d.chain === $("#chain").value),
      ),
      warnings: [],
    };
    renderResults();
    $("#refresh").disabled = false;
    return;
  }
  controller = new AbortController();
  $("#refresh").disabled = true;
  $("#results").setAttribute("aria-busy", "true");
  $("#results").innerHTML =
    '<p class="empty-results loading-message">' +
    {
      products: "Loading token versions…",
      quotes: "Comparing available buy quotes…",
      markets: "Finding liquidity for verified contracts…",
      venues: "Loading exchange prices and depth observations…",
    }[view] +
    "</p>";
  $("#result-count").textContent = "—";
  $("#comparison-status").textContent = "";
  $("#freshness").textContent = "Loading…";
  const query = new URLSearchParams({
    stock: selected.id,
    chain: $("#chain").value,
  });
  if (view === "quotes") query.set("amount", $("#budget").value);
  if (view === "markets" && token) query.set("token", token);
  if (view === "venues" && $("#venue-product").value)
    query.set("coin", $("#venue-product").value);
  if (enrich) query.set("enrich", "true");
  try {
    const response = await fetch(
      `/api/${view === "quotes" ? "compare" : view}?${query}`,
      {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(40000),
        ]),
      },
    );
    const data = await response.json();
    if (id !== requestId) return;
    if (!response.ok)
      throw new Error(data.error || "The data source could not be reached.");
    snapshot = data;
    if (data.stock) {
      selected = data.stock;
      const i = stocks.findIndex((s) => s.id === selected.id);
      if (i >= 0) stocks[i] = selected;
      renderHeading();
    }
    renderResults();
  } catch (error) {
    if (id !== requestId || error.name === "AbortError") return;
    $("#freshness").textContent = "Source unavailable";
    $("#result-count").textContent = "0";
    $("#results").innerHTML =
      `<div class="empty-results"><p>${escape(error.message)}</p><button class="provider-link retry-quotes">Try again</button></div>`;
  } finally {
    if (id === requestId) {
      $("#refresh").disabled = false;
      $("#results").setAttribute("aria-busy", "false");
    }
  }
}
function tick() {
  if (view !== "quotes" || !snapshot) return;
  $("#decision-summary").innerHTML = purchaseSummary(visibleRows);
  const coverage = $(".quote-coverage");
  if (coverage) coverage.innerHTML = quoteCoverageMarkup(visibleRows);
  $("#comparison-status").textContent =
    quoteCoverage(visibleRows).providers.join(" · ") ||
    "No current quote providers";
  const quotes = visibleRows.filter((r) => r.status === "quoted"),
    fresh = quotes.filter((r) => r.expiresAt > Date.now());
  $("#freshness").textContent = !quotes.length
    ? "No live quotes"
    : fresh.length
      ? `Updated ${Math.max(0, Math.floor((Date.now() - Math.min(...fresh.map((r) => r.fetchedAt))) / 1000))}s ago`
      : "Quotes stale · refresh";
  document.querySelectorAll(".quote-row[data-expires]").forEach((el) => {
    const expired =
      Number(el.dataset.expires) > 0 &&
      Number(el.dataset.expires) <= Date.now();
    el.classList.toggle("stale", expired);
    const summary = el.querySelector("summary"),
      label = summary?.getAttribute("aria-label");
    if (expired && label && !label.endsWith(" · Expired quote"))
      summary.setAttribute("aria-label", label + " · Expired quote");
  });
  document.querySelectorAll(".quote-link").forEach((link) => {
    if (Number(link.dataset.expires) <= Date.now()) {
      link.removeAttribute("href");
      link.setAttribute("aria-disabled", "true");
      link.textContent = "Refresh quote to continue";
    }
  });
}
function loadChart(poolId) {
  desk.loadPool(poolId, snapshot?.rows || []);
}
function selectStock(id, issuerId = "all", includeWrapped = false) {
  const stock = assetById(stocks, id);
  if (!stock) return;
  selected = stock;
  homeAssetId = stock.id;
  setPage("comparison");
  token = "";
  $("#include-wrappers").checked = includeWrapped;
  $("#issuer").value = "all";
  renderHeading();
  if (selected.products.some((p) => p.issuer === issuerId))
    $("#issuer").value = issuerId;
  renderStocks();
  desk.select(selected);
  loadHomeDetails(selected.id);
  document.body.classList.remove("universe-open");
  $("#toggle-universe").setAttribute("aria-expanded", "false");
  if (matchMedia("(max-width: 760px)").matches)
    $("#stock-title").focus({ preventScroll: true });
  else document.querySelector(`[data-stock="${selected.id}"]`)?.focus();
  loadView();
}
async function initialize() {
  discover.loading();
  try {
    const response = await fetch("/api/catalog");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Catalog unavailable.");
    stocks = data.stocks;
    assetCompareIds = restoreComparison(params, assetCompareIds, stocks);
    saveComparison(comparisonStore, assetCompareIds);
    chains = data.chains;
    catalogSources = data.sources;
    catalogCoverage = data.coverage;
    pendingProducts = data.pendingProducts || [];
    catalogWarnings = data.warnings;
    discover.render(data);
    selected =
      assetById(stocks, params.get("stock")) ||
      stocks.find((s) => s.ticker === params.get("ticker")) ||
      stocks.find((s) => s.ticker === "NVDA") ||
      stocks[0];
    if (!selected) throw new Error("No source-backed assets available.");
    $("#coverage").textContent =
      `${stocks.length.toLocaleString()} assets · ${new Set(stocks.flatMap((s) => s.products.map((p) => p.issuer))).size} issuers`;
    $("#chain").innerHTML =
      '<option value="all">All chains</option>' +
      chains
        .map((c) => `<option value="${c.id}">${escape(c.label)}</option>`)
        .join("");
    if (chains.some((c) => c.id === params.get("chain")))
      $("#chain").value = params.get("chain");
    $("#search").disabled = false;
    $("#include-wrappers").checked = params.get("wrappers") === "1";
    renderHeading();
    if (selected.products.some((p) => p.issuer === params.get("issuer")))
      $("#issuer").value = params.get("issuer");
    renderStocks();
    setView(view, false);
    sourceDetails();
    marketsPage.initialize();
    setPage(page, false);
    desk.start();
    desk.select(selected);
    if (page === "comparison") {
      loadView();
      loadHomeDetails(selected.id);
    }
  } catch (error) {
    discover.fail();
    $("#coverage").textContent = "Catalog unavailable";
    $("#stock-list").innerHTML =
      '<p class="empty-search">Catalog sources could not be reached.</p><button id="retry-catalog" class="provider-link">Retry catalog</button>';
    $("#results").innerHTML =
      `<p class="empty-results">${escape(error.message)}</p>`;
  }
}
$("#stock-list").addEventListener("click", (e) => {
  if (e.target.closest("#retry-catalog")) return initialize();
  if (e.target.closest("#load-more")) {
    limit += 80;
    return renderStocks();
  }
  const b = e.target.closest("[data-stock]");
  if (b) selectStock(b.dataset.stock);
});
$("#search").addEventListener("input", () => {
  limit = 80;
  renderStocks();
});
$("#asset-type").addEventListener("change", () => {
  limit = 80;
  renderStocks();
});
$("#stock-heading").addEventListener("click", (e) => {
  if (!e.target.closest("#favorite")) return;
  saved.has(selected.id) ? saved.delete(selected.id) : saved.add(selected.id);
  try {
    localStorage.setItem("stocklens:saved", JSON.stringify([...saved]));
  } catch {}
  renderStocks();
  renderHeading();
  desk.renderMarket();
  $("#favorite").focus();
});
for (const [id, value] of [
  ["all-stocks", false],
  ["saved-stocks", true],
])
  $("#" + id).addEventListener("click", () => {
    savedOnly = value;
    limit = 80;
    renderStocks();
  });
document.querySelector("#comparison").addEventListener("click", (e) => {
  const b = e.target.closest("[data-view]");
  if (b) setView(b.dataset.view);
});
document.querySelector(".view-tabs").addEventListener("keydown", (e) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
  e.preventDefault();
  const tabs = [...document.querySelectorAll(".view-tabs [data-view]")],
    i = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
  const next =
    e.key === "Home"
      ? 0
      : e.key === "End"
        ? tabs.length - 1
        : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  setView(tabs[next].dataset.view);
  tabs[next].focus();
});
$("#chain").addEventListener("change", () => {
  token = "";
  renderHeading();
  loadView();
});
$("#venue-product").addEventListener("change", () => loadView());
$("#issuer").addEventListener("change", () => {
  updateUrl();
  if (snapshot) renderResults();
});
$("#sort").addEventListener("change", renderResults);
$("#budget").addEventListener("input", () => {
  controller?.abort();
  requestId++;
  document
    .querySelectorAll("[data-budget]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", b.dataset.budget === $("#budget").value),
    );
  snapshot = null;
  visibleRows = [];
  $("#export").disabled = true;
  const valid = validBudget($("#budget").value);
  $("#budget-error").hidden = valid;
  $("#budget").setAttribute("aria-invalid", !valid);
  $("#decision-summary").innerHTML = "";
  $("#results").innerHTML = valid
    ? '<p class="empty-results">Updating amount…</p>'
    : '<p class="empty-results">Set a valid USDC amount to compare.</p>';
  $("#freshness").textContent = "";
  $("#comparison-status").textContent = "";
  $("#result-count").textContent = "—";
  clearTimeout(debounce);
  debounce = setTimeout(loadView, 450);
});
document.querySelector(".presets").addEventListener("click", (e) => {
  const b = e.target.closest("[data-budget]");
  if (!b) return;
  $("#budget").value = b.dataset.budget;
  document
    .querySelectorAll("[data-budget]")
    .forEach((el) => el.setAttribute("aria-pressed", el === b));
  loadView();
});
$("#refresh").addEventListener("click", () => {
  loadView();
  loadHomeDetails(selected?.id, true);
  desk.refreshChart();
});
$("#enrich").addEventListener("click", () => {
  setView("products", false);
  loadView(true);
});
$("#results").addEventListener("click", (e) => {
  if (e.target.closest(".retry-quotes")) return loadView();
  if (e.target.closest("#clear-token")) {
    token = "";
    return loadView();
  }
  const m = e.target.closest("[data-markets-token]"),
    q = e.target.closest("[data-quote-issuer]"),
    h = e.target.closest("[data-history]");
  if (m) {
    $("#chain").value = m.dataset.chain;
    token = m.dataset.marketsToken;
    setView("markets");
  }
  if (q) {
    $("#chain").value = q.dataset.chain;
    $("#issuer").value = q.dataset.quoteIssuer;
    setView("quotes");
  }
  if (h) loadChart(h.dataset.history);
});
for (const id of ["how-it-works", "methodology"])
  $("#" + id).addEventListener("click", () => $("#info-dialog").showModal());
$("#share").addEventListener("click", async () => {
  updateUrl();
  try {
    await navigator.clipboard.writeText(location.href);
    $("#share-status").textContent = "Link copied";
  } catch {
    $("#share-status").textContent = "Copy the URL from your address bar.";
  }
  setTimeout(() => ($("#share-status").textContent = ""), 4000);
});
$("#export").addEventListener("click", () => {
  const columns = exportColumns(view, selected);
  const blob = new Blob([csvText(visibleRows, columns)], {
      type: "text/csv;charset=utf-8;",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `stocklens-${selected.ticker}-${view}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
desk = createTerminal({
  getState: () => ({ stocks, chains, selected, saved, view, snapshot }),
  selectStock,
  setView,
  refresh: () => {
    if (page === "stock" || page === "compare") return stockPages?.refresh();
    if (page === "markets") desk.refreshMarkets();
    else {
      loadView();
      loadHomeDetails(selected?.id, true);
      desk.refreshChart();
    }
  },
  onUniverseUpdate: renderStocks,
  onMarketsUpdate: () => {
    if (page === "markets") {
      marketsPage?.show();
      if (desk?.marketState().screenNext)
        setTimeout(() => {
          if (page === "markets") desk.refreshMarkets(true);
        }, 0);
    } else marketsPage?.render();
  },
  onWatchlistChange: () => {
    renderStocks();
    renderHeading();
  },
});
function sharedDetails(id) {
  return [
    homeDetails.get(id),
    marketsPage?.getDetails(id),
    stockPages?.details(id),
  ]
    .filter(Boolean)
    .sort((a, b) => (b.checkedAt || 0) - (a.checkedAt || 0))[0];
}
function retainDetails(id, row) {
  const previous = homeDetails.get(id) || {};
  const retained = { ...previous, ...row };
  // A failed refresh must not erase a dated observation or make it current.
  for (const key of [
    "reference",
    "spot",
    "spotPremium",
    "premium",
    "buyObservation",
  ])
    if (Object.hasOwn(row, key) && !row[key] && previous[key])
      retained[key] = { ...previous[key], stale: true };
  homeDetails.set(id, retained);
  if (homeDetails.size > 25)
    homeDetails.delete(homeDetails.keys().next().value);
  marketsPage?.ingestDetails(id, retained);
  return retained;
}
async function loadHomeDetails(id, force = false) {
  if (!id || page !== "comparison") return;
  const cached = sharedDetails(id);
  if (!force && cached && Date.now() - cached.checkedAt < 60000) {
    desk.ingest("details", cached);
    return;
  }
  detailAbort?.abort();
  detailAbort = new AbortController();
  const sequence = ++detailSequence;
  try {
    const response = await fetch(
      "/api/market-details?" + new URLSearchParams({ ids: id }),
      {
        signal: AbortSignal.any([
          detailAbort.signal,
          AbortSignal.timeout(35000),
        ]),
      },
    );
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Listed price source unavailable");
    const row = data.rows?.find((r) => r.id === id);
    if (!row || sequence !== detailSequence) return;
    const result = retainDetails(id, { ...row, checkedAt: Date.now() });
    if (selected?.id === id && page === "comparison")
      desk.ingest("details", result);
    stockPages?.ingestDetails(id, result);
  } catch (error) {
    if (
      error.name !== "AbortError" &&
      sequence === detailSequence &&
      selected?.id === id
    )
      desk.ingest("details", {});
  }
}
function setPage(next, write = true) {
  const previous = page;
  page = [
    "discover",
    "comparison",
    "markets",
    "stock",
    "compare",
    "issuers",
  ].includes(next)
    ? next
    : "comparison";
  $("#discover-page").hidden = page !== "discover";
  document.body.classList.toggle("is-discover", page === "discover");
  if (page !== "discover") discover.close();
  $("#home-page").hidden = page !== "comparison";
  $("#markets-page").hidden = page !== "markets";
  $("#stock-page").hidden = page !== "stock";
  $("#asset-comparison-page").hidden = page !== "compare";
  $("#issuers-page").hidden = page !== "issuers";
  if (page !== "issuers") issuersPage?.hide();
  if (page !== "comparison" && previous === "comparison") {
    clearTimeout(debounce);
    controller?.abort();
    ++requestId;
    detailAbort?.abort();
  }
  if (page !== "stock" && page !== "compare") stockPages?.hide();
  const target = {
    discover: "discover-search",
    comparison: "comparison",
    markets: "markets-page",
    stock: "stock-page",
    compare: "asset-comparison-page",
    issuers: "issuers-page",
  }[page];
  $(".skip-link").href = "#" + target;
  $(".skip-link").textContent = {
    discover: "Skip to stock search",
    comparison: "Skip to comparison",
    markets: "Skip to markets",
    stock: "Skip to stock overview",
    compare: "Skip to stock comparison",
    issuers: "Skip to issuers",
  }[page];
  $("#share").textContent =
    page === "issuers" ? "Copy issuer link ↗" : "Copy comparison link ↗";
  document.querySelectorAll("[data-page]").forEach((link) => {
    if (
      link.dataset.page ===
      (page === "discover"
        ? "discover"
        : page === "comparison"
          ? "comparison"
          : page === "issuers"
            ? "issuers"
            : "markets")
    )
      link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  document.title =
    page === "stock"
      ? `${selected?.ticker || "Stock"} overview — Stocklens`
      : page === "compare"
        ? "Compare stocks — Stocklens"
        : page === "issuers"
          ? "Issuers — Stocklens"
          : page === "markets"
            ? "Markets — Stocklens"
            : page === "comparison"
              ? "Compare — Stocklens"
              : "Stocklens — Compare tokenized stocks";
  if (page === "markets") {
    marketsPage?.show();
    if (desk?.marketState().screenNext) desk.refreshMarkets(true);
  }
  if (page === "issuers") issuersPage?.show(issuerSelection);
  if (selected && page === "stock") stockPages?.openStock(selected.id);
  if (stocks.length && page === "compare")
    stockPages?.openComparison(assetCompareIds);
  if (write) updateUrl("push");
}
function openStockPage(id) {
  const stock = assetById(stocks, id);
  if (!stock) return;
  selected = stock;
  setPage("stock");
  $("#stock-page").focus({ preventScroll: true });
  scrollTo({ top: 0, behavior: "instant" });
}
function openAssetComparison(ids) {
  assetCompareIds = canonicalSelection(ids, stocks);
  saveComparison(comparisonStore, assetCompareIds);
  setPage("compare");
  $("#asset-comparison-page").focus({ preventScroll: true });
  scrollTo({ top: 0, behavior: "instant" });
}
function openHomeComparison(
  id,
  mode = "products",
  issuerId = "all",
  includeWrapped = false,
) {
  const stock = assetById(stocks, id);
  if (!stock) return;
  selected = stock;
  view = mode;
  $("#chain").value = "all";
  $("#issuer").value = "all";
  setPage("comparison");
  setView(mode, false);
  selectStock(id, issuerId, includeWrapped);
  $("#comparison").scrollIntoView({ block: "start" });
}
window.addEventListener("popstate", () => {
  const route = new URLSearchParams(location.search);
  if (routePage(route) === "issuers")
    issuerSelection = route.get("issuer") || "";
  selected = assetById(stocks, route.get("stock")) || selected;
  assetCompareIds = restoreComparison(route, assetCompareIds, stocks);
  saveComparison(comparisonStore, assetCompareIds);
  view = ["products", "quotes", "terms", "markets", "venues"].includes(
    route.get("view"),
  )
    ? route.get("view")
    : "products";
  $("#include-wrappers").checked = route.get("wrappers") === "1";
  $("#chain").value = chains.some((c) => c.id === route.get("chain"))
    ? route.get("chain")
    : "all";
  if (validBudget(route.get("amount")))
    $("#budget").value = route.get("amount");
  setPage(routePage(route), false);
  if (page === "comparison" && selected) {
    homeAssetId = selected.id;
    renderHeading();
    $("#issuer").value = selected.products.some(
      (p) => p.issuer === route.get("issuer"),
    )
      ? route.get("issuer")
      : "all";
    token = route.get("token") || "";
    desk.select(selected);
    setView(view, false);
    loadView();
    loadHomeDetails(selected.id);
  }
});
function toggleSaved(id) {
  saved.has(id) ? saved.delete(id) : saved.add(id);
  try {
    localStorage.setItem("stocklens:saved", JSON.stringify([...saved]));
  } catch {}
  renderStocks();
  renderHeading();
}
function showCoverage() {
  const products = stocks.flatMap((s) => s.products),
    networks = [
      ...new Set(products.flatMap((p) => p.deployments.map((d) => d.chain))),
    ],
    issuerIds = [...new Set(products.map((p) => p.issuer))];
  $("#coverage-content").innerHTML =
    `<p class="coverage-lead">${stocks.length.toLocaleString()} assets · ${products.length.toLocaleString()} mapped versions · ${networks.length} observed networks</p><p>Coverage is measured against connected sources. New products, restricted venues and unlisted contracts can be missing. Opening an asset checks CoinGecko’s native grouping, including wrapped versions.</p><h3>Connected discovery sources</h3><div class="source-list">${catalogSources.map((source) => `<p>${external(source.url, source.name)} <strong>${source.cached ? "Saved catalog · " + stamp(source.retrievedAt) : source.available ? "Loaded" : source.stale ? "Retained observation" : "Unavailable"}</strong></p>`).join("")}</div><h3>Issuer coverage</h3><div class="coverage-issuers">${issuerIds
      .sort(
        (a, b) =>
          products.filter((p) => p.issuer === b).length -
          products.filter((p) => p.issuer === a).length,
      )
      .map((id) => {
        const ps = products.filter((p) => p.issuer === id),
          info = provider(ps[0]);
        return `<div><span class="token-cell">${issuerLogo(ps[0])}<span><strong>${escape(info.name)}</strong><small>${ps.length.toLocaleString()} versions · ${new Set(ps.flatMap((p) => p.deployments.map((d) => d.chain))).size} networks</small></span></span><span>${escape(info.structure)}<small>${info.reviewStatus === "unreviewed" || !info.reviewedAt ? "Terms not confirmed" : info.reviewStatus === "partial" ? "Partial public disclosure" : "Primary-source summary"}${info.reviewedAt ? " · " + escape(info.reviewedAt) : ""}</small></span>${external(info.source, "Source")}</div>`;
      })
      .join(
        "",
      )}</div><h3>Networks & quote support</h3><div class="coverage-networks">${networks.map((id) => `<span>${chainLogo(id)}${escape(chains.find((c) => c.id === id)?.label || id)}<small>${chains.find((c) => c.id === id)?.quotable ? "Quotes connected" : "Discovery only"}</small></span>`).join("")}</div><h3>Gaps kept visible</h3><p>${stocks.filter((s) => !s.products.length).length} registry assets await a mapped version. ${catalogCoverage?.heldBackIssuerRecords || 0} issuer records were held back pending identity corroboration. ${escape(catalogWarnings.join(" "))}</p><p>Hyperliquid platform identifiers returned by the registry do not match the supported contract format and stay outside contract routing. Buy quote adapters cover ${chains.filter((c) => c.quotable).length} networks; individual routes depend on available markets. DEX pool searches and exchange pages are partial. Unconfirmed legal terms and share conversions are never filled with assumptions.</p>`;
  if (pendingProducts.length)
    $("#coverage-content").insertAdjacentHTML(
      "beforeend",
      `<details class="pending-records"><summary>${pendingProducts.length} issuer records awaiting identity corroboration</summary><p>These records remain visible for audit and are excluded from comparisons and quote ranking. The displayed underlying identifiers are issuer claims.</p><div class="table-scroll"><table><thead><tr><th>Token</th><th>Claimed stock</th><th>Reported ISIN</th><th>Contracts</th></tr></thead><tbody>${pendingProducts.map((p) => `<tr><td>${escape(p.symbol)}</td><td>${escape(p.claimedUnderlying.ticker)}<small>${escape(p.claimedUnderlying.name)}</small></td><td>${escape(p.claimedUnderlying.isin)}</td><td>${p.deployments.map((d) => external(chains.find((c) => c.id === d.chain)?.explorer + d.address, chains.find((c) => c.id === d.chain)?.label || d.chain)).join(" ")}${external(p.source, "Issuer list")}</td></tr>`).join("")}</tbody></table></div></details>`,
    );
  $("#coverage-dialog").showModal();
}
document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-page]");
  if (
    link &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    event.button === 0
  ) {
    event.preventDefault();
    if (link.dataset.page === "issuers") issuerSelection = "";
    setPage(link.dataset.page);
    if (page === "discover" || page === "issuers") {
      scrollTo({ top: 0, behavior: "instant" });
      $(page === "discover" ? "#discover-page" : "#issuers-page").focus({
        preventScroll: true,
      });
    }
    if (page === "comparison" && selected) {
      const changed = homeAssetId !== selected.id;
      if (changed) {
        snapshot = null;
        renderHeading();
        renderStocks();
        desk.select(selected);
        setView(view, false);
        homeAssetId = selected.id;
      }
      if (changed || !snapshot) loadView();
      loadHomeDetails(selected.id);
    }
  }
  const overview = event.target.closest("[data-open-stock-page]");
  if (overview) {
    event.preventDefault();
    openStockPage(overview.dataset.openStockPage);
  }
  if (event.target.closest('[data-action="terms"]')) setView("terms");
  if (event.target.closest("[data-open-coverage]")) showCoverage();
  if (event.target.closest('[data-close="coverage-dialog"]'))
    $("#coverage-dialog").close();
});
$("#include-wrappers").addEventListener("change", () => {
  updateUrl();
  if (snapshot) renderResults();
});
marketsPage = createMarketsPage({
  getState: () => ({ stocks, chains, saved }),
  getMarkets: () => desk.getMarkets(),
  getMarketState: () => desk.marketState(),
  getQuotes: (id) => quoteSnapshots.get(id),
  onDetails: retainDetails,
  onSelect: openStockPage,
  onCompareVersions: (id) => openHomeComparison(id, "products"),
  getComparison: () => assetCompareIds,
  onCompareChange: (ids) => {
    assetCompareIds = canonicalSelection(ids, stocks);
    saveComparison(comparisonStore, assetCompareIds);
    updateUrl();
  },
  onCompareAssets: openAssetComparison,
  onChooseCompare: (ids) => stockPages.chooseComparison(ids),
  onSave: toggleSaved,
  onRefresh: (next) => desk.refreshMarkets(next),
});
stockPages = createStockPages({
  root: $("#stock-page"),
  compareRoot: $("#asset-comparison-page"),
  getStocks: () => stocks,
  getMarkets: () => desk.getMarkets(),
  getChains: () => chains,
  getSaved: () => saved,
  getDetails: sharedDetails,
  getComparison: () => assetCompareIds,
  onDetails: retainDetails,
  onToggleSave: toggleSaved,
  onCompareVersions: openHomeComparison,
  onOpenStock: openStockPage,
  onCompareAssets: openAssetComparison,
});
issuersPage = createIssuersPage({
  root: $("#issuers-page"),
  getChains: () => chains,
  onNavigate: (id) => {
    issuerSelection = id;
    setPage("issuers");
    scrollTo({ top: 0, behavior: "instant" });
    $("#issuers-page").focus({ preventScroll: true });
  },
  onCompare: (id, issuer, wrapped) => {
    // A background catalog refresh can discover an asset after this tab loaded.
    // Its canonical href performs a fresh boot when the client lacks that asset.
    if (!assetById(stocks, id)) return false;
    openHomeComparison(id, "products", issuer, wrapped);
    return true;
  },
});
const discover = createDiscover({
  root: $("#discover-page"),
  getStocks: () => stocks,
  onSelect: (id) => {
    openHomeComparison(id, "products");
    scrollTo({ top: 0, behavior: "instant" });
    $("#stock-title")?.focus({ preventScroll: true });
  },
  onRetry: initialize,
});
setPage(page, false);
setInterval(() => {
  if (page === "comparison" && !document.hidden) loadHomeDetails(selected?.id);
}, 60000);
setInterval(tick, 1000);
setInterval(() => {
  if (
    !document.hidden &&
    page === "comparison" &&
    selected &&
    view !== "quotes" &&
    view !== "terms"
  )
    loadView();
}, 600000);
initialize();

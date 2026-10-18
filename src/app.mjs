import { findStocks, validBudget } from "./model.mjs";
import {
  escape,
  number,
  stamp,
  provider,
  external,
  productsTable,
  quoteTable,
  marketsTable,
  termsTable,
  venuesTable,
  csvText,
  exportColumns,
} from "./views.mjs";
import { createTerminal } from "./terminal.mjs";
let desk = null;
const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(location.search);
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
function updateUrl() {
  if (!selected) return;
  const query = new URLSearchParams({
    stock: selected.id,
    amount: validBudget($("#budget").value) ? $("#budget").value : "1000",
    chain: $("#chain").value,
    view,
  });
  if ($("#issuer").value !== "all") query.set("issuer", $("#issuer").value);
  if (token && view === "markets") query.set("token", token);
  history.replaceState(null, "", "/?" + query);
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
    : `<p class="empty-search">${savedOnly ? "No saved assets match. Save an asset with W or the star." : "No matching security. Try a company, ticker, token or ISIN."}</p>`;
  $("#list-status").textContent =
    `${Math.min(found.length, limit).toLocaleString()} of ${found.length.toLocaleString()} assets`;
  $("#saved-count").textContent = saved.size;
  $("#all-stocks").setAttribute("aria-pressed", !savedOnly);
  $("#saved-stocks").setAttribute("aria-pressed", savedOnly);
}
function renderHeading() {
  if (!selected) return;
  const chainCount = new Set(
    selected.products.flatMap((p) => p.deployments.map((d) => d.chain)),
  ).size;
  $("#stock-heading").innerHTML =
    `<div class="company"><div class="company-name"><h2>${escape(selected.ticker)}</h2><span class="ticker-label">${escape(selected.category)}</span><button id="favorite" class="favorite-button" aria-label="${saved.has(selected.id) ? "Unsave" : "Save"} ${escape(selected.name)}" aria-pressed="${saved.has(selected.id)}">${saved.has(selected.id) ? "★" : "☆"}</button></div><p>${escape(selected.name)}${selected.exchange ? " · " + escape(selected.exchange) : ""}</p></div><div class="reference"><span>${selected.products.length} PRODUCTS / ${new Set(selected.products.map((p) => p.issuer)).size} ISSUERS</span><strong>${chainCount} NETWORKS</strong></div>`;
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
  view = next;
  const prior = $("#sort").value;
  document.querySelectorAll("[data-view]").forEach((b) => {
    b.setAttribute("aria-selected", b.dataset.view === view);
    b.tabIndex = b.dataset.view === view ? 0 : -1;
  });
  $("#view-panel").setAttribute("aria-labelledby", "tab-" + view);
  $("#sort").innerHTML = sortOptions[view]
    .map(([id, name]) => `<option value="${id}">${name}</option>`)
    .join("");
  if (sortOptions[view].some(([id]) => id === prior)) $("#sort").value = prior;
  $("#quote-controls").hidden = view !== "quotes";
  $("#venue-control").hidden = view !== "venues";
  $("#issuer").disabled = view === "venues";
  $("#budget-error").hidden = true;
  $("#basis-note").textContent = {
    products:
      "Market prices are USD per token unit. Use Order quotes to compare equivalent shares for your budget.",
    quotes:
      "Same destination-chain USDC input. Gas, bridging and future exit costs are separate.",
    markets:
      "Pool observations from GeckoTerminal. Liquidity is the pool’s total reserve value, not a slippage guarantee.",
    venues:
      "CoinGecko exchange observations for the selected token. Venue results are token-wide, regardless of chain. Reported depth is not an executable quote.",
    terms:
      "Read product-specific documents and access rules. Unreviewed terms remain explicitly labeled.",
  }[view];
  $("#view-heading").innerHTML =
    {
      products: "Products",
      quotes: "Order quotes",
      markets: "Pools",
      venues: "Exchanges",
      terms: "Issuer terms",
    }[view] + ' <span id="result-count">—</span>';
  if (view !== "markets") token = "";
  if (fetch) loadView();
}
function filters(rows) {
  const issuer = $("#issuer").value,
    sort = $("#sort").value;
  const filtered = rows.filter(
    (r) => view === "venues" || issuer === "all" || r.issuer === issuer,
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
    `<div class="source-list">${catalogSources.map((s) => `<p>${external(s.url, s.name)} <strong>${s.available ? "Catalog loaded" : "Unavailable"}</strong></p>`).join("")}${(data.sources || []).map((s) => `<p>${escape(s.name)} <strong>${escape(s.status)}</strong> · ${stamp(s.checkedAt)}</p>`).join("")}</div><p>Catalog retrieved ${stamp(data.catalogAt || selected?.sourceAt)}. CoinGecko prices use source timestamps. GeckoTerminal pool results are a filtered search page, not all venues.</p>${warnings.map((w) => `<p class="coverage-warning">${escape(w)}</p>`).join("")}<p>Issuer legal summaries reviewed Oct 19, 2026 where supplied. Other issuer terms are unreviewed. Wrapped products and ambiguous matches are excluded.</p>`;
}
function renderResults() {
  if (!snapshot) return;
  visibleRows = filters(snapshot.rows);
  $("#result-count").textContent = visibleRows.length;
  if (view === "products")
    $("#results").innerHTML = visibleRows.length
      ? productsTable(visibleRows, chains, $("#chain").value)
      : '<p class="empty-results">No products match these filters.</p>';
  if (view === "quotes")
    $("#results").innerHTML = visibleRows.length
      ? quoteTable(visibleRows)
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
      ? `${visibleRows.length} ${visibleRows.length === 1 ? "product" : "products"} · ${prices} with market prices`
      : view === "quotes"
        ? `${quotes} of ${visibleRows.length} routes quoted · ${visibleRows.filter((r) => r.rankable).length} normalized`
        : view === "markets"
          ? `${visibleRows.length} exact-contract pools${token ? " · filtered to one deployment" : ""}`
          : view === "venues"
            ? `${visibleRows.length} reported venue markets · ${snapshot.coinId || ""}`
            : `${visibleRows.length} issuer ${visibleRows.length === 1 ? "product" : "products"} · source documents linked below`;
  $("#view-footnote").textContent = {
    products:
      "Token-unit prices are not directly comparable share prices. Volume and market cap describe the token, not the underlying company. Expand a product for contracts and access terms.",
    quotes:
      "Ranked by equivalent shares before network costs. Only source-backed conversions enter ranking. Quote coverage: Raydium on Solana; KyberSwap on Ethereum, BNB Chain, Base and Arbitrum.",
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
  sourceDetails(snapshot);
  desk?.ingest(view, snapshot);
  tick();
}
async function loadView(enrich = false) {
  clearTimeout(debounce);
  controller?.abort();
  const id = ++requestId;
  snapshot = null;
  if (view === "quotes") desk?.ingest("quotes", { rows: [] });
  visibleRows = [];
  $("#export").disabled = true;
  if (!selected) return;
  const valid = validBudget($("#budget").value);
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
      products: "Loading CoinGecko product observations…",
      quotes: "Checking units and requesting order quotes…",
      markets: "Finding exact-contract pools on GeckoTerminal…",
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
      { signal: controller.signal },
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
  const quotes = snapshot.rows.filter((r) => r.status === "quoted"),
    fresh = quotes.filter((r) => r.expiresAt > Date.now());
  $("#freshness").textContent = !quotes.length
    ? "No live quotes"
    : fresh.length
      ? `Updated ${Math.max(0, Math.floor((Date.now() - Math.min(...fresh.map((r) => r.fetchedAt))) / 1000))}s ago`
      : "Quotes stale · refresh";
  document
    .querySelectorAll(".quote-row[data-expires]")
    .forEach((el) =>
      el.classList.toggle(
        "stale",
        Number(el.dataset.expires) > 0 &&
          Number(el.dataset.expires) <= Date.now(),
      ),
    );
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
function selectStock(id) {
  selected = stocks.find((s) => s.id === id);
  if (!selected) return;
  token = "";
  $("#issuer").value = "all";
  renderHeading();
  renderStocks();
  document.querySelector(`[data-stock="${selected.id}"]`)?.focus();
  desk.select(selected);
  document.body.classList.remove("universe-open");
  $("#toggle-universe").setAttribute("aria-expanded", "false");
  loadView();
}
async function initialize() {
  try {
    const response = await fetch("/api/catalog");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Catalog unavailable.");
    stocks = data.stocks;
    chains = data.chains;
    catalogSources = data.sources;
    catalogWarnings = data.warnings;
    selected =
      stocks.find((s) => s.id === params.get("stock")) ||
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
    renderHeading();
    if (selected.products.some((p) => p.issuer === params.get("issuer")))
      $("#issuer").value = params.get("issuer");
    renderStocks();
    setView(view, false);
    sourceDetails();
    desk.start();
    desk.select(selected);
    loadView();
  } catch (error) {
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
document.querySelector(".view-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-view]");
  if (b) setView(b.dataset.view);
});
document.querySelector(".view-tabs").addEventListener("keydown", (e) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
  e.preventDefault();
  const tabs = [...document.querySelectorAll("[data-view]")],
    i = tabs.findIndex((t) => t.dataset.view === view);
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
  snapshot = null;
  $("#results").innerHTML = '<p class="empty-results">Updating amount…</p>';
  $("#freshness").textContent = "";
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
    loadView();
    desk.refreshChart();
  },
  onUniverseUpdate: renderStocks,
  onWatchlistChange: () => {
    renderStocks();
    renderHeading();
  },
});
setInterval(tick, 1000);
setInterval(() => {
  if (!document.hidden && selected && view !== "quotes" && view !== "terms")
    loadView();
}, 90000);
initialize();

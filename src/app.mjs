import { issuers } from "./data.mjs";
import { findStocks, validBudget } from "./model.mjs";

const $ = (selector) => document.querySelector(selector);
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const number = (value, digits = 2) =>
  Number.isFinite(value)
    ? value.toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : "—";
const dollars = (value) =>
  Number.isFinite(value) ? `$${number(value)}` : "Not estimated";
const time = (value) =>
  new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
let stocks = [],
  selected = null,
  snapshot = null,
  requestId = 0,
  controller = null,
  debounce = null,
  savedOnly = false;
let saved = new Set();
try {
  const stored = JSON.parse(localStorage.getItem("stocklens:saved") || "[]");
  if (Array.isArray(stored))
    saved = new Set(
      stored.filter(
        (id) => typeof id === "string" && /^[A-Z0-9]{12}$/.test(id),
      ),
    );
} catch {}
const params = new URLSearchParams(location.search);
if (validBudget(params.get("amount")))
  $("#budget").value = params.get("amount");
if (["Solana", "Ethereum", "BinanceSmartChain"].includes(params.get("chain")))
  $("#chain").value = params.get("chain");

function renderStocks() {
  const found = findStocks(stocks, $("#search").value).filter(
    (stock) => !savedOnly || saved.has(stock.id),
  );
  const visible = found.slice(0, 80);
  $("#stock-list").innerHTML = visible.length
    ? visible
        .map(
          (stock) =>
            `<button class="stock-option ${selected?.id === stock.id ? "selected" : ""}" data-stock="${escape(stock.id)}" aria-pressed="${selected?.id === stock.id}"><span class="stock-monogram ${stock.ticker === "NVDA" ? "nvidia" : stock.ticker === "TSLA" ? "tesla" : "apple"}" aria-hidden="true">${escape(stock.name[0])}</span><span class="stock-option-name"><strong>${escape(stock.name)}</strong><span>${escape(stock.ticker)}${saved.has(stock.id) ? " · ★" : ""}</span></span><span class="stock-arrow" aria-hidden="true">↗</span></button>`,
        )
        .join("")
    : `<p class="empty-search">${savedOnly ? "No saved assets match.<br>Save a stock with the star beside its name." : "No matching asset.<br>Try a company, ticker, or token symbol."}</p>`;
  $("#list-status").textContent =
    found.length > 80
      ? `Showing 80 of ${found.length.toLocaleString()} · refine your search`
      : `${found.length.toLocaleString()} ${found.length === 1 ? "asset" : "assets"}`;
  $("#saved-count").textContent = saved.size;
  $("#all-stocks").setAttribute("aria-pressed", String(!savedOnly));
  $("#saved-stocks").setAttribute("aria-pressed", String(savedOnly));
}
function renderHeading() {
  if (!selected) return;
  const deployments = selected.products.reduce(
    (sum, p) => sum + p.deployments.length,
    0,
  );
  $("#stock-heading").innerHTML =
    `<div class="company"><span class="stock-monogram large ${selected.ticker === "NVDA" ? "nvidia" : selected.ticker === "TSLA" ? "tesla" : "apple"}" aria-hidden="true">${escape(selected.name[0])}</span><div><div class="company-name"><h2>${escape(selected.name)}</h2><span class="ticker-label">${escape(selected.ticker)}</span><button id="favorite" class="favorite-button" aria-label="${saved.has(selected.id) ? "Unsave" : "Save"} ${escape(selected.name)}" aria-pressed="${saved.has(selected.id)}">${saved.has(selected.id) ? "★" : "☆"}</button></div><p>${escape(selected.category)}${selected.exchange ? " · " + escape(selected.exchange) : ""}</p></div></div><div class="reference"><span>Verified deployments</span><strong>${deployments}<small> / ${selected.products.length} ${selected.products.length === 1 ? "provider" : "providers"}</small></strong></div>`;
}
function updateUrl() {
  if (!selected || !validBudget($("#budget").value)) return;
  const query = new URLSearchParams({
    stock: selected.id,
    amount: $("#budget").value,
    chain: $("#chain").value,
  });
  history.replaceState(null, "", `/?${query}`);
}
function details(row) {
  const provider = issuers[row.issuer];
  const multiplier = Number.isFinite(row.sharesPerToken)
    ? number(row.sharesPerToken, 8)
    : "Unavailable";
  return `<div class="product-details"><div class="details-column"><h4>What you own</h4><strong>${escape(provider.structure)}</strong><p>${escape(provider.rights)}</p><a href="${provider.source}" target="_blank" rel="noopener noreferrer">${provider.sourceLabel} ↗</a><p class="source-date">Legal source reviewed Oct 18, 2026</p><a href="${provider.eligibility}" target="_blank" rel="noopener noreferrer">${provider.eligibilityLabel} ↗</a></div><div class="details-column"><h4>Dividends & exit</h4><p>${escape(provider.dividends)}</p><p>${escape(provider.exit)}</p><a href="${escape(row.source)}" target="_blank" rel="noopener noreferrer">Official contract source ↗</a><p class="source-date">Catalog retrieved ${time(new Date(row.sourceAt).getTime())}</p></div><div class="details-column assumptions"><h4>Quote details</h4>${row.status === "quoted" ? `<dl><div><dt>Input asset</dt><dd>${escape(row.inputSymbol)}</dd></div><div><dt>Token units received</dt><dd>${number(row.tokenQuantity, 6)}</dd></div><div><dt>Shares per quoted unit</dt><dd>${multiplier}</dd></div><div><dt>Swap gas estimate</dt><dd>${dollars(row.networkFeeUsd)}</dd></div><div><dt>Price impact</dt><dd>${row.priceImpactPct == null ? "Not supplied" : number(row.priceImpactPct) + "%"}</dd></div><div><dt>Fetched at</dt><dd>${time(row.fetchedAt)}</dd></div></dl>${row.conversionWarning ? `<p class="conversion-warning">${escape(row.conversionWarning)}</p>` : ""}${row.conversionSource ? `<a href="${escape(row.conversionSource)}" target="_blank" rel="noopener noreferrer">Conversion source ↗</a>` : ""}<p>Trading fees are reflected in output. Gas, approvals, account creation, bridging and future exit costs are separate.</p><a href="${escape(row.quoteSource)}" target="_blank" rel="noopener noreferrer">Raw quote response ↗</a>` : `<p>${escape(row.reason)}</p><p>No substitute price is used.</p>`}</div></div><div class="contract-line"><span>Contract</span><a href="${escape(row.explorerUrl)}" target="_blank" rel="noopener noreferrer">${escape(row.address)} ↗</a></div><div class="provider-handoff"><p>Check the venue’s access rules and final quote before purchase.</p>${row.status === "quoted" ? `<a class="provider-link quote-link" href="${escape(row.buyUrl)}" data-url="${escape(row.buyUrl)}" data-expires="${row.expiresAt}" target="_blank" rel="noopener noreferrer">Open ${escape(row.venue)} ↗</a>` : `<a class="provider-link" href="${row.issuer === "ondo" ? `https://app.ondo.finance/assets/${encodeURIComponent(row.symbol.toLowerCase())}` : provider.url}" target="_blank" rel="noopener noreferrer">Explore ${provider.name} ↗</a>`}</div>`;
}
function renderResults() {
  const rows = snapshot.rows;
  const best = rows.find((row) => row.rankable && row.expiresAt > Date.now());
  const quoted = rows.filter((row) => row.status === "quoted");
  $("#result-count").textContent = rows.length;
  $("#results").innerHTML = rows.length
    ? `<div class="table-header" aria-hidden="true"><span>Token / provider</span><span>Chain / quote venue</span><span>USDC / eq. share</span><span>Your exposure</span><span>Swap gas est.</span><span></span></div>${rows
        .map((row) => {
          const provider = issuers[row.issuer],
            quoted = row.status === "quoted",
            normalized = Number.isFinite(row.equivalentShares);
          return `<details class="quote-row ${best?.id === row.id ? "best" : ""} ${!quoted ? "unavailable-row" : ""}" data-expires="${row.expiresAt || ""}"><summary aria-label="${escape(row.symbol)} on ${escape(row.chainLabel)}: ${quoted ? (normalized ? `${number(row.equivalentShares, 4)} equivalent shares, ${number(row.effectivePrice)} USDC per equivalent share` : `${number(row.tokenQuantity, 4)} tokens; conversion unavailable`) : "quote unavailable"}"><span class="token-cell"><span class="issuer-mark ${row.issuer}" aria-hidden="true">${provider.short}</span><span><strong>${escape(row.symbol)}</strong><small>${provider.name}${best?.id === row.id ? '<span class="best-label">Most exposure</span>' : ""}</small></span></span><span class="chain-cell"><span><i class="chain-dot ${row.chain === "Solana" ? "solana" : row.chain === "Ethereum" ? "ethereum" : "bnb"}" aria-hidden="true"></i>${escape(row.chainLabel)}</span><small>${escape(row.venue)}</small></span><span class="price-cell"><span class="mobile-label">USDC / equivalent share</span><strong>${quoted ? number(row.effectivePrice) : "Unavailable"}</strong><small>${quoted ? (normalized ? "before network costs" : "ratio not verified") : "expand for details"}</small></span><span class="exposure-cell"><span class="mobile-label">Your exposure</span><strong>${quoted ? number(normalized ? row.equivalentShares : row.tokenQuantity, 4) : "—"}</strong><small>${quoted ? (normalized ? "equivalent shares" : "tokens · not normalized") : "no quote"}</small></span><span class="cost-cell"><span class="mobile-label">Swap gas estimate</span><strong>${quoted && row.networkFeeUsd != null ? dollars(row.networkFeeUsd) : "—"}</strong><small>${quoted && row.networkFeeUsd != null ? "paid separately" : "not estimated"}</small></span><span class="expand-icon" aria-hidden="true">⌄</span></summary>${details(row)}</details>`;
        })
        .join("")}`
    : '<div class="empty-results">No verified deployments on this chain. Choose another chain.</div>';
  $("#comparison-status").textContent = [
    `${quoted.length} of ${rows.length} routes quoted`,
    ...snapshot.warnings,
  ].join(" · ");
  tick();
}
function tick() {
  if (!snapshot) return;
  const quoted = snapshot.rows.filter((row) => row.status === "quoted");
  const fresh = quoted.filter((row) => row.expiresAt > Date.now());
  $("#freshness").textContent = !quoted.length
    ? "No live quotes"
    : fresh.length
      ? `Updated ${Math.max(0, Math.floor((Date.now() - Math.min(...fresh.map((r) => r.fetchedAt))) / 1000))}s ago`
      : "Quotes stale · refresh";
  $("#results")
    .querySelectorAll(".quote-row[data-expires]")
    .forEach((el) => {
      const stale =
        Number(el.dataset.expires) > 0 &&
        Number(el.dataset.expires) <= Date.now();
      el.classList.toggle("stale", stale);
    });
  document.querySelectorAll(".quote-link").forEach((link) => {
    const stale = Number(link.dataset.expires) <= Date.now();
    if (stale) {
      link.removeAttribute("href");
      link.setAttribute("aria-disabled", "true");
      link.textContent = "Refresh quote to continue";
    }
  });
}
async function fetchComparison() {
  clearTimeout(debounce);
  controller?.abort();
  const id = ++requestId;
  snapshot = null;
  const valid = validBudget($("#budget").value);
  $("#budget-error").hidden = valid;
  $("#budget").setAttribute("aria-invalid", String(!valid));
  document
    .querySelectorAll("[data-budget]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(Number(button.dataset.budget) === Number($("#budget").value)),
      ),
    );
  if (!valid || !selected) {
    $("#results").innerHTML =
      '<div class="empty-results">Set a valid USDC amount to compare.</div>';
    $("#result-count").textContent = "0";
    $("#comparison-status").textContent = "";
    $("#results").setAttribute("aria-busy", "false");
    $("#freshness").textContent = "";
    $("#refresh").disabled = !selected;
    return;
  }
  updateUrl();
  controller = new AbortController();
  $("#refresh").disabled = true;
  $("#freshness").textContent = "Fetching live quotes…";
  $("#comparison-status").textContent = "";
  $("#result-count").textContent = "—";
  $("#results").setAttribute("aria-busy", "true");
  $("#results").innerHTML =
    '<div class="empty-results loading-message">Checking verified contracts and quoting your amount…</div>';
  try {
    const query = new URLSearchParams({
      stock: selected.id,
      amount: $("#budget").value,
      chain: $("#chain").value,
    });
    const response = await fetch(`/api/compare?${query}`, {
      signal: controller.signal,
    });
    const data = await response.json();
    if (id !== requestId) return;
    if (!response.ok)
      throw new Error(data.error || "Could not retrieve comparison.");
    snapshot = data;
    renderResults();
  } catch (error) {
    if (id !== requestId || error.name === "AbortError") return;
    $("#freshness").textContent = "Connection issue";
    $("#result-count").textContent = "0";
    $("#comparison-status").textContent = "";
    $("#results").setAttribute("aria-busy", "false");
    $("#results").innerHTML =
      `<div class="empty-results"><p>${escape(error.message)}</p><button class="provider-link retry-quotes">Try again</button></div>`;
  } finally {
    if (id === requestId) {
      $("#refresh").disabled = false;
      $("#results").setAttribute("aria-busy", "false");
    }
  }
}
async function initialize() {
  $("#stock-list").innerHTML =
    '<p class="empty-search">Loading official contract lists…</p>';
  try {
    const response = await fetch("/api/catalog");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Catalog unavailable.");
    stocks = data.stocks;
    if (!stocks.length)
      throw new Error("No verified securities are available.");
    selected =
      stocks.find((stock) => stock.id === params.get("stock")) ||
      stocks.find((stock) => stock.ticker === params.get("ticker")) ||
      stocks.find((stock) => stock.ticker === "NVDA") ||
      stocks[0];
    const providers = new Set(
      stocks.flatMap((stock) =>
        stock.products.map((product) => product.issuer),
      ),
    );
    $("#coverage").textContent =
      `${stocks.length.toLocaleString()} assets · ${providers.size} providers`;
    $("#search").disabled = false;
    renderStocks();
    renderHeading();
    await fetchComparison();
  } catch (error) {
    $("#coverage").textContent = "Connection issue";
    $("#stock-list").innerHTML =
      '<p class="empty-search">Official catalogs are unavailable.</p><button id="retry-catalog" class="provider-link">Retry catalog</button>';
    $("#stock-heading").innerHTML =
      '<p class="loading-message">Waiting for issuer data</p>';
    $("#results").innerHTML =
      `<div class="empty-results">${escape(error.message)}</div>`;
  }
}
$("#stock-list").addEventListener("click", (event) => {
  if (event.target.closest("#retry-catalog")) {
    initialize();
    return;
  }
  const button = event.target.closest("[data-stock]");
  if (!button) return;
  selected = stocks.find((stock) => stock.id === button.dataset.stock);
  renderStocks();
  renderHeading();
  document.querySelector(`[data-stock="${selected.id}"]`)?.focus();
  fetchComparison();
});
$("#search").addEventListener("input", renderStocks);
$("#stock-heading").addEventListener("click", (event) => {
  if (!event.target.closest("#favorite")) return;
  saved.has(selected.id) ? saved.delete(selected.id) : saved.add(selected.id);
  try {
    localStorage.setItem("stocklens:saved", JSON.stringify([...saved]));
  } catch {}
  renderStocks();
  renderHeading();
  $("#favorite").focus();
});
for (const [id, value] of [
  ["all-stocks", false],
  ["saved-stocks", true],
])
  $(`#${id}`).addEventListener("click", () => {
    savedOnly = value;
    renderStocks();
  });
$("#budget").addEventListener("input", () => {
  controller?.abort();
  requestId++;
  snapshot = null;
  $("#results").innerHTML = '<div class="empty-results">Updating amount…</div>';
  $("#freshness").textContent = "";
  clearTimeout(debounce);
  debounce = setTimeout(fetchComparison, 450);
});
$("#chain").addEventListener("change", fetchComparison);
$("#refresh").addEventListener("click", fetchComparison);
$("#results").addEventListener("click", (event) => {
  if (event.target.closest(".retry-quotes")) fetchComparison();
});
document.querySelector(".presets").addEventListener("click", (event) => {
  const button = event.target.closest("[data-budget]");
  if (!button) return;
  $("#budget").value = button.dataset.budget;
  fetchComparison();
});
for (const id of ["how-it-works", "methodology"])
  $(`#${id}`).addEventListener("click", () => $("#info-dialog").showModal());
$("#info-dialog").addEventListener("click", (event) => {
  if (event.target !== $("#info-dialog")) return;
  const b = event.target.getBoundingClientRect();
  if (
    event.clientX < b.left ||
    event.clientX > b.right ||
    event.clientY < b.top ||
    event.clientY > b.bottom
  )
    event.target.close();
});
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
setInterval(tick, 1000);
initialize();

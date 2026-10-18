import { stocks, issuers, routesFor } from "./data.mjs";
import { compareRoutes, findStocks } from "./model.mjs";

const $ = (selector) => document.querySelector(selector);
const money = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value,
  );
const quantity = (value) =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
const percent = (bps) => `${(bps / 100).toFixed(2)}%`;
let selected = stocks[0];

// Dynamic HTML only uses this module's fixed catalog; search and budget are never interpolated.
function renderStocks() {
  const matches = findStocks(stocks, $("#search").value);
  $("#stock-list").innerHTML = matches.length
    ? matches
        .map(
          (stock) => `
    <button class="stock-option ${selected.ticker === stock.ticker ? "selected" : ""}" data-ticker="${stock.ticker}" aria-pressed="${selected.ticker === stock.ticker}">
      <span class="stock-monogram ${stock.color}" aria-hidden="true">${stock.initial}</span>
      <span class="stock-option-name"><strong>${stock.name}</strong><span>${stock.ticker}</span></span>
      <span class="stock-arrow" aria-hidden="true">↗</span>
    </button>`,
        )
        .join("")
    : '<p class="empty-search">No matching stock.<br>Try NVDA, AAPL, or TSLA.</p>';
}

function renderHeading() {
  $("#stock-heading").innerHTML =
    `<div class="company"><span class="stock-monogram large ${selected.color}" aria-hidden="true">${selected.initial}</span><div><div class="company-name"><h2>${selected.name}</h2><span class="ticker-label">${selected.ticker}</span></div><p>${selected.sector}</p></div></div><div class="reference"><span>Illustrative share price</span><strong>${money(selected.referencePrice)}</strong></div>`;
}

function productDetails(quote) {
  const issuer = issuers[quote.issuer];
  return `<div class="product-details"><div class="details-column"><h4>What you own</h4><strong>${issuer.structure}</strong><p>${issuer.rights}</p><a href="${issuer.source}" target="_blank" rel="noopener noreferrer">${issuer.sourceLabel} ↗</a><p class="source-date">Source checked Oct 18, 2026</p></div><div class="details-column"><h4>Dividends & exit</h4><p>${issuer.dividends}</p><p>${issuer.exit}</p></div><div class="details-column assumptions"><h4>This demo’s assumptions</h4><dl><div><dt>Shares per token</dt><dd>${quote.shareRatio.toFixed(4)}</dd></div><div><dt>Spread + price impact</dt><dd>${percent(quote.spreadBps + quote.impactBps)}</dd></div><div><dt>Trading fee</dt><dd>${percent(quote.feeBps)}</dd></div><div><dt>Network fee</dt><dd>${money(quote.networkFee)}</dd></div></dl><p>Illustrative inputs. Funds already on this chain. No bridge or future exit costs included.</p></div></div><div class="provider-handoff"><p>Check current availability, eligibility, and terms with the provider.</p><a class="provider-link" href="${issuer.url}" target="_blank" rel="noopener noreferrer">Explore ${issuer.name} ↗</a></div>`;
}

function renderResults() {
  const budget = Number($("#budget").value);
  const valid =
    $("#budget").value.trim() !== "" &&
    Number.isFinite(budget) &&
    budget >= 10 &&
    budget <= 1_000_000;
  $("#budget-error").hidden = valid;
  $("#budget").setAttribute("aria-invalid", String(!valid));
  document
    .querySelectorAll("[data-budget]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(Number(button.dataset.budget) === budget),
      ),
    );
  const quotes = valid
    ? compareRoutes(selected, routesFor(selected), budget, $("#chain").value)
    : [];
  $("#result-count").textContent = `${quotes.length}`;
  if (!valid) {
    $("#results").innerHTML =
      '<div class="empty-results">Set a valid budget to compare versions.</div>';
    return;
  }
  $("#results").innerHTML =
    `<div class="table-header" aria-hidden="true"><span>Token / provider</span><span>Chain / scenario venue</span><span>Effective price</span><span>Your exposure</span><span>Modeled costs</span><span></span></div>${quotes
      .map((quote, index) => {
        const issuer = issuers[quote.issuer];
        return `<details class="quote-row ${index === 0 ? "best" : ""}"><summary aria-label="View ${selected.ticker}${issuer.suffix} on ${quote.chain}, ${money(quote.effectivePrice)} per equivalent share, ${quantity(quote.equivalentShares)} equivalent shares"><span class="token-cell"><span class="issuer-mark ${quote.issuer}" aria-hidden="true">${issuer.short}</span><span><strong>${selected.ticker}<span class="token-suffix">${issuer.suffix}</span></strong><small>${issuer.name}${index === 0 ? '<span class="best-label">Lowest cost</span>' : ""}</small></span></span><span class="chain-cell"><span><i class="chain-dot ${quote.chain === "Solana" ? "solana" : quote.chain === "Ethereum" ? "ethereum" : "bnb"}" aria-hidden="true"></i>${quote.chain}</span><small>${quote.venue}</small></span><span class="price-cell"><span class="mobile-label">Effective price</span><strong>${money(quote.effectivePrice)}</strong><small>+${percent(quote.premiumBps)} vs demo ref.</small></span><span class="exposure-cell"><span class="mobile-label">Your exposure</span><strong>${quantity(quote.equivalentShares)}</strong><small>equivalent shares</small></span><span class="cost-cell"><span class="mobile-label">Modeled costs</span><strong>${money(quote.totalCost)}</strong><small>included in budget</small></span><span class="expand-icon" aria-hidden="true">⌄</span></summary>${productDetails(quote)}</details>`;
      })
      .join("")}`;
}

$("#stock-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-ticker]");
  if (!button) return;
  selected = stocks.find((stock) => stock.ticker === button.dataset.ticker);
  renderStocks();
  renderHeading();
  renderResults();
  document.querySelector(`[data-ticker="${selected.ticker}"]`).focus();
});
$("#search").addEventListener("input", renderStocks);
$("#budget").addEventListener("input", renderResults);
$("#chain").addEventListener("change", renderResults);
document.querySelector(".presets").addEventListener("click", (event) => {
  const button = event.target.closest("[data-budget]");
  if (!button) return;
  $("#budget").value = button.dataset.budget;
  renderResults();
});
for (const id of ["how-it-works", "methodology"])
  $(`#${id}`).addEventListener("click", () => $("#info-dialog").showModal());
$("#info-dialog").addEventListener("click", (event) => {
  if (event.target === $("#info-dialog")) {
    const bounds = event.target.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      event.target.close();
  }
});
renderStocks();
renderHeading();
renderResults();

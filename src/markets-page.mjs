import {
  selectMarketRows,
  createMarketDetailsLoader,
  observedPremiumState,
  companyMetricState,
  marketReadiness,
  MARKET_COLUMNS,
  DEFAULT_MARKET_COLUMNS,
  normalizeMarketColumns,
  MARKET_COLUMN_WIDTHS,
  marketTurnover,
} from "./market-model.mjs";
import {
  escape,
  usd,
  compact,
  number,
  stamp,
  provider,
  csvText,
} from "./views.mjs";
import { stockLogo, chainLogo } from "./brands.mjs";
import {
  listedDate,
  selectOnchainPrice,
  comparisonReference,
} from "./reference-view.mjs";
import {
  canonicalSelection,
  observationIsStale,
} from "./asset-comparison-model.mjs";
const signed = (v) =>
  Number.isFinite(v) ? `${v > 0 ? "+" : ""}${number(v)}%` : "—";
export function formatTurnoverPercent(value) {
  if (!Number.isFinite(value)) return "—";
  if (value > 0 && value < 0.01) return "<0.01%";
  if (value >= 1e15) return value.toExponential(2) + "%";
  if (value >= 1000)
    return (
      new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 2,
      })
        .format(value)
        .replace("K", "k") + "%"
    );
  return number(value) + "%";
}
// Keep keyboard position when background observations replace table rows.
export function renderMarketBody(container, markup, restoreState = () => {}) {
  const document = container.ownerDocument,
    focused = document.activeElement,
    key = container.contains(focused) ? focused.dataset.marketFocus : null;
  container.innerHTML = markup;
  restoreState();
  if (!key || ![document.body, focused].includes(document.activeElement))
    return;
  [...container.querySelectorAll("[data-market-focus]")]
    .find((node) => node.dataset.marketFocus === key)
    ?.focus({ preventScroll: true });
}
export async function refreshMarketPage(refresh, refreshDetails, onError) {
  try {
    await refresh();
  } catch (error) {
    onError(error);
  }
  refreshDetails();
}
export function marketExportPrices(detail = {}, now = Date.now()) {
  const selected = selectOnchainPrice(detail, now),
    p = selected?.data,
    comparable =
      selected?.metric && Number.isFinite(p?.value) && p.referencePrice > 0,
    reference = comparable
      ? comparisonReference(detail.reference, p)
      : detail.reference;
  return {
    listedPrice: reference?.price ?? null,
    listedAt: reference?.priceDate || reference?.at || null,
    onchainPrice: p?.price ?? null,
    onchainAt: selected?.at ?? null,
    premium: comparable ? p.value : null,
    basis: selected
      ? `${selected.older ? "Older observation · " : ""}${selected.kind === "buy" ? "$1,000 indicative buy · before gas" : "Pool snapshot"}`
      : "Not supplied",
  };
}
export function createMarketsPage({
  getState,
  getMarkets,
  getMarketState,
  getQuotes = () => null,
  onDetails = () => {},
  onSelect,
  onSave,
  onRefresh,
  onCompareVersions,
  getComparison = () => [],
  onCompareChange = () => {},
  onCompareAssets = () => {},
  onChooseCompare = () => {},
}) {
  const $ = (s) => document.querySelector(s);
  let currentPage = 1,
    sort = "volume",
    savedOnly = false,
    detailsTimer;
  const columnStorageKey = "stocklens:market-columns:v2";
  let columns;
  try {
    const stored = localStorage.getItem(columnStorageKey);
    columns = normalizeMarketColumns(
      JSON.parse(stored ?? localStorage.getItem("stocklens:market-columns:v1")),
      { upgradeLegacyDefaults: stored === null },
    );
  } catch {
    columns = [...DEFAULT_MARKET_COLUMNS];
  }
  const details = createMarketDetailsLoader({
    fetchDetails: async (ids, signal) => {
      const timeout = AbortSignal.timeout(40000);
      const response = await fetch(
        "/api/market-details?" + new URLSearchParams({ ids: ids.join(",") }),
        { signal: AbortSignal.any([signal, timeout]) },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Market details source unavailable");
      return data;
    },
    onChange: () => render(),
    onDetails,
  });
  let currentRows = [];
  const openedDetails = new Set();
  function readiness(stock) {
    return marketReadiness(stock, {
      chains: getState().chains,
      detail: details.get(stock.id),
      quotes: getQuotes(stock.id),
      chain: $("#market-chain").value,
      issuer: $("#market-issuer").value,
    });
  }
  function rows({ ignoreConversion = false } = {}) {
    const { stocks, saved } = getState();
    return selectMarketRows(
      stocks.map((s) => ({ ...s, market: getMarkets().get(s.id) || null })),
      {
        query: $("#market-search").value,
        type: $("#market-type").value,
        chain: $("#market-chain").value,
        issuer: $("#market-issuer").value,
        sort,
        savedOnly,
        saved,
        quoteCoverage: $("#market-quote-coverage")?.value || "all",
        conversion: ignoreConversion
          ? "all"
          : $("#market-conversion")?.value || "all",
        getReadiness: readiness,
      },
    );
  }
  function applyColumns() {
    const selected = new Set(columns),
      table = $("#markets-table");
    table.querySelectorAll("thead th").forEach((node, index) => {
      const id = MARKET_COLUMNS[index][0];
      node.dataset.marketColumn = id;
      node.style.width =
        id === "stock"
          ? "var(--market-stock-width)"
          : `${MARKET_COLUMN_WIDTHS[id]}px`;
    });
    table.querySelectorAll("[data-market-column]").forEach((node) => {
      node.hidden = !selected.has(node.dataset.marketColumn);
    });
    // Table width follows the selected metrics instead of retaining empty space.
    table.style.minWidth = `calc(var(--market-stock-width) + ${columns.reduce((sum, id) => sum + (MARKET_COLUMN_WIDTHS[id] || 0), 0)}px)`;
    $("#market-column-count").textContent = `${columns.length} columns`;
    $("#market-columns")
      .querySelectorAll("input")
      .forEach((input) => {
        input.checked = selected.has(input.value);
      });
  }
  function setColumns(value) {
    columns = normalizeMarketColumns(value);
    try {
      localStorage.setItem(columnStorageKey, JSON.stringify(columns));
    } catch {
      /* Session controls remain usable. */
    }
    applyColumns();
  }
  function setupControls() {
    const filters = $("#markets-page .markets-filters");
    if ($("#market-quote-coverage")) return;
    const controls = document.createElement("div");
    controls.className = "market-readiness-controls";
    controls.innerHTML = `<label><span>Quote networks</span><select id="market-quote-coverage" aria-describedby="market-readiness-note"><option value="all">All network coverage</option><option value="supported">Supported quote network</option><option value="unsupported">No supported quote network</option></select></label><label><span>Share conversion</span><select id="market-conversion" aria-describedby="market-readiness-note"><option value="all">All conversion states</option><option value="verified">Verified current conversion</option><option value="not-verified">No verified conversion observed</option><option value="expired">Older conversion observation</option><option value="unchecked">Not checked yet</option><option value="unavailable">Source unavailable</option></select></label>`;
    const advanced = document.createElement("details");
    advanced.id = "market-data-filters";
    advanced.className = "market-data-filters";
    advanced.innerHTML = "<summary>Quote &amp; conversion filters</summary>";
    filters.after(advanced);
    advanced.append(controls);
    const note = document.createElement("div");
    note.className = "market-readiness-note";
    note.innerHTML = `<p id="market-readiness-note">Supported networks have quote integrations; a route or liquidity is not guaranteed. Conversion filters use checked pool and quote observations.</p><span id="market-readiness-status" role="status"></span><button id="market-check-more" hidden>Check next 25 assets</button>`;
    advanced.append(note);
    const picker = document.createElement("details");
    picker.id = "market-columns";
    picker.className = "market-column-picker";
    picker.innerHTML = `<summary><span id="market-column-count">${columns.length} columns</span></summary><div class="market-column-options"><fieldset><legend>Visible table columns</legend>${MARKET_COLUMNS.map(([id, label]) => `<label><input type="checkbox" value="${id}" ${columns.includes(id) ? "checked" : ""} ${id === "stock" ? "disabled" : ""}><span>${label}</span></label>`).join("")}</fieldset><button type="button" id="market-columns-reset">Restore defaults</button></div>`;
    filters.querySelector(".overview-actions").before(picker);
    picker.addEventListener("change", () =>
      setColumns(
        [...picker.querySelectorAll("input:checked")].map(
          (input) => input.value,
        ),
      ),
    );
    $("#market-columns-reset").addEventListener("click", () =>
      setColumns(DEFAULT_MARKET_COLUMNS),
    );
    picker.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        picker.open = false;
        picker.querySelector("summary").focus();
      }
    });
    for (const id of ["market-quote-coverage", "market-conversion"])
      $("#" + id).addEventListener("change", () => {
        const count = [
          $("#market-quote-coverage"),
          $("#market-conversion"),
        ].filter((control) => control.value !== "all").length;
        advanced.querySelector("summary").textContent =
          "Quote & conversion filters" + (count ? ` · ${count} active` : "");
        currentPage = 1;
        changed();
      });
    $("#market-check-more").addEventListener("click", () => {
      details.load(
        uncheckedRows()
          .slice(0, 25)
          .map((stock) => stock.id),
      );
    });
    const scroll = $("#markets-page .market-table-scroll");
    scroll.setAttribute("aria-describedby", "market-readiness-note");
    applyColumns();
  }
  function uncheckedRows() {
    return rows({ ignoreConversion: true }).filter(
      (stock) => readiness(stock).conversion === "unchecked",
    );
  }
  const sourceLink = (url, label, key) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password)
        return escape(label);
      return `<a data-market-focus="${escape(key)}" href="${escape(parsed.href)}" target="_blank" rel="noopener noreferrer">${escape(label)} ↗</a>`;
    } catch {
      return escape(label);
    }
  };
  function disclosure(label, text, links = "", key = "") {
    return `<details data-market-detail="${escape(key)}" title="${escape(text)}"><summary data-market-focus="${escape(key)}:summary"><small>${escape(label)}</small></summary><small>${escape(text)}${links ? " · " + links : ""}</small></details>`;
  }
  function premiumCell(stock) {
    const entry = details.get(stock.id),
      selected = selectOnchainPrice(entry),
      p = selected?.data,
      state = selected?.metric ? observedPremiumState(p) : null,
      observed = state
        ? { ...state, stale: state.stale || selected.older }
        : null;
    if (observed) {
      const spot = selected.kind === "pool",
        label = [
          observed.stale ? "Last observed" : spot ? "Pool snapshot" : "$1K buy",
          p.referenceBasis === "last-close" ? "vs close" : "",
        ]
          .filter(Boolean)
          .join(" · ");
      const reason = [
        p.basis,
        `${p.symbol || "Token"} · ${p.chain || "Network not supplied"}.`,
        `Normalized price ${usd(p.price)}; listed reference ${usd(p.referencePrice || entry.reference?.price)}.`,
        `Onchain observed ${stamp(p.priceAt)}; listed reference ${listedDate(comparisonReference(entry.reference, p))}.`,
        observed.stale
          ? "Observation expired; refresh to request current data."
          : "",
        entry.status === "loading" ? "Refreshing…" : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `<span class="${observed.value < 0 ? "negative" : observed.value > 0 ? "positive" : ""}">${signed(observed.value)}</span>${disclosure(label, reason, sourceLink(p.source, "Price source", stock.id + ":premium:price-source") + (p.conversionSource ? " · " + sourceLink(p.conversionSource, "Share conversion", stock.id + ":premium:conversion-source") : ""), stock.id + ":premium")}`;
    }
    if (!entry || entry.status === "loading") return "—<small>Loading…</small>";
    return `—${disclosure(entry.status === "error" ? "Load failed" : "Unavailable", entry.error || entry.spotPremiumReason || entry.premiumReason || "A listed price and verified comparable pool snapshot were not supplied.", "", stock.id + ":premium")}`;
  }
  function listedPriceCell(stock) {
    const entry = details.get(stock.id),
      reference = entry?.reference,
      stale = observationIsStale(reference);
    if (Number.isFinite(reference?.price))
      return `<strong>${usd(reference.price)}</strong><small>${stale ? "Older · " : ""}${reference.priceSession === "Closed" ? "Close · " : ""}${escape(listedDate(reference))}</small>${disclosure(reference.exchange || "Listed source", stale ? reference.staleReason || "The previous dated price is retained." : "Listed-security observation; separate from tokenized prices.", sourceLink(reference.source, "Listed source", stock.id + ":listed:source"), stock.id + ":listed")}`;
    return `—<small>${!entry || entry.status === "loading" ? "Loading…" : "Not supplied"}</small>`;
  }
  function turnoverCell(stock) {
    const value = marketTurnover(stock.market),
      reason =
        value === null
          ? "Turnover requires reported 24h tokenized volume and a positive tokenized capitalization."
          : `${value}% — CoinGecko 24h tokenized volume (${stock.market.volume24h} USD) divided by tokenized capitalization (${stock.market.marketCap} USD). Observed ${stamp(stock.market.updatedAt)}. This ratio does not measure executable liquidity.`;
    return `<span title="${escape(reason)}">${escape(formatTurnoverPercent(value))}</span>`;
  }
  function companyCell(stock, field) {
    const entry = details.get(stock.id),
      r = entry?.reference,
      metric = companyMetricState(stock, entry, field),
      numeric = Number.isFinite(metric.value),
      label = numeric
        ? field === "pe"
          ? number(metric.value) + "×"
          : compact(metric.value)
        : ["not-applicable", "not-reported"].includes(metric.state)
          ? "N/A"
          : "—";
    if (metric.state === "loading") return `${label}<small>Loading…</small>`;
    const reason = [
      metric.state === "not-applicable"
        ? `Company ${field === "pe" ? "P/E" : "capitalization"} does not apply to ${stock.category === "ETF" ? "an ETF" : "this asset"}.`
        : "",
      r?.[field + "Reason"],
      entry?.status === "error"
        ? `Request failed: ${entry.error}. Use Refresh page data to retry.`
        : "",
      !r && metric.state !== "not-applicable"
        ? entry?.referenceReason ||
          "No corroborated Nasdaq listed-security reference was returned."
        : "",
      r && !numeric && metric.state === "not-reported"
        ? "This field was not supplied by Nasdaq; no value is estimated."
        : "",
      field === "pe" && numeric
        ? `${r.peBasis || "Nasdaq P/E"}. ${r.pePeriod || "Period not supplied"}. Fiscal-year P/E is historical, not a current trailing-twelve-month ratio. ${r.peAsOf ? "As of " + r.peAsOf : "Source observation date not disclosed."}`
        : "",
      r
        ? `Retrieved ${stamp(r[field + "RetrievedAt"] || r.retrievedAt)}. ${r[field + "Stale"] ? r.staleReason || "Source cached data is stale." : ""} ${numeric && !r[field + "AsOf"] ? "Fundamental as-of time not disclosed." : ""}`
        : "",
      entry?.status === "loading" ? "Refreshing…" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const source =
        field === "pe"
          ? r?.peSource || r?.peSourceURL || r?.source
          : r?.marketCapSource || r?.source,
      note =
        metric.state === "not-applicable"
          ? "Why N/A"
          : entry?.status === "error"
            ? numeric
              ? "Refresh failed"
              : "Load failed"
            : entry?.status === "loading"
              ? "Updating…"
              : field === "pe" && numeric
                ? `${r.pePeriod || "Period not supplied"}${r.peStale ? " · stale" : ""}`
                : numeric
                  ? r.marketCapStale
                    ? "Cached Nasdaq"
                    : "Nasdaq"
                  : label === "N/A"
                    ? "Why N/A"
                    : "Unavailable";
    return `${label}${disclosure(note, reason, r ? sourceLink(source, "Nasdaq", stock.id + ":" + field + ":source") : "", stock.id + ":" + field)}`;
  }
  function visibleRows() {
    const data = rows();
    currentPage = Math.min(
      currentPage,
      Math.max(1, Math.ceil(data.length / 25)),
    );
    return data.slice((currentPage - 1) * 25, currentPage * 25);
  }
  function scheduleDetails({ immediate = false, force = false } = {}) {
    clearTimeout(detailsTimer);
    if ($("#markets-page").hidden) return;
    detailsTimer = setTimeout(
      () => {
        if (!$("#markets-page").hidden && !getMarketState().screenBusy) {
          const visible = visibleRows(),
            unchecked = uncheckedRows();
          details.load(
            (visible.length
              ? visible
              : unchecked.length
                ? unchecked.slice(0, 25)
                : force
                  ? rows({ ignoreConversion: true }).slice(0, 25)
                  : []
            ).map((s) => s.id),
            { force },
          );
        }
      },
      immediate ? 0 : 250,
    );
  }
  function changed() {
    render();
    scheduleDetails();
  }
  function show() {
    render();
    scheduleDetails({ immediate: true });
  }
  function render() {
    const { stocks, saved, chains } = getState();
    const compared = canonicalSelection(getComparison(), stocks);
    $("#market-stock-compare").hidden = !compared.length;
    $("#market-compare-selected").textContent = compared
      .map((id) => stocks.find((s) => s.id === id)?.ticker)
      .join(" · ");
    $("#market-compare-open").disabled = compared.length < 2;
    $("#market-compare-open").textContent =
      `Compare ${compared.length} stocks →`;
    if (!stocks.length) return;
    const data = rows(),
      state = getMarketState();
    currentRows = data;
    const pages = Math.max(1, Math.ceil(data.length / 25));
    currentPage = Math.min(currentPage, pages);
    const visible = data.slice((currentPage - 1) * 25, currentPage * 25);
    $("#market-universe-note").textContent =
      `${stocks.length.toLocaleString()} assets · ${new Set(stocks.flatMap((s) => s.products.map((p) => p.issuer))).size} issuers · ${new Set(stocks.flatMap((s) => s.products.flatMap((p) => p.deployments.map((d) => d.chain)))).size} networks`;
    $("#market-feed-note").textContent = state.screenBusy
      ? "Updating reference prices…"
      : `${state.observed.toLocaleString()} assets with observations${state.screenAt ? " · " + stamp(state.screenAt) : ""}`;
    $("#market-data-warning").textContent = state.screenWarning || "";
    $("#market-data-warning").hidden = !state.screenWarning;
    $("#market-next-data").hidden = !state.screenNext;
    $("#market-next-data").disabled = state.screenBusy;
    $("#market-refresh").disabled = state.screenBusy;
    $("#market-page-status").textContent = data.length
      ? `${((currentPage - 1) * 25 + 1).toLocaleString()}–${Math.min(currentPage * 25, data.length).toLocaleString()} of ${data.length.toLocaleString()} assets`
      : "No matching assets";
    $("#market-prev").disabled = currentPage === 1;
    $("#market-next").disabled = currentPage === pages;
    $("#market-page-number").textContent = `Page ${currentPage} of ${pages}`;
    $("#market-watchlist").setAttribute("aria-pressed", savedOnly);
    const candidates = rows({ ignoreConversion: true }),
      checking = candidates.filter(
        (stock) => details.get(stock.id)?.status === "loading",
      ).length,
      unchecked = candidates.filter(
        (stock) => readiness(stock).conversion === "unchecked",
      ).length,
      currentConversions = candidates.filter(
        (stock) => readiness(stock).conversion === "verified",
      ).length;
    $("#market-readiness-status").textContent =
      `${currentConversions} with a verified current conversion · ${unchecked} not checked${checking ? ` · ${checking} loading` : ""}.`;
    $("#market-check-more").hidden =
      $("#market-conversion").value === "all" || !unchecked;
    $("#market-check-more").disabled = checking > 0 || state.screenBusy;
    const loading = visible.filter(
        (s) => details.get(s.id)?.status === "loading",
      ).length,
      failed = visible.filter(
        (s) => details.get(s.id)?.status === "error",
      ).length,
      loaded = visible.filter(
        (s) => details.get(s.id)?.status === "ready",
      ).length;
    $("#market-fundamentals").disabled = checking > 0 || !candidates.length;
    $("#market-fundamentals").textContent = checking
      ? "Loading page data…"
      : "Refresh page data";
    $("#market-company-status").textContent = loading
      ? `${loaded} of ${visible.length} rows loaded · ${loading} loading. Public sources may take up to 40 seconds per batch.`
      : failed
        ? `${failed} row requests failed. Expand a cell for the reason; refresh to retry.`
        : loaded
          ? `Page data loaded automatically. Expand a cell for source, time and missing-value reasons. P/E uses the stated fiscal year.`
          : "Listed prices, company data and sourced conversion observations load for this page.";
    document
      .querySelectorAll("[data-market-sort]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", b.dataset.marketSort === sort),
      );
    $("#market-sort").value = sort;
    document.querySelectorAll("[data-market-detail]").forEach((node) => {
      if (node.open) openedDetails.add(node.dataset.marketDetail);
      else openedDetails.delete(node.dataset.marketDetail);
    });
    renderMarketBody(
      $("#markets-body"),
      visible
        .map((s) => {
          const m = s.market,
            networks = [
              ...new Set(
                s.products.flatMap((p) => p.deployments.map((d) => d.chain)),
              ),
            ],
            issuers = [
              ...new Map(s.products.map((p) => [p.issuer, p])).values(),
            ];
          return `<tr><td><div class="market-asset"><button class="market-compare-toggle" data-market-focus="${escape(s.id)}:compare" data-stock-compare="${escape(s.id)}" aria-label="${compared.includes(s.id) ? "Remove" : "Add"} ${escape(s.name)} ${compared.includes(s.id) ? "from" : "to"} stock comparison" aria-pressed="${compared.includes(s.id)}">${compared.includes(s.id) ? "✓" : "+"}</button><button class="market-save" data-market-focus="${escape(s.id)}:save" data-market-save="${escape(s.id)}" aria-label="${saved.has(s.id) ? "Unsave" : "Save"} ${escape(s.name)}" aria-pressed="${saved.has(s.id)}">${saved.has(s.id) ? "★" : "☆"}</button><a data-market-focus="${escape(s.id)}:asset" href="/?page=stock&amp;stock=${encodeURIComponent(s.id)}" data-open-stock="${escape(s.id)}">${stockLogo(s, m?.image)}<span><strong>${escape(s.ticker)}</strong><small>${escape(s.name)}</small></span></a></div></td><td>${listedPriceCell(s)}</td><td><strong>${usd(m?.price)}</strong><small>${m?.updatedAt ? (observationIsStale(m) ? "Older · " : "") + stamp(m.updatedAt) : "Not observed"}</small></td><td><span class="market-change ${m?.change24h < 0 ? "negative" : m?.change24h > 0 ? "positive" : ""}">${signed(m?.change24h)}</span></td><td>${premiumCell(s)}</td><td>${turnoverCell(s)}</td><td>${compact(m?.marketCap)}</td><td>${compact(m?.volume24h)}</td><td><span class="logo-stack" title="${escape(networks.map((id) => chains.find((c) => c.id === id)?.label || id).join(", "))}">${networks
            .slice(0, 3)
            .map((id) => chainLogo(id))
            .join(
              "",
            )}<span>${networks.length || "—"}</span></span><small class="market-network-names">${escape(
            networks
              .slice(0, 2)
              .map((id) => chains.find((c) => c.id === id)?.label || id)
              .join(", "),
          )}${networks.length > 2 ? ` +${networks.length - 2}` : ""}</small></td><td><a class="version-link" data-market-focus="${escape(s.id)}:versions" href="/?stock=${encodeURIComponent(s.id)}" data-open-versions="${escape(s.id)}">${s.products.length || "Check"}${s.products.length ? " →" : ""}</a><small title="${escape(issuers.map((p) => provider(p).name).join(", "))}">${issuers.length} issuers</small><small class="market-conversion-state">${{ verified: "Conversion verified", "not-verified": "No verified conversion", expired: "Older conversion", unavailable: "Source unavailable", loading: "Checking conversion…", unchecked: "Conversion unchecked" }[readiness(s).conversion]}</small></td><td>${companyCell(s, "marketCap")}</td><td>${companyCell(s, "pe")}</td></tr>`;
        })
        .join("") ||
        `<tr><td colspan="${columns.length}" class="empty-results">${$("#market-conversion").value !== "all" ? (checking ? "Checking conversion observations. Filters remain available." : unchecked ? "No checked observations match. Check the next 25 assets or change the conversion filter." : "No observations match this conversion state. Change the filter or refresh page data.") : "No assets match. Clear the search or change your filters."}</td></tr>`,
      () => {
        $("#markets-body")
          .querySelectorAll("tr")
          .forEach((row) => {
            if (row.children.length !== MARKET_COLUMNS.length) return;
            [...row.children].forEach((cell, index) => {
              cell.dataset.marketColumn = MARKET_COLUMNS[index][0];
            });
          });
        applyColumns();
        document.querySelectorAll("[data-market-detail]").forEach((node) => {
          node.open = openedDetails.has(node.dataset.marketDetail);
        });
      },
    );
  }
  function initialize() {
    const { stocks, chains } = getState();
    $("#market-chain").innerHTML =
      '<option value="all">All networks</option>' +
      chains
        .map(
          (c) => `<option value="${escape(c.id)}">${escape(c.label)}</option>`,
        )
        .join("");
    $("#market-issuer").innerHTML =
      '<option value="all">All issuers</option>' +
      [
        ...new Map(
          stocks.flatMap((s) =>
            s.products.map((p) => [p.issuer, provider(p).name]),
          ),
        ),
      ]
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(
          ([id, name]) =>
            `<option value="${escape(id)}">${escape(name)}</option>`,
        )
        .join("");
    render();
    if (!$("#markets-page").hidden) scheduleDetails({ immediate: true });
  }
  setupControls();
  $("#market-search").addEventListener("input", () => {
    currentPage = 1;
    changed();
  });
  for (const id of ["market-type", "market-chain", "market-issuer"])
    $("#" + id).addEventListener("change", () => {
      currentPage = 1;
      changed();
    });
  $("#market-sort").addEventListener("change", () => {
    sort = $("#market-sort").value;
    currentPage = 1;
    changed();
  });
  $("#market-watchlist").addEventListener("click", () => {
    savedOnly = !savedOnly;
    currentPage = 1;
    changed();
  });
  $("#markets-page").addEventListener("click", (e) => {
    const order = e.target.closest("[data-market-sort]"),
      open = e.target.closest("[data-open-stock]"),
      versions = e.target.closest("[data-open-versions]"),
      compare = e.target.closest("[data-stock-compare]"),
      save = e.target.closest("[data-market-save]");
    if (order) {
      sort = order.dataset.marketSort;
      currentPage = 1;
      changed();
    }
    if (open) {
      e.preventDefault();
      onSelect(open.dataset.openStock);
    }
    if (versions) {
      e.preventDefault();
      (onCompareVersions || onSelect)(versions.dataset.openVersions);
    }
    if (compare) {
      const id = compare.dataset.stockCompare,
        current = canonicalSelection(getComparison(), getState().stocks);
      if (current.includes(id))
        onCompareChange(current.filter((value) => value !== id));
      else if (current.length < 5) onCompareChange([...current, id]);
      else
        $("#market-compare-status").textContent =
          "Choose up to five stocks. Remove one to add another.";
      render();
    }
    if (save) {
      onSave(save.dataset.marketSave);
      changed();
    }
  });
  $("#market-choose-compare").addEventListener("click", () =>
    onChooseCompare(getComparison()),
  );
  $("#market-compare-open").addEventListener("click", () =>
    onCompareAssets(getComparison()),
  );
  $("#market-compare-clear").addEventListener("click", () => {
    onCompareChange([]);
    $("#market-compare-status").textContent = "";
    render();
  });
  $("#market-prev").addEventListener("click", () => {
    currentPage--;
    changed();
    $("#markets-table").scrollIntoView({ block: "start" });
  });
  $("#market-next").addEventListener("click", () => {
    currentPage++;
    changed();
    $("#markets-table").scrollIntoView({ block: "start" });
  });
  $("#market-refresh").addEventListener("click", () =>
    refreshMarketPage(
      () => onRefresh(false),
      () => scheduleDetails({ immediate: true, force: true }),
      (error) => {
        $("#market-data-warning").textContent =
          error.message || "Market refresh failed.";
        $("#market-data-warning").hidden = false;
      },
    ),
  );
  $("#market-next-data").addEventListener("click", () => onRefresh(true));
  $("#market-fundamentals").addEventListener("click", () =>
    scheduleDetails({ immediate: true, force: true }),
  );
  $("#market-export").addEventListener("click", () => {
    const now = Date.now(),
      prices = new Map(
        currentRows.map((s) => [
          s.id,
          marketExportPrices(details.get(s.id), now),
        ]),
      ),
      observed = (at) =>
        typeof at === "number" ? new Date(at).toISOString() : at;
    const text = csvText(currentRows, [
      ["Stock", (s) => s.ticker],
      ["Asset ID", (s) => s.id],
      ["Listed price USD", (s) => prices.get(s.id).listedPrice],
      ["Listed observed", (s) => observed(prices.get(s.id).listedAt)],
      ["Tokenized price USD", (s) => s.market?.price],
      ["Onchain per share USD", (s) => prices.get(s.id).onchainPrice],
      ["Onchain premium percent", (s) => prices.get(s.id).premium],
      ["Onchain price basis", (s) => prices.get(s.id).basis],
      ["Onchain observed", (s) => observed(prices.get(s.id).onchainAt)],
      ["24h change percent", (s) => s.market?.change24h],
      ["24h turnover percent", (s) => marketTurnover(s.market)],
      ["Tokenized cap USD", (s) => s.market?.marketCap],
      ["Tokenized volume USD", (s) => s.market?.volume24h],
      ["Versions", (s) => s.products.length],
      [
        "Networks",
        (s) =>
          [
            ...new Set(
              s.products.flatMap((p) => p.deployments.map((d) => d.chain)),
            ),
          ].join("; "),
      ],
      ["Source observed", (s) => s.market?.updatedAt],
    ]);
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv" })),
      link = document.createElement("a");
    link.href = url;
    link.download = "stocklens-markets.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  setInterval(() => {
    if (!$("#markets-page").hidden && !document.hidden) render();
  }, 15000);
  setInterval(() => {
    if (!$("#markets-page").hidden && !document.hidden)
      scheduleDetails({ immediate: true });
  }, 60000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleDetails({ immediate: true });
  });
  return {
    initialize,
    render,
    show,
    ingestReference: (id, reference) => details.ingestReference(id, reference),
    getDetails: (id) => details.get(id),
    ingestDetails: (id, row) => details.ingestDetails(id, row),
  };
}

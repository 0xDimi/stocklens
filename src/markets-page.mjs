import {
  selectMarketRows,
  createMarketDetailsLoader,
  observedPremiumState,
  companyMetricState,
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
import { listedDate } from "./reference-view.mjs";
import { canonicalSelection } from "./asset-comparison-model.mjs";
const signed = (v) =>
  Number.isFinite(v) ? `${v > 0 ? "+" : ""}${number(v)}%` : "—";
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
export function createMarketsPage({
  getState,
  getMarkets,
  getMarketState,
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
  });
  let currentRows = [];
  const openedDetails = new Set();
  function rows() {
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
      },
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
      p = entry?.spotPremium || entry?.premium,
      observed = observedPremiumState(p);
    if (observed) {
      const spot = !!entry.spotPremium,
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
        `Pool observed ${stamp(p.priceAt)}; listed reference ${listedDate(entry.reference)}.`,
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
      reference = entry?.reference;
    if (Number.isFinite(reference?.price))
      return `<strong>${usd(reference.price)}</strong><small>${reference.priceStale ? "Older · " : ""}${reference.priceSession === "Closed" ? "Close · " : ""}${escape(listedDate(reference))}</small>${disclosure(reference.exchange || "Listed source", reference.priceStale ? reference.staleReason || "The previous dated price is retained." : "Listed-security observation; separate from tokenized prices.", sourceLink(reference.source, "Listed source", stock.id + ":listed:source"), stock.id + ":listed")}`;
    return `—<small>${!entry || entry.status === "loading" ? "Loading…" : "Not supplied"}</small>`;
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
        if (!$("#markets-page").hidden && !getMarketState().screenBusy)
          details.load(
            visibleRows().map((s) => s.id),
            { force },
          );
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
    const loading = visible.filter(
        (s) => details.get(s.id)?.status === "loading",
      ).length,
      failed = visible.filter(
        (s) => details.get(s.id)?.status === "error",
      ).length,
      loaded = visible.filter(
        (s) => details.get(s.id)?.status === "ready",
      ).length;
    $("#market-fundamentals").disabled = loading > 0 || !visible.length;
    $("#market-fundamentals").textContent = loading
      ? "Loading page data…"
      : "Refresh page data";
    $("#market-company-status").textContent = loading
      ? `${loaded} of ${visible.length} rows loaded · ${loading} loading. Public sources may take up to 40 seconds per batch.`
      : failed
        ? `${failed} row requests failed. Expand a cell for the reason; refresh to retry.`
        : loaded
          ? `Page data loaded automatically. Expand a cell for source, time and missing-value reasons. P/E uses the stated fiscal year.`
          : "Company data and indicative buy premiums load automatically for this page.";
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
          return `<tr><td><div class="market-asset"><button class="market-compare-toggle" data-market-focus="${escape(s.id)}:compare" data-stock-compare="${escape(s.id)}" aria-label="${compared.includes(s.id) ? "Remove" : "Add"} ${escape(s.name)} ${compared.includes(s.id) ? "from" : "to"} stock comparison" aria-pressed="${compared.includes(s.id)}">${compared.includes(s.id) ? "✓" : "+"}</button><button class="market-save" data-market-focus="${escape(s.id)}:save" data-market-save="${escape(s.id)}" aria-label="${saved.has(s.id) ? "Unsave" : "Save"} ${escape(s.name)}" aria-pressed="${saved.has(s.id)}">${saved.has(s.id) ? "★" : "☆"}</button><a data-market-focus="${escape(s.id)}:asset" href="/?page=stock&amp;stock=${encodeURIComponent(s.id)}" data-open-stock="${escape(s.id)}">${stockLogo(s, m?.image)}<span><strong>${escape(s.ticker)}</strong><small>${escape(s.name)}</small></span></a></div></td><td>${listedPriceCell(s)}</td><td><strong>${usd(m?.price)}</strong><small>${m?.updatedAt ? stamp(m.updatedAt) : "Not observed"}</small></td><td><span class="market-change ${m?.change24h < 0 ? "negative" : m?.change24h > 0 ? "positive" : ""}">${signed(m?.change24h)}</span></td><td>${premiumCell(s)}</td><td>${compact(m?.marketCap)}</td><td>${compact(m?.volume24h)}</td><td><span class="logo-stack" title="${escape(networks.map((id) => chains.find((c) => c.id === id)?.label || id).join(", "))}">${networks
            .slice(0, 3)
            .map((id) => chainLogo(id))
            .join(
              "",
            )}<span>${networks.length || "—"}</span></span></td><td><a class="version-link" data-market-focus="${escape(s.id)}:versions" href="/?stock=${encodeURIComponent(s.id)}" data-open-versions="${escape(s.id)}">${s.products.length || "Check"}${s.products.length ? " →" : ""}</a><small title="${escape(issuers.map((p) => provider(p).name).join(", "))}">${issuers.length} issuers</small></td><td>${companyCell(s, "marketCap")}</td><td>${companyCell(s, "pe")}</td></tr>`;
        })
        .join("") ||
        '<tr><td colspan="11" class="empty-results">No assets match. Clear the search or change your filters.</td></tr>',
      () => {
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
    const text = csvText(currentRows, [
      ["Stock", (s) => s.ticker],
      ["Asset ID", (s) => s.id],
      ["Listed price USD", (s) => details.get(s.id)?.reference?.price],
      [
        "Listed observed",
        (s) =>
          details.get(s.id)?.reference?.priceDate ||
          details.get(s.id)?.reference?.at,
      ],
      ["Tokenized price USD", (s) => s.market?.price],
      ["Pool premium percent", (s) => details.get(s.id)?.spotPremium?.value],
      ["24h change percent", (s) => s.market?.change24h],
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
  };
}

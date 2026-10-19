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
const signed = (v) =>
  Number.isFinite(v) ? `${v > 0 ? "+" : ""}${number(v)}%` : "—";
export function createMarketsPage({
  getState,
  getMarkets,
  getMarketState,
  onSelect,
  onSave,
  onRefresh,
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
  const sourceLink = (url, label) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password)
        return escape(label);
      return `<a href="${escape(parsed.href)}" target="_blank" rel="noopener noreferrer">${escape(label)} ↗</a>`;
    } catch {
      return escape(label);
    }
  };
  function disclosure(label, text, links = "", key = "") {
    return `<details data-market-detail="${escape(key)}" title="${escape(text)}"><summary><small>${escape(label)}</small></summary><small>${escape(text)}${links ? " · " + links : ""}</small></details>`;
  }
  function premiumCell(stock) {
    const entry = details.get(stock.id),
      p = entry?.premium,
      observed = observedPremiumState(p);
    if (observed) {
      const budget = Number.isFinite(p.budget)
          ? `${compact(p.budget)} buy`
          : "Observed",
        impact = Number.isFinite(p.priceImpactPct) ? p.priceImpactPct : null,
        label = `${impact >= 5 ? "High price impact · " + number(impact) + "% · " : ""}${observed.stale ? "Last observed" : budget}${p.referenceBasis === "last-close" ? " vs close" : ""} · ${stamp(p.priceAt)}`,
        reason = [
          p.basis,
          impact != null
            ? `Venue-reported price impact: ${number(impact)}%.${impact >= 5 ? " This order materially moves the pool price; the premium includes that impact." : ""}`
            : "Venue price impact not supplied.",
          `${p.symbol || "Token"} · ${p.chain || "Network not supplied"}`,
          `Cost per equivalent share ${usd(p.price)}; ${number(p.sharesPerToken, 6)} listed shares per token.`,
          `Token observed ${stamp(p.priceAt)}; Nasdaq reference ${stamp(p.referenceAt)} (minute precision); retrieved ${stamp(p.retrievedAt)}.`,
          observed.stale
            ? "Observation expired; refresh for a current comparison."
            : "",
          entry.status === "loading" ? "Refreshing…" : "",
          entry.status === "error" ? `Refresh failed: ${entry.error}` : "",
          entry.premiumReason || "",
        ]
          .filter(Boolean)
          .join(" ");
      return `<span>${signed(observed.value)}</span>${disclosure(
        label,
        reason,
        sourceLink(p.source, "Price source") +
          " · " +
          sourceLink(p.conversionSource, "Share conversion"),
        stock.id + ":premium",
      )}`;
    }
    if (!entry || entry.status === "loading") return "—<small>Loading…</small>";
    const reason =
      entry.status === "error"
        ? entry.error
        : entry.premiumReason ||
          "No comparable price and verified share conversion were supplied.";
    return `—${disclosure(entry.status === "error" ? "Load failed" : "Unavailable", reason, "", stock.id + ":premium")}`;
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
    return `${label}${disclosure(note, reason, r ? sourceLink(source, "Nasdaq") : "", stock.id + ":" + field)}`;
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
    $("#markets-body").innerHTML =
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
          return `<tr><td><div class="market-asset"><button class="market-save" data-market-save="${escape(s.id)}" aria-label="${saved.has(s.id) ? "Unsave" : "Save"} ${escape(s.name)}" aria-pressed="${saved.has(s.id)}">${saved.has(s.id) ? "★" : "☆"}</button><a href="/?stock=${encodeURIComponent(s.id)}" data-open-stock="${escape(s.id)}">${stockLogo(s, m?.image)}<span><strong>${escape(s.ticker)}</strong><small>${escape(s.name)}</small></span></a></div></td><td><strong>${usd(m?.price)}</strong><small>${m?.updatedAt ? stamp(m.updatedAt) : "Not observed"}</small></td><td><span class="market-change ${m?.change24h < 0 ? "negative" : m?.change24h > 0 ? "positive" : ""}">${signed(m?.change24h)}</span></td><td>${premiumCell(s)}</td><td>${compact(m?.marketCap)}</td><td>${compact(m?.volume24h)}</td><td><span class="logo-stack" title="${escape(networks.map((id) => chains.find((c) => c.id === id)?.label || id).join(", "))}">${networks
            .slice(0, 3)
            .map((id) => chainLogo(id))
            .join(
              "",
            )}<span>${networks.length || "—"}</span></span></td><td><a class="version-link" href="/?stock=${encodeURIComponent(s.id)}" data-open-stock="${escape(s.id)}">${s.products.length || "Check"}${s.products.length ? " →" : ""}</a><small title="${escape(issuers.map((p) => provider(p).name).join(", "))}">${issuers.length} issuers</small></td><td>${companyCell(s, "marketCap")}</td><td>${companyCell(s, "pe")}</td></tr>`;
        })
        .join("") ||
      '<tr><td colspan="10" class="empty-results">No assets match. Clear the search or change your filters.</td></tr>';
    document.querySelectorAll("[data-market-detail]").forEach((node) => {
      node.open = openedDetails.has(node.dataset.marketDetail);
    });
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
    if (save) {
      onSave(save.dataset.marketSave);
      changed();
    }
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
  $("#market-refresh").addEventListener("click", () => {
    onRefresh(false);
    scheduleDetails({ immediate: true, force: true });
  });
  $("#market-next-data").addEventListener("click", () => onRefresh(true));
  $("#market-fundamentals").addEventListener("click", () =>
    scheduleDetails({ immediate: true, force: true }),
  );
  $("#market-export").addEventListener("click", () => {
    const text = csvText(currentRows, [
      ["Stock", (s) => s.ticker],
      ["Asset ID", (s) => s.id],
      ["Tokenized price USD", (s) => s.market?.price],
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

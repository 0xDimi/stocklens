import { selectMarketRows, premium, needsReference } from "./market-model.mjs";
import {
  escape,
  usd,
  compact,
  number,
  stamp,
  provider,
  csvText,
} from "./views.mjs";
import { stockLogo, chainLogo, issuerLogo } from "./brands.mjs";
const signed = (v) =>
  Number.isFinite(v) ? `${v > 0 ? "+" : ""}${number(v)}%` : "—";
export function createMarketsPage({
  getState,
  getMarkets,
  getMarketState,
  getQuotes,
  onSelect,
  onSave,
  onRefresh,
}) {
  const $ = (s) => document.querySelector(s);
  let currentPage = 1,
    sort = "volume",
    savedOnly = false,
    referenceBusy = false,
    referenceSequence = 0;
  const references = new Map();
  let currentRows = [];
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
  function quotePremium(id) {
    const q = getQuotes(id),
      ref = references.get(id) || q?.reference;
    const best = (q?.rows || [])
      .filter(
        (r) => r.status === "quoted" && r.rankable && r.expiresAt > Date.now(),
      )
      .sort((a, b) => a.effectivePrice - b.effectivePrice)[0];
    if (!best || ref?.stale) return null;
    const value = premium(
      {
        price: best.effectivePrice,
        sharesPerToken: 1,
        conversionVerified: true,
        currency: "USD",
        at: best.fetchedAt,
      },
      ref,
    );
    return value == null
      ? null
      : {
          value,
          budget: best.inputQuantity,
          token: best.symbol,
          chain: best.chainLabel,
          expiresAt: best.expiresAt,
        };
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
    $("#market-fundamentals").disabled = referenceBusy || !visible.length;
    $("#market-fundamentals").textContent = referenceBusy
      ? "Loading Nasdaq data…"
      : "Load company data";
    document
      .querySelectorAll("[data-market-sort]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", b.dataset.marketSort === sort),
      );
    $("#market-sort").value = sort;
    $("#markets-body").innerHTML =
      visible
        .map((s) => {
          const m = s.market,
            r = references.get(s.id),
            p = quotePremium(s.id),
            networks = [
              ...new Set(
                s.products.flatMap((p) => p.deployments.map((d) => d.chain)),
              ),
            ],
            issuers = [
              ...new Map(s.products.map((p) => [p.issuer, p])).values(),
            ];
          return `<tr><td><div class="market-asset"><button class="market-save" data-market-save="${escape(s.id)}" aria-label="${saved.has(s.id) ? "Unsave" : "Save"} ${escape(s.name)}" aria-pressed="${saved.has(s.id)}">${saved.has(s.id) ? "★" : "☆"}</button><a href="/?stock=${encodeURIComponent(s.id)}" data-open-stock="${escape(s.id)}">${stockLogo(s, m?.image)}<span><strong>${escape(s.ticker)}</strong><small>${escape(s.name)}</small></span></a></div></td><td><strong>${usd(m?.price)}</strong><small>${m?.updatedAt ? stamp(m.updatedAt) : "Not observed"}</small></td><td><span class="market-change ${m?.change24h < 0 ? "negative" : m?.change24h > 0 ? "positive" : ""}">${signed(m?.change24h)}</span></td><td data-premium-expires="${p?.expiresAt || ""}" title="${p ? escape(`${p.token} on ${p.chain} · ${number(p.budget)} USDC order, before gas; USDC assumed $1`) : "Compare a supported buy quote. A current Nasdaq reference and verified share conversion are required."}">${p ? signed(p.value) : "—"}</td><td>${compact(m?.marketCap)}</td><td>${compact(m?.volume24h)}</td><td><span class="logo-stack" title="${escape(networks.map((id) => chains.find((c) => c.id === id)?.label || id).join(", "))}">${networks
            .slice(0, 3)
            .map((id) => chainLogo(id))
            .join(
              "",
            )}<span>${networks.length || "—"}</span></span></td><td><a class="version-link" href="/?stock=${encodeURIComponent(s.id)}" data-open-stock="${escape(s.id)}">${s.products.length || "Check"}${s.products.length ? " →" : ""}</a><small title="${escape(issuers.map((p) => provider(p).name).join(", "))}">${issuers.length} issuers</small></td><td>${compact(r?.marketCap)}<small>${r ? "Nasdaq" : references.has(s.id) ? "Unavailable" : "Not loaded"}</small></td><td>${Number.isFinite(r?.pe) ? number(r.pe) + "×" : "—"}</td></tr>`;
        })
        .join("") ||
      '<tr><td colspan="10" class="empty-results">No assets match. Clear the search or change your filters.</td></tr>';
  }
  async function loadReferences() {
    if (referenceBusy) return;
    referenceBusy = true;
    const seq = ++referenceSequence;
    const ids = rows()
      .slice((currentPage - 1) * 25, currentPage * 25)
      .filter((s) => needsReference(references.get(s.id)))
      .map((s) => s.id);
    render();
    try {
      if (!ids.length) {
        $("#market-company-status").textContent =
          "Company references for this page are current. Missing fields are not estimated.";
        return;
      }
      const response = await fetch(
          "/api/fundamentals?" + new URLSearchParams({ ids: ids.join(",") }),
        ),
        data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Nasdaq source unavailable");
      if (seq !== referenceSequence) return;
      (data.rows || []).forEach((r) => references.set(r.id, r.reference));
      $("#market-company-status").textContent =
        `${data.rows.filter((r) => r.reference).length} listed-stock references loaded. P/E is shown only when supplied by Nasdaq.`;
    } catch (e) {
      $("#market-company-status").textContent =
        e.message + " · Retry Load company data.";
    } finally {
      referenceBusy = false;
      render();
    }
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
  }
  $("#market-search").addEventListener("input", () => {
    currentPage = 1;
    render();
  });
  for (const id of ["market-type", "market-chain", "market-issuer"])
    $("#" + id).addEventListener("change", () => {
      currentPage = 1;
      render();
    });
  $("#market-sort").addEventListener("change", () => {
    sort = $("#market-sort").value;
    currentPage = 1;
    render();
  });
  $("#market-watchlist").addEventListener("click", () => {
    savedOnly = !savedOnly;
    currentPage = 1;
    render();
  });
  $("#markets-page").addEventListener("click", (e) => {
    const order = e.target.closest("[data-market-sort]"),
      open = e.target.closest("[data-open-stock]"),
      save = e.target.closest("[data-market-save]");
    if (order) {
      sort = order.dataset.marketSort;
      currentPage = 1;
      render();
    }
    if (open) {
      e.preventDefault();
      onSelect(open.dataset.openStock);
    }
    if (save) {
      onSave(save.dataset.marketSave);
      render();
    }
  });
  $("#market-prev").addEventListener("click", () => {
    currentPage--;
    render();
    $("#markets-table").scrollIntoView({ block: "start" });
  });
  $("#market-next").addEventListener("click", () => {
    currentPage++;
    render();
    $("#markets-table").scrollIntoView({ block: "start" });
  });
  $("#market-refresh").addEventListener("click", () => onRefresh(false));
  $("#market-next-data").addEventListener("click", () => onRefresh(true));
  $("#market-fundamentals").addEventListener("click", loadReferences);
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
    if ($("#markets-page").hidden || document.hidden) return;
    document.querySelectorAll("[data-premium-expires]").forEach((cell) => {
      const expires = Number(cell.dataset.premiumExpires);
      if (expires > 0 && expires <= Date.now()) {
        cell.textContent = "—";
        cell.title = "Quote expired. Open the comparison to refresh.";
        cell.removeAttribute("data-premium-expires");
      }
    });
  }, 1000);
  return {
    initialize,
    render,
    ingestReference: (id, reference) => {
      if (reference) references.set(id, reference);
    },
  };
}

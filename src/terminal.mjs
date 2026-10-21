import { termComparisonRows } from "./product-terms.mjs";
import {
  escape,
  usd,
  compact,
  number,
  stamp,
  provider,
  external,
} from "./views.mjs";
import { stockLogo, issuerLogo, chainLogo } from "./brands.mjs";
import { mountChart } from "./chart.mjs";
import { findStocks } from "./model.mjs";
import { createMarketFeed } from "./market-feed.mjs";
import { priceComparison } from "./reference-view.mjs";

export function toggleCompare(ids, id) {
  return ids.includes(id)
    ? ids.filter((x) => x !== id)
    : ids.length < 3
      ? [...ids, id]
      : ids;
}
export function sortUniverse(rows, markets, sort = "volume") {
  return [...rows].sort((a, b) => {
    if (sort === "name") return a.ticker.localeCompare(b.ticker);
    const key =
      { volume: "volume24h", price: "price", change: "change24h" }[sort] ||
      "volume24h";
    const av = markets.get(a.id)?.[key],
      bv = markets.get(b.id)?.[key];
    if (!Number.isFinite(av))
      return Number.isFinite(bv) ? 1 : a.ticker.localeCompare(b.ticker);
    if (!Number.isFinite(bv)) return -1;
    return sort === "price" ? av - bv : bv - av;
  });
}
export function parseWatchlist(text, knownIds) {
  const data = JSON.parse(text);
  if (
    !data ||
    data.version !== 1 ||
    !Array.isArray(data.assets) ||
    data.assets.length > 5000 ||
    data.assets.some(
      (id) => typeof id !== "string" || !/^[A-Za-z0-9:.-]{1,100}$/.test(id),
    )
  )
    throw new Error("Choose a Stocklens watchlist JSON export (version 1).");
  return [...new Set(data.assets)].filter((id) => knownIds.has(id));
}
export function historyQuery(stockId, pool, range) {
  const query = new URLSearchParams({
    stock: stockId,
    pool: pool.id,
    range,
    chain: pool.chain,
  });
  if (pool.address && pool.historyScope !== "stock")
    query.set("token", pool.address);
  return query;
}
export function marketWarnings(data) {
  if (Object.hasOwn(data, "marketWarning")) {
    if (!data.stale && !data.marketWarning) return [];
    if (
      /rate.?limit/i.test(data.marketWarning || "") ||
      data.refreshState === "rate-limited"
    )
      return [
        "Some prices are delayed by CoinGecko’s rate limit. Saved prices show their original timestamps.",
      ];
    if (
      data.refreshState === "refreshing" &&
      !/failed|unavailable|delayed/i.test(data.marketWarning || "")
    )
      return ["Some prices are refreshing. Each asset shows its last update."];
    return [
      "Some price updates are unavailable. Saved prices show their original timestamps.",
    ];
  }
  return [
    ...(data.warnings || []).filter((w) =>
      /CoinGecko|Last successful|stale|unavailable|rate limit/i.test(w),
    ),
    data.warning,
    data.stale
      ? data.refreshState === "refreshing"
        ? "Saved market prices are visible while CoinGecko is refreshing."
        : "Cached market observations retained with their original timestamps."
      : "",
  ].filter(Boolean);
}
export function screenerPages(loaded, nextPage = null) {
  return nextPage
    ? [nextPage]
    : loaded.length
      ? [...loaded].sort((a, b) => a - b)
      : [1];
}
const signed = (v) =>
  Number.isFinite(v) ? `${v > 0 ? "+" : ""}${number(v)}%` : "—";
const polarity = (v) =>
  Number.isFinite(v) ? (v < 0 ? "negative" : v > 0 ? "positive" : "") : "";
const keyFor = (p) => p.coinId || `${p.issuer}:${p.symbol}`;
export function createTerminal({
  getState,
  selectStock,
  setView,
  refresh,
  onUniverseUpdate,
  onWatchlistChange,
  onMarketsUpdate = () => {},
}) {
  const $ = (s) => document.querySelector(s);
  const priceDetails = new Map();
  let marketStorage;
  try {
    marketStorage = localStorage;
  } catch {}
  const loadMarketPage = createMarketFeed({ storage: marketStorage });
  let markets = new Map(),
    marketPages = new Map(),
    asset = null,
    pools = [],
    historyData = null,
    range = "1d",
    chartSequence = 0,
    chartAbort = null,
    shortlist = [],
    productRows = [],
    screenAt = null,
    screenWarning = "",
    screenPage = 1,
    screenNext = null,
    poolWarning = "",
    historyWarning = "",
    paletteIndex = 0,
    paletteResults = [];
  let poolAbort = null,
    screenBusy = false,
    poolLoading = false,
    poolSequence = 0,
    poolsLoadedFor = null,
    historyLoading = false;
  const statusText = (data) =>
    [
      ...(data.warnings || []),
      data.warning,
      data.stale ? "Cached observation after a failed source refresh." : "",
    ]
      .filter(Boolean)
      .join(" ");
  function universe(rows, limit, saved) {
    const sorted = sortUniverse(rows, markets, $("#universe-sort").value);
    return (
      sorted
        .slice(0, limit)
        .map((s) => {
          const m = markets.get(s.id);
          return `<button class="stock-option ${getState().selected?.id === s.id ? "selected" : ""}" data-stock="${escape(s.id)}" aria-pressed="${getState().selected?.id === s.id}">${stockLogo(s, m?.image)}<span class="asset-symbol"><b>${escape(s.ticker)}</b><small>${escape(s.name)}</small></span><span class="asset-price"><b>${usd(m?.price)}</b><small class="${polarity(m?.change24h)}">${signed(m?.change24h)}${saved.has(s.id) ? " ★" : ""}</small></span></button>`;
        })
        .join("") +
      (rows.length > limit
        ? '<button id="load-more" class="text-button">Load more assets ↓</button>'
        : "")
    );
  }
  function renderMarket() {
    if (!asset) return;
    const m = markets.get(asset.id),
      detail = priceDetails.get(asset.id);
    $("#asset-metrics").innerHTML = priceComparison({
      market: m,
      ...detail,
      loading: !detail,
    });
    renderInspector();
  }
  async function screener(next = false) {
    if (screenBusy || (next && !screenNext)) return;
    screenBusy = true;
    $("#load-markets").disabled = true;
    $("#market-status").textContent = "Updating markets";
    const requested = screenerPages(
      [...marketPages.keys()],
      next ? screenNext : null,
    );
    const warnings = [];
    try {
      for (const page of requested) {
        const data = await loadMarketPage(page);
        const observed = new Map(
          (data.rows || [])
            .filter((r) => r.market)
            .map((r) => [r.id, r.market]),
        );
        warnings.push(...marketWarnings(data));
        if (data.retrievedAt) marketPages.set(page, observed);
        screenPage = Math.max(page, ...marketPages.keys(), 1);
        if (page === screenPage) screenNext = data.scope?.nextPage;
        if (data.retrievedAt) screenAt = data.retrievedAt;
      }
      markets = new Map([...marketPages.values()].flatMap((map) => [...map]));
      screenWarning = [...new Set(warnings)].join(" ");
      $("#market-status").textContent = screenWarning
        ? "Some feeds need attention · see sources"
        : "Market prices from CoinGecko";
      $("#load-markets").hidden = !screenNext;
      $("#load-markets").textContent = "Load more reference prices";
      renderMarket();
      onUniverseUpdate();
      onMarketsUpdate();
      renderSources();
    } catch (error) {
      screenWarning = error.message;
      $("#market-status").textContent = "Market feed unavailable";
      renderSources();
    } finally {
      screenBusy = false;
      $("#load-markets").disabled = false;
    }
  }
  function renderSources() {
    $("#desk-source-state").innerHTML =
      `<div class="source-state"><span>CoinGecko · aggregate markets</span><b>${markets.size} assets observed</b><small>${screenAt ? stamp(screenAt) : "No observation yet"}</small></div><div class="source-state"><span>GeckoTerminal · pool history</span><b>${pools.length} matched pools</b><small>${historyData?.retrievedAt ? stamp(historyData.retrievedAt) : "No candles loaded"}</small></div>${[
        screenWarning,
        poolWarning,
        historyWarning,
      ]
        .filter(Boolean)
        .map((w) => `<p class="coverage-warning">${escape(w)}</p>`)
        .join(
          "",
        )}<p>Public feeds can be delayed, cached or partial. Tokenized reference prices are not exchange-listed stock prices.</p>`;
  }
  function renderInspector() {
    if (!asset) return;
    const m = markets.get(asset.id),
      issuers = [...new Set(asset.products.map((p) => p.issuer))];
    $("#security-profile").innerHTML =
      `<dl class="asset-facts"><div><dt>Asset identifier</dt><dd>${escape(asset.id)}</dd></div><div><dt>Type</dt><dd>${escape(asset.category)}</dd></div><div><dt>Issuer products</dt><dd>${asset.products.length} across ${issuers.length} issuers</dd></div><div><dt>Tokenized market cap</dt><dd>${compact(m?.marketCap)}</dd></div></dl>`;
    const products = shortlist
      .map(
        (id) =>
          productRows.find((p) => keyFor(p) === id) ||
          asset.products.find((p) => keyFor(p) === id),
      )
      .filter(Boolean);
    $("#compare-box").hidden = !products.length;
    $("#compare-count").textContent = `${products.length}/3`;
    $("#compare-open").disabled = products.length < 2;
    $("#compare-list").innerHTML = products.length
      ? products
          .map(
            (p) =>
              `<div class="shortlist-row"><span><b>${escape(p.symbol)}</b><small>${escape(provider(p).name)}</small></span><span>${usd(p.market?.price)}<button data-remove="${escape(keyFor(p))}" aria-label="Remove ${escape(p.symbol)} from comparison">×</button></span></div>`,
          )
          .join("")
      : "";
    document.querySelectorAll("[data-compare]").forEach((button) => {
      const active = shortlist.includes(button.dataset.compare);
      button.setAttribute("aria-pressed", active);
      button.textContent = active ? "✓ Selected" : "Select for terms";
    });
    renderSources();
  }
  async function loadHistory(poolId) {
    const pool = pools.find((p) => p.id === poolId);
    if (!pool || !asset) return;
    chartAbort?.abort();
    chartAbort = new AbortController();
    const seq = ++chartSequence,
      stockId = asset.id;
    historyLoading = true;
    $("#chart-pool").value = poolId;
    $("#chart-caption").textContent =
      `${pool.symbol} · ${pool.chainLabel} · ${pool.dex} · USD per token`;
    $("#chart-content").innerHTML =
      '<div class="chart-empty loading-message"><strong>Loading hourly candles…</strong><span>GeckoTerminal · exact-contract pool</span></div>';
    const query = historyQuery(stockId, pool, range);
    try {
      const response = await fetch("/api/history?" + query, {
          signal: chartAbort.signal,
        }),
        data = await response.json();
      if (seq !== chartSequence || asset.id !== stockId) return;
      if (!response.ok) throw new Error(data.error || "History unavailable");
      historyData = data;
      historyWarning = statusText(data);
      mountChart($("#chart-content"), data);
      if (historyWarning)
        $("#chart-content").insertAdjacentHTML(
          "beforeend",
          `<p class="chart-warning coverage-warning">${escape(historyWarning)}</p>`,
        );
      renderSources();
    } catch (error) {
      if (error.name === "AbortError" || seq !== chartSequence) return;
      historyWarning = error.message;
      if (historyData?.pool?.id === poolId) {
        range = historyData.range;
        document
          .querySelectorAll("[data-range]")
          .forEach((button) =>
            button.setAttribute("aria-pressed", button.dataset.range === range),
          );
        mountChart($("#chart-content"), historyData);
        $("#chart-content").insertAdjacentHTML(
          "beforeend",
          `<p class="chart-warning coverage-warning">Refresh failed. Showing the previous ${escape(range.toUpperCase())} observation: ${escape(error.message)}</p>`,
        );
      } else
        $("#chart-content").innerHTML =
          `<div class="chart-empty"><strong>History unavailable</strong><span>${escape(error.message)}</span><button id="retry-chart">Retry chart</button></div>`;
      renderSources();
    } finally {
      if (seq === chartSequence) historyLoading = false;
    }
  }
  function populatePools() {
    $("#chart-pool").innerHTML = pools
      .map(
        (p) =>
          `<option value="${escape(p.id)}">${escape(p.symbol)} · ${escape(p.chainLabel)} · ${escape(p.dex)} · ${escape(p.pair)} · ${escape(p.poolAddress.slice(0, 6))}</option>`,
      )
      .join("");
    $("#chart-pool").disabled = !pools.length;
  }
  function select(stock) {
    asset = stock;
    shortlist = [];
    productRows = [];
    pools = [];
    historyData = null;
    poolWarning = "";
    historyWarning = "";
    poolAbort?.abort();
    chartAbort?.abort();
    ++chartSequence;
    ++poolSequence;
    poolLoading = false;
    poolsLoadedFor = null;
    historyLoading = false;
    renderMarket();
    populatePools();
    $("#chart-caption").textContent = "EXACT-CONTRACT POOL / USD PER TOKEN";
    $("#chart-content").innerHTML =
      '<div class="chart-empty"><strong>Explore a token’s price history</strong><span>Choose a market pool to view hourly prices and volume.</span></div>';
    if ($("#chart-disclosure").open) discoverPools();
  }
  async function discoverPools() {
    if (!asset || poolLoading) return;
    poolLoading = true;
    poolAbort?.abort();
    poolAbort = new AbortController();
    const seq = ++poolSequence,
      id = asset.id;
    $("#chart-content").innerHTML =
      '<div class="chart-empty loading-message"><strong>Finding market pools…</strong><span>Matching issuer contracts on GeckoTerminal</span></div>';
    try {
      const response = await fetch(
          "/api/markets?" + new URLSearchParams({ stock: id, chain: "all" }),
          { signal: poolAbort.signal },
        ),
        data = await response.json();
      if (asset.id !== id || seq !== poolSequence) return;
      if (!response.ok || data.error)
        throw new Error(data.error || "Pool source unavailable");
      poolsLoadedFor = id;
      poolWarning = statusText(data);
      pools = (data.rows || [])
        .map((p) => ({ ...p, historyScope: "stock" }))
        .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));
      populatePools();
      renderSources();
      if (pools.length) loadHistory(pools[0].id);
      else
        $("#chart-content").innerHTML =
          '<div class="chart-empty"><strong>No matching pools in this source page</strong><span>Product and exchange data remain available below. Search coverage is partial.</span></div>';
    } catch (error) {
      if (
        error.name === "AbortError" ||
        asset.id !== id ||
        seq !== poolSequence
      )
        return;
      poolWarning = error.message;
      renderSources();
      $("#chart-content").innerHTML =
        `<div class="chart-empty"><strong>Pool source unavailable</strong><span>${escape(error.message)}</span><button id="retry-pools">Retry pools</button></div>`;
    } finally {
      if (seq === poolSequence) poolLoading = false;
    }
  }
  function ingest(view, data) {
    if (data.stock && asset?.id === data.stock.id) asset = data.stock;
    if (view === "products") productRows = data.rows || [];
    if (view === "details" && asset)
      priceDetails.set(asset.id, { ...priceDetails.get(asset.id), ...data });
    renderMarket();
  }
  function compare() {
    const rows = shortlist
      .map(
        (id) =>
          productRows.find((p) => keyFor(p) === id) ||
          asset.products.find((p) => keyFor(p) === id),
      )
      .filter(Boolean);
    const field = (label, read) =>
      `<tr><th scope="row">${label}</th>${rows.map((p) => `<td>${read(p)}</td>`).join("")}</tr>`;
    $("#compare-content").innerHTML =
      `<h2>${escape(asset.ticker)} · Compare product terms</h2><p>Compare what each token represents: rights, dividends and exit rules. For prices at your order size, use Compare buy quotes.</p><p class="terms-scroll-hint">Swipe sideways to compare selected products. Row labels stay visible.</p><div class="table-scroll" tabindex="0" role="region" aria-label="Product terms comparison"><table class="comparison-matrix"><thead><tr><th>Attribute</th>${rows.map((p) => `<th><span class="token-cell">${issuerLogo(p)}${escape(p.symbol)}</span></th>`).join("")}</tr></thead><tbody>${field("Issuer", (p) => escape(provider(p).name))}${field("USD / token", (p) => usd(p.market?.price))}${field("Price observed", (p) => stamp(p.market?.updatedAt))}${termComparisonRows(
        rows,
      )
        .map(
          (row) =>
            `<tr><th scope="row">${escape(row.label)}</th>${row.values.map((term) => `<td><strong>${escape(term.value)}</strong>${term.detail || term.source ? `<details class="matrix-term-notes"><summary>Details &amp; source</summary>${term.detail ? `<small class="matrix-term-detail">${escape(term.detail)}</small>` : ""}${term.source ? external(term.source, "Source") : ""}</details>` : ""}</td>`).join("")}</tr>`,
        )
        .join(
          "",
        )}${field("Networks", (p) => `<div class="matrix-networks">${p.deployments.map((d) => `<span class="named-network">${chainLogo(d.chain)}${escape(getState().chains.find((c) => c.id === d.chain)?.label || d.chain)}</span>`).join("")}</div>`)}${field("Primary terms", (p) => external(provider(p).source, provider(p).sourceLabel))}</tbody></table></div>`;
    $("#compare-content").insertAdjacentHTML(
      "beforeend",
      `<div class="matrix-action"><button class="primary-button" data-action="quotes">Compare available buy quotes →</button><small>Compare supported routes for ${escape(asset.ticker)}. Filter by issuer or network on the next view.</small></div>`,
    );
    $("#compare-dialog").showModal();
  }
  function renderPalette() {
    const query = $("#command-input").value.trim();
    paletteResults = findStocks(getState().stocks, query).slice(0, 12);
    paletteIndex = Math.min(
      paletteIndex,
      Math.max(0, paletteResults.length - 1),
    );
    $("#command-results").innerHTML = paletteResults.length
      ? paletteResults
          .map(
            (s, i) =>
              `<button role="option" aria-selected="${i === paletteIndex}" id="command-option-${i}" data-command-stock="${escape(s.id)}"><b>${escape(s.ticker)}</b><span>${escape(s.name)}</span><small>${s.products.length} products</small></button>`,
          )
          .join("")
      : '<p class="empty-search">No matching security. Try a company, token, ticker or ISIN.</p>';
    $("#command-input").setAttribute(
      "aria-activedescendant",
      paletteResults.length ? "command-option-" + paletteIndex : "",
    );
    $('#command-results [aria-selected="true"]')?.scrollIntoView({
      block: "nearest",
    });
  }
  function openPalette() {
    if (!getState().stocks.length) return;
    $("#command-input").value = "";
    paletteIndex = 0;
    $("#command-dialog").showModal();
    renderPalette();
    $("#command-input").focus();
  }
  $("#command-open").addEventListener("click", openPalette);
  $("#command-input").addEventListener("input", () => {
    paletteIndex = 0;
    renderPalette();
  });
  $("#command-input").addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      paletteIndex = Math.max(
        0,
        Math.min(
          paletteResults.length - 1,
          paletteIndex + (e.key === "ArrowDown" ? 1 : -1),
        ),
      );
      renderPalette();
    }
    if (e.key === "Enter" && paletteResults[paletteIndex]) {
      e.preventDefault();
      $("#command-dialog").close();
      selectStock(paletteResults[paletteIndex].id);
    }
  });
  $("#command-results").addEventListener("click", (e) => {
    const button = e.target.closest("[data-command-stock]");
    if (button) {
      $("#command-dialog").close();
      selectStock(button.dataset.commandStock);
    }
  });
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openPalette();
      return;
    }
    if (
      e.target.closest("input,textarea,select,[contenteditable]") ||
      document.querySelector("dialog[open]") ||
      e.altKey ||
      e.metaKey ||
      e.ctrlKey
    )
      return;
    if (e.key === "/") {
      e.preventDefault();
      openPalette();
    }
    const views = ["products", "quotes", "terms", "markets", "venues"];
    if (/^[1-5]$/.test(e.key) && !$("#home-page").hidden)
      setView(views[Number(e.key) - 1]);
    if (e.key.toLowerCase() === "w" && !$("#home-page").hidden)
      $("#favorite")?.click();
    if (e.key.toLowerCase() === "r") refresh();
  });
  $("#universe-sort").addEventListener("change", onUniverseUpdate);
  $("#load-markets").addEventListener("click", () => screener(true));
  $("#chart-pool").addEventListener("change", () =>
    loadHistory($("#chart-pool").value),
  );
  $(".chart-range").addEventListener("click", (e) => {
    const b = e.target.closest("[data-range]");
    if (!b) return;
    range = b.dataset.range;
    document
      .querySelectorAll("[data-range]")
      .forEach((x) => x.setAttribute("aria-pressed", x === b));
    loadHistory($("#chart-pool").value);
  });
  $("#chart-content").addEventListener("click", (e) => {
    if (e.target.closest("#retry-chart")) loadHistory($("#chart-pool").value);
    if (e.target.closest("#retry-pools")) discoverPools();
  });
  $("#compare-open").addEventListener("click", compare);
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-compare],[data-remove]");
    if (b) {
      shortlist = toggleCompare(
        shortlist,
        b.dataset.compare || b.dataset.remove,
      );
      renderInspector();
    }
    if (e.target.closest('[data-action="quotes"]')) {
      e.target.closest("dialog")?.close();
      setView("quotes");
    }
  });
  $("#toggle-universe").addEventListener("click", () => {
    const open = document.body.classList.toggle("universe-open");
    $("#toggle-universe").setAttribute("aria-expanded", open);
  });
  $("#watchlist-import").addEventListener("click", () =>
    $("#watchlist-file").click(),
  );
  $("#watchlist-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 256000) throw new Error("Watchlist file exceeds 256 KB.");
      const state = getState(),
        ids = parseWatchlist(
          await file.text(),
          new Set(state.stocks.map((s) => s.id)),
        );
      const merged = new Set([...state.saved, ...ids]),
        added = merged.size - state.saved.size;
      localStorage.setItem("stocklens:saved", JSON.stringify([...merged]));
      ids.forEach((id) => state.saved.add(id));
      onWatchlistChange();
      $("#watchlist-status").textContent =
        `Imported ${added} new assets; ${ids.length} catalog matches.`;
    } catch (error) {
      $("#watchlist-status").textContent = "Import failed: " + error.message;
    } finally {
      event.target.value = "";
    }
  });
  $("#watchlist-export").addEventListener("click", () => {
    const blob = new Blob(
        [
          JSON.stringify(
            { version: 1, assets: [...getState().saved] },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "stocklens-watchlist.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $("#chart-disclosure").addEventListener("toggle", () => {
    if (!$("#chart-disclosure").open || !asset) return;
    if (poolsLoadedFor !== asset.id) discoverPools();
    else if (!historyData && !historyLoading && pools.length)
      loadHistory(pools[0].id);
  });
  setInterval(() => {
    if (
      !document.hidden &&
      !$("#home-page").hidden &&
      $("#chart-disclosure").open &&
      $("#chart-pool").value
    )
      loadHistory($("#chart-pool").value);
  }, 180000);
  setInterval(() => {
    if (!document.hidden) screener();
  }, 600000);
  return {
    universe,
    select,
    ingest,
    renderMarket,
    start: () => screener(),
    loadPool: (id, rows = []) => {
      poolAbort?.abort();
      ++poolSequence;
      poolLoading = false;
      poolsLoadedFor = asset.id;
      $("#chart-disclosure").open = true;
      for (const row of rows)
        if (!pools.some((p) => p.id === row.id)) pools.push(row);
      populatePools();
      loadHistory(id);
      $("#chart-disclosure").scrollIntoView({
        block: "start",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    },
    refreshChart: () => {
      if ($("#chart-disclosure").open) loadHistory($("#chart-pool").value);
    },
    getMarkets: () => markets,
    marketState: () => ({
      screenAt,
      screenWarning,
      screenBusy,
      screenNext,
      observed: markets.size,
    }),
    refreshMarkets: (next = false) => screener(next),
  };
}

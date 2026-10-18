import {
  escape,
  usd,
  compact,
  number,
  stamp,
  provider,
  external,
} from "./views.mjs";
import { mountChart } from "./chart.mjs";
import { findStocks } from "./model.mjs";

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
  return [
    ...(data.warnings || []).filter((w) =>
      /CoinGecko|Last successful|stale|unavailable|rate limit/i.test(w),
    ),
    data.warning,
    data.stale
      ? "Cached market observations retained after a failed source refresh."
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
function sparkline(values) {
  if (!values?.length) return "";
  const min = Math.min(...values),
    span = Math.max(...values) - min || 1;
  return `<svg class="sparkline" viewBox="0 0 90 24" aria-hidden="true"><polyline points="${values.map((v, i) => `${(i / (values.length - 1 || 1)) * 90},${22 - ((v - min) / span) * 20}`).join(" ")}"/></svg>`;
}
export function createTerminal({
  getState,
  selectStock,
  setView,
  refresh,
  onUniverseUpdate,
  onWatchlistChange,
}) {
  const $ = (s) => document.querySelector(s);
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
    quotes = [],
    screenAt = null,
    screenWarning = "",
    screenPage = 1,
    screenNext = null,
    poolWarning = "",
    historyWarning = "",
    paletteIndex = 0,
    paletteResults = [];
  let poolAbort = null,
    screenBusy = false;
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
          return `<button class="stock-option ${getState().selected?.id === s.id ? "selected" : ""}" data-stock="${escape(s.id)}" aria-pressed="${getState().selected?.id === s.id}"><span class="asset-symbol"><b>${escape(s.ticker)}</b><small>${escape(s.name)}</small></span><span class="asset-price"><b>${usd(m?.price)}</b><small class="${polarity(m?.change24h)}">${signed(m?.change24h)}${saved.has(s.id) ? " ★" : ""}</small></span></button>`;
        })
        .join("") +
      (rows.length > limit
        ? '<button id="load-more" class="text-button">Load more assets ↓</button>'
        : "")
    );
  }
  function renderMarket() {
    if (!asset) return;
    const m = markets.get(asset.id);
    $("#asset-metrics").innerHTML =
      `<div><small>Tokenized reference / USD</small><strong>${usd(m?.price)} <em class="${polarity(m?.change24h)}">${signed(m?.change24h)}</em></strong></div><div><small>24h volume</small><b>${compact(m?.volume24h)}</b></div><div><small>24h high / low</small><b>${usd(m?.high24h)} <span>/</span> ${usd(m?.low24h)}</b></div><div><small>Observation</small><b>${m?.updatedAt ? stamp(m.updatedAt) : "Not available"}</b></div>`;
    renderInspector();
  }
  function renderTape() {
    const rows = [...markets]
      .filter(([, m]) => m?.price > 0)
      .sort((a, b) => (b[1].volume24h || 0) - (a[1].volume24h || 0))
      .slice(0, 12);
    $("#market-tape").innerHTML = rows.length
      ? rows
          .map(([id, m]) => {
            const s = getState().stocks.find((s) => s.id === id);
            return `<button data-tape="${escape(id)}"><b>${escape(s?.ticker)}</b><span>${usd(m.price)}</span><span class="${polarity(m.change24h)}">${signed(m.change24h)}</span></button>`;
          })
          .join("")
      : '<span class="tape-empty">Awaiting CoinGecko tokenized market observations</span>';
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
        const response = await fetch("/api/screener?page=" + page),
          data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Market data unavailable");
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
      $("#market-status").textContent =
        `${markets.size} observed · ${screenWarning ? "check sources" : "public feeds"}`;
      $("#load-markets").hidden = !screenNext;
      $("#load-markets").textContent =
        `Load next market page (${screenNext || screenPage + 1})`;
      renderTape();
      renderMarket();
      onUniverseUpdate();
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
    $("#session-time").textContent =
      new Date().toLocaleTimeString([], { hour12: false }) + " LOCAL";
  }
  function renderInspector() {
    if (!asset) return;
    const m = markets.get(asset.id),
      issuers = [...new Set(asset.products.map((p) => p.issuer))];
    $("#security-profile").innerHTML =
      `<div class="inspector-title"><span>SECURITY PROFILE</span><b>${escape(asset.ticker)}</b></div><dl><dt>Security ID</dt><dd class="break">${escape(asset.id)}</dd><dt>Type</dt><dd>${escape(asset.category)}</dd><dt>Products</dt><dd>${asset.products.length}</dd><dt>Issuers</dt><dd>${issuers.length}</dd><dt>Chains</dt><dd>${new Set(asset.products.flatMap((p) => p.deployments.map((d) => d.chain))).size}</dd><dt>Tokenized market cap</dt><dd>${compact(m?.marketCap)}</dd></dl>${sparkline(m?.sparkline)}<small class="quiet">7D tokenized reference · CoinGecko</small>`;
    const products = shortlist
      .map(
        (id) =>
          productRows.find((p) => keyFor(p) === id) ||
          asset.products.find((p) => keyFor(p) === id),
      )
      .filter(Boolean);
    $("#compare-count").textContent = `${products.length}/3`;
    $("#compare-open").disabled = products.length < 2;
    $("#compare-list").innerHTML = products.length
      ? products
          .map(
            (p) =>
              `<div class="shortlist-row"><span><b>${escape(p.symbol)}</b><small>${escape(provider(p).name)}</small></span><span>${usd(p.market?.price)}<button data-remove="${escape(keyFor(p))}" aria-label="Remove ${escape(p.symbol)} from comparison">×</button></span></div>`,
          )
          .join("")
      : "<p>Select + Compare in a product row to inspect issuer rights side by side.</p>";
    document.querySelectorAll("[data-compare]").forEach((button) => {
      const active = shortlist.includes(button.dataset.compare);
      button.setAttribute("aria-pressed", active);
      button.textContent = button.classList.contains("compare-toggle")
        ? active
          ? "✓"
          : "+"
        : active
          ? "✓ Added"
          : "+ Compare";
    });
    const winner = quotes
      .filter((q) => q.rankable && q.expiresAt > Date.now())
      .sort((a, b) => a.effectivePrice - b.effectivePrice)[0];
    $("#execution-summary").innerHTML = winner
      ? `<span class="eyebrow">BEST QUOTED EXPOSURE</span><h3>${number(winner.equivalentShares, 4)} <small>eq. shares</small></h3><p>${escape(winner.symbol)} · ${escape(winner.chainLabel)}<br>${number(winner.effectivePrice)} USDC / eq. share</p><small>Before network costs · expires ${stamp(winner.expiresAt)}</small>`
      : '<span class="eyebrow">EXECUTION DESK</span><h3>Compare the output.</h3><p>Get size-specific quotes in USDC. Rank verified share exposure across supported routes.</p><button data-action="quotes">Open order quotes <span>↗</span></button>';
    renderSources();
  }
  async function loadHistory(poolId) {
    const pool = pools.find((p) => p.id === poolId);
    if (!pool || !asset) return;
    chartAbort?.abort();
    chartAbort = new AbortController();
    const seq = ++chartSequence,
      stockId = asset.id;
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
  async function select(stock) {
    asset = stock;
    shortlist = [];
    productRows = [];
    quotes = [];
    pools = [];
    historyData = null;
    poolWarning = "";
    historyWarning = "";
    poolAbort?.abort();
    poolAbort = new AbortController();
    chartAbort?.abort();
    ++chartSequence;
    renderMarket();
    populatePools();
    $("#chart-caption").textContent = "EXACT-CONTRACT POOL / USD PER TOKEN";
    $("#chart-content").innerHTML =
      '<div class="chart-empty loading-message"><strong>Locating tokenized markets…</strong><span>Matching issuer contracts on GeckoTerminal</span></div>';
    const id = stock.id;
    try {
      const response = await fetch(
          "/api/markets?" + new URLSearchParams({ stock: id, chain: "all" }),
          { signal: poolAbort.signal },
        ),
        data = await response.json();
      if (asset.id !== id) return;
      if (!response.ok || data.error)
        throw new Error(data.error || "Pool source unavailable");
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
      if (error.name === "AbortError" || asset.id !== id) return;
      poolWarning = error.message;
      renderSources();
      $("#chart-content").innerHTML =
        `<div class="chart-empty"><strong>Pool source unavailable</strong><span>${escape(error.message)}</span><button id="retry-pools">Retry pools</button></div>`;
    }
  }
  function ingest(view, data) {
    if (data.stock && asset?.id === data.stock.id) asset = data.stock;
    if (view === "products") productRows = data.rows || [];
    if (view === "quotes") quotes = data.rows || [];
    renderInspector();
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
      `<h2>${escape(asset.ticker)} / product comparison</h2><p>Raw token prices have different units. Compare share exposure in Order quotes.</p><div class="table-scroll"><table class="comparison-matrix"><thead><tr><th>Attribute</th>${rows.map((p) => `<th>${escape(p.symbol)}</th>`).join("")}</tr></thead><tbody>${field("Issuer", (p) => escape(provider(p).name))}${field("USD / token", (p) => usd(p.market?.price))}${field("Price observed", (p) => stamp(p.market?.updatedAt))}${field("Structure", (p) => escape(provider(p).structure))}${field("Holder rights", (p) => escape(provider(p).rights))}${field("Dividends", (p) => escape(provider(p).dividends))}${field("Exit & eligibility", (p) => escape(provider(p).exit))}${field("Networks", (p) => escape(p.deployments.map((d) => d.chain).join(", ")))}${field("Primary terms", (p) => external(provider(p).source, provider(p).sourceLabel))}</tbody></table></div>`;
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
    const views = ["products", "quotes", "markets", "venues", "terms"];
    if (/^[1-5]$/.test(e.key)) setView(views[Number(e.key) - 1]);
    if (e.key.toLowerCase() === "w") $("#favorite")?.click();
    if (e.key.toLowerCase() === "r") refresh();
  });
  $("#universe-sort").addEventListener("change", onUniverseUpdate);
  $("#market-tape").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tape]");
    if (b) selectStock(b.dataset.tape);
  });
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
    if (e.target.closest("#retry-pools")) select(asset);
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
    if (e.target.closest('[data-action="quotes"]')) setView("quotes");
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
  setInterval(() => {
    renderSources();
    if (quotes.some((q) => q.expiresAt && q.expiresAt <= Date.now())) {
      quotes = quotes.filter((q) => !q.expiresAt || q.expiresAt > Date.now());
      renderInspector();
    }
  }, 1000);
  setInterval(() => {
    if (!document.hidden && $("#chart-pool").value)
      loadHistory($("#chart-pool").value);
  }, 180000);
  setInterval(() => {
    if (!document.hidden) screener();
  }, 90000);
  return {
    universe,
    select,
    ingest,
    renderMarket,
    start: () => screener(),
    loadPool: (id, rows = []) => {
      for (const row of rows)
        if (!pools.some((p) => p.id === row.id)) pools.push(row);
      populatePools();
      loadHistory(id);
    },
    refreshChart: () => loadHistory($("#chart-pool").value),
    refreshMarkets: () => screener(),
  };
}

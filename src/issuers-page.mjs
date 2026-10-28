import {
  escape,
  compact,
  number,
  usd,
  stamp,
  provider,
  external,
  csvText,
} from "./views.mjs";
import { issuerLogo, stockLogo, chainLogo } from "./brands.mjs";
import {
  issuerLink,
  selectIssuers,
  issuerPercent,
  issuerExportColumns,
} from "./issuer-model.mjs";

const name = (row) => provider({ issuer: row.id, issuerName: row.name }).name;
const mark = (row) => issuerLogo({ issuer: row.id, issuerName: name(row) });
const signed = (value) =>
  Number.isFinite(value)
    ? `<span class="${value < 0 ? "negative" : "positive"}">${value > 0 ? "+" : ""}${issuerPercent(value)}</span>`
    : "—";
const count = (value) =>
  Number.isFinite(value) ? value.toLocaleString() : "—";
const shareBar = (value, label) =>
  `<svg class="issuer-bar" viewBox="0 0 100 4" preserveAspectRatio="none" role="img" aria-label="${escape(label)}"><rect width="100" height="4" class="issuer-bar-track"/><rect width="${Math.min(100, Math.max(0, value || 0))}" height="4" class="issuer-bar-value"/></svg>`;
const download = (rows, columns, filename) => {
  const url = URL.createObjectURL(
    new Blob([csvText(rows, columns)], { type: "text/csv;charset=utf-8;" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export function createIssuersPage({
  root,
  getChains,
  onNavigate,
  onCompare,
  fetcher = (...args) => fetch(...args),
}) {
  let data = null,
    selected = "",
    active = false,
    loading = false,
    error = null,
    poll = null,
    polls = 0;
  let landscapeAbort = null,
    assetAbort = null,
    assetSequence = 0,
    searchTimer = null;
  let query = "",
    network = "all",
    sort = "cap",
    assetQuery = "",
    assetNetwork = "all",
    assetType = "all",
    assetIncludeWrapped = false,
    assetPage = 1,
    assets = null,
    assetError = null,
    assetsLoading = false,
    paginationFocus = null;
  const chains = () => getChains() || [];
  const chainName = (id) => chains().find((c) => c.id === id)?.label || id;
  const row = () => data?.issuers.find((r) => r.id === selected);
  const compareHref = (id) =>
    escape(
      "/?" +
        new URLSearchParams({
          page: "comparison",
          stock: id,
          issuer: selected,
          view: "products",
          ...(assetIncludeWrapped ? { wrappers: "1" } : {}),
        }),
    );
  const link = (r) =>
    `<a href="${escape(issuerLink(r.id))}" data-issuer-open="${escape(r.id)}" class="issuer-identity">${mark(r)}<span><strong>${escape(name(r))}</strong><small>${escape(r.sourceName || provider({ issuer: r.id }).structure)}</small></span></a>`;
  const networksMarkup = (r) =>
    r.networks.length
      ? `<span class="issuer-network-marks">${r.networks
          .slice(0, 3)
          .map((n) => chainLogo(n.id, chainName(n.id)))
          .join("")}<span>${r.networks.length}</span></span>`
      : "—";
  const sourceNote = (r) =>
    r.market
      ? `${r.market.stale ? "Older report · " : ""}${stamp(r.market.sourceAt)}`
      : "Market report not available";
  const visible = () =>
    selectIssuers(
      (data?.issuers || []).map((r) => ({ ...r, name: name(r) })),
      { query, chain: network, sort },
    );
  const metrics = (totals) =>
    `<dl class="issuer-key-metrics"><div><dt>Reported token market cap</dt><dd>${compact(totals.marketCap)}</dd><small>${totals.reportingIssuers} of ${totals.issuerCount} issuers reporting</small></div><div><dt>Reported 24h volume</dt><dd>${compact(totals.volume24h)}</dd><small>${totals.volumeIssuers} issuers reporting · traded volume</small></div><div><dt>Mapped securities</dt><dd>${count(totals.assetCount)}</dd><small>Across ${totals.networkCount} networks · overlapping assets counted once${totals.unclassifiedAssetCount ? ` · ${totals.unclassifiedAssetCount} unclassified` : ""}</small></div></dl>`;
  const methodology = () =>
    `<details class="issuer-methodology"><summary>Sources & methodology</summary><div><h3>Market share</h3><p>${escape(data.coverage.marketBasis)} A missing report is not treated as zero. Share remains based on the full observed issuer universe when you filter this table.</p><h3>Coverage</h3><p>${escape(data.coverage.catalogBasis)} Wrappers are counted separately from native products. CoinGecko's issuer totals are not independently verified reserves, assets under custody or available trading liquidity.</p><h3>Freshness</h3><p>Market reports retain the provider's observation time. Refresh checks available reports and schedules paced updates when due; it does not bypass source rate limits. Reports older than 72 hours are excluded. ${data.coverage.staleIssuers ? `${data.coverage.staleIssuers} issuer reports are older than the six-hour refresh target.` : ""}</p><p>Catalog ${stamp(data.catalogAt)} · ${external("https://docs.coingecko.com/reference/rwas-issuers-id", "CoinGecko issuer data definitions")}</p><p>${external("https://tokenterminal.com/explorer/tokenized-assets/stocks", "Token Terminal research")} · ${external("https://app.rwa.xyz/stocks", "RWA.xyz research")} — external research sources; their metrics are not combined into these totals.</p></div></details>`;

  function ranking() {
    const target = root.querySelector("#issuer-ranking");
    if (!target) return;
    const rows = visible();
    target.innerHTML = `<p class="issuer-result-count" role="status">${rows.length} of ${data.issuers.length} issuers${network !== "all" ? ` · present on ${escape(chainName(network))} · issuer totals span all networks` : ""}</p><p class="issuer-scroll-hint">Swipe to compare all metrics →</p><div class="issuer-table-scroll" role="region" aria-label="Issuer market comparison" tabindex="0"><table class="issuer-table"><thead><tr><th scope="col">Issuer</th><th scope="col">Reported cap</th><th scope="col">Market share</th><th scope="col">Cap change · 24h</th><th scope="col">24h volume</th><th scope="col">Mapped assets</th><th scope="col">Networks</th><th scope="col"><span class="sr-only">Open data room</span></th></tr></thead><tbody>${rows.map((r) => `<tr><th scope="row">${link(r)}</th><td>${compact(r.market?.marketCap)}<small>${r.market ? `${count(r.market.reportedTokens)} source-listed tokens` : "Not reported"}</small></td><td class="issuer-share-cell">${issuerPercent(r.market?.share)}${r.market?.share != null ? shareBar(r.market.share, `${name(r)} share ${issuerPercent(r.market.share)}`) : ""}</td><td>${signed(r.market?.capChangePercent24h)}</td><td>${compact(r.market?.volume24h)}</td><td>${count(r.assetCount)}<small>${r.stocks} stocks · ${r.etfs} ETFs${r.unclassified ? ` · ${r.unclassified} unclassified` : ""}${r.wrappedProducts ? ` · ${r.wrappedProducts} wrapped` : ""}</small></td><td>${networksMarkup(r)}</td><td><a class="issuer-open-arrow" href="${escape(issuerLink(r.id))}" data-issuer-open="${escape(r.id)}" aria-label="Open ${escape(name(r))} data room">↗</a></td></tr>`).join("") || '<tr><td colspan="8">No issuers match. Clear the search or choose another network.</td></tr>'}</tbody></table></div>`;
  }

  function renderOverview() {
    document.title = "Issuers — Stocklens";
    const top = data.issuers.filter((r) => r.market?.share != null).slice(0, 5);
    root.querySelector("#issuer-content").innerHTML =
      `<header class="issuer-page-heading"><div><h1>Issuers</h1><p>The tokenized stock & ETF landscape.</p></div><div class="issuer-toolbar"><button data-issuer-refresh ${loading ? "disabled" : ""}>${loading ? "Refreshing…" : "↻ Refresh"}</button><button data-issuer-export>Export CSV ↗</button></div></header><section class="issuer-landscape" aria-label="Issuer market overview"><div class="issuer-share-overview"><div class="issuer-section-heading"><h2>Market share</h2><span>of reported token market cap</span></div>${top.length ? `<ol>${top.map((r) => `<li><a href="${escape(issuerLink(r.id))}" data-issuer-open="${escape(r.id)}">${mark(r)}<span>${escape(name(r))}</span><strong>${issuerPercent(r.market.share, 1)}</strong>${shareBar(r.market.share, `${name(r)} ${issuerPercent(r.market.share)}`)}</a></li>`).join("")}</ol>` : '<p class="issuer-status">${data.refreshing ? "Retrieving issuer market reports…" : "No current market reports are available."} The mapped issuer catalog is available below.</p>'}<p class="issuer-source-line">${data.coverage.oldestSourceAt ? `Reports observed ${stamp(data.coverage.oldestSourceAt)}${data.coverage.newestSourceAt !== data.coverage.oldestSourceAt ? ` – ${stamp(data.coverage.newestSourceAt)}` : ""}` : "Awaiting provider observations"}${data.coverage.staleIssuers ? ` · ${data.coverage.staleIssuers} older reports` : ""}${data.refreshing ? " · Updating reports…" : ""}</p></div>${metrics(data.totals)}</section>${data.refreshWarning ? `<p class="issuer-notice" role="status">${escape(data.refreshWarning)}</p>` : ""}<section aria-labelledby="issuer-table-title"><div class="issuer-section-heading"><h2 id="issuer-table-title">All issuers</h2><span>Open an issuer to explore its data room ↗</span></div><div class="issuer-filters"><label class="issuer-search"><span aria-hidden="true">⌕</span><input id="issuer-search" type="search" placeholder="Search issuers…" aria-label="Search issuers" maxlength="80" value="${escape(query)}"></label><label><span class="sr-only">Issuer network</span><select id="issuer-network" aria-label="Issuer network"><option value="all">All networks</option>${[
        ...new Set(data.issuers.flatMap((r) => r.networks.map((n) => n.id))),
      ]
        .sort()
        .map(
          (id) =>
            `<option value="${escape(id)}" ${id === network ? "selected" : ""}>${escape(chainName(id))}</option>`,
        )
        .join(
          "",
        )}</select></label><label><span class="sr-only">Sort issuers</span><select id="issuer-sort" aria-label="Sort issuers">${[
        ["cap", "Market cap"],
        ["volume", "24h volume"],
        ["assets", "Asset coverage"],
        ["networks", "Network coverage"],
        ["change", "24h cap change"],
        ["name", "Name A–Z"],
      ]
        .map(
          ([id, label]) =>
            `<option value="${id}" ${sort === id ? "selected" : ""}>${label}</option>`,
        )
        .join(
          "",
        )}</select></label></div><div id="issuer-ranking"></div></section>${methodology()}`;
    ranking();
  }

  function renderAssets() {
    const target = root.querySelector("#issuer-assets-results");
    if (!target) return;
    target.setAttribute("aria-busy", String(assetsLoading));
    if (assetsLoading && !assets) {
      target.innerHTML =
        '<p class="issuer-status" role="status">Loading issuer assets and token observations…</p>';
      return;
    }
    if (assetError) {
      target.innerHTML = `<p class="issuer-notice" role="alert">${escape(assetError)} <button data-issuer-assets-retry>Retry assets</button></p>`;
      return;
    }
    if (!assets) {
      target.innerHTML = "";
      return;
    }
    target.innerHTML = `<div class="issuer-asset-status"><p role="status">${assets.total ? `${(assets.page - 1) * assets.perPage + 1}–${Math.min(assets.page * assets.perPage, assets.total)} of ${count(assets.total)} ${assetIncludeWrapped ? "assets incl. wrapped" : "native assets"} · Name A–Z` : "No assets match these filters."}${assetsLoading ? " · Updating…" : ""}</p><button data-issuer-assets-export ${!assets.rows.length || assetsLoading ? "disabled" : ""}>Export this page ↗</button></div>${assets.warning ? `<p class="issuer-notice">${escape(assets.warning)}</p>` : ""}<p class="issuer-scroll-hint">Swipe to compare all metrics →</p><div class="issuer-table-scroll" role="region" aria-label="Issuer assets" tabindex="0"><table class="issuer-table issuer-assets-table"><thead><tr><th scope="col">Underlying asset</th><th scope="col">Token price</th><th scope="col">Token market cap</th><th scope="col">24h volume</th><th scope="col">Networks</th><th scope="col">Compare</th></tr></thead><tbody>${
      assets.rows
        .map(
          (s) =>
            `<tr><th scope="row"><a href="${compareHref(s.id)}" data-issuer-compare="${escape(s.id)}" class="issuer-asset-identity">${stockLogo(s)}<span><strong>${escape(s.ticker)}</strong><small>${escape(s.name)}</small>${!["Stock", "ETF"].includes(s.category) ? `<small>Category unconfirmed</small>` : ""}</span></a></th><td>${s.products.map((p) => `<span class="issuer-product-price"><strong>${usd(p.market?.price)}</strong><small>${escape(p.symbol)}${p.wrapped ? " · Wrapped" : ""}${p.market?.updatedAt ? ` · ${Date.now() - Date.parse(p.market.updatedAt) > 21600000 ? "Older · " : ""}${stamp(p.market.updatedAt)}` : " · No price reported"}</small></span>`).join("")}</td><td>${compact(s.marketCap)}${s.capCoverage < s.coinProducts ? `<small>${s.capCoverage}/${s.coinProducts} listed tokens report cap</small>` : ""}</td><td>${compact(s.volume24h)}</td><td><span class="issuer-asset-networks">${[
              ...new Set(
                s.products.flatMap((p) => p.deployments.map((d) => d.chain)),
              ),
            ]
              .map(
                (c) =>
                  `<span title="${escape(chainName(c))}">${chainLogo(c, chainName(c))}<span>${escape(chainName(c))}</span></span>`,
              )
              .slice(0, 3)
              .join(
                "",
              )}${new Set(s.products.flatMap((p) => p.deployments.map((d) => d.chain))).size > 3 ? `<small>+${new Set(s.products.flatMap((p) => p.deployments.map((d) => d.chain))).size - 3} more</small>` : ""}</span></td><td><a href="${compareHref(s.id)}" data-issuer-compare="${escape(s.id)}" class="issuer-compare-link" aria-label="Compare ${escape(s.ticker)} versions">Compare →</a></td></tr>`,
        )
        .join("") ||
      '<tr><td colspan="6">No matching assets. Adjust the search, network or category filter.</td></tr>'
    }</tbody></table></div><div class="issuer-pagination"><button data-issuer-prev ${assets.page <= 1 || assetsLoading ? "disabled" : ""}>← Previous</button><span>Page ${assets.page} of ${assets.pages}</span><button data-issuer-next ${assets.page >= assets.pages || assetsLoading ? "disabled" : ""}>Next →</button></div>`;
    if (assetsLoading)
      for (const link of target.querySelectorAll("tbody a")) {
        link.setAttribute("aria-disabled", "true");
        link.tabIndex = -1;
      }
    if (!assetsLoading && paginationFocus) {
      if (
        document.activeElement === document.body ||
        target.contains(document.activeElement)
      ) {
        const wanted =
          target.querySelector(
            `[data-issuer-${paginationFocus}]:not(:disabled)`,
          ) || target.querySelector(".issuer-pagination button:not(:disabled)");
        wanted?.focus({ preventScroll: true });
      }
      paginationFocus = null;
    }
  }

  function renderDetail(r) {
    document.title = `${name(r)} issuer data — Stocklens`;
    const info = provider({ issuer: r.id, issuerName: r.name });
    const docs = [
      { url: info.url, label: "Website" },
      { url: info.source, label: info.sourceLabel || "Issuer documents" },
      { url: info.eligibility, label: info.eligibilityLabel || "Eligibility" },
    ].filter((d) => d.url?.startsWith("https://"));
    root.querySelector("#issuer-content").innerHTML =
      `<a href="${issuerLink()}" data-issuer-open="" class="issuer-back">← All issuers</a><header class="issuer-page-heading issuer-detail-heading"><div class="issuer-detail-identity">${mark(r)}<div><h1>${escape(name(r))}</h1><p>${escape(r.sourceName || info.structure)}</p></div></div><div class="issuer-toolbar">${info.url ? external(info.url, "Website") : ""}<button data-issuer-refresh ${loading ? "disabled" : ""}>${loading ? "Refreshing…" : "↻ Refresh"}</button></div></header><dl class="issuer-detail-metrics"><div><dt>Reported token market cap</dt><dd>${compact(r.market?.marketCap)}</dd><small>${signed(r.market?.capChangePercent24h)} cap change · 24h</small></div><div><dt>Share of reported market</dt><dd>${issuerPercent(r.market?.share)}</dd><small>${data.totals.reportingIssuers} reporting issuers in denominator</small></div><div><dt>Reported 24h volume</dt><dd>${compact(r.market?.volume24h)}</dd><small>${issuerPercent(r.market?.turnover24h)} turnover · volume / cap</small></div><div><dt>Mapped asset coverage</dt><dd>${count(r.assetCount)}</dd><small>${r.stocks} stocks · ${r.etfs} ETFs${r.unclassified ? ` · ${r.unclassified} unclassified` : ""} · ${r.networks.length} ${r.networks.length === 1 ? "network" : "networks"}</small></div></dl><p class="issuer-source-line">${escape(sourceNote(r))}${r.market ? ` · ${count(r.market.reportedTokens)} CoinGecko-listed tokens · ${external(r.market.apiSource, "Source report")}` : ""}${r.wrappedProducts ? ` · ${r.wrappedProducts} wrapped products counted separately` : ""}${data.refreshing ? " · Updating reports…" : ""}</p><nav class="issuer-section-nav" aria-label="Issuer data room sections"><a href="#issuer-assets">Assets</a><a href="#issuer-networks">Networks</a><a href="#issuer-terms">Structure & terms</a></nav><section id="issuer-assets" aria-labelledby="issuer-assets-title"><div class="issuer-section-heading"><h2 id="issuer-assets-title">Tokenized securities</h2><span>Source-mapped identities · prices per token</span></div><div class="issuer-filters"><label class="issuer-search"><span aria-hidden="true">⌕</span><input type="search" id="issuer-asset-search" aria-label="Search issuer assets" placeholder="Company, ticker or token…" maxlength="80" value="${escape(assetQuery)}"></label><label><span class="sr-only">Asset network</span><select id="issuer-asset-network" aria-label="Asset network"><option value="all">All networks</option>${r.networks.map((n) => `<option value="${escape(n.id)}" ${assetNetwork === n.id ? "selected" : ""}>${escape(chainName(n.id))}</option>`).join("")}</select></label><label><span class="sr-only">Asset type</span><select id="issuer-asset-type" aria-label="Issuer asset type">${[
        ["all", "All securities"],
        ["Stock", "Stocks"],
        ["ETF", "ETFs"],
        ["Unclassified", "Unclassified"],
      ]
        .map(
          ([id, label]) =>
            `<option value="${id}" ${assetType === id ? "selected" : ""}>${label}</option>`,
        )
        .join(
          "",
        )}</select></label>${r.wrappedProducts ? `<label class="issuer-wrappers"><input id="issuer-asset-wrappers" type="checkbox" ${assetIncludeWrapped ? "checked" : ""}> Include wrapped versions (${r.wrappedProducts})</label>` : ""}</div><div id="issuer-assets-results"></div></section><div class="issuer-research"><section id="issuer-networks" aria-labelledby="issuer-networks-title"><div class="issuer-section-heading"><h2 id="issuer-networks-title">Network presence</h2></div><p class="issuer-section-description">Mapped assets available on each network. An asset can appear on several chains; these are counts, not market-cap allocations.${r.wrappedProducts ? " Includes mapped wrapped products." : ""}</p><ul class="issuer-network-list">${r.networks.map((n) => `<li>${chainLogo(n.id, chainName(n.id))}<span>${escape(chainName(n.id))}</span><strong>${count(n.assets)} <small>assets</small></strong>${shareBar((n.assets / r.assetCount) * 100, `${n.assets} of ${r.assetCount} assets on ${chainName(n.id)}`)}</li>`).join("")}</ul></section><section id="issuer-terms" aria-labelledby="issuer-terms-title"><div class="issuer-section-heading"><h2 id="issuer-terms-title">Structure & terms</h2></div><dl class="issuer-terms"><div><dt>${escape(info.structure)}</dt><dd>${escape(info.rights)}</dd></div><div><dt>Dividends & corporate actions</dt><dd>${escape(info.dividends)}</dd></div><div><dt>Access & exit</dt><dd>${escape(info.exit)}</dd></div></dl><div class="issuer-documents">${docs.map((d) => external(d.url, d.label)).join("")}</div><p class="issuer-section-description">Terms vary by product and jurisdiction. Asset identity mapping does not establish backing, holder rights or eligibility.</p></section></div>${methodology()}`;
    renderAssets();
  }

  function render() {
    const content = root.querySelector("#issuer-content");
    if (!data) {
      content.innerHTML = error
        ? `<h1>Issuers</h1><p class="issuer-notice" role="alert">${escape(error)}</p><button data-issuer-refresh>Retry issuer data</button>`
        : '<h1>Issuers</h1><p class="issuer-status" role="status">Loading issuer reports and verified coverage…</p>';
      return;
    }
    const focused = document.activeElement,
      focusId = root.contains(focused) ? focused.id : null,
      selection = focused?.selectionStart;
    if (selected) {
      const found = row();
      if (found) renderDetail(found);
      else
        content.innerHTML = `<h1>Issuer not found</h1><p class="issuer-status">This issuer is not in the verified catalog.</p><a href="${issuerLink()}" data-issuer-open="">Browse all issuers →</a>`;
    } else renderOverview();
    if (error)
      content.insertAdjacentHTML(
        "afterbegin",
        `<p class="issuer-notice" role="alert">${escape(error)} <button data-issuer-refresh>Retry</button></p>`,
      );
    if (focusId) {
      const input = root.querySelector(`#${focusId}`);
      input?.focus({ preventScroll: true });
      if (
        typeof selection === "number" &&
        input?.setSelectionRange &&
        input.type === "search"
      )
        input.setSelectionRange(selection, selection);
    }
  }

  async function loadLandscape() {
    landscapeAbort?.abort();
    landscapeAbort = new AbortController();
    const controller = landscapeAbort;
    loading = true;
    error = null;
    render();
    try {
      const response = await fetcher("/api/issuers", {
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Issuer data could not be loaded.");
      if (!Array.isArray(body.issuers) || !body.totals || !body.coverage)
        throw new Error("The issuer response was incomplete. Please retry.");
      if (controller.signal.aborted) return;
      data = body;
    } catch (e) {
      if (controller.signal.aborted) return;
      error = data
        ? "Issuer refresh failed; the previous dated reports remain visible."
        : e.message;
    } finally {
      if (!controller.signal.aborted) {
        loading = false;
        if (active) render();
      }
    }
    clearTimeout(poll);
    if (active && data?.refreshing && polls++ < 12)
      poll = setTimeout(loadLandscape, 15000);
  }
  async function loadAssets() {
    assetAbort?.abort();
    assetAbort = new AbortController();
    const controller = assetAbort,
      sequence = ++assetSequence;
    assetsLoading = true;
    assetError = null;
    renderAssets();
    try {
      const params = new URLSearchParams({
        issuer: selected,
        page: String(assetPage),
        q: assetQuery,
        chain: assetNetwork,
        type: assetType,
        wrappers: assetIncludeWrapped ? "1" : "0",
      });
      const response = await fetcher("/api/issuer-assets?" + params, {
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Issuer assets could not be loaded.");
      if (!Array.isArray(body.rows))
        throw new Error("The asset response was incomplete. Please retry.");
      if (sequence !== assetSequence || controller.signal.aborted) return;
      assets = body;
      assetPage = body.page;
    } catch (e) {
      if (!controller.signal.aborted && sequence === assetSequence)
        assetError = e.message;
    } finally {
      if (!controller.signal.aborted && sequence === assetSequence) {
        assetsLoading = false;
        if (active) renderAssets();
      }
    }
  }
  root.addEventListener("input", (event) => {
    if (event.target.id === "issuer-search") {
      query = event.target.value;
      ranking();
    }
    if (event.target.id === "issuer-asset-search") {
      assetQuery = event.target.value;
      assetPage = 1;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(loadAssets, 300);
    }
  });
  root.addEventListener("change", (event) => {
    if (event.target.id === "issuer-network") {
      network = event.target.value;
      ranking();
    }
    if (event.target.id === "issuer-sort") {
      sort = event.target.value;
      ranking();
    }
    if (
      [
        "issuer-asset-network",
        "issuer-asset-type",
        "issuer-asset-wrappers",
      ].includes(event.target.id)
    ) {
      assetNetwork = root.querySelector("#issuer-asset-network").value;
      assetType = root.querySelector("#issuer-asset-type").value;
      assetIncludeWrapped =
        root.querySelector("#issuer-asset-wrappers")?.checked === true;
      assetPage = 1;
      loadAssets();
    }
  });
  root.addEventListener("click", (event) => {
    if (event.target.closest('[aria-disabled="true"]')) {
      event.preventDefault();
      return;
    }
    const issuer = event.target.closest("[data-issuer-open]"),
      compare = event.target.closest("[data-issuer-compare]");
    if (
      (issuer || compare) &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      event.button === 0
    ) {
      if (issuer) {
        event.preventDefault();
        onNavigate(issuer.dataset.issuerOpen);
      } else if (
        onCompare(
          compare.dataset.issuerCompare,
          selected,
          assetIncludeWrapped,
        ) !== false
      )
        event.preventDefault();
      return;
    }
    if (event.target.closest("[data-issuer-refresh]")) {
      polls = 0;
      loadLandscape();
      if (selected) loadAssets();
    }
    if (event.target.closest("[data-issuer-assets-retry]")) loadAssets();
    if (event.target.closest("[data-issuer-export]"))
      download(visible(), issuerExportColumns(name), "stocklens-issuers.csv");
    if (event.target.closest("[data-issuer-assets-export]") && assets)
      download(
        assets.rows,
        [
          ["Underlying ticker", (r) => r.ticker],
          ["Asset", (r) => r.name],
          ["Canonical asset ID", (r) => r.id],
          ["Token symbols", (r) => r.products.map((p) => p.symbol).join(" | ")],
          ["Observed token cap USD", (r) => r.marketCap],
          ["Observed 24h volume USD", (r) => r.volume24h],
          [
            "Networks",
            (r) =>
              [
                ...new Set(
                  r.products.flatMap((p) => p.deployments.map((d) => d.chain)),
                ),
              ].join(" | "),
          ],
          [
            "Market observation times",
            (r) => r.products.map((p) => p.market?.updatedAt || "").join(" | "),
          ],
        ],
        `stocklens-${selected}-assets-page-${assetPage}.csv`,
      );
    if (event.target.closest("[data-issuer-prev]") && assetPage > 1) {
      assetPage--;
      paginationFocus = "prev";
      loadAssets();
    }
    if (
      event.target.closest("[data-issuer-next]") &&
      assets &&
      assetPage < assets.pages
    ) {
      assetPage++;
      paginationFocus = "next";
      loadAssets();
    }
  });
  return {
    async show(id = "") {
      const changed = selected !== id;
      active = true;
      selected = id;
      if (changed) {
        assetAbort?.abort();
        assetSequence++;
        assets = null;
        assetQuery = "";
        assetNetwork = "all";
        assetType = "all";
        assetIncludeWrapped = false;
        assetPage = 1;
        assetError = null;
      }
      if (row()?.nativeProducts === 0 && row()?.wrappedProducts > 0)
        assetIncludeWrapped = true;
      render();
      if (!data) {
        await loadLandscape();
      } else if (!loading) loadLandscape();
      if (active && selected === id && row() && (changed || !assets)) {
        if (row().nativeProducts === 0 && row().wrappedProducts > 0) {
          assetIncludeWrapped = true;
          render();
        }
        loadAssets();
      }
    },
    hide() {
      active = false;
      landscapeAbort?.abort();
      assetAbort?.abort();
      loading = false;
      assetsLoading = false;
      clearTimeout(poll);
      clearTimeout(searchTimer);
    },
  };
}

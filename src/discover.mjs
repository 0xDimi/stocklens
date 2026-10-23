import { findStocks } from "./model.mjs";
import { escape, provider, stamp } from "./views.mjs";
import { stockLogo, issuerLogo, chainLogo } from "./brands.mjs";

// The entry is deliberately separate from stock links shared by existing users.
export function routePage(params) {
  const page = params.get("page");
  if (["markets", "stock", "compare"].includes(page)) return page;
  return ["stock", "ticker", "view"].some((key) => params.get(key))
    ? "home"
    : "discover";
}
export function searchAssets(stocks, query) {
  const q = query.trim().toLowerCase();
  return findStocks(stocks, query)
    .sort(
      (a, b) =>
        Number(b.ticker.toLowerCase() === q) -
        Number(a.ticker.toLowerCase() === q),
    )
    .slice(0, 7);
}
export function lensProducts(stock) {
  const seen = new Set();
  const order = ["xstocks", "ondo", "coinbase"];
  return [...(stock?.products || [])]
    .filter((p) => !p.wrapped && p.deployments?.length)
    .sort(
      (a, b) =>
        (order.indexOf(a.issuer) < 0 ? 99 : order.indexOf(a.issuer)) -
        (order.indexOf(b.issuer) < 0 ? 99 : order.indexOf(b.issuer)),
    )
    .filter((p) => !seen.has(p.issuer) && seen.add(p.issuer))
    .slice(0, 3);
}
export const assetLink = (stock) =>
  "/?" + new URLSearchParams({ stock: stock.id, view: "products" });

export function createDiscover({ root, getStocks, onSelect, onRetry }) {
  const input = root.querySelector("#discover-search");
  const list = root.querySelector("#discover-results");
  const status = root.querySelector("#discover-status");
  let ready = false,
    failed = false,
    active = -1,
    results = [];
  function close() {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  }
  function highlight() {
    for (const [i, option] of [
      ...list.querySelectorAll('[role="option"]'),
    ].entries())
      option.setAttribute("aria-selected", i === active);
    if (active >= 0)
      input.setAttribute("aria-activedescendant", `discover-option-${active}`);
    else input.removeAttribute("aria-activedescendant");
  }
  function search() {
    active = -1;
    results = searchAssets(getStocks(), input.value);
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    list.innerHTML = results.length
      ? results
          .map(
            (s, i) =>
              `<li role="option" aria-selected="false" id="discover-option-${i}" data-discover-stock="${escape(s.id)}">${stockLogo(s)}<span><b>${escape(s.ticker)}</b><small>${escape(s.name)}</small></span><span class="discover-result-count">${s.products.filter((p) => !p.wrapped).length} versions <span aria-hidden="true">↗</span></span></li>`,
          )
          .join("")
      : `<li role="presentation" class="discover-empty">${failed ? "Catalog unavailable. Use Retry below." : !ready ? "Loading the asset catalog…" : "No matching stock. Try a company, ticker or token."}</li>`;
    status.textContent = ready
      ? `${results.length} matching assets${results.length ? ". Use arrow keys to choose." : "."}`
      : failed
        ? "Catalog unavailable. Retry below."
        : "Loading the asset catalog…";
  }
  input.addEventListener("input", search);
  input.addEventListener("focus", search);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      // Prevent the native search-field clear event from reopening the list.
      event.preventDefault();
      close();
      return;
    }
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      if (list.hidden) search();
      if (!results.length) return;
      active =
        active < 0
          ? event.key === "ArrowDown"
            ? 0
            : results.length - 1
          : (active + (event.key === "ArrowDown" ? 1 : -1) + results.length) %
            results.length;
      highlight();
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (results.length) choose(results[Math.max(active, 0)].id);
      else search();
    }
    if (event.key === "Tab") close();
  });
  function choose(id) {
    close();
    input.value = "";
    onSelect(id);
  }
  root.addEventListener("click", (event) => {
    const link = event.target.closest("[data-discover-stock]");
    if (
      link &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      event.button === 0
    ) {
      event.preventDefault();
      choose(link.dataset.discoverStock);
    }
    if (event.target.closest("#discover-retry")) onRetry();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".discover-search-wrap")) close();
  });
  root.querySelector("#discover-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (input.value.trim() && results.length)
      choose(results[Math.max(active, 0)].id);
    else {
      input.focus();
      search();
    }
  });
  return {
    close,
    loading() {
      failed = false;
      root.querySelector("#discover-retry").hidden = true;
      if (!ready)
        root.querySelector("#discover-assets").innerHTML =
          "<p>Loading source-mapped stocks…</p>";
      status.textContent = "Loading the asset catalog…";
    },
    fail() {
      failed = true;
      status.textContent =
        "The asset catalog could not be loaded. Please retry.";
      if (!ready)
        root.querySelector("#discover-assets").innerHTML =
          "<p>The asset catalog could not be loaded. Retry to search and compare.</p>";
      root.querySelector("#discover-retry").hidden = false;
      if (!list.hidden) search();
    },
    render(data) {
      ready = true;
      failed = false;
      root.querySelector("#discover-retry").hidden = true;
      const stocks = getStocks();
      const featured = ["NVDA", "AAPL", "TSLA", "MSFT", "AMZN", "SPY"]
        .map((ticker) =>
          stocks.find((s) => s.ticker === ticker && s.products.length),
        )
        .filter(Boolean);
      root.querySelector("#discover-assets").innerHTML = featured
        .map(
          (s) =>
            `<a href="${escape(assetLink(s))}" data-discover-stock="${escape(s.id)}">${stockLogo(s)}<span><b>${escape(s.ticker)}</b><small>${s.products.filter((p) => !p.wrapped).length} versions</small></span><span class="discover-asset-arrow" aria-hidden="true">↗</span></a>`,
        )
        .join("");
      const issuers = new Set(
        stocks.flatMap((s) => s.products.map((p) => p.issuer)),
      ).size;
      const networks = new Set(
        stocks.flatMap((s) =>
          s.products.flatMap((p) => p.deployments.map((d) => d.chain)),
        ),
      ).size;
      root.querySelector("#discover-coverage").innerHTML =
        `<span><b>${stocks.length.toLocaleString()}</b> assets</span><span><b>${issuers}</b> issuers</span><span><b>${networks}</b> networks</span>`;
      root.querySelector("#discover-date").textContent = data.fetchedAt
        ? `Catalog · ${stamp(data.fetchedAt)}`
        : "Source-mapped catalog";
      const stock = featured[0] || stocks.find((s) => s.products.length);
      const graph = root.querySelector("#discover-graph-data");
      graph.innerHTML = stock
        ? `<a class="lens-stock" href="${escape(assetLink(stock))}" data-discover-stock="${escape(stock.id)}">${stockLogo(stock)}<b>${escape(stock.ticker)}</b><small>${escape(stock.name)}</small></a><div class="lens-versions">${lensProducts(
            stock,
          )
            .map(
              (p) =>
                `<a href="${escape(assetLink(stock))}" data-discover-stock="${escape(stock.id)}" class="lens-version">${issuerLogo(p)}<span><b>${escape(p.symbol)}</b><small>${escape(provider(p).name)}</small></span><span class="lens-networks">${[
                  ...new Set(p.deployments.map((d) => d.chain)),
                ]
                  .slice(0, 3)
                  .map((c) => chainLogo(c))
                  .join("")}</span><span aria-hidden="true">↗</span></a>`,
            )
            .join("")}</div>`
        : "";
      root.querySelector("#discover-graph-caption").textContent = stock
        ? `${stock.name} · issuer versions from the catalog`
        : "Find an asset to explore its tokenized versions";
      status.textContent = `${stocks.length.toLocaleString()} assets ready to search.`;
      if (!list.hidden) search();
    },
  };
}

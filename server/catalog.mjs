import {
  getDiscovery,
  mergeDiscovery,
  getRwa,
  attachKnownProducts,
} from "./coingecko.mjs";
import { coverageSummary } from "./coverage.mjs";
import { request } from "./http.mjs";
import { applyCatalogReferences } from "./catalog-identities.mjs";
import { join } from "node:path";
import { readRuntime } from "./runtime.mjs";
import {
  catalogSchema,
  defaultSeedPath,
  readSnapshot,
  writeSnapshot,
} from "./catalog-snapshot.mjs";
import {
  XSTOCKS_API,
  ONDO_CSV,
  ONDO_SOURCE,
  CHAINS,
  validAddress,
} from "./config.mjs";

const CATALOG_MAX_AGE_MS = 72 * 3600000;
function eligibleSourceTime(value, now) {
  const at = Date.parse(value);
  return Number.isFinite(at) && at <= now && now - at <= CATALOG_MAX_AGE_MS;
}
// A recent cache write or outage check must never renew an identity observation.
function eligibleStocks(stocks, now) {
  return stocks.flatMap((stock) => {
    const products = stock.products.filter((p) =>
      eligibleSourceTime(p.sourceAt, now),
    );
    return products.length ||
      (!stock.products.length && eligibleSourceTime(stock.sourceAt, now))
      ? [{ ...stock, products }]
      : [];
  });
}
function eligibleCatalog(catalog, now) {
  const stocks = eligibleStocks(catalog.stocks, now);
  if (!stocks.length) return null;
  const changed =
    stocks.length !== catalog.stocks.length ||
    stocks.some((stock, i) =>
      stock.products.length !== catalog.stocks[i].products.length,
    );
  return changed
    ? {
        ...catalog,
        stocks,
        coverage: { ...catalog.coverage, ...coverageSummary(stocks) },
      }
    : catalog;
}

export function parseCsv(input) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  const text = input.replace(/^\ufeff/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\n" || c === "\r")) {
      row.push(cell);
      cell = "";
      if (c !== ",") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else cell += c;
  }
  if (quoted) throw new Error("Issuer CSV has an unterminated quoted field.");
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const headers = rows.shift();
  if (!headers || new Set(headers).size !== headers.length)
    throw new Error("Issuer CSV has invalid headers.");
  return rows.map((values) => {
    if (values.length !== headers.length)
      throw new Error("Issuer CSV row has unexpected columns.");
    return Object.fromEntries(headers.map((key, i) => [key, values[i]]));
  });
}

export function buildCatalog(xstocks, ondo, fetchedAt, conflicts = []) {
  const securities = new Map();
  const tickerKey = (ticker) =>
    String(ticker).toUpperCase().replace(/[.\-]/g, "");
  const add = (security, product) => {
    product.deployments = product.deployments.filter(
      (d) => CHAINS[d.chain] && validAddress(d.chain, d.address),
    );
    if (
      !product.deployments.length ||
      !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(security.id) ||
      !security.ticker ||
      !product.symbol
    )
      return;
    const current = securities.get(security.id) || {
      ...security,
      products: [],
    };
    if (product.issuer === "ondo") current.category = security.category;
    if (
      !current.products.some(
        (p) => p.issuer === product.issuer && p.symbol === product.symbol,
      )
    )
      current.products.push(product);
    securities.set(security.id, current);
  };
  for (const node of xstocks) {
    const u = node.underlying;
    if (!u || typeof node.symbol !== "string" || !node.symbol.endsWith("x"))
      continue;
    add(
      {
        id: u.isin,
        ticker: u.symbol,
        name: String(node.name).replace(/ xStock$/, ""),
        category: u.type === "Equity" ? "Stock" : u.type || "Listed security",
        logo: node.logo || null,
        exchange: u.exchange?.abbreviation || "",
        currency: u.currency || null,
        sourceAt: fetchedAt,
      },
      {
        issuer: "xstocks",
        logo: node.logo || null,
        symbol: node.symbol,
        isin: node.isin,
        source: `${XSTOCKS_API}/assets/${encodeURIComponent(node.symbol)}`,
        sourceAt: fetchedAt,
        halted: node.isTradingHalted === true,
        issuerTradingOpen: node.trading?.openNow ?? null,
        deployments: (node.deployments || []).map((d) => ({
          chain: d.network,
          address: d.address,
        })),
      },
    );
  }
  for (const row of ondo) {
    if (!["Stock", "ETF"].includes(row.Type)) continue;
    const byIsin = securities.get(row.ISIN);
    const byTicker = [...securities.values()].find(
      (s) => tickerKey(s.ticker) === tickerKey(row["Stock Ticker"]),
    );
    if (
      !byIsin ||
      !byTicker ||
      tickerKey(byIsin.ticker) !== tickerKey(row["Stock Ticker"]) ||
      byTicker.id !== row.ISIN
    ) {
      conflicts.push({
        symbol: row.Symbol,
        isin: row.ISIN,
        ticker: row["Stock Ticker"],
      });
      continue;
    }
    add(
      {
        id: row.ISIN,
        ticker: row["Stock Ticker"],
        name: row["Stock Name"],
        category: row.Type,
        exchange: "",
        sourceAt: fetchedAt,
      },
      {
        issuer: "ondo",
        symbol: row.Symbol,
        source: ONDO_SOURCE,
        sourceAt: fetchedAt,
        halted: false,
        issuerTradingOpen: null,
        deployments: [
          ["Ethereum", "Ethereum Deployed Address"],
          ["BinanceSmartChain", "BSC Deployed Address"],
          ["Solana", "Solana Deployed Address"],
          ["HyperEVM", "HyperEVM Deployed Address"],
          ["Robinhood", "Robinhood Chain Deployed Address"],
        ].map(([chain, key]) => ({ chain, address: row[key] || "" })),
      },
    );
  }
  const priority = [
    "NVDA",
    "AAPL",
    "TSLA",
    "MSFT",
    "AMZN",
    "GOOGL",
    "META",
    "COIN",
    "AMD",
  ];
  return applyCatalogReferences([...securities.values()]).sort((a, b) => {
    const ai = priority.indexOf(a.ticker),
      bi = priority.indexOf(b.ticker);
    return (
      (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.name.localeCompare(b.name)
    );
  });
}

export async function xStocksCatalog({
  base = XSTOCKS_API,
  deadlineMs = 25_000,
} = {}) {
  const nodes = [],
    seen = new Set();
  const deadline = Date.now() + deadlineMs;
  const maxPages = 100,
    concurrency = 4;
  for (let first = 0; first < maxPages; first += concurrency) {
    const pages = Array.from(
      { length: Math.min(concurrency, maxPages - first) },
      (_, i) => first + i,
    );
    const results = await Promise.allSettled(
      pages.map(async (page) => {
        const remaining = deadline - Date.now();
        if (remaining <= 0)
          throw new Error("xStocks identity catalog timed out.");
        const data = await request(`${base}/assets?pageSize=100&page=${page}`, {
          timeout: Math.min(12_000, remaining),
        });
        if (
          !Array.isArray(data.nodes) ||
          !data.page ||
          data.page.currentPage !== page ||
          typeof data.page.hasNextPage !== "boolean"
        )
          throw new Error(
            `Unexpected xStocks catalog response on page ${page}.`,
          );
        return data;
      }),
    );
    // A terminal page is authoritative. Speculative requests beyond it may return HTTP 404.
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "rejected") throw result.reason;
      const data = result.value;
      for (const node of data.nodes) {
        const key = node.id || node.symbol;
        if (!key || seen.has(key))
          throw new Error(
            "xStocks pagination repeated or omitted an asset identity.",
          );
        seen.add(key);
        nodes.push(node);
      }
      if (!data.page.hasNextPage) {
        if (!nodes.length)
          throw new Error("xStocks catalog returned no asset identities.");
        return nodes;
      }
      if (!data.nodes.length)
        throw new Error(
          "xStocks pagination returned an empty non-terminal page.",
        );
    }
  }
  throw new Error("xStocks catalog exceeded the supported page limit.");
}
// An issuer record excluded from the xStocks join can still be corroborated by an exact CoinGecko product contract.
export function attachOndoCatalog(stocks, rows, at) {
  const copy = structuredClone(stocks);
  for (const row of rows) {
    if (
      !["Stock", "ETF"].includes(row.Type) ||
      !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(row.ISIN)
    )
      continue;
    const candidates = copy.filter(
      (s) =>
        s.ticker === row["Stock Ticker"] &&
        s.products.some(
          (p) =>
            p.issuer === "ondo" &&
            p.coinId === row["CoinGecko API ID"] &&
            p.deployments.some((d) =>
              [
                ["Ethereum", "Ethereum Deployed Address"],
                ["BinanceSmartChain", "BSC Deployed Address"],
                ["Solana", "Solana Deployed Address"],
              ].some(
                ([chain, key]) =>
                  chain === d.chain &&
                  (chain === "Solana"
                    ? d.address === row[key]
                    : d.address.toLowerCase() ===
                      (row[key] || "").toLowerCase()),
              ),
            ),
        ),
    );
    if (candidates.length !== 1) continue;
    const stock = candidates[0];
    if (!stock.id.startsWith("cg:") && stock.id !== row.ISIN) continue;
    if (copy.some((s) => s !== stock && s.id === row.ISIN)) continue;
    // CoinGecko does not disclose an independent ISIN. Preserve its canonical ID.

    const p = stock.products.find(
      (p) => p.issuer === "ondo" && p.coinId === row["CoinGecko API ID"],
    );
    p.source = ONDO_SOURCE;
    p.sourceAt = at;
    p.reportedUnderlyingIsin = row.ISIN;
    for (const [chain, key] of [
      ["Ethereum", "Ethereum Deployed Address"],
      ["BinanceSmartChain", "BSC Deployed Address"],
      ["Solana", "Solana Deployed Address"],
      ["HyperEVM", "HyperEVM Deployed Address"],
      ["Robinhood", "Robinhood Chain Deployed Address"],
    ]) {
      const address = row[key];
      if (
        validAddress(chain, address) &&
        !p.deployments.some(
          (d) =>
            d.chain === chain &&
            d.address.toLowerCase() === address.toLowerCase(),
        )
      )
        p.deployments.push({
          chain,
          address,
          provenance: "Ondo official contract list",
        });
    }
  }
  return copy;
}
export function pendingIssuerRecords(rows, conflicts, at) {
  return conflicts.flatMap((conflict) => {
    const row = rows.find(
      (row) =>
        row.Symbol === conflict.symbol &&
        row.ISIN === conflict.isin &&
        row["Stock Ticker"] === conflict.ticker,
    );
    if (!row) return [];
    return [
      {
        issuer: "ondo",
        symbol: row.Symbol,
        claimedUnderlying: {
          ticker: row["Stock Ticker"],
          name: row["Stock Name"],
          isin: row.ISIN,
        },
        source: ONDO_SOURCE,
        sourceAt: at,
        reason:
          "Issuer identity mapping was not corroborated by the connected registries. Excluded from comparison and quotes.",
        deployments: [
          ["Ethereum", "Ethereum Deployed Address"],
          ["BinanceSmartChain", "BSC Deployed Address"],
          ["Solana", "Solana Deployed Address"],
          ["HyperEVM", "HyperEVM Deployed Address"],
          ["Robinhood", "Robinhood Chain Deployed Address"],
        ].flatMap(([chain, key]) =>
          validAddress(chain, row[key]) ? [{ chain, address: row[key] }] : [],
        ),
      },
    ];
  });
}
function sameContract(a, b) {
  return (
    a.chain === b.chain &&
    (a.chain === "Solana"
      ? a.address === b.address
      : a.address.toLowerCase() === b.address.toLowerCase())
  );
}
export function retainCatalogIdentities(previous, current, retainMissing) {
  const output = structuredClone(current);
  for (const old of previous) {
    const matches = output.filter(
      (stock) =>
        stock.id === old.id ||
        (stock.rwaId && stock.rwaId === old.rwaId) ||
        stock.products.some((p) =>
          old.products.some(
            (q) =>
              p.issuer === q.issuer &&
              p.deployments.some((d) =>
                q.deployments.some((e) => sameContract(d, e)),
              ),
          ),
        ),
    );
    if (matches.length === 1) {
      const stock = matches[0];
      if (stock.id !== old.id) {
        // A previously separate CoinGecko URL remains an alias after exact
        // underlying corroboration. It must not replace an issuer ISIN.
        if (!old.id.startsWith("cg:") || stock.id.startsWith("cg:")) {
          if (!output.some((other) => other !== stock && other.id === old.id)) {
            stock.aliases = [...new Set([...(stock.aliases || []), stock.id])];
            stock.id = old.id;
          }
        } else stock.aliases = [...new Set([...(stock.aliases || []), old.id])];
      }
      if (old.aliases?.length)
        stock.aliases = [
          ...new Set([...(stock.aliases || []), ...old.aliases]),
        ].filter((id) => id !== stock.id);
      if (retainMissing)
        for (const p of old.products) {
          if (
            !stock.products.some(
              (q) => q.issuer === p.issuer && q.symbol === p.symbol,
            )
          )
            stock.products.push({ ...structuredClone(p), stale: true });
        }
    } else if (!matches.length && retainMissing)
      output.push({ ...structuredClone(old), stale: true });
  }
  return output;
}
export function createCatalogLoader(options = {}) {
  const cachePath = join(
    options.cacheDir ?? readRuntime().cacheDir,
    "canonical-catalog-v1.json",
  );
  const now = options.now ?? Date.now;
  let inFlight;
  const load = async () => {
    const saved =
      (await readSnapshot(cachePath)) ||
      (await readSnapshot(
        options.seedPath === undefined ? defaultSeedPath : options.seedPath,
        { seed: true },
      ));
    const sources = Object.fromEntries(
      Object.entries(saved?.sources || {}).filter(([, source]) =>
        eligibleSourceTime(source.retrievedAt, now()),
      ),
    );
    const observations = await Promise.allSettled([
      (options.getXstocks ?? xStocksCatalog)(),
      (
        options.getOndo ??
        (() => request(ONDO_CSV, { json: false }).then(parseCsv))
      )(),
      (options.getDiscovery ?? getDiscovery)(),
    ]);
    const fetchedAt = new Date(now()).toISOString();
    const [x, o, cg] = observations.map((observation, index) => {
      const key = ["xstocks", "ondo", "coingecko"][index];
      let result = observation;
      if (result.status === "fulfilled") {
        const retrievedAt =
          key === "coingecko"
            ? result.value.retrievedAt
            : options.sourceRetrievedAt?.[key] || fetchedAt;
        if (eligibleSourceTime(retrievedAt, now())) {
          sources[key] = { value: result.value, retrievedAt };
          return {
            ...result,
            retrievedAt,
            available: result.value?.stale !== true,
            stale: result.value?.stale === true,
            error: result.value?.stale ? result.value.warning || null : null,
          };
        }
        result = {
          status: "rejected",
          reason: new Error("Catalog source observation is expired or undated."),
        };
      }
      const previous = sources[key];
      return previous
        ? {
            status: "fulfilled",
            value: previous.value,
            retrievedAt: previous.retrievedAt,
            available: false,
            stale: true,
            error: result.reason.message,
          }
        : { ...result, available: false, error: result.reason.message };
    });
    if (x.status === "rejected" && cg.status === "rejected")
      throw new Error(
        "The verified identity catalog is unavailable. Please try again shortly.",
      );
    const conflicts = [];
    const issuerStocks = buildCatalog(
      x.status === "fulfilled" ? x.value : [],
      o.status === "fulfilled" ? o.value : [],
      x.retrievedAt || fetchedAt,
      conflicts,
    );
    for (const stock of issuerStocks)
      for (const product of stock.products)
        if (product.issuer === "ondo")
          product.sourceAt = o.retrievedAt || fetchedAt;
    let stocks =
      cg.status === "fulfilled"
        ? mergeDiscovery(
            attachKnownProducts(
              issuerStocks,
              cg.value.registry || [],
              cg.value.retrievedAt,
            ),
            cg.value.stocks,
          )
        : issuerStocks;
    if (o.status === "fulfilled")
      stocks = attachOndoCatalog(stocks, o.value, o.retrievedAt);
    stocks = retainCatalogIdentities(
      eligibleStocks(saved?.catalog?.stocks || [], now()),
      stocks,
      [x, o, cg].some((r) => r.status === "rejected" || r.stale),
    );
    if (!stocks.length)
      throw new Error(
        "Issuer catalogs did not contain verified supported securities.",
      );
    const warnings = [];
    for (const [key, result] of [
      ["xStocks", x],
      ["Ondo", o],
      ["CoinGecko", cg],
    ])
      if (result.stale)
        warnings.push(
          `${key} catalog snapshot from ${result.retrievedAt} retained; live refresh unavailable${result.error ? `: ${result.error}` : "."}`,
        );
    if (cg.status === "rejected")
      warnings.push(
        "CoinGecko catalog unavailable; showing issuer-sourced coverage.",
      );
    else if (cg.value.warning) warnings.push(cg.value.warning);
    if (x.status === "rejected")
      warnings.push(
        "xStocks identity source unavailable; using independent CoinGecko underlying IDs.",
      );
    const unresolved = conflicts.filter(
      (row) =>
        !stocks.some(
          (s) =>
            s.ticker === row.ticker &&
            s.products.some(
              (p) =>
                p.issuer === "ondo" &&
                p.symbol === row.symbol &&
                (s.id === row.isin || p.reportedUnderlyingIsin === row.isin),
            ),
        ),
    );
    if (unresolved.length)
      warnings.push(
        `${unresolved.length} issuer records held back because identity mappings are unconfirmed or inconsistent.`,
      );
    if (o.status === "rejected")
      warnings.push(
        "Ondo direct catalog unavailable; independent registry mappings remain available.",
      );
    const result = {
      stocks,
      pendingProducts: pendingIssuerRecords(
        o.status === "fulfilled" ? o.value : [],
        unresolved,
        o.retrievedAt || fetchedAt,
      ),
      coverage: {
        ...coverageSummary(stocks),
        registry: cg.status === "fulfilled" ? cg.value.universe : null,
        heldBackIssuerRecords: unresolved.length,
      },
      fetchedAt,
      warnings,
      chains: Object.values(CHAINS).map(({ id, label, explorer, usdc }) => ({
        id,
        label,
        explorer,
        quotable: !!usdc,
      })),
      sources: [
        {
          name: "CoinGecko",
          url: "https://www.coingecko.com/en/categories/tokenized-stock",
          available: cg.available,
          stale: cg.stale || false,
          retrievedAt: cg.retrievedAt || null,
          error: cg.error || null,
        },
        {
          name: "xStocks public API",
          url: `${XSTOCKS_API}/assets`,
          available: x.available,
          stale: x.stale || false,
          retrievedAt: x.retrievedAt || null,
          error: x.error || null,
        },
        {
          name: "Ondo official contract list",
          url: ONDO_SOURCE,
          available: o.available,
          stale: o.stale || false,
          retrievedAt: o.retrievedAt || null,
          error: o.error || null,
        },
      ],
    };
    const persistenceWarning = await writeSnapshot(cachePath, {
      schemaVersion: catalogSchema,
      savedAt: fetchedAt,
      sources,
      catalog: result,
    });
    if (persistenceWarning) result.warnings.push(persistenceWarning);
    return result;
  };
  return () => {
    if (!inFlight)
      inFlight = load().finally(() => {
        inFlight = null;
      });
    return inFlight;
  };
}
// Only the public runtime loader uses stale-while-revalidate. Capture tooling still
// awaits createCatalogLoader(), so a seed can never be captured as a new observation.
export function createCachedCatalogLoader(options = {}) {
  const now = options.now ?? Date.now;
  const refresh = createCatalogLoader(options);
  const cachePath = join(
    options.cacheDir ?? readRuntime().cacheDir,
    "canonical-catalog-v1.json",
  );
  let latest,
    initialization,
    inFlight,
    nextRefreshAt = 0;
  const initialize = async () => {
    for (const [path, seed] of [
      [cachePath, false],
      [
        options.seedPath === undefined ? defaultSeedPath : options.seedPath,
        true,
      ],
    ]) {
      const saved = await readSnapshot(path, { seed });
      const age = now() - Date.parse(saved?.savedAt);
      if (
        !saved?.catalog?.stocks?.length ||
        !Number.isFinite(age) ||
        age < 0 ||
        age > CATALOG_MAX_AGE_MS
      )
        continue;
      const catalog = eligibleCatalog(saved.catalog, now());
      if (!catalog) continue;
      latest = {
        ...catalog,
        stocks: applyCatalogReferences(catalog.stocks),
        mode: "cached",
        cachedAt: saved.savedAt,
        refreshing: false,
        checkedAt: null,
        warnings: [
          ...saved.catalog.warnings,
          `Catalog snapshot from ${saved.savedAt}; live source availability is being checked in the background.`,
        ],
        sources: saved.catalog.sources.map((source) => ({
          ...source,
          available: null,
          lastKnownAvailable: source.available,
          lastCheckedAt: source.checkedAt || saved.catalog.checkedAt || null,
          checkedAt: null,
          cached: true,
          stale: true,
        })),
      };
      return;
    }
  };
  const startRefresh = () => {
    if (inFlight || now() < nextRefreshAt) return;
    nextRefreshAt = now() + 600_000;
    if (latest) latest = { ...latest, refreshing: true };
    inFlight = refresh()
      .then((value) => {
        const retained = value.sources.some((source) => source.stale);
        latest = {
          ...value,
          mode: retained ? "retained" : "refreshed",
          cachedAt: retained ? latest?.cachedAt || null : null,
          checkedAt: value.fetchedAt,
          refreshing: false,
        };
        return latest;
      })
      .catch((error) => {
        if (!latest) throw error;
        latest = {
          ...latest,
          refreshing: false,
          refreshError: error.message,
          warnings: [
            ...new Set([
              ...latest.warnings,
              `Catalog refresh failed: ${error.message}`,
            ]),
          ],
        };
        return latest;
      })
      .finally(() => {
        inFlight = null;
      });
    // A cached response has no caller awaiting the refresh; failures remain visible
    // on the retained result without producing an unhandled rejection.
    inFlight.catch(() => {});
  };
  return async () => {
    if (!initialization) initialization = initialize();
    await initialization;
    if (latest) latest = eligibleCatalog(latest, now());
    startRefresh();
    if (latest) return latest;
    if (inFlight) return inFlight;
    throw new Error(
      "The verified identity catalog is unavailable. Please try again shortly.",
    );
  };
}
const defaultCatalogLoader = createCachedCatalogLoader();
export async function loadCatalog() {
  return defaultCatalogLoader();
}

export async function resolveStock(
  id,
  enrich = false,
  { getCatalog = loadCatalog, getNative = getRwa } = {},
) {
  const catalog = await getCatalog();
  const matches = catalog.stocks.filter(
    (s) =>
      s.id === id ||
      s.rwaId === (id.startsWith("cg:") ? id.slice(3) : id) ||
      s.ticker === id,
  );
  if (matches.length !== 1) {
    const error = new Error(
      matches.length
        ? "Choose the exact underlying asset."
        : "This asset is not in the catalog.",
    );
    error.status = matches.length ? 409 : 404;
    throw error;
  }
  let stock = matches[0];
  const warnings = [...catalog.warnings];
  if (enrich && stock.rwaId) {
    const native = await getNative(stock);
    if (native.products.length || native.checkedAt)
      Object.assign(
        stock,
        mergeDiscovery(
          [stock],
          [
            {
              ...stock,
              products: native.products,
              logo: native.logo || stock.logo,
              nativeCheckedAt: native.checkedAt,
            },
          ],
        )[0],
      );
    if (native.warning) warnings.push(native.warning);
  }
  return { stock, warnings, catalogAt: catalog.fetchedAt };
}

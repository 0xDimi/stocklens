import {
  getDiscovery,
  mergeDiscovery,
  getRwa,
  attachKnownProducts,
} from "./coingecko.mjs";
import { coverageSummary } from "./coverage.mjs";
import { memo, request } from "./http.mjs";
import {
  XSTOCKS_API,
  ONDO_CSV,
  ONDO_SOURCE,
  CHAINS,
  validAddress,
} from "./config.mjs";

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
  return [...securities.values()].sort((a, b) => {
    const ai = priority.indexOf(a.ticker),
      bi = priority.indexOf(b.ticker);
    return (
      (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.name.localeCompare(b.name)
    );
  });
}

async function xStocksCatalog() {
  const nodes = [];
  const deadline = Date.now() + 25_000;
  for (let page = 0; page < 30; page++) {
    if (Date.now() >= deadline) throw new Error("Identity catalog timed out.");
    const data = await request(
      `${XSTOCKS_API}/assets?pageSize=100&page=${page}`,
      { timeout: Math.min(12_000, deadline - Date.now()) },
    );
    if (
      !Array.isArray(data.nodes) ||
      !data.page ||
      data.page.currentPage !== page
    )
      throw new Error("Unexpected xStocks catalog response.");
    nodes.push(...data.nodes);
    if (!data.page.hasNextPage) return nodes;
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
export async function loadCatalog() {
  return memo("catalog", 600_000, async () => {
    const [x, o, cg] = await Promise.allSettled([
      xStocksCatalog(),
      request(ONDO_CSV, { json: false }).then(parseCsv),
      getDiscovery(),
    ]);
    if (x.status === "rejected" && cg.status === "rejected")
      throw new Error(
        "The verified identity catalog is unavailable. Please try again shortly.",
      );
    const fetchedAt = new Date().toISOString();
    const conflicts = [];
    const issuerStocks = buildCatalog(
      x.status === "fulfilled" ? x.value : [],
      o.status === "fulfilled" ? o.value : [],
      fetchedAt,
      conflicts,
    );
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
      stocks = attachOndoCatalog(stocks, o.value, fetchedAt);
    if (!stocks.length)
      throw new Error(
        "Issuer catalogs did not contain verified supported securities.",
      );
    const warnings = [];
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
    return {
      stocks,
      pendingProducts: pendingIssuerRecords(
        o.status === "fulfilled" ? o.value : [],
        unresolved,
        fetchedAt,
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
          available: cg.status === "fulfilled",
          retrievedAt: cg.status === "fulfilled" ? cg.value.retrievedAt : null,
        },
        {
          name: "xStocks public API",
          url: `${XSTOCKS_API}/assets`,
          available: x.status === "fulfilled",
        },
        {
          name: "Ondo official contract list",
          url: ONDO_SOURCE,
          available: o.status === "fulfilled",
        },
      ],
    };
  });
}

export async function resolveStock(
  id,
  enrich = false,
  { getCatalog = loadCatalog, getNative = getRwa } = {},
) {
  const catalog = await getCatalog();
  const matches = catalog.stocks.filter(
    (s) => s.id === id || s.rwaId === id || s.ticker === id,
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

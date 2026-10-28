import { loadCatalog } from "./catalog.mjs";
import {
  cgRequest,
  getIssuerObservations,
  getTokenMarkets,
} from "./coingecko.mjs";
import { normalizeIssuer } from "./coingecko-identities.mjs";

const HOUR = 3600000;
const TTL = 6 * HOUR;
const MAX_AGE = 72 * HOUR;
const REPORT_IDS = {
  xstocks: "xstocks-ecosystem",
  ondo: "ondo-tokenized-assets",
  bstocks: "bstocks-ecosystem",
  robinhood: "robinhood-chain-stocks-ecosystem",
  dinari: "dinari-ecosystem",
  coinbase: "coinbase-ecosystem",
  backpack: "backpack-securities-ecosystem",
  anchored: "anchored-ecosystem",
  reality: "reality-ecosystem",
  st0x: "st0x-ecosystem",
  stove: "stove-ecosystem",
};
const numeric = (value, min = 0) =>
  typeof value === "number" && Number.isFinite(value) && value >= min
    ? value
    : null;
const time = (value) => (typeof value === "string" ? Date.parse(value) : NaN);
const validTime = (value, now) =>
  Number.isFinite(time(value)) &&
  time(value) <= now + 30000 &&
  now - time(value) <= MAX_AGE;
const tokenKey = (p) =>
  p.coinId ||
  `${p.symbol}:${p.deployments
    ?.map((d) => d.chain + ":" + d.address)
    .sort()
    .join("|")}`;
const uniqueProducts = (products) => [
  ...new Map(products.map((p) => [tokenKey(p), p])).values(),
];
const sumKnown = (values) => {
  const known = values.filter((v) => v !== null && v !== undefined);
  return known.length ? known.reduce((sum, v) => sum + v, 0) : null;
};
const badRequest = (message) =>
  Object.assign(new Error(message), { status: 400 });

function marketReport(report, now) {
  const data = report?.data;
  if (
    !data ||
    !Array.isArray(data.tokens) ||
    !validTime(report.retrievedAt, now) ||
    !validTime(data.updated_at, now)
  )
    return null;
  const marketCap = numeric(data.market_cap),
    volume24h = numeric(data.volume_24h),
    capChange24h = numeric(data.market_cap_change_24h, -Infinity),
    previous =
      marketCap !== null && capChange24h !== null
        ? marketCap - capChange24h
        : null;
  return {
    marketCap,
    volume24h,
    capChange24h,
    capChangePercent24h: previous > 0 ? (capChange24h / previous) * 100 : null,
    turnover24h:
      marketCap > 0 && volume24h !== null
        ? (volume24h / marketCap) * 100
        : null,
    share: null,
    sourceAt: data.updated_at,
    retrievedAt: report.retrievedAt,
    stale:
      report.stale === true ||
      now - time(report.retrievedAt) > TTL ||
      now - time(data.updated_at) > TTL,
    source: `https://www.coingecko.com/en/categories/${encodeURIComponent(data.id)}`,
    apiSource: `https://api.coingecko.com/api/v3/rwas/issuers/${encodeURIComponent(data.id)}`,
    reportedTokens: new Set(
      data.tokens.map((t) => t.id).filter((id) => typeof id === "string"),
    ).size,
  };
}

export function buildIssuerLandscape(catalog, reports = [], now = Date.now()) {
  const groups = new Map(),
    allAssets = new Set();
  for (const stock of catalog.stocks) {
    for (const product of stock.products) {
      const id = product.issuer;
      if (!groups.has(id))
        groups.set(id, {
          id,
          name: product.issuerName || id,
          assets: new Map(),
          products: [],
          networks: new Map(),
        });
      const row = groups.get(id);
      row.assets.set(stock.id, stock);
      row.products.push(product);
      allAssets.add(stock.id);
      for (const d of product.deployments || []) {
        if (!row.networks.has(d.chain)) row.networks.set(d.chain, new Set());
        row.networks.get(d.chain).add(stock.id);
      }
    }
  }
  const latest = new Map();
  for (const report of reports) {
    const id = normalizeIssuer(report.data?.id);
    if (
      !/^[a-z0-9-]{1,100}$/.test(report.data?.id || "") ||
      !groups.has(id) ||
      !marketReport(report, now)
    )
      continue;
    if (
      !latest.has(id) ||
      time(report.retrievedAt) > time(latest.get(id).retrievedAt)
    )
      latest.set(id, report);
  }
  const issuers = [...groups.values()].map((row) => {
    const products = uniqueProducts(row.products),
      native = products.filter((p) => !p.wrapped),
      wrapped = products.filter((p) => p.wrapped),
      report = latest.get(row.id);
    return {
      id: row.id,
      name: row.name,
      sourceName: report?.data.name || null,
      assetCount: row.assets.size,
      stocks: [...row.assets.values()].filter((s) => s.category === "Stock")
        .length,
      etfs: [...row.assets.values()].filter((s) => s.category === "ETF").length,
      unclassified: [...row.assets.values()].filter(
        (s) => !["Stock", "ETF"].includes(s.category),
      ).length,
      nativeAssetCount: [...row.assets.values()].filter((s) =>
        s.products.some((p) => p.issuer === row.id && !p.wrapped),
      ).length,
      wrappedAssetCount: [...row.assets.values()].filter((s) =>
        s.products.some((p) => p.issuer === row.id && p.wrapped),
      ).length,
      nativeProducts: native.length,
      wrappedProducts: wrapped.length,
      coinProducts: new Set(products.map((p) => p.coinId).filter(Boolean)).size,
      networks: [...row.networks]
        .map(([id, assets]) => ({ id, assets: assets.size }))
        .sort((a, b) => b.assets - a.assets || a.id.localeCompare(b.id)),
      market: marketReport(report, now),
    };
  });
  const marketCap = sumKnown(issuers.map((r) => r.market?.marketCap)),
    volume24h = sumKnown(issuers.map((r) => r.market?.volume24h));
  for (const row of issuers)
    if (row.market && marketCap > 0 && row.market.marketCap !== null)
      row.market.share = (row.market.marketCap / marketCap) * 100;
  issuers.sort(
    (a, b) =>
      (b.market?.marketCap ?? -1) - (a.market?.marketCap ?? -1) ||
      a.name.localeCompare(b.name),
  );
  const sourceTimes = issuers
    .map((r) => r.market?.sourceAt)
    .filter(Boolean)
    .sort();
  return {
    issuers,
    totals: {
      marketCap,
      volume24h,
      assetCount: allAssets.size,
      unclassifiedAssetCount: catalog.stocks.filter(
        (s) => allAssets.has(s.id) && !["Stock", "ETF"].includes(s.category),
      ).length,
      issuerCount: issuers.length,
      reportingIssuers: issuers.filter((r) => r.market?.marketCap != null)
        .length,
      volumeIssuers: issuers.filter((r) => r.market?.volume24h != null).length,
      networkCount: new Set(issuers.flatMap((r) => r.networks.map((n) => n.id)))
        .size,
      nativeProducts: issuers.reduce((n, r) => n + r.nativeProducts, 0),
      wrappedProducts: issuers.reduce((n, r) => n + r.wrappedProducts, 0),
    },
    coverage: {
      oldestSourceAt: sourceTimes[0] || null,
      newestSourceAt: sourceTimes.at(-1) || null,
      staleIssuers: issuers.filter((r) => r.market?.stale).length,
      marketBasis:
        "CoinGecko reported issuer token market caps in USD, counted once per issuer. Issuer share uses the sum of available reported caps for these tracked issuers, not an independently complete global market estimate.",
      catalogBasis:
        "Source-mapped securities retain their catalog categories. Unclassified securities and wrapped products are identified separately. Source-reported tokens and market totals can include products outside those mappings. Network coverage counts assets present on a chain; it does not allocate market cap.",
    },
    catalogAt: catalog.fetchedAt,
  };
}

export function selectIssuerAssets(
  catalog,
  { issuer, query = "", chain = "all", type = "all", includeWrapped = false },
) {
  const q = query.toLowerCase().trim();
  return catalog.stocks
    .flatMap((stock) => {
      const products = uniqueProducts(
        stock.products.filter(
          (p) =>
            p.issuer === issuer &&
            (includeWrapped || !p.wrapped) &&
            (chain === "all" || p.deployments.some((d) => d.chain === chain)),
        ),
      );
      if (
        !products.length ||
        (type !== "all" &&
          (type === "Unclassified"
            ? ["Stock", "ETF"].includes(stock.category)
            : stock.category !== type)) ||
        (q &&
          ![
            stock.id,
            stock.ticker,
            stock.name,
            ...products.map((p) => p.symbol),
          ].some((v) => String(v).toLowerCase().includes(q)))
      )
        return [];
      return [{ ...stock, products }];
    })
    .sort(
      (a, b) => a.ticker.localeCompare(b.ticker) || a.id.localeCompare(b.id),
    );
}

export function issuerAssetRows(stocks, markets) {
  const observations = new Map(markets.map((m) => [m.coinId, m]));
  return stocks.map((stock) => {
    const products = stock.products.map((p) => ({
      ...p,
      market: observations.get(p.coinId) || null,
    }));
    const values = [
      ...new Map(
        products.filter((p) => p.coinId).map((p) => [p.coinId, p.market]),
      ).values(),
    ];
    return {
      id: stock.id,
      ticker: stock.ticker,
      name: stock.name,
      category: stock.category,
      logo: stock.logo || null,
      rwaId: stock.rwaId || null,
      products,
      marketCap: sumKnown(values.map((m) => m?.marketCap)),
      volume24h: sumKnown(values.map((m) => m?.volume24h)),
      capCoverage: values.filter((m) => m?.marketCap != null).length,
      marketCoverage: values.filter(Boolean).length,
      coinProducts: values.length,
    };
  });
}

// A visit reuses discovery snapshots. Background refreshes share the existing
// paced CoinGecko cache; at most one report per issuer every six hours is due.
export function createIssuerDesk({
  getCatalog = loadCatalog,
  getReports = getIssuerObservations,
  request = cgRequest,
  getMarkets = getTokenMarkets,
  now = Date.now,
} = {}) {
  const observations = new Map(),
    attempts = new Map(),
    issues = new Set();
  let work = null,
    retryAt = 0,
    lastError = null;
  const canReplace = (value, previous) => {
    const next = marketReport(value, now()),
      prior = marketReport(previous, now());
    return !!next && !(prior?.marketCap != null && next.marketCap === null);
  };
  const collect = async (allowed) => {
    for (const value of await getReports()) {
      const id = value.data?.id;
      if (!/^[a-z0-9-]{1,100}$/.test(id || "")) continue;
      if (!allowed.has(normalizeIssuer(id))) continue;
      if (
        !observations.has(id) ||
        time(value.retrievedAt) > time(observations.get(id).retrievedAt)
      ) {
        if (canReplace(value, observations.get(id))) {
          observations.set(id, value);
          issues.delete(id);
        } else if (observations.has(id)) issues.add(id);
      }
    }
    return [...observations.values()];
  };
  function refresh(ids) {
    const due = ids
      .filter(
        (id) =>
          !observations.has(id) ||
          now() - time(observations.get(id).retrievedAt) >= TTL,
      )
      .filter((id) => now() - (attempts.get(id) ?? -Infinity) >= TTL);
    if (work || retryAt > now() || !due.length) return;
    work = (async () => {
      for (const id of due) {
        attempts.set(id, now());
        try {
          const value = await request(`/rwas/issuers/${id}`, TTL, {
            waitForFresh: true,
          });
          if (
            value.data?.id !== id ||
            !Array.isArray(value.data.tokens) ||
            !canReplace(value, observations.get(id))
          )
            throw new Error("Issuer source returned an invalid observation.");
          observations.set(id, value);
          issues.delete(id);
          lastError = null;
        } catch (error) {
          if ([403, 404].includes(error.status) && !observations.has(id))
            continue;
          issues.add(id);
          lastError =
            "Issuer market refresh is delayed; dated reports remain available.";
          if (![403, 404].includes(error.status)) {
            retryAt = now() + HOUR;
            break;
          }
        }
      }
    })().finally(() => {
      work = null;
    });
  }
  return {
    async landscape(params = new URLSearchParams()) {
      if ([...params.keys()].length)
        throw badRequest(
          "The issuer landscape does not accept filters. Select an issuer in the page.",
        );
      const catalog = await getCatalog(),
        reports = await collect(
          new Set(
            catalog.stocks.flatMap((s) => s.products.map((p) => p.issuer)),
          ),
        );
      const result = buildIssuerLandscape(catalog, reports, now());
      refresh(
        result.issuers
          .map(
            (r) =>
              REPORT_IDS[r.id] ||
              [...observations.keys()].find(
                (id) => normalizeIssuer(id) === r.id,
              ),
          )
          .filter(Boolean),
      );
      return {
        ...result,
        refreshing: !!work,
        refreshWarning:
          lastError ||
          (issues.size
            ? "Some issuer reports are unavailable. Available dated reports remain visible."
            : null),
        retryAt: retryAt > now() ? new Date(retryAt).toISOString() : null,
      };
    },
    async assets(params = new URLSearchParams()) {
      const issuer = params.get("issuer"),
        rawPage = params.get("page") || "1",
        query = params.get("q") || "",
        chain = params.get("chain") || "all",
        type = params.get("type") || "all",
        includeWrapped = params.get("wrappers") === "1";
      if (
        !/^[a-z0-9-]{1,80}$/.test(issuer || "") ||
        !/^[1-9]\d{0,2}$/.test(rawPage) ||
        Number(rawPage) > 250 ||
        query.length > 80 ||
        !["all", "Stock", "ETF", "Unclassified"].includes(type) ||
        (params.has("wrappers") && !["0", "1"].includes(params.get("wrappers")))
      )
        throw badRequest(
          "Choose a valid issuer, asset type and page; search accepts up to 80 characters.",
        );
      const catalog = await getCatalog();
      if (
        !catalog.stocks.some((s) => s.products.some((p) => p.issuer === issuer))
      )
        throw badRequest("Choose an issuer from the verified catalog.");
      if (
        chain !== "all" &&
        !catalog.stocks.some((s) =>
          s.products.some(
            (p) =>
              p.issuer === issuer &&
              p.deployments.some((d) => d.chain === chain),
          ),
        )
      )
        throw badRequest("Choose a network used by this issuer.");
      const matches = selectIssuerAssets(catalog, {
          issuer,
          query,
          chain,
          type,
          includeWrapped,
        }),
        perPage = 25,
        page = Math.min(
          Number(rawPage),
          Math.max(1, Math.ceil(matches.length / perPage)),
        ),
        selected = matches.slice((page - 1) * perPage, page * perPage),
        ids = [
          ...new Set(
            selected
              .flatMap((s) => s.products.map((p) => p.coinId))
              .filter(Boolean),
          ),
        ].slice(0, 250);
      let markets = { rows: [], retrievedAt: null },
        warning = null;
      try {
        if (ids.length) markets = await getMarkets(ids);
        warning = markets.warning || null;
      } catch (error) {
        warning =
          "Token market observations could not be refreshed. Asset identities and issuer links remain available.";
      }
      return {
        issuer,
        rows: issuerAssetRows(selected, markets.rows),
        page,
        perPage,
        total: matches.length,
        pages: Math.max(1, Math.ceil(matches.length / perPage)),
        retrievedAt: markets.retrievedAt,
        catalogAt: catalog.fetchedAt,
        stale: markets.stale === true,
        warning,
      };
    },
  };
}
const desk = createIssuerDesk();
export const issuersView = (params) => desk.landscape(params);
export const issuerAssetsView = (params) => desk.assets(params);

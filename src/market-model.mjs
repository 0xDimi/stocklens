import { findStocks, SOURCE_CLOCK_SKEW_MS } from "./model.mjs";

export const MARKET_COLUMNS = [
  ["stock", "Stock"],
  ["listed", "Listed price"],
  ["token", "Tokenized price"],
  ["change", "24h change"],
  ["premium", "Onchain premium"],
  ["turnover", "24h turnover"],
  ["tokenCap", "Tokenized cap"],
  ["volume", "24h volume"],
  ["networks", "Networks"],
  ["versions", "Versions"],
  ["companyCap", "Company cap"],
  ["pe", "Fiscal-year P/E"],
];
export const DEFAULT_MARKET_COLUMNS = MARKET_COLUMNS.slice(0, 10).map(
  ([id]) => id,
);
// Widths cover values and their short source labels. Every visible column gets
// a width so the fixed table layout cannot put all spare room in one metric.
export const MARKET_COLUMN_WIDTHS = {
  listed: 122,
  token: 124,
  change: 76,
  premium: 140,
  turnover: 108,
  tokenCap: 110,
  volume: 110,
  networks: 98,
  versions: 128,
  companyCap: 126,
  pe: 138,
};
export function normalizeMarketColumns(
  value,
  { upgradeLegacyDefaults = false } = {},
) {
  if (!Array.isArray(value) || !value.length)
    return [...DEFAULT_MARKET_COLUMNS];
  const chosen = new Set(["stock", ...value]);
  // This migration runs only when reading v1 storage. V2 users may hide the
  // new column without having their choice reversed on a later visit.
  if (upgradeLegacyDefaults) chosen.add("turnover");
  const columns = MARKET_COLUMNS.map(([id]) => id).filter((id) =>
    chosen.has(id),
  );
  return columns.length > 1 ? columns : [...DEFAULT_MARKET_COLUMNS];
}
export function marketTurnover(market) {
  if (
    !Number.isFinite(market?.volume24h) ||
    market.volume24h < 0 ||
    !Number.isFinite(market?.marketCap) ||
    market.marketCap <= 0
  )
    return null;
  const percent = (market.volume24h / market.marketCap) * 100;
  return Number.isFinite(percent) ? percent : null;
}
const sourceURL = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
};

// Network adapter coverage is catalog metadata. Conversion readiness requires an
// actual sourced observation; neither state asserts an executable trade.
export function marketReadiness(
  stock,
  {
    chains = [],
    detail,
    quotes,
    chain = "all",
    issuer = "all",
    now = Date.now(),
  } = {},
) {
  const products = stock.products.filter(
      (p) => issuer === "all" || p.issuer === issuer,
    ),
    networks = new Set(
      products
        .flatMap((p) => p.deployments)
        .filter((d) => chain === "all" || d.chain === chain)
        .map((d) => d.chain),
    ),
    quoteNetworks = chains
      .filter((c) => c.quotable && networks.has(c.id))
      .map((c) => c.id),
    scoped = (observation) =>
      observation &&
      networks.has(observation.chain) &&
      (issuer === "all" || observation.issuer === issuer),
    observations = [
      ...(scoped(detail?.spot) && detail.spot.conversionVerified === true
        ? [{ ...detail.spot, observedAt: detail.spot.at }]
        : []),
      ...(scoped(detail?.buyObservation) &&
      detail.buyObservation.conversionVerified === true &&
      Number.isFinite(detail.buyObservation.expiresAt)
        ? [
            {
              ...detail.buyObservation,
              observedAt: detail.buyObservation.priceAt,
            },
          ]
        : []),
      ...[detail?.spotPremium, detail?.premium]
        .filter(scoped)
        .map((p) => ({ ...p, observedAt: p.priceAt })),
      ...(Array.isArray(quotes) ? quotes : quotes?.rows || [])
        .filter(
          (q) =>
            scoped(q) &&
            q.status === "quoted" &&
            q.equivalentShares > 0 &&
            q.conversionVerified !== false &&
            Number.isFinite(q.expiresAt),
        )
        .map((q) => ({ ...q, source: q.quoteSource, observedAt: q.fetchedAt })),
    ].filter(
      (o) =>
        Number.isFinite(o.sharesPerToken) &&
        o.sharesPerToken > 0 &&
        sourceURL(o.conversionSource) &&
        sourceURL(o.source) &&
        Number.isFinite(o.observedAt) &&
        o.observedAt <= now + SOURCE_CLOCK_SKEW_MS,
    ),
    fresh = observations.find(
      (o) =>
        !o.stale &&
        now - o.observedAt <= 300000 &&
        (!Number.isFinite(o.expiresAt) || o.expiresAt > now),
    );
  const conversion = fresh
    ? "verified"
    : observations.length
      ? "expired"
      : detail?.status === "loading"
        ? "loading"
        : detail?.status === "error"
          ? "unavailable"
          : detail?.status === "ready" || quotes
            ? "not-verified"
            : "unchecked";
  return {
    quoteNetworks,
    conversion,
    observation: fresh || observations[0] || null,
  };
}
export function selectMarketRows(
  rows,
  {
    query = "",
    type = "all",
    chain = "all",
    issuer = "all",
    sort = "volume",
    savedOnly = false,
    saved = new Set(),
    quoteCoverage = "all",
    conversion = "all",
    getReadiness = () => ({ quoteNetworks: [], conversion: "unchecked" }),
  } = {},
) {
  return findStocks(rows, query)
    .filter(
      (row) =>
        (type === "all" || row.category === type) &&
        (!savedOnly || saved.has(row.id)) &&
        ((chain === "all" && issuer === "all") ||
          row.products.some(
            (p) =>
              (issuer === "all" || p.issuer === issuer) &&
              (chain === "all" || p.deployments.some((d) => d.chain === chain)),
          )) &&
        (quoteCoverage === "all" ||
          getReadiness(row).quoteNetworks.length > 0 ===
            (quoteCoverage === "supported")) &&
        (conversion === "all" || getReadiness(row).conversion === conversion),
    )
    .sort((a, b) => {
      if (sort === "name") return a.ticker.localeCompare(b.ticker);
      const value = (r) =>
        sort === "versions"
          ? r.products.length
          : sort === "chains"
            ? new Set(
                r.products.flatMap((p) => p.deployments.map((d) => d.chain)),
              ).size
            : sort === "turnover"
              ? marketTurnover(r.market)
              : r.market?.[
                  {
                    volume: "volume24h",
                    cap: "marketCap",
                    price: "price",
                    gainers: "change24h",
                    losers: "change24h",
                  }[sort] || "volume24h"
                ];
      const av = value(a),
        bv = value(b);
      if (!Number.isFinite(av))
        return Number.isFinite(bv) ? 1 : a.ticker.localeCompare(b.ticker);
      if (!Number.isFinite(bv)) return -1;
      return (
        (sort === "losers" ? av - bv : bv - av) ||
        a.ticker.localeCompare(b.ticker)
      );
    });
}
// Never derive a premium from a nominal token price with assumed 1:1 units.
export function premium(observation, benchmark, now = Date.now()) {
  if (
    !observation?.conversionVerified ||
    observation.currency !== "USD" ||
    benchmark?.currency !== "USD"
  )
    return null;
  if (
    ![observation.price, observation.sharesPerToken, benchmark.price].every(
      (v) => Number.isFinite(v) && v > 0,
    )
  )
    return null;
  const retrieved = Date.parse(benchmark.retrievedAt);
  const lastClose =
    benchmark.priceSession === "Closed" &&
    !benchmark.priceStale &&
    Number.isFinite(retrieved) &&
    retrieved <= now + SOURCE_CLOCK_SKEW_MS &&
    now - retrieved <= 300000 &&
    Number.isFinite(benchmark.at) &&
    benchmark.at <= now + SOURCE_CLOCK_SKEW_MS &&
    now - benchmark.at <= 7 * 86400000;
  if (
    !Number.isFinite(observation.at) ||
    observation.at > now + SOURCE_CLOCK_SKEW_MS ||
    now - observation.at > 300000
  )
    return null;
  if (
    !lastClose &&
    (!Number.isFinite(benchmark.at) ||
      benchmark.at >
        now +
          (benchmark.timePrecisionMs === 60000
            ? 60000
            : SOURCE_CLOCK_SKEW_MS) ||
      now - benchmark.at > 300000 ||
      Math.abs(observation.at - benchmark.at) > 120000)
  )
    return null;
  return (
    (observation.price / observation.sharesPerToken / benchmark.price - 1) * 100
  );
}
export function needsReference(reference, now = Date.now()) {
  const retrieved = Date.parse(reference?.retrievedAt);
  return (
    !reference ||
    reference.stale === true ||
    !Number.isFinite(retrieved) ||
    retrieved > now + SOURCE_CLOCK_SKEW_MS ||
    now - retrieved > 300000
  );
}

// The display may retain an expired observation, but must label its age.
export function observedPremiumState(observation, now = Date.now()) {
  if (!Number.isFinite(observation?.value)) return null;
  return {
    value: observation.value,
    stale:
      observation.stale === true ||
      !Number.isFinite(observation.expiresAt) ||
      observation.expiresAt <= now,
  };
}

// Shared row cache and bounded transport queue. Rendering never starts I/O.
export function createMarketDetailsLoader({
  fetchDetails,
  batchSize = 5,
  maxActive = 2,
  onChange = () => {},
  onDetails = () => {},
  now = Date.now,
}) {
  const cache = new Map(),
    active = new Set(),
    refreshAfter = new Set();
  let wanted = new Set(),
    queue = [];
  const restore = (id) => {
    const entry = cache.get(id);
    if (!entry || entry.status !== "loading") return;
    if (entry.checkedAt != null || entry.reference || entry.premium)
      cache.set(id, { ...entry, status: entry.error ? "error" : "ready" });
    else cache.delete(id);
  };
  const running = (id) =>
    [...active].some((r) => !r.controller.signal.aborted && r.ids.includes(id));
  const pump = () => {
    while (active.size < maxActive && queue.length) {
      const ids = queue.splice(0, batchSize),
        controller = new AbortController();
      const request = { ids, controller };
      active.add(request);
      Promise.resolve()
        .then(() => {
          if (controller.signal.aborted)
            throw new DOMException("Aborted", "AbortError");
          return fetchDetails(ids, controller.signal, (rows) => {
            if (controller.signal.aborted) return;
            for (const row of rows) {
              if (!ids.includes(row.id)) continue;
              const entry = mergeMarketDetails(cache.get(row.id), row);
              cache.set(row.id, { ...entry, status: "loading" });
              onDetails(row.id, cache.get(row.id));
            }
            onChange();
          });
        })
        .then((data) => {
          if (controller.signal.aborted) return;
          if (!Array.isArray(data?.rows))
            throw new Error("Invalid market details response");
          for (const id of ids) {
            const row = data.rows.find((row) => row.id === id);
            if (!row) {
              cache.set(id, {
                ...cache.get(id),
                status: "error",
                checkedAt: now(),
                error: "Asset missing from market details response",
              });
              continue;
            }
            const prior = cache.get(id);
            const merged = mergeMarketDetails(prior, row);
            cache.set(id, {
              ...prior,
              ...merged,
              reference:
                (row.reference ? merged.reference : null) ??
                (prior?.reference
                  ? {
                      ...prior.reference,
                      stale: true,
                      priceStale: true,
                      marketCapStale: true,
                      peStale: true,
                      staleReason:
                        row.referenceReason ||
                        "Nasdaq refresh returned no reference; the previous observation is retained.",
                    }
                  : null),
              // Keep the last observation visible if a refresh has no new one.
              premium:
                row.premium ??
                (prior?.premium ? { ...prior.premium, stale: true } : null),
              buyObservation:
                row.buyObservation ??
                (prior?.buyObservation
                  ? { ...prior.buyObservation, stale: true }
                  : null),
              spot:
                row.spot ??
                (prior?.spot
                  ? {
                      ...prior.spot,
                      stale: true,
                      staleReason:
                        row.spotPremiumReason ||
                        "The latest pool-price refresh returned no observation; the original dated snapshot is retained.",
                    }
                  : null),
              spotPremium:
                row.spotPremium ??
                (prior?.spotPremium
                  ? {
                      ...prior.spotPremium,
                      stale: true,
                      staleReason:
                        row.spotPremiumReason ||
                        "The latest spot-premium refresh returned no comparable observation; the original dated comparison is retained.",
                    }
                  : null),
              status: "ready",
              error: null,
              checkedAt: now(),
              retrievedAt: data.retrievedAt,
            });
            onDetails(id, cache.get(id));
          }
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          for (const id of ids) {
            const prior = cache.get(id);
            cache.set(id, {
              ...prior,
              reference: prior?.reference
                ? {
                    ...prior.reference,
                    stale: true,
                    priceStale: true,
                    marketCapStale: true,
                    peStale: true,
                    staleReason: error.message,
                  }
                : null,
              premium: prior?.premium
                ? { ...prior.premium, stale: true, staleReason: error.message }
                : null,
              buyObservation: prior?.buyObservation
                ? {
                    ...prior.buyObservation,
                    stale: true,
                    staleReason: error.message,
                  }
                : null,
              spot: prior?.spot
                ? { ...prior.spot, stale: true, staleReason: error.message }
                : null,
              spotPremium: prior?.spotPremium
                ? {
                    ...prior.spotPremium,
                    stale: true,
                    staleReason: error.message,
                  }
                : null,
              status: "error",
              checkedAt: now(),
              error: error.message || "Market details request failed",
            });
          }
        })
        .finally(() => {
          active.delete(request);
          for (const id of ids)
            if (refreshAfter.delete(id) && wanted.has(id)) {
              cache.set(id, { ...cache.get(id), status: "loading" });
              if (!queue.includes(id)) queue.push(id);
            }
          pump();
          onChange();
        });
    }
  };
  return {
    get: (id) => cache.get(id),
    ingestReference(id, reference) {
      if (reference) cache.set(id, { ...cache.get(id), reference });
    },
    // Shared cache writes are silent. Observation dates belong to the source;
    // opening another page must never make old data appear freshly observed.
    ingestDetails(id, row) {
      if (!row || typeof row !== "object") return;
      const prior = cache.get(id),
        next = { ...prior, ...row };
      const timestamp = (value) => {
        const raw = value?.at ?? value?.priceAt ?? value?.retrievedAt;
        return typeof raw === "number" ? raw : Date.parse(raw);
      };
      for (const key of [
        "reference",
        "spot",
        "spotPremium",
        "premium",
        "buyObservation",
      ]) {
        if (!prior?.[key]) continue;
        if (!Object.hasOwn(row, key)) {
          next[key] = prior[key];
          continue;
        }
        const older = row[key] && timestamp(prior[key]) > timestamp(row[key]);
        if (!row[key] || older)
          next[key] =
            !row[key] || row[key].stale === true
              ? { ...prior[key], stale: true }
              : prior[key];
      }
      const retrieved = Date.parse(row.retrievedAt);
      next.checkedAt =
        Math.max(
          prior?.checkedAt || 0,
          Number.isFinite(row.checkedAt)
            ? row.checkedAt
            : Number.isFinite(retrieved) &&
                retrieved <= now() + SOURCE_CLOCK_SKEW_MS
              ? retrieved
              : 0,
        ) || undefined;
      next.status = running(id) ? "loading" : row.status || "ready";
      cache.set(id, next);
    },
    load(ids, { force = false } = {}) {
      wanted = new Set(ids);
      for (const id of queue) restore(id);
      queue = [];
      for (const request of active) {
        if (!request.ids.some((id) => wanted.has(id))) {
          request.controller.abort();
          request.ids.forEach(restore);
        }
      }
      for (const id of wanted) {
        if (running(id)) {
          if (force) refreshAfter.add(id);
          continue;
        }
        const entry = cache.get(id);
        if (
          !force &&
          entry?.checkedAt != null &&
          now() - entry.checkedAt <
            (entry.components && !entry.reference?.price ? 10000 : 60000)
        )
          continue;
        cache.set(id, { ...entry, status: "loading" });
        queue.push(id);
      }
      pump();
      onChange();
    },
  };
}

export function companyMetricState(stock, entry, field) {
  if (stock.category === "ETF") return { value: null, state: "not-applicable" };
  const value = entry?.reference?.[field];
  if (Number.isFinite(value)) return { value, state: "available" };
  if (
    !entry ||
    entry.components?.company === "loading" ||
    (entry.status === "loading" && !entry.components?.company)
  )
    return { value: null, state: "loading" };
  if (entry.status === "error") return { value: null, state: "error" };
  return {
    value: null,
    state: entry.reference?.[field + "Status"] || "unavailable",
  };
}

// Merge observations by their source time. A partial view or failed refresh
// cannot erase a valid field held by a different page.
export function mergeMarketDetails(previous = {}, incoming = {}) {
  const next = { ...previous, ...incoming };
  const time = (value) => {
    const at = value?.at ?? value?.priceAt ?? value?.retrievedAt;
    return typeof at === "number" ? at : Date.parse(at) || 0;
  };
  for (const key of [
    "reference",
    "spot",
    "spotPremium",
    "premium",
    "buyObservation",
  ]) {
    const prior = previous[key],
      value = incoming[key];
    if (!prior) continue;
    if (!value || time(prior) > time(value)) next[key] = prior;
    // Price and company metrics have independent observation times.
    if (key === "reference" && value) {
      const reference = (next.reference = { ...value });
      if (
        prior.price > 0 &&
        (!(value.price > 0) || time(prior) > time(value))
      ) {
        for (const field of [
          "price",
          "at",
          "currency",
          "timePrecisionMs",
          "priceDate",
          "priceTimestamp",
          "priceTimeBasis",
          "changePct",
          "priceSession",
          "isRealTime",
          "priceSource",
          "priceRetrievedAt",
          "retrievedAt",
          "priceStale",
        ])
          if (Object.hasOwn(prior, field)) reference[field] = prior[field];
          else delete reference[field];
        if (!(value.price > 0) && incoming.components?.reference !== "loading")
          reference.priceStale = true;
      }
      for (const field of ["marketCap", "pe"]) {
        if (prior[field] == null) continue;
        const status = value[field + "Status"];
        const completed = ["ready", "unavailable"].includes(
          incoming.components?.company,
        );
        if (completed && ["not-reported", "not-applicable"].includes(status))
          continue;
        const older =
          Date.parse(prior[field + "RetrievedAt"]) >
          Date.parse(value[field + "RetrievedAt"]);
        if (value[field] != null && !older) continue;
        for (const suffix of [
          "",
          "RetrievedAt",
          "Status",
          "Reason",
          "Stale",
          "Period",
          "AsOf",
          "Basis",
          "Source",
        ])
          if (Object.hasOwn(prior, field + suffix))
            reference[field + suffix] = prior[field + suffix];
        if (completed && status === "unavailable") {
          reference[field + "Stale"] = true;
          reference[field + "Reason"] =
            value[field + "Reason"] ||
            "The company-data refresh failed; the original dated observation is retained.";
        }
      }
    }
  }
  next.checkedAt =
    Math.max(previous.checkedAt || 0, incoming.checkedAt || 0) || undefined;
  return next;
}

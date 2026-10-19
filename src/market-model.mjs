import { findStocks } from "./model.mjs";
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
  } = {},
) {
  return findStocks(rows, query)
    .filter(
      (row) =>
        (type === "all" || row.category === type) &&
        (!savedOnly || saved.has(row.id)) &&
        (chain === "all" ||
          row.products.some((p) =>
            p.deployments.some((d) => d.chain === chain),
          )) &&
        (issuer === "all" || row.products.some((p) => p.issuer === issuer)),
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
    retrieved <= now &&
    now - retrieved <= 300000 &&
    Number.isFinite(benchmark.at) &&
    benchmark.at <= now &&
    now - benchmark.at <= 7 * 86400000;
  if (
    !Number.isFinite(observation.at) ||
    observation.at > now ||
    now - observation.at > 300000
  )
    return null;
  if (
    !lastClose &&
    (!Number.isFinite(benchmark.at) ||
      benchmark.at > now + (benchmark.timePrecisionMs === 60000 ? 60000 : 0) ||
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
    retrieved > now ||
    now - retrieved > 300000
  );
}

// The display may retain an expired observation, but must label its age.
export function observedPremiumState(observation, now = Date.now()) {
  if (!Number.isFinite(observation?.value)) return null;
  return {
    value: observation.value,
    stale:
      !Number.isFinite(observation.expiresAt) || observation.expiresAt <= now,
  };
}

// Shared row cache and bounded transport queue. Rendering never starts I/O.
export function createMarketDetailsLoader({
  fetchDetails,
  onChange = () => {},
  now = Date.now,
}) {
  const cache = new Map(),
    active = new Set();
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
    while (active.size < 2 && queue.length) {
      const ids = queue.splice(0, 5),
        controller = new AbortController();
      const request = { ids, controller };
      active.add(request);
      Promise.resolve()
        .then(() => {
          if (controller.signal.aborted)
            throw new DOMException("Aborted", "AbortError");
          return fetchDetails(ids, controller.signal);
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
            cache.set(id, {
              ...prior,
              ...row,
              reference:
                row.reference ??
                (prior?.reference
                  ? {
                      ...prior.reference,
                      stale: true,
                      marketCapStale: true,
                      peStale: true,
                      staleReason:
                        row.referenceReason ||
                        "Nasdaq refresh returned no reference; the previous observation is retained.",
                    }
                  : null),
              // Keep the last observation visible if a refresh has no new one.
              premium: row.premium ?? prior?.premium ?? null,
              status: "ready",
              error: null,
              checkedAt: now(),
              retrievedAt: data.retrievedAt,
            });
          }
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          for (const id of ids)
            cache.set(id, {
              ...cache.get(id),
              status: "error",
              checkedAt: now(),
              error: error.message || "Market details request failed",
            });
        })
        .finally(() => {
          active.delete(request);
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
        if (running(id)) continue;
        const entry = cache.get(id);
        if (
          !force &&
          entry?.checkedAt != null &&
          now() - entry.checkedAt < 60000
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
  if (!entry || entry.status === "loading")
    return { value: null, state: "loading" };
  if (entry.status === "error") return { value: null, state: "error" };
  return {
    value: null,
    state: entry.reference?.[field + "Status"] || "unavailable",
  };
}

import { mergeMarketDetails } from "./market-model.mjs";
// Canonical asset IDs, rather than tickers, keep similarly named securities distinct.
export function canonicalSelection(ids, stocks) {
  const known = new Set(stocks.map((stock) => stock.id));
  return [...new Set(ids)].filter((id) => known.has(id)).slice(0, 5);
}
export function profileComparisonSelection(ids, profileId, stocks) {
  return canonicalSelection(
    [...ids, ...(profileId ? [profileId] : [])],
    stocks,
  );
}

export function mergeProfileDetails(
  previous = {},
  incoming,
  checkedAt = incoming?.checkedAt,
) {
  if (
    !incoming ||
    (previous.detailsCheckedAt &&
      !incoming.components &&
      (!Number.isFinite(checkedAt) || checkedAt <= previous.detailsCheckedAt))
  )
    return previous;
  const fields = [
    "reference",
    "referenceReason",
    "components",
    "spotPremium",
    "spotPremiumReason",
    "premium",
    "premiumReason",
    "buyObservation",
    "spot",
    "spotReason",
  ];
  const next = { ...previous, detailsCheckedAt: checkedAt || 0 };
  for (const field of fields)
    if (Object.hasOwn(incoming, field)) next[field] = incoming[field];
  // Field-level price reuse also applies while streaming independent sources.
  if (incoming.components) {
    const merged = mergeMarketDetails(previous, incoming);
    for (const field of fields)
      if (Object.hasOwn(merged, field)) next[field] = merged[field];
  }
  return next;
}

// Age source observations against the feed cadence, never the page retrieval.
// A source-dated close remains the disclosed close until the source flags it.
export function observationIsStale(
  observation,
  now = Date.now(),
  { intervalMs = 600000, dateOnly = false } = {},
) {
  if (observation?.stale === true || observation?.priceStale === true)
    return true;
  if (
    dateOnly ||
    (/^\d{4}-\d{2}-\d{2}$/.test(observation?.priceDate || "") &&
      (observation.priceSession === "Closed" ||
        observation.timePrecisionMs >= 86400000))
  )
    return false;
  const raw = observation?.updatedAt ?? observation?.at ?? observation;
  const at = typeof raw === "number" ? raw : Date.parse(raw);
  return !Number.isFinite(at) || at > now + 60000 || now - at >= intervalMs;
}

// The page timer owns scheduling; this guard bounds visible refreshes even when
// visibility changes and timer callbacks arrive together.
export function createVisiblePageRefresh({
  refresh,
  isVisible,
  isBusy = () => false,
  now = Date.now,
  intervalMs = 60000,
}) {
  let lastStarted = now(),
    pending = null;
  return {
    reset() {
      lastStarted = now();
    },
    tick() {
      if (pending) return pending;
      if (!isVisible() || isBusy() || now() - lastStarted < intervalMs)
        return Promise.resolve();
      lastStarted = now();
      pending = Promise.resolve()
        .then(refresh)
        .finally(() => {
          pending = null;
        });
      return pending;
    },
  };
}
export function productCoverage(products = []) {
  return {
    versions: products.length,
    issuers: new Set(products.map((product) => product.issuer)).size,
    networks: [
      ...new Set(
        products.flatMap((product) =>
          (product.deployments || []).map((deployment) => deployment.chain),
        ),
      ),
    ],
  };
}
export function chartSeries(samples, width = 720, height = 220) {
  if (
    !Array.isArray(samples) ||
    samples.length < 2 ||
    !samples.every((value) => Number.isFinite(value) && value > 0)
  )
    return null;
  const min = Math.min(...samples),
    max = Math.max(...samples);
  return {
    points: samples
      .map(
        (value, index) =>
          `${+((index / (samples.length - 1)) * width).toFixed(2)},${+(max === min ? height / 2 : ((max - value) / (max - min)) * height).toFixed(2)}`,
      )
      .join(" "),
    min,
    max,
    first: samples[0],
    last: samples.at(-1),
    count: samples.length,
  };
}
export function profileMetric(stock, entry, field) {
  const name = field === "pe" ? "P/E" : "capitalization";
  if (stock.category === "ETF")
    return {
      value: null,
      label: "Not applicable",
      note: `Company ${name} does not apply to an ETF.`,
    };
  const r = entry?.reference,
    value = r?.[field];
  if (Number.isFinite(value))
    return {
      value,
      label: null,
      note:
        field === "pe"
          ? [
              r.peBasis || "Fiscal-year P/E",
              r.pePeriod || "Period not supplied",
              r.peAsOf
                ? `As of ${r.peAsOf}`
                : "Fundamental as-of date not disclosed",
            ].join(" · ")
          : r.marketCapAsOf
            ? `As of ${r.marketCapAsOf}`
            : "Fundamental as-of date not disclosed",
    };
  const loading = entry?.components
    ? entry.components.company === "loading"
    : entry?.loading;
  return {
    value: null,
    label: loading ? "Loading…" : "Unavailable",
    note: loading
      ? "Checking company data…"
      : r?.[field + "Reason"] ||
        entry?.referenceReason ||
        "The source has not supplied this field.",
  };
}
export function profileSpot(entry, now = Date.now()) {
  const p = entry?.spotPremium;
  return Number.isFinite(p?.value)
    ? {
        value: p.value,
        stale:
          p.stale === true ||
          !Number.isFinite(p.expiresAt) ||
          p.expiresAt <= now,
      }
    : null;
}

// A venue lookup is explicit and token-wide. Keep transport bounded as people
// inspect several products; opening an issuer never triggers this lookup.
export function createVenueLoader({
  fetchVenues,
  onChange = () => {},
  now = Date.now,
}) {
  const cache = new Map(),
    running = new Map();
  let queue = [];
  function pump() {
    while (running.size < 2 && queue.length) {
      const job = queue.shift(),
        controller = new AbortController();
      running.set(job.key, controller);
      Promise.resolve()
        .then(() => fetchVenues({ ...job.input, signal: controller.signal }))
        .then((data) => {
          if (controller.signal.aborted) return;
          if (!Array.isArray(data?.rows))
            throw new Error(
              "Trading venue source returned an invalid response.",
            );
          cache.set(job.key, {
            status: "ready",
            rows: data.rows.slice(0, 10),
            total: data.rows.length,
            checkedAt: now(),
            retrievedAt: data.retrievedAt,
            warnings: data.warnings || [],
            basis: data.basis || null,
          });
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            cache.set(job.key, {
              ...cache.get(job.key),
              status: "error",
              error: error.message || "Trading venues could not be loaded.",
            });
        })
        .finally(() => {
          if (running.get(job.key) === controller) running.delete(job.key);
          pump();
          onChange();
        });
    }
  }
  return {
    get: (key) => cache.get(key),
    load(key, input) {
      const cached = cache.get(key);
      if (
        cached?.status === "loading" ||
        (cached?.status === "ready" && now() - cached.checkedAt < 60000)
      )
        return;
      cache.set(key, { ...cached, status: "loading", error: null });
      queue.push({ key, input });
      pump();
      onChange();
    },
    cancel() {
      queue = [];
      for (const controller of running.values()) controller.abort();
      running.clear();
      for (const [key, value] of cache)
        if (value.status === "loading") {
          if (value.checkedAt) cache.set(key, { ...value, status: "ready" });
          else cache.delete(key);
        }
    },
  };
}

// A cached price-only result is immediately useful, but does not satisfy the
// company metrics requested by a stock overview or cross-stock comparison.
export function needsCompanyDetails(detail) {
  return (
    !!detail?.components &&
    !["ready", "unavailable"].includes(detail.components.company)
  );
}

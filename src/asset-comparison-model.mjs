// Canonical asset IDs, rather than tickers, keep similarly named securities distinct.
export function canonicalSelection(ids, stocks) {
  const known = new Set(stocks.map((stock) => stock.id));
  return [...new Set(ids)].filter((id) => known.has(id)).slice(0, 5);
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
  return {
    value: null,
    label: entry?.loading ? "Loading…" : "Unavailable",
    note:
      r?.[field + "Reason"] ||
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

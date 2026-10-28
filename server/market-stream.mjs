import { marketDetailsView } from "./market-details.mjs";
import { mergeMarketDetails } from "../src/market-model.mjs";

// Share ongoing work across visitors, including overlapping pages. Cached
// observations keep source dates; the check time only schedules another refresh.
export function createMarketStream({
  getDetails = marketDetailsView,
  now = Date.now,
} = {}) {
  const cache = new Map(),
    pending = new Map(),
    partial = new Map(),
    listeners = new Set();
  return async (params, onRow) => {
    const ids = [...new Set((params.get("ids") || "").split(","))];
    if (
      !ids.length ||
      ids.length > 25 ||
      ids.some((id) => !/^[A-Za-z0-9.:\-]{1,100}$/.test(id))
    )
      throw Object.assign(new Error("Choose 1–25 exact catalog asset IDs."), {
        status: 400,
      });
    const company = params.get("company") === "1",
      buy = params.get("buy") === "1";
    const key = (id) => `${id}:${Number(company)}:${Number(buy)}`;
    const subscription = { keys: new Set(ids.map(key)), onRow };
    listeners.add(subscription);
    const publish = (row) => {
      for (const listener of listeners)
        if (listener.keys.has(key(row.id))) listener.onRow(row);
    };
    try {
      const missing = [],
        jobs = new Set();
      for (const id of ids) {
        const saved = cache.get(key(id));
        if (saved) onRow(saved.row);
        if (pending.has(key(id))) {
          if (partial.has(key(id))) onRow(partial.get(key(id)));
          jobs.add(pending.get(key(id)));
        } else if (
          !saved ||
          now() - saved.checkedAt >=
            (saved.row.reference?.price > 0 ? 60000 : 10000)
        )
          missing.push(id);
      }
      if (missing.length) {
        const latest = new Map(
          missing.map((id) => [id, cache.get(key(id))?.row || {}]),
        );
        const job = Promise.resolve()
          .then(() =>
            getDetails(new URLSearchParams({ ids: missing.join(",") }), {
              priceOnly: !company,
              quotes: buy ? true : "missing",
              onRow: (row) => {
                const merged = mergeMarketDetails(latest.get(row.id), row);
                latest.set(row.id, merged);
                partial.set(key(row.id), { ...merged, status: "loading" });
                publish({ ...merged, status: "loading" });
              },
            }),
          )
          .then((data) => {
            for (const row of data.rows) {
              const merged = {
                ...mergeMarketDetails(latest.get(row.id), row),
                status: "ready",
                checkedAt: now(),
              };
              cache.set(key(row.id), { row: merged, checkedAt: now() });
              publish(merged);
            }
            while (cache.size > 500) cache.delete(cache.keys().next().value);
          })
          .finally(() => {
            for (const id of missing) {
              pending.delete(key(id));
              partial.delete(key(id));
            }
          });
        for (const id of missing) pending.set(key(id), job);
        jobs.add(job);
      }
      await Promise.all(jobs);
    } finally {
      listeners.delete(subscription);
    }
  };
}
export const streamMarketDetails = createMarketStream();

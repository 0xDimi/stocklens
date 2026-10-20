import { observationStore } from "./observation-store.mjs";
const RETRIEVAL_MAX_AGE = 86400000;
const PRICE_MAX_AGE = 7 * 86400000;
const PRICE_FIELDS = [
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
];
function usable(row, now) {
  const retrieved = Date.parse(row?.priceRetrievedAt || row?.retrievedAt);
  return (
    Number.isFinite(row?.price) &&
    row.price > 0 &&
    row.currency === "USD" &&
    Number.isFinite(row.at) &&
    row.at <= now + (row.timePrecisionMs === 60000 ? 60000 : 0) &&
    now - row.at <= PRICE_MAX_AGE &&
    Number.isFinite(retrieved) &&
    retrieved <= now &&
    now - retrieved <= RETRIEVAL_MAX_AGE
  );
}
// A successful identity response with an empty quote must not overwrite the
// last usable price. Retention never carries old company metrics into new data.
export function createReferenceRetention({ file } = {}) {
  const store = observationStore(file, null, RETRIEVAL_MAX_AGE);
  const records = new Map();
  const loaded = store
    .load()
    .then((rows) => rows.forEach(([key, value]) => records.set(key, value)));
  return {
    async merge(row, now = Date.now()) {
      if (!row?.id || !row.ticker) return row;
      await loaded;
      const cacheKey =
        "/" + encodeURIComponent(row.id) + "/" + encodeURIComponent(row.ticker);
      const saved = records.get(cacheKey)?.data;
      if (usable(row, now)) {
        const data = Object.fromEntries(
          ["id", "ticker", ...PRICE_FIELDS].map((field) => [
            field,
            row[field] ?? null,
          ]),
        );
        data.priceRetrievedAt ||= row.retrievedAt;
        if (!row.priceStale) {
          records.set(cacheKey, { data, retrievedAt: data.priceRetrievedAt });
          if (records.size > 500) records.delete(records.keys().next().value);
          await store.save(records);
        }
        return {
          ...row,
          priceAgeMs: Math.max(0, now - row.at),
          priceRetrievalAgeMs: now - Date.parse(data.priceRetrievedAt),
          priceMaxAgeMs: PRICE_MAX_AGE,
        };
      }
      if (
        !saved ||
        saved.id !== row.id ||
        saved.ticker !== row.ticker ||
        !usable(saved, now)
      ) {
        if (row.price == null) return row;
        return {
          ...row,
          price: null,
          at: null,
          available: false,
          priceReason:
            "The listed-price observation is expired or lacks verified USD units; no current listed price is asserted.",
          priceAgeMs: Number.isFinite(row.at)
            ? Math.max(0, now - row.at)
            : null,
          priceMaxAgeMs: PRICE_MAX_AGE,
        };
      }
      return {
        ...row,
        ...Object.fromEntries(
          PRICE_FIELDS.map((field) => [field, saved[field] ?? null]),
        ),
        available: true,
        priceStale: true,
        stale: true,
        priceAgeMs: Math.max(0, now - saved.at),
        priceRetrievalAgeMs: now - Date.parse(saved.priceRetrievedAt),
        priceMaxAgeMs: PRICE_MAX_AGE,
        priceReason:
          "The current source response has no usable dated price; the previous listed-price observation is retained with its original time.",
        staleReason:
          "A previous successful listed-price observation is retained; its original price and retrieval times have not been refreshed.",
      };
    },
  };
}

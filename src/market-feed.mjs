import { indexMarketObservations } from "./market-observations.mjs";

const TTL = 600000;
const ORIGIN = "https://api.coingecko.com/api/v3";

// The public API supports CORS. A visitor can recover market observations when
// the server feed is throttled. No key, cookie, wallet or user input is sent.
export function createMarketFeed({
  fetcher = (...args) => fetch(...args),
  now = Date.now,
  storage,
  intervalMs = 12500,
} = {}) {
  const pages = new Map(),
    inflight = new Map();
  let tail = Promise.resolve(),
    nextAt = 0,
    retryAt = 0;
  const read = (key) => {
    try {
      return JSON.parse(storage?.getItem(key) || "null");
    } catch {
      return null;
    }
  };
  const save = (key, value) => {
    try {
      storage?.setItem(key, JSON.stringify(value));
    } catch {
      /* Private mode and full storage remain usable. */
    }
  };
  const cached = (page) => {
    const value =
      pages.get(page) || read("stocklens:public-markets:v1:" + page);
    if (
      !value ||
      !Array.isArray(value.observations) ||
      value.observations.length > 250 ||
      !Number.isFinite(value.at) ||
      value.at > now() ||
      now() - value.at >= TTL ||
      !value.observations.every(
        (row) =>
          Array.isArray(row) &&
          typeof row[0] === "string" &&
          (row[1] === null || typeof row[1] === "object"),
      )
    )
      return null;
    return value;
  };
  async function publicPage(page) {
    const saved = cached(page);
    if (saved) return saved;
    retryAt = Math.max(
      retryAt,
      Number(read("stocklens:public-markets:retry")) || 0,
    );
    if (retryAt > now())
      throw new Error(
        "CoinGecko is rate limited; saved prices remain visible.",
      );
    if (inflight.has(page)) return inflight.get(page);
    const work = tail
      .catch(() => {})
      .then(async () => {
        if (retryAt > now())
          throw new Error(
            "CoinGecko is rate limited; saved prices remain visible.",
          );
        const wait = Math.max(0, nextAt - now());
        if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
        nextAt = now() + intervalMs;
        const response = await fetcher(
          ORIGIN +
            "/rwas/markets?" +
            new URLSearchParams({
              per_page: "250",
              page: String(page),
              order: "volume_desc",
              sparkline: "false",
            }),
          {
            credentials: "omit",
            referrerPolicy: "no-referrer",
            signal: AbortSignal.timeout(10000),
          },
        );
        if (!response.ok) {
          if (response.status === 429) {
            const header = response.headers.get("Retry-After");
            const delay =
              header && /^\d+$/.test(header)
                ? Number(header) * 1000
                : Date.parse(header) - now();
            retryAt =
              now() +
              Math.max(
                60000,
                Number.isFinite(delay) ? Math.min(delay, 86400000) : 0,
              );
            save("stocklens:public-markets:retry", retryAt);
          }
          throw new Error(
            response.status === 429
              ? "CoinGecko is rate limited; saved prices remain visible."
              : "Market refresh is delayed; saved prices remain visible.",
          );
        }
        const data = await response.json();
        const observations = [...indexMarketObservations(data)];
        if (!observations.length && data.length)
          throw new Error("Invalid CoinGecko market observations.");
        const value = { observations, returned: data.length, at: now() };
        pages.set(page, value);
        save("stocklens:public-markets:v1:" + page, value);
        return value;
      })
      .catch((error) => {
        retryAt = Math.max(retryAt, now() + 30000);
        throw error;
      })
      .finally(() => inflight.delete(page));
    inflight.set(page, work);
    tail = work;
    return work;
  }
  return async (page) => {
    if (!Number.isInteger(page) || page < 1 || page > 10)
      throw new Error("Choose a market page from 1 to 10.");
    const response = await fetcher("/api/screener?page=" + page);
    const base = await response.json();
    if (!response.ok || !Array.isArray(base.rows))
      throw new Error(base.error || "Market data unavailable.");
    const saved = cached(page);
    if (
      !base.stale &&
      base.retrievedAt &&
      (!saved || Date.parse(base.retrievedAt) >= saved.at)
    )
      return base;
    try {
      const value = await publicPage(page),
        observations = new Map(value.observations);
      const rows = base.rows.map((row) => ({
        ...row,
        market: observations.get(row.rwaId) || null,
      }));
      const hasMore = value.returned === 250 && page < 10;
      return {
        ...base,
        rows,
        stale: false,
        refreshState: "fresh",
        marketWarning: null,
        delivery: "browser-public-api",
        retrievedAt: new Date(value.at).toISOString(),
        scope: {
          ...base.scope,
          matched: rows.filter((row) => row.market).length,
          returned: value.returned,
          hasMore,
          nextPage: hasMore ? page + 1 : null,
        },
      };
    } catch (error) {
      return {
        ...base,
        marketWarning: [base.marketWarning, error.message]
          .filter(Boolean)
          .join(" "),
      };
    }
  };
}

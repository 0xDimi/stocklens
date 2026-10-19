import test from "node:test";
import assert from "node:assert/strict";
import { candleGeometry, nearestCandle } from "../src/chart.mjs";
import {
  toggleCompare,
  sortUniverse,
  historyQuery,
  screenerPages,
  marketWarnings,
  parseWatchlist,
} from "../src/terminal.mjs";
test("OHLC geometry preserves real price ordering, gaps and volume; nearest candle respects timestamps", () => {
  const points = [
    { time: 1000, open: 10, high: 12, low: 9, price: 11, volume: 5 },
    { time: 5000, open: 11, high: 13, low: 10, price: 12, volume: 10 },
  ];
  const g = candleGeometry(points, 900, 320);
  assert.equal(g.candles.length, 2);
  assert.ok(g.candles[0].highY < g.candles[0].lowY);
  assert.ok(g.candles[1].x > g.candles[0].x);
  assert.equal(nearestCandle(points, 4700).time, 5000);
  assert.equal(points[0].price, 11);
  assert.equal(candleGeometry([], 900, 320).candles.length, 0);
});
test("comparison shortlist toggles at most three distinct product identities", () => {
  assert.deepEqual(toggleCompare(["a"], "a"), []);
  assert.deepEqual(toggleCompare(["a", "b"], "c"), ["a", "b", "c"]);
  assert.deepEqual(toggleCompare(["a", "b", "c"], "d"), ["a", "b", "c"]);
});
test("universe sorting retains missing prices as unknown and never sorts them as zero-price winners", () => {
  const rows = [
      { id: "a", ticker: "A" },
      { id: "b", ticker: "B" },
      { id: "c", ticker: "C" },
    ],
    m = new Map([
      ["b", { price: 10, volume24h: 4 }],
      ["c", { price: 5, volume24h: 20 }],
    ]);
  assert.deepEqual(
    sortUniverse(rows, m, "price").map((r) => r.id),
    ["c", "b", "a"],
  );
  assert.deepEqual(
    sortUniverse(rows, m, "volume").map((r) => r.id),
    ["c", "b", "a"],
  );
});

test("history query preserves exact token scope and chain for newly discovered pools", () => {
  const q = historyQuery(
    "NVDA",
    {
      id: "eth_pool:xstocks:NVDAx",
      chain: "Ethereum",
      address: "0xc845b2894dbddd03858fd2d643b4ef725fe0849d",
    },
    "1d",
  );
  assert.equal(q.get("token"), "0xc845b2894dbddd03858fd2d643b4ef725fe0849d");
  assert.equal(q.get("chain"), "Ethereum");
  assert.equal(q.get("pool"), "eth_pool:xstocks:NVDAx");
});
test("market polling refreshes all loaded pages without replacing pagination with page one", () => {
  assert.deepEqual(screenerPages([3, 1, 2]), [1, 2, 3]);
  assert.deepEqual(screenerPages([1, 2, 3], 4), [4]);
  assert.deepEqual(screenerPages([]), [1]);
});

test("stock-wide chart reuses its validated discovery scope without an extra token request", () => {
  assert.equal(
    historyQuery(
      "NVDA",
      { id: "pool", chain: "Solana", address: "mint", historyScope: "stock" },
      "1d",
    ).has("token"),
    false,
  );
});

test("stale screener fallback is explicit even when the original error does not say stale", () => {
  const warnings = marketWarnings({
    stale: true,
    warnings: [
      "Last successful observation retained; Data provider rate limit reached. Please refresh shortly.",
    ],
  });
  assert.ok(warnings.some((w) => w.startsWith("Cached market observations")));
  assert.ok(warnings.some((w) => w.startsWith("Last successful")));
});

test("an ordinary background market refresh is never described as failed", () => {
  const warnings = marketWarnings({
    stale: true,
    refreshState: "refreshing",
    marketWarning: null,
  });
  assert.ok(!warnings.some((w) => /failed/i.test(w)));
  assert.ok(warnings.some((w) => /refreshing/i.test(w)));
  assert.deepEqual(
    marketWarnings({
      stale: false,
      marketWarning: null,
      warnings: ["Unrelated catalog warning"],
    }),
    [],
  );
});

test("watchlist import deduplicates exact catalog IDs and rejects malformed files", () => {
  assert.deepEqual(
    parseWatchlist(
      '{"version":1,"assets":["A","A","B","unknown"]}',
      new Set(["A", "B"]),
    ),
    ["A", "B"],
  );
  assert.throws(
    () => parseWatchlist('{"version":2,"assets":[]}', new Set()),
    /version 1/,
  );
  assert.throws(
    () => parseWatchlist('{"version":1,"assets":["<script>"]}', new Set()),
    /version 1/,
  );
});

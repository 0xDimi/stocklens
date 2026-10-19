import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createMarketFeed } from "../src/market-feed.mjs";

const asset = {
  id: "US67066G1040",
  rwaId: "nvidia",
  ticker: "NVDA",
  market: { price: 100 },
};
const backend = {
  rows: [asset, { ...asset, id: "other", rwaId: "other" }],
  stale: true,
  refreshState: "rate-limited",
  marketWarning: "CoinGecko is rate limited.",
  retrievedAt: "2026-10-19T00:00:00Z",
  scope: { page: 1 },
  warnings: [],
};
const observation = {
  id: "nvidia",
  symbol: "nvda",
  tokenized_market_data: {
    current_price: 210,
    market_cap: 3000,
    total_volume: 400,
    last_updated: "2026-10-19T12:00:00Z",
  },
};

async function setup(
  t,
  { fail = false, fresh = false, rows = [observation] } = {},
) {
  const paths = [];
  const server = createServer((req, res) => {
    paths.push(req.url);
    res.setHeader("Content-Type", "application/json");
    if (req.url.startsWith("/api/screener"))
      res.end(JSON.stringify({ ...backend, stale: !fresh }));
    else {
      res.writeHead(fail ? 429 : 200, fail ? { "Retry-After": "60" } : {});
      res.end(JSON.stringify(rows));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const root = `http://127.0.0.1:${server.address().port}`;
  const requests = [];
  const fetcher = (url, options) => {
    requests.push(String(url));
    const path = String(url).startsWith("https://api.coingecko.com/")
      ? new URL(url).pathname + new URL(url).search
      : url;
    return fetch(root + path, options);
  };
  let now = Date.now();
  const storage = new Map();
  const options = {
    fetcher,
    now: () => now,
    intervalMs: 0,
    storage: {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
    },
  };
  return {
    feed: createMarketFeed(options),
    options,
    paths,
    requests,
    advance: (ms) => {
      now += ms;
    },
    setFresh: () => {
      fresh = true;
    },
  };
}

test("a server-throttled market page recovers through the official public feed with exact RWA joins", async (t) => {
  const { feed, requests } = await setup(t);
  const data = await feed(1);
  assert.equal(data.stale, false);
  assert.equal(data.delivery, "browser-public-api");
  assert.equal(data.marketWarning, null);
  assert.equal(data.rows[0].market.price, 210);
  assert.equal(data.rows[1].market, null);
  assert.equal(
    data.rows[0].market.updatedAt,
    observation.tokenized_market_data.last_updated,
  );
  assert.ok(
    requests[1].startsWith("https://api.coingecko.com/api/v3/rwas/markets?"),
  );
  assert.equal(new URL(requests[1]).searchParams.get("page"), "1");
});

test("a fresh server page never makes a second provider request", async (t) => {
  const { feed, paths } = await setup(t, { fresh: true });
  const data = await feed(1);
  assert.equal(data.rows[0].market.price, 100);
  assert.equal(paths.length, 1);
});

test("a server recovery cannot replace newer browser observations with an older snapshot", async (t) => {
  const { feed, setFresh } = await setup(t);
  const first = await feed(1);
  setFresh();
  const recovered = await feed(1);
  assert.equal(recovered.rows[0].market.price, 210);
  assert.equal(recovered.retrievedAt, first.retrievedAt);
});

test("simultaneous refreshes share one public request and stale browser cache is refreshed", async (t) => {
  const { feed, paths, advance } = await setup(t);
  const [first, second] = await Promise.all([feed(1), feed(1)]);
  assert.equal(first.retrievedAt, second.retrievedAt);
  assert.equal(paths.filter((path) => path.startsWith("/api/v3/")).length, 1);
  advance(600001);
  const refreshed = await feed(1);
  assert.notEqual(refreshed.retrievedAt, first.retrievedAt);
  assert.equal(paths.filter((path) => path.startsWith("/api/v3/")).length, 2);
});

test("public observations are reused across refreshes and reloads without advancing their timestamp", async (t) => {
  const { feed, options, paths } = await setup(t);
  const first = await feed(1);
  const next = await createMarketFeed(options)(1);
  assert.equal(first.retrievedAt, next.retrievedAt);
  assert.equal(paths.filter((path) => path.startsWith("/api/v3/")).length, 1);
});

test("a public 429 retains saved server data and respects its cooldown across pages", async (t) => {
  const { feed, paths } = await setup(t, { fail: true });
  const first = await feed(1);
  const next = await feed(2);
  assert.equal(first.rows[0].market.price, 100);
  assert.equal(next.stale, true);
  assert.match(first.marketWarning, /rate.limit/i);
  assert.equal(paths.filter((path) => path.startsWith("/api/v3/")).length, 1);
});

test("ambiguous public identities and invalid provider bodies never become valid market observations", async (t) => {
  const { feed } = await setup(t, { rows: [observation, observation] });
  const duplicate = await feed(1);
  assert.equal(duplicate.rows[0].market, null);
  const invalid = await setup(t, { rows: { error: "provider error" } });
  const retained = await invalid.feed(1);
  assert.equal(retained.stale, true);
  assert.equal(retained.rows[0].market.price, 100);
  assert.equal(retained.retrievedAt, backend.retrievedAt);
});

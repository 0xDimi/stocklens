import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as desk from "../server/market-desk.mjs";
const stock = {
  id: "US67066G1040",
  rwaId: "nvidia",
  ticker: "NVDA",
  name: "NVIDIA",
  category: "Stock",
  products: [
    {
      issuer: "xstocks",
      coinId: "nvidia-xstock",
      symbol: "NVDAx",
      deployments: [{ chain: "Solana", address: "mint" }],
    },
  ],
};
const catalog = {
  stocks: [
    stock,
    { ...stock, id: "different", rwaId: "other", name: "Other", products: [] },
  ],
  warnings: [],
  fetchedAt: "2026-10-19T00:00:00Z",
};
const observations = [
  {
    id: "nvidia",
    symbol: "nvda",
    tokenized_market_data: {
      current_price: 210,
      price_change_percentage_24h: -2,
      total_volume: 300,
      market_cap: null,
      high_24h: 213,
      low_24h: 208,
      last_updated: "2026-10-18T21:00:00Z",
      sparkline_in_7d: { price: [210, 212, 211] },
    },
  },
];
const venue = {
  base: "NVDAX",
  target: "USDT",
  coin_id: "nvidia-xstock",
  market: { identifier: "gate", name: "Gate" },
  converted_last: { usd: 211 },
  converted_volume: { usd: 2000 },
  bid_ask_spread_percentage: 0.2,
  cost_to_move_up_usd: 120,
  cost_to_move_down_usd: 110,
  timestamp: "2026-10-18T21:00:00Z",
  is_stale: false,
  is_anomaly: false,
  trade_url: "https://www.gate.com/trade/NVDAX_USDT",
};
test("screener joins exact RWA identity, retains unknown rows and exposes aggregate provenance", async () => {
  assert.equal(typeof desk.screenerView, "function");
  const result = await desk.screenerView(new URLSearchParams(), {
    getCatalog: async () => catalog,
    request: async () => ({
      data: [...observations, { ...observations[0], id: "ticker-impostor" }],
      retrievedAt: "now",
    }),
  });
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].market.price, 210);
  assert.equal(result.rows[0].market.change24h, -2);
  assert.deepEqual(result.rows[0].market.sparkline, [210, 212, 211]);
  assert.equal(result.rows[0].market.marketCap, null);
  assert.equal(result.rows[1].market, null);
  assert.equal(result.rows[0].products, 1);
  assert.equal(result.rows[0].issuers, 1);
  assert.equal(result.rows[0].chains, 1);
  assert.match(result.scope.marketBasis, /aggregat/i);
  assert.equal(result.scope.matched, 1);
});
test("screener validates pages and selected catalog IDs before any provider request", async () => {
  assert.equal(typeof desk.screenerView, "function");
  const dependencies = {
    getCatalog: async () => catalog,
    request: async () => assert.fail("Provider must not be called"),
  };
  for (const page of ["0", "11", "1.1", "NaN", "01"])
    await assert.rejects(
      () => desk.screenerView(new URLSearchParams({ page }), dependencies),
      { status: 400 },
    );
  await assert.rejects(
    () =>
      desk.screenerView(new URLSearchParams({ ids: "unknown" }), dependencies),
    { status: 400 },
  );
  await assert.rejects(
    () =>
      desk.screenerView(
        new URLSearchParams({
          ids: Array.from({ length: 251 }, (_, i) => "id" + i).join(","),
        }),
        dependencies,
      ),
    { status: 400 },
  );
});
test("screener uses one paged source request, reports continuation and keeps stale response state", async () => {
  assert.equal(typeof desk.screenerView, "function");
  let called = 0;
  const result = await desk.screenerView(new URLSearchParams({ page: "2" }), {
    getCatalog: async () => catalog,
    request: async (path, ttl) => {
      called++;
      const url = new URL("https://example.com" + path);
      assert.equal(url.pathname, "/rwas/markets");
      assert.equal(url.searchParams.get("page"), "2");
      assert.equal(url.searchParams.get("order"), "volume_desc");
      assert.equal(url.searchParams.get("sparkline"), "true");
      assert.equal(ttl, 60_000);
      return {
        data: Array.from({ length: 250 }, (_, i) => ({
          ...observations[0],
          id: i ? "other-" + i : "nvidia",
        })),
        retrievedAt: "old",
        stale: true,
        warning: "Refresh failed",
        lastAttemptAt: "now",
      };
    },
  });
  assert.equal(called, 1);
  assert.equal(result.scope.nextPage, 3);
  assert.equal(result.stale, true);
  assert.ok(result.warnings.includes("Refresh failed"));
  assert.equal(result.lastAttemptAt, "now");
});
test("screener retains catalog and explicit warning when market source is unavailable", async () => {
  assert.equal(typeof desk.screenerView, "function");
  const result = await desk.screenerView(new URLSearchParams(), {
    getCatalog: async () => catalog,
    request: async () => {
      throw new Error("Offline");
    },
  });
  assert.equal(result.rows.length, 2);
  assert.ok(result.rows.every((r) => r.market === null));
  assert.match(result.warnings.join(" "), /Offline/);
  assert.equal(result.retrievedAt, null);
  assert.equal(result.scope.nextPage, null);
});
test("venue query verifies selected stock coin ID before requesting source and validates page", async () => {
  assert.equal(typeof desk.venuesView, "function");
  const dependencies = {
    resolve: async () => ({ stock, warnings: [] }),
    request: async () => assert.fail("Provider must not be called"),
  };
  await assert.rejects(
    () =>
      desk.venuesView(
        { id: stock.id, chain: "all" },
        new URLSearchParams({ coin: "tesla-xstock" }),
        dependencies,
      ),
    { status: 400 },
  );
  await assert.rejects(
    () =>
      desk.venuesView(
        { id: stock.id, chain: "all" },
        new URLSearchParams({ coin: "nvidia-xstock", page: "11" }),
        dependencies,
      ),
    { status: 400 },
  );
});
test("venues normalize price, source time, reported depth and safe link semantics; reject unrelated tokens", async () => {
  assert.equal(typeof desk.venuesView, "function");
  const result = await desk.venuesView(
    { id: stock.id, chain: "Solana" },
    new URLSearchParams({ coin: "nvidia-xstock" }),
    {
      resolve: async () => ({ stock, warnings: [] }),
      request: async () => ({
        data: {
          tickers: [
            venue,
            { ...venue, coin_id: "tesla-xstock" },
            {
              ...venue,
              market: { name: "DEX", identifier: "raydium-clmm" },
              trade_url: "https://raydium.io/swap?inputCurrency=lowercasedmint",
            },
          ],
        },
        retrievedAt: "now",
      }),
    },
  );
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].priceUsd, 211);
  assert.equal(result.rows[0].depthUpUsd, 120);
  assert.equal(result.rows[0].depthDownUsd, 110);
  assert.equal(result.rows[0].sourceAt, venue.timestamp);
  assert.equal(result.rows[0].url, venue.trade_url);
  assert.match(result.rows[0].urlLabel, /market/i);
  assert.equal(
    result.rows[1].url,
    "https://www.coingecko.com/en/coins/nvidia-xstock#markets",
  );
  assert.match(result.basis, /not.*quote/i);
});
test("real captured provider payloads normalize without fabricated prices or token addresses", async () => {
  assert.equal(typeof desk.screenerView, "function");
  const data = JSON.parse(
    await readFile(
      new URL("./fixtures/coingecko-nvidia-rwa.json", import.meta.url),
      "utf8",
    ),
  );
  const result = await desk.screenerView(new URLSearchParams(), {
    getCatalog: async () => catalog,
    request: async () => ({ data, retrievedAt: "snapshot" }),
  });
  const actual = data.find((r) => r.id === "nvidia").tokenized_market_data;
  assert.equal(result.rows[0].market.price, actual.current_price);
  assert.deepEqual(
    result.rows[0].market.sparkline,
    actual.sparkline_in_7d.price,
  );
  const captured = JSON.parse(
    await readFile(
      new URL("./fixtures/coingecko-nvidia-tickers.json", import.meta.url),
      "utf8",
    ),
  );
  const venues = await desk.venuesView(
    { id: stock.id, chain: "all" },
    new URLSearchParams({ coin: "nvidia-xstock" }),
    {
      resolve: async () => ({ stock, warnings: [] }),
      request: async () => ({ data: captured, retrievedAt: "snapshot" }),
    },
  );
  assert.equal(
    venues.rows.length,
    captured.tickers.filter((t) => t.coin_id === "nvidia-xstock").length,
  );
  assert.ok(venues.rows.every((r) => r.url.startsWith("https://")));
});

test("venue link validation rejects credentials, unsafe protocols and deceptive exchange hostnames", async () => {
  const links = [
    "http://www.gate.com/trade/NVDA",
    "https://gate.com.attacker.example/trade",
    "https://user:password@gate.com/trade",
    "javascript:alert(1)",
    "https://gate.com:8443/trade",
  ];
  const result = await desk.venuesView(
    { id: stock.id, chain: "all" },
    new URLSearchParams({ coin: "nvidia-xstock" }),
    {
      resolve: async () => ({ stock, warnings: [] }),
      request: async () => ({
        data: { tickers: links.map((trade_url) => ({ ...venue, trade_url })) },
        retrievedAt: "now",
      }),
    },
  );
  assert.ok(result.rows.every((row) => row.urlKind === "market-directory"));
});
test("a malformed sparkline is omitted instead of joining prices across missing samples", async () => {
  const input = structuredClone(observations);
  input[0].tokenized_market_data.sparkline_in_7d.price = [1, null, 3];
  const result = await desk.screenerView(new URLSearchParams(), {
    getCatalog: async () => catalog,
    request: async () => ({ data: input, retrievedAt: "now" }),
  });
  assert.deepEqual(result.rows[0].market.sparkline, []);
});

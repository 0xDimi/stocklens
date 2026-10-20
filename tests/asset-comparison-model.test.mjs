import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalSelection,
  productCoverage,
  chartSeries,
  profileMetric,
  profileSpot,
} from "../src/asset-comparison-model.mjs";

test("stock comparison keeps distinct canonical identities and caps at five", () => {
  const stocks = Array.from({ length: 7 }, (_, i) => ({
    id: `US${i}`,
    ticker: "SAME",
  }));
  assert.deepEqual(
    canonicalSelection(
      ["US1", "US1", "SAME", "US0", "US2", "US3", "US4", "US5"],
      stocks,
    ),
    ["US1", "US0", "US2", "US3", "US4"],
  );
});
test("coverage counts products and distinct networks without doubling duplicate deployments", () => {
  assert.deepEqual(
    productCoverage([
      { issuer: "a", deployments: [{ chain: "Solana" }, { chain: "Solana" }] },
      { issuer: "a", deployments: [{ chain: "Ethereum" }] },
      { issuer: "b", deployments: [] },
    ]),
    { versions: 3, issuers: 2, networks: ["Solana", "Ethereum"] },
  );
});
test("observed chart rejects malformed samples instead of inventing continuity", () => {
  assert.equal(chartSeries([10, null, 12]), null);
  assert.equal(chartSeries([10]), null);
  assert.deepEqual(chartSeries([10, 20, 15], 100, 50), {
    points: "0,50 50,0 100,25",
    min: 10,
    max: 20,
    first: 10,
    last: 15,
    count: 3,
  });
  assert.equal(chartSeries([4, 4], 100, 50).points, "0,25 100,25");
});
test("fundamentals preserve zero and distinguish ETFs from missing company data", () => {
  assert.deepEqual(
    profileMetric({ category: "ETF" }, { reference: { pe: 5 } }, "pe"),
    {
      value: null,
      label: "Not applicable",
      note: "Company P/E does not apply to an ETF.",
    },
  );
  assert.equal(
    profileMetric(
      { category: "Stock" },
      { reference: { pe: 0, pePeriod: "FY 2025" } },
      "pe",
    ).value,
    0,
  );
  assert.equal(
    profileMetric(
      { category: "Stock" },
      { reference: { pe: null, peReason: "Not reported" } },
      "pe",
    ).note,
    "Not reported",
  );
});
test("spot observation never falls back to the separate order premium", () => {
  assert.equal(
    profileSpot({ premium: { value: 20, expiresAt: 1000 } }, 0),
    null,
  );
  assert.deepEqual(
    profileSpot({ spotPremium: { value: 2, expiresAt: 1000 } }, 100),
    { value: 2, stale: false },
  );
  assert.equal(
    profileSpot({ spotPremium: { value: 2, expiresAt: 1000 } }, 1000).stale,
    true,
  );
});

test("venue loader bounds concurrent requests, caches observations and retries failures", async () => {
  const { createVenueLoader } =
    await import("../src/asset-comparison-model.mjs");
  const { createServer } = await import("node:http");
  let concurrent = 0,
    peak = 0,
    calls = 0,
    broken = true;
  const server = createServer((request, response) => {
    concurrent++;
    peak = Math.max(peak, concurrent);
    calls++;
    setTimeout(() => {
      concurrent--;
      if (request.url === "/bad" && broken) {
        response.writeHead(503);
        response.end("{}");
        return;
      }
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          rows: Array.from({ length: 12 }, (_, i) => ({
            exchange: "Venue " + i,
            priceUsd: i + 1,
          })),
          retrievedAt: "2026-10-20T10:00:00Z",
        }),
      );
    }, 10);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const until = (predicate) =>
    new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        clearInterval(timer);
        reject(new Error("Venue state did not settle"));
      }, 3000);
      const timer = setInterval(() => {
        if (predicate()) {
          clearInterval(timer);
          clearTimeout(timeout);
          resolve();
        }
      }, 5);
    });
  let loader;
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    loader = createVenueLoader({
      fetchVenues: async ({ coinId, signal }) => {
        const response = await fetch(base + "/" + coinId, { signal });
        if (!response.ok) throw new Error("Source unavailable");
        return response.json();
      },
    });
    loader.load("a", { coinId: "a" });
    loader.load("b", { coinId: "b" });
    loader.load("bad", { coinId: "bad" });
    await until(() =>
      ["a", "b", "bad"].every((id) => loader.get(id)?.status !== "loading"),
    );
    assert.equal(peak, 2);
    assert.equal(loader.get("a").rows.length, 10);
    assert.equal(loader.get("bad").status, "error");
    loader.load("a", { coinId: "a" });
    assert.equal(calls, 3);
    broken = false;
    loader.load("bad", { coinId: "bad" });
    await until(() => loader.get("bad")?.status === "ready");
    assert.equal(calls, 4);
    assert.equal(loader.get("bad").rows[0].priceUsd, 1);
  } finally {
    loader?.cancel();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("a retained pool premium remains stale even before its original expiry", () => {
  const now = Date.now();
  assert.equal(
    profileSpot(
      { spotPremium: { value: 1, expiresAt: now + 60000, stale: true } },
      now,
    ).stale,
    true,
  );
});

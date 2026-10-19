import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createCatalogLoader,
  createCachedCatalogLoader,
} from "../server/catalog.mjs";
import { persistentCatalog } from "../server/source-client.mjs";
import * as coingecko from "../server/coingecko.mjs";
import { createApp } from "../server.mjs";

const at = Date.now() - 3600000;
const original = new Date(at).toISOString();
const day = 86400000;
const apple = {
  id: "apple-product",
  symbol: "AAPLx",
  name: "Apple xStock",
  underlying: { symbol: "AAPL", isin: "US0378331005", type: "Equity" },
  deployments: [{ network: "Ethereum", address: "0x" + "1".repeat(40) }],
};
const discovery = { stocks: [], registry: [], retrievedAt: original };
const offline = async () => {
  throw new Error("source offline");
};
async function temporary(t) {
  const cacheDir = await mkdtemp(join(tmpdir(), "stocklens-freshness-"));
  t.after(() => rm(cacheDir, { recursive: true, force: true }));
  return cacheDir;
}
async function capture(t) {
  const cacheDir = await temporary(t);
  await createCatalogLoader({
    cacheDir,
    seedPath: null,
    now: () => at,
    getXstocks: async () => [apple],
    getOndo: async () => [],
    getDiscovery: async () => discovery,
  })();
  return cacheDir;
}

test("repeated outages cannot renew the 72-hour source retention window", async (t) => {
  const cacheDir = await capture(t);
  const options = {
    cacheDir,
    seedPath: null,
    getXstocks: offline,
    getOndo: offline,
    getDiscovery: offline,
  };
  const retained = await createCatalogLoader({
    ...options,
    now: () => at + 2 * day,
  })();
  assert.equal(retained.stocks[0].products[0].sourceAt, original);
  await assert.rejects(
    createCatalogLoader({ ...options, now: () => at + 4 * day })(),
    /unavailable/,
  );
});

test("an expired source cannot restore old products during a healthy independent refresh", async (t) => {
  const cacheDir = await capture(t);
  const result = await createCatalogLoader({
    cacheDir,
    seedPath: null,
    now: () => at + 4 * day,
    getXstocks: offline,
    getOndo: offline,
    getDiscovery: async () => ({
      retrievedAt: new Date(at + 4 * day).toISOString(),
      registry: [],
      stocks: [{
        id: "cg:fresh",
        rwaId: "fresh",
        ticker: "FRESH",
        name: "Fresh company",
        sourceAt: new Date(at + 4 * day).toISOString(),
        products: [],
      }],
    }),
  })();
  assert.deepEqual(result.stocks.map((s) => s.id), ["cg:fresh"]);
});

test("a running cached loader also expires retained identities after 72 hours", async (t) => {
  const cacheDir = await capture(t);
  let now = at + day;
  const load = createCachedCatalogLoader({
    cacheDir,
    seedPath: null,
    now: () => now,
    getXstocks: offline,
    getOndo: offline,
    getDiscovery: offline,
  });
  assert.equal((await load()).stocks[0].id, "US0378331005");
  now = at + 4 * day;
  await assert.rejects(load(), /unavailable/);
});

test("HTTP readiness fails after a repackaged snapshot's source observations expire", async (t) => {
  const cacheDir = await capture(t);
  // A recent outage check rewrote the envelope, while sources remain four days old.
  const file = join(cacheDir, "canonical-catalog-v1.json");
  const snapshot = JSON.parse(await readFile(file, "utf8"));
  snapshot.savedAt = new Date(at + 4 * day).toISOString();
  await writeFile(file, JSON.stringify(snapshot));
  const app = createApp({
    getCatalog: createCachedCatalogLoader({
      cacheDir,
      seedPath: null,
      now: () => at + 4 * day,
      getXstocks: offline,
      getOndo: offline,
      getDiscovery: offline,
    }),
  });
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => app.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${app.address().port}/api/ready`);
  assert.equal(response.status, 503);
  const result = await response.json();
  assert.equal(result.catalogReady, false);
  assert.equal(result.status, "unavailable");
});

test("partially expired cached catalogs keep eligible assets and accurate coverage", async (t) => {
  const cacheDir = await capture(t);
  const file = join(cacheDir, "canonical-catalog-v1.json");
  const snapshot = JSON.parse(await readFile(file, "utf8"));
  const current = new Date(at + 4 * day).toISOString();
  snapshot.savedAt = current;
  snapshot.catalog.stocks.push({
    id: "cg:fresh",
    ticker: "FRESH",
    name: "Fresh",
    sourceAt: current,
    products: [],
  });
  await writeFile(file, JSON.stringify(snapshot));
  const load = createCachedCatalogLoader({
    cacheDir,
    seedPath: null,
    now: () => at + 4 * day,
    getXstocks: offline,
    getOndo: offline,
    getDiscovery: offline,
  });
  const result = await load();
  assert.deepEqual(result.stocks.map((s) => s.id), ["cg:fresh"]);
  assert.equal(result.coverage.assets, 1);
  assert.equal(result.coverage.versions, 0);
});

test("retained discovery inputs preserve stale state and their oldest source time", () => {
  assert.equal(typeof coingecko.discoveryObservation, "function");
  const observation = coingecko.discoveryObservation(
    { data: [], retrievedAt: original, stale: true, warning: "RWA registry offline" },
    { data: [], retrievedAt: new Date(at + 1000).toISOString(), stale: false },
  );
  assert.equal(observation.stale, true);
  assert.equal(observation.retrievedAt, original);
  assert.match(observation.warning, /RWA registry offline/);
});

test("persistent discovery never promotes a retained observation into a fresh cache", async (t) => {
  const cacheDir = await temporary(t);
  const value = {
    stocks: [],
    retrievedAt: original,
    stale: true,
    warning: "offline",
  };
  await persistentCatalog("discovery", async () => value, { cacheDir });
  await assert.rejects(readFile(join(cacheDir, "discovery.json")), { code: "ENOENT" });
});

test("a recent cache write cannot make an expired source observation eligible", async (t) => {
  const cacheDir = await temporary(t);
  await writeFile(
    join(cacheDir, "discovery.json"),
    JSON.stringify({
      savedAt: Date.now(),
      value: { stocks: [], retrievedAt: new Date(at - 4 * day).toISOString() },
    }),
  );
  await assert.rejects(persistentCatalog("discovery", offline, { cacheDir }), /offline/);
});

test("a source that expires during an attempted refresh cannot become its fallback", async (t) => {
  const cacheDir = await temporary(t);
  let clock = Date.now();
  t.mock.method(Date, "now", () => clock);
  await writeFile(join(cacheDir, "discovery.json"), JSON.stringify({
    savedAt: clock,
    value: {
      stocks: [],
      retrievedAt: new Date(clock - 3 * day + 1).toISOString(),
    },
  }));
  await assert.rejects(persistentCatalog("discovery", async () => {
    clock += 2;
    throw new Error("source offline");
  }, { cacheDir }), /offline/);
});

test("native RWA products keep the observation timestamp supplied by their source", () => {
  const products = coingecko.parseRwaTokens(
    {
      id: "apple",
      symbol: "AAPL",
      tokens: [{
        id: "apple-xstock",
        symbol: "aaplx",
        name: "Apple xStock",
        issuer_details: { id: "xstocks-ecosystem" },
        platforms: { ethereum: "0x" + "1".repeat(40) },
      }],
    },
    { rwaId: "apple", ticker: "AAPL" },
    { retrievedAt: original },
  );
  assert.equal(products[0].sourceAt, original);
});

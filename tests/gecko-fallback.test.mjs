import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { sourceClient } from "../server/source-client.mjs";
import * as gecko from "../server/gecko.mjs";

const token = "0x" + "1".repeat(40);
const poolAddress = "0x" + "2".repeat(40);
const otherToken = "0x" + "3".repeat(40);
const poolId = `eth_${poolAddress}:xstocks:NVDAx`;
const stock = {
  ticker: "NVDA",
  products: [{ issuer: "xstocks", symbol: "NVDAx", deployments: [{ chain: "Ethereum", address: token }] }],
};
const pools = {
  data: [{
    id: `eth_${poolAddress}`, type: "pool",
    attributes: { address: poolAddress, name: "USDC / NVDAx", quote_token_price_usd: "150", reserve_in_usd: "100000" },
    relationships: { base_token: { data: { id: `eth_${otherToken}` } }, quote_token: { data: { id: `eth_${token}` } } },
  }],
};
function history(address = token) {
  return {
    data: { attributes: { ohlcv_list: [[Math.floor(Date.now() / 1000) - 3600, 150, 152, 148, 151, 1000]] } },
    meta: { quote: { address } },
  };
}
async function localClient(t, options = {}) {
  const calls = [];
  const state = { publicStatus: 200, authenticatedStatus: 200, ...options };
  const app = createServer((req, res) => {
    calls.push(req.url);
    const authenticated = req.url.startsWith("/authenticated/");
    if (!authenticated && state.publicDisconnect) {
      req.socket.destroy();
      return;
    }
    const status = authenticated ? state.authenticatedStatus : state.publicStatus;
    res.writeHead(req.url.includes("/ohlcv/") && state.historyStatus && !authenticated ? state.historyStatus : status, { "Content-Type": "application/json" });
    const body = req.url.includes("/ohlcv/") ? state.historyBody || history(state.historyToken) : state.publicBody || pools;
    res.end(JSON.stringify(authenticated && state.authenticatedBody ? state.authenticatedBody : body));
  });
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    app.closeAllConnections();
    await new Promise((resolve) => app.close(resolve));
  });
  const base = `http://127.0.0.1:${app.address().port}`;
  const publicRequest = sourceClient("test-public", () => base + "/public", 0, () => ({}), { validate: gecko.validOnchainResponse });
  const authenticatedRequest = sourceClient("test-authenticated", () => base + "/authenticated", 0);
  const client = gecko.createGeckoClient({
    publicRequest: (path, ttl) => publicRequest(path, state.expirePublic ? 0 : ttl),
    authenticatedRequest: (path, ttl) => authenticatedRequest(path, state.expireAuthenticated ? 0 : ttl),
    hasApiKey: () => state.hasApiKey !== false,
  });
  return { client, calls, state };
}

test("fresh public pool and history observations make no authenticated requests", async (t) => {
  const { client, calls } = await localClient(t);
  const result = await client.getHistory(stock, poolId, "1d");
  assert.equal(result.points[0].close, 151);
  assert.equal(result.pool.orientation, "quote");
  assert.equal(result.provider, "GeckoTerminal");
  assert.match(result.apiSource, /^https:\/\/api\.geckoterminal\.com\/api\/v2\/networks\/eth\/pools\//);
  assert.equal(calls.filter((path) => path.startsWith("/authenticated/")).length, 0);
  assert.equal(calls.length, 2);
});

test("public OHLCV throttling uses the same authenticated pool, token orientation and range", async (t) => {
  const { client, calls } = await localClient(t, { historyStatus: 429 });
  const result = await client.getHistory(stock, poolId, "7d");
  assert.equal(result.provider, "CoinGecko Onchain API");
  assert.equal(result.stale, false);
  assert.equal(result.points[0].close, 151);
  const publicPath = calls.find((path) => path.startsWith("/public/") && path.includes("/ohlcv/"));
  const fallbackPath = calls.find((path) => path.startsWith("/authenticated/"));
  assert.equal(fallbackPath, publicPath.replace("/public/", "/authenticated/onchain/"));
  assert.match(result.apiSource, /^https:\/\/api\.coingecko\.com\/api\/v3\/onchain\/networks\/eth\/pools\//);
  assert.equal(new URL(fallbackPath, "http://localhost").searchParams.get("token"), "quote");
  assert.equal(new URL(fallbackPath, "http://localhost").searchParams.get("limit"), "168");
});

test("authenticated discovery still excludes unrelated token contracts and rejects an unselected pool", async (t) => {
  const unrelated = structuredClone(pools.data[0]);
  unrelated.id = `eth_${otherToken}`;
  unrelated.attributes.address = otherToken;
  unrelated.relationships.quote_token.data.id = `eth_${otherToken}`;
  const { client, calls } = await localClient(t, { publicStatus: 503, authenticatedBody: { data: [pools.data[0], unrelated] } });
  const result = await client.getPools(stock);
  assert.equal(result.source, "CoinGecko Onchain API");
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].address, token);
  await assert.rejects(client.getHistory(stock, "unrelated-pool", "1d"), { status: 400 });
  assert.equal(calls.filter((path) => path.includes("/ohlcv/")).length, 0);
});

test("failed authenticated refresh retains the original stale public observation date", async (t) => {
  const { client, state, calls } = await localClient(t, { expirePublic: true });
  const first = await client.getPools(stock);
  state.publicStatus = 503;
  state.authenticatedStatus = 503;
  const retained = await client.getPools(stock);
  assert.equal(retained.stale, true);
  assert.equal(retained.source, "GeckoTerminal");
  assert.equal(retained.retrievedAt, first.retrievedAt);
  assert.equal(retained.rows[0].retrievedAt, first.rows[0].retrievedAt);
  assert.match(retained.warning, /fallback unavailable/i);
  assert.equal(calls.filter((path) => path.startsWith("/authenticated/")).length, 1);
});

test("a fresh authenticated observation replaces stale public data without inheriting stale status", async (t) => {
  const { client, state } = await localClient(t, { expirePublic: true });
  await client.getPools(stock);
  state.publicStatus = 503;
  const result = await client.getPools(stock);
  assert.equal(result.stale, false);
  assert.equal(result.source, "CoinGecko Onchain API");
});

test("an absent key never starts authenticated requests", async (t) => {
  const { client, calls } = await localClient(t, { publicStatus: 429, hasApiKey: false });
  await assert.rejects(client.getPools(stock), { status: 429 });
  assert.equal(calls.length, 1);
});

test("non-transient public errors do not consume authenticated quota", async (t) => {
  const { client, calls } = await localClient(t, { publicStatus: 400 });
  await assert.rejects(client.getPools(stock), { status: 400 });
  assert.equal(calls.length, 1);
});

test("authenticated OHLCV metadata for another token cannot become the selected token history", async (t) => {
  const { client } = await localClient(t, { historyStatus: 429, authenticatedBody: history(otherToken) });
  await assert.rejects(client.getHistory(stock, poolId, "1d"), /unrelated token/i);
});

test("failure of both providers returns a source error without inventing observations", async (t) => {
  const { client } = await localClient(t, { publicStatus: 429, authenticatedStatus: 429 });
  await assert.rejects(client.getPools(stock), { status: 429 });
});

test("a public transport failure can recover through the authenticated provider", async (t) => {
  const { client } = await localClient(t, { publicDisconnect: true });
  const result = await client.getPools(stock);
  assert.equal(result.source, "CoinGecko Onchain API");
  assert.equal(result.rows[0].address, token);
});

test("retained authenticated observations preserve their original date and stale state", async (t) => {
  const { client, state } = await localClient(t, { publicStatus: 429, expireAuthenticated: true });
  const first = await client.getPools(stock);
  state.authenticatedStatus = 503;
  const retained = await client.getPools(stock);
  assert.equal(retained.source, "CoinGecko Onchain API");
  assert.equal(retained.stale, true);
  assert.equal(retained.retrievedAt, first.retrievedAt);
  assert.equal(retained.rows[0].retrievedAt, first.rows[0].retrievedAt);
});

test("an HTTP 200 public pool error cannot overwrite a valid retained observation", async (t) => {
  const { client, state } = await localClient(t, { expirePublic: true, hasApiKey: false });
  const first = await client.getPools(stock);
  state.publicBody = { errors: [{ status: "429", title: "Rate limited" }] };
  const retained = await client.getPools(stock);
  assert.equal(retained.stale, true);
  assert.equal(retained.retrievedAt, first.retrievedAt);
  assert.equal(retained.rows[0].address, token);
});

test("an HTTP 200 public OHLCV error cannot overwrite valid retained candles", async (t) => {
  const { client, state } = await localClient(t, { expirePublic: true, hasApiKey: false });
  const first = await client.getHistory(stock, poolId, "1d");
  state.historyBody = { errors: [{ title: "Unavailable" }] };
  const retained = await client.getHistory(stock, poolId, "1d");
  assert.equal(retained.stale, true);
  assert.equal(retained.retrievedAt, first.retrievedAt);
  assert.deepEqual(retained.points, first.points);
});

test("a malformed authenticated HTTP 200 body cannot replace retained public pools", async (t) => {
  const { client, state } = await localClient(t, { expirePublic: true });
  const first = await client.getPools(stock);
  state.publicStatus = 503;
  state.authenticatedBody = {};
  const retained = await client.getPools(stock);
  assert.equal(retained.stale, true);
  assert.equal(retained.source, "GeckoTerminal");
  assert.equal(retained.retrievedAt, first.retrievedAt);
});

import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as coingecko from "../server/coingecko.mjs";
import { sourceClient } from "../server/source-client.mjs";

test("CoinGecko onchain validation requires the response shape for its requested endpoint", () => {
  assert.equal(typeof coingecko.validateCoinGeckoResponse, "function");
  for (const path of [
    "/onchain/search/pools?query=NVDA",
    "/onchain/networks/eth/tokens/0xtoken/pools?include=base_token",
  ]) {
    assert.equal(coingecko.validateCoinGeckoResponse({ data: [] }, path), true);
    assert.equal(coingecko.validateCoinGeckoResponse({ data: {} }, path), false);
    assert.equal(coingecko.validateCoinGeckoResponse({ status: { error_code: 10012 } }, path), false);
  }
  const path = "/onchain/networks/eth/pools/0xpool/ohlcv/hour?token=base";
  assert.equal(coingecko.validateCoinGeckoResponse({ data: { attributes: { ohlcv_list: [] } } }, path), true);
  assert.equal(coingecko.validateCoinGeckoResponse({ data: { attributes: {} } }, path), false);
  assert.equal(coingecko.validateCoinGeckoResponse({ data: [] }, path), false);
});

test("an invalid HTTP 200 onchain refresh cannot replace the persisted last good observation", async (t) => {
  assert.equal(typeof coingecko.validateCoinGeckoResponse, "function");
  const cacheDir = await mkdtemp(join(tmpdir(), "stocklens-cg-validation-"));
  t.after(() => rm(cacheDir, { recursive: true, force: true }));
  const payload = { data: { id: "eth_0xpool", type: "ohlcv_request_response",
    attributes: { ohlcv_list: [[1780000000, 100, 102, 99, 101, 1000]] } } };
  let fail = false;
  const app = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(fail ? { data: { attributes: {} } } : payload));
  });
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => app.close(resolve)));
  const cacheFile = join(cacheDir, "observations.json");
  const api = sourceClient("CoinGecko-validation", () =>
    `http://127.0.0.1:${app.address().port}`, 0, () => ({}), {
      validate: coingecko.validateCoinGeckoResponse, cacheFile,
    });
  const path = "/onchain/networks/eth/pools/0xpool/ohlcv/hour?token=base";
  const fresh = await api(path, 0);
  fail = true;
  const retained = await api(path, 0);
  assert.deepEqual(retained.data, payload);
  assert.equal(retained.retrievedAt, fresh.retrievedAt);
  assert.equal(retained.stale, true);
  const saved = JSON.parse(await readFile(cacheFile, "utf8"));
  assert.deepEqual(saved.observations[0][1].data, payload);
});

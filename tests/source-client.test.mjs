import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { sourceClient } from "../server/source-client.mjs";
test("a shorter caller TTL overrides a longer cached expiry on the same source path", async (t) => {
  let calls = 0;
  const app = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ calls: ++calls }));
  });
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => app.close(resolve)));
  const api = sourceClient(
    "shared-ttl",
    () => `http://127.0.0.1:${app.address().port}`,
    0,
  );
  assert.equal((await api("/issuer", 86400000)).data.calls, 1);
  assert.equal((await api("/issuer", 0, { waitForFresh: true })).data.calls, 2);
});
test("HTTP 429 applies a source-wide cooldown across different endpoints", async (t) => {
  let calls = 0;
  const app = createServer((req, res) => {
    calls++;
    res.writeHead(429, { "Content-Type": "application/json" });
    res.end("{}");
  });
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => app.close(resolve)));
  const api = sourceClient(
    "cooldown-test",
    () => `http://127.0.0.1:${app.address().port}`,
    0,
  );
  await assert.rejects(api("/first"));
  await assert.rejects(api("/second"));
  assert.equal(calls, 1);
});

test("a retained observation reports a confirmed rate limit separately from background refresh", async (t) => {
  let calls = 0;
  const app = createServer((req, res) => {
    calls++;
    res.writeHead(calls === 1 ? 200 : 429, {
      "Content-Type": "application/json",
    });
    res.end(calls === 1 ? '{"price":123}' : "{}");
  });
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => app.close(resolve)));
  const api = sourceClient(
    "typed-rate-limit",
    () => `http://127.0.0.1:${app.address().port}`,
    0,
  );
  const first = await api("/price", 0);
  const retained = await api("/price", 0);
  assert.equal(retained.refreshState, "rate-limited");
  assert.ok(Date.parse(retained.retryAt) > Date.now());
  assert.equal(retained.retrievedAt, first.retrievedAt);
  assert.equal(retained.data.price, 123);
});

test("expired simultaneous requests coalesce and retain last good data after upstream failure", async (t) => {
  let calls = 0,
    fail = false;
  const app = createServer((req, res) => {
    calls++;
    res.writeHead(fail ? 503 : 200, { "Content-Type": "application/json" });
    res.end(fail ? "{}" : '{"price":123}');
  });
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => app.close(resolve)));
  const api = sourceClient(
    "snapshot-test",
    () => `http://127.0.0.1:${app.address().port}`,
    0,
  );
  const fresh = await api("/price", 0);
  fail = true;
  const results = await Promise.all([api("/price", 0), api("/price", 0)]);
  assert.equal(calls, 2);
  assert.equal(results[0].data.price, 123);
  assert.equal(results[0].retrievedAt, fresh.retrievedAt);
  assert.equal(results[0].stale, true);
  assert.match(results[0].warning, /503/);
  assert.deepEqual(results[0], results[1]);
});
test("source work bounds active requests and rejects excess queue work", async (t) => {
  let active = 0,
    maximum = 0;
  const app = createServer((req, res) => {
    maximum = Math.max(maximum, ++active);
    setTimeout(() => {
      active--;
      res.end("{}");
    }, 80);
  });
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => app.close(resolve)));
  const api = sourceClient(
    "bounds-test",
    () => `http://127.0.0.1:${app.address().port}`,
    0,
    () => ({}),
    { concurrency: 1, maxQueue: 1 },
  );
  const results = await Promise.allSettled([
    api("/one"),
    api("/two"),
    api("/three"),
  ]);
  assert.equal(maximum, 1);
  assert.deepEqual(
    results.map((r) => r.status),
    ["fulfilled", "fulfilled", "rejected"],
  );
});
test("unwritable persistence does not discard successful fresh catalog data", async (t) => {
  const { persistentCatalog } = await import("../server/source-client.mjs");
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "stocklens-cache-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, "not-a-directory");
  await writeFile(file, "occupied");
  const result = await persistentCatalog(
    "resilient",
    async () => ({ stocks: [{ id: "NVDA" }] }),
    { cacheDir: file },
  );
  assert.equal(result.stocks[0].id, "NVDA");
  assert.match(result.persistenceWarning, /persistence/i);
});
test("catalog cache writes a reusable snapshot and explicitly marks failed stale refreshes", async (t) => {
  const { persistentCatalog } = await import("../server/source-client.mjs");
  const { mkdtemp, readFile, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "stocklens-persist-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const value = await persistentCatalog(
    "catalog",
    async () => ({ stocks: [{ id: "NVDA" }] }),
    { cacheDir: root },
  );
  const file = join(root, "catalog.json");
  const saved = JSON.parse(await readFile(file, "utf8"));
  assert.deepEqual(saved.value, value);
  const reused = await persistentCatalog(
    "catalog",
    async () => {
      throw new Error("must not reload fresh catalog");
    },
    { cacheDir: root },
  );
  assert.equal(reused.stocks[0].id, "NVDA");
  saved.savedAt = Date.now() - 13 * 3600000;
  await writeFile(file, JSON.stringify(saved));
  const stale = await persistentCatalog(
    "catalog",
    async () => {
      throw new Error("source offline");
    },
    { cacheDir: root },
  );
  assert.equal(stale.stale, true);
  assert.equal(stale.cachedAt, saved.savedAt);
  assert.match(stale.warning, /source offline/);
});

test("direct HTTP source calls share a global concurrency and queue bound", async (t) => {
  const { request } = await import("../server/http.mjs");
  let active = 0,
    maximum = 0;
  const app = createServer((req, res) => {
    maximum = Math.max(maximum, ++active);
    setTimeout(() => {
      active--;
      res.end("{}");
    }, 30);
  });
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => app.close(resolve)));
  const results = await Promise.allSettled(
    Array.from({ length: 82 }, (_, i) =>
      request(`http://127.0.0.1:${app.address().port}/${i}`),
    ),
  );
  assert.ok(maximum <= 16, `maximum active source requests: ${maximum}`);
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    2,
  );
});
test("source queue deadlines reject waiting work before sending a late upstream request", async (t) => {
  let calls = 0;
  const app = createServer((req, res) => {
    calls++;
    setTimeout(() => res.end("{}"), 100);
  });
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => app.close(resolve)));
  const api = sourceClient(
    "queue-deadline-test",
    () => `http://127.0.0.1:${app.address().port}`,
    0,
    () => ({}),
    { concurrency: 1, maxQueue: 2, queueTimeoutMs: 25 },
  );
  const results = await Promise.allSettled([api("/active"), api("/waiting")]);
  assert.deepEqual(
    results.map((result) => result.status),
    ["fulfilled", "rejected"],
  );
  assert.equal(calls, 1);
});

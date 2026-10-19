import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sourceClient } from "../server/source-client.mjs";

test("a new source client retains persisted observations and their original time through an upstream outage", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "stocklens-observation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  let offline = false;
  const app = createServer((req, res) => {
    res.writeHead(offline ? 503 : 200, { "Content-Type": "application/json" });
    res.end(offline ? "{}" : '{"price":217.5}');
  });
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => app.close(resolve)));
  const base = () => `http://127.0.0.1:${app.address().port}`;
  const options = { cacheFile: join(root, "observations.json") };
  const first = sourceClient("persisted-price", base, 0, () => ({}), options);
  const observed = await first("/same-token", 0);
  offline = true;
  const restarted = sourceClient(
    "persisted-price",
    base,
    0,
    () => ({}),
    options,
  );
  const retained = await restarted("/same-token", 0);
  assert.equal(retained.data.price, 217.5);
  assert.equal(retained.retrievedAt, observed.retrievedAt);
  assert.equal(retained.stale, true);
  assert.match(retained.warning, /503/);
  await assert.rejects(restarted("/unrelated-token", 0));
});

test(
  "dated observations remain readable while one slow refresh runs in the background",
  { timeout: 2000 },
  async (t) => {
    let calls = 0,
      release;
    const app = createServer((req, res) => {
      calls++;
      if (calls === 1) res.end('{"price":217}');
      else release = () => res.end('{"price":218}');
    });
    await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
    t.after(() => {
      release?.();
      app.closeAllConnections();
      return new Promise((resolve) => app.close(resolve));
    });
    const api = sourceClient(
      "swr-price",
      () => `http://127.0.0.1:${app.address().port}`,
      0,
      () => ({}),
      { staleWhileRevalidate: true },
    );
    const initial = await api("/price", 0);
    const cached = await api("/price", 10000);
    assert.equal(cached.data.price, 217);
    assert.equal(cached.retrievedAt, initial.retrievedAt);
    assert.equal(cached.stale, true);
    const concurrent = await api("/price", 10000);
    assert.equal(concurrent.data.price, 217);
  },
);

test("provider-level errors inside HTTP 200 cannot replace a last-good observation", async (t) => {
  let invalid = false;
  const app = createServer((req, res) =>
    res.end(
      JSON.stringify(
        invalid
          ? { status: { rCode: 500 }, data: null }
          : { status: { rCode: 200 }, data: { price: 217 } },
      ),
    ),
  );
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => app.close(resolve)));
  const api = sourceClient(
    "validated-price",
    () => `http://127.0.0.1:${app.address().port}`,
    0,
    () => ({}),
    { validate: (data) => data.status.rCode === 200 && data.data !== null },
  );
  const first = await api("/price", 0);
  invalid = true;
  const retained = await api("/price", 0);
  assert.equal(retained.data.data.price, 217);
  assert.equal(retained.retrievedAt, first.retrievedAt);
  assert.equal(retained.stale, true);
});

test("a provider error persisted by an older release is discarded before cache reuse", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "stocklens-invalid-cache-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { writeFile } = await import("node:fs/promises");
  const file = join(root, "old.json");
  await writeFile(
    file,
    JSON.stringify({
      version: 1,
      observations: [
        [
          "/price",
          {
            data: { status: { rCode: 500 }, data: null },
            retrievedAt: new Date().toISOString(),
            expires: Date.now() + 60000,
          },
        ],
      ],
    }),
  );
  const app = createServer((req, res) =>
    res.end('{"status":{"rCode":200},"data":{"price":218}}'),
  );
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => app.close(resolve)));
  const api = sourceClient(
    "old-cache-validation",
    () => `http://127.0.0.1:${app.address().port}`,
    0,
    () => ({}),
    {
      cacheFile: file,
      validate: (body) => body.status.rCode === 200 && body.data !== null,
    },
  );
  const result = await api("/price");
  assert.equal(result.data.data.price, 218);
});

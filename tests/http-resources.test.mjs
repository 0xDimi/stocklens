import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { request } from "../server/http.mjs";

async function streamingSource(t, respond) {
  let closed;
  const responseClosed = new Promise((resolve) => {
    closed = resolve;
  });
  const app = createServer((req, res) => {
    res.once("close", closed);
    respond(res);
  });
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    app.closeAllConnections();
    await new Promise((resolve) => app.close(resolve));
  });
  return {
    url: `http://127.0.0.1:${app.address().port}/stream`,
    async assertClosed() {
      let timer;
      try {
        await Promise.race([
          responseClosed,
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("Rejected upstream response remained open.")),
              1000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

test("an HTTP error closes its unfinished upstream response promptly", async (t) => {
  const source = await streamingSource(t, (res) => {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.flushHeaders();
  });
  await assert.rejects(request(source.url, { timeout: 5000 }), { status: 503 });
  await source.assertClosed();
});

test("the response size limit closes the upstream stream before its timeout", async (t) => {
  const source = await streamingSource(t, (res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write(Buffer.alloc(8_000_001, " "));
  });
  await assert.rejects(request(source.url, { timeout: 5000 }), /too large/);
  await source.assertClosed();
});

test("a body read timeout closes the upstream stream and frees its request slot", async (t) => {
  const source = await streamingSource(t, (res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write("{");
  });
  await assert.rejects(request(source.url, { timeout: 100 }));
  await source.assertClosed();

  const pending = [];
  const healthy = createServer((req, res) => {
    pending.push(res);
    // All 16 slots must be available before any response can finish.
    if (pending.length === 16)
      for (const response of pending) response.end('{"ok":true}');
  });
  await new Promise((resolve) => healthy.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    healthy.closeAllConnections();
    await new Promise((resolve) => healthy.close(resolve));
  });
  const results = await Promise.all(
    Array.from({ length: 16 }, () =>
      request(`http://127.0.0.1:${healthy.address().port}/`, { timeout: 1000 }),
    ),
  );
  assert.ok(results.every((result) => result.ok === true));
});

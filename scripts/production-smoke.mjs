import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, connect } from "node:net";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const free = createServer();
await new Promise((resolve) => free.listen(0, "127.0.0.1", resolve));
const port = free.address().port;
await new Promise((resolve) => free.close(resolve));
const secret = process.env.COINGECKO_API_KEY || "smoke-secret-not-for-browser";
const env = {
  ...process.env,
  NODE_ENV: "production",
  HOST: "0.0.0.0",
  PORT: String(port),
  RATE_LIMIT_PER_MINUTE: "3",
  SHUTDOWN_TIMEOUT_MS: "1500",
  SOLANA_RPC_URL:
    "https://api.mainnet-beta.solana.com/?credential=smoke-secret-not-for-browser",
};
const child = spawn(process.execPath, ["server.mjs"], {
  cwd: root,
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk;
});
child.stderr.on("data", (chunk) => {
  output += chunk;
});
const exited = once(child, "exit");
const base = `http://127.0.0.1:${port}`;
async function fetchLocal(path, options) {
  return fetch(base + path, { ...options, signal: AbortSignal.timeout(40000) });
}
try {
  let online = false;
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetchLocal("/api/health")).ok) {
        online = true;
        break;
      }
    } catch {}
    if (child.exitCode !== null)
      throw new Error("Production subprocess exited before listening.");
    await delay(50);
  }
  assert.ok(online, "production subprocess must bind assigned port");
  for (const path of [
    "/",
    "/src/app.mjs",
    "/src/data.mjs",
    "/src/model.mjs",
    "/src/views.mjs",
    "/src/styles.css",
    "/src/chart.mjs",
    "/src/terminal.mjs",
    "/src/brands.mjs",
    "/src/market-model.mjs",
    "/src/markets-page.mjs",
    "/src/comparison-ui.mjs",
    "/src/comparison-state.mjs",
    "/src/product-terms.mjs",
    "/src/product-terms.css",
    "/src/home-comparison.css",
    "/src/reference-view.mjs",
    "/src/stock-pages.mjs",
    "/src/asset-comparison-model.mjs",
    "/src/comparison-ui.css",
    "/src/stock-pages.css",
  ]) {
    const response = await fetchLocal(path);
    assert.equal(response.status, 200, path);
    assert.ok(
      !(await response.text()).includes(secret),
      `credential exposed by ${path}`,
    );
    assert.match(
      response.headers.get("content-security-policy"),
      /frame-ancestors 'none'/,
    );
  }
  for (const path of [
    "/.env",
    "/server.mjs",
    "/server/runtime.mjs",
    "/package.json",
    "/.cache/coingecko.json",
    "/DEPLOY.md",
  ])
    assert.equal((await fetchLocal(path)).status, 404, path);
  const head = await fetchLocal("/", { method: "HEAD" });
  assert.equal((await head.text()).length, 0);
  assert.equal((await fetchLocal("/", { method: "POST" })).status, 405);
  // Real readiness reaches the actual catalog sources. Network outages are reported, never replaced with a fixture.
  const ready = await fetchLocal("/api/ready");
  assert.ok([200, 503].includes(ready.status));
  const readiness = await ready.json();
  assert.equal(readiness.catalogReady, ready.status === 200);
  if (process.argv.includes("--require-ready"))
    assert.equal(ready.status, 200, "live catalog readiness required");
  for (let i = 0; i < 3; i++)
    assert.equal(
      (
        await fetchLocal("/api/not-found", {
          headers: { "X-Forwarded-For": `198.51.100.${i + 1}` },
        })
      ).status,
      404,
    );
  assert.equal(
    (
      await fetchLocal("/api/not-found", {
        headers: { "X-Forwarded-For": "198.51.100.99" },
      })
    ).status,
    429,
  );
  assert.equal(
    (await fetchLocal("/api/health")).status,
    200,
    "liveness remains reachable after rate exhaustion",
  );
  child.kill("SIGTERM");
  const terminationTimer = setTimeout(() => child.kill("SIGKILL"), 2500);
  const [code, signal] = await exited;
  clearTimeout(terminationTimer);
  assert.equal(code, 0);
  assert.equal(signal, null);
  for (const invalid of [
    { PORT: "wrong" },
    { HOST: "https://bad" },
    { TRUST_PROXY: "true" },
    { SOURCE_TIMEOUT_MS: "-1" },
  ]) {
    const bad = spawn(process.execPath, ["server.mjs"], {
      cwd: root,
      env: { ...env, ...invalid },
      stdio: "ignore",
    });
    const [code] = await once(bad, "exit");
    assert.notEqual(code, 0, JSON.stringify(invalid));
  }
  // An incomplete real HTTP connection must not hold the process open beyond its drain deadline.
  const draining = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const drained = once(draining, "exit");
  let held;
  const forceStop = setTimeout(() => draining.kill("SIGKILL"), 5000);
  try {
    await Promise.race([
      once(draining.stdout, "data"),
      drained.then(() => {
        throw new Error("Drain-test subprocess did not start.");
      }),
    ]);
    held = connect({ host: "127.0.0.1", port });
    held.on("error", () => {});
    await once(held, "connect");
    held.write("GET /api/health HTTP/1.1\r\nHost: localhost\r\nX-Hold: ");
    await delay(50);
    const started = Date.now();
    draining.kill("SIGTERM");
    const [forcedCode, forcedSignal] = await drained;
    assert.equal(
      forcedCode,
      1,
      "deadline exit must signal an incomplete drain",
    );
    assert.equal(forcedSignal, null);
    assert.ok(
      Date.now() - started < 2500,
      "drain deadline must close held connections",
    );
  } finally {
    clearTimeout(forceStop);
    held?.destroy();
    if (draining.exitCode === null && draining.signalCode === null) {
      draining.kill("SIGKILL");
      await drained;
    }
  }
  console.log(
    `Production subprocess smoke passed: bind, assets, secret/static boundaries, headers, readiness ${ready.status}, rate identity, liveness, clean/deadline shutdown, invalid config.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await exited;
  }
  if (process.exitCode) console.error(output.slice(-2000));
}

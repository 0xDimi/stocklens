import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = (process.env.STOCKLENS_URL || "http://127.0.0.1:4173").replace(
  /\/$/,
  "",
);
const evidence = [];
async function check(path, status = 200, options = {}) {
  const response = await fetch(base + path, {
    redirect: "manual",
    signal: AbortSignal.timeout(40000),
    ...options,
  });
  assert.equal(response.status, status, `${path}: ${response.status}`);
  evidence.push({
    path,
    status: response.status,
    redirect: response.headers.get("location"),
  });
  return response;
}
const home = await check("/");
assert.equal(
  home.headers.get("set-cookie"),
  null,
  "App must not require a session cookie",
);
if (base.startsWith("https://"))
  assert.ok(home.headers.get("strict-transport-security"));
assert.ok(
  home.headers.get("content-security-policy")?.includes("script-src 'self'"),
);
const html = await home.text();
const script = html.match(/src="(\/src\/app\.mjs\?v=[a-f0-9]+)"/)[1];
const loaded = new Set();
async function moduleGraph(path) {
  if (loaded.has(path)) return;
  loaded.add(path);
  const response = await check(path);
  const source = await response.text();
  for (const match of source.matchAll(
    /from\s+["'](\.\/[^"']+\.mjs\?v=[a-f0-9]+)["']/g,
  ))
    await moduleGraph(
      new URL(match[1], base + path).pathname +
        new URL(match[1], base + path).search,
    );
}
await moduleGraph(script);
await check("/api/health");
await check("/api/ready");
for (const path of [
  "/.env",
  "/.git/config",
  "/package.json",
  "/server/coingecko.mjs",
  "/server/data/catalog-seed.json.gz",
  "/.cache/coingecko-observations.json",
])
  await check(path, 404);
await check("/api/catalog", 405, { method: "POST" });
await check("/api/screener?page=0", 400);
await check("/api/compare?stock=NVDA&amount=not-a-number", 400);
const summary = {
  checkedAt: new Date().toISOString(),
  status: "passed",
  base,
  authentication: "No cookies or authorization supplied; no login redirects",
  clientModules: loaded.size,
  requests: evidence,
};
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/portfolio-public-access.json",
  JSON.stringify(summary, null, 2),
);
console.log(JSON.stringify(summary, null, 2));

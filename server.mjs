import { createServer } from "node:http";
import { gzip } from "node:zlib";
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  productsView,
  marketsView,
  historyView,
  validateView,
} from "./server/workspace.mjs";
import { screenerView, venuesView } from "./server/market-desk.mjs";
import { fundamentalsView } from "./server/fundamentals.mjs";
import { marketDetailsView } from "./server/market-details.mjs";
import { loadCatalog } from "./server/catalog.mjs";
import { compareStock, validateComparison } from "./server/quotes.mjs";
import { readRuntime, clientIdentity } from "./server/runtime.mjs";
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ...[
    "app.mjs",
    "comparison-ui.mjs",
    "comparison-state.mjs",
    "product-terms.mjs",
    "product-terms.css",
    "home-comparison.css",
    "reference-view.mjs",
    "stock-pages.mjs",
    "asset-comparison-model.mjs",
    "comparison-ui.css",
    "stock-pages.css",
    "data.mjs",
    "model.mjs",
    "views.mjs",
    "chart.mjs",
    "terminal.mjs",
    "styles.css",
    "brands.mjs",
    "market-model.mjs",
    "markets-page.mjs",
    "market-feed.mjs",
    "market-observations.mjs",
  ].map((name) => [
    "/src/" + name,
    [
      "src/" + name,
      name.endsWith(".css")
        ? "text/css; charset=utf-8"
        : "text/javascript; charset=utf-8",
    ],
  ]),
]);
for (const name of readdirSync(new URL("./assets/logos/", import.meta.url)))
  if (/^[a-zA-Z0-9_.-]+\.png$/.test(name))
    files.set("/assets/logos/" + name, ["assets/logos/" + name, "image/png"]);
// A single graph revision prevents browser caches from mixing releases.
const revisionHash = createHash("sha256");
for (const [path, [file, type]] of files)
  if (/^(text\/|application\/javascript)/.test(type))
    revisionHash
      .update(path)
      .update(readFileSync(new URL(file, import.meta.url)));
const assetRevision = revisionHash.digest("hex").slice(0, 12);
function versionAsset(body, type) {
  if (type.startsWith("text/html"))
    return body
      .toString()
      .replace(
        /(src|href)="(\/src\/[^"?]+\.(?:mjs|css))"/g,
        (_, attribute, path) => `${attribute}="${path}?v=${assetRevision}"`,
      );
  if (type.startsWith("text/javascript"))
    return body
      .toString()
      .replace(
        /(from\s+["'])(\.\/[^"'?]+\.mjs)(["'])/g,
        (_, prefix, path, quote) =>
          `${prefix}${path}?v=${assetRevision}${quote}`,
      );
  return body;
}
const securityHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://coin-images.coingecko.com https://assets.coingecko.com https://xstocks-metadata.backed.fi https://cdn.ondo.finance; connect-src 'self' https://api.coingecko.com; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};
function deadline(work, ms) {
  let timer;
  return Promise.race([
    Promise.resolve().then(work),
    new Promise((_, reject) => {
      timer = setTimeout(
        () =>
          reject(new Error("Data request timed out. Please retry shortly.")),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}
export function createApp({
  getCatalog = loadCatalog,
  compare = compareStock,
  products = productsView,
  markets = marketsView,
  history = historyView,
  screener = screenerView,
  venues = venuesView,
  runtime = {},
} = {}) {
  const config = { ...readRuntime(), ...runtime };
  const traffic = new Map();
  let readyWork,
    readyUntil = 0,
    readyValue;
  const readiness = () => {
    if (readyUntil > Date.now()) return Promise.resolve(readyValue);
    if (readyWork) return readyWork;
    readyWork = deadline(getCatalog, 30000)
      .then((catalog) => {
        readyValue =
          Array.isArray(catalog?.stocks) && catalog.stocks.length > 0;
        readyUntil = Date.now() + 10000;
        return readyValue;
      })
      .catch(() => {
        readyValue = false;
        readyUntil = Date.now() + 3000;
        return false;
      })
      .finally(() => {
        readyWork = null;
      });
    return readyWork;
  };
  const server = createServer(
    {
      requestTimeout: 30000,
      headersTimeout: 10000,
      keepAliveTimeout: 5000,
      maxHeaderSize: 16384,
    },
    async (request, response) => {
      const send = (
        status,
        data,
        type = "application/json; charset=utf-8",
        extra = {},
      ) => {
        const body =
          typeof data === "string" || Buffer.isBuffer(data)
            ? data
            : JSON.stringify(data);
        const headers = {
          ...securityHeaders,
          ...(config.production
            ? { "Strict-Transport-Security": "max-age=31536000" }
            : {}),
          "Content-Type": type,
          Vary: "Accept-Encoding",
          ...extra,
        };
        const finish = (payload, compressed = false) => {
          if (response.destroyed || response.writableEnded) return;
          response.writeHead(status, {
            ...headers,
            ...(compressed ? { "Content-Encoding": "gzip" } : {}),
          });
          response.end(request.method === "HEAD" ? undefined : payload);
        };
        const encodings = String(request.headers["accept-encoding"] || "")
          .split(",")
          .map((item) => {
            const [name, ...params] = item.trim().toLowerCase().split(";");
            const quality = params.find((p) => p.trim().startsWith("q="));
            return [name, quality ? Number(quality.trim().slice(2)) : 1];
          });
        const quality =
          encodings.find(([name]) => name === "gzip")?.[1] ??
          encodings.find(([name]) => name === "*")?.[1] ??
          0;
        if (
          quality > 0 &&
          quality <= 1 &&
          Buffer.byteLength(body) >= 65536 &&
          /^(application\/json|text\/)/.test(type)
        ) {
          gzip(body, (error, compressed) =>
            finish(error ? body : compressed, !error),
          );
        } else finish(body);
      };
      try {
        if (!["GET", "HEAD"].includes(request.method)) {
          send(405, { error: "Use GET to read this endpoint." }, undefined, {
            Allow: "GET, HEAD",
          });
          return;
        }
        if (!request.url || request.url.length > 2048) {
          send(414, { error: "Request URL is too long." });
          return;
        }
        const url = new URL(request.url, "http://localhost");
        if (url.pathname === "/api/health") {
          send(200, { status: "ok", version: "0.8.2" });
          return;
        }
        if (url.pathname === "/api/ready") {
          const ready = await readiness();
          send(ready ? 200 : 503, {
            status: ready ? "ready" : "unavailable",
            catalogReady: ready,
          });
          return;
        }
        if (url.pathname.startsWith("/api/")) {
          const now = Date.now(),
            ip = clientIdentity(request, config.trustedProxies);
          let limit = traffic.get(ip);
          if (!limit || limit.until <= now) {
            if (traffic.size >= 10000) {
              for (const [key, value] of traffic)
                if (value.until <= now) traffic.delete(key);
            }
            if (!limit && traffic.size >= 10000) {
              send(503, { error: "Service is busy. Please retry shortly." });
              return;
            }
            limit = { count: 0, until: now + 60000 };
            traffic.set(ip, limit);
          }
          if (++limit.count > config.rateLimit) {
            send(
              429,
              { error: "Too many requests. Please wait a minute." },
              undefined,
              {
                "Retry-After": String(
                  Math.max(1, Math.ceil((limit.until - now) / 1000)),
                ),
              },
            );
            return;
          }
          try {
            if (url.pathname === "/api/catalog") {
              send(200, await deadline(getCatalog, 35000));
              return;
            }
            if (url.pathname === "/api/market-details") {
              send(
                200,
                await deadline(
                  () => marketDetailsView(url.searchParams),
                  35000,
                ),
              );
              return;
            }
            if (url.pathname === "/api/fundamentals") {
              send(
                200,
                await deadline(() => fundamentalsView(url.searchParams), 35000),
              );
              return;
            }
            if (url.pathname === "/api/screener") {
              send(
                200,
                await deadline(() => screener(url.searchParams), 35000),
              );
              return;
            }
            const views = {
              "/api/products": products,
              "/api/markets": markets,
              "/api/history": history,
              "/api/venues": venues,
            };
            if (views[url.pathname]) {
              let query;
              try {
                query = validateView(url.searchParams);
              } catch (error) {
                send(400, { error: error.message });
                return;
              }
              send(
                200,
                await deadline(
                  () => views[url.pathname](query, url.searchParams),
                  35000,
                ),
              );
              return;
            }
            if (url.pathname === "/api/compare") {
              let query;
              try {
                query = validateComparison(url.searchParams);
              } catch (error) {
                send(400, { error: error.message });
                return;
              }
              send(200, await deadline(() => compare(query), 35000));
              return;
            }
            send(404, { error: "API endpoint not found." });
            return;
          } catch (error) {
            send(
              Number.isInteger(error.status) &&
                error.status >= 400 &&
                error.status < 600
                ? error.status
                : 503,
              { error: error.message },
            );
            return;
          }
        }
        const file = files.get(url.pathname);
        if (!file) {
          send(404, "Not found", "text/plain; charset=utf-8");
          return;
        }
        const body = await readFile(new URL(file[0], import.meta.url));
        send(200, versionAsset(body, file[1]), file[1], {
          "Cache-Control":
            config.production && url.pathname !== "/"
              ? "public, max-age=300, must-revalidate"
              : "no-store",
        });
      } catch (error) {
        console.error("Request failed:", error.code || "internal error");
        if (!response.headersSent)
          send(500, { error: "The request could not be completed." });
        else response.end();
      }
    },
  );
  return server;
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) ===
    fileURLToPath(pathToFileURL(process.argv[1]))
) {
  const config = readRuntime();
  const server = createApp({ runtime: config });
  server.on("error", (error) => {
    console.error(`Cannot start Stocklens: ${error.code || "listen error"}`);
    process.exitCode = 1;
  });
  server.listen(config.port, config.host, () =>
    console.log(`Stocklens listening on ${config.host}:${config.port}`),
  );
  let stopping = false;
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => {
      if (stopping) return;
      stopping = true;
      const timer = setTimeout(() => {
        server.closeAllConnections();
        process.exit(1);
      }, config.shutdownMs);
      timer.unref();
      server.close(() => {
        clearTimeout(timer);
        process.exit(0);
      });
      server.closeIdleConnections();
    });
}

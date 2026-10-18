import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  productsView,
  marketsView,
  historyView,
  validateView,
} from "./server/workspace.mjs";
import { loadCatalog } from "./server/catalog.mjs";
import { compareStock, validateComparison } from "./server/quotes.mjs";

try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ...["app.mjs", "data.mjs", "model.mjs", "views.mjs", "styles.css"].map(
    (name) => [
      "/src/" + name,
      [
        "src/" + name,
        name.endsWith(".css")
          ? "text/css; charset=utf-8"
          : "text/javascript; charset=utf-8",
      ],
    ],
  ),
]);
const securityHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
};
export function createApp({
  getCatalog = loadCatalog,
  compare = compareStock,
  products = productsView,
  markets = marketsView,
  history = historyView,
} = {}) {
  const traffic = new Map();
  return createServer(async (request, response) => {
    const send = (status, data, type = "application/json; charset=utf-8") => {
      response.writeHead(status, { ...securityHeaders, "Content-Type": type });
      response.end(
        request.method === "HEAD"
          ? undefined
          : typeof data === "string"
            ? data
            : JSON.stringify(data),
      );
    };
    try {
      if (!["GET", "HEAD"].includes(request.method)) {
        response.setHeader("Allow", "GET, HEAD");
        send(405, { error: "Use GET to read this endpoint." });
        return;
      }
      if (request.url.length > 2048) {
        send(414, { error: "Request URL is too long." });
        return;
      }
      const url = new URL(request.url, "http://localhost");
      if (url.pathname.startsWith("/api/")) {
        const now = Date.now(),
          ip = request.socket.remoteAddress;
        let limit = traffic.get(ip);
        if (!limit || limit.until < now) {
          limit = { count: 0, until: now + 60_000 };
          if (traffic.size > 1000) traffic.clear();
          traffic.set(ip, limit);
        }
        if (++limit.count > 90) {
          response.setHeader("Retry-After", "60");
          send(429, { error: "Too many requests. Please wait a minute." });
          return;
        }
        if (url.pathname === "/api/health") {
          send(200, { status: "ok", version: "0.3.0" });
          return;
        }
        if (url.pathname === "/api/catalog") {
          try {
            send(200, await getCatalog());
          } catch (error) {
            send(503, { error: error.message });
          }
          return;
        }
        const views = {
          "/api/products": products,
          "/api/markets": markets,
          "/api/history": history,
        };
        if (views[url.pathname]) {
          let query;
          try {
            query = validateView(url.searchParams);
          } catch (error) {
            send(400, { error: error.message });
            return;
          }
          try {
            send(200, await views[url.pathname](query, url.searchParams));
          } catch (error) {
            send(error.status || 503, { error: error.message });
          }
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
          try {
            send(200, await compare(query));
          } catch (error) {
            send(error.status || 503, { error: error.message });
          }
          return;
        }
        send(404, { error: "API endpoint not found." });
        return;
      }
      const file = files.get(url.pathname);
      if (!file) {
        send(404, "Not found", "text/plain; charset=utf-8");
        return;
      }
      const body = await readFile(new URL(file[0], import.meta.url));
      response.writeHead(200, { ...securityHeaders, "Content-Type": file[1] });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
      console.error("Request failed:", error.message);
      if (!response.headersSent)
        send(500, { error: "The request could not be completed." });
      else response.end();
    }
  });
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) ===
    fileURLToPath(new URL("file://" + process.argv[1]))
) {
  const port = Number(process.env.PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be between 1 and 65535.");
  const server = createApp();
  server.on("error", (error) => {
    console.error(`Cannot start Stocklens: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(`Stocklens is ready at http://127.0.0.1:${port}`),
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => server.close(() => process.exit(0)));
}

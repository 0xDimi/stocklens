import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

// Intentionally expose only the demo's public files, not the project directory.
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/src/app.mjs", ["src/app.mjs", "text/javascript; charset=utf-8"]],
  ["/src/data.mjs", ["src/data.mjs", "text/javascript; charset=utf-8"]],
  ["/src/model.mjs", ["src/model.mjs", "text/javascript; charset=utf-8"]],
  ["/src/styles.css", ["src/styles.css", "text/css; charset=utf-8"]],
]);
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be an integer between 1 and 65535.");
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  const file = files.get(path);
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }
  if (!file) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  try {
    const body = await readFile(new URL(file[0], import.meta.url));
    response.writeHead(200, {
      "Content-Type": file[1],
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    console.error(error);
    response.writeHead(500);
    response.end("Could not load demo file.");
  }
});
server.on("error", (error) => {
  console.error(`Cannot start Stocklens: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Stocklens is ready at http://127.0.0.1:${port}`),
);

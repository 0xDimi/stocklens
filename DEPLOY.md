Stocklens runs on Node.js 22 or newer with no runtime packages. It serves the comparison app and its read-only API from one process. Market access requires outbound HTTPS to the configured data providers. Source availability, rate limits and coverage constrain live data. Nasdaq public endpoints provide optional listed-stock references; CoinGecko and issuer/CDN image hosts are explicitly allowed for logos. The Docker image includes the local `assets/` directory. Logo refresh is a manual development task, not a runtime dependency.

## Run directly

```sh
cp .env.example .env
npm test
NODE_ENV=production HOST=0.0.0.0 PORT=4173 node server.mjs
```

Open `http://localhost:4173`. Put HTTPS termination in front of this port for a public deployment. Keep credentials in the process environment or a server-only `.env`; the static allowlist excludes `.env`, server code, package metadata and cache files. Do not place credentials in `src/` or `index.html`.

`HOST` defaults to `127.0.0.1` locally and `0.0.0.0` in production. `PORT` defaults to 4173; the platform's assigned `PORT` takes precedence over `.env`. Invalid bind addresses, ports, proxy settings, limits, source plan or RPC URLs stop startup. `.env.example` lists the supported configuration. Source credentials and RPC URLs are never part of the public runtime configuration.

Set `CACHE_DIR` to an application-owned writable directory. The default is `.cache/` beside `server.mjs`. Catalog snapshots use atomic replacement and restrictive file permissions. A failed disk write leaves a fresh successful response available with a persistence warning. A previously saved catalog may be retained for up to 72 hours after a refresh failure and is marked stale. The first 12 hours use the saved catalog without refreshing it. Individual market-source observations remain in bounded process memory and may be retained for `SOURCE_STALE_MS` on a failed refresh; these observations are lost on restart. Stale observations retain their original retrieval time and include stale/warning metadata. They are observations, never executable prices.

## Container

```sh
docker compose up --build -d
curl --fail http://127.0.0.1:4173/api/health
curl --fail http://127.0.0.1:4173/api/ready
docker compose logs --tail=100
docker compose down
```

The image runs as the unprivileged `node` user. Compose binds the host's loopback interface, uses a read-only root filesystem and stores cache data in the named `stocklens-cache` volume. Add a reverse proxy on the host for external traffic. A host bind mount must be writable by the container user (UID 1000 in this image). `docker compose down` preserves the named volume; `docker compose down -v` deletes it.

The image copies only runtime files. `.dockerignore` excludes secrets, cached observations, research and development files. The image liveness check uses Node's built-in `fetch`.

## Render manifest

`render.yaml` describes a single always-on Docker web service with no paid disk and `/api/health` as its platform health path. The approved base hosting budget is $7/month before taxes and usage overages on the free Hobby workspace. Do not upgrade the workspace to Pro. Cache files are temporary and are rebuilt from sources after a restart or redeploy. Import this repository as a Blueprint, review the service compute cost, then configure a free Demo source key privately if available. The manifest uses the documented `0.5c-512mb` compute ID, waits for passing CI checks before automatic deploys, and does not require an API key during setup. Add `COINGECKO_API_KEY` in the service environment when available. Render assigns `PORT`; the server binds `0.0.0.0`. The repository is prepared for Render; creating and validating a cloud service requires a signed-in Render account. A GitHub push alone does not create a public application URL.

The supplied manifest leaves `TRUST_PROXY` empty. Before raising public traffic limits, identify the immediate proxy peer addresses in your deployment and set the exact addresses you trust. If your platform does not supply stable trusted peer addresses, retain the empty setting and budget the shared proxy rate limit or put a controlled reverse proxy in front. Do not set a blanket proxy trust flag.

## Probes, limits and shutdown

- `GET /api/health` is process liveness. It never reads market sources and bypasses API throttling.
- `GET /api/ready` checks that the real catalog contains securities. It returns 200 when ready and 503 otherwise. Concurrent probes share a catalog load; successful results are reused for 10 seconds and failures for 3 seconds. A check has a 30-second deadline. It bypasses API throttling.
- Other `/api/` routes share `RATE_LIMIT_PER_MINUTE` per client identity. `Retry-After` reports the remaining window. By default the socket peer defines the identity; forwarded headers have no effect. With `TRUST_PROXY`, the server walks `X-Forwarded-For` from the nearest hop and selects the first untrusted address. The trusted reverse proxy must append the actual client address. Malformed chains fall back to the socket peer.
- Each managed market source permits at most `SOURCE_CONCURRENCY` active jobs and `SOURCE_MAX_QUEUE` waiting jobs. Duplicate requests coalesce, queued work and pacing share an 18-second waiting deadline, provider pacing is preserved, HTTP 429 sets a source-wide cooldown and HTTP requests have a timeout. Queue overflow fails promptly or returns an explicitly stale previous observation. All outbound HTTP calls also share a process-wide ceiling of 16 active requests and 64 waiting requests; queue waiting consumes the HTTP timeout budget.
- Large JSON and text responses negotiate gzip to reduce transfer. Background market observations refresh every ten minutes while the page is visible; on-demand execution quotes retain their short expiry. API responses and HTML are `no-store`. Production JS/CSS use a five-minute cache with revalidation; deployment asset URLs are stable, so reload clients after an update. CSP permits only same-origin scripts, styles and connections. Production responses include a one-year HSTS header, which browsers apply only over HTTPS. Server logs omit source credentials.
- `SIGTERM` and `SIGINT` stop accepting new connections and drain requests. At `SHUTDOWN_TIMEOUT_MS`, remaining connections are closed and the process exits with status 1. A clean drain exits 0. Give the process more time than this deadline before a platform hard kill; Compose provides 15 seconds for the default 10-second deadline.

Rate limits and source queues are per process. Multiple replicas require an external shared rate limiter if one combined budget is needed. There is no user account database or cross-replica state synchronization.

## Verify a deployment

```sh
npm test
node scripts/production-smoke.mjs --require-ready
```

The smoke script starts a real production child process, checks assigned-port binding, all served modules, security headers, private-file exclusion, secret isolation, API throttling, forwarding spoof resistance, liveness, catalog readiness, invalid configuration, graceful shutdown and deadline termination of an incomplete HTTP connection. It contacts the actual catalog sources. Without `--require-ready`, a real 503 is recorded as degraded source availability and still tests the runtime; the stricter command requires a usable live catalog. It never replaces provider responses with fixtures.

CI runs the Node tests and production subprocess smoke on Node 22 and 24. Its container job builds the image and checks the unprivileged user, static boundary, health and clean termination. These jobs only count as validated after they actually run. Local Docker validation requires Docker; no container-build claim follows from the subprocess tests.

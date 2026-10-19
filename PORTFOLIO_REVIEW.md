# Portfolio review — October 19, 2026

Release: 0.6.0. Scope: a public, low-traffic WIP comparison product. Final public rollout results are recorded below after deployment.

## Review and repairs

The review covered server request/resource boundaries, source freshness and identity, numeric comparisons, browser rendering/navigation, and deployment/public access. It included independent client, data and server reviews; findings were checked against the actual changes.

- Cancel failed, oversized and aborted upstream response streams before releasing request slots. A real local HTTP regression checks connection cleanup and subsequent slot reuse.
- Enforce the 72-hour catalog retention limit using original source observations. Rewriting a snapshot or repeating an outage no longer renews identities. Expired in-memory catalogs are checked on access as well.
- Preserve CoinGecko discovery timestamps and stale state through persistence and asset grouping. HTTP 200 error or malformed onchain bodies cannot overwrite valid cached observations.
- Use authenticated CoinGecko onchain pool/history reads when the public GeckoTerminal source fails or returns stale data and a server key is configured. Fresh public responses make no duplicate authenticated request. Contract matching, original timestamps and provider provenance remain explicit.
- Preserve Markets keyboard focus and open source disclosures across background updates; wait for the main feed before forcing detail refresh. Mobile asset selection focuses the selected company, and the skip link follows the active page.

No runtime dependency was added. Secrets remain server-side; alternate `.env.*` files are ignored. A tracked-file credential-pattern scan found no matches; that scan is bounded by its patterns and is not a claim that arbitrary secrets can never exist.

## Local release verification

Node 22: **181 tests passed, none failed or skipped**. Production subprocess smoke passed with real catalog readiness HTTP 200, security headers/static boundaries, request-rate identities, and clean/deadline shutdown checks.

Real browser checks confirmed the comparison flow and exact Raydium token handoff, expired-quote recommendation/link removal, keyboard focus through background Markets updates, and mobile selection focus. No transaction or wallet connection was submitted.

Evidence is saved locally under ignored `test-results/portfolio-*`. Automated regressions include controlled failures; final release validation also uses actual application HTTP endpoints, external data and browser interactions.

## Scope and limits

This product compares supported observations and quotes; it does not execute transactions or promise universal venue/asset coverage. The catalog includes held-back identity mappings and explicitly identified missing fields. Quotes expire, unavailable share conversions remain unranked, and issuer access rules apply at the destination venue.

Free data providers impose rate and monthly limits. Cached values keep their source dates and are not relabeled as fresh. Company capitalization and provider-disclosed fiscal P/E are distinct from tokenized market capitalization; ETF company metrics are not applicable. A public WIP can have temporary missing observations when sources fail. Continuous freshness at sustained traffic has not been load-qualified.

The deployment remains the existing single Render service. No paid service, data-plan upgrade, new credential or scheduled monitor was added during this audit.

## Public rollout verification

Pending deployment of this release. Do not treat this section as production sign-off until actual public checks are recorded here.

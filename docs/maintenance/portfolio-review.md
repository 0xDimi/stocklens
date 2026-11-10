# Portfolio review — October 19, 2026

Release: 0.6.0. Scope: a public, low-traffic WIP comparison product. Public release checks passed against the deployed application; details and limits follow.

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

The audited runtime commit `1a52479771bfaa4d54da9490b8eb41b5d12ce08f` was deployed successfully by Render as `dep-dbb1mjp42hec73e57r40`. Public `/api/health` reports version 0.6.0. GitHub [verification run 39260608802](https://github.com/0xDimi/stocklens/actions/runs/39260608802) passed Node 22, Node 24 and an actual non-root, read-only-container startup/shutdown check.

Actual public integration completed at `2026-10-19T13:31:13.875Z`:

| Check | Observed result |
| --- | --- |
| Catalog | 1,961 unique assets |
| NVIDIA products | 13 including wrappers; 12 with token-market prices |
| NVIDIA pools and history | 16 exact-contract pools; 24 real hourly candles |
| NVIDIA quotes | 13 routes quoted; 5 with verified share normalization |
| Apple quotes | 11 routes quoted; 5 with verified share normalization |
| Tesla quotes | 9 routes quoted; 5 with verified share normalization |
| Markets feed | 248 source-observed priced rows on page one, fresh server delivery |
| Public access | No cookies, authorization or login redirect; 11 versioned client modules loaded |

Separate public integrations passed selected-ID retrieval, observed exchange venues, current chart candles, quote arithmetic/order, exact venue handoff addresses, bad-input HTTP responses, and private-file HTTP 404 boundaries. Company capitalization, provider-disclosed fiscal P/E and fresh indicative premium passed for NVIDIA, Apple and Tesla; ETF company metrics were correctly inapplicable. Legacy Apple links resolved correctly. Checked metrics are dated observations, not current financial claims.

The browser rendered the deployed exact-pool chart with 24 candles and the expected token/network; its Markets source disclosure retained keyboard focus across background updates. Actual CSV export produced a valid one-row watchlist file with explicit USD/percent columns. Mobile selection focused the company heading, remained focused through asynchronous enrichment, and kept page width within the tested 375px viewport. The app was browsed without an account or wallet. No transaction was submitted.

Final local evidence: `portfolio-public-integration-final.log`, `portfolio-public-terminal.log`, `portfolio-public-metrics.log`, `portfolio-public-feed.log`, `portfolio-public-access-final.log`, their JSON summaries, and `portfolio-ci.json`. Browser proof is captured separately. The live history request used a fresh GeckoTerminal response; authenticated fallback is regression-covered, but a production fallback was not forced by manufacturing provider failures.

**Portfolio verdict:** ready to present as a public WIP comparison tool. These checks establish the tested flows at the recorded time; they do not guarantee every upstream field, venue or future refresh will be available.

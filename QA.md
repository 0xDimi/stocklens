# Verification — October 19, 2026 (Europe/Athens)

## Current comparison interface

The user preferred the previous, intuitive comparison layout over a terminal. The current interface restores daylight/teal surfaces, normal page scrolling and a two-column asset finder/comparison. Price per token, 24h volume, issuer structure and networks are visible in product rows. Buy comparison leads with fresh verified share exposure, equivalent-share cost and the exclusion of network costs. Charts and source detail are opened on demand.

Validation for this UI change: **74 tests pass on Node 22**, including two new red→green regressions for fresh/verified-only purchase summaries and visible product structure. Strict production subprocess smoke passed with actual catalog readiness 200. The data adapters and deployment configuration are preserved.

Actual browser checks used the running service and real source data: NVIDIA's 12 products and 35 deployment routes; a buy comparison with 12 successful quotes and five verified conversions; selected-pool history retained the chosen pool and returned 24 actual hourly candles. Desktop and mobile checks cover product metrics, the primary compare action, summary state, exact-pool chart access and progressive disclosure. Mobile document/body width remained within the viewport. Secondary sorting/export controls moved into More; actual mobile sorting and CSV download passed. Mobile omits the repeated buy CTA because Buy comparison is already a visible tab. The complete first NVIDIA product row occupied y634–843 within an 844px viewport. The independent reviewer confirmed the mobile finding resolved. Independent code review found no material regression. The UI detector ran once with no findings.

Evidence: `test-results/comparison-redesign-node22.log`, `comparison-redesign-smoke.log`, `comparison-desktop.png`, `comparison-mobile.png`. Earlier terminal evidence below is retained as historical context; its visual layout is superseded.

Release: Stocklens Terminal 0.4.0. Local test evidence is saved under ignored `test-results/`; these measurements describe the observed runs, not guaranteed future coverage.

## Actual source integrations

`npm run integration` passed at `2026-10-18T21:50:44Z` (October 19 in Athens), using real issuer, CoinGecko, GeckoTerminal, RPC and quote responses. No fixture substitution was used for final integration validation.

- Catalog: 1,514 securities, 12 recognized issuer/product families, 18 configured chains.
- NVIDIA: 12 products, 35 deployments, 11 CoinGecko product prices, 16 matching search pools, 24 hourly observations. Native RWA refresh grouped ten products; wrappers remained excluded.
- 206 issuer records were quarantined because identity mappings were inconsistent or unconfirmed.

| Security | Deployments checked | Actual quoted routes | Verified share conversions |
| --- | ---: | ---: | ---: |
| NVIDIA | 35 | 12 | 5 |
| Apple | 33 | 11 | 5 |
| Tesla | 34 | 7 | 4 |

Assertions check actual output, normalized arithmetic/order, contract identity and orientation, exact venue handoff addresses, source coverage, time bounds and input validation. Raw evidence: `live-integration.json` and `terminal-full-integration.log`.

`npm run integration:terminal` passed at `2026-10-18T21:47:16Z`: a CoinGecko RWA page returned 250 observations, of which 217 matched exact catalog IDs. The other 1,297 catalog assets remained unknown for that page. NVIDIA's xStock returned 35 venue rows spanning 22 exchange identifiers; the selected onchain pool returned 24 real OHLC bars. Selected-ID retrieval and invalid HTTP parameters were checked. Raw evidence: `terminal-integration.json`.

An independently reproduced exact-token Ethereum pool failed history validation when token scope was removed. The corrected query returned HTTP 200 with two actual candles in the current one-day window; sparse trading is retained without filled periods.

## Browser end-to-end checks

Actual in-app browser against the running service:

- Desktop workstation at 1440 × 1000; mobile at 390 × 844. Mobile document/body scroll width was 375px within a 390px viewport (15px browser scrollbar), with no horizontal page overflow.
- Company/ticker command search, keyboard selection, linked security heading, persistent chart across table changes and local watchlist toggling/reload. A real watchlist JSON export/import round trip matched the catalog and preserved the saved set.
- Three-product shortlist logic and actual two-product side-by-side issuer comparison, including rights, dividends, source documents and exit conditions.
- Exchange product observations, source links, spread/depth fields and a real CSV download. Downloaded NVIDIA exchange CSV contains price, volume, exchange, pair, depth, timestamps, flags and observation status.
- Hourly candle keyboard inspection; range request and source failure handling. A public GeckoTerminal rate limit occurred during exploration and was shown as an outage with a retry action. Subsequent real hourly charts recovered. Same-pool refresh failures retain the previous chart and label its retained range/time.
- Apple quotes: 11/33 routes quoted and five normalized in the observed browser run. Tesla Solana filter: one normalized quote from four deployments. Invalid budget input, table switching, expired quote state and source disclosures were inspected.
- Mobile universe expand/search, Tesla selection, automatic collapse, linked chart and quote panel.

Screenshots: `terminal-desktop.png`, `terminal-mobile.png`. Browser viewport override is reset at handoff. Quote observations expire; screenshots are not current executable prices.

## Automated checks and review

**72 tests pass on Node 22.23.3**, including actual local HTTP and runtime subprocess boundaries. Coverage includes exact identity joins, conservative conversion qualification, BigInt precision, paused multipliers/oracles, stale/expired exclusion, CSV/HTML escaping, OHLC geometry and gaps, retained token scope, loaded-page polling, stale screener notices, source queues/deadlines/coalescing/cooldowns, unwritable cache handling, proxy spoofing, security headers, readiness and private-file boundaries.

The Node 22 production subprocess smoke passed with actual catalog readiness HTTP 200. It verifies assigned-port binding, all client modules, headers, secret/static boundaries, rate identity, invalid startup config, clean SIGTERM drain and forced deadline shutdown with an incomplete real HTTP connection. Logs: `node22-tests.log`, `node22-production-smoke.log`.

Independent code review identified exact-token chart scope, venue CSV schema, hidden chart source failures, incomplete loaded-page polling and hidden stale screener fallback. Each was corrected with regressions or real endpoint reproduction. The UI detector ran once and reported no findings. Final visual review required larger chart data/source text; chart values now use at least 11px and source metadata 12px, with wrapping on mobile. Final visual review is recorded in `docs/progress.md`.

## Deployment boundary

Production runtime, non-root Dockerfile, Compose, Render manifest, CI and operations instructions are supplied. No public service was created. Docker is unavailable on this computer, so the image and Compose have not been executed locally; CI Node 24 and container jobs are configured but have not run. Node 22 is validated locally. HTTPS termination and trusted proxy addresses must be configured for the chosen host as described in DEPLOY.md.

Public APIs can be delayed, partial, rate-limited or unavailable. Market-source observations live in process memory and disappear at restart; catalog snapshots persist. Unverified share ratios stay unranked. This release opens external venues and does not submit trades, custody assets, determine eligibility or provide a stock-exchange reference-price feed.

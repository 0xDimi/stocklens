## Data reliability repair — 0.5.0, October 19, 2026

The repair release passes 136 Node 22 tests and the strict production startup smoke with real catalog readiness. Actual HTTP repair integration passes company capitalization, provider-disclosed fiscal P/E, and independently obtained $1,000 indicative buy premiums for NVIDIA, Apple and Tesla. ETF applicability and saved CoinGecko asset links are checked. The broad real-source integration also passes issuer prices, exact-contract pools/history, normalized quotes and venue handoff identities. These checks use actual HTTP/source data, never fixture substitution.

Cold catalog readiness serves a dated checksummed seed immediately and refreshes in the background. The seed contains 1,961 unique assets and 3,153 versions; SPY and QQQ duplicates were removed after exact issuer/RWA corroboration. The 200 uncorroborated issuer records remain held back. Captured public CoinGecko and Nasdaq observations retain their original source times. Failures retain valid observations; provider error bodies cannot overwrite them. Product-price fallback observations are explicitly labeled as indicative buys rather than last-traded prices.

Actual browser validation confirms automatic Markets company/P/E/premium loading without a buy session and 998 source-observed market rows loaded through automatic pagination. P/E periods and missing-data reasons remain inspectable. The static module graph uses one content revision to prevent mixed browser-cache releases. Evidence: `test-results/fixes-tests.log`, `fixes-production-smoke.log`, `fixes-live-integration.log`, `local-repairs-integration.log`, and `repairs-integration.json`. The actual public Render repair integration passed the same source-backed cap/P/E/premium and canonical-link assertions. GitHub CI passed on Node 22 and 24 and built and ran the actual production Docker image. Final rollout checks are recorded under `test-results/public-repairs-integration.log`.

MSTR’s documented legal name change is corroborated without weakening symbol or company checks. Premium cells retain venue-reported price impact and flag observations at 5% or above; the observed SKHY quote reported 70.53% impact, explaining why its $1,000 buy cost differs materially from the listed price. After-hours comparisons explicitly identify the official last-close basis.

The Render cost-guard automation was deleted at the owner's request. Hosting remains the existing single Render service.

# Verification — October 19, 2026 (Europe/Athens)

## Home, Markets, identity and logo update · 2026-10-19

The current UI has Home for comparison and a separate full-catalog Markets table. Real circular stock, issuer, network and venue marks have local retrieval provenance in `assets/logos/sources.json`, strict remote-image allowlisting and text fallbacks. Source-native grouping runs when an asset opens. Additional wrapped xStocks and ST0x wtStock are explicitly classified and opt-in. Held-back issuer mappings remain inspectable in the coverage dialog and cannot enter canonical comparisons or quotes.

**86 tests pass on Node 22.** Regressions cover registry assets without token mappings, wrapper classification (including persisted snapshots), issuer correction without duplicate versions, exact-contract Ondo enrichment without uncorroborated ISIN reassignment, inspectable held-back rows, source counts, safe logos, market search/sort/watchlists, corroborated listed-stock names, ET timestamps, missing P/E, reference retries and premium timestamp/conversion guards. Production subprocess smoke passed with actual readiness 200 and all new client modules. Docker now includes local assets; Docker execution remains unavailable locally.

Final real integration at `2026-10-19T10:11:47Z` passed: 1,963 catalog assets, NVIDIA 13 mapped versions (including wrappers), 12 with prices and 11 native-grouped products; real exact-contract pools/history, normalized quotes and validated venue handoffs for NVDA, AAPL and TSLA. Quote quantities and prices are time-bound observations, not current offers.

Browser checks cover Markets direct links, Home navigation, command search from Markets into NVIDIA comparison, wrapper inclusion (11 → 13 displayed versions), issuer comparison and its quote CTA, a fresh xStocks/Solana quote with exact Raydium input/output mint handoff, shared watchlist save/filter/removal, network filtering, current-page company-data loading, 200 inspectable held-back issuer rows and desktop/mobile layouts. The public Nasdaq feed supplied 17 corroborated company references for one 25-row page; missing fields were not estimated. At 390×844, the first complete NVIDIA product row occupied y642–841; document width stayed inside the viewport. No console errors or visible broken logo images were observed in the completed checks. The Markets quote premium appeared for an actual normalized order and cleared to an expired state after 30 seconds. Independent code and four-screenshot review found no material blockers; the reviewer independently reran all 86 tests.

Markets premium uses the latest fresh, share-normalized supported order, a current USD Nasdaq reference and the stated USDC=$1 assumption. It is cleared when the quote expires. It is not a market-wide spot estimate. P/E remains unavailable unless explicitly supplied by the connected source. Coverage is partial: 160 registry assets had no initial mapped token, 200 issuer records remained held back, 16 networks were observed and 18 are configured; quote adapters cover five. Source timestamps, partial legal disclosures and issuer-identity gaps remain visible.

Evidence: `test-results/upgrade-node22-tests.log`, `comparison-markets-smoke.log`, `comparison-markets-integration-final.log`, `live-integration.json`, `home-personalized-desktop.png`, `home-personalized-mobile.png`, `markets-desktop.png`, `markets-mobile.png`. Earlier sections describe previous releases.

## Previous comparison release

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

Public APIs can be delayed, partial, rate-limited or unavailable. Market-source observations live in process memory and disappear at restart; catalog snapshots persist. Unverified share ratios stay unranked. That earlier release opened external venues without stock-exchange reference data. The current update adds independent Nasdaq references; it still does not submit trades, custody assets or determine eligibility.

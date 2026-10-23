## Stocklens entry — 0.10.0, October 23, 2026

Bare Home now opens a forest/mint entry with a real catalog search, a stock-to-issuer lens graphic and familiar-stock shortcuts. Explicit stock, ticker and comparison-view links still bypass the entry. The entry reuses the existing catalog and makes no additional market-data calls. Counts and graph products come from actual catalog records; no illustrative prices are shown. The daylight comparison and Markets views retain their existing layout.

390 Node tests pass, including new entry-route, canonical-link, search-ranking and native-product checks. The real production subprocess smoke passed with catalog readiness. Brave browser checks covered company search, arrow-key selection, empty results, Escape, comparison handoff, browser Back, Home, Markets and direct buy-quote URLs. A native search-field Escape clear event initially reopened suggestions; preventing that default was reproduced and checked in the real browser.

Desktop at 1440×1000 and phones at 390×844 and 320×740 were inspected. The final desktop has a continuous forest background and hides the comparison-sharing action on the entry. Mobile search uses 16px text. Reduced-motion disables the one-time path reveal. The mechanical design detector reported no findings; independent finish review found no blocking issues. Screenshots and logs are in ignored test-results/discover-*.

## Comparison coverage — 0.9.0, October 23, 2026

The comparison now connects quote adapters on fifteen networks rather than five. Native or bridged funding tokens, decimals and RPC chain IDs were checked against official sources and real responses. Providers have explicit per-network capabilities: KyberSwap and Velora cover their verified networks; paced, quota-bounded LI.FI requests add Ink, Morph, X Layer and Mantle. New real NVIDIA routes were verified on Ink/Morph and the wrapped version on X Layer. A successful adapter check does not imply liquidity exists for every token or budget. No new keys, paid APIs or hosting services were added.

Seven issuer conversion policies join xStocks and Ondo: Coinbase, bStocks, Reality, Robinhood, Backpack, native Dinari and specific ST0x wrappers. Each uses exact issuer contract registries and current RPC data or documented wrapper units; unknown contracts, networks, symbols and wrappers fail closed. Whole conversion observations retain their original check time. Source notes are in docs/issuer-conversion-sources.md. Base and Ink exact-contract pool observations also become eligible for normalized prices. Home's representative buy fallback can use the expanded supported networks and issuers.

The real NVIDIA check improved from 22 quote responses/eight normalized to 27/21, across eight comparable issuers and ten quoted networks in that observation. Apple returned nineteen quotes/seventeen normalized. Quotes remain time-sensitive; these are dated integration observations rather than fixed coverage guarantees. In the same 27-asset real-source reference cohort, listed prices improved from five to 23; the larger identical-source replay improved 138 to 180 priced ETF-related rows. Reference identity, currency and time-alignment checks remain strict. See docs/evidence/2026-10-23-listed-coverage.md.

Missing routes now distinguish source limits, timeouts, source errors and provider price-impact rejection. Public HTTP error inspection reads at most a 4KB prefix and emits only recognized reason classes. The quote scheduler gives independent issuers a first opportunity before repeating one product's networks. Fee disclosures show provider fees included in output; wallet-dependent transaction costs say At venue rather than implying zero. CSV includes fee, conversion-source and availability fields. LI.FI source links open the documented POST API reference instead of an invalid GET response.

Independent review caught a scheduled Backpack split crossing a source await. Regression tests reproduce the boundary; the resolver now evaluates the clock after source reads. Pending multiplier activation bounds quote expiry, and metadata lookups start no follow-up requests after the caller's deadline. A real browser startup check caught a missing client-module allowlist entry; the complete module graph is now tested over HTTP while private server modules remain inaccessible.

Remaining external limits are explicit: no verified public USDC-funded order route on TON, Tron or Robinhood; no route can be supplied where tested providers return none; some issuer/wrapper conversions and non-US listed references remain unverified. Wallet-specific gas cannot be finalized without the transaction and wallet. No unsupported values are invented to fill these gaps.

## Source clock alignment — 0.8.5, October 22, 2026

Post-deployment real-source verification caught a just-fetched SOXL price/premium briefly disappearing. A diagnostic captured Render's response clock 38 milliseconds ahead of this computer even after HTTP receipt. Strict future-time checks rejected that new observation. Shared price selection, premium validation, conversion readiness and detail caching now tolerate at most one second of source/client clock difference while preserving original timestamps. The existing five-minute freshness, two-minute price alignment and Nasdaq minute-precision rules remain unchanged. Data beyond the one-second future bound remains rejected.

Six clock regressions failed before the fix and pass after it. One pre-existing future-clock fixture now checks 1,001ms beyond the clock rather than 1ms. The live integration's future bound uses the same explicit one-second constant; its five-minute age requirement is unchanged. Evidence is in ignored test-results/stability-clock-skew-* and stability-084-soxl-diagnostic.json. The 0.8.4 rollout passed Node 22/24 and Docker CI, public anonymous module access, browser prices/quotes and an unchanged seven-stock integration retry; this patch removes the captured first-observation failure rather than relying on that retry.

The first 0.8.5 CI run caught a conversion concurrency failure on Node 24. A deterministic gated-request regression reproduced twelve unsettled conversions against a six-request bound: a timeout released a worker before its underlying request settled. Workers now retain their slot until the request actually finishes; the batch stops waiting at its overall deadline. An explicit closed-batch guard and each conversion's original three-second deadline reject late writes, including retained-cache writes. The new regression also checks those writes cannot leak into the next refresh. The full suite now contains 334 tests.

## Stability audit — 0.8.4, October 22, 2026

This release repairs existing comparisons and interactions; it adds no feature or page. Stock overviews and stock comparisons now use Home's shared normalized-price selection, including the explicitly labeled $1,000 buy fallback. Displayed premiums use their exact listed reference. A live SPY check exposed a newer unaligned raw pool hiding a valid buy comparison; selection now prefers a current comparable observation before a raw price, without relaxing time alignment. Failed refreshes retain all observations with their original clocks and older-observation flags, including company fundamentals.

Buy-quote premiums now use the same USD, freshness, time-alignment and dated-close checks as the other comparisons. An absent or incompatible reference suppresses only the percentage, without changing quote ranking. Price-impact warnings remain independent. Markets CSV exports now include the displayed normalized price/premium, their basis and observation clocks, rather than silently omitting buy-based comparisons. Finite negative numeric values remain spreadsheet numbers; text formula protection remains active.

Changing a buy amount immediately clears exportable results and validates the input. Presets match shared-link and history amounts. Arrow-key navigation uses the selected primary tab after research views. Mobile Markets filters and primary controls have 44px minimum heights. The cold-start seed test now injects its clock; the production 72-hour catalog retention rule is unchanged.

Verification: 327 Node tests pass, with failing regressions reproduced before the financial-display and retention fixes. Strict production smoke passes readiness, static/secret boundaries, headers, rate identity and graceful/deadline shutdown. Actual HTTP integration passes multi-provider NVDA/AAPL/TSLA quotes, normalization, handoffs, exact pools/history, screener observations, venue retrieval and invalid requests. Browser checks exercise search, terms selection and its buy handoff, invalid budget recovery, presets, keyboard navigation, shared watchlists and file round-trip, Markets search/filters/export, overview/stock comparison, reload/Back persistence and mobile containment. The mechanical design scan has no findings. The independent review's refresh-retention issue was reproduced and fixed.

Release evidence, live-source timestamps, deployment checks and screenshots are retained in ignored test-results/stability-* files. Provider outages, unsupported routes and unverified conversions remain explicit; testing cannot guarantee future provider availability or complete market coverage.

## Home price coverage and Markets spacing — 0.8.3, October 21, 2026

Home now receives the complete market-details observation: a current exact-contract pool price leads, followed by a verified $1,000 indicative buy price when no comparable pool observation is available. The basis is labeled directly beside the price. A share-normalized onchain price remains visible if the listed feed is absent; its premium still requires a comparable listed observation. Retained observations carry their original dates and an Older observation label. Buy premiums include the exact listed price used in their calculation.

Pool sources and conversions no longer wait behind an unrelated chain before starting. Source batches rotate across chains, conversions are bounded, and original-clock normalized observations can survive a batch change for at most five minutes. Fresh pools precede retained alternatives. Representative buy-price candidates run independently across issuer/network combinations; missing routes no longer become successful two-minute cached nulls. SOXL's exact observed Nasdaq ETF name now corroborates its catalog short name; direction, leverage, sponsor and symbol mismatches still fail. Native Ondo stock/ETF labels reach oracle-backed conversion checks, and single-stock Home lookups join the existing native-version lookup before declaring no supported price. All five quote networks are eligible.

Nine reviewed exact-contract bindings consolidate previously separate native and issuer rows: SOXL, PALL, PPLT, ASML, IEMG, DELL, DFDV, XLE and VCX. Existing native URLs resolve to the issuer ISIN, primary issuer observations retain their clocks, and specific Stock/ETF classifications survive repeated normalization. Unproved identity pairs remain distinct. A real 1,977-row catalog test becomes 1,968 rows through deduplication; wrong contract, native ID, issuer, chain, symbol and ticker cases fail closed.

Markets' empty strip was caused by Tokenized cap absorbing unspecified fixed-table width. Every metric now has an explicit width. The new 24h turnover column divides source-reported volume by tokenized cap from the same observation; unknown/zero cap remains unavailable. Column choice, sorting and CSV export include the metric. Large ratios retain their actual values rather than being capped.

Verification: all 287 Node tests pass. Strict production smoke and real catalog/pools/history/three-stock quote integration pass. Seven-stock Home integration passes with actual listed and normalized prices/premiums; the first SOXL time-alignment check failed honestly, then an unchanged retry passed after fresh source observations arrived. Nine captured Nasdaq responses validate the consolidated names and asset classes; a real 1,977-row cache/HTTP test consolidates to 1,968 while preserving old URLs and primary source clocks.

Regression and real-source evidence is stored in ignored test-results/home-* files. The new integration:home command exercises actual listed and normalized onchain observations for NVDA, MSFT, SOXL, AAPL, SPY, CRCL and TSLA with the production Home renderer. Actual browser checks cover the Microsoft buy-price fallback, turnover values, widths, column picker, sorting, CSV and mobile table containment. Final deployment evidence records the exact commit and test outcomes. Missing verified conversions or source prices are never replaced with assumed one-token/one-share values.

## Venue handoff correction — 0.8.2, October 21, 2026

Actual third-party browser testing caught a KyberSwap legacy-link redirect: an Ethereum query-string handoff opened BNB Chain and lost its valid input token. Handoffs now use KyberSwap's canonical chain/token-pair path. Velora's legacy hash route also discarded the requested network/pair; it now uses the native /app/swap/pair route with its network slug. Jupiter's legacy pair path silently selected SOL; it now uses the native buy/sell mint query. Actual venue UI checks confirm Ethereum USDC/NVDAX, then BNB USDC/NVDAX despite the previously selected Ethereum network, Velora BSC USDC/NVDAon, and Jupiter/Raydium Solana USDC/NVDAx. No wallet was connected and no transaction was submitted. The handoff reminds users to enter their compared budget and review the venue's refreshed quote. Added cross-network URL regressions and corrected the live integration's assertions to use the observed canonical format.

A real-HTTP Jupiter pacing test exposed a timing assumption: waiting for the first response could consume the rate-spacing window. It now submits the deadline-limited second job before awaiting the first HTTP result, so transport timing cannot determine the expected rejection. Runtime deadline behavior is unchanged.

Verification: all 248 Node tests pass. Strict production subprocess smoke passes with real catalog readiness, static/security boundaries, rate limits and graceful shutdown. Actual HTTP catalog, pools/history and normalized NVDA/AAPL/TSLA quotes pass with provider-specific handoff identities across supported networks. Anonymous client-module access passes. The final source and deployment evidence is retained under ignored test-results/polish-* files.

## Comparison-first opening — 0.8.1, October 21, 2026

Final public browser inspection found that the generic Home introduction still pushed desktop product rows below the first view. Removed that introduction, made the selected company the page heading and moved catalog coverage into the asset finder. The comparison now leads directly. All 245 tests and strict production readiness/static/security smoke pass after this adjustment. Comparison persistence also degrades safely to in-memory state when a browser denies storage access. Runtime data/quote logic is unchanged from the publicly verified 0.8.0 release. Final browser and anonymous deployment evidence is saved under ignored test-results/polish-final-* files.

## Comparison polish — 0.8.0, October 21, 2026

Home now leads with two tasks: Compare versions and Compare buy quotes. Supporting terms, pool liquidity, venues, source details and history follow the comparison. The premium displays its exact normalized pool price beside the listed reference; the independently dated CoinGecko aggregate is separate. Non-actionable source diagnostics moved into coverage details; actionable price delays retain a plain explanation.

Stock baskets persist through profile navigation, Back/Forward, reload and explicit clearing. Quote coverage ages with the routes; expired handoffs disable and current provider/deployment counts drop. One global winner badge applies across grouped routes. Alternate providers and conversion-unverified token quotes remain inspectable. Network fees are explicit when unknown, large price deviations are flagged, and unsuccessful providers remain disclosed even when another succeeds.

Home and stock profiles share source-backed structured product terms. Wrapper rights are separately unreviewed unless explicitly supported. Legal claim, dividends, voting, primary access, redemption route and minimum carry linked evidence or an explicit review gap. Profile data refreshes while visible without overlapping requests, shares observations with Markets/Home, and preserves source clocks/stale flags. Markets offers persisted columns, optional supported-network/conversion filters, bounded additional checks and larger touch targets.

Local verification: 244 Node tests pass, including red/green retention and route-ranking regressions. Strict production subprocess smoke passes with real catalog readiness and all new static assets. Actual HTTP integration passes catalog/product prices, exact pool/history discovery, normalized NVDA/AAPL/TSLA routes and handoff identities. Independent listed prices, company cap, fiscal-year P/E, representative premiums, screener, venues, history and public market feed pass. A first screener integration received a stale-while-refresh response and failed honestly; the unchanged retry passed after the source refresh. No freshness assertions were weakened. Public-access validation walks the entire module graph without credentials.

Actual CUA browser verification covers mobile/desktop Home, structured terms and wrapper gaps, fresh quote groups from KyberSwap/Jupiter/Raydium/Velora, one winner badge, unknown fees, adverse premiums, natural quote expiry, invalid budget without a stuck busy state, Markets filters/columns, 40px touch targets, stock selection across Back/reload, explicit clear across Back/Forward, stock overviews and actual automatic refresh. Independent review found and resolved basket-clear, subset-winner and shared-cache invalidation/coherence issues; no P1/P2 findings remain. Evidence is in ignored test-results/polish-* files. Public Render rollout passed anonymous access through all client modules and real NVDA/AAPL/TSLA catalog, prices, normalized quotes, handoffs and listed/market metrics. GitHub CI passed Node 22/24 and the non-root production Docker image for commit 7e5dc2a.

## Comparison and stock-page release — 0.7.0, October 20, 2026

Home separates token versions, buy quotes and product terms. Quote rows distinguish the routing provider from actual liquidity sources; unsupported deployments remain inspectable with reasons. Jupiter quote-only orders and Velora join Raydium and KyberSwap. Provider deadlines and caches are isolated so a stalled source cannot hide completed results. Listed prices accept source-reported date-only closing observations without inventing trade times. A representative exact-contract pool premium is separate from the aggregate tokenized price and the $1,000 indicative buy premium.

Markets links to stock overviews with observed seven-day aggregate history, listed and tokenized prices, issuer terms, network contracts and on-demand venue observations. A separate comparison accepts two to five canonical stock IDs. Browser checks found and fixed a stale Home heading/results after visiting another stock, lost keyboard focus after selecting stocks, and lost issuer/token filters on Back navigation.

Local Node 22 verification: **221 tests pass**. Strict production subprocess smoke passes with real catalog readiness HTTP 200, all new static modules, security boundaries, rate limits and graceful shutdown. Actual HTTP integrations pass for NVDA/AAPL/TSLA: 1,975 catalog assets; NVIDIA 13 mapped products including wrappers, 12 product prices, 16 exact-contract pools and 24 hourly history observations; multiple real quote providers, normalized rankings and exact-asset handoffs; independently sourced listed prices, company cap, fiscal-year P/E and pool premiums. Public-access checks traverse all 15 client modules without authentication. The market feed check passes with 248 priced rows. A local exchange-ticker integration encountered a source-dated stale fallback; that run is recorded as a source availability failure, not a fresh-data pass.

Actual CUA browser checks cover product terms selection, genuine Jupiter/Raydium Solana and KyberSwap/Velora BNB quotes, PancakeSwap liquidity attribution, quote expiry, stock selection through five assets, a disabled sixth selection, issuer contracts and observed venues, overview-to-Home actions, URL filters and history navigation. At a 375px viewport, Home, the stock overview and multi-stock comparison remain within the page width. Wide tables scroll within their labeled regions. The UI detector reports no findings.

Public rollout of `db46c98` to the existing Render service is live as version 0.7.0. [GitHub CI](https://github.com/0xDimi/stocklens/actions/runs/39393610874) passes Node 22, Node 24 and the production Docker image. All five public HTTP integrations pass: multi-provider quotes/history, listed metrics and spot premiums, screener/venue observations, public feed delivery, and anonymous client-module access. The first concurrent cold-start pool-premium check timed out; a later real-source check passed for all three assets. No fabricated fallback was used. Public browser checks show completed listed/aggregate prices, spot premiums and fiscal P/E in the NVIDIA/Apple comparison, genuine Jupiter/Raydium quotes, working stock-page actions and the correct company on Home after navigation. No browser errors were logged.

Evidence remains local under ignored `test-results/comparison-release-*` and stock-page screenshots. Source availability and conversion coverage vary: unsupported networks, undocumented issuer conversions and empty liquidity routes remain explicitly unavailable or unranked. No extra paid service, credential, scheduled task, wallet or transaction submission is added.

## Portfolio audit — 0.6.0, October 19, 2026

The audit and final public rollout evidence are recorded in [PORTFOLIO_REVIEW.md](PORTFOLIO_REVIEW.md). This release adds source-age enforcement, upstream stream cleanup, an authenticated onchain fallback, HTTP 200 payload validation, and keyboard/refresh fixes. Local Node 22 verification passes all 181 tests and the strict production subprocess smoke with actual readiness HTTP 200. The public rollout passed all five actual-source/access integration scripts on version 0.6.0. GitHub CI passed Node 22/24 and the production Docker image. The full evidence and explicit coverage limits are in the audit report.

## Market refresh status and public feed recovery — 0.5.1, October 19, 2026

The production screener returned dated observations plus a confirmed CoinGecko rate-limit status. The client also incorrectly described every stale-while-revalidate response as a failed refresh. Those states are now distinct. Source cooldowns avoid scheduling redundant background work while the feed is already rate limited.

When server market observations are stale, the browser can read the official CORS-enabled public RWA endpoint. Both paths use the same strict ID-based normalizer. Public requests omit credentials and referrers, use 12.5-second pacing, coalesce, respect 429 cooldowns across pages and retain a ten-minute bounded browser observation cache without rewriting source timestamps. Newer browser observations cannot be replaced by an older server recovery. Failure leaves dated server data available. Public rate limits can still affect both paths; no uninterrupted free-feed guarantee is made.

All 146 Node 22 tests pass. The strict production smoke passed with actual catalog readiness. A real public-service integration passed 248 priced rows and source-dated NVIDIA market observations; the server feed recovered during that run. Actual browser checks loaded fresh public market observations and exercised the rate-limit fallback across pagination. The direct API returned `Access-Control-Allow-Origin: *` for the application origin. Evidence is in ignored `test-results/market-feed-tests.log`, `market-feed-smoke.log`, `market-feed-integration.json`, and `cg-cors-headers.txt`. Final public rollout evidence is captured separately after deployment.

## Data reliability repair — 0.5.0, October 19, 2026

The repair release passes 137 Node 22 tests and the strict production startup smoke with real catalog readiness. Actual HTTP repair integration passes company capitalization, provider-disclosed fiscal P/E, and independently obtained $1,000 indicative buy premiums for NVIDIA, Apple and Tesla. ETF applicability and saved CoinGecko asset links are checked. The broad real-source integration also passes issuer prices, exact-contract pools/history, normalized quotes and venue handoff identities. These checks use actual HTTP/source data, never fixture substitution.

Cold catalog readiness serves a dated checksummed seed immediately and refreshes in the background. The seed contains 1,961 unique assets and 3,153 versions; SPY and QQQ duplicates were removed after exact issuer/RWA corroboration. The 200 uncorroborated issuer records remain held back. Captured public CoinGecko and Nasdaq observations retain their original source times. Failures retain valid observations; provider error bodies cannot overwrite them. Product-price fallback observations are explicitly labeled as indicative buys rather than last-traded prices.

Actual browser validation confirms automatic Markets company/P/E/premium loading without a buy session and 998 source-observed market rows loaded through automatic pagination. P/E periods and missing-data reasons remain inspectable. The static module graph uses one content revision to prevent mixed browser-cache releases. Evidence: `test-results/fixes-tests.log`, `fixes-production-smoke.log`, `fixes-live-integration.log`, `local-repairs-integration.log`, and `repairs-integration.json`. The actual public Render repair integration passed the same source-backed cap/P/E/premium and canonical-link assertions. GitHub CI passed on Node 22 and 24 and built and ran the actual production Docker image. Final rollout checks are recorded under `test-results/public-repairs-integration.log`.

SPCX’s SEC-disclosed SpaceX/corporate-name identity and MSTR’s documented legal name change are corroborated without weakening symbol or company checks. Premium cells retain venue-reported price impact and flag observations at 5% or above; the observed SKHY quote reported 70.53% impact, explaining why its $1,000 buy cost differs materially from the listed price. After-hours comparisons explicitly identify the official last-close basis.

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

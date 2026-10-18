# Live comparison progress
Plan: docs/superpowers/plans/2026-10-18-live-comparison.md

- Baseline saved in local git repository on work/live-comparison.
- Public xStocks catalog, Raydium quote, and KyberSwap quote endpoints responded successfully in feasibility probes.
- Research is excluded from source control and is not a production data fallback.
- Ruling: retain external purchase handoff as the execution boundary established in prior design; fully functional refers to live comparison within that boundary.
- Ruling: no planning approval loop; user explicitly instructed direct implementation.
- Pre-flight: catalog supplies verified deployments and conversion units; quote API supplies normalized live observations; UI only displays API state. All interfaces use explicit source/time/cost-basis fields.

## Delivered
- Public-source-only implementation; no authenticated Ondo API dependency.
- Canonical catalog → issuer products → deployments → live quote adapters → normalized exposure → browser rendering.
- Metadata conflicts are quarantined; canonical-source outages fail closed.
- Same nominal destination-chain USDC input; network/funding/exit costs remain separate. BNB asset is Binance-Peg USDC.
- Missing conversions remain unranked. Freshness begins before the provider request; quotes expire at 30 seconds.
- Saved favorites, URL state, async cancellation, source disclosures, external venue pairs, responsive UI.
- Runtime remains Node standard library and browser ES modules; no runtime packages.

## Validation
- 20 unit/API tests pass, including red→green regressions for identity outage, unknown impact, and Kyber BNB handoff.
- Actual live integration: NVDA 6/5/4, AAPL 6/5/4, TSLA 6/5/5 deployments/quotes/normalized; 1,163 catalog assets. Final run 14.6s.
- Real browser: search, input/chain changes, latest-request protection, persistence, expiry/refresh, disclosures, share, Escape, 390px/320px layouts, empty warning/error log.
- Kyber BNB pair independently observed on the venue. Raydium verification stops at its terms gate; no agreement accepted.
- Whole-change review completed and its material identity-outage finding fixed and independently verified.
- Impeccable detector empty; diff whitespace check clean. Full details in QA.md.

## Remaining boundaries
Public deployment, transaction execution, more issuers/venues, exchange reference prices, eligibility screening, and exhaustive coverage are outside this delivered comparison MVP. No fabricated substitute fills gaps.

## October 19: complete comparison expansion
- Plan: docs/superpowers/plans/2026-10-19-full-comparison.md; base f6a93b8.
- User instructed autonomous completion and specifically requested CoinGecko/GeckoTerminal.
- Source probes: public coins/list, tokenized-stock markets, RWA list and GT exact-token pools returned actual data. Native RWA detail returned 429; source must cool down and show fallback provenance.
- Decision: use recognized CoinGecko families with corroborating underlying names/IDs and symbols for discovery when native grouping is unavailable. Preserve issuer mappings and do not promote market discovery to legal verification.
- Decision: use the existing local checkout and visual world; user is actively viewing this URL. No separate checkout or design approval loop needed.

### Expansion completion evidence
- Source services: live discovery, exact issuer-contract market IDs, paced/cached CG/GT clients, local public metadata snapshots, source-wide 429 cooldown.
- Live final source run: 1,514 assets / 12 product families / 18 configured chains; NVIDIA12 products,35 deployments,11 aggregate prices,16 search pools,24 history observations. Quotes NVDA35/12/5, AAPL33/11/5, TSLA34/8/5 deployments/quoted/normalized.
- Four browser views, issuer/chain/type sorting/filtering, chart1D/7D, exact-token pools, watchlists/shareable state, actual CSV download, native mapping refresh, visible source warnings and mobile layouts.
- Independent review: all four findings fixed through failing regression → green test. Best badge independent of sorting; enriched catalog retained; chart elapsed-time cutoffs; source-level rate cooldown. Suite39/39, including wrapper-specific conversion guards found in the real native grouping check.
- Decisions retained: local app and branch, external purchase handoff, no trade/custody, conservative source-backed normalization, no invented issuer rights, public sources with optional local key. Native RWA detail recovered after initial limits; final integration grouped ten NVIDIA products natively and excluded wrapped products. Ordinary catalog mapping remains available with explicit provenance.

- Final live run 2026-10-18T21:26:07.158Z (Oct 19 Athens),24.526s: all source integrations pass; nativeGrouped10. No financial transactions submitted.
- Mechanical UI detector returned []; documentation and source count audited (18 chains). Keep the existing local branch/checkout and running server; no public publish or merge requested.

- Visual/UX finish review: accepted workspace retained; material screen-reader quote naming and mobile gas-disclosure gaps fixed through regression and actual browser verification. No deferred material findings. Final checks:39 tests green; real integration passed; detector empty; whitespace/syntax checks clean.
- Final browser pass: actual expired quote lost href and visible winner; refresh recovered;39-test release, public source integration, accessible labels/mobile gas and exported CSV verified. Final console empty. Server healthy v0.3.0 at127.0.0.1:4173.

## Terminal release — base50cf799
User explicitly requested a terminal and deployment readiness; replacing prior visual direction is authorized. Implement directly, preserve data boundaries and local checkout, prepare deployment without public publishing. Spec/plan:2026-10-19-terminal-release.md. Verified probes: public RWA markets250 observations and NVIDIAx venue47 tickers returned real data. Docker/Podman are absent locally; verify production Node artifact with real subprocess smoke tests and provide container configuration without claiming a local image build.


## Terminal 0.4.0 completion — October 19, 2026

Rebuilt the comparison desk as a linked charcoal terminal: sortable RWA universe/tape, persistent responsive OHLC/volume chart, five table views, live venue observations, keyboard command search, shortlist matrix and portable local watchlists. Real source integrations and browser flows passed. Independent code review findings (token-scoped history, exchange CSV fields, provider failures/stale state, loaded-page refresh) were fixed. Final visual reviewer confirmed the terminal direction and requested larger chart text; data is now ≥11px and source explanation 12px, wrapping on phones. Detector ran once with no findings.

Node22.23.3 tests and strict production subprocess smoke passed. Non-root Docker/Compose, Render manifest, CI and DEPLOY.md supplied. No public deployment. Docker/Compose and remote CI were not run locally; local Node22 validation is the execution evidence. Full dated measurements and limits: QA.md.


## Comparison-first interface — October 19, 2026

User preferred the earlier intuitive comparison workspace over the terminal. Restored the daylight/teal two-column layout, normal page scrolling and readable product rows. Price/token, volume, issuer structure and networks are visible before expansion. Buy comparison leads with the fresh verified share-exposure winner and the cost boundary. Removed tape, right inspector, counters and persistent chart from the main flow. Chart and source details load/open on demand. Backend sources, venue comparison, saved lists, imports/exports and deployment support remain intact.

Added summary expiry/unverified exclusion and visible-structure regressions, observed red then green. Independent code review found no material regressions; real browser checks and source integration recorded in QA.md.

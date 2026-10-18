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

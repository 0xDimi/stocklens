# Catalog expansion implementation plan

> Execution: superpowers:executing-plans, inline implementation with a final independent review.

**Goal:** Expand verified stock/ETF discovery using CoinGecko issuer and native mappings plus the Reality public catalog, and find exact-contract pools without presenting observations as executable quotes.
**Architecture:** Keep the dependency-free Node ES modules, existing canonical catalog and dated disk/seed snapshots. Add a small Reality parser/merger and a bounded background CoinGecko discovery enrichment module. Extend the existing GeckoTerminal contract search rather than introduce another price system.
**Tech stack:** Node >=22, built-in fetch, node:test, existing Render service.
**Spec:** The user approved the three-part update in the annotated response: expanded CoinGecko discovery, public issuer gap filling, and verified-contract GeckoTerminal enrichment. Existing legal/conversion/quote safeguards remain required.

## Constraints and choices

- No paid services, API upgrades, new credentials, or hosting plan changes.
- Existing pages and theme remain unchanged. Newly discovered assets use the existing comparison flow.
- Stocks and ETFs only; ignore bonds and commodities. A ticker match alone never proves an underlying identity.
- Reality records require an active status, valid ISIN checksum, supported chain and valid token contract. Missing/conflicting identities are held separately; exact existing contract evidence may corroborate an otherwise incomplete record.
- Original observation dates survive refresh failures and restarts; expired/future-dated observations cannot renew themselves.
- Background CoinGecko enrichment has one worker, daily persisted request accounting, a maximum of 64 additional catalog requests per UTC day, at most 24 native asset lookups per day and 64 issuer IDs per scan. Requests are sequential and stop on source failures. It never blocks normal catalog readiness or increases limits on paid plans.
- Issuer/native catalogs are independently cached for 24 hours and eligible for at most 72 hours. Existing CoinGecko discovery continues when enrichment is unavailable. Native mapping prioritizes assets without mapped products.
- Catalog completeness, token market observations, and executable order quotes remain distinct.

## Review focus

- Same ticker with different ISINs or conflicting contract ownership must not merge.
- Missing ISINs, inactive assets, malformed addresses, unsupported networks and same-chain conflicting records must not enter verified comparison.
- One failed issuer refresh must preserve other successful catalogs with their own dates, never replace them with a partial/undated success.
- Restart/concurrent requests must not restart an unbounded discovery scan or duplicate daily work.
- Exact token pool discovery must reject a same-ticker impostor and retain base/quote orientation; observations must not enter quote ranking.

## Task 1: Reality catalog and safe canonical merge

Files: create `server/issuer-catalog.mjs`, `tests/issuer-catalog.test.mjs`; modify `server/catalog.mjs`, `scripts/refresh-catalog-seed.mjs`; update source documentation.

- [x] Write and run failing tests for active stock/ETF admission, ISIN checksum, category correction, missing/conflicting identifiers, exact-contract deduplication, immutable input and retained source dates.
- [x] Implement `parseRealityCatalog(data, at) -> {stocks, pendingProducts, counts}` and `mergeIssuerCatalog(stocks, incoming) -> {stocks, pendingProducts}` with index-based identity joins.
- [x] Add Reality as an independently observed source in `createCatalogLoader`; preserve injectability and existing loader tests without unrequested network calls.
- [x] Test a restart/source failure and Reality-only catalog availability.
- [x] Run focused tests and the entire suite; commit the working task.

## Task 2: CoinGecko issuer and native background discovery

Files: create `server/rwa-discovery.mjs`, `tests/rwa-discovery.test.mjs`; modify `server/coingecko.mjs`, seed capture tooling.

- [x] Write and run failing tests for issuer endpoint validation, native association without naming patterns, exact-contract market ID attachment, request budget persistence, nonblocking reads, failure isolation and time expiry.
- [x] Normalize documented issuer IDs centrally, validate `/rwas/issuers/list` and `/rwas/issuers/{id}`, and attach exact-contract IDs without relying on token marketing names.
- [x] Implement `createRwaDiscovery({read, cacheDir, now, ...})` exposing nonblocking `augment(discovery)` and awaitable `refresh(discovery)`; preserve source dates and bounded per-day work across restart.
- [x] Read stored native mappings in the catalog background; preserve foreground native enrichment. Publish observed enrichment coverage/progress in source metadata.
- [x] Capture actual issuer observations and native mappings; run focused tests and the entire suite; commit the working task.

## Task 3: Exact-contract pool coverage, live audit and release

Files: modify `server/gecko.mjs`, existing pool tests; create `scripts/catalog-expansion-integration.mjs`; refresh shipping source seeds, version and evidence documentation.

- [x] Write and run failing tests for bounded exact-contract lookup when the first search page misses verified products; include both pool orientations and lookalike rejection.
- [x] Add sequential, cached exact-contract lookups only for a bounded number of missing products; retain request deadlines and existing explicit-token endpoint behavior.
- [x] Run real public-source integration: compare before/after canonical identities and duplicates, new stock/ETF examples, native mapping, pool observations, conversion/quote separation, and anonymous route access.
- [x] Run full tests and production subprocess smoke. Obtain independent code review; fix material findings with failing regression tests.
- [ ] Push the approved release and verify Render version, anonymous Home/Compare/Markets and new-asset comparisons.

## Validation ledger

- Baseline: 392/392 tests pass.
- Reality and native/issuer discovery, source retention, pool enrichment:live public source integration returned 3,553 canonical assets, 5,393 products, 2,936 Reality products, 20 NVIDIA pools and 3 real Coinbase/Base quotes.
- Independent reviewer found three Important defects; all reproduced RED then fixed: cross-security registry ownership, independent evidence expiry, and stale-while-revalidate scan starvation. Added per-resource 404 isolation so one missing catalog cannot block the remaining scan.
- Full regression suite after review fixes: 417/417 passing. Production subprocess smoke and anonymous local access pass.
- Seed tooling rebuilt from real dated public observations; no source times were advanced. Deployment verification remains below.


- Authenticated deployments discard only an unauthenticated seed's source cooldown; the daily request allowance survives the access-mode change. Regression test verified RED then GREEN.

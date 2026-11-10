# Comparison coverage repair implementation plan

**Goal:** Remove avoidable missing conversions, quotes, premiums and fees from the existing Stocklens comparison flow.
**Architecture:** Keep the Node ES-module app. Extend independently validated issuer conversion and quote adapters; preserve source identity, units, clocks and strict ranking. Never fill gaps with assumed prices or ratios.
**Spec:** Existing DESIGN.md plus the user's authorization to fix coverage using the best available implementation.
**Constraints:** Public sources and existing access only. No paid services, new credentials, custody or transactions. Preserve the existing pages and deployment. Validate real integrations and browser flows before publishing.

## Review focus
- Same ticker on a different contract must never inherit a conversion.
- Dynamic multipliers and wrappers require actual current unit semantics.
- A quote timeout or failed feed must not erase independent successful results.
- A spot observation cannot become a size-specific quote or wallet-specific gas total.
- Unsupported private venues must remain explicitly identified instead of receiving fabricated quotes.

## Tasks
1. [x] Extend exact-contract issuer conversions in server/issuer-conversions.mjs; integrate into providers.mjs. Test missing/wrong/stale contracts and real public multipliers.
2. [x] Extend verified network/provider capabilities in config.mjs and public-quote-providers.mjs. Test native units, network identity, net output and correct venue handoffs against real responses.
3. [x] Repair listed-reference identity/classification coverage in fundamentals.mjs. Test ETFs, ambiguous names, source time and missing values against real feeds.
4. [x] Preserve disclosed fee components, classify route/conversion failures precisely, and ensure quote scheduling gives independent networks a fair opportunity. Add failing regressions before changes.
5. [ ] Run full tests, strict production smoke, measured before/after actual-source coverage and desktop/mobile browser checks. Obtain independent review, fix findings, deploy and verify anonymous public access.

## Progress
- Baseline: version0.8.5,334 tests; NVIDIA recorded22 quote responses/eight normalized in prior audit. Current production snapshot saved under ignored test-results/coverage-baseline-*.
- Implementation is delegated across issuer conversions, network adapters and listed references with disjoint file ownership; root owns integration, fees, result presentation and release.

- Independent review: scheduled conversion clock boundary fixed with failing regressions; quote expiry capped at pending activation; follow-up source requests stop at the caller deadline. Browser module graph regression added after real startup failure.

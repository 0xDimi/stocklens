# Progressive market data repair

The reported failures are loading/data-flow defects, not grounds to substitute guessed prices. Public baseline checks on October 28 show valid Nasdaq prices for SPCX, NVDA, SOXL, SNDK, MU and TSLA. Existing market-details requests wait for optional company data and buy routes, page requests fan those operations out, and the client chooses the newest whole cache entry even when another view holds valid field-level data.

## Changes

1. Extract the existing pure reference/spot/premium composition without altering conversion, identity, clock or quote rules.
2. Add an info-only listed-price reader and safe retained-price access, avoiding optional summary/P-E work on the critical price path.
3. Add a shared, bounded server snapshot service. Return dated cached observations immediately; run coalesced listed-price, batched pool and optional company/quote jobs independently. Preserve original source times and prior valid observations. Expose per-component loading/failure states through a polling endpoint; no empty success/one-minute failure blackout.
4. Add one shared client transport that coalesces active selections into at most25 IDs per request and publishes partial rows. Markets requests one page, Compare one selected asset, stock overviews their visible assets. Abort polling on navigation; keep completed observations usable between views.
5. Replace whole-row cache selection with field-aware merging. Remove misleading Not supplied labels from loading/failure cases; preserve clear explanations for genuinely unsupported data. Keep successful prices visible while optional fields update.
6. Regressions cover blocked optional sources, interleaved requests, cache retention and cross-view merges, cancellation, source time/contract checks, retry and missing data. Validate with real Nasdaq/pool sources, complete HTTP integrations and browser flows for the reported assets. Publish only after independent review and public verification.

No new paid provider, plan, service, wallet or fabricated price. Maintain the current visual layout. Current full API remains compatible; the progressive endpoint is opt-in for the application. Target immediate cached first paint and independent fresh price updates, rather than a single all-sources barrier.

## Implementation refinement

Use one NDJSON response per visible selection instead of polling. This gives incremental updates without consuming the per-IP API budget through repeated polls. Server streams share ongoing per-asset work and replay dated observations from a bounded cache. Markets uses one 25-asset request; optional company reads start only after all listed-price reads have completed. Pool omissions trigger one preferred buy route, with a separate size-specific label. Existing full JSON API remains compatible. No new packages or services.

## Validation and review

Independent review caught three lifecycle/retention defects before release: partial snapshots were not replayed to late subscribers, a forced company-column upgrade could be dropped while a price request was active, and a completed company failure could retain an old value as current. Added failing regressions and repaired all three. Real HTTP integration checks all eight reported listed prices, independently sourced normalized observations where available, genuine Nasdaq company metrics, and original source dates during cache replay. Remaining route gaps are reported as unavailable rather than synthesized from aggregate token prices.

Public rollout verification found valid metadata-plus-route requests taking 14.6 seconds against a 10-second fallback limit. The follow-up patch permits 18 seconds within the unchanged 26-second shared deadline and two-worker bound. Native EVM xStocks pool normalization now avoids a redundant decimals RPC using the issuer's documented adjusted-balance units; order quotes, Solana and unrelated issuers retain their existing verification. Official multiplier documentation rechecked on 28 October. Cold local integration: all eight listed prices arrived within 1.9 seconds; eight normalized prices and company metrics passed. The follow-up received independent review and the complete 457-test suite passed.

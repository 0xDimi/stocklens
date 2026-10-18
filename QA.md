# Verification — October 18, 2026

## Real integration

Ran `npm test` and `npm run integration` against the current local server at port 4173. Integration uses actual issuer, RPC, and quote responses, without fixtures or replacement prices. Final run completed in 14.6 seconds.

| Stock | Issuer deployments | Live quotes | Normalized quotes |
| --- | ---: | ---: | ---: |
| NVIDIA | 6 | 5 | 4 |
| Apple | 6 | 5 | 4 |
| Tesla | 6 | 5 | 5 |

Catalog: 1,163 assets; 206 Ondo records withheld because identity mappings were unconfirmed or inconsistent. These counts are observations from this run, not guaranteed future coverage. Catalog size does not establish liquidity.

Checks assert positive real token output, correct security identity, exact contract in explorer and handoff URLs, input/exposure arithmetic, freshness fields, ascending normalized ranking, and HTTP input validation. Raw report: `test-results/live-integration.json` (local, ignored by Git).

Public Ondo Ethereum conversion data was unavailable for NVIDIA and Apple. Those quotes correctly show token quantities without a cross-product rank. Raydium returned no supported route for the three tested Ondo Solana deployments. Missing data remains visible; no price or multiplier is invented.

## Actual browser checks

Verified the served app in the Codex in-app browser:

- Live catalog search by company and token symbol; correct canonical names for NVIDIA, Apple, Tesla, Coinbase, and AMD.
- Budget validation removes numerical results. Valid input recovers. Decimal input 100.25 and Solana filtering update the comparison URL and output.
- Rapid NVIDIA → Tesla and 500 → 2,000 changes finish on Tesla / 2,000 / Solana with only Tesla Solana rows.
- Favorites survive reload; saved-only filtering works. Test favorite removed afterward.
- Product disclosures show legal links, exact contract, live multiplier, quote source, timestamp, and cost exclusions.
- Quotes expire after 30 seconds: winner badge disappears, stale styling appears, and purchase links lose href and display a refresh instruction. Refresh returns current results.
- KyberSwap BNB handoff actually loads USDC → AAPLon on **BNB Chain**. Browser testing exposed the API/web chain-slug difference; corrected and regression-tested.
- Raydium handoff reaches the exact token-pair URL but its terms gate blocks further verification. No terms accepted, wallet connected, or transaction submitted.
- Copy-link displays “Link copied.” Cost-basis dialog opens and closes with Escape.
- Live layout checked at 390px and 320px; document scroll width equals viewport content width. Expanded disclosures fit at 320px. Viewport override reset afterward.
- Final browser warning/error log: empty.

## Supplementary automated checks

20 unit/API tests pass. They cover decimal precision, strict amounts, raw versus adjusted units, missing multipliers, scheduled multiplier activation, paused tokens/oracles, stale ranking, quoted CSV parsing, identity conflicts/quarantine, canonical-source outage, malformed provider responses, missing price impact, correct venue chain URLs, HTTP validation, upstream errors, static allowlist, and security headers.

Independent code review found a canonical-source outage that could bypass identity quarantine. Fixed, regression-tested, and independently rechecked. The earlier unit-field mismatch found by actual integration was also corrected. Impeccable detector returned no findings. `git diff --check` passed.

## Boundaries

No trade execution was tested or implemented. No exhaustive venue search, underlying exchange-price comparison, user eligibility assessment, or legal risk ranking is claimed. Comparison excludes network/funding/exit costs and relies on public upstream availability. These checks establish the local comparison MVP, not readiness for unrestricted public financial distribution.

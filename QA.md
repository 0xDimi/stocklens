# Verification — October 19, 2026 (Europe/Athens)

## Real integration

`npm run integration` ran against the current local server at port 4173. It fetched actual issuer, CoinGecko, GeckoTerminal, RPC and quote responses without fixture substitutions. Final source run timestamp: 2026-10-18T21:26:07.158Z / October 19 in Athens.

Observed catalog: **1,514 assets**, 12 recognized product families, 18 configured directory chains. NVIDIA: 12 products, 35 deployments, 11 CoinGecko prices, 16 exact-contract search pools, 24 hourly price observations in the selected one-day pool window. Counts describe this run and can change; they do not establish liquidity for every catalog asset.

| Stock | Deployments | Actual order quotes | Normalized quotes |
| --- | ---: | ---: | ---: |
| NVIDIA | 35 | 12 | 5 |
| Apple | 33 | 11 | 5 |
| Tesla | 34 | 8 | 5 |

Integration assertions check broad provider discovery, real market prices, exact catalog-contract membership of pools, positive chronological history observations, actual quote output, normalized arithmetic, ascending rankings, exact external pair addresses, BNB website chain slug and HTTP input validation. Raw report: `test-results/live-integration.json`; log: `test-results/full-integration.log`, both ignored by Git.

Public native RWA detail initially returned HTTP 429, then recovered. The final real integration refreshed native grouping for ten NVIDIA products; wrapped products remained excluded. Normal discovery also retains conservative catalog mapping and exact issuer-contract joins so the app can work when optional native grouping is limited. Success/persistence, wrapper exclusion and malformed responses are regression-tested.

## Actual browser

The running app was exercised in the Codex in-app browser:

- Products: NVIDIA and Meta show broader issuer products; live prices, token market caps/volumes, timestamps and older-observation labels appear. Exact bStocks filtering produces one row; expanding it reveals primary terms, contract and handoffs.
- Exact-token Markets link opens BNB bStocks pools. Twenty exact-token pools returned, with separate token/base orientation and liquidity/volume. A selected pool loaded 24 hourly observations for 1D and 168 for 7D. Stock-wide Meta markets also returned seven matching pools and a real Solana chart.
- Issuer terms tab shows the selected provider's sourced terms. Unreviewed issuers use explicit unreviewed notes.
- Order quotes: NVIDIA returns 35 deployment rows. Sorting by issuer keeps the true lowest effective-price row as winner; unavailable alphabetically-first issuers do not acquire its badge.
- Invalid amount 1 removes quote rows and disables CSV. A valid preset recovers results.
- Saved NVIDIA survives reload. Stock, amount, chain, view and issuer restore from URL. Saved-only filter shows one result; removing the test favorite produces the saved empty state. Test favorite removed afterward.
- Real CSV download inspected from Downloads: one filtered NVIDIA/xStocks/Solana quote, correct equivalent shares/status, source columns and legal fields. Copy-link reports success.
- ETF search returns S&P fund matches; unmatched search gives a useful empty state. Rapid Apple → Tesla → NVIDIA selection ends on NVIDIA without an older response replacing it.
- Desktop, 390px and 320px checked. Document scroll width equals viewport content width. Responsive market rows, controls, tabs and disclosures remain usable. Viewport override reset afterward.

External Raydium terms gate and correct Kyber BNB pair were verified in the previous release; those handoff paths are preserved. The new quote renderer retains expiry and refresh controls.

## Automated and independent review

**39 unit/API tests pass.** Coverage includes decimal precision, malformed budgets, unknown conversion units, paused tokens/oracles, CSV parsing, ambiguous identity and wrapped-token exclusions, same-contract joins, native grouping scope/persistence/wrapper exclusion, exact pool identity/orientation, elapsed history bounds, source-wide 429 cooldown, sorting-independent winner selection, HTML escaping, spreadsheet formula escaping, endpoint validation, private-file allowlist and security headers.

Independent whole-change code review found four material issues: winner depended on display order, enrichment was response-local, sparse history could exceed the chosen range, and cooldown was path-local. Each reproduced in a failing test and now passes after the corresponding fix; the complete suite passes. The reviewer also checked exact-contract market-ID attachment without a material finding.

## Limits

No financial transaction was submitted, terms accepted, or wallet connected. CoinGecko/GeckoTerminal prices are market observations, not underlying exchange reference prices or order fills. Quotes have five-chain adapter coverage; public APIs, missing conversions and source catalog quality limit availability. The tool reports gaps rather than inventing values or guaranteeing globally cheapest execution. Public distribution/hosting remains separate from this local application.

Final accessibility/UX review confirmed the existing visual system and phone layout. Its two material findings were fixed: quote summary names now include exposure, price, units and availability; expanded quote details repeat the swap-gas estimate on phones. Browser confirmation showed 4.7082 equivalent shares at 212.40 USDC per share and a separately labeled gas estimate on the tested Ethereum row (point-in-time values, not a recommendation). Quote expiry/refresh and final console checks completed separately below.

Final actual expiry check: an Ethereum quote changed to “Quotes stale · refresh,” its purchase href was removed, and the winner badge was hidden. Refresh restored a current quote and exact-token purchase link. Final browser warning/error log was empty. The viewport override was reset and the app was left on NVIDIA Products with all chains/issuers.

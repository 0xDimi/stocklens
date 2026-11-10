# Stocklens comparison polish

Approved scope: fix the reviewed state, price-basis and freshness defects; simplify Home into versions and buy quotes; improve mobile comparison, market controls and structured terms; remove prototype-style presentation. Preserve explicit source limits and existing deployment costs.

## Implementation boundaries
1. Home/app: persist a validated 2–5 stock basket in browser storage and URLs; preserve it through Back/forward, page navigation and reload. Use existing Maps as shared detail observations between views.
2. Price/quotes: display the actual share-normalized pool price used by the premium beside its listed reference. Keep the CoinGecko aggregate separate. Recalculate freshness counts and provider coverage on expiry, retain disabled expired handoffs, label unknown fees and adverse premiums explicitly. Best route per deployment precedes alternate providers.
3. Profiles: seed detail cache through optional getDetails(id), expose ingestDetails(id, data), refresh active visible pages without overlapping requests, preserve original source times. Accept getComparison() for chooser continuity.
4. Markets: source-backed readiness filters and configurable columns; getDetails/ingestDetails adapters; larger touch controls and scroll guidance.
5. Terms: productTerms(product) structured source-backed fields and renderProductTerms(product) disclosures. No guessed legal rights or minimums.

## Verification
Write focused failing regressions for basket restoration, quote expiry and comparable price basis before fixes. Run the complete Node test suite and production smoke. Exercise real APIs sequentially and actual desktop/mobile browser flows, including Back/reload, budget errors, issuer/network filters, alternate routes, terms selection and public access. Restart the local server after client edits because its asset revision is computed at startup. Run an independent code review, fix findings, push and verify the existing public Render deployment. Record honest evidence and remaining provider limits.

# Listed-reference coverage repair — 2026-10-23

The listed-price feed lives in `server/fundamentals.mjs`. There is no separate `reference-feed.mjs` in this checkout.

## Root causes and repairs

- A catalog category of `Listed security` always requested Nasdaq's `stocks` class. The production catalog includes ETFs with that generic category. The feed now tries the appropriate Nasdaq asset class at the exact catalog symbol and, for an unclassified asset with no returned identity, tries the other class. Returned symbol, name, asset class, and supplied exchange must corroborate the catalog. An explicit Stock/ETF classification is never overridden. Endpoint and returned asset class must agree.
- Exact observed ETF title variations failed corroboration: sponsor wrappers, ETF versus shares suffixes, older Nasdaq names, and catalog short names. The repair adds ticker-scoped, exact name pairs. It does not remove fund sponsor, direction, reset period, or leverage generally. The test fixtures retain the public source URL, retrieval time, identity, and original quote fields.
- Nasdaq also returns non-real-time, date-only observations while its overall market status says Pre-Market. The old parser rejected those even when the source disclosed a positive price and a valid date. They now retain the source date, day precision, and original retrieval time. They have no claimed closing-session or intraday trade time. The existing premium freshness and alignment checks continue to reject them as live comparisons. Date-only quotes marked real time are rejected outside a closed session.
- Catalog exchange names now corroborate Nasdaq exchange names, including Nasdaq market tiers and the observed ARCA/PSE naming pair. An explicitly foreign exchange cannot accidentally resolve to a same-symbol US listing. An explicitly reported source currency takes precedence over the dollar glyph.

## Integration evidence

All captures below are ignored local evidence in `test-results/coverage-listed/`; none replaces runtime source requests.

| Check | Before | After | Scope |
| --- | ---: | ---: | --- |
| Parsed listed prices from identical captured Nasdaq responses | 138 | 180 | 267 ETF or ETF-like catalog rows, 246 distinct symbols |
| Listed prices through real HTTP `/api/market-details` | 5 | 23 | Same 27 selected catalog IDs; deployed baseline versus updated local production process |
| Indicative buy premiums in that HTTP cohort | 0 | 6 | Existing share-conversion, source-time, and freshness rules retained |
| Pool spot premiums in that HTTP cohort | 0 | 0 | No substitute token or listed price was inserted |

The first comparison isolates code behavior by using the same actual source observations. The HTTP comparison includes changing market observations and different deployment/network conditions; it does not attribute every changed premium solely to the listed-reference repair.

The source sweep obtained 185 populated Nasdaq identity responses, three explicit empty responses, and 58 acquisition failures out of 246 ticker requests. See `etf-info.json` for each success, source-level empty response, or acquisition failure. Acquisition failures are not evidence that a ticker lacks data. The result is a measured cohort improvement, not a complete catalog coverage claim.

Real HTTP evidence files:

- `catalog-before.json`: production `/api/catalog` response (1,971 rows when captured).
- `production-details-before.json`: original deployed `/api/market-details` responses.
- `final-http-recheck.json`: final-code real HTTP recheck confirmed SOXS and IWM prices, preserved BRHY day precision, and continued to reject Air Liquide/Arteris identity collision.
- `local-details-after.json`: updated server running with `NODE_ENV=production`, its own cache directory, and actual upstream APIs. All 23 supplied reference prices had `priceStale:false` and original Nasdaq observation times.
- `etf-info.json`, `etf-classified-before.json`, `etf-classified-after.json`: source response sweep and identical-response comparison.
- `regression-red.tap`, `aliases-red.tap`, `assetclass-red.tap`: observed failing regressions before their respective fixes.
- `final-targeted.tap`: listed-reference, fundamentals, and premium regression results (33 passed at this checkpoint).

## Remaining public-data and identity limits

The selected HTTP cohort correctly continues to reject Aberdeen `ABDNL` and ABN AMRO `ABNA`, which have no corroborated response from this US Nasdaq feed. Air Liquide's catalog `AIP` must not use the US `AIP` quote for Arteris. The catalog row `cg:invesco-qqq-trust-series-1` supplies ticker `QQQI`, while Nasdaq identifies QQQI as NEOS Nasdaq 100 High Income ETF; it remains rejected. Neither guessing a local ticker nor changing a corporate name can establish those identities.

The wider source capture still contains fund name mismatches that require further primary identity evidence, including several short leveraged-fund labels and material fund name changes. These remain unavailable instead of accepting a different fund based on a familiar ticker. Non-US exchange coverage requires a separate corroborated listed-security source with explicit currency and observation times. No new paid service, API key, token-price proxy, or extended premium freshness window was added.

The official Nasdaq market-activity FAQ describes its regular, premarket, and after-hours windows and source caveats: https://www.nasdaq.com/market-activity . The public source response, not the request clock or an assumed 4 p.m. close, determines the stored quote time.

## Commands

```sh
node --test tests/listed-coverage.test.mjs tests/fundamentals.test.mjs tests/reference-premium-release.test.mjs
npm test
NODE_ENV=production HOST=127.0.0.1 PORT=8796 CACHE_DIR="$PWD/test-results/coverage-listed/live-cache" node server.mjs
```

The final full-suite checkpoint passed all 368 tests (`final-full-suite.tap`). The initial full-suite checkpoint was 359/361 passing. Its two failures were outside this change: `Coinbase raw token quantities use the live current share multiplier` and `quote accessibility names expose price, share exposure, units and status; disclosure repeats gas on mobile`. The owning agent was notified and repaired both failures. `full-suite.tap` records the initial checkpoint; `final-full-suite.tap` records the passing final checkpoint. Concurrent task changes after that checkpoint require fresh task-wide verification.

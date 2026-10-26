# Catalog expansion source audit

Observed 26 October 2026. Counts describe source-backed catalog records, not executable markets or investment eligibility.

## Inputs and joins

- CoinGecko Demo documentation exposes `/rwas/list`, `/rwas/issuers/list`, `/rwas/issuers/{id}` and `/rwas/{id}?tokens=true&tokenized_market_data=true`. The production implementation uses the existing server-only API key. Initial discovery still works when the background worker is unavailable.
- Reality's official public catalog is `https://api.realityfinance.xyz/api/v1/rwa/assets/tickers`. The observed envelope uses the string status code `"200"`. Of 3,334 rows, 3,318 were active equity/ETF records; 384 of these lacked an ISIN. Bonds and inactive records are outside the expansion scope.
- A valid ISIN checksum, an active stock/ETF record and an issuer-listed supported token contract are required for Reality admission. An ISIN or exact issuer/chain/contract can merge an existing identity. Tickers and names alone cannot. Conflicting identifiers remain held back.
- Exact-contract CoinGecko matches add market IDs without requiring token naming conventions. Native grouping can add versions from unfamiliar issuers without guessing the underlying from a token symbol.

## Captured result

The initial live-source snapshot at approximately 14:25 UTC contained 3,553 canonical asset records and 5,393 token products after the existing eligible native observations were reused. The previous public snapshot had 1,972 asset records. The count can move after a successful source refresh or an exact identity consolidation.

400 Reality records were held outside verified comparison after validation and merging, separately from 200 unresolved Ondo records. Do not add their claimed underlying names to the verified asset count. These quantities refer to records, not necessarily distinct missing securities.

The unauthenticated CoinGecko capture obtained the issuer list and two issuer catalogs, then returned HTTP 429. The worker stopped without replacing previous successes. One eligible previously captured native observation was reused with its original date. This capture does not establish full CoinGecko issuer ingestion; production authenticated integration is checked separately in release evidence.

## Request and price boundaries

Additional background discovery is capped at 64 attempted requests per UTC day, including at most 24 native underlying lookups. Accounting is written before network I/O and restored on restart. One worker coalesces concurrent scans; provider pacing and cooldowns remain in effect. These counters do not cap other existing market or quote requests and are not a provider-enforced billing cap.

Issuer/native discovery observations refresh after 24 hours and expire after 72 hours. Successful native observations already captured for foreground requests can populate discovery without another source request. Failure checks and process restarts never renew observation timestamps.

GeckoTerminal search results are supplemented by at most three exact-contract lookups per stock request under a shared deadline. Returned pool tokens must match a catalog chain and contract. Base/quote orientation is retained. Issuer-only product prices carry an explicit pool-observation basis, source and original timestamp; neither share ratios nor order-executable prices are inferred from them.

No DefiLlama subscription, new paid data source, persistent disk or hosting change is included.

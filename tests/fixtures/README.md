# Captured provider responses

These public CoinGecko responses are deterministic parser regression inputs, not current market observations.

- `coingecko-nvidia-rwa.json`: the NVIDIA record extracted unchanged from a captured `/api/v3/rwas/markets` response.
- `coingecko-nvidia-tickers.json`: a captured `/api/v3/coins/nvidia-xstock/tickers` response.

Provider timestamps remain in the payloads. Tests must load these committed files rather than the ignored development `research/` directory. Actual integration and deployment checks contact real services separately.

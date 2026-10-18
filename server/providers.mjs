import { request, memo, rpc } from "./http.mjs";
import { CHAINS, XSTOCKS_API, ONDO_SOURCE } from "./config.mjs";
import {
  activeMultiplier,
  toBaseUnits,
  normalizeQuote,
} from "../src/model.mjs";

const positiveInteger = (value) =>
  typeof value === "string" && /^\d+$/.test(value) && BigInt(value) > 0n;
export function parseRaydium(response, deployment, chain, amount) {
  const q = response.data;
  if (
    response.success !== true ||
    !q ||
    q.inputMint !== chain.usdc ||
    q.outputMint !== deployment.address ||
    q.inputAmount !== amount ||
    !positiveInteger(q.outputAmount)
  )
    throw new Error("No verified Raydium route is available for this amount.");
  return {
    inputAmount: q.inputAmount,
    outputAmount: q.outputAmount,
    minimumOutputAmount: q.otherAmountThreshold || null,
    priceImpactPct:
      q.priceImpactPct != null &&
      q.priceImpactPct !== "" &&
      Number.isFinite(Number(q.priceImpactPct))
        ? Number(q.priceImpactPct)
        : null,
    networkFeeUsd: null,
    markets: [...new Set((q.routePlan || []).map((r) => r.poolId))],
  };
}
export function parseKyber(response, deployment, chain, amount) {
  const q = response.data?.routeSummary;
  if (
    response.code !== 0 ||
    !q ||
    q.tokenIn?.toLowerCase() !== chain.usdc.toLowerCase() ||
    q.tokenOut?.toLowerCase() !== deployment.address.toLowerCase() ||
    q.amountIn !== amount ||
    !positiveInteger(q.amountOut)
  )
    throw new Error(
      "No verified KyberSwap route is available for this amount.",
    );
  const gas = q.gasUsd == null || q.gasUsd === "" ? null : Number(q.gasUsd);
  return {
    inputAmount: q.amountIn,
    outputAmount: q.amountOut,
    minimumOutputAmount: null,
    priceImpactPct: null,
    networkFeeUsd: Number.isFinite(gas) && gas >= 0 ? gas : null,
    markets: [
      ...new Set(
        (q.route || [])
          .flat()
          .map((r) => r.exchange)
          .filter(Boolean),
      ),
    ],
  };
}
export function parseSolanaMint(account, now = Date.now()) {
  const info = account?.value?.data?.parsed;
  if (
    info?.type !== "mint" ||
    !Number.isInteger(info.info?.decimals) ||
    info.info.decimals > 30
  )
    throw new Error("Token mint metadata could not be verified.");
  const extensions = info.info.extensions || [];
  if (
    extensions.some((e) => e.extension === "pausableConfig" && e.state?.paused)
  )
    throw new Error("The token mint is currently paused.");
  const scaled = extensions.find((e) => e.extension === "scaledUiAmountConfig");
  return {
    outputDecimals: info.info.decimals,
    sharesPerToken: scaled ? activeMultiplier(scaled.state, now) : null,
    outputUnit: "raw-token",
  };
}
export function evmConversion(issuer) {
  return issuer === "xstocks"
    ? {
        sharesPerToken: 1,
        outputUnit: "adjusted-share",
        conversionSource: "https://docs.xstocks.fi/developers/multipliers",
      }
    : { sharesPerToken: null, outputUnit: "raw-token", conversionSource: null };
}
export function conversionIssuer(product) {
  if (/^wrapped[ -]/i.test(product.name || product.coinId || "")) return null;
  if (
    product.issuer === "xstocks" &&
    (product.source?.startsWith(XSTOCKS_API + "/assets/") ||
      / xStock$/i.test(product.name || ""))
  )
    return "xstocks";
  if (
    product.issuer === "ondo" &&
    (product.source === ONDO_SOURCE ||
      /\(Ondo Tokenized Stock\)$/i.test(product.name || ""))
  )
    return "ondo";
  return null;
}
async function tokenUnits(product, deployment) {
  const chain = CHAINS[deployment.chain];
  const unitIssuer = conversionIssuer(product);
  if (deployment.chain === "Solana") {
    const account = await memo(`solmint:${deployment.address}`, 30_000, () =>
      rpc(chain.rpc(), "getAccountInfo", [
        deployment.address,
        { encoding: "jsonParsed", commitment: "confirmed" },
      ]),
    );
    const parsed = parseSolanaMint(account);
    if (!["xstocks", "ondo"].includes(unitIssuer)) parsed.sharesPerToken = null;
    if (unitIssuer === "xstocks") {
      try {
        const multiplier = await memo(`xmult:${product.symbol}`, 30_000, () =>
          request(
            `${XSTOCKS_API}/assets/${encodeURIComponent(product.symbol)}/multiplier?network=Solana`,
          ),
        );
        parsed.sharesPerToken = activeMultiplier(multiplier);
        parsed.conversionSource = `${XSTOCKS_API}/assets/${encodeURIComponent(product.symbol)}/multiplier?network=Solana`;
      } catch {
        parsed.conversionSource = chain.explorer + deployment.address;
      }
    } else parsed.conversionSource = chain.explorer + deployment.address;
    return parsed;
  }
  const hex = await memo(
    `decimals:${deployment.chain}:${deployment.address}`,
    86_400_000,
    () =>
      rpc(chain.rpc(), "eth_call", [
        { to: deployment.address, data: "0x313ce567" },
        "latest",
      ]),
  );
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex))
    throw new Error("Token decimals could not be verified.");
  const decimals = Number(BigInt(hex));
  if (!Number.isInteger(decimals) || decimals > 30)
    throw new Error("Unsupported token decimals.");
  // Only explicitly documented issuer units can authorize normalization.
  const conversion = evmConversion(unitIssuer);
  if (unitIssuer !== "ondo" || !chain.oracle)
    return { outputDecimals: decimals, ...conversion };
  let oracleValue = null;
  try {
    // getSValue(address), selector derived with web3_sha3 and verified against the published ABI.
    oracleValue = await memo(
      `oracle:${deployment.chain}:${deployment.address}`,
      30_000,
      () =>
        rpc(chain.rpc(), "eth_call", [
          {
            to: chain.oracle,
            data: "0x0a562827" + deployment.address.slice(2).padStart(64, "0"),
          },
          "latest",
        ]),
    );
  } catch {
    /* Not every asset is registered with the synthetic-shares oracle. */
  }
  if (oracleValue != null)
    return {
      outputDecimals: decimals,
      sharesPerToken: parseOndoOracle(oracleValue),
      outputUnit: "raw-token",
      conversionSource:
        chain.explorer.replace("/token/", "/address/") + chain.oracle,
    };
  return {
    outputDecimals: decimals,
    sharesPerToken: null,
    outputUnit: "raw-token",
    conversionSource: null,
  };
}
export function parseOndoOracle(value) {
  if (!/^0x[0-9a-fA-F]{128}$/.test(value))
    throw new Error("Unexpected multiplier oracle response.");
  if (BigInt("0x" + value.slice(66, 130)) !== 0n)
    throw new Error("Issuer oracle reports a paused asset.");
  const ratio = Number(BigInt("0x" + value.slice(2, 66))) / 1e18;
  if (!Number.isFinite(ratio) || ratio <= 0)
    throw new Error("Issuer multiplier is invalid.");
  return ratio;
}
export function purchaseUrl(deployment) {
  const chain = CHAINS[deployment.chain];
  const buyParams = new URLSearchParams(
    deployment.chain === "Solana"
      ? { inputMint: chain.usdc, outputMint: deployment.address }
      : { inputCurrency: chain.usdc, outputCurrency: deployment.address },
  );
  return deployment.chain === "Solana"
    ? `https://raydium.io/swap/?${buyParams}`
    : `https://kyberswap.com/swap/${chain.websiteChain}?${buyParams}`;
}
export async function getQuote(product, deployment, amount) {
  const chain = CHAINS[deployment.chain];
  const id = `${product.issuer}:${deployment.chain}:${deployment.address}`;
  if (!chain?.usdc)
    return {
      id,
      issuer: product.issuer,
      symbol: product.symbol,
      chain: deployment.chain,
      chainLabel: chain?.label || deployment.chain,
      address: deployment.address,
      source: product.source,
      sourceAt: product.sourceAt,
      explorerUrl: chain?.explorer + deployment.address,
      status: "unavailable",
      reason:
        "Order quotes are not supported on this chain. Explore its listed markets in the Markets tab.",
      venue: "—",
      buyUrl: null,
    };
  const inputAmount = toBaseUnits(amount, chain.decimals);
  const params = new URLSearchParams(
    deployment.chain === "Solana"
      ? {
          inputMint: chain.usdc,
          outputMint: deployment.address,
          amount: inputAmount,
          slippageBps: "50",
          txVersion: "V0",
        }
      : {
          tokenIn: chain.usdc,
          tokenOut: deployment.address,
          amountIn: inputAmount,
        },
  );
  const quoteUrl =
    deployment.chain === "Solana"
      ? `https://transaction-v1.raydium.io/compute/swap-base-in?${params}`
      : `https://aggregator-api.kyberswap.com/${chain.kyber}/api/v1/routes?${params}`;
  const venue = deployment.chain === "Solana" ? "Raydium" : "KyberSwap";
  const buyUrl = purchaseUrl(deployment);
  const base = {
    id,
    issuer: product.issuer,
    symbol: product.symbol,
    chain: deployment.chain,
    chainLabel: chain.label,
    address: deployment.address,
    explorerUrl: chain.explorer + deployment.address,
    source: product.source,
    sourceAt: product.sourceAt,
    venue,
    buyUrl,
    quoteSource: quoteUrl,
    inputAsset: chain.usdc,
    inputSymbol:
      deployment.chain === "BinanceSmartChain" ? "Binance-Peg USDC" : "USDC",
  };
  if (product.halted)
    return {
      ...base,
      status: "unavailable",
      reason: "Issuer reports this product is halted.",
    };
  return memo(`quote:${id}:${amount}`, 10_000, async () => {
    try {
      const fetchedAt = Date.now();
      const [response, units] = await Promise.all([
        request(quoteUrl, { headers: { "x-client-id": "stocklens" } }),
        tokenUnits(product, deployment),
      ]);
      const raw =
        deployment.chain === "Solana"
          ? parseRaydium(response, deployment, chain, inputAmount)
          : parseKyber(response, deployment, chain, inputAmount);
      const result = normalizeQuote({
        ...raw,
        ...units,
        inputDecimals: chain.decimals,
        fetchedAt,
      });
      return {
        ...base,
        ...result,
        ...units,
        inputAmount: raw.inputAmount,
        inputDecimals: chain.decimals,
        outputAmount: raw.outputAmount,
        status: "quoted",
        minimumOutputAmount: raw.minimumOutputAmount,
        priceImpactPct: raw.priceImpactPct,
        markets: raw.markets,
        conversionWarning:
          result.equivalentShares == null
            ? "Shares-per-token data is unavailable. Token output is shown without cross-product ranking."
            : null,
      };
    } catch (error) {
      return {
        ...base,
        status: "unavailable",
        reason:
          error.name === "TimeoutError"
            ? "The provider timed out. Refresh to try again."
            : error.message,
        fetchedAt: Date.now(),
        expiresAt: null,
      };
    }
  });
}

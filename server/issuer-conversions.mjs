import { request, rpc as defaultRpc, memo } from "./http.mjs";
import { CHAINS } from "./config.mjs";
import { activeMultiplier, multiplierValidUntil } from "../src/model.mjs";

const ROBINHOOD_API = "https://api.robinhood.com/rhj/assets";
const ROBINHOOD_DOCS = "https://docs.robinhood.com/chain/stock-tokens/";
const BACKPACK_API = "https://api.backpack.exchange/api/v1/assets";
const BACKPACK_DOCS =
  "https://learn.backpack.exchange/articles/what-is-backpack-securities";
const DINARI_FACTORY =
  "https://raw.githubusercontent.com/dinaricrypto/sbt-contracts/main/releases/v0.4.0/dshare_factory.json";
const DINARI_DOCS = "https://docs.dinari.com/docs/stock-split-handling";
const COINBASE_API = "https://api.coinbase.com/v1/tokenized-stocks";
const BSTOCKS_API =
  "https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai?type=3";
const BSTOCKS_DOCS =
  "https://www.binance.bh/en/support/faq/detail/f0c03cd6509a4085b4cce1636f16be38";
const REALITY_API = "https://api.realityfinance.xyz/api/v1/rwa/assets/tickers";
const COINBASE_DOCS =
  "https://docs.base.org/build-on-base/integrate-defi/list-tokenized-stocks";
const REALITY_DOCS = "https://realityfinance.xyz/info/docs/rtokens/overview";
const CHAIN_IDS = {
  Base: 8453,
  Ethereum: 1,
  BinanceSmartChain: 56,
  Arbitrum: 42161,
  Morph: 2818,
  HyperEVM: 999,
  Robinhood: 4663,
  Avalanche: 43114,
  Plume: 98866,
};
const REALITY_NETWORKS = { Arbitrum: "ARB", Morph: "Morph" };
const ADDRESS = /^0x[0-9a-f]{40}$/i;
const WORD = /^0x[0-9a-f]{64}$/i;
const UI_MULTIPLIER = "0xa60bf13d"; // uiMultiplier(), ERC-8056, WAD precision.
const DECIMALS = "0x313ce567";
const sameAddress = (a, b) =>
  ADDRESS.test(a || "") &&
  ADDRESS.test(b || "") &&
  a.toLowerCase() === b.toLowerCase();
const defaultRead = (url, options) =>
  memo(`issuer-conversion-source:${url}`, 30_000, () => request(url, options));
const matchingSymbol = (catalog, official) =>
  !official ||
  String(catalog || "").toUpperCase() === String(official).toUpperCase();

// Discovery eligibility is deliberately separate from authorization. Every actual
// conversion below verifies an exact issuer-listed chain and contract at runtime.
export function supportsIssuerConversion(product) {
  if (!product) return false;
  if (product.issuer === "dinari") return true;
  if (product.issuer === "st0x")
    return /^WT[A-Z0-9.\-]+$/i.test(product.symbol || "");
  return (
    !product.wrapped &&
    !/^wrapped[ -]/i.test(product.name || "") &&
    ["coinbase", "reality", "bstocks", "robinhood", "backpack"].includes(
      product.issuer,
    )
  );
}

async function coinbaseRecord(address, read) {
  let pageToken = null;
  const seen = new Set();
  // Bound untrusted pagination, and reject repeated cursors rather than looping.
  for (let page = 0; page < 20; page++) {
    const url = new URL(COINBASE_API);
    url.searchParams.set("page_size", "500");
    if (pageToken) url.searchParams.set("page_token", pageToken);
    const body = await read(url.toString());
    if (!Array.isArray(body?.tokens)) return null;
    const matches = body.tokens.filter((token) =>
      sameAddress(token.contract_address, address),
    );
    if (matches.length > 1) return null;
    if (matches.length === 1) return matches[0];
    pageToken = body.next_page_token;
    if (!pageToken || typeof pageToken !== "string" || seen.has(pageToken))
      return null;
    seen.add(pageToken);
  }
  return null;
}

function uintWord(value) {
  if (!WORD.test(value || ""))
    throw new Error("Invalid issuer conversion response.");
  return BigInt(value);
}
function positiveRatio(raw, scale) {
  const decimals = scale.toString().length - 1;
  const digits = raw.toString().padStart(decimals + 1, "0");
  const ratio = Number(
    decimals
      ? digits.slice(0, -decimals) + "." + digits.slice(-decimals)
      : digits,
  );
  if (!Number.isFinite(ratio) || ratio <= 0)
    throw new Error("Invalid issuer share conversion.");
  return ratio;
}
async function call(rpc, chain, address, data) {
  return rpc(chain.rpc(), "eth_call", [{ to: address, data }, "latest"]);
}
async function multiplier(rpc, chain, address) {
  return positiveRatio(
    uintWord(await call(rpc, chain, address, UI_MULTIPLIER)),
    10n ** 18n,
  );
}
async function tokenDecimals(rpc, chain, address) {
  const decimals = Number(uintWord(await call(rpc, chain, address, DECIMALS)));
  if (!Number.isInteger(decimals) || decimals > 30)
    throw new Error("Unsupported issuer token decimals.");
  return decimals;
}

// ST0x publishes both tStock and wtStock addresses per chain. Only the exact
// issuer-listed wrapper over the exact listed tStock may use ERC-4626 units.
function st0xPair(markdown, chainId, ticker) {
  if (typeof markdown !== "string") return null;
  const sections = markdown.split(/(?=^\s*###\s)/m);
  const section = sections.find((value) =>
    new RegExp(`\\bchain id ${chainId}\\b`).test(value),
  );
  if (!section) return null;
  const lines = section.split("\n");
  const addressFor = (symbol) => {
    const matches = lines
      .filter((line) => line.includes(`**${symbol}**:`))
      .map((line) => line.match(/`(0x[0-9a-f]{40})`/i)?.[1])
      .filter(Boolean);
    return matches.length === 1 ? matches[0] : null;
  };
  const asset = addressFor(`t${ticker}`);
  const wrapper = addressFor(`wt${ticker}`);
  return asset && wrapper ? { asset, wrapper } : null;
}

/** Return current underlying-share units only after exact issuer identity checks.
 * read(url, options) uses the same contract as http.request; rpc(url,method,params)
 * uses http.rpc. Unavailable or unsupported conversions return null so quotes can
 * remain visible in raw token units. No price-derived or name-derived ratios.
 */
export async function getIssuerConversion(product, deployment, options = {}) {
  // Cache complete successful observations, including their original timestamp.
  // Injected transports and already-fetched Solana accounts remain caller-owned.
  if (
    !options.read &&
    !options.rpc &&
    options.now == null &&
    !options.mintAccount &&
    supportsIssuerConversion(product)
  ) {
    const chain = options.chain || CHAINS[deployment?.chain];
    const key = [
      product.issuer,
      product.symbol,
      product.wrapped,
      deployment?.chain,
      deployment?.address,
      chain?.evmId,
      chain?.rpc?.(),
    ].join(":");
    return memo(`issuer-conversion:${key}`, 30_000, async () => {
      const result = await resolveIssuerConversion(
        product,
        deployment,
        options,
      );
      // Deadline exhaustion is caller-specific; do not pin a null conversion in
      // the shared cache after a successful source response arrives too late.
      if (!result && Date.now() >= (options.deadlineAt ?? Infinity))
        throw new Error("Issuer conversion deadline expired.");
      return result;
    }).catch(() => null);
  }
  return resolveIssuerConversion(product, deployment, options);
}

async function resolveIssuerConversion(
  product,
  deployment,
  {
    chain = CHAINS[deployment?.chain],
    read = defaultRead,
    rpc = defaultRpc,
    now = Date.now,
    mintAccount,
    deadlineAt = Infinity,
  } = {},
) {
  if (!supportsIssuerConversion(product) || !chain?.rpc) return null;
  const sourceRead = read;
  const sourceRpc = rpc;
  const assertBeforeDeadline = () => {
    if (Date.now() >= deadlineAt)
      throw new Error("Issuer conversion deadline expired.");
  };
  read = (...args) => {
    assertBeforeDeadline();
    return sourceRead(...args);
  };
  rpc = (...args) => {
    assertBeforeDeadline();
    return sourceRpc(...args);
  };
  if (deployment?.chain === "Solana") {
    if (product.issuer !== "backpack" || (chain.id && chain.id !== "Solana"))
      return null;
    try {
      const records = await read(BACKPACK_API);
      if (!Array.isArray(records)) return null;
      const matches = records
        .filter((asset) =>
          matchingSymbol(product.symbol, asset.symbol?.replace(/\.US$/, "")),
        )
        .flatMap((asset) => asset.tokens || [])
        .filter(
          (token) =>
            token.blockchain === "Solana" &&
            token.contractAddress === deployment.address,
        );
      if (matches.length !== 1) return null;
      const account =
        mintAccount ||
        (await rpc(chain.rpc(), "getAccountInfo", [
          deployment.address,
          { encoding: "jsonParsed", commitment: "confirmed" },
        ]));
      const parsed = account?.value?.data?.parsed;
      if (
        parsed?.type !== "mint" ||
        parsed.info?.isInitialized !== true ||
        !Number.isInteger(parsed.info.decimals) ||
        parsed.info.decimals !== matches[0].nativeDecimals
      )
        return null;
      if (account.value.owner !== "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")
        return null;
      const extensions = parsed.info.extensions || [];
      if (
        extensions.some(
          (extension) =>
            extension.extension === "pausableConfig" && extension.state?.paused,
        )
      )
        return null;
      const scaled = extensions.find(
        (extension) => extension.extension === "scaledUiAmountConfig",
      );
      // Backpack mints expose Token-2022 scaled UI amounts. Requiring the
      // extension avoids assuming that raw token units stay one share on splits.
      if (!scaled) return null;
      const conversionTime = typeof now === "function" ? now() : now;
      return {
        sharesPerToken: activeMultiplier(scaled.state, conversionTime),
        conversionValidUntil: multiplierValidUntil(
          scaled.state,
          conversionTime,
        ),
        outputUnit: "raw-token",
        conversionSource: BACKPACK_DOCS,
        conversionIdentitySource: BACKPACK_API,
        conversionMethod:
          "Issuer-listed Backpack Token-2022 scaled UI multiplier",
        conversionObservedAt: new Date(conversionTime).toISOString(),
      };
    } catch {
      return null;
    }
  }
  if (!ADDRESS.test(deployment?.address || "")) return null;
  if (chain.id && chain.id !== deployment.chain) return null;
  const chainId = CHAIN_IDS[deployment.chain];
  if (!chainId || (chain.evmId != null && Number(chain.evmId) !== chainId))
    return null;
  try {
    const rpcChainId =
      sourceRpc === defaultRpc
        ? await memo(`issuer-conversion-chain:${chain.rpc()}`, 30_000, () =>
            rpc(chain.rpc(), "eth_chainId", []),
          )
        : await rpc(chain.rpc(), "eth_chainId", []);
    if (
      !/^0x[0-9a-f]+$/i.test(rpcChainId || "") ||
      BigInt(rpcChainId) !== BigInt(chainId)
    )
      return null;
    const observedAt = new Date(
      typeof now === "function" ? now() : now,
    ).toISOString();
    let sharesPerToken;
    let conversionSource;
    let conversionMethod;
    let conversionIdentitySource;
    if (product.issuer === "coinbase") {
      if (deployment.chain !== "Base") return null;
      const record = await coinbaseRecord(deployment.address, read);
      if (
        !record ||
        !matchingSymbol(product.symbol, record.symbol) ||
        (Array.isArray(record.paused_features) && record.paused_features.length)
      )
        return null;
      sharesPerToken = await multiplier(rpc, chain, deployment.address);
      conversionSource = COINBASE_DOCS;
      conversionIdentitySource = COINBASE_API;
      conversionMethod = "Issuer-listed Base B20 uiMultiplier() / 1e18";
    } else if (product.issuer === "robinhood") {
      const body = await read(ROBINHOOD_API);
      if (!Array.isArray(body?.assets)) return null;
      const matches = body.assets.filter(
        (asset) =>
          asset.status === "ASSET_STATUS_ACTIVE" &&
          matchingSymbol(product.symbol, asset.tokenSymbol) &&
          (asset.deployments || []).some(
            (token) =>
              Number(token.chainId) === chainId &&
              sameAddress(token.contractAddress, deployment.address),
          ),
      );
      if (matches.length !== 1) return null;
      sharesPerToken = await multiplier(rpc, chain, deployment.address);
      conversionSource = ROBINHOOD_DOCS;
      conversionIdentitySource = ROBINHOOD_API;
      conversionMethod =
        "Issuer-listed Robinhood ERC-8056 uiMultiplier() / 1e18";
    } else if (product.issuer === "dinari") {
      const manifest = await read(DINARI_FACTORY);
      const factory = manifest?.deployments?.production?.[String(chainId)];
      if (!ADDRESS.test(factory || "")) return null;
      const argument = deployment.address.slice(2).padStart(64, "0");
      const native = uintWord(
        await call(rpc, chain, factory, "0x25f28f16" + argument),
      ); // isTokenDShare(address)
      if (native !== 1n || product.wrapped) return null;
      // Dinari's ERC20Rebasing balanceOf/transfer amounts already include the
      // split adjustment. balancePerShare is an internal accounting ratio and
      // applying it again would double count the split.
      if ((await tokenDecimals(rpc, chain, deployment.address)) !== 18)
        return null;
      sharesPerToken = 1;
      conversionSource = DINARI_DOCS;
      conversionIdentitySource = DINARI_FACTORY;
      conversionMethod =
        "Production Dinari factory-confirmed native rebasing dShare ERC-20 balance units";
    } else if (product.issuer === "bstocks") {
      if (deployment.chain !== "BinanceSmartChain") return null;
      const body = await read(BSTOCKS_API);
      if (
        body?.code !== "000000" ||
        body.success !== true ||
        !Array.isArray(body.data)
      )
        return null;
      const matches = body.data.filter(
        (token) =>
          token.type === 3 &&
          String(token.chainId) === "56" &&
          matchingSymbol(product.symbol, token.symbol) &&
          sameAddress(token.contractAddress, deployment.address),
      );
      if (matches.length !== 1) return null;
      sharesPerToken = await multiplier(rpc, chain, deployment.address);
      conversionSource = BSTOCKS_DOCS;
      conversionIdentitySource = BSTOCKS_API;
      conversionMethod =
        "Binance-listed bStocks ERC-8056 uiMultiplier() / 1e18";
    } else if (product.issuer === "reality") {
      const network = REALITY_NETWORKS[deployment.chain];
      if (!network) return null;
      const body = await read(REALITY_API);
      if (body?.code !== "200" || !Array.isArray(body.data)) return null;
      const matches = body.data
        .filter((asset) => asset.status === "active")
        .flatMap((asset) => asset.tokens || [])
        .filter(
          (token) =>
            token.network === network &&
            matchingSymbol(product.symbol, token.symbol) &&
            sameAddress(token.address, deployment.address),
        );
      if (matches.length !== 1) return null;
      sharesPerToken = await multiplier(rpc, chain, deployment.address);
      conversionSource = REALITY_DOCS;
      conversionIdentitySource = REALITY_API;
      conversionMethod = "Issuer-listed Reality ERC-8056 uiMultiplier() / 1e18";
    } else if (product.issuer === "st0x") {
      const ticker = product.symbol.slice(2).toUpperCase();
      const source = `https://st0x.io/tokens/${encodeURIComponent(ticker)}.md`;
      const pair = st0xPair(
        await read(source, { json: false }),
        chainId,
        ticker,
      );
      if (!pair || !sameAddress(pair.wrapper, deployment.address)) return null;
      const assetWord = await call(
        rpc,
        chain,
        deployment.address,
        "0x38d52e0f",
      ); // asset()
      if (
        !WORD.test(assetWord || "") ||
        BigInt(assetWord) >> 160n !== 0n ||
        !sameAddress("0x" + assetWord.slice(-40), pair.asset)
      )
        return null;
      const [wrapperDecimals, assetDecimals] = await Promise.all([
        tokenDecimals(rpc, chain, pair.wrapper),
        tokenDecimals(rpc, chain, pair.asset),
      ]);
      const oneWrapper = (10n ** BigInt(wrapperDecimals))
        .toString(16)
        .padStart(64, "0");
      const assets = uintWord(
        await call(rpc, chain, pair.wrapper, "0x07a2d13a" + oneWrapper),
      ); // convertToAssets(uint256)
      sharesPerToken = positiveRatio(assets, 10n ** BigInt(assetDecimals));
      conversionSource = source;
      conversionIdentitySource = source;
      conversionMethod =
        "Issuer-listed ST0x ERC-4626 convertToAssets(one wrapper), normalized by underlying decimals";
    }
    if (!sharesPerToken) return null;
    return {
      sharesPerToken,
      outputUnit: "raw-token",
      conversionSource,
      conversionIdentitySource,
      conversionMethod,
      conversionObservedAt: observedAt,
    };
  } catch {
    // Missing identity, stale/unavailable sources and invalid contract responses
    // must never become an assumed 1:1 ratio or discard a usable raw-token quote.
    return null;
  }
}

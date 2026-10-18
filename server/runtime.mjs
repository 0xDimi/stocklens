import { isIP } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const defaultCache = fileURLToPath(new URL("../.cache/", import.meta.url));
function integer(env, key, fallback, min, max) {
  const value = env[key] ?? String(fallback);
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < min ||
    Number(value) > max
  )
    throw new Error(`${key} must be an integer between ${min} and ${max}.`);
  return Number(value);
}
export function normalizeIP(value = "") {
  return value.startsWith("::ffff:") && isIP(value.slice(7)) === 4
    ? value.slice(7)
    : value;
}
export function readRuntime(env = process.env) {
  const mode = env.NODE_ENV || "development";
  if (!["development", "test", "production"].includes(mode))
    throw new Error("NODE_ENV must be development, test or production.");
  const host = env.HOST || (mode === "production" ? "0.0.0.0" : "127.0.0.1");
  if (!isIP(host) && host !== "localhost")
    throw new Error("HOST must be an IP address or localhost.");
  const trustedProxies = (env.TRUST_PROXY || "")
    .split(",")
    .map((v) => normalizeIP(v.trim()))
    .filter(Boolean);
  if (trustedProxies.some((v) => !isIP(v)))
    throw new Error(
      "TRUST_PROXY must contain exact proxy IP addresses separated by commas.",
    );
  const cacheDir = env.CACHE_DIR ?? defaultCache;
  if (!cacheDir.trim() || cacheDir.includes("\0"))
    throw new Error("CACHE_DIR must be a valid directory path.");
  if (env.COINGECKO_PLAN && !["demo", "pro"].includes(env.COINGECKO_PLAN))
    throw new Error("COINGECKO_PLAN must be demo or pro.");
  if (env.COINGECKO_API_KEY && /[\r\n]/.test(env.COINGECKO_API_KEY))
    throw new Error("COINGECKO_API_KEY cannot contain line breaks.");
  for (const key of [
    "SOLANA_RPC_URL",
    "ETHEREUM_RPC_URL",
    "BSC_RPC_URL",
    "BASE_RPC_URL",
    "ARBITRUM_RPC_URL",
  ]) {
    if (!env[key]) continue;
    let url;
    try {
      url = new URL(env[key]);
    } catch {
      throw new Error(`${key} must be an HTTP or HTTPS URL.`);
    }
    if (!["http:", "https:"].includes(url.protocol) || url.hash)
      throw new Error(
        `${key} must be an HTTP or HTTPS URL without a fragment.`,
      );
  }
  return Object.freeze({
    production: mode === "production",
    host,
    port: integer(env, "PORT", 4173, 1, 65535),
    cacheDir: resolve(cacheDir),
    trustedProxies,
    rateLimit: integer(env, "RATE_LIMIT_PER_MINUTE", 90, 1, 10000),
    sourceConcurrency: integer(env, "SOURCE_CONCURRENCY", 2, 1, 8),
    sourceMaxQueue: integer(env, "SOURCE_MAX_QUEUE", 16, 0, 128),
    sourceTimeoutMs: integer(env, "SOURCE_TIMEOUT_MS", 10000, 100, 30000),
    sourceStaleMs: integer(env, "SOURCE_STALE_MS", 86400000, 1000, 259200000),
    shutdownMs: integer(env, "SHUTDOWN_TIMEOUT_MS", 10000, 100, 30000),
  });
}
export function clientIdentity(request, trustedProxies = []) {
  const peer = normalizeIP(request.socket.remoteAddress || "unknown");
  if (!trustedProxies.includes(peer)) return peer;
  const header = request.headers["x-forwarded-for"];
  if (typeof header !== "string" || header.length > 512) return peer;
  const chain = header.split(",").map((v) => normalizeIP(v.trim()));
  if (chain.length > 16 || chain.some((v) => !isIP(v))) return peer;
  for (let index = chain.length - 1; index >= 0; index--)
    if (!trustedProxies.includes(chain[index])) return chain[index];
  return chain[0] || peer;
}

import { canonicalSelection } from "./asset-comparison-model.mjs";

// An absent query parameter means keep the basket, not clear it on navigation.
export function restoreComparison(params, fallback, stocks) {
  const ids = params.has("stocks") ? params.get("stocks").split(",") : fallback;
  return canonicalSelection(Array.isArray(ids) ? ids : [], stocks);
}
export function readComparison(storage) {
  try {
    const value = JSON.parse(storage.getItem("stocklens:comparison") || "[]");
    return Array.isArray(value)
      ? value.filter((id) => typeof id === "string").slice(0, 5)
      : [];
  } catch {
    return [];
  }
}
export function saveComparison(storage, ids) {
  try {
    storage.setItem("stocklens:comparison", JSON.stringify(ids.slice(0, 5)));
  } catch {}
}

// Browsers may deny the storage property itself, before getItem is called.
export function comparisonStorage(host = globalThis) {
  try {
    return host.localStorage;
  } catch {
    return null;
  }
}

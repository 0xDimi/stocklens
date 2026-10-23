import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/theme.css", import.meta.url), "utf8");
const declarations = (block) =>
  Object.fromEntries(
    [...block.matchAll(/--([a-z-]+):\s*(#[a-f\d]{3,8})\s*;/gi)].map((m) => [
      m[1],
      m[2],
    ]),
  );
const dark = declarations(css.match(/:root\s*\{([^}]+)\}/)[1]);
const light = {
  ...dark,
  ...declarations(css.match(/:root\[data-theme="light"\]\s*\{([^}]+)\}/)[1]),
};
function luminance(hex) {
  let value = hex.slice(1);
  if (value.length === 3) value = [...value].map((c) => c + c).join("");
  const channels = [0, 2, 4]
    .map((i) => parseInt(value.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
}
for (const [name, palette] of Object.entries({ dark, light })) {
  test(`${name} theme keeps reading, actions, status and control roles legible`, () => {
    const pairs = [
      ["ink", "page", 4.5],
      ["muted", "surface", 4.5],
      ["muted", "wash", 4.5],
      ["accent", "surface", 4.5],
      ["action-ink", "action-bg", 4.5],
      ["action-ink", "action-hover", 4.5],
      ["green", "success-bg", 4.5],
      ["red", "error-bg", 4.5],
      ["warning", "warning-bg", 4.5],
      ["info", "info-bg", 4.5],
      ["focus", "surface", 3],
      ["control-border", "surface", 3],
    ];
    for (const [fg, bg, min] of pairs)
      assert.ok(
        contrast(palette[fg], palette[bg]) >= min,
        `${name}: ${fg} / ${bg} needs ${min}:1, got ${contrast(palette[fg], palette[bg]).toFixed(2)}:1`,
      );
  });
}

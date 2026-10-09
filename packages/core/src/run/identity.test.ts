import assert from "node:assert/strict";
import { test } from "node:test";
import { compareIdentity, isShadeOf } from "./index.js";

const page = (path: string, identity: { fonts?: string[]; palette?: string[]; gradients?: string[]; logo?: string | null }) => ({
  path,
  identity: { fonts: ["Comic Sans MS"], palette: ["#ff4081", "#fdf6e3", "#8e2de2"], gradients: ["linear-gradient(90deg, #8e2de2, #4a00e0)"], logo: "Super Boutique", ...identity },
});

test("a shade of the same hue, or one grey for another, is a shade; another hue is not", () => {
  assert.equal(isShadeOf("#e31c6b", "#ff4081"), true, "a darker pink for contrast");
  assert.equal(isShadeOf("#000000", "#333333"), true, "one grey for another");
  assert.equal(isShadeOf("#2e7d32", "#ff4081"), false, "a green is not a pink");
  assert.equal(isShadeOf("#777062", "#e0d8c8"), true, "a darker beige for contrast");
});

test("the style is kept when the fonts, the gradients and the logo stay, and every colour is one the app had or a shade of it", () => {
  const before = [page("/", {}), page("/produits", { palette: ["#e0d8c8", "#0000ee"] })];
  const after = [page("/", { palette: ["#e31c6b", "#fdf6e3", "#8e2de2"] }), page("/produits", { palette: ["#777062", "#8e2de2"] })];
  const result = compareIdentity(before, after);
  assert.deepEqual(result.changed, []);
  assert.deepEqual(result.shades, ["#e31c6b (from #ff4081)", "#777062 (from #e0d8c8)"]);
});

test("a new font, a new colour, a gradient gone or a logo changed is a change of style, named page by page", () => {
  const before = [page("/", {}), page("/contact", {})];
  const after = [
    page("/", { fonts: ["Comic Sans MS", "Inter"], gradients: [], logo: "SUPER BOUTIQUE" }),
    page("/contact", { palette: ["#ff4081", "#2e7d32"] }),
  ];
  assert.deepEqual(compareIdentity(before, after).changed, [
    "/: a font the app did not use, Inter",
    "/: the gradient linear-gradient(90deg, #8e2de2, #4a00e0) is gone",
    "/: the logo reads SUPER BOUTIQUE, not Super Boutique",
    "/contact: a colour the app did not have, #2e7d32",
  ]);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeProduct, productBrief, validateProduct } from "./index.js";

const journey = (name: string, source = "(seen: /)") => `### ${name}\nWhy: a visitor wants it. ${source}\n1. Open \`/\`.\n2. Click "${name}".\n`;

const product = ({ purpose = "A shop that sells mugs. (seen: /)", who = "People buying a gift. (to confirm)", journeys = ["See the products", "See my orders", "Contact the shop"] } = {}) =>
  `# Super boutique\n\n## What it is for\n${purpose}\n\n## Who uses it\n${who}\n\n## The main loop\nBrowse, order, check the order. (seen: /produits, /commandes)\n\n## Key journeys\n\n${journeys.map((j) => journey(j)).join("\n")}`;

test("a product sheet says what the app is for, who uses it, its loop, and three to five journeys", () => {
  assert.deepEqual(validateProduct(product()), []);
  assert.deepEqual(validateProduct(product({ journeys: ["A", "B", "C", "D", "E"] })), []);
});

test("a sheet missing a part, or with too few or too many journeys, is refused with the reason", () => {
  assert.match(validateProduct(product().replace(/## Who uses it\n.*\n\n/, "")).join("\n"), /missing "Who uses it"/);
  assert.match(validateProduct(product({ purpose: "" })).join("\n"), /"What it is for" is empty/);
  assert.match(validateProduct(product({ journeys: ["A", "B"] })).join("\n"), /3 to 5 key journeys, found 2/);
  assert.match(validateProduct(product({ journeys: ["A", "B", "C", "D", "E", "F"] })).join("\n"), /3 to 5 key journeys, found 6/);
});

test("every journey is a list of numbered steps", () => {
  const stepless = product().replace(/1\. Open `\/`\.\n2\. Click "See my orders"\.\n/, "");
  assert.match(validateProduct(stepless).join("\n"), /journey "See my orders" has no numbered steps/);
});

test("every part and every journey says where it comes from, or that it is to confirm", () => {
  assert.match(validateProduct(product({ purpose: "A shop that sells mugs." })).join("\n"), /"What it is for" does not say where it comes from/);
  assert.match(validateProduct(product({ purpose: "A shop that sells mugs. (seen: )" })).join("\n"), /"What it is for" does not say where it comes from/, "an empty source is no source");
  assert.match(validateProduct(product({ who: "People buying a gift." })).join("\n"), /"Who uses it" does not say where it comes from/);
  assert.match(validateProduct(product().replace("check the order. (seen: /produits, /commandes)", "check the order.")).join("\n"), /"The main loop" does not say where it comes from/);
  const unsourced = product().replace(/### See my orders\nWhy: a visitor wants it\. \(seen: \/\)/, "### See my orders\nWhy: a visitor wants it.");
  assert.match(validateProduct(unsourced).join("\n"), /journey "See my orders" does not say where it comes from/);
});

test("a first run writes the proposal, spaced as every later run will write it", () => {
  const result = mergeProduct({ proposed: product() });
  assert.equal(mergeProduct({ base: product(), current: result.text, proposed: product() }).text, result.text, "a second run over an untouched sheet changes nothing");
  assert.match(result.text, /\(seen: \/\)\n1\. Open/);
  assert.deepEqual(result.added, ["Super boutique", "What it is for", "Who uses it", "The main loop", "Key journeys", 'journey "See the products"', 'journey "See my orders"', 'journey "Contact the shop"']);
});

test("what the user corrected stays as they wrote it; the rest takes what AEOM learned", () => {
  const base = product();
  const current = base.replace("People buying a gift. (to confirm)", "Locals who come back every month. (seen: Antoine)");
  const proposed = product({ purpose: "A shop that sells mugs and teapots. (seen: /produits)", journeys: ["See the products", "See my orders", "Contact the shop", "Find help"] });
  const result = mergeProduct({ base, current, proposed });
  assert.match(result.text, /Locals who come back every month\. \(seen: Antoine\)/);
  assert.doesNotMatch(result.text, /People buying a gift/);
  assert.match(result.text, /mugs and teapots/);
  assert.match(result.text, /### Find help/);
  assert.deepEqual(result.kept, ["Who uses it"]);
  assert.deepEqual(result.updated, ["What it is for"]);
  assert.deepEqual(result.added, ['journey "Find help"']);
});

test("what AEOM wrote and no longer proposes goes, so a refreshed sheet keeps three to five journeys", () => {
  const base = product({ journeys: ["A", "B", "C", "D", "E"] });
  const result = mergeProduct({ base, current: base, proposed: product({ journeys: ["A", "B", "C", "F", "G"] }) });
  assert.deepEqual(validateProduct(result.text), []);
  assert.deepEqual(result.removed, ['journey "D"', 'journey "E"']);
  assert.deepEqual(result.added, ['journey "F"', 'journey "G"']);
});

test("a journey the user removed stays removed, and one the user added stays", () => {
  const base = product();
  const current = base.replace(journey("Contact the shop"), journey("Leave a review", "(seen: Antoine)"));
  const result = mergeProduct({ base, current, proposed: product() });
  assert.doesNotMatch(result.text, /### Contact the shop/);
  assert.match(result.text, /### Leave a review/);
  assert.deepEqual(result.kept, ['journey "Leave a review"']);
});

test("without AEOM's last proposal, everything already in the sheet counts as the user's", () => {
  const current = product({ who: "Whoever the user says. (seen: Antoine)" });
  const proposed = product({ who: "People buying a gift. (to confirm)", journeys: ["See the products", "See my orders", "Contact the shop", "Find help"] });
  const result = mergeProduct({ current, proposed });
  assert.match(result.text, /Whoever the user says/);
  assert.match(result.text, /### Find help/);
  assert.deepEqual(result.updated, []);
  assert.deepEqual(result.added, ['journey "Find help"']);
});

test("a journey may be to confirm, and placeholder or repeated headings are refused", () => {
  const toConfirm = product().replace("### Contact the shop\nWhy: a visitor wants it. (seen: /)", "### Contact the shop\nWhy: a visitor wants it. (to confirm)");
  assert.deepEqual(validateProduct(toConfirm), []);
  assert.match(validateProduct(product({ purpose: "A shop. (seen: <screen or file>)" })).join("\n"), /"What it is for" does not say where it comes from/);
  assert.match(validateProduct(product().replace("## The main loop", "## Who uses it\nAgain. (seen: /)\n\n## The main loop")).join("\n"), /"Who uses it" appears more than once/);
  assert.match(validateProduct(product({ journeys: ["A", "B", "A"] })).join("\n"), /journey "A" appears more than once/);
});

test("a journey whose steps the user edited keeps their steps", () => {
  const base = product();
  const current = base.replace('2. Click "See my orders".', '2. Click "Commandes" in the menu.');
  const result = mergeProduct({ base, current, proposed: product() });
  assert.match(result.text, /2\. Click "Commandes" in the menu\./);
  assert.deepEqual(result.kept, ['journey "See my orders"']);
});

test("a renamed app gets its new name at the top of the sheet", () => {
  const base = product();
  const result = mergeProduct({ base, current: base, proposed: product().replace("# Super boutique", "# Super Boutique en ligne") });
  assert.ok(result.text.startsWith("# Super Boutique en ligne\n"));
  assert.deepEqual(validateProduct(result.text), []);
});

test("the brief of the directions holds what the app is for, who uses it and its loop, and nothing marked to confirm", () => {
  const brief = productBrief(product({ purpose: "A shop that sells mugs. (seen: /) It ships across France. (to confirm)" }));
  assert.equal(brief.name, "Super boutique");
  assert.deepEqual(brief.parts, [
    { part: "What it is for", text: "A shop that sells mugs." },
    { part: "The main loop", text: "Browse, order, check the order." },
  ]);
  assert.deepEqual(brief.unconfirmed, ["What it is for: It ships across France.", "Who uses it: People buying a gift."]);
});

test("what the user confirms with their name as source goes in the brief; words with no source stay out", () => {
  const confirmed = productBrief(product({ who: "Interior designers buying for their clients. (seen: Antoine)" }));
  assert.deepEqual(confirmed.parts[1], { part: "Who uses it", text: "Interior designers buying for their clients." });
  assert.deepEqual(confirmed.unconfirmed, []);
  const unsourced = productBrief(product({ purpose: "A shop that sells mugs. (seen: /) It mostly sells to companies." }));
  assert.deepEqual(unsourced.parts[0], { part: "What it is for", text: "A shop that sells mugs." });
  assert.deepEqual(unsourced.unconfirmed, ["What it is for: It mostly sells to companies. (no source)", "Who uses it: People buying a gift."]);
});

test("a source path with parentheses, a capital To confirm, a list and a title with text under it are read as meant", () => {
  const brief = productBrief(
    product({ purpose: "- A shop that sells mugs. (seen: src/app/(shop)/page.tsx)\n- Mugs come in three sizes. (To confirm)" }).replace("# Super boutique\n", "# Super boutique\nDrafted by AEOM.\n"),
  );
  assert.equal(brief.name, "Super boutique");
  assert.deepEqual(brief.parts[0], { part: "What it is for", text: "A shop that sells mugs." });
  assert.deepEqual(brief.unconfirmed.slice(0, 1), ["What it is for: Mugs come in three sizes."]);
  assert.deepEqual(validateProduct(product({ purpose: "A shop that sells mugs. (seen: src/app/(shop)/page.tsx)" })), []);
});

test("a part the sheet does not hold under its heading, such as one the user renamed, is named as missing", () => {
  const brief = productBrief(product().replace("## What it is for", "## What it's for"));
  assert.deepEqual(brief.missing, ["What it is for"]);
  assert.deepEqual(brief.parts.map((p) => p.part), ["The main loop"]);
});

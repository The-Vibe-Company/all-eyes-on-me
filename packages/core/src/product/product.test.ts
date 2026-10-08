import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeProduct, validateProduct } from "./index.js";

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
  const unsourced = product().replace(/### See my orders\nWhy: a visitor wants it\. \(seen: \/\)/, "### See my orders\nWhy: a visitor wants it.");
  assert.match(validateProduct(unsourced).join("\n"), /journey "See my orders" does not say where it comes from/);
});

test("a first run writes the proposal as it is", () => {
  const result = mergeProduct({ proposed: product() });
  assert.equal(result.text, product());
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

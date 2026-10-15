import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeProduct, platformOf, productBrief, validateProduct, withPlatform } from "./index.js";

const journey = (name: string, source = "(seen: /)") => `### ${name}\nWhy: a visitor wants it. ${source}\n1. Open \`/\`.\n2. Click "${name}".\n`;

const product = ({ kind = "`tool`: an online shop. (seen: /)", purpose = "A shop that sells mugs. (seen: /)", who = "People buying a gift. (to confirm)", used = "`both`: a shop people open on their phone and their computer. (seen: README.md)", world = "", journeys = ["See the products", "See my orders", "Contact the shop"] } = {}) =>
  `# Super boutique\n\n## What kind of product\n${kind}\n\n## What it is for\n${purpose}\n\n## Who uses it\n${who}\n\n${used === null ? "" : `## Where it is used\n${used}\n\n`}## The main loop\nBrowse, order, check the order. (seen: /produits, /commandes)\n\n${world}## Key journeys\n\n${journeys.map((j) => journey(j)).join("\n")}`;

/** The four parts a game's sheet adds, each with what AEOM read. */
const WORLD = [
  "## Genre and fiction\nA persistent strategy game on a wild planet, where tamed beasts take the place of spaceships. (seen: README.md)",
  "## The feeling it aims for\nThe pride of a tribe chief coming back to see what the beasts brought home. (seen: docs/ordre-d-attaque.md) A cosy evening by the fire. (to confirm)",
  "## References\nPainted illustrations between Clash Royale and Hearthstone. (seen: README.md) Also like Ogame. (to confirm)",
  "## Visual assets\n- `public/illustrations/especes/`: warm painted beasts, heroic and cute, in golden light. (seen: public/illustrations/especes/souris.webp)\n- The logo: a flat ink wolf head on lemon. (seen: src/components/Logo.tsx)",
].join("\n\n") + "\n\n";

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
  assert.deepEqual(result.added, ["Super boutique", "What kind of product", "What it is for", "Who uses it", "Where it is used", "The main loop", "Key journeys", 'journey "See the products"', 'journey "See my orders"', 'journey "Contact the shop"']);
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

test("a sheet says what kind of product the app is, a tool, a game or a creative product, from what AEOM saw", () => {
  assert.match(validateProduct(product().replace(/## What kind of product\n.*\n\n/, "")).join("\n"), /missing "What kind of product"/);
  assert.match(validateProduct(product({ kind: "An online shop. (seen: /)" })).join("\n"), /"What kind of product" starts with `tool`, `game` or `creative`/);
  assert.match(validateProduct(product({ kind: "`tool`: an online shop." })).join("\n"), /"What kind of product" does not say where it comes from/);
  assert.match(validateProduct(product({ kind: "`game`: a strategy game. (to confirm)" })).join("\n"), /"What kind of product" is never a guess/);
});

test("a game's sheet adds its genre and fiction, the feeling it aims for, its references and its visual assets; a tool's does not need them", () => {
  const game = product({ kind: "`game`: a strategy game in the browser. (seen: README.md)", world: WORLD });
  assert.deepEqual(validateProduct(game), []);
  const bare = validateProduct(product({ kind: "`game`: a strategy game in the browser. (seen: README.md)" })).join("\n");
  for (const part of ["Genre and fiction", "The feeling it aims for", "References", "Visual assets"]) assert.match(bare, new RegExp(`missing "${part}": a game's sheet says it`));
  assert.match(validateProduct(product({ kind: "`creative`: a label's catalogue. (seen: /)" })).join("\n"), /missing "Visual assets": a creative product's sheet says it/);
  assert.match(validateProduct(product({ kind: "`game`: a game. (seen: /)", world: WORLD.replace("(seen: README.md)\n", "\n") })).join("\n"), /"Genre and fiction" does not say where it comes from/);
  assert.deepEqual(validateProduct(product({ world: WORLD })), [], "a tool may describe its assets too");
});

test("the brief of a game gives its kind and its world, and leaves out the references and feelings to confirm", () => {
  const brief = productBrief(product({ kind: "`game`: a strategy game in the browser. (seen: README.md)", world: WORLD }));
  assert.equal(brief.kind, "game");
  assert.deepEqual(brief.parts.map((p) => p.part), ["What it is for", "The main loop", "Genre and fiction", "The feeling it aims for", "References", "Visual assets"]);
  assert.equal(brief.parts.find((p) => p.part === "References")!.text, "Painted illustrations between Clash Royale and Hearthstone.");
  assert.match(brief.parts.find((p) => p.part === "Visual assets")!.text, /^`public\/illustrations\/especes\/`: warm painted beasts.* The logo: a flat ink wolf head on lemon\.$/);
  assert.ok(brief.unconfirmed.includes("References: Also like Ogame."));
  assert.ok(brief.unconfirmed.includes("The feeling it aims for: A cosy evening by the fire."));
  assert.deepEqual(productBrief(product({ kind: "`game`: a game. (seen: /)", world: WORLD.replace("## References", "## Refs") })).missing, ["References"]);
});

test("a sheet written before AEOM said the kind is read as a tool's brief, and the next run adds the kind", () => {
  const old = product().replace(/## What kind of product\n.*\n\n/, "");
  const brief = productBrief(old);
  assert.equal(brief.kind, null);
  assert.deepEqual(brief.missing, []);
  const result = mergeProduct({ base: old, current: old, proposed: product() });
  assert.deepEqual(result.added, ["What kind of product"]);
  assert.match(result.text, /^# Super boutique\n\n## What kind of product\n/, "the kind comes first, under the app's name");
  assert.deepEqual(validateProduct(product({ kind: "`tool`: an online shop. (seen:/)" })), [], "a source without a space is a source");
  assert.deepEqual(validateProduct(result.text), []);
  assert.equal(productBrief(product()).kind, "tool");
});

test("a sheet says where the front is used, mobile, desktop or both, from what the project says, or as a guess to confirm", () => {
  assert.deepEqual(validateProduct(product({ used: "`desktop`: the web is for the morning sort; an iOS app serves the phone. (seen: docs/PRD.md)" })), []);
  assert.deepEqual(validateProduct(product({ used: "`both`: nothing says where it is used. (to confirm)" })), [], "a guess, for the user to answer");
  assert.match(validateProduct(product({ used: null as unknown as string })).join("\n"), /missing "Where it is used": say whether the front is used on `mobile`, `desktop` or `both`/);
  assert.match(validateProduct(product({ used: "On a computer. (seen: README.md)" })).join("\n"), /"Where it is used" starts with `mobile`, `desktop` or `both`, in backticks/);
  assert.match(validateProduct(product({ used: "`desktop`: a back office." })).join("\n"), /"Where it is used" does not say where it comes from/);
});

test("the platform the sheet says gives the widths to judge at, only when it was seen", () => {
  assert.deepEqual(platformOf(product({ used: "`desktop`: the web is for the morning sort. (seen: docs/PRD.md)" })), { platform: "desktop", widths: [1280], seen: true, source: "docs/PRD.md" });
  assert.deepEqual(platformOf(product({ used: "`mobile`: a phone app in the browser. (seen: Antoine)" })), { platform: "mobile", widths: [390], seen: true, source: "Antoine" });
  assert.deepEqual(platformOf(product({ used: "`both`: a guess. (to confirm)" })), { platform: "both", widths: [390, 1280], seen: false, source: null });
  assert.equal(platformOf(product({ used: null as unknown as string })), null, "a sheet written before AEOM said it");
});

test("the user's answer goes in a sheet written before AEOM said where the front is used, before the journeys, and the sheet stays whole", () => {
  const old = product({ used: null as unknown as string });
  const answered = withPlatform(old, "desktop", "Antoine");
  assert.deepEqual(validateProduct(answered), []);
  assert.match(answered, /## The main loop[\s\S]*## Where it is used\n`desktop`: Antoine said so\. \(seen: Antoine\)\n\n## Key journeys/);
  assert.equal(platformOf(answered)?.seen, true);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { headerDifference, readStandard, reviewCode, screensTouched } from "./index.js";

const STANDARD = `# The standard of Super boutique
What the front holds to.

## Direction
nuancier: the swatch book.

## Tokens
- \`--petrole: #1f4b57\` in \`shared/kit.css\`: actions
- \`--papier: #F6F1E7\` in \`shared/kit.css\`
- \`--texte: "Literata", Georgia, serif\` in \`shared/kit.css\`
- \`--espace: 16px\` in \`shared/kit.css\`
- \`--taille-titre: 28px\` in \`shared/kit.css\`

## Components
- \`.bouton\` in \`shared/kit.css\`: the one button
- \`Header\` in \`src/components/Header.tsx\`
- \`shared/champ.html\`

## Rules
- Only the main action is petrol.
`;

/** A unified diff with no context, as git diff -U0 prints it. */
const diff = (file: string, start: number, lines: string[]) => `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -0,0 +${start},${lines.length} @@\n${lines.map((l) => `+${l}`).join("\n")}\n`;

test("the standard is read as its tokens and its components, each with its file", () => {
  const standard = readStandard(STANDARD);
  assert.deepEqual(standard.tokens.map((t) => [t.name, t.value, t.file]), [
    ["--petrole", "#1f4b57", "shared/kit.css"],
    ["--papier", "#F6F1E7", "shared/kit.css"],
    ["--texte", '"Literata", Georgia, serif', "shared/kit.css"],
    ["--espace", "16px", "shared/kit.css"],
    ["--taille-titre", "28px", "shared/kit.css"],
  ]);
  assert.deepEqual(standard.components.map((c) => [c.name, c.file]), [[".bouton", "shared/kit.css"], ["Header", "src/components/Header.tsx"], [null, "shared/champ.html"]]);
});

test("a colour, a font, a size or a space written in hard outside the tokens is named, with its file and line; a token's value written in hard says which token", () => {
  const standard = readStandard(STANDARD);
  const found = reviewCode({
    standard,
    diff: [
      diff("src/export/ExportButton.tsx", 14, [`<div style={{ color: "#7c3aed", background: "#1F4B57" }}>`]),
      diff("pages/export.css", 3, [".titre { font-family: Inter, sans-serif; font-size: 31px; margin: 16px 12px; }", ".ok { color: var(--petrole); padding: 0; font-size: var(--taille-titre); }"]),
      diff("shared/kit.css", 40, ["--nouveau: #ff0000;"]),
    ].join(""),
  });
  assert.deepEqual(found.map((f) => `${f.file}:${f.line} ${f.what}`), [
    "src/export/ExportButton.tsx:14 #7c3aed is not a colour of the standard",
    "src/export/ExportButton.tsx:14 #1F4B57 is --petrole written in hard: use the token",
    "pages/export.css:3 the font Inter is not a font of the standard",
    "pages/export.css:3 the size 31px is not a size of the standard",
    "pages/export.css:3 the space 16px is --espace written in hard: use the token",
    "pages/export.css:3 the space 12px is not a space of the standard",
  ]);
});

test("a button, a field or a header made by hand while the kit has one is named, with the component to use; one built with the kit is not", () => {
  const standard = readStandard(STANDARD);
  const found = reviewCode({
    standard,
    diff: [
      diff("src/export/ExportButton.tsx", 20, [`<button onClick={go}>Exporter</button>`, `<button className="bouton">Exporter</button>`]),
      diff("src/reports/layout.tsx", 8, [`<header className="top">Rapports</header>`, `<Header />`]),
      diff("pages/contact.html", 5, [`<input type="email" name="email">`]),
      diff("src/components/Header.tsx", 3, [`<header className="masthead">`]),
    ].join(""),
  });
  assert.deepEqual(found.map((f) => `${f.file}:${f.line} ${f.what}`), [
    "src/export/ExportButton.tsx:20 a button made by hand: the standard's is .bouton in shared/kit.css",
    "src/reports/layout.tsx:8 a header made by hand: the standard's is Header in src/components/Header.tsx",
    "pages/contact.html:5 a field made by hand: the standard's is shared/champ.html",
  ]);
});

test("the screens a change touches: a page by its route, anything else of the front every screen, a change of the back none", () => {
  const all = ["/", "/produits", "/produits/:id", "/contact"];
  assert.deepEqual(screensTouched(["app/(shop)/produits/[id]/page.tsx"], all), { routes: ["/produits/:id"], all: false });
  assert.deepEqual(screensTouched(["pages/contact.tsx", "front/index.html"], all), { routes: ["/contact", "/"], all: false });
  assert.deepEqual(screensTouched(["src/components/Header.tsx"], all), { routes: all, all: true });
  assert.deepEqual(screensTouched(["shared/kit.css"], all), { routes: all, all: true });
  assert.deepEqual(screensTouched(["server.mjs", "src/app/api/orders/route.ts", "README.md", "prisma/schema.prisma"], all), { routes: [], all: false });
});

test("a header that differs from the rest of the app says how, in its links", () => {
  assert.equal(headerDifference(["Accueil", "Produits", "Panier"], ["Accueil", "Produits", "Panier"]), null);
  assert.equal(headerDifference(["Accueil", "Exporter"], ["Accueil", "Produits"]), "no « Produits », « Exporter » the rest of the app does not have");
  assert.equal(headerDifference(null, ["Accueil"]), "no header, where the rest of the app has one");
  assert.equal(headerDifference(["Produits", "Accueil"], ["Accueil", "Produits"]), "the same links in another order");
});

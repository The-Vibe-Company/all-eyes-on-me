import assert from "node:assert/strict";
import { test } from "node:test";
import { headerDifference, readStandard, reviewCode, routeTouched, screensTouched } from "./index.js";

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
  assert.deepEqual(screensTouched(["app/(shop)/produits/[id]/page.tsx"], ["/", "/produits/12"]).routes, ["/produits/12"]);
  assert.deepEqual(screensTouched(["pages/contact.tsx"], all).routes, ["/contact"]);
  assert.deepEqual(screensTouched(["src/components/Header.tsx"], all), { routes: all, all: true, unmeasured: [], patterns: [] });
  assert.deepEqual(screensTouched(["shared/kit.css"], all), { routes: all, all: true, unmeasured: [], patterns: [] });
  assert.deepEqual(screensTouched(["server.mjs", "src/app/api/orders/route.ts", "README.md", "prisma/schema.prisma"], all), { routes: [], all: false, unmeasured: [], patterns: [] });
});

test("what is not the front's source is never read: the standard itself, docs, tests, stories, snapshots, configs, SVG files, JSON", () => {
  const standard = readStandard(STANDARD);
  const found = reviewCode({
    standard,
    diff: [
      diff(".aeom/standard.md", 9, ["- `--rouge: #ff0000` in `shared/kit.css`"]),
      diff("CHANGELOG.md", 3, ["- fixed #123, <button> in docs"]),
      diff("src/export/Export.test.tsx", 5, [`<button style={{ color: "#7c3aed" }}>`]),
      diff("src/export/Export.stories.tsx", 5, [`<button style={{ color: "#7c3aed" }}>`]),
      diff("tailwind.config.js", 5, [`brand: '#abcdef',`]),
      diff("public/icons/close.svg", 1, [`<path fill="#fff"/>`]),
      diff("package.json", 4, [`"color": "#7c3aed",`]),
    ].join(""),
  });
  assert.deepEqual(found, []);
});

test("a colour named through a token, a fallback, a comment, an anchor, an SVG fill or a link is no colour written in hard", () => {
  const standard = readStandard(STANDARD);
  const found = reviewCode({
    standard,
    diff: diff("src/ui/Badge.tsx", 1, [
      `const style = { color: "hsl(var(--primary))", background: "rgb(var(--c) / .5)", border: "1px solid var(--line, #ffffff)" };`,
      `/* the old #cafe was here */ // and #123 too`,
      `<a href="#top">Haut</a> <a href="/docs#cafe">Docs</a> <a href={"#" + id}>x</a>`,
      `<svg><path fill="#fff" stroke="#000"/></svg>`,
      `const colorFor = (paid) => paid ? "ok" : "ko";`,
    ]),
  });
  assert.deepEqual(found, []);
});

test("tokens are read as they are written: a quoted value, HSL channels; a length named for a size is never a font", () => {
  const tailwind = readStandard(`## Tokens\n- \`accent: '#c0392b'\` in \`tailwind.config.js\`\n- \`--primary: 222 47% 11%\` in \`app/globals.css\`\n- \`--font-size-lg: 18px\` in \`app/globals.css\`\n- \`--font-weight-bold: 700\` in \`app/globals.css\`\n- \`--goutiere: 32px\` in \`app/globals.css\`\n- \`--radius: 8px\` in \`app/globals.css\`\n\n## Components\n`);
  assert.equal(tailwind.tokens[0]!.value, "#c0392b");
  const found = reviewCode({
    standard: tailwind,
    diff: diff("app/orders/page.tsx", 1, [
      `<p style={{ color: "#C0392B", background: "hsl(222, 47%, 11%)" }}>`,
      `.x { font-family: Inter; font-size: 18px; margin: 32px; border-radius: 6px; }`,
      `<p style={{ fontFamily: inter.style.fontFamily }}>`,
    ]),
  });
  assert.deepEqual(found.map((f) => `${f.line} ${f.what}`), [
    "1 #C0392B is accent written in hard: use the token",
    "1 hsl(222, 47%, 11%) is --primary written in hard: use the token",
    "2 the size 18px is --font-size-lg written in hard: use the token",
    "2 the space 32px is --goutiere written in hard: use the token",
    "2 the radius 6px is not a radius of the standard",
  ]);
});

test("a component is made by hand only when the kit has that very part, outside the kit's own folder, with no class of the kit across its opening tag", () => {
  const standard = readStandard(`## Tokens\n\n## Components\n- \`Button\` in \`src/ui/button.tsx\`\n- \`CardHeader\` in \`src/ui/card.tsx\`\n- \`DropdownMenu\` in \`src/ui/dropdown.tsx\`\n- \`.bouton\` in \`shared/kit.css\`\n`);
  const read = (file: string) => (file === "src/pages/Article.tsx" ? `<article>\n<header>Titre</header>\n</article>\n` : null);
  const found = reviewCode({
    standard,
    read,
    diff: [
      diff("src/ui/button/index.tsx", 1, [`<button>`]),
      diff("src/pages/Article.tsx", 2, [`<header>Titre</header>`]),
      diff("src/pages/Nav.tsx", 1, [`<nav aria-label="breadcrumb">`]),
      diff("src/pages/Checkout.tsx", 1, [`<button`, `  className={cn("bouton", big && "big")}`, `>Payer</button>`, `<button class="x-bouton">Ok</button>`]),
    ].join(""),
  });
  assert.deepEqual(found.map((f) => `${f.file}:${f.line} ${f.what}`), [
    "src/pages/Checkout.tsx:4 a button made by hand: the standard's is Button in src/ui/button.tsx",
  ]);
});

test("a page with a parameter in its route is measured on a route of its shape the project knows, or not at all; a layout touches the screens under it; a deleted page none", () => {
  const known = ["/", "/blog", "/blog/premier-billet", "/compte/reglages"];
  assert.deepEqual(screensTouched(["app/blog/[slug]/page.tsx"], known, { samples: { "/blog/:slug": "/blog/premier-billet" } }).routes, ["/blog/premier-billet"]);
  const unknown = screensTouched(["app/produits/[id]/page.tsx"], known);
  assert.deepEqual(unknown.routes, []);
  assert.deepEqual(unknown.unmeasured, ["/produits/:id"]);
  assert.deepEqual(screensTouched(["app/compte/layout.tsx"], known).routes, ["/compte/reglages"]);
  assert.deepEqual(screensTouched(["pages/_app.tsx"], known).all, true);
  assert.deepEqual(screensTouched(["tailwind.config.js"], known).all, true);
  assert.deepEqual(screensTouched(["app/actions.ts", "app/lib/db.ts", "app/sitemap.ts", "src/ui/Button.test.tsx", "src/ui/Button.stories.tsx", "pages/404.tsx"], known), { routes: [], all: false, unmeasured: [], patterns: [] });
  assert.deepEqual(screensTouched(["templates/email/welcome.html"], known).all, true, "an HTML file outside a folder of pages is a template or a partial: every screen");
  assert.deepEqual(screensTouched(["front/docs/index.html", "front/voies.html"], [], { folder: "front" }).routes, ["/docs/", "/voies.html"]);
});

test("a header that differs from the rest of the app says how, in its links", () => {
  assert.equal(headerDifference(["Accueil", "Produits", "Panier"], ["Accueil", "Produits", "Panier"]), null);
  assert.equal(headerDifference(["Accueil", "Exporter"], ["Accueil", "Produits"]), "no « Produits », « Exporter » the rest of the app does not have");
  assert.equal(headerDifference(null, ["Accueil"]), "no header, where the rest of the app has one");
  assert.equal(headerDifference(["Produits", "Accueil"], ["Accueil", "Produits"]), "the same links in another order");
});

test("a path a journey visits is touched when it fits a touched route's pattern, whatever its slug, its query or the layout above it", () => {
  const touched = screensTouched(["app/blog/[slug]/page.tsx", "app/compte/layout.tsx", "pages/search.tsx"], ["/blog/premier-billet"]);
  assert.equal(routeTouched("/blog/un-autre-billet", touched), true);
  assert.equal(routeTouched("/compte/reglages/securite", touched), true);
  assert.equal(routeTouched("/search?q=lampe", touched), true);
  assert.equal(routeTouched("/panier", touched), false);
});

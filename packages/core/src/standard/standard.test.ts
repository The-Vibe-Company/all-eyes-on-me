import assert from "node:assert/strict";
import { test } from "node:test";
import { draftStandard, mergeStandard, standardProblems } from "./index.js";

const kit = `/* The kit: link shared/kit.css, include shared/header.html. */
:root {
  --encre: #1c2226; /* label ink */
  --petrole: #1f4b57;
  --police: "Archivo",
    sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root { --encre: #f4f1ea; }
}
.btn, .btn--ghost { color: var(--encre); }
.carte:hover, a:not(.btn) { outline: 0; }
@media (max-width: 600px) { .carte { padding: 8px; } }
`;
const files: Record<string, string> = {
  "shared/kit.css": kit,
  "shared/header.html": '<header class="entete"></header>',
  "src/theme.ts": "export const theme = {\n  accent: '#c0392b',\n};\n",
  "shared/tissus.css": ".tissu { --teinte: var(--petrole); }\n.tissu--petrole { --teinte: var(--petrole); }\n",
  "shared/twice.css": ":root { --fond: #fff; }\n:root { --fond: #fafafa; }\n",
  "shared/icons.css": ':root { --fleche: url("data:image/svg+xml,%3Csvg%3E%3C/svg%3E"); --accent: red !important; }\n',
};
const read = (path: string) => files[path] ?? null;
const draftOf = (names: string[], options = {}) => draftStandard(names.map((path) => ({ path, text: files[path]! })), options);

const standard = (rules = "- Buttons are petrol, nothing else is.") => `# The standard of Super Boutique

## Direction
nuancier, an upholsterer's swatch book. It serves the main loop: choose a piece, add it, follow it.

## Tokens
- \`--encre: #1c2226\` in \`shared/kit.css\`: label ink
- \`--petrole: #1f4b57\` in \`shared/kit.css\`
- \`accent: '#c0392b'\` in \`src/theme.ts\`

## Components
- \`.btn\` in \`shared/kit.css\`: the petrol button
- \`shared/header.html\`: the header every page includes

## Rules
${rules}
`;

test("the draft takes every token and every class from the code, with the file it lives in", () => {
  const draft = draftOf(["shared/kit.css", "shared/header.html"], { name: "Super Boutique" });
  assert.match(draft, /^# The standard of Super Boutique\n/);
  assert.match(draft, /^- `--encre: #1c2226` in `shared\/kit\.css`: label ink$/m, "a token keeps the comment that says what it is for");
  assert.match(draft, /^- `--encre: #f4f1ea` in `shared\/kit\.css`, under `@media \(prefers-color-scheme: dark\)`$/m);
  assert.match(draft, /^- `--police: "Archivo", sans-serif` in `shared\/kit\.css`$/m);
  for (const c of [".btn", ".btn--ghost", ".carte"]) assert.equal(draft.match(new RegExp(`^- \`\\${c}\` in \`shared/kit\\.css\`$`, "gm"))?.length, 1, `${c} once`);
  assert.match(draft, /^- `shared\/header\.html`$/m, "a shared file that is not a style sheet is a component of its own");
  assert.doesNotMatch(draft, /label ink.*\n.*label ink/, "the kit's own comment is not a token");
  assert.match(draft, /## Direction\n<[^>\n]+>\n/, "the direction is left for the coordinator to write");
  assert.deepEqual(standardProblems(draft, read).filter((p) => !/"(Direction|Rules)"/.test(p)), [], "everything the draft names is in the code");
  assert.match(standardProblems(draft, read).join("\n"), /"Direction" still holds a placeholder/);
});

test("the draft names the direction the knockout chose, with the sentence that drew it from the product", () => {
  const draft = draftOf(["shared/kit.css"], { direction: { champion: "nuancier", sentence: "Sert la boucle principale : choisir une pièce, l'ajouter, la suivre." } });
  assert.match(draft, /## Direction\nnuancier: Sert la boucle principale : choisir une pièce, l'ajouter, la suivre\.\n/);
});

test("a direction named without its sentence still has to be written", () => {
  const draft = draftOf(["shared/kit.css"], { direction: { champion: "nuancier", sentence: null } });
  assert.match(draft, /## Direction\nnuancier: <[^>\n]+>\n/);
  assert.match(standardProblems(draft, read).join("\n"), /"Direction" still holds a placeholder/);
});

test("the same token set under two rules is two lines, not one said twice", () => {
  const draft = draftOf(["shared/tissus.css"]);
  assert.match(draft, /^- `--teinte: var\(--petrole\)` in `shared\/tissus\.css`, under `\.tissu`$/m);
  assert.match(draft, /^- `--teinte: var\(--petrole\)` in `shared\/tissus\.css`, under `\.tissu--petrole`$/m);
  assert.doesNotMatch(standardProblems(draft, read).join("\n"), /more than once/);
});

test("a standard can be written only when everything in it is in the code, and it is words only", () => {
  assert.deepEqual(standardProblems(standard(), read), []);
  const problems = (text: string) => standardProblems(text, read).join("\n");
  assert.match(problems(standard().replace("#1f4b57", "#123456")), /`--petrole: #123456` is not in shared\/kit\.css/);
  assert.match(problems(standard().replace("'#c0392b'", "'#000000'")), /`accent: '#000000'` is not in src\/theme\.ts/);
  assert.match(problems(standard().replace(".btn` in", ".bouton` in")), /`\.bouton` is not a class of shared\/kit\.css/);
  assert.match(problems(standard().replace("shared/header.html`:", "shared/footer.html`:")), /shared\/footer\.html does not exist/);
  assert.match(problems(standard().replace("shared/kit.css`: label", "../../etc/passwd`: label")), /is outside the project/);
  assert.match(problems(standard().replace("- `--petrole: #1f4b57` in `shared/kit.css`", "- `--petrole` is petrol")), /`--petrole` is petrol.* a token, its value and its file/);
  for (const image of ["![the kit](kit.png)", '<img src="kit.png">', "[the capture](before/index@390.webp)", "data:image/png;base64,AAAA"]) {
    assert.match(problems(standard(`- See ${image}`)), /words only/, image);
  }
  assert.match(problems(standard().replace("## Tokens", "## Couleurs")), /missing "Tokens"/);
  assert.match(problems(standard().replace("label ink\n", "label ink\n- `--encre: #f4f1ea` in `shared/kit.css`\n")), /`--encre: #f4f1ea` is not set at the root of shared\/kit\.css/);
  assert.match(problems(standard().replace("label ink\n", "label ink\n- `--encre: #1c2226` in `shared/kit.css`, under `.nulle-part`\n")), /`--encre: #1c2226` is not set under `\.nulle-part` in shared\/kit\.css/);
  assert.deepEqual(problems(standard("- Every `<img>` has an alt text; no image is only decoration.")), "", "an element named in code is not an image");
  assert.match(problems(standard().replace("## Rules\n", "## Rules\n\n## Rules\n")), /"Rules" appears more than once/);
});

test("every line of the tokens and the components is one the code is checked against", () => {
  const problems = (text: string) => standardProblems(text, read).join("\n");
  for (const line of ["1. `--petrole: #000000` in `shared/kit.css`", "| `--petrole: #000000` | `shared/kit.css` |", "Colours: `--petrole: #000000` in `shared/kit.css`", "  `--petrole: #000000`"]) {
    assert.match(problems(standard().replace("## Components\n", `${line}\n\n## Components\n`)), /"Tokens" holds a line that is neither a token nor a ### heading/, line);
  }
  assert.deepEqual(problems(standard().replace("## Tokens\n", "## Tokens\n\n### Colours\n")), "", "a ### heading groups the tokens");
});

test("drafted tokens hold their own check, an inline image as a value or !important included", () => {
  const draft = draftOf(["shared/icons.css"]);
  assert.match(draft, /^- `--fleche: url\("data:image\/svg\+xml,%3Csvg%3E%3C\/svg%3E"\)` in `shared\/icons\.css`$/m);
  assert.match(draft, /^- `--accent: red` in `shared\/icons\.css`$/m);
  assert.deepEqual(standardProblems(draft, read).filter((p) => !/placeholder/.test(p)), []);
});

test("with no new direction, the draft keeps the direction of the last standard", () => {
  const draft = draftOf(["shared/kit.css"], { previous: standard() });
  assert.match(draft, /## Direction\nnuancier, an upholsterer's swatch book\. It serves the main loop: choose a piece, add it, follow it\.\n/);
  assert.match(draftOf(["shared/kit.css"], { previous: standard(), direction: { champion: "guichet", sentence: "Sert la commande." } }), /## Direction\nguichet: Sert la commande\.\n/);
  assert.match(draftOf(["shared/kit.css"], { previous: draftOf(["shared/kit.css"]) }), /## Direction\n<The direction kept/, "a placeholder is not carried over");
  assert.match(draftOf(["shared/kit.css"], { previous: standard(), direction: { champion: "nuancier", sentence: null } }), /## Direction\nnuancier, an upholsterer's swatch book\./, "the same champion without its sentence keeps what was written of it");
});

test("headings the user adds to group the tokens stay theirs, and leave the tokens AEOM's", () => {
  const base = standard();
  const current = standard().replace("## Tokens\n", "## Tokens\n\n### Colours\n");
  const merged = mergeStandard({ base, current, proposed: standard().replace("#1f4b57", "#224f5b") });
  assert.match(merged.text, /## Tokens\n\n### Colours\n- `--encre/);
  assert.deepEqual(merged.kept, ["### Colours"]);
  assert.deepEqual(merged.updated, ["`--petrole: #224f5b` in `shared/kit.css`"]);
});

test("a later run keeps what the user corrected by hand and says what it changed", () => {
  const base = standard();
  const current = standard("- Buttons are petrol, nothing else is.\n- Prices always end with a non-breaking space before €.").replace("label ink", "the ink of every label");
  const proposed = standard("- Buttons are petrol.")
    .replace("nuancier, an upholsterer's swatch book.", "nuancier, the swatch book.")
    .replace("- `--petrole: #1f4b57` in `shared/kit.css`\n", "- `--petrole: #1f4b57` in `shared/kit.css`\n- `--sauge: #8a9a7b` in `shared/kit.css`\n")
    .replace("- `accent: '#c0392b'` in `src/theme.ts`\n", "");
  const merged = mergeStandard({ base, current, proposed });
  assert.match(merged.text, /non-breaking space before €/, "the user's rule stays");
  assert.match(merged.text, /the ink of every label/, "the user's words on a token stay");
  assert.match(merged.text, /nuancier, the swatch book\./, "what the user left alone takes AEOM's new words");
  assert.match(merged.text, /`--petrole: #1f4b57` in `shared\/kit\.css`\n- `--sauge: #8a9a7b` in `shared\/kit\.css`\n\n## Components/, "a new token joins the others");
  assert.doesNotMatch(merged.text, /accent/, "a token AEOM no longer finds, which the user left alone, goes");
  assert.deepEqual(merged.kept, ["`--encre: #1c2226` in `shared/kit.css`", "Rules"]);
  assert.deepEqual(merged.updated, ["Direction"]);
  assert.deepEqual(merged.added, ["`--sauge: #8a9a7b` in `shared/kit.css`"]);
  assert.deepEqual(merged.removed, ["`accent: '#c0392b'` in `src/theme.ts`"]);
});

test("a token whose value the code changed is updated, unless the user wrote on it", () => {
  const base = standard();
  const proposed = standard().replace("#1f4b57", "#224f5b").replace("#1c2226", "#202628");
  const current = standard().replace("label ink", "the ink of every label");
  const merged = mergeStandard({ base, current, proposed });
  assert.match(merged.text, /`--petrole: #224f5b`/);
  assert.doesNotMatch(merged.text, /#1f4b57/);
  assert.deepEqual(merged.updated, ["`--petrole: #224f5b` in `shared/kit.css`"], "said with its new value");
  assert.deepEqual(merged.kept, ["`--encre: #1c2226` in `shared/kit.css`"], "the user's line stays as they wrote it, old value included: writing it then says the code no longer holds it");
  assert.deepEqual([merged.added, merged.removed], [[], []]);
});

test("a token set twice under the same rule is drafted once, with the value that wins", () => {
  const draft = draftOf(["shared/twice.css"]);
  assert.doesNotMatch(draft, /--fond: #fff`/);
  assert.match(draft, /^- `--fond: #fafafa` in `shared\/twice\.css`$/m);
});

test("a token the user took out stays out, and one they added stays", () => {
  const base = standard();
  const current = standard().replace("- `--petrole: #1f4b57` in `shared/kit.css`\n", "").replace("## Components\n", "## Components\n- `.carte` in `shared/kit.css`: a product card\n");
  const merged = mergeStandard({ base, current, proposed: standard() });
  assert.doesNotMatch(merged.text, /--petrole/);
  assert.match(merged.text, /`\.carte` in `shared\/kit\.css`: a product card/);
  assert.deepEqual([merged.kept, merged.updated, merged.added, merged.removed], [["`.carte` in `shared/kit.css`"], [], [], []]);
});

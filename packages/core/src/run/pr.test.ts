import assert from "node:assert/strict";
import { test } from "node:test";
import { prBody, type ResultPage } from "./index.js";

const page: ResultPage = {
  run: "run-1",
  verdict: { nothingToRedo: false, line: "Measured: 2 screens at 390, 1280 px.", failures: [] },
  direction: { champion: "tissus", sentence: "Sert la boucle principale.", entrants: ["tissus", "plaid"], reasons: ["Made for this shop."], sheet: "directions/sheet.png" },
  screens: [
    { page: "/", status: "kept", count: { before: 10, after: 1 }, widths: [{ width: 390, before: "before/captures/index@390.png", after: "end/captures/index@390.png" }], cleared: ["grid"], still: ["not-generic"], newly: [] },
    { page: "/contact", status: "sent back", count: { before: 8, after: 8 }, back: { verdict: "same", before: 8, after: 8 }, widths: [], cleared: [], still: ["states"], newly: [] },
    { page: "/produits", status: "sent back", count: { before: 6, after: 6 }, back: { verdict: "worse", before: 6, after: 9 }, widths: [], cleared: [], still: [], newly: [] },
    { page: "/aide", status: "does not load", count: null, widths: [], cleared: [], still: [], newly: [] },
  ],
  journeys: [{ slug: "orders", name: "See my orders", status: "kept", why: "3/3 prefer the new one: one click.", broke: { before: null, after: null }, steps: { before: 4, after: 3 }, widths: [], cleared: ["short"], remaining: [] }],
  stillFailing: [{ kind: "principle", where: "/contact", what: "states: the list is blank" }],
  measuredAfter: true,
  features: { entries: [{ slug: "add", name: "Add a product", step: 2, capture: "journeys-end/add@1280-02.png", why: "Ajouter adds nothing.", missing: "A way to put a product in the order." }], more: 0 },
};

test("the PR says in words what the run kept, sent back and could not do, and where the result page is, with no capture", () => {
  const { title, body } = prBody(page, ".aeom/runs/run-1/report.html");
  assert.equal(title, "AEOM: a new direction, tissus (run-1)");
  for (const words of [/tissus/, /Sert la boucle principale\./, /Made for this shop\./, /`\/` kept: 10 → 1 failing/, /`\/aide` does not load/, /See my orders.*kept.*4 → 3 steps/, /one click/, /Add a product.*step 2.*A way to put a product in the order\./, /states: the list is blank/, /`\.aeom\/runs\/run-1\/report\.html`/])
    assert.match(body, words);
  assert.doesNotMatch(body, /\.png|!\[|<img/, "no capture, no image");
});

test("a screen sent back says why: the same as before or worse, with its counts", () => {
  const { body } = prBody(page, ".aeom/runs/run-1/report.html");
  assert.match(body, /`\/contact` sent back, the same as before: 8 → 8 failing\./);
  assert.match(body, /`\/produits` sent back, worse than before: 6 → 9 failing\./);
});

test("a run that kept the style says so in its title", () => {
  const { title, body } = prBody({ ...page, direction: null, verdict: { ...page.verdict!, keepStyle: true } }, ".aeom/runs/run-1/report.html");
  assert.equal(title, "AEOM: the front fixed, its style kept (run-1)");
  assert.match(body, /Style kept/);
});

test("what the judges and the run wrote stays words: no image, no link, no HTML, no heading, no one notified", () => {
  const trap = "See ![x](https://e.example/t.png) <img src=x> and [here](https://e.example), cc @octocat | a \\*b*\n## Approved";
  const { body } = prBody(
    {
      ...page,
      direction: { ...page.direction!, sentence: trap, reasons: [trap] },
      screens: [{ ...page.screens[0]!, page: "/a`b``c" }],
      journeys: [{ ...page.journeys[0]!, why: trap, broke: { before: `it broke at step 2: ${trap}`, after: null } }],
      features: { entries: [{ ...page.features!.entries[0]!, missing: trap }], more: 0 },
      stillFailing: [{ kind: "principle", where: "/a`b``c", what: `grid: ${trap}` }],
    },
    ".aeom/runs/run-1/report.html",
  );
  assert.doesNotMatch(body, /(?<!\\)!(?<!\\)\[/, "no image");
  assert.doesNotMatch(body, /(?<!\\)\[here(?<!\\)\]/, "no link");
  assert.doesNotMatch(body, /(?<!\\)<img/, "no HTML");
  assert.doesNotMatch(body, /(?<!\\)\|/, "no table");
  assert.ok(body.includes("\\\\\\*b\\*"), "a backslash of the run escapes nothing");
  assert.doesNotMatch(body, /^\s*(>\s*)?#+ Approved/m, "no heading of its own");
  assert.doesNotMatch(body, /@octocat/, "no one notified");
  assert.match(body, /@\u200Boctocat/);
  assert.match(body, /```\/a`b``c```/, "a path keeps its backticks inside a longer fence");
  for (const line of body.split("\n").filter((l) => l.includes("octocat"))) assert.match(line, /^(- |> |\*\*)/, "each text on its own line");
});

/** A run of 40 pages, each failing 8 principles, with reasons of `size` characters. */
function huge(size: number): ResultPage {
  const principles = ["grid", "hierarchy", "density", "states", "one-direction", "consistent-chrome", "not-generic", "not-ai-default"];
  const pages = Array.from({ length: 40 }, (_, i) => `/page-${i}`);
  return {
    ...page,
    screens: pages.map((p) => ({ page: p, status: "sent back", count: { before: 8, after: 8 }, back: { verdict: "same", before: 8, after: 8 }, widths: [], cleared: [], still: principles, newly: [] })),
    journeys: Array.from({ length: 45 }, (_, i) => ({ ...page.journeys[0]!, slug: `j${i}`, name: `Journey ${i}`, status: "sent back" as const })),
    stillFailing: pages.flatMap((p) => principles.map((pr) => ({ kind: "principle" as const, where: p, what: `${pr}: ${"the edges disagree ".repeat(size / 19)}` }))),
  };
}

test("a long run's PR names 40 entries a section, then sends to the result page for the rest", () => {
  const { body } = prBody(huge(200), ".aeom/runs/run-1/report.html");
  assert.ok(body.length < 60_000, `${body.length} characters`);
  assert.match(body, /`\/page-39` sent back/);
  assert.match(body, /- …and 5 more, see the result page\./, "journeys past 40");
  assert.match(body, /- …and 280 more, see the result page\./, "still failing past 40");
  assert.equal(body.split("\n").filter((l) => l.startsWith("- `/page-")).length, 80);
});

test("a PR whose entries are too long is cut under 60,000 characters, between two lines, and says where the rest is", () => {
  const { body } = prBody(huge(3000), ".aeom/runs/run-1/report.html");
  assert.ok(body.length < 60_000, `${body.length} characters`);
  assert.match(body, /…cut here: the rest is on the result page, `\.aeom\/runs\/run-1\/report\.html`\.\n\n---\nOpened by All Eyes On Me/);
  assert.ok(body.split("\n").every((l) => !l.startsWith("- `/page-") || /(\.|disagree)$/.test(l)), "no line cut in the middle");
});

test("a direction the person chose over the judges' champion says so, with their words", () => {
  const chosen = { ...page, direction: { ...page.direction!, champion: "plaid", reasons: [], decision: { judges: "tissus", dropped: ["tissus"], why: "Le plaid prolonge les photos de la boutique." } } };
  const { title, body } = prBody(chosen, ".aeom/runs/run-1/report.html");
  assert.equal(title, "AEOM: a new direction, plaid (run-1)");
  assert.match(body, /\*\*plaid\*\*, chosen by the person; the judges' knockout among tissus, plaid had picked tissus\./);
  assert.match(body, /> Le plaid prolonge les photos de la boutique\./);
  const validated = prBody({ ...page, direction: { ...page.direction!, decision: { judges: "tissus", dropped: [] } } }, "r.html").body;
  assert.match(validated, /\*\*tissus\*\*, chosen by knockout among tissus, plaid, and validated by the person\./);
  const alone = prBody({ ...page, direction: { ...page.direction!, champion: "plaid", reasons: [], decision: { judges: null, dropped: [] } } }, "r.html").body;
  assert.match(alone, /\*\*plaid\*\*, chosen by the person among tissus, plaid, with no knockout\./);
});

test("a run that built a front from nothing says so: its title, its screens and journeys built, and that its data are fake", () => {
  const built: ResultPage = { ...page, built: true, verdict: null, direction: { champion: "voies", sentence: null, entrants: ["voies", "craie"], reasons: [], sheet: null, decision: { judges: null, dropped: [] } }, screens: [{ page: "/", status: "new", count: null, widths: [], cleared: [], still: [], newly: [] }], journeys: [{ slug: "log", name: "Log a climb", status: "new", why: null, broke: { before: null, after: null }, steps: { before: null, after: 3 }, widths: [], cleared: [], remaining: [] }], stillFailing: [], measuredAfter: true };
  const { title, body } = prBody(built, ".aeom/runs/run-1/report.html");
  assert.equal(title, "AEOM: a first front, on voies (run-1)");
  assert.match(body, /## Built from scratch\n\nEvery screen runs on fake data, kept in one module and named as such, until an API replaces it\./);
  assert.doesNotMatch(body, /Not measured after the run/);
});

test("a run that built what was asked says the request, what AEOM said it would build, the screens it changed, and the review of the standard", () => {
  const asked: ResultPage = {
    ...page,
    verdict: null,
    direction: null,
    asked: { request: "Un filtre par niveau sur la liste des voies", plan: "Sur /voies.html, un filtre par niveau avec les puces du kit.", review: { passed: true, verdict: "Nothing outside the standard.", lines: ["✓ Trouver une voie still reaches its end"] } },
    screens: [{ page: "/voies.html", status: "changed", count: { before: 1, after: 0 }, widths: [], cleared: ["cursor@1280"], still: [], newly: [] }],
    journeys: [],
    stillFailing: [],
    features: null,
  };
  const { title, body } = prBody(asked, ".aeom/runs/run-3/report.html");
  assert.equal(title, "AEOM: Un filtre par niveau sur la liste des voies (run-1)");
  assert.match(body, /## Asked\n\nUn filtre par niveau sur la liste des voies\n\nSur \/voies\.html, un filtre par niveau avec les puces du kit\./);
  assert.match(body, /`\/voies\.html` changed: 1 → 0 failing\./);
  assert.match(body, /## Review of the standard\n\n\*\*Nothing outside the standard\.\*\*\n\n- ✓ Trouver une voie still reaches its end/);
  assert.doesNotMatch(body, /## Still failing|Not measured after the run/, "the review is what an asked run measures");
  // A journey the build broke says so, even if its status is the one of a run with no duel.
  const broken = prBody({ ...asked, journeys: [{ slug: "find", name: "Trouver une voie", status: "unchanged", why: null, broke: { before: null, after: "it broke at step 2: no button Filtrer" }, steps: { before: 3, after: 2 }, widths: [], cleared: [], remaining: [] }] }, "r.html").body;
  assert.match(broken, /\*\*Trouver une voie\*\* unchanged, 3 → 2 steps\. At the end, it broke at step 2: no button Filtrer\./);
  const unreviewed = prBody({ ...asked, asked: { ...asked.asked!, review: null } }, "r.html").body;
  assert.match(unreviewed, /## Review of the standard\n\nNot reviewed against the standard yet\./);
});

test("a front built on its API says so, and a front plugged into its API later says the screens did not change", () => {
  const base: ResultPage = { ...page, built: true, verdict: null, direction: { champion: "voies", sentence: null, entrants: ["voies"], reasons: [], sheet: null, decision: { judges: null, dropped: [] } }, screens: [], journeys: [], stillFailing: [], measuredAfter: true };
  const onApi = prBody({ ...base, api: "http://localhost:8000/v1" }, "r.html");
  assert.match(onApi.body, /## Built from scratch\n\nEvery screen reads its data from the API given, `http:\/\/localhost:8000\/v1`, running on the machine that ran it; what it does not provide yet stays fake, in one module, listed in `front\/data\.md`\./);
  assert.doesNotMatch(onApi.body, /Every screen runs on fake data/);
  const replug = prBody({ ...base, direction: null, api: "http://localhost:8000/v1", replug: true }, "r.html");
  assert.equal(replug.title, "AEOM: the front plugged into its API (run-1)");
  assert.match(replug.body, /## Plugged into its API\n\nThe screens did not change: the data module now reads `http:\/\/localhost:8000\/v1`; what it does not provide yet stays fake, listed in `front\/data\.md`\./);
});

test("the PR speaks the person's language: in French, its title, its headings, its sentences and what was measured", () => {
  const measured = { ...page, verdict: { ...page.verdict!, line: "Measured: 4 screens at 390, 1280 px, 27 checks and 8 principles each; 1 journey on 6 principles." }, features: { ...page.features!, more: 2 } };
  const { title, body } = prBody(measured, ".aeom/runs/run-1/report.html", "fr");
  assert.equal(title, "AEOM : une nouvelle direction, tissus (run-1)");
  for (const words of [
    /^Ce qu'All Eyes On Me a fait sur ce run, en mots\. Les captures restent sur la machine qui l'a lancé, comme la page de résultat : `\.aeom\/runs\/run-1\/report\.html`, depuis la racine du dépôt\./,
    /\*\*Avant le run\.\*\* Mesuré : 4 écrans à 390, 1280 px, 27 contrôles et 8 principes chacun ; 1 parcours sur 6 principes\./,
    /\*\*tissus\*\*, choisie par élimination parmi tissus, plaid\. Sert la boucle principale\./,
    /## Écrans/,
    /`\/` gardé : 10 → 1 en échec\. Réglé : grid\. Encore en échec : not-generic\./,
    /`\/contact` renvoyé, pareil qu'avant : 8 → 8 en échec\./,
    /`\/produits` renvoyé, moins bien qu'avant : 6 → 9 en échec\./,
    /`\/aide` ne charge pas\./,
    /## Parcours\n\n- \*\*See my orders\*\* amélioré, 4 → 3 étapes\./,
    /## Fonctions manquantes\n\nCe qu'il faudrait à un parcours clé pour aller au bout\. AEOM n'en a rien construit\./,
    /\*\*Add a product\*\*, bloque à l'étape 2 : A way to put a product in the order\./,
    /- 2 autres parcours bloqués, non nommés\./,
    /## Encore en échec\n\n- `\/contact` states: the list is blank/,
    /Ouverte par All Eyes On Me\. Elle suit les règles de ce dépôt : AEOM ne merge rien\.$/,
  ])
    assert.match(body, words);
  assert.doesNotMatch(body, /\b(kept|sent back|failing|Screens|Journeys|Still failing|Before the run|chosen by|Missing features)\b/, "no word of the English frame");
  assert.deepEqual(prBody(page, ".aeom/runs/run-1/report.html", "en"), prBody(page, ".aeom/runs/run-1/report.html"), "English stays the default");
  assert.match(prBody(page, ".aeom/runs/run-1/report.html", "fr").body, /\*\*Avant le run\.\*\* Measured: 2 screens at 390, 1280 px\./, "a line AEOM does not know stays as written");
});

test("each missing feature says in the PR whether the front alone builds it, with its command, or what the back would have to provide", () => {
  const feature = { step: 2, capture: null, why: "Ajouter adds nothing." };
  const named: ResultPage = {
    ...page,
    features: {
      entries: [
        { ...feature, slug: "add", name: "Add a product", missing: "A way to put a product in the order.", needs: "front" },
        { ...feature, slug: "pay", name: "Pay", step: 3, missing: "A way to pay.", needs: "back", back: "A payment route." },
      ],
      more: 0,
    },
  };
  const { body } = prBody(named, "r.html");
  assert.match(body, /- \*\*Add a product\*\*, blocks at step 2: A way to put a product in the order\. Front only: `\/aeom build "A way to put a product in the order\." --journey add`/);
  assert.match(body, /- \*\*Pay\*\*, blocks at step 3: A way to pay\. Needs the back too: A payment route\./);
  const fr = prBody(named, "r.html", "fr").body;
  assert.match(fr, /A way to put a product in the order\. Seulement du front : `\/aeom build "A way to put a product in the order\." --journey add`/);
  assert.match(fr, /A way to pay\. Demande aussi du back : A payment route\./);
});

test("an asked run's PR lists what the branch brought, and counts apart what was already there before it", () => {
  const asked: ResultPage = { ...page, verdict: null, direction: null, features: null, journeys: [], stillFailing: [], screens: [], asked: { request: "Une recherche", plan: null, review: { passed: false, verdict: "4 things outside the standard.", lines: ["public/factures.html:34 a colour written in hard"], already: ["/factures finish: no skip link", "/factures contrast: .sub"] } } };
  const { body } = prBody(asked, "r.html");
  assert.match(body, /- public\/factures\.html:34 a colour written in hard\n\n2 more were already there before this run: see the result page\./);
  assert.doesNotMatch(body, /no skip link/, "what was already there is counted, not listed");
  assert.match(prBody(asked, "r.html", "fr").body, /2 autres étaient déjà là avant ce run : voir la page de résultat\./);
  // Nothing the branch brought: the PR says so, rather than « more » after nothing.
  const none = prBody({ ...asked, asked: { ...asked.asked!, review: { ...asked.asked!.review!, lines: ["✓ See my orders still reaches its end"], unmeasured: ["/clients finish: no skip link"] } } }, "r.html").body;
  assert.match(none, /All 2 were already there before this run: the branch brought none\./);
  assert.match(none, /1 on a screen this run did not measure before: whether it was there is not known, see the result page\./);
  assert.match(prBody({ ...asked, asked: { ...asked.asked!, review: { ...asked.asked!.review!, lines: [] } } }, "r.html", "fr").body, /Les 2 étaient déjà là avant ce run : la branche n'en a apporté aucun\./);
});

test("in French, every kind of run has its own title and its own words", () => {
  const fr = (p: ResultPage) => prBody(p, ".aeom/runs/run-1/report.html", "fr");
  const kept = fr({ ...page, direction: null, verdict: { ...page.verdict!, keepStyle: true } });
  assert.equal(kept.title, "AEOM : le front corrigé, son style gardé (run-1)");
  assert.match(kept.body, /## Style gardé\n\nPas de nouvelle direction : le run a corrigé ce qui échouait, dans le style de l'app\./);
  assert.equal(fr({ ...page, direction: null }).title, "AEOM : le front corrigé (run-1)");
  const built = fr({ ...page, built: true, direction: null, verdict: null });
  assert.equal(built.title, "AEOM : un premier front (run-1)");
  assert.match(built.body, /## Construit de zéro\n\nChaque écran tourne sur des données fictives/);
  const replug = fr({ ...page, built: true, replug: true, api: "http://localhost:4000", direction: null, verdict: null });
  assert.equal(replug.title, "AEOM : le front branché sur son API (run-1)");
  assert.match(replug.body, /## Branché sur son API\n\nLes écrans n'ont pas changé : le module de données lit maintenant `http:\/\/localhost:4000`/);
  const lost = fr({ ...page, screens: [{ ...page.screens[1]!, back: { verdict: "worse", before: 8, after: 8, lost: ['link "Contact"'] } }] });
  assert.match(lost.body, /`\/contact` renvoyé : il a perdu ce qu'il permettait de faire\. Perdu : link "Contact"\./);
  const person = fr({ ...page, direction: { ...page.direction!, decision: { judges: "plaid", dropped: [] } } });
  assert.match(person.body, /choisie par la personne ; l'élimination des juges parmi tissus, plaid avait retenu plaid\./);
  const unmeasured = fr({ ...page, measuredAfter: false, stillFailing: [] });
  assert.match(unmeasured.body, /Pas mesuré après le run : ce qui échouait avant lui\./);
  assert.match(fr({ ...page, stillFailing: [] }).body, /## Encore en échec\n\nRien\./);
  const asked = fr({ ...page, direction: null, asked: { request: "Un filtre par niveau sur la liste des voies", plan: null, review: null }, journeys: [{ ...page.journeys[0]!, broke: { before: "it broke at step 2: the button does nothing", after: "it broke at step 3: no field" } }] });
  assert.equal(asked.title, "AEOM : Un filtre par niveau sur la liste des voies (run-1)");
  assert.match(asked.body, /## Demandé\n\nUn filtre par niveau sur la liste des voies/);
  assert.match(asked.body, /Avant le run, il s'est arrêté à l'étape 2 : the button does nothing\. À la fin, il s'est arrêté à l'étape 3 : no field\./);
  assert.match(asked.body, /## Relecture du standard\n\nPas encore relu au regard du standard\./);
  const reviewed = fr({ ...page, direction: null, asked: { request: "Un filtre", plan: null, review: { verdict: "2 things outside the standard.", lines: [], passed: false } as never }, screens: [{ ...page.screens[0]!, status: "changed", count: { before: 1, after: 0 } }] });
  assert.match(reviewed.body, /\*\*2 choses hors du standard\.\*\*/);
  assert.match(reviewed.body, /`\/` modifié : 1 → 0 en échec\./);
  assert.match(fr({ ...page, stillFailing: [{ kind: "page", where: "/aide", what: "did not load before the run, and was not measured after the run" } as never] }).body, /`\/aide` ne chargeait pas avant le run, et n'a pas été mesurée après/);
  assert.match(fr({ ...page, verdict: { ...page.verdict!, line: "Measured: 1 screen at 1280 px, 1 check and 1 principle each." } }).body, /Mesuré : 1 écran à 1280 px, 1 contrôle et 1 principe chacun\./);
  const many = fr({ ...page, stillFailing: Array.from({ length: 45 }, (_, i) => ({ kind: "principle", where: `/p${i}`, what: "grid" }) as never) });
  assert.match(many.body, /- …et 5 de plus, sur la page de résultat\./);
});

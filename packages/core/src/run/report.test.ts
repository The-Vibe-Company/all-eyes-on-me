import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { pageVerdicts, readRun, resultHtml, type ResultPage } from "./index.js";

const screen = (page: string, status: ResultPage["screens"][number]["status"]) => ({ page, status, count: null, widths: [], cleared: [], still: [], newly: [] });
const PAGE: ResultPage = {
  run: "run-1",
  verdict: { nothingToRedo: false, line: "Measured: 2 screens.", failures: [] },
  direction: { champion: "tissus", sentence: null, entrants: ["tissus", "plaid"], reasons: [], sheet: null },
  screens: [screen("/", "kept"), screen("/contact", "sent back")],
  journeys: [{ slug: "orders", name: "See my orders", status: "kept", why: null, broke: { before: null, after: null }, steps: { before: 4, after: 3 }, widths: [], cleared: [], remaining: [] }],
  stillFailing: [{ kind: "principle", where: "/contact", what: "states: the list is blank" }, { kind: "check", where: "/contact", what: "contrast at 390 px" }],
  measuredAfter: true,
  features: null,
};
const NOTHING: ResultPage = { ...PAGE, verdict: { nothingToRedo: true, line: "Measured: 1 screen.", failures: [] }, direction: null, screens: [screen("/", "unchanged")], journeys: [], stillFailing: [] };
const ids = (html: string) => [...html.matchAll(/data-verdict-id="([^"]*)"/g)].map((m) => m[1]);

test("the verdicts the page asks about are exactly the ones a server can be told of, each with its category", () => {
  assert.deepEqual(pageVerdicts(PAGE), [
    { id: "direction", category: "direction", verdict: "Direction: tissus" },
    { id: "screen:/", category: "screens", verdict: "/ kept" },
    { id: "screen:/contact", category: "screens", verdict: "/contact sent back" },
    { id: "journey:orders", category: "journeys", verdict: "See my orders kept" },
    { id: "fail:/contact:states", category: "principles", verdict: "/contact fails states" },
  ]);
  assert.deepEqual(ids(resultHtml(PAGE)), pageVerdicts(PAGE).map((v) => v.id));
});

test("« nothing to redo » is itself a verdict on the screens, and the page asks about it alone", () => {
  assert.deepEqual(pageVerdicts(NOTHING), [{ id: "nothing-to-redo", category: "screens", verdict: "Nothing to redo" }]);
  assert.deepEqual(ids(resultHtml(NOTHING)), ["nothing-to-redo"]);
});

test("in a browser, the page keeps a reason typed without leaving the field, even typed before the server answers the click, says when the server is gone, and opened as a file asks for nothing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-page-"));
  const posts: { id: string; agree: boolean; why?: string }[] = [];
  const zero = { direction: { agreed: 0, total: 0 }, screens: { agreed: 0, total: 0 }, journeys: { agreed: 0, total: 0 }, principles: { agreed: 0, total: 0 } };
  const server = createServer(async (req, res) => {
    if (req.url === "/api/feedback" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      posts.push(JSON.parse(body));
      // A slow answer: the reason is typed before the click is confirmed.
      await new Promise((done) => setTimeout(done, 800));
      return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ rates: zero }));
    }
    if (req.url === "/api/feedback") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ mine: [], rates: zero }));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(resultHtml(PAGE));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors: Error[] = [];
    page.on("pageerror", (error) => errors.push(error));
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/`);
    assert.match(await page.locator("#rates").innerText(), /No feedback yet: say whether you agree with each verdict/);

    const box = page.locator('.say[data-verdict-id="screen:/"]');
    await box.getByRole("button", { name: "Disagree" }).click();
    await box.getByRole("textbox").pressSequentially("The header is too loud");
    for (let i = 0; i < 40 && !posts.some((p) => p.why === "The header is too loud"); i++) await page.waitForTimeout(100);
    assert.deepEqual(posts.at(-1), { id: "screen:/", agree: false, why: "The header is too loud" }, "kept without leaving the field, once typing stops");
    assert.ok(posts.length <= 3, `not one save per key: ${posts.length}`);

    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    await box.getByRole("button", { name: "Agree", exact: true }).click();
    await assert.doesNotReject(box.locator(".said").filter({ hasText: "Not saved: is aeom report --serve still running?" }).waitFor({ timeout: 3000 }));
    assert.deepEqual(errors, []);

    const file = join(dir, "report.html");
    await writeFile(file, resultHtml(NOTHING));
    await page.goto(pathToFileURL(file).href);
    assert.equal(await page.locator("#rates").innerText(), "No feedback yet.", "opened as a file, the page asks for nothing it cannot keep");
    assert.equal(await page.locator(".say").isVisible(), false);
    assert.equal(await page.locator("#feedback-note").isVisible(), true);
  } finally {
    await browser.close();
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("the page says at its head the widths measured when they are not the default, and the default one left out", async () => {
  const desktop = resultHtml({ ...PAGE, widths: { measured: [1280], leftOut: [390] } });
  assert.match(desktop, /<header[^>]*>[\s\S]*Measured at 1280 px, the widths this run declared; 390 px left out\.[\s\S]*<\/header>/);
  assert.match(resultHtml({ ...PAGE, widths: { measured: [390, 768, 1280], leftOut: [] } }), /Measured at 390, 768, 1280 px, the widths this run declared\./);
  assert.doesNotMatch(resultHtml({ ...PAGE, widths: { measured: [390, 1280], leftOut: [] } }), /widths this run declared/);
  const dir = await mkdtemp(join(tmpdir(), "aeom-report-widths-"));
  try {
    await mkdir(join(dir, "before", "captures"), { recursive: true });
    await writeFile(join(dir, "before", "captures", "manifest.json"), JSON.stringify({ url: "http://x", capturedAt: "", widths: [1280, 1280], pages: [], errors: [] }));
    assert.deepEqual((await readRun(dir, "run-1")).widths, { measured: [1280], leftOut: [390] });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a run that built a front from nothing has no before: its page shows what it built, each screen new", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-report-built-"));
  try {
    await mkdir(join(dir, "end", "captures"), { recursive: true });
    await mkdir(join(dir, "end", "reports"), { recursive: true });
    await writeFile(join(dir, "end", "captures", "manifest.json"), JSON.stringify({ url: "http://x", capturedAt: "", widths: [1280], pages: [{ url: "http://x/", path: "/", files: [{ width: 1280, file: "index@1280.png" }] }, { url: "http://x/voies.html", path: "/voies.html", files: [{ width: 1280, file: "voies-html@1280.png" }] }], errors: [] }));
    await writeFile(join(dir, "end", "reports", "check.json"), JSON.stringify({ url: "http://x", checkedAt: "", widths: [1280], checks: ["cursor"], pages: ["http://x/", "http://x/voies.html"], errors: [], findings: [{ check: "cursor", url: "http://x/voies.html", width: 1280, message: "no pointer" }] }));
    await writeFile(join(dir, "built"), "");
    const page = await readRun(dir, "run-1");
    assert.equal(page.built, true);
    assert.deepEqual(page.screens.map((s) => [s.page, s.status]), [["/", "new"], ["/voies.html", "new"]]);
    assert.deepEqual(page.screens[1]!.widths, [{ width: 1280, before: null, after: "end/captures/voies-html@1280.png" }]);
    const html = resultHtml(page);
    assert.match(html, /<h1>What the run built<\/h1>/);
    assert.doesNotMatch(html, /figcaption>Before</, "nothing before: the built screen alone");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a run on an API keeps its address, and one that plugged an existing front into it says so at its head", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-report-api-"));
  try {
    await mkdir(join(dir, "end", "captures"), { recursive: true });
    await writeFile(join(dir, "end", "captures", "manifest.json"), JSON.stringify({ url: "http://x", capturedAt: "", widths: [1280], pages: [{ url: "http://x/", path: "/", files: [{ width: 1280, file: "index@1280.png" }] }], errors: [] }));
    await writeFile(join(dir, "api"), "http://localhost:8000/v1\n");
    await writeFile(join(dir, "replug"), "");
    const page = await readRun(dir, "run-2");
    assert.equal(page.api, "http://localhost:8000/v1");
    assert.equal(page.replug, true);
    assert.deepEqual(page.screens.map((s) => s.status), ["unchanged"], "plugging the data changes no screen");
    assert.match(resultHtml(page), /<h1>The front, on its API<\/h1>/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});


test("the page says nothing of what the run cost: AEOM measures it for itself, never for the person", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-report-cost-"));
  try {
    await mkdir(join(dir, "before", "captures"), { recursive: true });
    await writeFile(join(dir, "before", "captures", "manifest.json"), JSON.stringify({ url: "http://x", capturedAt: "", widths: [390, 1280], pages: [], errors: [] }));
    await writeFile(join(dir, "estimate.json"), JSON.stringify({ total: { dollars: 64.2 } }));
    await writeFile(join(dir, "cost.json"), JSON.stringify({ total: { dollars: 41.7 }, roles: [] }));
    const html = resultHtml(await readRun(dir, "run-1"));
    assert.doesNotMatch(html, /\$\d|What it cost|aeom cost|tokens/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the page says apart what the product sheet accepts, with its reason and source, and who judged on which principles", () => {
  const html = resultHtml({
    ...PAGE,
    accepted: [{ kind: "principle", where: "/", what: "not-generic: the deep violet is the brand's, chosen. (seen: Victor)" }],
    judges: { models: ["claude-sonnet-5-5"], principles: "base.md 1a2b3c4d" },
  });
  assert.match(html, /<section id="accepted">.*<h2>Accepted<\/h2>.*<strong>\/<\/strong> not-generic: the deep violet is the brand&#39;s, chosen\. \(seen: Victor\)/s);
  assert.match(html, /Judged by claude-sonnet-5-5, on base\.md 1a2b3c4d\./);
  assert.doesNotMatch(resultHtml(PAGE), /id="accepted"/, "nothing accepted, nothing said");
  const nothing = resultHtml({ ...NOTHING, accepted: [{ kind: "check", where: "/", what: "contrast: the grey of the charter. (seen: charte.pdf)" }] });
  assert.match(nothing, /id="accepted"/, "even when nothing is to redo");
});

test("a run of directions has its page: the front as it is first, every direction of every round in large with its sentence, its comparison and its checks, the last round first, and what the person chose", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-page-directions-"));
  try {
    const D = join(dir, "directions");
    await mkdir(join(D, "lutrin-checks"), { recursive: true });
    for (const f of ["now.png", "lutrin.png", "verriere.png", "lutrin-mix.png"]) await writeFile(join(D, f), "");
    await writeFile(join(D, "lutrin-checks", "check.json"), JSON.stringify({ pages: ["http://x/"], errors: [], findings: [{ check: "contrast" }, { check: "contrast" }, { check: "orphan" }] }));
    const said = (s: string) => ({ slug: s, strong: `${s} reads at a glance.`, weak: `${s} hides the search.`, fit: `${s} is a town hall's desk.` });
    await writeFile(join(D, "rounds.json"), JSON.stringify([
      { round: 1, entrants: ["lutrin", "verriere"], notes: { lutrin: "A lectern. Structure: one document in the middle.", verriere: "Glass panes." }, compare: { directions: [said("lutrin"), said("verriere")], start: { slug: "verriere", why: "it keeps the density." } } },
      { round: 2, entrants: ["lutrin", "verriere", "lutrin-mix"], notes: { "lutrin-mix": "Lutrin with the air of Verrière." }, decision: { applied: "lutrin-mix", why: "Lutrin avec l'air de Verrière." } },
    ]));
    const page = await readRun(dir, "run-9");
    assert.deepEqual(page.rounds?.map((r) => r.round), [2, 1], "the last round first");
    assert.deepEqual(page.rounds?.[1]?.entrants.find((e) => e.slug === "lutrin")?.checks, ["contrast ×2", "orphan"]);
    const html = resultHtml(page, { lang: "fr" });
    assert.match(html, /<html lang="fr">/);
    assert.match(html, /<h1>Les directions<\/h1>/);
    assert.match(html, /<img src="directions\/now\.png" alt="Le front tel qu&#39;il est"/);
    assert.match(html, /<img src="directions\/lutrin-mix\.png"/);
    assert.match(html, /Point fort\s: <\/span>lutrin reads at a glance\./);
    assert.match(html, /Point faible\s: <\/span>lutrin hides the search\./);
    assert.match(html, /Adéquation\s: <\/span>lutrin is a town hall&#39;s desk\./);
    assert.match(html, /Ses contrôles ont trouvé\s: contrast ×2, orphan/);
    assert.match(html, /Le tri commencerait par verriere\s: it keeps the density\./);
    assert.match(html, /Choisie\s: lutrin-mix — Lutrin avec l&#39;air de Verrière\./);
    assert.ok(html.indexOf("Tour 2") < html.indexOf("Tour 1"), "the last round first");
    assert.doesNotMatch(html, /Still failing|Screens/, "nothing in English, and no screen to show");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the page speaks the person's language: its own words in French, data as they were written", () => {
  const html = resultHtml(PAGE, { lang: "fr" });
  assert.match(html, /<html lang="fr">/);
  for (const words of ["Ce que le run a donné", "Écrans", "Parcours", "Encore en échec", "gardé", "Remis comme avant"]) assert.match(html, new RegExp(words), words);
  assert.doesNotMatch(html, />(Screens|Journeys|Still failing|Before|After)</);
  assert.match(resultHtml(PAGE), /<html lang="en">/, "English by default");
});

test("the page says each principle and check in words, in its language, and a check's finding without the selector of the element", () => {
  const page: ResultPage = {
    ...PAGE,
    screens: [{ ...screen("/", "kept"), count: { before: 2, after: 0 }, cleared: ["font-size@390", "consistent-chrome"] }, screen("/contact", "sent back")],
    stillFailing: [
      { kind: "principle", where: "/contact", what: "states: the list is blank" },
      { kind: "check", where: "/contact", what: "line-length: p.m-0.max-w-[720px].text-[17px] \"Pour les équipes\": about 91 characters a line" },
    ],
  };
  const fr = resultHtml(page, { lang: "fr" });
  assert.match(fr, /<b>des états vides et d&#39;erreur dessinés<\/b> the list is blank/);
  assert.match(fr, /<b>des lignes pas trop longues<\/b> &quot;Pour les équipes&quot;: about 91 characters a line/);
  assert.match(fr, /un texte assez grand \(390 px\)/);
  assert.match(fr, /en-tête et boutons pareils partout/);
  assert.doesNotMatch(fr, /p\.m-0|>states:|consistent-chrome</, "no code name, no selector");
  assert.match(resultHtml(page), /<b>designed empty and error states<\/b> the list is blank/, "in English too");
});

test("the head says the verdict in one sentence: what was redone, what was put back, and what is left", () => {
  const page: ResultPage = {
    ...PAGE,
    verdict: { nothingToRedo: false, line: "Measured: 2 screens.", failures: [{ kind: "principle", where: "/", what: "grid: off" }, { kind: "principle", where: "/contact", what: "states: blank" }, { kind: "journey-principle", where: "See my orders", what: "short: a detour" }] },
    stillFailing: [{ kind: "principle", where: "/contact", what: "states: the list is blank" }],
  };
  const fr = resultHtml(page, { lang: "fr" });
  assert.match(fr, /<h1>1 écran refait sur 2, 1 parcours amélioré sur 1<\/h1>/);
  assert.match(fr, /1 écran a été remis comme avant\s: la version d'AEOM n'était pas meilleure\. Il reste 1 problème à régler\./);
  assert.match(fr, /<strong>2 → 1<\/strong><span>problèmes sur les écrans<\/span>/);
  assert.match(fr, /<strong>1 → 0<\/strong><span>problèmes sur les parcours<\/span>/);
});

test("a run that only judged says what fails, screen by screen, with nothing before / after", () => {
  const page: ResultPage = {
    ...PAGE,
    direction: null,
    judged: true,
    screens: [screen("/", "unchanged"), screen("/contact", "unchanged")],
    journeys: [],
    measuredAfter: false,
    verdict: { nothingToRedo: false, line: "Measured: 2 screens.", failures: [{ kind: "principle", where: "/contact", what: "states: blank" }] },
    stillFailing: [{ kind: "principle", where: "/contact", what: "states: the list is blank" }],
  };
  const html = resultHtml(page);
  assert.match(html, /<p class="kicker">What fails<\/p><h1>1 problem on 1 of 2 screens<\/h1>/);
  assert.match(html, /<h3>With problems<\/h3>[\s\S]*data-page="\/contact"[\s\S]*<h3>Nothing failing<\/h3>[\s\S]*data-page="\/"/);
  assert.doesNotMatch(html, /figcaption>After</, "nothing was redone");
  assert.match(resultHtml({ ...page, judged: undefined }), /Not measured after the run/, "a run that stopped before its end is not a judgement");
  assert.deepEqual(ids(html), pageVerdicts(page).map((v) => v.id), "every verdict the server accepts has its box, in the same order");
});

test("in a browser, a run of a dozen long screens fits in a few screens, drags from before to after, and opens a whole page only on demand", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-page-long-"));
  const browser = await chromium.launch();
  try {
    const shot = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await shot.setContent(`<body style="margin:0;height:5000px;background:linear-gradient(#ffd84d,#16130f)"></body>`);
    const tall = await shot.screenshot({ fullPage: true });
    await mkdir(join(dir, "before"), { recursive: true });
    await mkdir(join(dir, "end"), { recursive: true });
    const pages = Array.from({ length: 12 }, (_, i) => `/page-${i}`);
    for (const p of pages) for (const w of [390, 1280]) for (const d of ["before", "end"]) await writeFile(join(dir, d, `${p.slice(1)}@${w}.png`), tall);
    const long: ResultPage = {
      ...PAGE,
      screens: pages.map((p, i) => ({ ...screen(p, i < 3 ? "kept" : "sent back"), count: { before: 2, after: i < 3 ? 0 : 1 }, ...(i < 3 ? { cleared: ["grid"] } : { back: { verdict: "same" as const, before: 2, after: 2 } }), widths: [390, 1280].map((width) => ({ width, before: `before/${p.slice(1)}@${width}.png`, after: `end/${p.slice(1)}@${width}.png` })) })),
    };
    const file = join(dir, "report.html");
    await writeFile(file, resultHtml(long, { lang: "fr" }));
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors: Error[] = [];
    page.on("pageerror", (error) => errors.push(error));
    await page.goto(pathToFileURL(file).href);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    assert.ok(height < 5000, `the page is ${height} px high at 1280`);
    assert.equal(await page.locator("dialog img").count(), 0, "no whole capture before it is asked for");

    const slider = page.locator(".cmp input").first();
    await slider.fill("20");
    assert.equal(await slider.evaluate((input) => (input.parentElement as HTMLElement).style.getPropertyValue("--x")), "20%");

    await page.getByRole("button", { name: "Voir la page entière" }).first().click();
    const dialog = page.locator("dialog#whole");
    await dialog.waitFor({ state: "visible" });
    assert.equal(await dialog.locator(".whole__title").innerText(), "/page-0");
    assert.deepEqual(await dialog.locator(".pair:not([hidden]) figcaption").allInnerTexts(), ["Avant", "Après"]);
    await dialog.getByRole("button", { name: "Téléphone · 390 px" }).click();
    assert.match(await dialog.locator(".pair:not([hidden]) img").first().getAttribute("src") ?? "", /@390\.png$/);
    await dialog.getByRole("button", { name: "Fermer" }).click();
    assert.equal(await dialog.isVisible(), false);

    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await phone.goto(pathToFileURL(file).href);
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth), 390, "no sideways scrolling on a phone");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("the page carries its fonts: nothing to load from the network", () => {
  const html = resultHtml(PAGE);
  assert.match(html, /@font-face \{ font-family: "Bricolage Grotesque";[^}]*src: url\(data:font\/woff2;base64,/);
  assert.match(html, /@font-face \{ font-family: "JetBrains Mono";[^}]*src: url\(data:font\/woff2;base64,/);
  assert.doesNotMatch(html, /(src|href)="https?:|url\(https?:/);
});

test("a run is read as a judgement when its state kept the option, with or without its dashes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-report-judged-"));
  try {
    await mkdir(join(dir, "before", "captures"), { recursive: true });
    await writeFile(join(dir, "before", "captures", "manifest.json"), JSON.stringify({ url: "http://x", capturedAt: "", widths: [390, 1280], pages: [], errors: [] }));
    assert.equal((await readRun(dir, "run-1")).judged, undefined, "no state: not a judgement");
    for (const option of ["juger", "--juger", "diagnostic"]) {
      await writeFile(join(dir, "state.json"), JSON.stringify({ run: "run-1", options: [option] }));
      assert.equal((await readRun(dir, "run-1")).judged, true, option);
    }
    await writeFile(join(dir, "state.json"), JSON.stringify({ run: "run-1", options: "juger" }));
    assert.equal((await readRun(dir, "run-1")).judged, undefined, "a state of the wrong shape says no option");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a replay of an odd shape leaves out the steps of a journey, never the page", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-report-odd-"));
  try {
    await mkdir(join(dir, "journeys-before"), { recursive: true });
    const run = (steps: unknown) => ({ width: 1280, steps, calls: [], screens: [], counts: { steps: 2, screens: 1, back: 0 }, broken: null, sheet: "orders@1280.png" });
    await writeFile(join(dir, "journeys-before", "report.json"), JSON.stringify({ url: "http://x", replayedAt: "", widths: [1280], warnings: [], journeys: [{ slug: "orders", name: "See my orders", runs: [run({})] }, { slug: "cart", name: "Fill the cart", runs: [run([null, { index: 1, action: "open /", capture: "cart@1280-01.png" }])] }] }));
    const page = await readRun(dir, "run-1");
    assert.equal(page.journeys[0]!.strip, undefined);
    assert.deepEqual(page.journeys[1]!.strip, [{ index: 1, action: "open /", capture: "journeys-before/cart@1280-01.png" }]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("what the person says of a verdict counts the same whatever language the judges wrote it in: its id and its words name the principle, never the reason", () => {
  const said = (what: string) => pageVerdicts({ ...PAGE, stillFailing: [{ kind: "principle", where: "/contact", what }] }).filter((v) => v.category === "principles");
  assert.deepEqual(said("states: La liste des commandes est vide, sans un mot qui le dise."), said("states: the order list is blank, with no word saying so."));
  assert.deepEqual(said("states: La liste est vide.").map((v) => [v.id, v.verdict]), [["fail:/contact:states", "/contact fails states"]]);
});

// A run of /aeom judge as it is left on disk: the before snapshot, the replay of the journeys and their critique, the
// verdict, and the product sheet beside the runs. The catch-all reason is pasted over three principles: it says nothing.
const CATCH_ALL = "Consistent with the warm look.";
const URL_OF = (path: string) => `http://localhost:3000${path}`;
const verdictOn = (principle: string, pass: boolean, votes: string, reasons: string[], more: Record<string, unknown> = {}) => ({ principle, pass, votes, reasons, dissent: [], steps: [], ...more });
async function judgedRun(root: string, { state = true, product = true, after = false, base = false, pageText = true }: { state?: boolean; product?: boolean; after?: boolean; base?: boolean; pageText?: boolean } = {}): Promise<string> {
  const dir = join(root, ".aeom", "runs", "run-1");
  await mkdir(join(dir, "before", "captures", "journeys"), { recursive: true });
  await mkdir(join(dir, "before", "reports"), { recursive: true });
  const routes = ["/", "/equipe", "/commandes"];
  const file = (p: string) => `${p === "/" ? "index" : p.slice(1)}@1280.png`;
  await writeFile(join(dir, "before", "captures", "manifest.json"), JSON.stringify({ url: URL_OF("/"), capturedAt: "", widths: [390, 1280], pages: routes.map((p) => ({ url: URL_OF(p), path: p, files: [{ width: 390, file: file(p).replace("1280", "390") }, { width: 1280, file: file(p) }], ...(p === "/equipe" ? { content: "equipe.content.yml" } : {}) })), errors: [] }));
  if (pageText) await writeFile(join(dir, "before", "captures", "equipe.content.yml"), "# /equipe at 1280 px\n- heading \"Équipe\"\n- text: Dossier indisponible. Supabase n’est pas configuré.\n");
  await writeFile(join(dir, "before", "reports", "check.json"), JSON.stringify({
    url: URL_OF("/"), checkedAt: "", widths: [390, 1280], checks: ["focus", "console", "contrast", "cursor"], pages: routes.map(URL_OF), errors: [],
    findings: [
      ...routes.flatMap((p) => [390, 1280].map((width) => ({ check: "focus", url: URL_OF(p), width, element: 'a.brand_x1 "RADAR"', message: "nothing shows it has the keyboard focus: give it a visible outline or ring (:focus-visible)" }))),
      ...["/", "/commandes"].map((p) => ({ check: "console", url: URL_OF(p), width: 1280, message: "console error: Failed to load resource: the server responded with a status of 503 (Service Unavailable)" })),
      { check: "contrast", url: URL_OF("/commandes"), width: 1280, element: 'span.total "12 €"', message: "text contrast is 3.1:1, needs 4.5:1" },
    ],
  }));
  const principles = ["one-direction", "hierarchy", "density", "states"].map((id) => ({ id, text: id }));
  await writeFile(join(dir, "before", "reports", "judge.json"), JSON.stringify({
    judgedAt: "", voters: ["1", "2", "3"], principles, widths: [390, 1280], failures: 4,
    pages: [
      { page: "/", verdicts: [verdictOn("one-direction", true, "1/1 pass", ["Same look as the rest."]), verdictOn("hierarchy", true, "1/1 pass", [CATCH_ALL]), verdictOn("density", false, "3/3 fail", ["The calendar is packed and the third column is empty.", "Cards are crammed.", "The third column is empty."], { fix: "Move the three « À faire » cards under the calendar and drop the empty third column." }), verdictOn("states", true, "1/1 pass", [CATCH_ALL])] },
      { page: "/equipe", verdicts: [verdictOn("one-direction", true, "1/1 pass", ["The team list keeps the orange « Inviter » button and the « Équipe » title in condensed type, as on the home."]), verdictOn("hierarchy", false, "2/3 fail", ["Only an error pill sits under the title.", "No focal point under the title."], { dissent: ["The page says « Supabase n'est pas configuré »."] }), verdictOn("states", false, "3/3 fail", ["The red « Erreur » pill says what failed but offers no next step, and the rest is blank.", "Blank under the error.", "Nothing but an error."], { dissent: [] }), verdictOn("density", true, "1/1 pass", [CATCH_ALL], { dissent: ["Slots greyed out as unavailable."] })] },
      { page: "/commandes", verdicts: [verdictOn("one-direction", true, "1/1 pass", ["Same orange buttons and cream ground as the home."]), verdictOn("hierarchy", true, "1/1 pass", ["The « Commandes » title leads, then the table of 12 orders."]), verdictOn("density", false, "2/3 fail", ["Rows of 13 px are crammed together.", "The table rows touch."], { fix: "Give each row of the table 12 px more height." }), verdictOn("states", true, "1/1 pass", [CATCH_ALL])] },
    ],
  }));
  const step = (slug: string, index: number, action: string, path: string) => ({ index, action, path, capture: `${slug}@1280-0${index}.png` });
  const run = (slug: string, steps: ReturnType<typeof step>[], broken: { step: number; reason: string } | null) => ({ width: 1280, steps, calls: [], screens: [], counts: { steps: steps.length, screens: 1, back: 0 }, broken, sheet: `${slug}@1280.png` });
  await writeFile(join(dir, "before", "captures", "journeys", "report.json"), JSON.stringify({
    url: URL_OF("/"), replayedAt: "", widths: [1280], warnings: [],
    journeys: [
      { slug: "see-orders", name: "Voir mes commandes", runs: [run("see-orders", [step("see-orders", 1, "open /", "/"), step("see-orders", 2, 'click "Commandes"', "/")], { step: 2, reason: '"Commandes" is not on the screen' })] },
      { slug: "find-member", name: "Trouver un membre", runs: [run("find-member", [step("find-member", 1, "open /", "/"), step("find-member", 2, 'click "Équipe"', "/equipe"), step("find-member", 3, 'see "Membres"', "/equipe")], null)] },
    ],
  }));
  await writeFile(join(dir, "before", "reports", "judge-journeys.json"), JSON.stringify({
    judgedAt: "", voters: ["1", "2", "3"], principles: ["same-words", "result-shown"].map((id) => ({ id, text: id })), failures: 3, broken: [],
    pages: [
      { page: "see-orders", verdicts: [verdictOn("same-words", false, "3/3 fail", ["The menu says « Achats » but the page is « Commandes »."], { steps: [2], fix: "Name the menu entry « Commandes », as the page is named." }), verdictOn("result-shown", true, "1/1 pass", ["The table lists 12 orders with their totals in euros."], { steps: [2] })] },
      { page: "find-member", verdicts: [verdictOn("same-words", false, "2/3 fail", ["The link says « Équipe », the title « Membres »."], { steps: [2] }), verdictOn("result-shown", false, "3/3 fail", ["The list says « Supabase n'est pas configuré » instead of the members."], { steps: [3] })] },
    ],
  }));
  await writeFile(join(dir, "verdict.json"), JSON.stringify({ nothingToRedo: false, line: "Measured: 3 screens at 1280 px.", failures: [], keepStyle: false, identity: true, recommend: "keep" }));
  if (state) await writeFile(join(dir, "state.json"), JSON.stringify({ run: "run-1", options: ["--juger"] }));
  if (product) await writeFile(join(root, ".aeom", "product.md"), "# Radar\n\n## What kind of product\n`tool`: une interface interne de veille, pour suivre les appels d’offres et les dossiers de candidature. (seen: README.md)\n\n## What it is for\nRadar aide l’équipe à repérer les appels d’offres pertinents et à préparer les dossiers. (seen: README.md)\n\n## Who uses it\nL’équipe, chaque matin. (to confirm)\n\n## Where it is used\n`desktop`: Antoine said so. (seen: Antoine)\n\n## The main loop\nOuvrir la vue d’ensemble, parcourir les opportunités, suivre les dossiers. (seen: /)\n\n## Key journeys\n\n### Voir mes commandes\nWhy: retrouver ses commandes. (seen: /)\n1. Open `/`.\n2. Click « Commandes ».\n");
  if (after) {
    await mkdir(join(dir, "after", "captures"), { recursive: true });
    await writeFile(join(dir, "after", "captures", "manifest.json"), JSON.stringify({ url: URL_OF("/"), capturedAt: "", widths: [1280], pages: [], errors: [] }));
  }
  if (base) await writeFile(join(dir, "base"), "main\n");
  return dir;
}

test("a run that only judged is read as a judgement, from its option or, without one, from a run that ended with no after and no branch", async () => {
  const root = await mkdtemp(join(tmpdir(), "aeom-judgement-"));
  try {
    const dir = await judgedRun(root, { state: false });
    assert.equal((await readRun(dir, "run-1")).judged, undefined, "no state: a run that stopped before its end, not a judgement");
    await writeFile(join(dir, "state.json"), JSON.stringify({ run: "run-1", options: [], phase: "done" }));
    const page = await readRun(dir, "run-1");
    assert.equal(page.judged, true, "ended with no after and no branch: it only judged");
    assert.ok(page.judgement, "its judgement is read");
    await writeFile(join(dir, "state.json"), JSON.stringify({ run: "run-1", options: [], phase: "pages" }));
    assert.equal((await readRun(dir, "run-1")).judged, undefined, "a run still under way is not a judgement");
    await writeFile(join(dir, "state.json"), JSON.stringify({ run: "run-1", options: [], phase: "done" }));
    await writeFile(join(dir, "base"), "main\n");
    assert.equal((await readRun(dir, "run-1")).judged, undefined, "a run branch was opened: a redo that stopped, not a judgement");
    await writeFile(join(dir, "state.json"), JSON.stringify({ run: "run-1", options: ["diagnostic"] }));
    assert.equal((await readRun(dir, "run-1")).judged, true, "the option says it, whatever else the folder holds");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the judgement says the product, what was measured, the verdict and the recommendation, in the product sheet's language", async () => {
  const root = await mkdtemp(join(tmpdir(), "aeom-judgement-"));
  try {
    const page = await readRun(await judgedRun(root), "run-1");
    const j = page.judgement!;
    assert.deepEqual(j.product, { name: "Radar", sentence: "Une interface interne de veille, pour suivre les appels d’offres et les dossiers de candidature." });
    assert.equal(j.lang, "fr", "the sheet is written in French");
    assert.deepEqual(j.measured, { screens: 3, widths: [390, 1280], checks: 4, principles: 4, journeys: 2, journeyPrinciples: 2, judges: 6 });
    const html = resultHtml(page);
    assert.match(html, /<html lang="fr">/, "no --lang: the sheet's language");
    assert.match(html, /<h1[^>]*>Radar<\/h1>/);
    assert.match(html, /Une interface interne de veille, pour suivre les appels d’offres/);
    for (const said of ["3 écrans", "390 et 1280 px", "2 parcours", "6 juges"]) assert.match(html, new RegExp(said), said);
    assert.match(html, /class="verdict"[^>]*>[^<]*\d+ points? à reprendre/, "the verdict in one sentence");
    assert.match(html, /gardant son style/, "the recommendation, said for a person: keep the front's own direction");
    assert.match(resultHtml(page, { lang: "en" }), /<html lang="en">[\s\S]*Strengths[\s\S]*Weak points/, "--lang still decides");
    assert.doesNotMatch(html, />(Avant|Après|Before|After)<|No capture|Pas de capture|inchangé|unchanged/, "a judgement compares nothing");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the strengths come from what the judges passed, one per principle, a reason pasted over several principles left out, each with its capture", async () => {
  const root = await mkdtemp(join(tmpdir(), "aeom-judgement-"));
  try {
    const j = (await readRun(await judgedRun(root), "run-1")).judgement!;
    assert.deepEqual(j.strengths.map((s) => s.principle).sort(), ["hierarchy", "one-direction", "result-shown"]);
    const direction = j.strengths.find((s) => s.principle === "one-direction")!;
    assert.deepEqual([direction.count, direction.of], [3, 3]);
    assert.equal(direction.reason, "The team list keeps the orange « Inviter » button and the « Équipe » title in condensed type, as on the home.", "the most concrete reason");
    assert.equal(direction.shot, "before/captures/equipe@1280.png", "the capture of the screen that reason is about");
    assert.equal(j.strengths.find((s) => s.principle === "hierarchy")!.reason, "The « Commandes » title leads, then the table of 12 orders.");
    assert.equal(j.strengths.find((s) => s.principle === "result-shown")!.shot, "before/captures/journeys/see-orders@1280-02.png", "a journey's strength shows its step");
    assert.ok(j.strengths.every((s) => s.reason !== CATCH_ALL), "a reason given to several principles says nothing of any");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the weak points: a journey that breaks first, then the principles with their votes, then the checks; what repeats across screens is one point that names them", async () => {
  const root = await mkdtemp(join(tmpdir(), "aeom-judgement-"));
  try {
    const page = await readRun(await judgedRun(root), "run-1");
    const j = page.judgement!;
    assert.deepEqual(j.weak.map((w) => w.id), ["weak:breaks:see-orders", "weak:journey-principle:same-words", "weak:principle:density", "weak:principle:states", "weak:check:focus", "weak:check:contrast"]);
    const focus = j.weak.find((w) => w.id === "weak:check:focus")!;
    assert.deepEqual(focus.places.map((p) => p.where), ["/", "/equipe", "/commandes"], "one point, every screen it is on");
    assert.equal(focus.places[0]!.reason, '"RADAR": nothing shows it has the keyboard focus', "one element at two widths is one element");
    const density = j.weak.find((w) => w.id === "weak:principle:density")!;
    assert.deepEqual(density.places.map((p) => [p.where, p.votes]), [["/", "3/3"], ["/commandes", "2/3"]]);
    assert.equal(density.places[0]!.shot, "before/captures/index@1280.png");
    assert.equal(j.weak[0]!.places[0]!.shot, "before/captures/journeys/see-orders@1280-02.png", "a journey that breaks shows the step where it does");
    const html = resultHtml(page);
    assert.equal(html.match(/data-weak="weak:check:focus"/g)?.length, 1, "focus on three screens is one point");
    const item = html.split('data-weak="weak:check:focus"')[1]!.split("</article>")[0]!;
    for (const route of ["/", "/equipe", "/commandes"]) assert.match(item, new RegExp(`>${route}<`), route);
    assert.match(html.split('data-weak="weak:principle:density"')[1]!.split("</article>")[0]!, /3\/3[\s\S]*2\/3/, "each screen with its count of votes");
    assert.ok(html.indexOf('data-weak="weak:breaks:see-orders"') < html.indexOf('data-weak="weak:principle:density"') && html.indexOf('data-weak="weak:principle:density"') < html.indexOf('data-weak="weak:check:focus"'), "worst first");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("what comes from the test environment is set apart, to check outside the demo: a server error in the console, a page blank because a service is not configured", async () => {
  const root = await mkdtemp(join(tmpdir(), "aeom-judgement-"));
  try {
    const page = await readRun(await judgedRun(root), "run-1");
    const j = page.judgement!;
    assert.deepEqual(j.env.map((w) => w.id).sort(), ["env:check:console", "env:journey-principle:result-shown", "env:principle:hierarchy"]);
    assert.ok(!j.weak.some((w) => w.key === "console" || w.key === "result-shown" || w.key === "hierarchy"), "never mixed with the design's weak points");
    assert.ok(j.weak.some((w) => w.key === "states" && w.places.some((p) => p.where === "/equipe")), "an error state with no way on is the design's, demo or not");
    // The page's own text said the service is missing; without it, a dissent or a word such as « unavailable » says nothing.
    const without = (await readRun(await judgedRun(await mkdtemp(join(tmpdir(), "aeom-judgement-")), { pageText: false }), "run-1")).judgement!;
    assert.ok(without.weak.some((w) => w.key === "hierarchy"), "the losing side's words do not set a failure apart");
    const box = resultHtml(page).split('id="env"')[1]!.split("</section>")[0]!;
    assert.match(box, /À vérifier hors démo/);
    assert.match(box, /503/);
    assert.match(box, />\/equipe</);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("each weak point has its lead, the judges' most concrete fix or the page's own, ranked by effect then effort, never a new feature", async () => {
  const root = await mkdtemp(join(tmpdir(), "aeom-judgement-"));
  try {
    const page = await readRun(await judgedRun(root), "run-1");
    const j = page.judgement!;
    assert.equal(j.weak.find((w) => w.key === "density")!.fix, "Move the three « À faire » cards under the calendar and drop the empty third column.", "the judges' fix, the most concrete of the screens'");
    assert.equal(j.weak.find((w) => w.key === "same-words")!.fix, "Name the menu entry « Commandes », as the page is named.");
    assert.equal(j.weak.find((w) => w.key === "contrast")!.fix, null, "no judge for a check: the page says its own");
    const leads = resultHtml(page).split('id="leads"')[1]!.split("</section>")[0]!;
    assert.match(leads, /Move the three « À faire » cards/);
    assert.match(leads, /Foncer les textes trop pâles/, "a check's lead, in the page's language");
    const rank = { high: 0, medium: 1, low: 2 } as const;
    const effects = [...leads.matchAll(/data-effect="(high|medium|low)"/g)].map((m) => rank[m[1] as keyof typeof rank]);
    assert.equal(effects.length, j.weak.length, "one lead per weak point");
    assert.deepEqual(effects, [...effects].sort((a, b) => a - b), "the most effect first");
    for (const effort of [...leads.matchAll(/data-effort="([a-z]+)"/g)].map((m) => m[1])) assert.ok(["quick", "medium", "big"].includes(effort!), effort);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the person agrees or disagrees with each weak point, the ones set apart included, and the server accepts exactly those", async () => {
  const root = await mkdtemp(join(tmpdir(), "aeom-judgement-"));
  try {
    const page = await readRun(await judgedRun(root), "run-1");
    const verdicts = pageVerdicts(page);
    assert.deepEqual(verdicts.map((v) => v.id), [...page.judgement!.weak, ...page.judgement!.env].map((w) => w.id));
    assert.deepEqual(verdicts.find((v) => v.id === "weak:check:focus"), { id: "weak:check:focus", category: "screens", verdict: "focus fails on /, /equipe, /commandes" });
    assert.deepEqual(verdicts.find((v) => v.id === "weak:breaks:see-orders"), { id: "weak:breaks:see-orders", category: "journeys", verdict: "Voir mes commandes breaks at step 2" });
    assert.equal(verdicts.find((v) => v.id === "weak:principle:density")!.category, "principles");
    assert.deepEqual(ids(resultHtml(page)), verdicts.map((v) => v.id), "a box for each, in the same order");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the page of a full run is not a judgement: same page as before, no strength, no lead", async () => {
  const root = await mkdtemp(join(tmpdir(), "aeom-judgement-"));
  try {
    const page = await readRun(await judgedRun(root, { state: false, after: true, base: true }), "run-1");
    assert.equal(page.judged, undefined);
    assert.equal(page.judgement, undefined);
    const html = resultHtml(page);
    assert.doesNotMatch(html, /id="(strengths|weak|leads|env)"/);
    assert.match(html, /What the run gave/);
    assert.doesNotMatch(resultHtml(PAGE), /id="(strengths|weak|leads|env)"|prefers-color-scheme/, "a full run's page keeps its one light theme");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("in a browser, a judgement's captures are thumbnails that open large, and the page has a light and a dark theme", async () => {
  const root = await mkdtemp(join(tmpdir(), "aeom-judgement-"));
  const browser = await chromium.launch();
  try {
    const dir = await judgedRun(root);
    await writeFile(join(dir, "report.html"), resultHtml(await readRun(dir, "run-1")));
    const page = await browser.newPage({ colorScheme: "dark" });
    await page.goto(pathToFileURL(join(dir, "report.html")).href);
    const ground = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const dark = await ground();
    await page.locator("#strengths .shot").first().click();
    assert.equal(await page.locator("dialog#large[open]").count(), 1, "the capture opens large");
    assert.match((await page.locator("dialog#large img").getAttribute("src")) ?? "", /before\/captures\/equipe@1280\.png$/);
    await page.keyboard.press("Escape");
    await page.locator("[data-theme-toggle]").click();
    assert.notEqual(await ground(), dark, "the toggle switches to the light theme");
  } finally {
    await browser.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("a judged run whose folder the judgement cannot read keeps the page of what fails, never a crash", async () => {
  const root = await mkdtemp(join(tmpdir(), "aeom-judgement-"));
  try {
    const dir = await judgedRun(root);
    await writeFile(join(dir, "before", "captures", "journeys", "report.json"), JSON.stringify({ url: URL_OF("/"), replayedAt: "", widths: [1280], warnings: [], journeys: [{ slug: "see-orders", name: "Voir mes commandes" }] }));
    const page = await readRun(dir, "run-1");
    assert.equal(page.judged, true);
    assert.equal(page.judgement, undefined, "a journey without its runs: no judgement");
    assert.match(resultHtml(page), /What fails/, "the page of what fails instead");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

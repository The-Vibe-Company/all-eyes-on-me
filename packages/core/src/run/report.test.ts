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

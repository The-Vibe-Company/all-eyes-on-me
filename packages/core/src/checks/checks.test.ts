import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
import { readFileSync } from "node:fs";
import { signIn, startApp, type RunningApp } from "../capture/index.js";
import { checkClipped, checkContrast, checkCursor, checkHeader, checkOverflow, checkSite, checkUneven, checkWrap, watchConsole } from "./index.js";

const UGLY_APP = fileURLToPath(new URL("../../../../examples/ugly-app/server.mjs", import.meta.url));

let browser: Browser;
before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
});

async function pageWith(html: string, width = 1280): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 800 } });
  const page = await context.newPage();
  await page.setContent(html);
  return page;
}

describe("cursor", () => {
  test("flags clickable elements without a pointer cursor, and only those", async () => {
    const page = await pageWith(`
      <button>Go</button>
      <div onclick="void 0">Fake button</div>
      <a href="/x">A link</a>
      <button style="cursor: pointer">Fine</button>
      <button style="display: none">Hidden</button>`);
    const issues = await checkCursor(page);
    assert.deepEqual(issues.map((i) => i.element), ['button "Go"', 'div "Fake button"']);
  });
});

describe("overflow", () => {
  test("flags a page that scrolls sideways and names the element that sticks out", async () => {
    const page = await pageWith(`<body style="margin:0"><div class="wide" style="width:600px">Too wide</div></body>`, 390);
    const issues = await checkOverflow(page);
    assert.equal(issues.length, 1);
    assert.match(issues[0]!.message, /600 px/);
    assert.equal(issues[0]!.element, 'div.wide "Too wide"');
  });

  test("passes a page that fits", async () => {
    const page = await pageWith(`<body style="margin:0"><div>Fits</div></body>`, 390);
    assert.deepEqual(await checkOverflow(page), []);
  });
});

describe("contrast", () => {
  test("flags text below AA contrast", async () => {
    const page = await pageWith(`<main><p style="color:#ccc;background:#fff">Faint text</p><p style="color:#111">Dark text</p></main>`);
    const issues = await checkContrast(page);
    assert.equal(issues.length, 1);
    assert.match(issues[0]!.element ?? "", /Faint text/);
  });
});

describe("console", () => {
  test("collects console errors and uncaught exceptions", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = watchConsole(page);
    await page.setContent(`<script>console.error("boom"); setTimeout(() => { throw new Error("kaboom"); });</script>`);
    await page.waitForTimeout(100);
    const messages = errors().map((i) => i.message).join("\n");
    assert.match(messages, /boom/);
    assert.match(messages, /kaboom/);
  });
});

const TALL = `<main style="height:3000px"><p>Content</p></main>`;

describe("header", () => {
  test("flags a header that leaves the screen when you scroll and does not come back", async () => {
    const issues = await checkHeader(await pageWith(`<body style="margin:0"><header style="height:60px">Logo <a href="/">Accueil</a></header>${TALL}</body>`));
    assert.equal(issues.length, 1);
    assert.match(issues[0]!.message, /the header leaves the screen when you scroll and does not come back when you scroll up/);
  });

  test("passes a header that sticks, and one that hides going down and comes back going up", async () => {
    assert.deepEqual(await checkHeader(await pageWith(`<body style="margin:0"><header style="position:sticky;top:0;height:60px;background:#fff">Logo</header>${TALL}</body>`)), []);
    const hiding = `<body style="margin:0"><header id="h" style="position:fixed;top:0;left:0;right:0;height:60px;background:#fff">Logo</header>${TALL}
      <script>let last = 0; addEventListener("scroll", () => { document.getElementById("h").style.transform = scrollY > last ? "translateY(-100%)" : "none"; last = scrollY; });</script></body>`;
    assert.deepEqual(await checkHeader(await pageWith(hiding)), []);
  });

  test("judges nothing on a page too short to scroll, or with no header", async () => {
    assert.deepEqual(await checkHeader(await pageWith(`<header style="height:60px">Logo</header><main>Short</main>`)), []);
    assert.deepEqual(await checkHeader(await pageWith(`<body style="margin:0"><div style="height:60px">Logo</div>${TALL}</body>`)), []);
  });

  test("on a phone, a header that stays but takes more than a quarter of the screen is flagged", async () => {
    const issues = await checkHeader(await pageWith(`<body style="margin:0"><header style="position:sticky;top:0;height:300px;background:#fff">Logo</header>${TALL}</body>`, 390));
    assert.equal(issues.length, 1);
    assert.match(issues[0]!.message, /the header takes 36% of the screen on a phone: a quarter at most/);
    assert.deepEqual(await checkHeader(await pageWith(`<body style="margin:0"><header style="position:sticky;top:0;height:56px;background:#fff">Logo</header>${TALL}</body>`, 390)), []);
  });
});

describe("wrap", () => {
  test("flags a button, a navigation link, a tab or a chip whose label goes onto two lines", async () => {
    const page = await pageWith(`
      <button style="width:80px">Ajouter au panier</button>
      <nav><a href="/c" style="display:inline-block;width:50px">Mes commandes</a></nav>
      <div role="tab" style="width:40px">Historique complet</div>
      <span class="badge" style="display:inline-block;width:40px">Très populaire</span>
      <button>OK</button>
      <p style="width:80px">A paragraph may wrap as much as it likes, it is not a label.</p>`);
    const issues = await checkWrap(page);
    assert.deepEqual(issues.map((i) => i.element), ['button "Ajouter au panier"', 'a "Mes commandes"', 'div "Historique complet"', 'span.badge "Très populaire"']);
    assert.match(issues[0]!.message, /its label goes onto 2 lines: keep it on one/);
  });
});

describe("uneven", () => {
  const card = (title: string, style = "") => `<article class="card" style="width:150px;${style}"><h3 class="title">${title}</h3><a class="more" href="/x">Voir</a></article>`;
  test("flags cards of one row that differ because a title wraps, naming the title", async () => {
    const issues = await checkUneven(await pageWith(`<div style="display:grid;grid-template-columns:repeat(3,150px);align-items:start;gap:8px">${card("Lampe")}${card("Lampe de chevet en laiton brossé et abat-jour en lin")}${card("Chaise")}</div>`));
    assert.equal(issues.length, 1);
    assert.match(issues[0]!.element ?? "", /^h3\.title "Lampe de chevet en laiton/);
    assert.match(issues[0]!.message, /the items of one row are \d+ to \d+ px tall: it takes \d lines where the others take 1\. Clamp it with an ellipsis/);
  });

  test("flags cards stretched to one height whose content no longer lines up", async () => {
    const issues = await checkUneven(await pageWith(`<div style="display:flex;gap:8px">${card("Lampe")}${card("Lampe de chevet en laiton brossé et abat-jour en lin")}</div>`));
    assert.equal(issues.length, 1);
    assert.match(issues[0]!.message, /the items of one row no longer line up: it takes \d lines where the others take 1\. Clamp it with an ellipsis/);
  });

  test("passes titles clamped to one line, and a row where nothing wraps", async () => {
    const clamp = "display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden";
    const clamped = (t: string) => `<article class="card" style="width:150px"><h3 class="title" style="${clamp}">${t}</h3><a class="more" href="/x">Voir</a></article>`;
    assert.deepEqual(await checkUneven(await pageWith(`<div style="display:flex;gap:8px">${clamped("Lampe")}${clamped("Lampe de chevet en laiton brossé et abat-jour en lin")}</div>`)), []);
    assert.deepEqual(await checkUneven(await pageWith(`<div style="display:flex;gap:8px">${card("Lampe")}${card("Chaise")}${card("Tapis")}</div>`)), []);
    assert.deepEqual(await checkUneven(await pageWith(`<table><tr><td style="width:60px">Court</td><td style="width:60px">Une cellule bien plus longue</td></tr></table>`)), [], "table cells share their row by design");
  });
});

describe("clipped", () => {
  test("flags text cut by its box with no ellipsis, and a word that spills out of its box", async () => {
    const issues = await checkClipped(await pageWith(`
      <p class="one" style="width:100px;white-space:nowrap;overflow:hidden">A long line that is cut short</p>
      <p class="two" style="width:100px;height:20px;overflow:hidden">Several lines of text that the box cuts at the bottom, with nothing to say so.</p>
      <div class="three" style="width:60px">Supercalifragilisticexpialidocious</div>`));
    assert.deepEqual(issues.map((i) => i.element?.split(" ")[0]), ["p.one", "p.two", "div.three"]);
    assert.match(issues[0]!.message, /cut by its box with no ellipsis/);
    assert.match(issues[2]!.message, /its text spills out of its box: let it wrap and break/);
  });

  test("passes text cut with an ellipsis or clamped, and a box that scrolls", async () => {
    assert.deepEqual(await checkClipped(await pageWith(`
      <p style="width:100px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">A long line that ends in an ellipsis</p>
      <p style="width:100px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">Several lines of text clamped to two, with an ellipsis at the end of the second.</p>
      <pre style="width:100px;overflow:auto">a long line of code that scrolls on its own</pre>
      <p style="width:100px">Short words wrap fine.</p>`)), []);
  });
});

test("a check the config leaves out of a page finds nothing there, and still runs on the others", async () => {
  const server = createHttpServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><body style="margin:0"><header style="height:60px">Logo <a href="/b">B</a></header><main style="height:3000px">${req.url}</main></body>`);
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  try {
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const report = await checkSite({ url, paths: ["/", "/b"], widths: [1280], except: { header: ["/"] } });
    assert.deepEqual(report.findings.filter((f) => f.check === "header").map((f) => new URL(f.url).pathname), ["/b"]);
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test("contrast is measured on a page whose Content-Security-Policy forbids inline scripts", async () => {
  const server = createHttpServer((_, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-security-policy": "script-src 'self'" });
    res.end('<!doctype html><title>t</title><p style="color:#ccc;background:#fff">Pâle</p>');
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const page = await browser.newPage();
  try {
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/`);
    const issues = await checkContrast(page);
    assert.equal(issues.length, 1, "the faint paragraph is found, though the page forbids inline scripts");
  } finally {
    await page.close();
    await new Promise((done) => server.close(done));
  }
});

describe("on the ugly app", () => {
  let app: RunningApp;
  let url: string;

  before(async () => {
    const port = await new Promise<number>((resolve) => {
      const server = createServer().listen(0, () => {
        const { port } = server.address() as { port: number };
        server.close(() => resolve(port));
      });
    });
    url = `http://localhost:${port}`;
    app = await startApp(`PORT=${port} node "${UGLY_APP}"`, url);
  });
  after(async () => {
    await app?.stop();
  });

  test("finds each kind of problem where the app has it", async () => {
    const account = JSON.parse(readFileSync(new URL("../../../../examples/ugly-app/fixtures/compte.json", import.meta.url), "utf8"));
    const signedIn = await signIn(browser, url, { path: "/connexion", account, submit: "Se connecter" });
    const report = await checkSite({ url, signedIn });
    const where = (check: string) => [...new Set(report.findings.filter((f) => f.check === check).map((f) => new URL(f.url).pathname))].sort();
    assert.deepEqual(where("cursor"), ["/", "/contact", "/produits"]);
    assert.ok(where("overflow").includes("/"), "the home page scrolls sideways at 390 px");
    assert.ok(report.findings.some((f) => f.check === "overflow" && f.width === 390));
    assert.deepEqual(where("contrast"), ["/", "/produits"], "white on the pink button, and the faint price note");
    assert.deepEqual(where("console"), ["/commandes"]);
    assert.equal(report.errors.length, 1, "the broken link is reported, not checked");
  });

  test("checks only the pages it is given, and still says which do not load", async () => {
    const report = await checkSite({ url, paths: ["/produits", "/aide"] });
    assert.deepEqual(report.pages.map((p) => new URL(p).pathname), ["/produits"]);
    assert.deepEqual(report.errors.map((e) => new URL(e.url).pathname), ["/aide"]);
    assert.ok(report.findings.every((f) => new URL(f.url).pathname === "/produits"));
  });
});

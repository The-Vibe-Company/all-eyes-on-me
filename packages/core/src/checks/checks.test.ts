import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
import { readFileSync } from "node:fs";
import { signIn, startApp, type RunningApp } from "../capture/index.js";
import { checkContrast, checkCursor, checkOverflow, checkSite, watchConsole } from "./index.js";

const UGLY_APP = fileURLToPath(new URL("../../../../examples/ugly-app/server.mjs", import.meta.url));

let browser: Browser;
before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
});

async function pageWith(html: string, width = 1280): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height: 800 } });
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

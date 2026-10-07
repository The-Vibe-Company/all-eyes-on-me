import assert from "node:assert/strict";
import { createServer } from "node:net";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
import { startApp, type RunningApp } from "../capture/index.js";
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
    const report = await checkSite({ url });
    const where = (check: string) => [...new Set(report.findings.filter((f) => f.check === check).map((f) => new URL(f.url).pathname))].sort();
    assert.deepEqual(where("cursor"), ["/", "/contact", "/produits"]);
    assert.ok(where("overflow").includes("/"), "the home page scrolls sideways at 390 px");
    assert.ok(report.findings.some((f) => f.check === "overflow" && f.width === 390));
    assert.deepEqual(where("contrast"), ["/", "/produits"], "white on the pink button, and the faint price note");
    assert.deepEqual(where("console"), ["/commandes"]);
    assert.equal(report.errors.length, 1, "the broken link is reported, not checked");
  });
});

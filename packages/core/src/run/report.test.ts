import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { pageVerdicts, resultHtml, type ResultPage } from "./index.js";

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

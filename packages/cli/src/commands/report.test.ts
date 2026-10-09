import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { runReport } from "./report.js";

const AEOM = fileURLToPath(new URL("../index.js", import.meta.url));
const HOME = join(tmpdir(), `aeom-home-${process.pid}`);
const run = async (cwd: string, args: string[]) => {
  try {
    const { stdout, stderr } = await promisify(execFile)("node", [AEOM, ...args], { cwd, env: { ...process.env, AEOM_HOME: HOME } });
    return { code: 0, out: stdout + stderr };
  } catch (error) {
    const e = error as { code: number; stdout: string; stderr: string };
    return { code: e.code, out: e.stdout + e.stderr };
  }
};
const put = async (file: string, content: unknown) => {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, typeof content === "string" ? content : JSON.stringify(content));
};

/** `aeom report --serve` on a run, from `cwd`, until stopped. */
const serving = async (cwd: string, runDir: string, home: string) => {
  const served = spawn("node", [AEOM, "report", runDir, "--serve", "--port", "0"], { cwd, env: { ...process.env, AEOM_HOME: home } });
  const url = await new Promise<string>((resolve, reject) => {
    let out = "";
    served.stdout.on("data", (d) => { out += d; const m = out.match(/http:\/\/127\.0\.0\.1:\d+\//); if (m) resolve(m[0]); });
    served.stderr.on("data", (d) => (out += d));
    served.on("exit", () => reject(new Error(out)));
  });
  return { url, stop: () => served.kill() };
};
/** A request sent as written, path and headers untouched by any client; each part of the body a moment after the other, as a slow network would. */
const raw = (url: string, path: string, { method = "GET", headers = {}, body = [] }: { method?: string; headers?: Record<string, string>; body?: (string | Buffer)[] } = {}) =>
  new Promise<{ status: number; text: string }>((resolve, reject) => {
    const { hostname, port } = new URL(url);
    const req = request({ hostname, port, path, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode!, text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    void (async () => {
      for (const part of body) {
        req.write(part);
        await new Promise((r) => setTimeout(r, 100));
      }
      req.end();
    })();
  });
const JSON_POST = { method: "POST", headers: { "content-type": "application/json" } };
type Said = { mine: { id: string; agree: boolean; why?: string; category: string }[]; rates: Record<string, { agreed: number; total: number }> };

const PRINCIPLES = ["states", "grid"];
const snapshot = async (dir: string, failing: Record<string, string[]>, findings: { page: string; check: string }[] = [], errors: string[] = []) => {
  const pages = Object.keys(failing);
  const slug = (p: string) => (p === "/" ? "index" : p.slice(1));
  await put(join(dir, "captures", "manifest.json"), { url: "http://x", capturedAt: "", widths: [390, 1280], errors: errors.map((e) => ({ url: `http://x${e}`, status: 500, reason: "500 Internal Server Error" })), pages: pages.map((p) => ({ url: `http://x${p}`, path: p, files: [390, 1280].map((w) => ({ width: w, file: `${slug(p)}@${w}.png` })) })) });
  for (const p of pages) for (const w of [390, 1280]) await put(join(dir, "captures", `${slug(p)}@${w}.png`), "png");
  await put(join(dir, "reports", "check.json"), { url: "http://x", checkedAt: "", widths: [390, 1280], checks: ["cursor", "overflow", "contrast", "console"], pages: pages.map((p) => `http://x${p}`), errors: errors.map((e) => ({ url: `http://x${e}`, status: 500, reason: "500 Internal Server Error" })), findings: findings.map((f) => ({ check: f.check, url: `http://x${f.page}`, width: 390, message: `${f.check} fails on ${f.page}` })) });
  await put(join(dir, "reports", "judge.json"), { judgedAt: "", voters: ["1", "2", "3"], principles: PRINCIPLES.map((id) => ({ id, text: id })), failures: 0, pages: pages.map((page) => ({ page, verdicts: PRINCIPLES.map((principle) => ({ principle, pass: !failing[page]!.includes(principle), votes: "", reasons: [`${principle} on ${page}: the list is blank`], dissent: [], steps: [] })) })) });
};
const replay = async (dir: string, steps: number, broken: { step: number; reason: string } | null = null) => {
  await put(join(dir, "report.json"), { url: "http://x", replayedAt: "", widths: [390, 1280], warnings: [], journeys: [{ slug: "orders", name: "See my orders", runs: [390, 1280].map((width) => ({ width, steps: [], calls: [], screens: ["/"], counts: { steps, screens: 2, back: 0 }, broken, sheet: `orders@${width}.png` })) }] });
  for (const w of [390, 1280]) await put(join(dir, `orders@${w}.png`), "png");
  await put(join(dir, "judge-journeys.json"), { judgedAt: "", voters: ["1", "2", "3"], principles: [{ id: "short", text: "short" }], failures: 0, pages: [{ page: "orders", verdicts: [{ principle: "short", pass: steps < 4, votes: "", reasons: ["a detour through the products"], dissent: [], steps: [2] }] }] });
};

test("aeom report writes, in the run's folder, a page of what the run gave: the direction, each screen and journey before and after, and what still fails", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-report-"));
  const R = join(dir, ".aeom", "runs", "run-1");
  try {
    await snapshot(join(R, "before"), { "/": ["grid"], "/contact": ["states"] }, [{ page: "/contact", check: "contrast" }], ["/aide"]);
    await snapshot(join(R, "end"), { "/": [], "/contact": ["states"] }, [{ page: "/contact", check: "contrast" }]);
    // What section 5 decided: the home page kept, the contact page put back.
    await put(join(R, "after", "compare.json"), [{ page: "/", verdict: "better" }, { page: "/contact", verdict: "same" }]);
    await put(join(R, "directions", "sheet.json"), [{ label: "tissus", note: "Sert la boucle principale : choisir une pièce, la suivre." }, { label: "plaid", note: "Sert le contact." }]);
    await put(join(R, "directions", "tournament.json"), { entrants: ["tissus", "plaid"], votesPerDuel: 3, duels: [{ id: 1, round: 1, a: "tissus", b: "plaid", winner: "tissus", reasons: ["Tissus reads as a swatch book, made for this shop."], votes: [] }] });
    await put(join(R, "directions", "sheet.png"), "png");
    await replay(join(R, "journeys-before"), 2, { step: 2, reason: "the page answered 500" });
    await replay(join(R, "journeys-end"), 3);
    await put(join(R, "journeys-end", "ratchet.json"), [{ slug: "orders", name: "See my orders", kept: true, why: "3/3 prefer the new one: Mes commandes is in the menu.", steps: { before: 4, after: 3 }, cleared: ["short"], remaining: [] }]);
    await put(join(R, "verdict.json"), { nothingToRedo: false, line: "Measured: 2 screens at 390, 1280 px, 4 checks and 2 principles each; 1 journey on 1 principle.", failures: [] });

    const { code, out } = await run(dir, ["report"]);
    assert.equal(code, 0, out);
    assert.match(out, /Report: \.aeom\/runs\/run-1\/report\.html/);
    const html = await readFile(join(R, "report.html"), "utf8");
    assert.match(html, /tissus/);
    assert.match(html, /Tissus reads as a swatch book, made for this shop\./);
    assert.match(html, /src="directions\/sheet\.png"/);
    for (const w of [390, 1280]) {
      assert.match(html, new RegExp(`src="before/captures/index@${w}\\.png"`));
      assert.match(html, new RegExp(`src="end/captures/index@${w}\\.png"`));
      assert.match(html, new RegExp(`src="journeys-before/orders@${w}\\.png"`));
      assert.match(html, new RegExp(`src="journeys-end/orders@${w}\\.png"`));
    }
    assert.match(html, /Sert la boucle principale : choisir une pièce, la suivre\./, "the champion's source sentence");
    assert.match(html, /data-page="\/" data-status="kept"/);
    assert.match(html, /data-page="\/contact" data-status="sent back"/);
    assert.match(html, /data-page="\/aide" data-status="does not load"/);
    assert.match(html, /See my orders[^]*Before the run, it broke at step 2: the page answered 500[^]*2 → 3 steps[^]*Mes commandes is in the menu\./);
    assert.match(html, /Still failing[^]*\/contact[^]*states on \/contact: the list is blank/);
    assert.match(html, /Still failing[^]*\/aide[^]*not measured after the run/);
    assert.doesNotMatch(html, /Missing features/, "no section when the run named none");
    await put(join(R, "journeys-end", "judge-journeys.json"), { judgedAt: "", voters: ["1", "2", "3"], principles: [{ id: "result-shown", text: "" }], failures: 1, pages: [{ page: "orders", verdicts: [{ principle: "result-shown", pass: false, votes: "", reasons: ["Ajouter adds nothing."], dissent: [], steps: [2] }] }] });
    await put(join(R, "features.json"), { entries: [{ slug: "orders", name: "See my orders", step: 2, capture: "journeys-end/orders@1280.png", why: "Ajouter adds nothing.", missing: "A way to put a product in the order." }], more: 1 });
    await run(dir, ["report"]);
    const withFeatures = await readFile(join(R, "report.html"), "utf8");
    assert.match(withFeatures, /Missing features[^]*See my orders[^]*blocks at step 2[^]*A way to put a product in the order\.[^]*src="journeys-end\/orders@1280\.png"[^]*1 more blocked journey/);
    await put(join(R, "features.json"), { entries: [{ slug: "gone", name: "A journey that now passes", step: 1, capture: null, why: "x", missing: "y" }], more: 0 });
    await run(dir, ["report"]);
    assert.doesNotMatch(await readFile(join(R, "report.html"), "utf8"), /A journey that now passes/, "an entry for a journey no longer blocked is left out");
    await put(join(R, "features.json"), {});
    assert.equal((await run(dir, ["report"])).code, 0, "a features file of the wrong shape is left out, not a crash");
    assert.doesNotMatch(html, /(src|href)="https?:/, "nothing loads from the network");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("after a run with nothing to redo, the page says so, with what was measured", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-report-"));
  const R = join(dir, ".aeom", "runs", "run-2");
  try {
    await snapshot(join(R, "before"), { "/": [] });
    await put(join(R, "verdict.json"), { nothingToRedo: true, line: "Measured: 1 screen at 390, 1280 px, 4 checks and 2 principles each.", failures: [] });
    const { code, out } = await run(dir, ["report", ".aeom/runs/run-2"]);
    assert.equal(code, 0, out);
    const html = await readFile(join(R, "report.html"), "utf8");
    assert.match(html, /Nothing to redo/);
    assert.match(html, /Measured: 1 screen at 390, 1280 px, 4 checks and 2 principles each\./);
    assert.match(html, /src="before\/captures\/index@1280\.png"/);
    assert.match(html, /data-verdict-id="nothing-to-redo"/, "« nothing to redo » can be agreed with");
    assert.match(html, /No feedback yet<span[^>]*hidden>: say whether you agree with each verdict<\/span>\./, "opened as a file, the page asks for nothing it cannot keep");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a run folder git would commit is said, so no capture enters a commit; no run is an error", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-report-"));
  try {
    assert.match((await run(dir, ["report"])).out, /No run in \.aeom\/runs/);
    await promisify(execFile)("git", ["init", "-q"], { cwd: dir });
    const R = join(dir, ".aeom", "runs", "run-3");
    await snapshot(join(R, "before"), { "/": [] });
    await put(join(R, "verdict.json"), { nothingToRedo: true, line: "Measured: 1 screen.", failures: [] });
    assert.match((await run(dir, ["report"])).out, /\.aeom\/runs\/run-3 is not ignored by git: add \.aeom\/runs\/ to \.gitignore/);
    await writeFile(join(dir, ".gitignore"), ".aeom/runs/\n");
    assert.doesNotMatch((await run(dir, ["report"])).out, /not ignored/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a run that stopped before measuring the end lists what failed before it, never « nothing »", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-report-"));
  const R = join(dir, ".aeom", "runs", "run-4");
  try {
    await snapshot(join(R, "before"), { "/": ["states"] });
    await put(join(R, "verdict.json"), { nothingToRedo: false, line: "Measured: 1 screen.", failures: [{ kind: "principle", where: "/", what: "states: the list is blank" }] });
    assert.equal((await run(dir, ["report"])).code, 0);
    const html = await readFile(join(R, "report.html"), "utf8");
    assert.match(html, /Not measured after the run[^]*\/[^]*states: the list is blank/);
    assert.doesNotMatch(html, /<p>Nothing\.<\/p>/);
    assert.match(html, /data-page="\/" data-status="unchanged"/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

/** A run that changed things: a direction, a screen sent back, a journey kept, a principle still failing. */
const changedRun = async (R: string) => {
  await snapshot(join(R, "before"), { "/": ["grid"] });
  await snapshot(join(R, "end"), { "/": ["states"] });
  await put(join(R, "after", "compare.json"), [{ page: "/", verdict: "same" }]);
  await put(join(R, "directions", "tournament.json"), { entrants: ["tissus", "plaid"], votesPerDuel: 3, duels: [{ id: 1, round: 1, a: "tissus", b: "plaid", winner: "tissus", reasons: ["Made for this shop."], votes: [] }] });
  await replay(join(R, "journeys-before"), 4);
  await replay(join(R, "journeys-end"), 3);
  await put(join(R, "journeys-end", "ratchet.json"), [{ slug: "orders", name: "See my orders", kept: true, why: "Shorter.", steps: { before: 4, after: 3 }, cleared: [], remaining: [] }]);
  await put(join(R, "verdict.json"), { nothingToRedo: false, line: "Measured: 1 screen.", failures: [] });
};

test("each verdict of the page takes « agree » or « disagree » and a reason; served, a gesture is kept at once, and the next page counts it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-report-"));
  const home = await mkdtemp(join(tmpdir(), "aeom-home-"));
  const R = join(dir, ".aeom", "runs", "run-5");
  try {
    await changedRun(R);
    const { url, stop } = await serving(dir, ".aeom/runs/run-5", home);
    try {
      const html = await (await fetch(url)).text();
      for (const id of ["direction", "screen:/", "journey:orders", "fail:/:states"]) assert.match(html, new RegExp(`data-verdict-id="${id}"`), id);
      assert.match(html, /No feedback yet/);
      assert.equal((await fetch(url + "before/captures/index@390.png")).status, 200, "the captures are served from the run folder");
      // The page says what the verdict is: what a page sends of it is not believed.
      const saved = await fetch(url + "api/feedback", { ...JSON_POST, body: JSON.stringify({ id: "screen:/", category: "direction", verdict: "anything", agree: false, why: "The new header is better." }) });
      assert.equal(saved.status, 200);
      const said = (await (await fetch(url + "api/feedback")).json()) as Said;
      assert.deepEqual(said.mine.map((f) => [f.id, f.agree, f.why, f.category]), [["screen:/", false, "The new header is better.", "screens"]], "the reopened page shows what was said");
      assert.deepEqual(said.rates.screens, { agreed: 0, total: 1 });
      assert.deepEqual(said.rates.direction, { agreed: 0, total: 0 });
      assert.equal((await fetch(url + "api/feedback", { method: "POST", body: "{\"id\": 3}" })).status, 400);
      assert.equal((await fetch(url + "api/feedback", { ...JSON_POST, body: JSON.stringify({ id: "screen:/nowhere", agree: true }) })).status, 400, "a verdict the page does not show");
    } finally {
      stop();
    }
    const R2 = join(dir, ".aeom", "runs", "run-6");
    await snapshot(join(R2, "before"), { "/": [] });
    await put(join(R2, "verdict.json"), { nothingToRedo: true, line: "Measured: 1 screen.", failures: [] });
    const nothing = await serving(dir, ".aeom/runs/run-6", home);
    try {
      assert.equal((await fetch(nothing.url + "api/feedback", { ...JSON_POST, body: JSON.stringify({ id: "nothing-to-redo", agree: true }) })).status, 200, "« nothing to redo » is a verdict too");
    } finally {
      nothing.stop();
    }
    await promisify(execFile)("node", [AEOM, "report", ".aeom/runs/run-6"], { cwd: dir, env: { ...process.env, AEOM_HOME: home } });
    assert.match(await readFile(join(R2, "report.html"), "utf8"), /Screens[^<]*<[^>]*>1 of 2/, "the next run's page shows how often AEOM agreed, by category");
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});

test("served, the page answers this machine alone: another name, another origin, another kind of file or a way out of the run folder is refused", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-report-"));
  const home = await mkdtemp(join(tmpdir(), "aeom-home-"));
  const R = join(dir, ".aeom", "runs", "run-7");
  try {
    await changedRun(R);
    await put(join(dir, ".aeom", "config.json"), { url: "http://x" });
    await put(join(dir, ".aeom", "secret.png"), "png");
    await symlink(join(dir, ".aeom", "secret.png"), join(R, "leak.png"));
    await symlink(dir, join(R, "out"));
    await symlink(join(R, "verdict.json"), join(R, "verdict.png"));
    const { url, stop } = await serving(dir, ".aeom/runs/run-7", home);
    const { port } = new URL(url);
    try {
      assert.equal((await raw(url, "/", { headers: { host: `evil.example:${port}` } })).status, 403, "a name that is not this machine's, as a rebound DNS would send");
      assert.equal((await raw(url, "/api/feedback", { headers: { host: `evil.example:${port}` } })).status, 403);
      assert.equal((await raw(url, "/", { headers: { host: `localhost:${port}` } })).status, 200);
      const gesture = JSON.stringify({ id: "direction", agree: true });
      assert.equal((await raw(url, "/api/feedback", { ...JSON_POST, headers: { ...JSON_POST.headers, origin: "http://evil.example" }, body: [gesture] })).status, 403, "a gesture from another site");
      assert.equal((await raw(url, "/api/feedback", { ...JSON_POST, headers: { ...JSON_POST.headers, origin: `http://127.0.0.1:${port}` }, body: [gesture] })).status, 200, "a gesture from the page itself");
      assert.equal((await raw(url, "/before/captures/index@390.png")).status, 200);
      assert.equal((await raw(url, "/verdict.json")).status, 404, "only the page and its captures");
      assert.equal((await raw(url, "/before/captures/manifest.json")).status, 404);
      assert.equal((await raw(url, "/%2e%2e/%2e%2e/config.json")).status, 404, "nothing outside the run folder");
      assert.equal((await raw(url, "/..%2F..%2Fsecret.png")).status, 404);
      assert.equal((await raw(url, "/leak.png")).status, 404, "a link in the run folder to a file outside it");
      assert.equal((await raw(url, "/out/.aeom/secret.png")).status, 404, "a link in the run folder to a folder outside it");
      assert.equal((await raw(url, "/verdict.png")).status, 404, "a link named like a capture, to a file that is not one");
    } finally {
      stop();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});

test("a reason whose letters take several bytes is kept whole, though the network splits one of them in two", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-report-"));
  const home = await mkdtemp(join(tmpdir(), "aeom-home-"));
  try {
    await changedRun(join(dir, ".aeom", "runs", "run-8"));
    const { url, stop } = await serving(dir, ".aeom/runs/run-8", home);
    try {
      const body = Buffer.from(JSON.stringify({ id: "screen:/", agree: false, why: "Le café est trop fort" }));
      const cut = body.indexOf(0xc3) + 1;
      assert.equal((await raw(url, "/api/feedback", { ...JSON_POST, body: [body.subarray(0, cut), body.subarray(cut)] })).status, 200);
      const said = (await (await fetch(url + "api/feedback")).json()) as Said;
      assert.equal(said.mine[0]?.why, "Le café est trop fort");
      assert.equal((await raw(url, "/api/feedback", { ...JSON_POST, body: [JSON.stringify({ id: "screen:/", agree: true, why: "é".repeat(5001) })] })).status, 413, "over 10 KB");
    } finally {
      stop();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});

test("the same run, served from another folder or through a link, finds what was said and counts it once", async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "aeom-report-")));
  const home = await mkdtemp(join(tmpdir(), "aeom-home-"));
  try {
    const shop = join(dir, "shop");
    await changedRun(join(shop, ".aeom", "runs", "run-9"));
    await symlink(shop, join(dir, "link"));
    const first = await serving(shop, ".aeom/runs/run-9", home);
    try {
      assert.equal((await fetch(first.url + "api/feedback", { ...JSON_POST, body: JSON.stringify({ id: "journey:orders", agree: false }) })).status, 200);
    } finally {
      first.stop();
    }
    const again = await serving(home, join(dir, "link", ".aeom", "runs", "run-9"), home);
    try {
      const said = (await (await fetch(again.url + "api/feedback")).json()) as Said;
      assert.deepEqual(said.mine.map((f) => [f.id, f.agree]), [["journey:orders", false]], "what was said shows, served from elsewhere");
      await fetch(again.url + "api/feedback", { ...JSON_POST, body: JSON.stringify({ id: "journey:orders", agree: true }) });
      const now = (await (await fetch(again.url + "api/feedback")).json()) as Said;
      assert.deepEqual(now.rates.journeys, { agreed: 1, total: 1 }, "a second gesture on the same verdict replaces the first");
    } finally {
      again.stop();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});

test("a port that is not a whole number from 0 to 65535 prints the usage, without a stack trace", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-report-"));
  try {
    await snapshot(join(dir, ".aeom", "runs", "run-10", "before"), { "/": [] });
    await put(join(dir, ".aeom", "runs", "run-10", "verdict.json"), { nothingToRedo: true, line: "Measured: 1 screen.", failures: [] });
    for (const port of [["70000"], ["abc"], ["1.5"], ["-1"], [""], []]) {
      const { code, out } = await run(dir, ["report", ".aeom/runs/run-10", "--serve", "--port", ...port]);
      assert.equal(code, 1, `--port ${port.join("")}: ${out}`);
      assert.match(out, /Usage: aeom report/);
      assert.doesNotMatch(out, /\n\s+at /, "no stack trace");
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("served, the page stops after 2 hours with no request, and says so", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-report-"));
  const home = await mkdtemp(join(tmpdir(), "aeom-home-"));
  const was = process.env.AEOM_HOME;
  process.env.AEOM_HOME = home;
  let code: number | undefined;
  let serving = false;
  try {
    const R = join(dir, ".aeom", "runs", "run-11");
    await snapshot(join(R, "before"), { "/": [] });
    await put(join(R, "verdict.json"), { nothingToRedo: true, line: "Measured: 1 screen.", failures: [] });
    const said: string[] = [];
    t.mock.method(console, "log", (line: string) => said.push(line));
    t.mock.timers.enable({ apis: ["setTimeout"] });
    serving = true;
    void runReport([R, "--serve", "--port", "0"]).then((c) => (code = c));
    const turn = () => new Promise((r) => setImmediate(r));
    while (code === undefined && !said.some((l) => /http:\/\/127\.0\.0\.1:\d+\//.test(l))) await turn();
    const url = said.join("\n").match(/http:\/\/127\.0\.0\.1:\d+\//)![0];
    assert.match(said.join("\n"), /after 2 hours with no request/);
    const minutes = (n: number) => n * 60 * 1000;
    t.mock.timers.tick(minutes(90));
    assert.equal((await raw(url, "/")).status, 200);
    t.mock.timers.tick(minutes(90));
    for (let i = 0; i < 20; i++) await turn();
    assert.equal(code, undefined, "a request starts the 2 hours again");
    t.mock.timers.tick(minutes(30));
    for (let i = 0; i < 20 && code === undefined; i++) await turn();
    assert.equal(code, 0);
    assert.match(said.at(-1)!, /No request for 2 hours: the page is no longer served\. Serve it again with aeom report .*run-11 --serve\./);
  } finally {
    // Stopped either way, so a failure never leaves this test's server holding the process.
    if (code === undefined && serving) t.mock.timers.tick(2 * 60 * 60 * 1000);
    process.env.AEOM_HOME = was;
    await rm(dir, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});

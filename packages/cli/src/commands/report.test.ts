import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const AEOM = fileURLToPath(new URL("../index.js", import.meta.url));
const run = async (cwd: string, args: string[]) => {
  try {
    const { stdout, stderr } = await promisify(execFile)("node", [AEOM, ...args], { cwd });
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

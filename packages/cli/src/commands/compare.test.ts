import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

/** A snapshot with these checks and principles failing on `/`. */
async function snapshot(dir: string, checks: string[], principles: string[]) {
  await mkdir(join(dir, "reports"), { recursive: true });
  const check = { url: "http://x", checkedAt: "", widths: [1280], checks: ["cursor", "overflow", "contrast", "console"], pages: ["http://x/"], errors: [], findings: checks.map((c) => ({ check: c, url: "http://x/", width: 1280, message: "" })) };
  const ids = ["states", "grid"];
  const judge = { judgedAt: "", voters: ["1", "2", "3"], principles: ids.map((id) => ({ id, text: id })), failures: 0, pages: [{ page: "/", verdicts: ids.map((principle) => ({ principle, pass: !principles.includes(principle), votes: "", reasons: [], dissent: [], steps: [] })) }] };
  await writeFile(join(dir, "reports", "check.json"), JSON.stringify(check));
  await writeFile(join(dir, "reports", "judge.json"), JSON.stringify(judge));
}

test("aeom compare names what fails after and passed before, and --strict exits 1 on it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-compare-"));
  try {
    await snapshot(join(dir, "pages"), ["cursor", "contrast"], ["states"]);
    await snapshot(join(dir, "journeys"), ["overflow"], []);
    const { code, out } = await run(dir, ["compare", "pages", "journeys"]);
    assert.equal(code, 0, out);
    assert.match(out, /\/\s+3\s+1\s+↑ better\n\s+newly failing: overflow@1280/);
    const strict = await run(dir, ["compare", "pages", "journeys", "--strict"]);
    assert.equal(strict.code, 1);
    assert.match(strict.out, /1 page broke something that passed before: \//);
    assert.equal((await run(dir, ["compare", "pages", "pages", "--strict"])).code, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("with --strict, a page gone after exits 1, a new page that fails does not, and --journeys refuses it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-compare-"));
  try {
    await snapshot(join(dir, "before"), [], []);
    await snapshot(join(dir, "after"), [], []);
    const report = JSON.parse(await readFile(join(dir, "after", "reports", "check.json"), "utf8"));
    await writeFile(join(dir, "after", "reports", "check.json"), JSON.stringify({ ...report, pages: ["http://x/", "http://x/neuve"], findings: [{ check: "contrast", url: "http://x/neuve", width: 1280, message: "" }] }));
    assert.equal((await run(dir, ["compare", "before", "after", "--strict"])).code, 0, "a new page has nothing that passed before");
    const gone = await run(dir, ["compare", "after", "before", "--strict"]);
    assert.equal(gone.code, 1);
    assert.match(gone.out, /\/neuve\s+1\s+-\s+✗ missing after/);
    assert.equal((await run(dir, ["compare", "--journeys", "before", "after", "--strict"])).code, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("with the style kept, aeom compare leaves out the principles that judge the charter", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-compare-"));
  try {
    await snapshot(join(dir, "before"), [], ["states"]);
    await snapshot(join(dir, "after"), [], []);
    const judge = JSON.parse(await readFile(join(dir, "after", "reports", "judge.json"), "utf8"));
    judge.principles.push({ id: "not-generic", text: "" });
    judge.pages[0].verdicts.push({ principle: "not-generic", pass: false, votes: "", reasons: [], dissent: [], steps: [] });
    await writeFile(join(dir, "after", "reports", "judge.json"), JSON.stringify(judge));
    const counted = await run(dir, ["compare", "before", "after", "--strict"]);
    assert.match(counted.out, /\/\s+1\s+1\s+= same\n\s+newly failing: not-generic/);
    assert.equal(counted.code, 1);
    const kept = await run(dir, ["compare", "before", "after", "--strict", "--keep-style"]);
    assert.equal(kept.code, 0, kept.out);
    assert.match(kept.out, /\/\s+1\s+0\s+↑ better/);
    await mkdir(join(dir, ".aeom"), { recursive: true });
    await writeFile(join(dir, ".aeom", "config.json"), JSON.stringify({ style: "keep" }));
    assert.equal((await run(dir, ["compare", "before", "after", "--strict"])).code, 0, "the config keeps the style too");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

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
async function snapshot(dir: string, checks: string[], principles: string[], widths = [1280]) {
  await mkdir(join(dir, "reports"), { recursive: true });
  const check = { url: "http://x", checkedAt: "", widths, checks: ["cursor", "overflow", "contrast", "console"], pages: ["http://x/"], errors: [], findings: checks.map((c) => ({ check: c, url: "http://x/", width: 1280, message: "" })) };
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

test("two snapshots measured at different widths are not compared: aeom compare says which", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-compare-"));
  try {
    await snapshot(join(dir, "before"), ["contrast"], [], [390, 1280]);
    await snapshot(join(dir, "after"), [], [], [1280]);
    const { code, out } = await run(dir, ["compare", "before", "after"]);
    assert.equal(code, 1);
    assert.match(out, /Nothing compared: before was measured at 390, 1280 px and after at 1280 px: compare two measures made at the same widths\. Capture, check and judge after again with the run's --widths/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom compare says when the judges changed between the two measures: a principle that flips may be theirs, not the page's", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-compare-judges-"));
  try {
    await snapshot(join(dir, "before"), [], []);
    await snapshot(join(dir, "after"), [], ["states"]);
    const judged = async (snap: string, judges: unknown) => {
      const file = join(dir, snap, "reports", "judge.json");
      await writeFile(file, JSON.stringify({ ...JSON.parse(await readFile(file, "utf8")), judges }));
    };
    await judged("before", { models: ["claude-haiku-5-5"], principles: "base.md 1a2b3c4d" });
    await judged("after", { models: ["claude-sonnet-5-5"], principles: "base.md 9f8e7d6c" });
    const { out } = await run(dir, ["compare", "before", "after"]);
    assert.match(out, /The judges changed between the two measures: claude-haiku-5-5 on base\.md 1a2b3c4d, then claude-sonnet-5-5 on base\.md 9f8e7d6c\. A principle that flips may be theirs, not the page's\./);
    await judged("after", { models: ["claude-haiku-5-5"], principles: "base.md 1a2b3c4d" });
    assert.doesNotMatch((await run(dir, ["compare", "before", "after"])).out, /The judges changed/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom compare says what got better by being accepted, not by the run, and warns when only one measure says who judged it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-compare-accepted-"));
  try {
    await snapshot(join(dir, "before"), [], ["states"]);
    await snapshot(join(dir, "after"), [], []);
    const file = join(dir, "after", "reports", "judge.json");
    const after = JSON.parse(await readFile(file, "utf8"));
    after.pages[0].verdicts.find((v: { principle: string }) => v.principle === "states").accepted = { why: "the empty state is the spec's.", source: "CCTP 2.1" };
    await writeFile(file, JSON.stringify({ ...after, judges: { models: ["claude-sonnet-5-5"], principles: "base.md 9f8e7d6c" } }));
    const { out } = await run(dir, ["compare", "before", "after"]);
    assert.match(out, /Accepted since the first measure, as the product sheet says: \/ states: the empty state is the spec's\. \(seen: CCTP 2\.1\)\. Better by the sheet, not by the run\./);
    assert.match(out, /Only the second measure says who judged it: claude-sonnet-5-5 on base\.md 9f8e7d6c\. A principle that flips may be the judges', not the page's\./);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom compare names a link the front lost, makes its page worse, keeps the list, says a button gone to look at, and --strict exits 1 on it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-compare-lost-"));
  try {
    const captured = async (snap: string, links: { href: string; name: string }[] | null, lines: string[]) => {
      await mkdir(join(dir, snap, "captures"), { recursive: true });
      const page = { url: "http://x/", path: "/", files: [{ width: 1280, file: "index@1280.png" }], content: "index.content.yml", ...(links ? { links: "index.links.json" } : {}) };
      await writeFile(join(dir, snap, "captures", "manifest.json"), JSON.stringify({ url: "http://x", capturedAt: "", widths: [1280], pages: [page], errors: [] }));
      await writeFile(join(dir, snap, "captures", "index.content.yml"), `# / at 1280 px\n${lines.join("\n")}\n`);
      if (links) await writeFile(join(dir, snap, "captures", "index.links.json"), JSON.stringify(links));
    };
    await snapshot(join(dir, "before"), ["contrast"], ["states"]);
    await snapshot(join(dir, "after"), [], []);
    await captured("before", [{ href: "https://github.com/acme/radar", name: "Dossier GitHub" }, { href: "http://x/aide", name: "Aide" }], ['- button "Sauvegarder"']);
    await captured("after", [{ href: "http://x/aide/", name: "Aide et contact" }], ['- button "Enregistrer"']);
    const { code, out } = await run(dir, ["compare", "before", "after"]);
    assert.equal(code, 0, out);
    assert.match(out, /\/\s+2\s+0\s+↓ worse\n\s+lost: link "Dossier GitHub" to https:\/\/github\.com\/acme\/radar: no page has it any more/);
    assert.match(out, /To look at: no page names these any more; renamed, or gone: \/ button "Sauvegarder"\./);
    assert.deepEqual(JSON.parse(await readFile(join(dir, "after", "lost.json"), "utf8")).lost, [{ page: "/", what: 'link "Dossier GitHub" to https://github.com/acme/radar' }]);
    assert.equal(JSON.parse(await readFile(join(dir, "after", "compare.json"), "utf8"))[0].verdict, "worse", "section 5 sends it back as it does a page that got worse");
    const strict = await run(dir, ["compare", "before", "after", "--strict"]);
    assert.equal(strict.code, 1);
    assert.match(strict.out, /lost what it let its users do/);

    // Captured before AEOM kept the links: said, nothing counted as lost.
    await captured("before", null, []);
    const old = await run(dir, ["compare", "before", "after"]);
    assert.match(old.out, /before kept no page's links \(captured before AEOM kept them\): nothing counted as lost/);
    assert.match(old.out, /↑ better/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

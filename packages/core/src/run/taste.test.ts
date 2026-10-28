import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { addFeedback, addLesson, addRule, agreementRates, readFeedback, readLessons, readRules, runEvidence, runKey, tasteBrief, type Feedback } from "./index.js";

test("feedback is kept in words on this machine, the latest per verdict, and counted by category", async () => {
  const home = await mkdtemp(join(tmpdir(), "aeom-home-"));
  try {
    const base = { project: "/p", run: "run-1", at: "" };
    await addFeedback(home, { ...base, id: "screen:/", category: "screens", verdict: "/ kept", agree: false, why: "The header is too loud." });
    await addFeedback(home, { ...base, id: "screen:/", category: "screens", verdict: "/ kept", agree: true });
    await addFeedback(home, { ...base, id: "direction", category: "direction", verdict: "Direction: tissus", agree: true });
    await addFeedback(home, { ...base, run: "run-2", id: "journey:orders", category: "journeys", verdict: "See my orders kept", agree: false, why: "Still two clicks." });
    const all = await readFeedback(home);
    assert.equal(all.length, 3, "a second gesture on the same verdict replaces the first");
    assert.equal(all.find((f) => f.id === "screen:/")!.agree, true);
    assert.deepEqual(agreementRates(all), { direction: { agreed: 1, total: 1 }, screens: { agreed: 1, total: 1 }, journeys: { agreed: 0, total: 1 }, principles: { agreed: 0, total: 0 } });
    const text = await readFile(join(home, "taste", "feedback.jsonl"), "utf8");
    assert.match(text, /Still two clicks\./);
    assert.doesNotMatch(text, /\.png|data:image/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("a run is known by the project holding its folder, read through any link, wherever it is served from", async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "aeom-key-")));
  try {
    await mkdir(join(dir, "shop", ".aeom", "runs", "run-1"), { recursive: true });
    await symlink(join(dir, "shop"), join(dir, "link"));
    await symlink(join(dir, "shop", ".aeom", "runs", "run-1"), join(dir, "shop", ".aeom", "runs", "latest"));
    const key = { project: join(dir, "shop"), run: "run-1" };
    assert.deepEqual(await runKey(join(dir, "shop", ".aeom", "runs", "run-1")), key);
    assert.deepEqual(await runKey(join(dir, "link", ".aeom", "runs", "run-1")), key, "through a link to the project");
    assert.deepEqual(await runKey(join(dir, "shop", ".aeom", "runs", "latest")), key, "through a link to the run");
    await mkdir(join(dir, "elsewhere", "run-2"), { recursive: true });
    assert.deepEqual(await runKey(join(dir, "elsewhere", "run-2")), { project: join(dir, "elsewhere"), run: "run-2" }, "a run outside .aeom/runs is known by its own folder");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a rule the person says is kept at once, for this project or for them; the project's comes first, each said once", async () => {
  const home = await mkdtemp(join(tmpdir(), "aeom-rules-home-"));
  const project = await mkdtemp(join(tmpdir(), "aeom-rules-project-"));
  try {
    assert.equal(await addRule({ home, project, text: "Never a cream background.", at: "2026-10-28" }), "kept");
    assert.equal(await addRule({ home, project, text: "Buttons in capitals, as the brand writes them.", scope: "project", why: "their sign says so", at: "2026-10-28" }), "kept");
    assert.equal(await addRule({ home, project, text: "never a CREAM background", at: "2026-10-29" }), "already", "said once");
    const rules = await readRules({ home, project });
    assert.deepEqual(rules.map((r) => [r.scope, r.text]), [["project", "Buttons in capitals, as the brand writes them."], ["person", "Never a cream background."]]);
    assert.match(await readFile(join(project, ".aeom", "taste.md"), "utf8"), /^- Buttons in capitals, as the brand writes them\. \(said 2026-10-28: their sign says so\)$/m);
  } finally {
    await rm(home, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("what a run can teach: the verdicts the person disagreed with and the directions chosen over the advice, with their words", () => {
  const f = (id: string, agree: boolean, why?: string, run = "run-1", category: Feedback["category"] = "screens") => ({ project: "/p", run, id, category, verdict: id.startsWith("direction-advice") ? `The screening's advice: start from ${id.split(":")[1]}` : `${id.split(":")[1]} kept`, agree, ...(why ? { why } : {}), at: "" });
  const evidence = runEvidence([f("screen:/produits", false, "the table is still cramped"), f("screen:/", true), f("direction-advice:verriere", false, "Chose lutrin. Plus calme.", "run-1", "direction"), f("screen:/x", false, "too dense", "run-2")], { project: "/p", run: "run-1" });
  assert.deepEqual(evidence, ['disagreed with "/produits kept": the table is still cramped', 'chose otherwise than "The screening\'s advice: start from verriere": Chose lutrin. Plus calme.']);
});

test("a lesson rests on what a run showed: at most five a run, one learned again counts once more, the brief lists the most confirmed first and stays short", async () => {
  const home = await mkdtemp(join(tmpdir(), "aeom-lessons-"));
  try {
    for (let i = 0; i < 5; i++) assert.equal(await addLesson({ home, project: "/p", run: "/p:run-1", text: `Lesson ${i}.`, evidence: "disagreed with /produits", at: "2026-10-28" }), "kept");
    assert.equal(await addLesson({ home, project: "/p", run: "/p:run-1", text: "A sixth.", evidence: "x", at: "2026-10-28" }), "too many");
    assert.equal(await addLesson({ home, project: "/p", run: "/p:run-1", text: "No proof.", evidence: " ", at: "2026-10-28" }), "no evidence");
    assert.equal(await addLesson({ home, project: "/p", run: "/p:run-2", text: "lesson 3", evidence: "chose lutrin over verriere", at: "2026-10-29" }), "confirmed");
    const lessons = await readLessons(home);
    assert.equal(lessons.find((l) => l.text === "Lesson 3.")?.count, 2);
    const brief = tasteBrief({ rules: [{ scope: "project", text: "Buttons in capitals.", said: "2026-10-28" }], lessons, project: "/p" });
    assert.match(brief, /^This project's rules, first:\n- Buttons in capitals\.\n\nLessons from earlier runs, the most confirmed first:\n- Lesson 3\. \(2 runs\)/);
    const many = tasteBrief({ rules: Array.from({ length: 300 }, (_, i) => ({ scope: "person" as const, text: `Rule ${i}.`, said: "" })), lessons: [] });
    assert.ok(many.split("\n").length <= 200, "an index, never a book");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("a rule edited by hand is read as written; a rule said in both layers is said once, the project's", async () => {
  const home = await mkdtemp(join(tmpdir(), "aeom-rules-hand-"));
  const project = await mkdtemp(join(tmpdir(), "aeom-rules-hand-p-"));
  try {
    await mkdir(join(project, ".aeom"), { recursive: true });
    await writeFile(join(project, ".aeom", "taste.md"), "# Taste\r\n\r\n- Buttons in capitals (as the sign has them).\r\n* No stock photos.\r\n- Never a cream background. (said 2026-10-28: the brand (old) did)\r\n");
    await mkdir(join(home, "taste"), { recursive: true });
    await writeFile(join(home, "taste", "rules.md"), "- never a cream background (said 2026-10-01)\n");
    const rules = await readRules({ home, project });
    assert.deepEqual(rules.map((r) => r.text), ["Buttons in capitals (as the sign has them).", "No stock photos.", "Never a cream background.", "never a cream background"]);
    assert.doesNotMatch(tasteBrief({ rules, lessons: [] }), /The person's own rules/, "said once, as the project says it");
  } finally {
    await rm(home, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("a lesson stays with its project until a second project shows it too; then it is the person's", () => {
  const lesson = (text: string, projects: string[]) => ({ text, evidence: ["x"], runs: projects.map((p) => `${p}:run-1`), projects, count: projects.length, first: "", last: "" });
  const lessons = [lesson("Calm over density for a preparation tool.", ["/radar"]), lesson("Never a gradient on text.", ["/radar", "/love"])];
  assert.match(tasteBrief({ rules: [], lessons, project: "/radar" }), /Never a gradient[\s\S]*Calm over density/, "the most confirmed first");
  const elsewhere = tasteBrief({ rules: [], lessons, project: "/client" });
  assert.doesNotMatch(elsewhere, /Calm over density/, "one client's lesson never reaches another's brief");
  assert.match(elsewhere, /Never a gradient on text\. \(2 runs\)/);
  assert.equal(tasteBrief({ rules: [], lessons: [], project: "/client" }), "");
});

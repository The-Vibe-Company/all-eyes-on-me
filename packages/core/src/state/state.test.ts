import assert from "node:assert/strict";
import { test } from "node:test";
import { markAgent, markRun, newRunState, readRunState, resumePlan, type RunState } from "./index.js";

const AT = "2026-10-10T19:00:00.000Z";

test("a run keeps where it is: its phase, the step of the skill, the values it set, and when", () => {
  let s = newRunState("run-1", AT);
  s = markRun(s, { phase: "understand", step: "2c.3", at: AT });
  s = markRun(s, { phase: "directions", step: "2b.3", set: { MAIN: "/p", WT: "/wt", KIT_BASE: "abc" }, at: "2026-10-10T19:30:00.000Z" });
  assert.equal(s.phase, "directions");
  assert.equal(s.step, "2b.3");
  assert.deepEqual(s.vars, { MAIN: "/p", WT: "/wt", KIT_BASE: "abc" });
  assert.deepEqual(s.history.map((h) => h.phase), ["understand", "directions"]);
  assert.throws(() => markRun(s, { phase: "", at: AT }), /A phase is named/);
  assert.throws(() => markRun(s, { phase: "x", set: { "bad key": "1" }, at: AT }), /bad key is not a name a shell can set/);
});

test("each agent is kept with its worktree, its branch, the commit it started from and where it is", () => {
  let s = newRunState("run-1", AT);
  s = markAgent(s, { name: "dir-topo", kind: "direction worker", status: "launched", worktree: "/wt/run-1-dir-topo", branch: "aeom/run-1-dir-topo", from: "abc", at: AT });
  s = markAgent(s, { name: "dir-topo", status: "done", at: AT });
  assert.deepEqual(s.agents, [{ name: "dir-topo", kind: "direction worker", status: "done", worktree: "/wt/run-1-dir-topo", branch: "aeom/run-1-dir-topo", from: "abc", at: AT }]);
  assert.throws(() => markAgent(s, { name: "x", status: "gone" as never, at: AT }), /launched, done, merged or refused/);
  assert.throws(() => markAgent(s, { name: "new-one", status: "done", at: AT }), /new-one was never launched/);
});

test("the plan to resume says what to set again, what each agent left, and where to go on", () => {
  let s: RunState = markRun(newRunState("run-1", AT), { phase: "directions", step: "2b.4", set: { MAIN: "/p", WT: "/wt" }, at: AT });
  const agent = (name: string, status: "launched" | "done" | "merged" | "refused") => {
    s = markAgent(s, { name, kind: "direction worker", status: "launched", worktree: `/wt/${name}`, branch: `aeom/run-1-${name}`, from: "abc", at: AT });
    if (status !== "launched") s = markAgent(s, { name, status, at: AT });
  };
  agent("topo", "done");
  agent("brume", "launched");
  agent("grotte", "launched");
  agent("bivouac", "launched");
  agent("balisage", "merged");
  s = markAgent(s, { name: "juge-2", kind: "screening judge", status: "launched", at: AT });
  const plan = resumePlan(s, {
    worktrees: { "/wt/topo": true, "/wt/brume": true, "/wt/grotte": true, "/wt/bivouac": false, "/wt/balisage": false },
    commits: { "aeom/run-1-topo": 3, "aeom/run-1-brume": 2, "aeom/run-1-grotte": 0, "aeom/run-1-bivouac": null, "aeom/run-1-balisage": 1 },
  });
  assert.match(plan, /^run-1 stopped in "directions", at step 2b\.4 of the skill\./);
  assert.match(plan, /export RUN=run-1\nexport MAIN=\/p\nexport WT=\/wt/);
  assert.match(plan, /topo +direction worker +done, 3 commits: check it as its step says, then go on with it/);
  assert.match(plan, /brume +direction worker +stopped with 2 commits: its work may be unfinished; check that it stays in its files, commit what is left, run its checks as its step says, then go on with it/);
  assert.match(plan, /grotte +direction worker +stopped with nothing committed: if its worktree holds work in its files, commit it and check it; otherwise launch it again in \/wt\/grotte/);
  assert.match(plan, /bivouac +direction worker +its worktree and its branch are gone: create them again from abc and launch it again/);
  assert.match(plan, /balisage +direction worker +merged/);
  assert.match(plan, /juge-2 +screening judge +launched, not done: launch it again/);
  assert.match(plan, /Go on at step 2b\.4\.$/);
});

test("a run taken up keeps its options, and says when its branch does not exist yet or moved since", () => {
  const s = markRun(newRunState("run-1", AT), { phase: "pages", step: "4", options: ["--sans-pr", "--garder-le-style"], branchAt: "aaaaaaa1", at: AT });
  assert.match(resumePlan(s, { worktrees: {}, commits: {}, runBranch: "aaaaaaa1" }), /It was asked with --sans-pr --garder-le-style: take it up with the same options\.\nCheck out aeom\/run-1\./);
  assert.match(resumePlan(s, { worktrees: {}, commits: {}, runBranch: "bbbbbbb2" }), /The run branch moved since the run last noted where it was \(aaaaaaa → bbbbbbb\)/);
  assert.match(resumePlan(markRun(newRunState("run-2", AT), { phase: "cost", at: AT }), { worktrees: {}, commits: {}, runBranch: null }), /aeom\/run-2 does not exist: the run stopped before it changed the project/);
});

test("a worker whose branch the run branch already holds is merged; one whose commits cannot be counted says so", () => {
  let s = markAgent(newRunState("run-1", AT), { name: "kit", kind: "kit worker", status: "launched", worktree: "/wt/kit", branch: "aeom/run-1-kit", from: "abc", at: AT });
  s = markAgent(s, { name: "page", kind: "page worker", status: "launched", worktree: "/wt/page", branch: "aeom/run-1-page", from: "zzz", at: AT });
  const plan = resumePlan(s, { worktrees: { "/wt/kit": true, "/wt/page": true }, commits: { "aeom/run-1-kit": 2, "aeom/run-1-page": "unknown" }, merged: { "aeom/run-1-kit": true } });
  assert.match(plan, /kit +kit worker +its branch is already in the run branch: mark it merged/);
  assert.match(plan, /page +page worker +its commits cannot be counted from zzz/);
});

test("an older or partial state file is read with what it leaves out filled in", () => {
  const s = readRunState({ run: "run-1", phase: "pages" }, "run-1")!;
  assert.deepEqual([s.agents, s.vars, s.options, s.history], [[], {}, [], []]);
  assert.equal(readRunState([], "run-1"), null);
});

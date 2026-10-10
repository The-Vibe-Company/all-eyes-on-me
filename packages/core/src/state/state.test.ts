import assert from "node:assert/strict";
import { test } from "node:test";
import { markAgent, markRun, newRunState, resumePlan, type RunState } from "./index.js";

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
  assert.match(plan, /topo +direction worker +done, 3 commits: check it and go on with it/);
  assert.match(plan, /brume +direction worker +stopped with 2 commits: its work is there; check that it stays in its files, commit what is left, and go on with it/);
  assert.match(plan, /grotte +direction worker +stopped with nothing committed: launch it again in \/wt\/grotte/);
  assert.match(plan, /bivouac +direction worker +its worktree and its branch are gone: create them again from abc and launch it again/);
  assert.match(plan, /balisage +direction worker +merged/);
  assert.match(plan, /juge-2 +screening judge +launched, not done: launch it again/);
  assert.match(plan, /Go on at step 2b\.4\.$/);
});

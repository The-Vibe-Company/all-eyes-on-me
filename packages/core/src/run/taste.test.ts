import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { addFeedback, agreementRates, readFeedback, runKey } from "./index.js";

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

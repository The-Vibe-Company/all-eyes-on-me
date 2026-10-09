import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { addFeedback, agreementRates, readFeedback } from "./index.js";

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

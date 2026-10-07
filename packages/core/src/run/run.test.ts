import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { CheckReport } from "../checks/index.js";
import type { JudgeReport } from "../judge/index.js";
import { comparePages, loadConfig, scorePages, snapshot } from "./index.js";

const check = (findings: [string, string][]): CheckReport => ({
  url: "http://x.test/",
  checkedAt: "",
  widths: [390, 1280],
  checks: ["cursor", "overflow", "contrast", "console"],
  pages: ["http://x.test/", "http://x.test/commandes"],
  errors: [],
  findings: findings.map(([path, check]) => ({ check: check as "cursor", url: `http://x.test${path}`, width: 1280, message: "" })),
});
const judge = (failing: [string, string][]): JudgeReport => ({
  judgedAt: "",
  voters: ["1", "2", "3"],
  principles: [{ id: "states", text: "" }, { id: "hierarchy", text: "" }],
  pages: ["/", "/commandes"].map((page) => ({
    page,
    verdicts: ["states", "hierarchy"].map((principle) => ({
      principle,
      pass: !failing.some(([p, id]) => p === page && id === principle),
      votes: "",
      reasons: [],
    })),
  })),
  failures: failing.length,
});

test("a page's score counts its failing checks and its failing principles", () => {
  const scores = scorePages(check([["/", "cursor"], ["/", "contrast"]]), judge([["/commandes", "states"]]));
  assert.deepEqual(scores, [
    { page: "/", checks: 2, principles: 0, total: 2 },
    { page: "/commandes", checks: 0, principles: 1, total: 1 },
  ]);
});

test("each page is better, the same, or worse than before", () => {
  const before = scorePages(check([["/", "cursor"], ["/", "contrast"]]), judge([["/commandes", "states"]]));
  const after = scorePages(check([["/", "cursor"]]), judge([["/commandes", "states"], ["/commandes", "hierarchy"]]));
  assert.deepEqual(
    comparePages(before, after).map((c) => [c.page, c.verdict]),
    [["/", "better"], ["/commandes", "worse"]],
  );
  assert.equal(comparePages(before, before)[0]!.verdict, "same");
});

test("the project config gives the defaults for url and start, and is optional", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-config-"));
  try {
    assert.deepEqual(await loadConfig(dir), {});
    await mkdir(join(dir, ".aeom"));
    await writeFile(join(dir, ".aeom", "config.json"), JSON.stringify({ url: "http://localhost:4317", start: "node app.js" }));
    assert.deepEqual(await loadConfig(dir), { url: "http://localhost:4317", start: "node app.js" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a snapshot copies the captures and the reports, so the next run cannot overwrite them", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-snapshot-"));
  try {
    await mkdir(join(dir, ".aeom", "captures"), { recursive: true });
    await mkdir(join(dir, ".aeom", "reports"), { recursive: true });
    await writeFile(join(dir, ".aeom", "captures", "index@390.png"), "png");
    await writeFile(join(dir, ".aeom", "reports", "check.json"), "{}");
    await snapshot(join(dir, ".aeom"), join(dir, ".aeom", "runs", "r1", "before"));
    await writeFile(join(dir, ".aeom", "reports", "check.json"), "changed");
    assert.equal(await readFile(join(dir, ".aeom", "runs", "r1", "before", "reports", "check.json"), "utf8"), "{}");
    assert.equal(await readFile(join(dir, ".aeom", "runs", "r1", "before", "captures", "index@390.png"), "utf8"), "png");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

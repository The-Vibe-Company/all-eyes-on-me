import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { CheckReport } from "../checks/index.js";
import type { JudgeReport } from "../judge/index.js";
import { comparePages, ConfigError, isInside, loadConfig, scorePages, snapshot, SnapshotPathError } from "./index.js";

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

test("a check failing several times on a page counts once", () => {
  const scores = scorePages(check([["/", "cursor"], ["/", "cursor"], ["/", "overflow"]]), undefined);
  assert.equal(scores.find((s) => s.page === "/")!.checks, 2);
});

test("a page missing after is never better, and a page found only after is new", () => {
  const before = [{ page: "/", checks: 3, principles: 0, total: 3 }];
  const after = [{ page: "/new", checks: 0, principles: 0, total: 0 }];
  assert.deepEqual(comparePages(before, after).map((c) => [c.page, c.verdict]), [["/", "missing"], ["/new", "new"]]);
});

test("a broken config is an error, not an absent one", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-config-"));
  try {
    await mkdir(join(dir, ".aeom"));
    await writeFile(join(dir, ".aeom", "config.json"), "{ nope");
    await assert.rejects(loadConfig(dir), ConfigError);
    await writeFile(join(dir, ".aeom", "config.json"), JSON.stringify({ url: 123 }));
    await assert.rejects(loadConfig(dir), /"url" must be a non-empty string/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a snapshot never deletes what it copies", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-snapshot-"));
  try {
    await mkdir(join(dir, ".aeom", "captures"), { recursive: true });
    await writeFile(join(dir, ".aeom", "captures", "keep.png"), "png");
    await assert.rejects(snapshot(join(dir, ".aeom"), dir), SnapshotPathError);
    await assert.rejects(snapshot(join(dir, ".aeom"), join(dir, ".aeom")), SnapshotPathError);
    await assert.rejects(snapshot(join(dir, ".aeom"), join(dir, ".aeom", "captures", "x")), SnapshotPathError);
    assert.equal(await readFile(join(dir, ".aeom", "captures", "keep.png"), "utf8"), "png");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a folder whose name starts with two dots is still inside its parent", () => {
  assert.equal(isInside("/p/.aeom/captures/..snapshot", "/p/.aeom/captures"), true);
  assert.equal(isInside("/p/.aeom", "/p/.aeom/captures"), false);
  assert.equal(isInside("/p/other", "/p/.aeom"), false);
});

test("a snapshot is refused through a symlink that points into what it copies", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-snapshot-"));
  try {
    await mkdir(join(dir, ".aeom", "captures"), { recursive: true });
    await writeFile(join(dir, ".aeom", "captures", "keep.png"), "png");
    await symlink(join(dir, ".aeom", "captures"), join(dir, "alias"));
    await assert.rejects(snapshot(join(dir, ".aeom"), join(dir, "alias", "x")), SnapshotPathError);
    await assert.rejects(snapshot(join(dir, ".aeom"), join(dir, ".aeom", "captures", "..snap")), SnapshotPathError);
    assert.equal(await readFile(join(dir, ".aeom", "captures", "keep.png"), "utf8"), "png");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a config that cannot be read is a config error", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-config-"));
  try {
    await mkdir(join(dir, ".aeom", "config.json"), { recursive: true });
    await assert.rejects(loadConfig(dir), (error: unknown) => error instanceof ConfigError && /cannot be read/.test((error as Error).message));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// The bench stays gradable: every app it lists starts from its own folder,
// has its key journeys, and has defects AEOM can grade against.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { prepare } from "./prepare.mjs";

const root = new URL("../", import.meta.url).pathname;
const bench = JSON.parse(readFileSync(join(root, "bench/bench.json"), "utf8"));
const aeom = join(root, "packages/cli/dist/index.js");

test("every bench app has its folder, a start command, key journeys and a list of defects AEOM can grade against", () => {
  assert.ok(bench.apps.length >= 1);
  for (const app of bench.apps) {
    assert.ok(existsSync(join(root, app.app)), `${app.slug}: ${app.app} is missing`);
    assert.ok(app.config?.start && app.config?.url, `${app.slug}: no start or url`);
    const journeys = readdirSync(join(root, app.journeys)).filter((f) => f.endsWith(".json"));
    assert.ok(journeys.length >= 3 && journeys.length <= 5, `${app.slug}: 3 to 5 key journeys, found ${journeys.length}`);
    const defects = JSON.parse(readFileSync(join(root, app.defects), "utf8"));
    for (const d of defects.defects.filter((d) => d.journey)) assert.ok(journeys.includes(`${d.journey}.json`), `${d.id}: no journey ${d.journey}`);
  }
});

test("the defects of every bench app pass aeom bench grade's check", () => {
  const dir = mkdtempSync(join(tmpdir(), "aeom-defects-"));
  try {
    for (const app of bench.apps) {
      // A run that did not start grades the list on nothing: it only checks the list.
      execFileSync("node", [aeom, "bench", "grade", dir, "--defects", join(root, app.defects), "--app", app.slug, "--not-started", "checking the list"], { cwd: dir, stdio: "pipe" });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a bench app is prepared in a fresh git repository, clean, with its config and journeys, and never over anything", () => {
  const dir = mkdtempSync(join(tmpdir(), "aeom-prepare-"));
  try {
    const app = bench.apps[0];
    prepare(app.slug, join(dir, "app"));
    assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: join(dir, "app"), encoding: "utf8" }), "");
    assert.equal(execFileSync("git", ["branch", "--show-current"], { cwd: join(dir, "app"), encoding: "utf8" }).trim(), "main");
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "app", ".aeom", "config.json"), "utf8")), app.config);
    assert.deepEqual(readdirSync(join(dir, "app", ".aeom", "journeys")).sort(), readdirSync(join(root, app.journeys)).sort());
    assert.match(readFileSync(join(dir, "app", ".gitignore"), "utf8"), /^\.aeom\/runs\/$/m);
    writeFileSync(join(dir, "other"), "x");
    assert.throws(() => prepare(app.slug, dir), /not empty/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

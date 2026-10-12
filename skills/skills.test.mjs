// The /aeom skill is split by phase: SKILL.md holds what every run needs, and
// each phase waits in its own file. These tests fail when a link or a section
// it points to goes missing, or when SKILL.md grows back.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const dir = new URL("./aeom/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
const read = (f) => readFileSync(new URL(f, dir), "utf8");

test("every file the skill links to exists", () => {
  for (const file of files) {
    for (const [, target] of read(file).matchAll(/\]\(([a-z0-9-]+\.md)\)/g)) assert.ok(existsSync(new URL(target, dir)), `${file} links to ${target}, which does not exist`);
  }
});

test("every section the skill names is a heading of one of its files", () => {
  const all = files.map(read).join("\n");
  const headings = new Set([...all.matchAll(/^## (\d[a-z]?)\./gm)].map(([, n]) => n));
  // « section 2b », « Section 4 », « sections 3 to 5 »: every number named, the last of a range too.
  for (const [, first, last] of all.matchAll(/\bsections? (\d[a-z]?)(?: (?:to|and) (\d[a-z]?))?\b/gi)) {
    for (const n of [first, last].filter(Boolean)) assert.ok(headings.has(n), `section ${n} is named but no file of the skill has it`);
  }
});

test("SKILL.md keeps what every run needs, and stays under 6,000 words", () => {
  const words = read("SKILL.md").split(/\s+/).filter(Boolean).length;
  assert.ok(words < 6000, `SKILL.md is ${words} words: move a phase to its own file`);
  for (const phase of ["phase-understand.md", "phase-directions.md", "phase-wave.md"]) assert.match(read("SKILL.md"), new RegExp(`\\]\\(${phase}\\)`), `SKILL.md says when to read ${phase}`);
});

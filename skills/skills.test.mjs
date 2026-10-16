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
  for (const phase of ["phase-understand.md", "phase-directions.md", "phase-wave.md", "phase-prompt.md", "phase-build.md"]) assert.match(read("SKILL.md"), new RegExp(`\\]\\(${phase}\\)`), `SKILL.md says when to read ${phase}`);
});

// A run launches its workers and judges as AEOM's own agents: Sonnet, and only
// the tools they use, so no step re-reads the MCP servers and skills of a general agent.
const agents = new URL("../agents/claude/", import.meta.url);
const frontmatter = (text) => Object.fromEntries(text.split("---")[1].trim().split("\n").map((l) => [l.slice(0, l.indexOf(":")).trim(), l.slice(l.indexOf(":") + 1).trim()]));

test("the agents a run launches run on Sonnet, with only the tools they use", () => {
  const used = new Set(["Read", "Write", "Edit", "Bash", "Glob", "Grep"]);
  for (const name of ["aeom-worker", "aeom-judge"]) {
    const meta = frontmatter(readFileSync(new URL(`${name}.md`, agents), "utf8"));
    assert.equal(meta.name, name);
    assert.equal(meta.model, "sonnet", `${name} runs on Sonnet`);
    const tools = meta.tools.split(",").map((t) => t.trim());
    for (const tool of tools) assert.ok(used.has(tool), `${name} has ${tool}, which no AEOM agent uses`);
  }
  assert.equal(frontmatter(readFileSync(new URL("aeom-judge.md", agents), "utf8")).omitClaudeMd, "true", "a judge reads principles, not the project's rules");
  assert.match(readFileSync(new URL("../README.md", import.meta.url), "utf8"), /ln -s "\$PWD\/agents\/claude\/aeom-worker\.md" "\$PWD\/agents\/claude\/aeom-judge\.md" ~\/\.claude\/agents\//);
});

test("every worker and judge is launched as an AEOM agent, with a way when the agents are not installed", () => {
  const wave = read("phase-wave.md");
  const judge = readFileSync(new URL("./aeom-judge/SKILL.md", import.meta.url), "utf8");
  assert.match(wave, /`subagent_type: "aeom-worker"`[\s\S]*lists no `aeom-worker`[\s\S]*`general-purpose` with `model: "sonnet"` \(a direction worker with this session's model\)/);
  // Every run reads SKILL.md, a judging alone included: the fallback and the install line are said there, once.
  const agentsPart = read("SKILL.md").split("**AEOM's agents.**")[1]?.split("\n\n")[0] ?? "";
  assert.match(agentsPart, /never the Skill tool/);
  assert.match(agentsPart, /`general-purpose` with `model: "sonnet"` \(a direction worker with this session's model\)/);
  assert.match(agentsPart, /ln -s "\$A"\/agents\/claude\/aeom-\*\.md ~\/\.claude\/agents\//);
  assert.match(judge, /`subagent_type: "aeom-judge"`[\s\S]*lists no `aeom-judge`, launch `general-purpose` with `model: "sonnet"`/);
  for (const file of [...files.map((f) => `aeom/${f}`), "aeom-judge/SKILL.md"]) {
    const text = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(text, /\b(worker|judge|voter)s? on Sonnet\b|lighter model/i, `${file} names a model where it should name the agent`);
    // The agent and the judge skill share a name: a launch always says « agent ».
    assert.doesNotMatch(text, /\ban? `aeom-(worker|judge)`(?! agent)/, `${file} launches an AEOM agent without saying it is one`);
  }
  // The directions keep the session's own model.
  assert.match(read("phase-directions.md"), /each an `aeom-worker` agent \(\*\*Briefing any worker\*\*\) on this session's own model/);
});

test("the session reads little: captures sent unopened, no browser pane, no polling", () => {
  const section = read("SKILL.md").split("## What the session reads")[1]?.split("\n## ")[0] ?? "";
  assert.match(section, /never open it to show it/);
  assert.match(section, /never in a browser pane/);
  assert.match(section, /never `sleep` to poll/);
});

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
  for (const phase of ["phase-understand.md", "phase-directions.md", "phase-wave.md", "phase-mockups.md", "phase-build.md"]) assert.match(read("SKILL.md"), new RegExp(`\\]\\(${phase}\\)`), `SKILL.md says when to read ${phase}`);
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

test("a run never tells the person what it costs, nor waits for a go on it", () => {
  for (const file of [...files.map((f) => `aeom/${f}`), "aeom-judge/SKILL.md"]) {
    const text = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(text, /what the run will cost|wait(s)? for the go|your go|show the table|its total line/i, `${file} tells a cost, or waits on it`);
  }
});

test("each direction is drawn on a structure of its own, by a worker who never sees the front as it is, and the screening names two on one skeleton", () => {
  assert.match(read("directions.md"), /^## A structure of its own$/m);
  const mockupBrief = read("phase-mockups.md").split("**Mockup brief.**")[1] ?? "";
  assert.match(mockupBrief, /`<page>\.content\.yml` of step 3, never its capture/);
  assert.match(mockupBrief, /You never see the front as it is: open no capture of it, none of the project's style sheets or components, and no other direction's folder/);
  const directionBrief = read("phase-directions.md").split("**Direction brief.**")[1]?.split("**Screening brief.**")[0] ?? "";
  assert.match(directionBrief, /content\.yml` from section 1, never its capture/);
  assert.doesNotMatch(directionBrief, /captures of (the|these) screens/, "a direction worker is never shown the front as it is");
  const screening = read("phase-directions.md").split("**Screening brief.**")[1]?.split("**Duel brief.**")[0] ?? "";
  assert.match(screening, /each direction's structure/);
  assert.match(screening, /the same header, the same search bar, the same cards in the same places, only the colours and the type changing/);
  assert.match(screening, /Of two directions on one skeleton, name only the one that follows its structure less/);
});

test("every worker writes only the product's own words, and the checks that name what slips through are said to it", () => {
  const rule = read("phase-wave.md").split("- **Only the product's own words.**")[1]?.split("\n")[0] ?? "";
  assert.match(rule, /« click here »/);
  assert.match(rule, /a banner saying it is a mockup/);
  assert.match(rule, /« \[PRIX\] »/);
  assert.match(rule, /`placeholder`, `ai-text`, `hollow-words`/);
  assert.match(read("phase-mockups.md").split("**Mockup brief.**")[1] ?? "", /Only the product's own words: no sentence about the interface or the demo/);
  assert.match(read("phase-build.md").split("**Screen brief.**")[1] ?? "", /no sentence about the interface or the demo, no hole to fill, no hollow word/);
});

test("every list of what the style kept leaves to the charter names the same checks as the CLI", () => {
  const verdict = readFileSync(new URL("../packages/core/src/run/verdict.ts", import.meta.url), "utf8");
  const checks = JSON.parse(verdict.match(/STYLE_CHECKS = (\[[^\]]*\])/)[1]);
  for (const file of ["SKILL.md", "phase-wave.md"]) {
    for (const list of read(file).matchAll(/`gradient-text`[^.:)]*/g)) {
      for (const check of checks) assert.ok(list[0].includes(`\`${check}\``), `${file} leaves ${check} out of a list of the charter's checks: ${list[0]}`);
    }
  }
});

test("the person chooses with a comparison, never in their place, and may choose a mix", () => {
  const screening = read("phase-directions.md").split("**Screening brief.**")[1]?.split("**Duel brief.**")[0] ?? "";
  assert.match(screening, /"compare": \{"<source>": \{"strong": "<…>", "weak": "<…>", "fit": "<…>"\}\}, "start": \{"source": "<one of them>", "why": "<…>"\}/);
  for (const file of ["phase-directions.md", "phase-mockups.md"]) {
    assert.match(read(file), /aeom tournament compare --dir "\$MAIN\/\.aeom\/runs\/\$RUN\/directions" --from/, `${file} checks the comparison before it asks`);
    assert.match(read(file), /the screening's advice, said as advice/);
    assert.match(read(file), /a mix of two \(« Lutrin with the air of Verrière »\)/);
    assert.match(read(file), /\*\*A mix\*\*/);
  }
});

test("no function is lost: every worker keeps what a page lets its users do, and the measure puts back what is lost", () => {
  const wave = read("phase-wave.md");
  assert.match(wave, /Every link, button and field it has stays reachable, here or on another page: `aeom compare` names what is lost/);
  assert.match(wave, /keeping every link the app's navigation had/);
  assert.match(wave, /`lost\.json`, beside the comparison\), makes its page worse/);
  assert.match(wave, /One lost from every page that had it was lost by the kit/);
  assert.match(wave, /may only have been renamed: look at the page's code/);
});

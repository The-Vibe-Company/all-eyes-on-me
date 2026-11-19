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

test("/aeom build builds what a sentence asks, inside the standard: it says first what it builds, refuses what needs a back end, holds the result to aeom review and the guard, and needs a standard", () => {
  assert.doesNotMatch(read("SKILL.md"), /comes later: say so in one line and stop/, "a change asked in a sentence is built, no longer put off");
  assert.match(read("SKILL.md"), /\*\*`\/aeom build`\*\* with a sentence builds what it asks inside the standard \(section 2f\)/);
  const asked = read("phase-build.md").split("## 2f.")[1] ?? "";
  assert.match(asked, /^ What is asked in a sentence \(`\/aeom build "<what is asked>"/);
  assert.match(asked, /When `\.aeom\/standard\.md` does not exist[^\n]*propose `\/aeom` first/, "no standard: said, and a run of /aeom proposed");
  assert.match(asked, /A standard not committed yet is the run branch's first commit/, "« rien à refaire » leaves it uncommitted: built on all the same");
  assert.match(asked, /a piece of data the front does not receive yet, a call to a server it does not make yet[^\n]*business logic[^\n]*refuse: say what the back would have to provide/);
  assert.match(asked, /Do not wait for an answer: the run goes on\./);
  assert.match(asked, /`\.aeom\/runs\/\$RUN\/request`/);
  assert.match(asked, /`\.aeom\/runs\/\$RUN\/plan`/);
  assert.match(asked, /for each route of the plan, `open-<route's slug>\.json`, a journey that only opens it/, "the guard sees the calls of every screen of the plan, crossed by a key journey or not");
  assert.match(asked, /aeom journey --journeys \.aeom\/runs\/\$RUN\/journeys --out \.aeom\/runs\/\$RUN\/journeys-before/);
  assert.match(asked, /aeom journey --journeys \.aeom\/runs\/\$RUN\/journeys --out \.aeom\/runs\/\$RUN\/journeys-end/);
  assert.match(asked, /`aeom capture`, `check`, `journey` and `review` take `--widths "\$WIDTHS"`/, "only the commands that have --widths");
  assert.match(asked, /what the guard still refuses, a call or a journey that no longer reaches its end, stops the run before its PR/);
  assert.match(asked, /aeom guard \.aeom\/runs\/\$RUN\/journeys-before \.aeom\/runs\/\$RUN\/journeys-end --base \$BASE`/, "an app: no call it did not make before");
  assert.match(asked, /aeom guard --from-scratch \.aeom\/runs\/\$RUN\/journeys-end --base \$BASE`, with `--api <url>`/, "a front built from scratch: no call but its API's");
  assert.match(asked, /aeom review --base \$BASE --summary \.aeom\/runs\/\$RUN\/review\.md/);
  assert.match(asked, /--phase build/);
  assert.match(asked, /--phase review/);
  const brief = asked.split("**Asked brief.**")[1] ?? "";
  assert.match(brief, /its tokens, and the kit's components wherever the kit has the part/);
  assert.match(brief, /Change neither the kit's files nor `\.aeom\/standard\.md`\./);
  assert.match(brief, /no new call to a server, no data written in the page, no business logic/);
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

test("the result page speaks the person's language, and a run of directions has its own page, every round in it", () => {
  assert.match(read("SKILL.md"), /aeom report \.aeom\/runs\/\$RUN --serve --open --lang \$AEOM_LANG/);
  assert.match(read("phase-mockups.md"), /8\. \*\*The end\.\*\* Serve the run's page, as \*\*The result page, served\*\* in SKILL\.md says: every round, the last first/);
});

test("the judges write in the person's language: kept in the run's mark, read by every voter from aeom principles, ids unchanged", () => {
  assert.match(read("SKILL.md"), /\*\*The person's language\.\*\* `fr` or `en`, as they write to you, kept in the first mark \(`--set AEOM_LANG=fr` or `en`\)\. Every judge writes its sentences in it: its brief runs `aeom principles --lang \$AEOM_LANG`/);
  assert.match(read("phase-mockups.md"), /--set "AEOM_LANG=<fr or en>"/, "a run of directions keeps it too");
  for (const brief of ["**Screening brief.**", "**Duel brief.**"]) assert.match(read("phase-directions.md").split(brief)[1] ?? "", /^ Give [^.]*the person's language \(`AEOM_LANG`\)/, brief);
  assert.doesNotMatch(["SKILL.md", "phase-mockups.md", "phase-build.md", "phase-directions.md"].map(read).join("") + readFileSync(new URL("./aeom-judge/SKILL.md", import.meta.url), "utf8"), /\$LANG\b|(?<![A-Z_])LANG=/, "never the shell's own LANG");
  const judge = readFileSync(new URL("./aeom-judge/SKILL.md", import.meta.url), "utf8");
  assert.match(judge, /\*\*In the person's language\.\*\*[^\n]*every brief below runs `aeom principles --lang \$AEOM_LANG`[^\n]*keeps each principle's id and each key of the JSON as they are/);
  assert.match(readFileSync(new URL("../agents/claude/aeom-judge.md", import.meta.url), "utf8"), /Write your reasons in the language `aeom principles` asks for, and every id and key as it is\./);
});

test("a voter names what it sees in its own words, and a vote too thin to count is relaunched", () => {
  const judge = readFileSync(new URL("./aeom-judge/SKILL.md", import.meta.url), "utf8");
  assert.match(judge, /one sentence of your own that names what you see on the screenshot: a word of the page, a part of it, a colour, a number; never « Looks good » or the same sentence twice/);
  assert.match(judge, /votes too thin to count \(reasons that name nothing on the page, one reason given again and again, a vote that says it did not look or copies another\), relaunch only those voters/);
});

test("AEOM learns from the person: rules kept at once, lessons drawn from runs, read by the workers and the screening, never by a principle judge", () => {
  const skill = read("SKILL.md");
  assert.match(skill, /`aeom taste learn` names the runs with something to learn/);
  assert.match(skill, /A preference the person states is kept at once: `aeom taste rule`/);
  assert.match(skill, /Every worker brief and the screening carry `aeom taste --brief`, never a principle judge/);
  assert.match(read("phase-wave.md"), /\*\*What the person taught AEOM\*\*, `aeom taste --brief`/);
  assert.match(read("phase-directions.md"), /what the person taught AEOM \(`aeom taste --brief`\)/);
  assert.match(read("phase-mockups.md"), /what the person taught AEOM \(`aeom taste --brief`, as it prints it, after the charter/);
  assert.match(skill, /`\.aeom\/taste\.md`, `\.aeom\/direction\/`/, "the rules said for the project never make the tree unclean");
  assert.match(skill, /refuses a run that skipped a measure or the standard/);
});

test("/aeom directions draws three, six or nine, and one of every round is the classic, never named for being sober", () => {
  const mockups = read("phase-mockups.md");
  assert.match(mockups, /\*\*How many: three, six or nine\.\*\* Three by default; `\/aeom directions --directions 6` or `--directions 9`/);
  assert.match(mockups, /Any other number: say this mode draws three, six or nine, and ask which, once/);
  assert.match(mockups, /exactly one of them is the classic, as directions\.md's \*\*The classic one\*\* says, its slug `classique`/);
  assert.match(mockups, /--set "COUNT=<3, 6 or 9>"/, "a run taken up keeps its number");
  assert.doesNotMatch(mockups, /three workers start|draw three new angles/, "the number of workers follows the count");
  const classic = read("directions.md").split("## The classic one")[1]?.split("\n## ")[0] ?? "";
  assert.match(classic, /shadcn\/ui/);
  assert.match(classic, /A dated look stays banned, and so does every other banned look/);
  assert.match(classic, /no other direction of the round takes that convention/);
  assert.match(read("directions.md"), /- Inter or Space Grotesk on white with rounded cards, but for the classic of `\/aeom directions`\./);
  const step7 = mockups.split("7. **Show them all, then ask.**")[1]?.split("**Variants.**")[0] ?? "";
  assert.match(step7, /it is sober on purpose, so it is never named for looking conventional/);
  assert.match(step7, /With six or nine, more than a question tool's options hold: say every direction in the message/);
  assert.match(mockups.split("**Mockup brief.**")[1] ?? "", /The classic's worker is given directions\.md's \*\*The classic one\*\*/);
});

test("every direction but the classic dares, and the screening names a timid one", () => {
  const dares = read("directions.md").split("## A direction that dares")[1]?.split("\n## ")[0] ?? "";
  for (const part of ["**A signature**", "**A colour that owns space**", "**A type with a voice**", "**Contrast of scale**"]) assert.ok(dares.includes(part), part);
  assert.match(dares, /Every direction but the classic takes a real risk/);
  assert.match(dares, /never in what is hidden/, "daring never hides what the brief keeps");
  assert.match(read("directions.md"), /Sources of one family, such as the coast of one region/);
  const directionBrief = read("phase-directions.md").split("**Direction brief.**")[1]?.split("**Screening brief.**")[0] ?? "";
  const mockupBrief = read("phase-mockups.md").split("**Mockup brief.**")[1] ?? "";
  for (const brief of [directionBrief, mockupBrief]) {
    assert.match(brief, /the banned looks, the paragraph on the product's name and \*\*A direction that dares\*\* from directions\.md/);
    assert.match(brief, /a direction with none of them is timid, start again|with none of them it is timid, start again/);
  }
  assert.match(mockupBrief, /in place of the paragraph on the product's name and of \*\*A direction that dares\*\*/, "the classic is sober on purpose");
  const screening = read("phase-directions.md").split("**Screening brief.**")[1]?.split("**Duel brief.**")[0] ?? "";
  assert.match(screening, /it is timid, as directions\.md's \*\*A direction that dares\*\* says/);
  assert.match(read("phase-directions.md").split("**Duel brief.**")[1] ?? "", /would still remember the next day/);
  assert.match(read("phase-mockups.md"), /never named for looking conventional, nor for being timid/);
});

test("/aeom directions --tender sells: its kind at a glance, every requirement in sight, and no ornament anywhere", () => {
  const tender = read("directions.md").split("## For a tender")[1]?.split("\n## ")[0] ?? "";
  for (const part of ["**Its kind at a glance.**", "**Every requirement in sight.**", "**Real and finished**"]) assert.ok(tender.includes(part), part);
  assert.match(tender, /A weather site looks like a weather site/);
  assert.match(tender, /never a radial page, a hidden main menu or a layout that must be learnt/);
  const dares = read("directions.md").split("## A direction that dares")[1]?.split("\n## ")[0] ?? "";
  assert.match(dares, /Daring is never ornament\. No geometry drawn for the source's sake: a polygon, a cone or a beam of light/);
  const mockups = read("phase-mockups.md");
  assert.match(mockups, /\*\*For a tender\*\*, `\/aeom directions --tender`/);
  assert.match(mockups, /Every brief, the classic's too, gets that section, the notes and those captures, an icon set/);
  assert.match(mockups, /\(`--option tender`\)/, "a run taken up keeps it");
  assert.match(read("phase-directions.md").split("**Screening brief.**")[1] ?? "", /it carries ornament drawn from its source/);
  assert.match(read("SKILL.md"), /`--tender`: for a tender/);
  for (const part of ["**The level of the best of its kind.**", "**Its kind's icons and charts.**", "**Readable first.**"]) assert.ok(tender.includes(part), part);
  assert.match(tender, /the ban on ornament is about decoration, never about the pictograms and charts of the kind/);
  assert.match(mockups, /keeps a capture of each in `\.aeom\/runs\/\$RUN\/references\/`, never in the project/);
  assert.match(mockups, /With `--tender`, six by default/);
  assert.match(mockups, /\*\*A spec beside the front\*\*/, "a tender on a skeleton reads both its screens and its spec");
});

test("the screening judge reads each direction's own image, never a sheet of several, and the person sees them three to a sheet", () => {
  const screening = read("phase-directions.md").split("**Screening brief.**")[1]?.split("**Duel brief.**")[0] ?? "";
  assert.match(screening, /each direction's own image, never a sheet of several: a model shrinks a tall sheet until it reads nothing on it/);
  assert.doesNotMatch(screening, /on the sheet|first on the sheet|Give the judge [^.]*the sheet,/, "the judge is given no sheet");
  assert.match(screening, /Look first at the front as it is today, `now\.png`, when you are given it/, "from a prompt or a spec there is none");
  const step6 = read("phase-directions.md").split("6. **What a judge sees in them**")[1]?.split("7. **Knockout**")[0] ?? "";
  assert.match(step6, /each with `now\.png` and each direction's image of step 4/);
  const mockups = read("phase-mockups.md");
  const step7 = mockups.split("7. **Show them all, then ask.**")[1]?.split("**Variants.**")[0] ?? "";
  assert.match(step7, /given the images `aeom mockups` names for the screening judge, one per direction/);
  assert.doesNotMatch(step7, /given `directions\/sheet\.png`/);
  assert.match(mockups, /three directions to a sheet, `directions\/sheet\.png`, then `sheet-2\.png` and `sheet-3\.png` with six or nine, the front as it is first on each/);
  assert.match(step7, /Show the sheets and ask/);
});

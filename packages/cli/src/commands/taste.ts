import { existsSync } from "node:fs";
import { readdir, realpath, stat, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { parseArgs } from "node:util";
import { addLesson, addRule, aeomHome, readFeedback, readLessons, readRules, runEvidence, runKey, tasteBrief } from "@aeom/core";

export const TASTE_HELP = `Usage: aeom taste [--brief]
       aeom taste rule "<rule>" [--project] [--why "<their words>"]
       aeom taste learn [<run folder>] [--none]
       aeom taste lesson "<lesson>" --run <run folder> --evidence "<the line it rests on>"

What the person taught AEOM, in two layers. The rules they said, kept at once:
for this project in .aeom/taste.md, read first, or for them in
~/.aeom/taste/rules.md. The lessons runs showed, in ~/.aeom/taste/lessons.json:
at most five a run, each resting on what the run showed, counted again when a
later run shows it again. The product sheet and the standard come before them,
and a lesson never overrides a rule.

  (none)          Print the rules and the lessons; --brief, the short index a
                  brief reads (200 lines at most)
  rule            Keep a rule the person said; --project for this product only
  learn           Without a run: the runs of this project with something to
                  learn from, not learned yet. With one: what it can teach (the
                  verdicts the person disagreed with, the directions chosen over
                  the screening's advice); --none marks it learned when nothing
                  there is a lesson
  lesson          Keep a lesson a run showed, resting on a line learn printed
                  for that run; the run is then learned`;

const today = () => new Date().toISOString().slice(0, 10);
const learned = (folder: string) => writeFile(join(folder, "learned"), `${new Date().toISOString()}\n`);
/** A run's folder, `.aeom/runs/run-…`: never another folder to write in. */
const isRun = async (folder: string) => basename(folder).startsWith("run-") && (await stat(folder).catch(() => null))?.isDirectory() === true;
/** Evidence the run showed: one of its lines as learn prints it, or a part of one too long to be a word. */
const flat = (line: string) => line.replace(/^-\s+/, "").replace(/\s+/g, " ").trim().toLowerCase();
const restsOn = (evidence: string, lines: string[]) => lines.map(flat).some((line) => line === flat(evidence) || (flat(evidence).length >= 20 && line.includes(flat(evidence))));

export async function runTaste(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { brief: { type: "boolean" }, none: { type: "boolean" }, project: { type: "boolean" }, why: { type: "string" }, run: { type: "string" }, evidence: { type: "string" }, help: { type: "boolean", short: "h" } } });
  if (values.help) return (console.log(TASTE_HELP), 0);
  const [action, ...words] = positionals;
  const home = aeomHome();
  const at = { home, project: process.cwd() };

  if (!action) {
    const [rules, lessons] = [await readRules(at), await readLessons(home)];
    // A brief with nothing taught yet carries nothing, not even an empty line.
    const brief = tasteBrief({ rules, lessons, project: await realpath(process.cwd()) });
    if (values.brief) return (brief && console.log(brief), 0);
    if (!rules.length && !lessons.length) return (console.log("Nothing taught yet: aeom taste rule keeps what the person says, aeom taste learn reads what a run can teach."), 0);
    for (const r of rules) console.log(`${r.scope === "project" ? "project" : "yours  "}  ${r.text} (said ${r.said})`);
    for (const l of [...lessons].sort((a, b) => b.count - a.count)) console.log(`lesson   ${l.text} (${l.count} run${l.count === 1 ? "" : "s"}; rests on: ${l.evidence.at(-1)})`);
    return 0;
  }

  if (action === "rule") {
    const text = words.join(" ").trim();
    if (!text) return (console.error(`aeom taste rule "<the rule, in the person's words>".`), 1);
    const kept = await addRule({ ...at, text, scope: values.project ? "project" : "person", ...(values.why ? { why: values.why } : {}), at: today() });
    console.log(kept === "already" ? `Already kept: ${text}` : values.project ? `Kept for this project, in .aeom/taste.md: ${text}` : `Kept for every project, in ${join("~", ".aeom", "taste", "rules.md")}: ${text}`);
    return 0;
  }

  if (action === "learn") {
    const feedback = await readFeedback(home);
    const [folder] = words;
    if (!folder) {
      // The runs of this project with something to learn from, not learned yet.
      const runs = join(".aeom", "runs");
      const pending: string[] = [];
      for (const name of (await readdir(runs).catch(() => [] as string[])).filter((n) => n.startsWith("run-")).sort()) {
        if (existsSync(join(runs, name, "learned"))) continue;
        const evidence = runEvidence(feedback, await runKey(join(runs, name)));
        if (evidence.length) pending.push(`${name}: ${evidence.length} thing${evidence.length === 1 ? "" : "s"} to learn from`);
      }
      console.log(pending.length ? `${pending.join("\n")}\n\nFor each: aeom taste learn .aeom/runs/<run>.` : "Nothing to learn: no run of this project has a disagreement or a choice over the advice not learned yet.");
      return 0;
    }
    if (!(await isRun(folder))) return (console.error(`${folder} is not a run's folder: give .aeom/runs/<run>.`), 1);
    const evidence = runEvidence(feedback, await runKey(folder));
    if (!evidence.length || values.none) {
      await learned(folder);
      return (console.log(evidence.length ? `${folder} is learned, with no lesson.` : `Nothing to learn from ${folder}: the person disagreed with nothing, and chose nothing over the advice.`), 0);
    }
    const known = (await readLessons(home)).map((l) => `- ${l.text}`);
    const run = relative(process.cwd(), folder) || folder;
    console.log(`What ${run} can teach:\n${evidence.map((e) => `- ${e}`).join("\n")}\n${known.length ? `\nLessons kept already (one learned again counts once more):\n${known.join("\n")}\n` : ""}\nAt most five lessons, each a rule of taste a later run can follow, each resting on a line above:\naeom taste lesson "<the lesson>" --run ${run} --evidence "<the line it rests on>"\nWhen nothing above is a lesson: aeom taste learn ${run} --none.`);
    return 0;
  }

  if (action === "lesson") {
    const text = words.join(" ").trim();
    if (!text || !values.run || !(await isRun(values.run))) return (console.error(`aeom taste lesson "<the lesson>" --run <run folder> --evidence "<the line it rests on>".`), 1);
    const key = await runKey(values.run);
    const evidence = (values.evidence ?? "").trim();
    if (!evidence) return (console.error(`A lesson rests on what the run showed: give --evidence "<the line of aeom taste learn it rests on>".`), 1);
    if (!restsOn(evidence, runEvidence(await readFeedback(home), key))) return (console.error(`${values.run} did not show that: --evidence is one of the lines aeom taste learn ${values.run} prints, or a part of one.`), 1);
    const kept = await addLesson({ home, project: key.project, run: `${key.project}:${key.run}`, text, evidence, at: today() });
    if (kept === "too many") return (console.error(`A run gives five lessons at most: keep the ones that hold.`), 1);
    await learned(values.run);
    console.log(kept === "confirmed" ? `Learned again, counted once more: ${text}` : `Kept: ${text}`);
    return 0;
  }

  console.error(TASTE_HELP);
  return 1;
}

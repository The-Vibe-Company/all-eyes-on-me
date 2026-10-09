import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_PRINCIPLES_FILE, STYLE_KEPT_PRINCIPLES_FILE, JOURNEY_PRINCIPLES_FILE, JudgeVoteError, loadPrinciples, readVotes, tally, VOTERS, type CaptureManifest, type JourneyReport, type JudgeReport, type Principle, type Vote } from "@aeom/core";

export const JUDGE_HELP = `Usage: aeom judge [options]

Counts the judges' votes on the latest captures and writes the verdict:
for each page and each base principle, pass or fail by majority. A tie
fails. Exits with 1 when any principle fails a page.

The votes come from judge subagents (see skills/aeom-judge). Each one
writes a JSON file in the votes folder.

With --journeys, judges the key journeys instead: each journey replayed by
aeom journey, against the journey principles. A journey that broke on replay
is a failure of its own.

Options:
  --journeys           Judge the journeys, not the pages
  --captures <dir>     The captures to judge (default .aeom/captures, or
                       .aeom/captures/journeys with --journeys)
  --votes <dir>        Where the votes are (default .aeom/reports/judge, or
                       .aeom/reports/judge-journeys with --journeys)
  --out <dir>          Where to write judge.json, or judge-journeys.json (default .aeom/reports)
  --principles <file>  The principles to judge against (default: the base
                       principles, or the journey principles with --journeys)
  --style-kept         Judge whether each page kept the app's charter, from votes
                       that compared it before and after the run
  --voters <n>         How many votes to expect (default ${VOTERS})`;

export async function runJudge(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      journeys: { type: "boolean" },
      captures: { type: "string" },
      votes: { type: "string" },
      out: { type: "string", default: ".aeom/reports" },
      principles: { type: "string" },
      "style-kept": { type: "boolean" },
      voters: { type: "string", default: String(VOTERS) },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(JUDGE_HELP);
    return 0;
  }
  if (values.journeys) return judgeJourneys({ ...values, captures: values.captures ?? ".aeom/captures/journeys", votes: values.votes ?? ".aeom/reports/judge-journeys" });
  const captures = values.captures ?? ".aeom/captures";
  const votesDir = values.votes ?? ".aeom/reports/judge";

  let manifest: CaptureManifest;
  try {
    manifest = JSON.parse(await readFile(join(captures, "manifest.json"), "utf8"));
  } catch {
    console.error(`No captures in ${captures}. Run aeom capture first.`);
    return 1;
  }
  const principles = await loadPrinciples(values.principles ?? (values["style-kept"] ? STYLE_KEPT_PRINCIPLES_FILE : DEFAULT_PRINCIPLES_FILE));
  const pages = manifest.pages.map((p) => p.path);
  if (pages.length === 0) {
    console.error(`The captures in ${captures} have no page. Run aeom capture again.`);
    return 1;
  }
  const report = await countVotes({ votesDir, out: values.out, voters: values.voters, keys: pages, principles });
  if (report === null) return 1;

  await mkdir(values.out, { recursive: true });
  const reportFile = join(values.out, "judge.json");
  await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");

  const s = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
  console.log(`Judged ${s(pages.length, "page")} on ${s(principles.length, "principle")}, ${s(report.voters.length, "vote")} each\n`);
  if (report.failures === 0) {
    console.log(`All ${s(principles.length, "principle")} pass on ${s(pages.length, "page")}.`);
    return 0;
  }
  const column = Math.max(...principles.map((p) => p.id.length)) + 2;
  for (const { page, verdicts } of report.pages) {
    const failing = verdicts.filter((v) => !v.pass);
    if (failing.length === 0) continue;
    console.log(page);
    for (const v of failing) console.log(`  ✗ ${v.principle.padEnd(column)}${v.reasons[0] ?? ""} (${v.votes})`);
    console.log("");
  }
  const failingPages = report.pages.filter((p) => p.verdicts.some((v) => !v.pass)).length;
  console.log(`${s(report.failures, "failure")} on ${s(failingPages, "page")}. Report: ${relative(process.cwd(), reportFile)}`);
  return 1;
}

export async function runPrinciples(argv: string[]): Promise<number> {
  const { values } = parseArgs({ args: argv, options: { principles: { type: "string" }, journeys: { type: "boolean" }, "style-kept": { type: "boolean" }, help: { type: "boolean", short: "h" } } });
  if (values.help) {
    console.log(`Usage: aeom principles [--journeys | --style-kept] [--principles <file>]\n\nPrints the principles the judge uses, one per line: id, then what it asks for.\nWith --journeys, the principles it asks of each key journey. With --style-kept,\nwhat it asks of each page when a run keeps the app's style.`);
    return 0;
  }
  for (const p of await loadPrinciples(values.principles ?? (values.journeys ? JOURNEY_PRINCIPLES_FILE : values["style-kept"] ? STYLE_KEPT_PRINCIPLES_FILE : DEFAULT_PRINCIPLES_FILE))) console.log(`${p.id}  ${p.text}`);
  return 0;
}

/**
 * Reads the votes, checks that every expected voter voted and nobody else,
 * and counts them. Prints what is wrong and returns null when it cannot.
 */
async function countVotes({ votesDir, out, voters: votersText, keys, principles, steps = false }: { votesDir: string; out: string; voters: string; keys: string[]; principles: Principle[]; steps?: boolean }): Promise<JudgeReport | null> {
  const canonical = (dir: string) => realpath(dir).catch(() => resolve(dir));
  if ((await canonical(out)) === (await canonical(votesDir))) {
    console.error(`--out and --votes cannot be the same folder: the verdict would be counted as a vote next time.`);
    return null;
  }
  const voters = Number(votersText);
  if (!Number.isInteger(voters) || voters < 1) {
    console.error(`--voters must be a positive whole number.`);
    return null;
  }
  let votes: Vote[];
  try {
    votes = await readVotes(votesDir);
  } catch (error) {
    if (!(error instanceof JudgeVoteError)) throw error;
    console.error(`Some vote files cannot be read:\n${error.problems.map((p) => `  ${p}`).join("\n")}`);
    return null;
  }
  if (votes.length === 0) {
    console.error(`No vote in ${votesDir}. The judge subagents write one JSON file each there.`);
    return null;
  }
  const expected = Array.from({ length: voters }, (_, i) => String(i + 1));
  const missing = expected.filter((n) => !votes.some((v) => v.voter === n));
  const unexpected = votes.map((v) => v.voter).filter((n) => !expected.includes(n));
  if (missing.length || unexpected.length) {
    if (missing.length) console.error(`Missing votes from voter ${missing.join(", ")}: expected ${missing.map((n) => join(votesDir, `${n}.json`)).join(", ")}. Relaunch those voters.`);
    if (unexpected.length) console.error(`Unexpected voter ${unexpected.join(", ")}: voters are numbered 1 to ${voters}.`);
    return null;
  }
  try {
    return tally(votes, keys, principles, { voters, steps });
  } catch (error) {
    if (!(error instanceof JudgeVoteError)) throw error;
    console.error(`Some votes cannot be counted:\n${error.problems.map((p) => `  ${p}`).join("\n")}`);
    return null;
  }
}

/** One journey's failure that needs no vote: it broke on replay, at these widths. */
interface BrokenJourney {
  journey: string;
  name: string;
  widths: number[];
  step: number;
  reason: string;
  capture: string | null;
}

async function judgeJourneys(values: { captures: string; votes: string; out: string; principles?: string; voters: string }): Promise<number> {
  let replay: JourneyReport;
  try {
    replay = JSON.parse(await readFile(join(values.captures, "report.json"), "utf8"));
  } catch {
    console.error(`No replayed journeys in ${values.captures}. Run aeom journey first.`);
    return 1;
  }
  const keys = replay.journeys.map((j) => j.slug);
  if (keys.length === 0) {
    console.error(`The report in ${values.captures} has no journey. Run aeom journey again.`);
    return 1;
  }
  const principles = await loadPrinciples(values.principles ?? JOURNEY_PRINCIPLES_FILE);
  // A journey's failure names the step where it shows.
  const votes = await countVotes({ votesDir: values.votes, out: values.out, voters: values.voters, keys, principles, steps: true });
  if (votes === null) return 1;

  // The widest replay that reached a step shows it best.
  const shotOf = (slug: string, step: number) =>
    replay.journeys
      .find((j) => j.slug === slug)!
      .runs.filter((r) => r.steps.length >= step)
      .reduce<JourneyReport["journeys"][number]["runs"][number] | null>((a, b) => (!a || b.width > a.width ? b : a), null)?.steps[step - 1]?.capture;
  // A journey that broke is named once per way it broke: the widths that broke at the same step for the same reason go together.
  const broken: BrokenJourney[] = replay.journeys.flatMap((j) => {
    const ways = new Map<string, typeof j.runs>();
    for (const run of j.runs.filter((r) => r.broken)) {
      const key = `${run.broken!.step}\n${run.broken!.reason}`;
      ways.set(key, [...(ways.get(key) ?? []), run]);
    }
    return [...ways.values()].map((runs) => {
      const last = runs.reduce((a, b) => (b.width > a.width ? b : a));
      return { journey: j.slug, name: j.name, widths: runs.map((r) => r.width), step: last.broken!.step, reason: last.broken!.reason, capture: last.steps[last.broken!.step - 1]?.capture ?? null };
    });
  });
  const report = { ...votes, broken, failures: votes.failures + broken.length };
  await mkdir(values.out, { recursive: true });
  const reportFile = join(values.out, "judge-journeys.json");
  await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");

  const s = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
  const capture = (file: string | null | undefined) => (file ? `${relative(process.cwd(), join(values.captures, file))}` : "");
  const name = (slug: string) => replay.journeys.find((j) => j.slug === slug)!.name;
  console.log(`Judged ${s(keys.length, "journey")} on ${s(principles.length, "principle")}, ${s(votes.voters.length, "vote")} each\n`);
  if (report.failures === 0) {
    console.log(`All ${s(principles.length, "principle")} pass on ${s(keys.length, "journey")}, and every journey goes to its end.`);
    return 0;
  }
  const column = Math.max(...principles.map((p) => p.id.length), ...broken.map((b) => b.name.length - 2)) + 2;
  for (const b of broken) {
    console.log(`✗ ${b.name.padEnd(column + 2)}breaks at step ${b.step} at ${b.widths.join(", ")} px: ${b.reason}`);
    if (b.capture) console.log(`  ${" ".repeat(column + 2)}${capture(b.capture)}`);
  }
  if (broken.length) console.log("");
  for (const { page: slug, verdicts } of votes.pages) {
    const failing = verdicts.filter((v) => !v.pass);
    if (failing.length === 0) continue;
    console.log(name(slug));
    for (const v of failing) {
      const at = v.steps.length ? `step ${v.steps.join(", ")}: ` : "";
      console.log(`  ✗ ${v.principle.padEnd(column)}${at}${v.reasons[0] ?? ""} (${v.votes})`);
      for (const step of v.steps) {
        const shot = shotOf(slug, step);
        if (shot) console.log(`    ${" ".repeat(column)}${capture(shot)}`);
      }
    }
    console.log("");
  }
  console.log(`${s(report.failures, "failure")}. Report: ${relative(process.cwd(), reportFile)}`);
  return 1;
}

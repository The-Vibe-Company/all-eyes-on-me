import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_PRINCIPLES_FILE, JudgeVoteError, loadPrinciples, readVotes, tally, VOTERS, type CaptureManifest, type Vote } from "@aeom/core";

export const JUDGE_HELP = `Usage: aeom judge [options]

Counts the judges' votes on the latest captures and writes the verdict:
for each page and each base principle, pass or fail by majority. A tie
fails. Exits with 1 when any principle fails a page.

The votes come from judge subagents (see skills/aeom-judge). Each one
writes a JSON file in the votes folder.

Options:
  --captures <dir>     The captures to judge (default .aeom/captures)
  --votes <dir>        Where the votes are (default .aeom/reports/judge)
  --out <dir>          Where to write judge.json (default .aeom/reports)
  --principles <file>  The principles to judge against (default: the base principles)
  --voters <n>         How many votes to expect (default ${VOTERS})`;

export async function runJudge(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      captures: { type: "string", default: ".aeom/captures" },
      votes: { type: "string", default: ".aeom/reports/judge" },
      out: { type: "string", default: ".aeom/reports" },
      principles: { type: "string" },
      voters: { type: "string", default: String(VOTERS) },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(JUDGE_HELP);
    return 0;
  }

  let manifest: CaptureManifest;
  try {
    manifest = JSON.parse(await readFile(join(values.captures, "manifest.json"), "utf8"));
  } catch {
    console.error(`No captures in ${values.captures}. Run aeom capture first.`);
    return 1;
  }
  const principles = await loadPrinciples(values.principles ?? DEFAULT_PRINCIPLES_FILE);
  const voters = Number(values.voters);
  if (!Number.isInteger(voters) || voters < 1) {
    console.error(`--voters must be a positive whole number.`);
    return 1;
  }
  const pages = manifest.pages.map((p) => p.path);
  if (pages.length === 0) {
    console.error(`The captures in ${values.captures} have no page. Run aeom capture again.`);
    return 1;
  }
  let votes: Vote[];
  try {
    votes = await readVotes(values.votes);
  } catch (error) {
    if (!(error instanceof JudgeVoteError)) throw error;
    console.error(`Some vote files cannot be read:\n${error.problems.map((p) => `  ${p}`).join("\n")}`);
    return 1;
  }
  if (votes.length === 0) {
    console.error(`No vote in ${values.votes}. The judge subagents write one JSON file each there.`);
    return 1;
  }

  let report;
  try {
    report = tally(votes, pages, principles, { voters });
  } catch (error) {
    if (!(error instanceof JudgeVoteError)) throw error;
    console.error(`Some votes cannot be counted:\n${error.problems.map((p) => `  ${p}`).join("\n")}`);
    return 1;
  }

  await mkdir(values.out, { recursive: true });
  const reportFile = join(values.out, "judge.json");
  await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");

  const s = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
  console.log(`Judged ${s(pages.length, "page")} on ${s(principles.length, "principle")}, ${s(votes.length, "vote")} each\n`);
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
  const { values } = parseArgs({ args: argv, options: { principles: { type: "string" }, help: { type: "boolean", short: "h" } } });
  if (values.help) {
    console.log(`Usage: aeom principles [--principles <file>]\n\nPrints the principles the judge uses, one per line: id, then what it asks for.`);
    return 0;
  }
  for (const p of await loadPrinciples(values.principles ?? DEFAULT_PRINCIPLES_FILE)) console.log(`${p.id}  ${p.text}`);
  return 0;
}

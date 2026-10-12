import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_PRINCIPLES_FILE, STYLE_KEPT_PRINCIPLES_FILE, JOURNEY_PRINCIPLES_FILE, JudgeVoteError, loadPrinciples, readVotes, tally, toConfirm, VOTERS, type CaptureManifest, type ToConfirm, type JourneyReport, type JudgeReport, type Principle, type Vote } from "@aeom/core";

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
  --voters <n>         How many votes to expect (default ${VOTERS})

One vote first, then three on what it failed:
  --to-confirm         Reads voter 1's vote alone, and writes in the votes
                       folder, to-confirm.json, what it failed: voters 2 and 3
                       vote on that only. What it passed stands on its vote.
                       Counting then takes the three votes where they were
                       asked, and voter 1's alone elsewhere.
  --changed-since <snapshot>
                       Writes in the votes folder, to-judge.json, the pages
                       whose captures changed since that snapshot (aeom
                       snapshot): the voters judge only those, and the others
                       keep the snapshot's verdict when the votes are counted.`;

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
      "to-confirm": { type: "boolean" },
      "changed-since": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(JUDGE_HELP);
    return 0;
  }
  if (values.journeys) {
    if (values["changed-since"]) {
      console.error(`--changed-since judges pages again, not journeys.`);
      return 1;
    }
    return judgeJourneys({ ...values, captures: values.captures ?? ".aeom/captures/journeys", votes: values.votes ?? ".aeom/reports/judge-journeys" });
  }
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
  const all = manifest.pages.map((p) => p.path);
  if (all.length === 0) {
    console.error(`The captures in ${captures} have no page. Run aeom capture again.`);
    return 1;
  }
  const s = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
  if (values["changed-since"] && values["to-confirm"]) {
    console.error(`--changed-since and --to-confirm are two steps of one judging: run --changed-since before the first voter, then --to-confirm alone once it voted.`);
    return 1;
  }
  if (values["changed-since"]) {
    const since = values["changed-since"];
    const kept = await unchangedPages(captures, manifest, since, principles);
    if (kept === null) return 1;
    const changed = all.filter((p) => !kept.includes(p));
    await mkdir(votesDir, { recursive: true });
    // The snapshot by its full path: the count may run from elsewhere.
    await writeFile(join(votesDir, "to-judge.json"), JSON.stringify({ since: resolve(since), pages: changed }, null, 2) + "\n");
    console.log(
      changed.length
        ? `${s(changed.length, "page")} changed since ${since}: ${changed.join(", ")}.${kept.length ? ` ${s(kept.length, "page")} keeps its verdict: ${kept.join(", ")}.` : ""} The voters judge only the pages of ${join(votesDir, "to-judge.json")}.`
        : `No page changed since ${since}: every page keeps its verdict. Count them with aeom judge, with no voter.`,
    );
    return 0;
  }
  const stage = await readStage<{ since: string; pages: string[] }>(join(votesDir, "to-judge.json"));
  const pages = stage ? all.filter((p) => stage.pages.includes(p)) : all;
  if (values["to-confirm"]) return writeToConfirm(votesDir, pages, principles);

  let reused: JudgeReport["pages"] = [];
  if (stage) {
    const previous = await readStage<JudgeReport>(join(stage.since, "reports", "judge.json"));
    const kept = all.filter((p) => !pages.includes(p));
    reused = kept.map((page) => previous?.pages.find((p) => p.page === page)).filter((p): p is JudgeReport["pages"][number] => !!p);
    const lost = kept.filter((page) => !reused.some((p) => p.page === page));
    if (lost.length) {
      console.error(`${lost.join(", ")} should keep the verdict of ${stage.since}, which does not hold it any more: run aeom judge --changed-since again, or judge every page.`);
      return 1;
    }
  }
  const counted = pages.length ? await countVotes({ votesDir, out: values.out, voters: values.voters, keys: pages, principles }) : { judgedAt: new Date().toISOString(), voters: [], principles, pages: [], failures: 0 };
  if (counted === null) return 1;
  // The pages judged again and those that kept their verdict, in the captures' order.
  const merged = all.map((page) => counted.pages.find((p) => p.page === page) ?? reused.find((p) => p.page === page)!).filter(Boolean);
  const report: JudgeReport & { reused?: string[] } = {
    ...counted,
    pages: merged,
    failures: merged.reduce((n, p) => n + p.verdicts.filter((v) => !v.pass).length, 0),
    ...(reused.length ? { reused: reused.map((p) => p.page) } : {}),
  };

  await mkdir(values.out, { recursive: true });
  const reportFile = join(values.out, "judge.json");
  await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");

  console.log(`Judged ${s(pages.length, "page")} on ${s(principles.length, "principle")}, ${votesSaid(report.voters.length, await readStage<ToConfirm>(join(votesDir, "to-confirm.json")))}${reused.length ? `; ${s(reused.length, "page")} kept its verdict` : ""}\n`);
  if (report.failures === 0) {
    console.log(`All ${s(principles.length, "principle")} pass on ${s(all.length, "page")}.`);
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
  const asked = await readStage<ToConfirm>(join(votesDir, "to-confirm.json"));
  // What to confirm is what voter 1's vote fails now, never only what a file says: a vote relaunched, or a file left from an earlier judging, would let a failure through on one vote.
  const first = votes.find((v) => v.voter === "1");
  const confirm = asked && first ? toConfirm(first, keys, principles) : asked;
  if (asked && confirm && JSON.stringify(sorted(asked)) !== JSON.stringify(sorted(confirm))) {
    console.error(`Voter 1's vote no longer fails what ${join(votesDir, "to-confirm.json")} lists: run aeom judge --to-confirm again, then relaunch voters 2 and 3 on what it writes.`);
    return null;
  }
  const expected = Array.from({ length: confirm && !Object.keys(confirm).length ? 1 : voters }, (_, i) => String(i + 1));
  const missing = expected.filter((n) => !votes.some((v) => v.voter === n));
  const unexpected = votes.map((v) => v.voter).filter((n) => !expected.includes(n));
  if (missing.length || unexpected.length) {
    if (missing.length) console.error(`Missing votes from voter ${missing.join(", ")}: expected ${missing.map((n) => join(votesDir, `${n}.json`)).join(", ")}. Relaunch those voters.`);
    if (unexpected.length)
      console.error(
        confirm && !Object.keys(confirm).length
          ? `Unexpected voter ${unexpected.join(", ")}: the first vote failed nothing, so it is counted alone. Their votes are left from an earlier judging: delete them, then count again.`
          : `Unexpected voter ${unexpected.join(", ")}: voters are numbered 1 to ${voters}.`,
      );
    return null;
  }
  try {
    return tally(votes, keys, principles, { voters, steps, ...(confirm ? { confirm } : {}) });
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

async function judgeJourneys(values: { captures: string; votes: string; out: string; principles?: string; voters: string; "to-confirm"?: boolean }): Promise<number> {
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
  if (values["to-confirm"]) return writeToConfirm(values.votes, keys, principles, "journey");
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
  console.log(`Judged ${s(keys.length, "journey")} on ${s(principles.length, "principle")}, ${votesSaid(votes.voters.length, await readStage<ToConfirm>(join(values.votes, "to-confirm.json")))}\n`);
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

/** How many votes each verdict had: one, three, or one and three on what the first failed. */
const votesSaid = (voters: number, confirm: ToConfirm | null) => {
  const confirmed = confirm ? Object.values(confirm).reduce((n, ids) => n + ids.length, 0) : 0;
  if (confirm && confirmed) return `1 vote each, ${voters} on the ${confirmed} verdict${confirmed === 1 ? "" : "s"} the first one failed`;
  return voters === 1 ? "1 vote each" : `${voters} votes each`;
};

/** A file the judge wrote beside the votes, or null when there is none. */
async function readStage<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Writes what the first voter failed, for voters 2 and 3, and says it. */
async function writeToConfirm(votesDir: string, keys: string[], principles: Principle[], what = "page"): Promise<number> {
  let votes: Vote[];
  try {
    votes = await readVotes(votesDir);
  } catch (error) {
    if (!(error instanceof JudgeVoteError)) throw error;
    console.error(`Some vote files cannot be read:\n${error.problems.map((p) => `  ${p}`).join("\n")}`);
    return 1;
  }
  const first = votes.find((v) => v.voter === "1");
  if (!first) {
    console.error(`No vote from voter 1 in ${votesDir}: launch voter 1 first, on everything.`);
    return 1;
  }
  const confirm = toConfirm(first, keys, principles);
  await writeFile(join(votesDir, "to-confirm.json"), JSON.stringify(confirm, null, 2) + "\n");
  const count = Object.values(confirm).reduce((n, ids) => n + ids.length, 0);
  const s = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
  console.log(
    count
      ? `${s(count, "verdict")} to confirm, on ${s(Object.keys(confirm).length, what)}: ${Object.entries(confirm).map(([k, ids]) => `${k} (${ids.join(", ")})`).join("; ")}. Launch voters 2 and 3 on them, with ${join(votesDir, "to-confirm.json")}, then count with aeom judge.`
      : `Nothing to confirm: the first vote is the verdict. Count it with aeom judge.`,
  );
  return 0;
}

const digest = async (file: string) => createHash("sha256").update(await readFile(file)).digest("hex");

/**
 * The pages whose captures are the same, byte for byte, as in the snapshot,
 * at every width, and whose verdict the snapshot holds on the same
 * principles. Prints why and returns null when the snapshot cannot be read.
 */
async function unchangedPages(captures: string, manifest: CaptureManifest, since: string, principles: Principle[]): Promise<string[] | null> {
  const before = await readStage<CaptureManifest>(join(since, "captures", "manifest.json"));
  const report = await readStage<JudgeReport>(join(since, "reports", "judge.json"));
  if (!before || !report) {
    console.error(`${since} is not a snapshot with captures and a verdict: give the folder aeom snapshot wrote, such as .aeom/runs/<run>/after.`);
    return null;
  }
  const ids = principles.map((p) => p.id).sort().join();
  const same: string[] = [];
  for (const page of manifest.pages) {
    const old = before.pages.find((p) => p.path === page.path);
    const verdict = report.pages.find((p) => p.page === page.path);
    if (!old || !verdict || verdict.verdicts.map((v) => v.principle).sort().join() !== ids) continue;
    if (old.files.length !== page.files.length || !page.files.length) continue;
    let alike = true;
    for (const file of page.files) {
      const twin = old.files.find((f) => f.width === file.width);
      if (!twin || (await digest(join(captures, file.file)).catch(() => "a")) !== (await digest(join(since, "captures", twin.file)).catch(() => "b"))) {
        alike = false;
        break;
      }
    }
    if (alike) same.push(page.path);
  }
  return same;
}

/** The same pages and principles in the same order, to compare two lists of what to confirm. */
const sorted = (c: ToConfirm) => Object.keys(c).sort().map((k) => [k, [...c[k]!].sort()]);

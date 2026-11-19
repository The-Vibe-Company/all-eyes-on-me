import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { parseArgs, promisify } from "node:util";
import { decidePages, journeyFilesBack, pageShape, readRunState, type JourneyReport, type JudgeReport, type PageComparison, type PageDecision, type RatchetVerdict, type RunState, type Step } from "@aeom/core";

const USAGE = `Usage: aeom ratchet <run folder> [--apply] [--back <route>[=<why>]]...

The ratchet of the pages, after the screen wave (section 5): it keeps the
pages that got better and says which go back as they were before the wave,
and why. It reads the comparison (after/compare.json, from aeom compare), the
pages no worker touched (no-worker.json), the journeys' ratchet when the run
judged them (journeys-after/ratchet.json, with both replays and both
critiques), and the page workers the run marked with aeom run agent --page.

A page that got better stays, and so does one no worker touched, one no page
worker rebuilt, or one a journey the ratchet kept crosses; any other goes
back. A page where a journey the ratchet sent back now breaks, or fails what
passed before, goes back even when it got better. A journey file rewritten
in the wave goes back with the page it crosses. Writes after/ratchet.json.

Options:
  --apply                On the run branch, aeom/<run>: put the files of every
                         page going back as they were when its worker started,
                         remove those it added, put back the journey files
                         rewritten for it, and commit
  --back <route>[=<why>] Send a page back yourself, such as when an action
                         aeom compare named to look at is gone:
                         --back "/cart=the button Pay is gone"`;

const exec = promisify(execFile);
// A wave can touch many files: git's answer must not stop at Node's default megabyte.
const BIG = { maxBuffer: 256 * 1024 * 1024 };

class Refusal extends Error {}

/** A file a worker changed, and how to put it back: its version at `from`, or gone when the worker added it. */
interface Change {
  file: string;
  from: string;
  added: boolean;
}

/** A JSON file of the run's folder; null when it is not there, a refusal naming it when it does not read. */
async function json<T>(file: string): Promise<T | null> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Refusal(`${file} is not JSON: write it again with the step that makes it.`);
  }
}

/** What a commit range changed, file by file, with no rename, so each path is put back where it was. */
async function changes(root: string, from: string, to: string, paths: string[] = []): Promise<Change[]> {
  const out = (await exec("git", ["-C", root, "diff", "--name-status", "--no-renames", "-z", from, to, "--", ...paths], BIG)).stdout.split("\0").filter(Boolean);
  const found: Change[] = [];
  for (let i = 0; i + 1 < out.length; i += 2) found.push({ file: out[i + 1]!, from, added: out[i] === "A" });
  return found;
}

const git = async (root: string, args: string[]) => (await exec("git", ["-C", root, ...args], BIG)).stdout.trim();
const exists = (root: string, ref: string) => git(root, ["rev-parse", "--verify", "--quiet", ref]).then(() => true, () => false);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export async function runRatchet(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({ args: argv, allowPositionals: true, options: { apply: { type: "boolean" }, back: { type: "string", multiple: true }, help: { type: "boolean", short: "h" } } });
  if (values.help || positionals.length !== 1) {
    console.log(USAGE);
    return values.help ? 0 : 1;
  }
  try {
    return await ratchet(positionals[0]!, values.apply === true, values.back ?? []);
  } catch (error) {
    if (error instanceof Refusal) {
      console.error(error.message);
      return 1;
    }
    if (String((error as { cmd?: string }).cmd ?? "").startsWith("git")) {
      console.error(`git failed: ${(error as { stderr?: string }).stderr?.trim() || (error as Error).message}`);
      return 1;
    }
    throw error;
  }
}

async function ratchet(runDir: string, apply: boolean, backs: string[]): Promise<number> {
  const run = basename(runDir);
  // The project a run folder belongs to: <project>/.aeom/runs/<run>.
  const root = resolve(runDir, "..", "..", "..");
  const runBranch = `aeom/${run}`;
  const after = join(runDir, "after");

  const comparison = await json<PageComparison[]>(join(after, "compare.json"));
  if (!comparison) throw new Refusal(`${join(after, "compare.json")} is missing: aeom compare ${join(runDir, "before")} ${after} first.`);
  if (!Array.isArray(comparison) || comparison.some((c) => !c || typeof c.page !== "string" || typeof c.verdict !== "string")) throw new Refusal(`${join(after, "compare.json")} is not a comparison of pages: aeom compare ${join(runDir, "before")} ${after} again.`);
  const noWorker = (await json<unknown>(join(runDir, "no-worker.json"))) ?? [];
  if (!Array.isArray(noWorker) || noWorker.some((p) => typeof p !== "string")) throw new Refusal(`${join(runDir, "no-worker.json")} is not a list of routes: write it again, such as ["/about"].`);

  const raw = await json<unknown>(join(runDir, "state.json"));
  const state: RunState | null = raw === null ? null : readRunState(raw, run);
  if (!state) throw new Refusal(`${join(runDir, "state.json")} ${raw === null ? "is missing" : "is not a run's state"}: the ratchet finds each page's files by the page workers the run marked, with aeom run agent ${runDir} --name <it> --kind "page worker" --page <its route>.`);
  const active = state.agents.filter((a) => a.status !== "refused");
  const unmarked = active.filter((a) => !a.page && /\bpage\b/i.test(a.kind ?? ""));
  if (unmarked.length) throw new Refusal(unmarked.map((a) => `${a.name} ran as a page worker with no page: mark it with aeom run agent ${runDir} --name ${a.name} --status ${a.status} --page <the route it rebuilt>`).join("\n"));
  const workers = active.filter((a) => a.page).map((a) => ({ name: a.name, page: a.page! }));

  // The journeys, when the run judged them: their ratchet decides with both replays and both critiques.
  const journeysAfter = join(runDir, "journeys-after");
  const journeysBefore = join(runDir, "journeys-before");
  const verdicts = await json<RatchetVerdict[]>(join(journeysAfter, "ratchet.json"));
  const replays = { after: await json<JourneyReport>(join(journeysAfter, "report.json")), before: await json<JourneyReport>(join(journeysBefore, "report.json")) };
  let journeys = null;
  if (verdicts) {
    const critique = await json<JudgeReport>(join(journeysAfter, "judge-journeys.json"));
    const critiqueBefore = await json<JudgeReport>(join(journeysBefore, "judge-journeys.json"));
    const lacking = [
      ...(replays.after ? [] : [join(journeysAfter, "report.json")]),
      ...(replays.before ? [] : [join(journeysBefore, "report.json")]),
      ...(critique ? [] : [join(journeysAfter, "judge-journeys.json")]),
      ...(critiqueBefore ? [] : [join(journeysBefore, "judge-journeys.json")]),
    ];
    if (lacking.length || !Array.isArray(verdicts)) throw new Refusal(`The journeys' ratchet stands on both replays and both critiques, as aeom compare --journeys left them: ${lacking.length ? `${lacking.join(", ")} missing` : `${join(journeysAfter, "ratchet.json")} is not a ratchet`}.`);
    journeys = { ratchet: verdicts, replay: replays.after!, replayBefore: replays.before!, critique: critique!, critiqueBefore: critiqueBefore! };
  } else console.log(`No journey ratchet in ${journeysAfter}: decided on the screens alone.\n`);

  const back: Record<string, string> = {};
  for (const b of backs) {
    const eq = b.indexOf("=");
    const route = (eq < 0 ? b : b.slice(0, eq)).trim();
    if (!route.startsWith("/")) throw new Refusal(`--back takes a route, such as --back "/cart=the button Pay is gone", not ${b}.`);
    back[route] = eq < 0 ? "" : b.slice(eq + 1).trim();
  }
  for (const route of Object.keys(back)) if (!comparison.some((c) => pageShape(c.page) === pageShape(route))) throw new Refusal(`--back ${route}: no page of ${join(after, "compare.json")} is ${route}.`);
  const { pages, toLook } = decidePages({ comparison, noWorker: noWorker as string[], workers, journeys, back });
  if (!(await exists(root, `refs/heads/${runBranch}`))) throw new Refusal(`No branch ${runBranch} here: run aeom ratchet from the checkout the run changed.`);

  // The files of each page going back: what its workers changed since they started, from their own branches.
  const files = new Map<string, Change[]>();
  for (const p of pages.filter((d) => d.back)) {
    const found: Change[] = [];
    for (const name of p.workers) {
      const agent = state.agents.find((a) => a.name === name)!;
      if (!agent.branch || !agent.from) throw new Refusal(`${name}, the worker of ${p.page}, has no branch or no commit it started from in state.json: mark it with --branch and --from.`);
      if (!(await exists(root, `refs/heads/${agent.branch}`))) throw new Refusal(`${agent.branch}, the branch of ${name}, the worker of ${p.page}, is gone: put the page's files back by hand, git checkout ${agent.from} -- <its files>, and commit.`);
      found.push(...(await changes(root, agent.from, `refs/heads/${agent.branch}`)));
    }
    files.set(p.page, found);
  }

  // The journey files the run rewrote during the wave, for the labels and paths the workers changed.
  const going = pages.filter((p) => p.back);
  const waveBase = state.vars.WAVE_BASE ?? going.flatMap((p) => p.workers).map((n) => state.agents.find((a) => a.name === n)?.from).find(Boolean);
  let journeyChanges: Change[] = [];
  if (going.length && waveBase) {
    const changed = (await changes(root, waveBase, `refs/heads/${runBranch}`, [".aeom/journeys"])).filter((c) => /^\.aeom\/journeys\/[^/]+\.json$/.test(c.file));
    // Each file's steps as the wave found them and as the run branch holds them, to tell which steps changed.
    const steps = async (ref: string, file: string) => {
      const text = await git(root, ["show", `${ref}:${file}`]).catch(() => null);
      try {
        const parsed = text === null ? null : (JSON.parse(text) as { steps?: unknown });
        return Array.isArray(parsed?.steps) ? (parsed.steps as Step[]) : null;
      } catch {
        return null;
      }
    };
    const rewritten = await Promise.all(changed.map(async (c) => ({ slug: basename(c.file, ".json"), before: await steps(waveBase, c.file), after: await steps(`refs/heads/${runBranch}`, c.file) })));
    const { back: slugs, toLook: look } = journeyFilesBack({ pages, changed: rewritten, replay: replays.after });
    journeyChanges = changed.filter((c) => slugs.includes(basename(c.file, ".json")));
    toLook.push(...look);
  }

  const column = Math.max(...pages.map((p) => p.page.length)) + 2;
  for (const p of pages) console.log(`${p.page.padEnd(column)}${(p.back ? "back" : "kept").padEnd(6)}${p.why}`);
  if (toLook.length) console.log(`\nTo look at:\n${toLook.map((t) => `  - ${t}`).join("\n")}`);
  const fileCount = (p: PageDecision) => new Set(files.get(p.page)!.map((c) => c.file)).size;
  const journeyLine = journeyChanges.length ? ` ${journeyChanges.map((c) => c.file).join(", ")} ${journeyChanges.length === 1 ? "goes" : "go"} back with ${going.length === 1 ? "it" : "them"}.` : "";
  console.log(going.length ? `\n${plural(going.length, "page")} ${going.length === 1 ? "goes" : "go"} back: ${going.map((p) => `${p.page} (${plural(fileCount(p), "file")})`).join(", ")}.${journeyLine}` : `\nNothing goes back: every page stays as the wave left it.`);

  const decision = (applied: string | null) => ({
    pages: pages.map((p) => ({ ...p, ...(p.back ? { files: [...new Set(files.get(p.page)!.map((c) => c.file))].sort() } : {}) })),
    journeyFiles: journeyChanges.map((c) => c.file),
    toLook,
    applied,
  });
  const out = join(after, "ratchet.json");
  await writeFile(out, JSON.stringify(decision(null), null, 2) + "\n");
  if (!going.length) return 0;
  if (!apply) {
    console.log(`Run again with --apply, on ${runBranch}, to put ${going.length === 1 ? "it" : "them"} back and commit. Decision: ${out}`);
    return 0;
  }

  const current = await git(root, ["branch", "--show-current"]);
  if (current !== runBranch) throw new Refusal(`--apply puts pages back on the run branch, ${runBranch}, and this checkout is on ${current || "a detached HEAD"}: check out ${runBranch} first.`);
  if (!(await exec("git", ["-C", root, "diff", "--cached", "--quiet"]).then(() => true, () => false))) throw new Refusal(`The index holds staged changes: commit or unstage them first, so the commit of the pages put back holds them alone.`);
  const all = [...[...files.values()].flat(), ...journeyChanges];
  // Each entry is « XY path »: the path starts at its fourth character, so the output is read as git prints it, never trimmed.
  const status = (await exec("git", ["-C", root, "status", "--porcelain", "-z", "--untracked-files=all", "--", ...new Set(all.map((c) => c.file))], BIG)).stdout;
  const dirty = status.split("\0").filter((e) => e.length > 3).map((e) => e.slice(3));
  if (dirty.length) throw new Refusal(`${dirty.join(", ")} ${dirty.length === 1 ? "has" : "have"} changes not committed: commit them or put them back first, never lose them.`);
  for (const c of all) {
    if (c.added) await git(root, ["rm", "-q", "-f", "--ignore-unmatch", "--", c.file]);
    else await git(root, ["checkout", c.from, "--", c.file]);
  }
  if (await exec("git", ["-C", root, "diff", "--cached", "--quiet"]).then(() => true, () => false)) {
    console.log(`The pages are already as they were before the wave: nothing to commit.`);
    return 0;
  }
  await git(root, ["commit", "-q", "-m", `aeom: pages put back as they were before the screen wave: ${going.map((p) => p.page).join(", ")}`]);
  const sha = await git(root, ["rev-parse", "HEAD"]);
  await writeFile(out, JSON.stringify(decision(sha), null, 2) + "\n");
  console.log(`Put back and committed (${sha.slice(0, 7)}): ${going.map((p) => p.page).join(", ")}.`);
  console.log(`They still render through the new kit: measure them again. On ${runBranch}, aeom capture and aeom check at the run's widths, the page judge on what changed since ${after}, aeom snapshot ${join(runDir, "after-revert")}, then aeom compare ${join(runDir, "before")} ${join(runDir, "after-revert")}.`);
  if (replays.after) console.log(`The journeys were replayed on the pages before: replay them again into ${journeysAfter}, judge them, and run their ratchet again.`);
  return 0;
}

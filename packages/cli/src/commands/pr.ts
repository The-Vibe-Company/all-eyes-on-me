import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { parseArgs, promisify } from "node:util";
import { prBody, readRun, RunReportError } from "@aeom/core";
import { latestRun } from "./report.js";

const run = promisify(execFile);
const ok = (cmd: string, args: string[]) => run(cmd, args).then((r) => r.stdout.trim(), () => null);

const PR_HELP = `Usage: aeom pr [run-dir] [--base <branch>] [--dry-run]

Pushes the run's branch, aeom/<run>, and opens a pull request toward the branch
the run started from (default: the one noted in the run's folder, base). The
description says in words what the run kept, sent back and why, the missing
features, and where the result page is on this machine. No image and no
capture: a run branch that commits one is refused. AEOM merges nothing; the
PR follows the repository's rules. Without a remote or a signed-in gh, the
branch stays here. After « nothing to redo », no PR.

Options:
  --base <branch>   The branch the run started from
  --dry-run         Print the PR and stop: nothing is pushed`;

/** What a PR must never carry: a capture, an image, or a file of a run's folder. */
const FORBIDDEN = /\.(png|jpe?g|gif|webp|avif|bmp|tiff?)$|(^|\/)\.aeom\/(runs|captures)\//i;

export async function runPr(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({ args: argv, allowPositionals: true, options: { base: { type: "string" }, "dry-run": { type: "boolean" }, help: { type: "boolean", short: "h" } } });
  if (values.help || positionals.length > 1) {
    console.log(PR_HELP);
    return values.help ? 0 : 1;
  }
  const runDir = positionals[0] ?? (await latestRun());
  if (!runDir) {
    console.error(`No run in .aeom/runs: run /aeom first.`);
    return 1;
  }
  let page;
  try {
    page = await readRun(runDir, basename(runDir));
  } catch (error) {
    if (!(error instanceof RunReportError)) throw error;
    console.error(error.message);
    return 1;
  }
  if (page.verdict?.nothingToRedo) {
    console.log(`Nothing to redo: no PR.`);
    return 0;
  }
  const branch = `aeom/${basename(runDir)}`;
  if ((await ok("git", ["rev-parse", "--verify", "--quiet", branch])) === null) {
    console.error(`No branch ${branch}: the run kept nothing to propose.`);
    return 1;
  }
  const base = values.base ?? (await readFile(join(runDir, "base"), "utf8").then((t) => t.trim(), () => ""));
  if (!base) {
    console.error(`Which branch did the run start from? Give it with --base <branch>.`);
    return 1;
  }
  // Every commit of the run, not only its end: a capture added then removed would still be in the history.
  const files = ((await ok("git", ["log", "--name-only", "--format=", `${base}..${branch}`])) ?? "").split("\n").filter(Boolean);
  const forbidden = [...new Set(files.filter((f) => FORBIDDEN.test(f)))];
  if (forbidden.length) {
    console.error(`${branch} commits ${forbidden.join(", ")}: no image or capture leaves the machine. Take ${forbidden.length === 1 ? "it" : "them"} out of the run's history, then aeom pr again.`);
    return 1;
  }

  const report = resolve(runDir, "report.html");
  const { title, body } = prBody(page, report);
  if (values["dry-run"]) {
    console.log(`Would push ${branch} and open a PR toward ${base}:\n\n${title}\n\n${body}`);
    return 0;
  }
  const remote = (await ok("git", ["remote"]))?.split("\n").find(Boolean);
  if (!remote) {
    console.log(`No remote: the branch ${branch} stays here, and so does the result page, ${report}.`);
    return 0;
  }
  if ((await ok("gh", ["auth", "status"])) === null) {
    console.log(`gh is not installed or not signed in: the branch ${branch} stays here, and so does the result page, ${report}. Push it and open the PR by hand, or sign in with gh auth login and run aeom pr again.`);
    return 0;
  }
  try {
    await run("git", ["push", "-u", remote, branch]);
  } catch (error) {
    console.error(`Could not push ${branch} to ${remote}: ${(error as { stderr?: string }).stderr?.trim() || (error as Error).message}`);
    return 1;
  }
  const dir = await mkdtemp(join(tmpdir(), "aeom-pr-"));
  try {
    await writeFile(join(dir, "body.md"), body);
    const url = (await run("gh", ["pr", "create", "--base", base, "--head", branch, "--title", title, "--body-file", join(dir, "body.md")])).stdout.trim();
    console.log(`PR opened: ${url}\nIt follows the repository's rules: AEOM merges nothing.`);
    return 0;
  } catch (error) {
    console.error(`${branch} is pushed, but the PR could not be opened: ${(error as { stderr?: string }).stderr?.trim() || (error as Error).message}`);
    return 1;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

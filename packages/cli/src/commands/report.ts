import { execFile, spawn } from "node:child_process";
import { readdir, stat, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { parseArgs, promisify } from "node:util";
import { readRun, resultHtml, RunReportError } from "@aeom/core";

const REPORT_HELP = `Usage: aeom report [run-dir] [--open]

Writes the page of what a run gave, report.html, in the run's folder
(default: the latest one in .aeom/runs): the direction chosen and why, each
screen and each journey before and after, kept or sent back and why, what still
fails; or « nothing to redo », with what was measured. The page needs no network,
and nothing in it leaves the machine.

Options:
  --open   Open the page in the browser`;

/** The run folder most recently changed in .aeom/runs. */
async function latestRun(): Promise<string | null> {
  const root = join(".aeom", "runs");
  const names = await readdir(root).catch(() => [] as string[]);
  const runs = await Promise.all(names.map(async (name) => ({ dir: join(root, name), at: (await stat(join(root, name, "before")).catch(() => null))?.mtimeMs })));
  return runs.filter((r) => r.at !== undefined).sort((a, b) => b.at! - a.at!)[0]?.dir ?? null;
}

export async function runReport(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({ args: argv, allowPositionals: true, options: { open: { type: "boolean" }, help: { type: "boolean", short: "h" } } });
  if (values.help || positionals.length > 1) {
    console.log(REPORT_HELP);
    return values.help ? 0 : 1;
  }
  const runDir = positionals[0] ?? (await latestRun());
  if (!runDir) {
    console.error(`No run in .aeom/runs: run /aeom first.`);
    return 1;
  }
  let html: string;
  try {
    html = resultHtml(await readRun(runDir, basename(runDir)));
  } catch (error) {
    if (!(error instanceof RunReportError)) throw error;
    console.error(error.message);
    return 1;
  }
  const page = join(runDir, "report.html");
  await writeFile(page, html);
  console.log(`Report: ${relative(process.cwd(), page) || page}`);

  // The captures stay on this machine: a run folder git would commit is said.
  const ignored = await promisify(execFile)("git", ["check-ignore", "-q", runDir]).then(() => true, (error: { code?: number }) => (error.code === 1 ? false : null));
  if (ignored === false) console.log(`${runDir} is not ignored by git: add .aeom/runs/ to .gitignore, so no capture enters a commit.`);

  if (values.open) {
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
    spawn(opener, [page], { detached: true, stdio: "ignore" }).unref();
  }
  return 0;
}

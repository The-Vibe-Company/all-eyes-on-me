import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { comparePages, scorePages, snapshot, type CheckReport, type JudgeReport } from "@aeom/core";

export async function runSnapshot(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({ args: argv, allowPositionals: true, options: { help: { type: "boolean", short: "h" } } });
  if (values.help || positionals.length !== 1) {
    console.log(`Usage: aeom snapshot <dir>\n\nCopies .aeom/captures and .aeom/reports into <dir>, such as .aeom/runs/<run>/before,\nso the next capture cannot overwrite them.`);
    return values.help ? 0 : 1;
  }
  await snapshot(".aeom", positionals[0]!);
  console.log(`Captures and reports copied to ${positionals[0]}`);
  return 0;
}

async function readReport<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return undefined;
  }
}

export async function runCompare(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({ args: argv, allowPositionals: true, options: { help: { type: "boolean", short: "h" } } });
  if (values.help || positionals.length !== 2) {
    console.log(`Usage: aeom compare <before-dir> <after-dir>\n\nCompares two snapshots page by page: what fails before and after (checks + principles).\nWrites compare.json in <after-dir>.`);
    return values.help ? 0 : 1;
  }
  const [beforeDir, afterDir] = positionals as [string, string];
  const scores = async (dir: string) =>
    scorePages(await readReport<CheckReport>(join(dir, "reports", "check.json")), await readReport<JudgeReport>(join(dir, "reports", "judge.json")));
  const comparison = comparePages(await scores(beforeDir), await scores(afterDir));
  if (comparison.length === 0) {
    console.error(`No report to compare in ${beforeDir}.`);
    return 1;
  }
  await writeFile(join(afterDir, "compare.json"), JSON.stringify(comparison, null, 2) + "\n");

  const column = Math.max(...comparison.map((c) => c.page.length)) + 2;
  const mark = { better: "↑ better", same: "= same", worse: "↓ worse" };
  console.log(`${"page".padEnd(column)}before  after   (checks + principles failing)`);
  for (const c of comparison) {
    console.log(`${c.page.padEnd(column)}${String(c.before.total).padEnd(8)}${String(c.after.total).padEnd(8)}${mark[c.verdict]}`);
  }
  return 0;
}

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs, promisify } from "node:util";
import { ConfigError, guardJourneys, loadConfig, type JourneyReport, type ServerCall } from "@aeom/core";

export const GUARD_HELP = `Usage: aeom guard <before-dir> <after-dir> [options]

Tells a change of navigation, copy or state from a feature. Compares the
server calls of the journeys replayed before and after (each folder holds the
report.json of aeom journey) and the files changed since --base: a call the
app never made, new fields sent to a call it made, or a changed file listed
as "protected" in .aeom/config.json is refused. Exits with 1 when something is.

Options:
  --base <ref>         The commit the change started from; without it, only
                       the calls are compared
  --feature "<ask>"    What the user asked for explicitly, in their words
  --allow <what>       A call, such as "POST /api/orders", or a file that the
                       request needs; repeat it; needs --feature`;

const git = (args: string[]) => promisify(execFile)("git", args).then(({ stdout }) => stdout);

export async function changedSince(base: string): Promise<string[]> {
  const lines = async (args: string[]) => (await git(args)).split("\n").filter(Boolean);
  return [...new Set([...(await lines(["diff", "--name-only", base])), ...(await lines(["ls-files", "--others", "--exclude-standard"]))])];
}

/** The protected globs of the config as it was at the base: a change cannot unprotect a file and then change it. */
export async function protectedAt(base: string): Promise<string[]> {
  let text: string;
  try {
    text = await git(["show", `${base}:./.aeom/config.json`]);
  } catch {
    return [];
  }
  try {
    const globs = (JSON.parse(text) as { protected?: unknown }).protected;
    return Array.isArray(globs) ? globs.filter((g): g is string => typeof g === "string" && !!g.trim()).map((g) => g.trim()) : [];
  } catch {
    return [];
  }
}

/** The journeys and widths replayed before that the after replay leaves out: their calls would go unchecked. */
export function missingReplays(before: JourneyReport, after: JourneyReport): string[] {
  return before.journeys.flatMap((j) => {
    const again = after.journeys.find((a) => a.slug === j.slug);
    if (!again) return [`"${j.name}"`];
    const widths = j.runs.map((r) => r.width).filter((w) => !again.runs.some((r) => r.width === w));
    return widths.length ? [`"${j.name}" at ${widths.join(", ")} px`] : [];
  });
}

/** A report of aeom journey with the calls of each run, or what is wrong with it. */
export function problemWith(report: unknown): string | null {
  const r = report as Partial<JourneyReport> | null;
  if (!r || !Array.isArray(r.journeys)) return "it is not a report of aeom journey";
  if (r.journeys.length === 0) return "it has no journey";
  for (const j of r.journeys) {
    if (typeof j?.name !== "string" || !Array.isArray(j.runs) || j.runs.length === 0) return "a journey in it has no replay";
    for (const run of j.runs) {
      const calls = (run as { calls?: unknown }).calls;
      if (!Array.isArray(calls)) return `"${j.name}" has no list of calls: replay it again with this version of aeom journey`;
      if (!calls.every((c: Partial<ServerCall>) => typeof c?.method === "string" && typeof c.path === "string" && Array.isArray(c.query) && Array.isArray(c.fields))) return `a call of "${j.name}" is not a method, a path and names`;
    }
  }
  return null;
}

export async function runGuard(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { base: { type: "string" }, feature: { type: "string" }, allow: { type: "string", multiple: true }, help: { type: "boolean", short: "h" } },
  });
  if (values.help || positionals.length !== 2) {
    console.log(GUARD_HELP);
    return values.help ? 0 : 1;
  }
  // An empty base would compare no file at all, and the guard would pass without saying so.
  if (values.base !== undefined && !values.base.trim()) {
    console.error(`--base cannot be empty: give the commit the change started from, or leave the option out to compare the calls only.`);
    return 1;
  }
  const allow = values.allow ?? [];
  if (allow.length && !values.feature?.trim()) {
    console.error(`--allow needs --feature: what the user asked for, in their words. AEOM builds no feature it was not asked for explicitly.`);
    return 1;
  }
  const read = async (dir: string): Promise<JourneyReport | null> => {
    let report: unknown;
    try {
      report = JSON.parse(await readFile(join(dir, "report.json"), "utf8"));
    } catch {
      console.error(`No replayed journeys in ${dir}. Run aeom journey --out ${dir} first.`);
      return null;
    }
    const problem = problemWith(report);
    if (problem) {
      console.error(`${join(dir, "report.json")} cannot be compared: ${problem}.`);
      return null;
    }
    return report as JourneyReport;
  };
  const before = await read(positionals[0]!);
  const after = await read(positionals[1]!);
  if (!before || !after) return 1;
  const missing = missingReplays(before, after);
  if (missing.length) {
    console.error(`The after replay leaves out ${missing.join(", ")}: replay every journey of the before, at every width, or what they call goes unchecked.`);
    return 1;
  }
  let protectedFiles: string[] = [];
  try {
    protectedFiles = (await loadConfig()).protected ?? [];
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(error.message);
    return 1;
  }
  let changed: string[] = [];
  if (values.base) {
    try {
      changed = await changedSince(values.base);
      protectedFiles = [...new Set([...(await protectedAt(values.base)), ...protectedFiles])];
    } catch (error) {
      console.error(`Cannot list the files changed since ${values.base}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
      return 1;
    }
  }

  if (protectedFiles.length === 0) console.log(`No "protected" list in .aeom/config.json: AEOM compared the calls only, and no file is protected.\n`);
  const { refused, allowed } = guardJourneys({ before, after, changed, protectedFiles, allow });
  for (const v of allowed) console.log(`✓ ${v.what}  let through for the feature asked: "${values.feature}"`);
  for (const v of refused) console.log(`✗ ${v.what}  ${v.why}${v.journey ? `, in "${v.journey}"` : ""}`);
  if (refused.length) {
    console.log(`\nRefused: ${refused.length === 1 ? "this is" : "these are"} a feature, and AEOM changes navigation, copy and states only. Undo it, or, if the user asked for it explicitly, run again with --feature and --allow.`);
    return 1;
  }
  // What was let through is a call or a file that changed: say only what holds for everything else.
  if (allowed.length) console.log(`\nNothing else: every other call was made before${values.base ? ", and no other protected file changed" : ""}.`);
  else console.log(`No feature added: every call was made before${values.base ? ", and no protected file changed" : ""}.`);
  return 0;
}

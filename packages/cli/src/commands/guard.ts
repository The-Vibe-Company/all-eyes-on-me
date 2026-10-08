import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs, promisify } from "node:util";
import { ConfigError, guardJourneys, loadConfig, type JourneyReport } from "@aeom/core";

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

export async function changedSince(base: string): Promise<string[]> {
  const git = (args: string[]) => promisify(execFile)("git", args).then(({ stdout }) => stdout.split("\n").filter(Boolean));
  return [...new Set([...(await git(["diff", "--name-only", base])), ...(await git(["ls-files", "--others", "--exclude-standard"]))])];
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
  const allow = values.allow ?? [];
  if (allow.length && !values.feature?.trim()) {
    console.error(`--allow needs --feature: what the user asked for, in their words. AEOM builds no feature it was not asked for explicitly.`);
    return 1;
  }
  const read = async (dir: string): Promise<JourneyReport | null> => {
    try {
      return JSON.parse(await readFile(join(dir, "report.json"), "utf8")) as JourneyReport;
    } catch {
      console.error(`No replayed journeys in ${dir}. Run aeom journey --out ${dir} first.`);
      return null;
    }
  };
  const before = await read(positionals[0]!);
  const after = await read(positionals[1]!);
  if (!before || !after) return 1;
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
    } catch (error) {
      console.error(`Cannot list the files changed since ${values.base}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
      return 1;
    }
  }

  const { refused, allowed } = guardJourneys({ before, after, changed, protectedFiles, allow });
  for (const v of allowed) console.log(`✓ ${v.what}  let through for the feature asked: "${values.feature}"`);
  for (const v of refused) console.log(`✗ ${v.what}  ${v.why}${v.journey ? `, in "${v.journey}"` : ""}`);
  if (refused.length) {
    console.log(`\nRefused: ${refused.length === 1 ? "this is" : "these are"} a feature, and AEOM changes navigation, copy and states only. Undo it, or, if the user asked for it explicitly, run again with --feature and --allow.`);
    return 1;
  }
  console.log(`${allowed.length ? "\n" : ""}No feature added${allowed.length ? " beyond what was asked" : ""}: every call was made before${values.base ? ", and no protected file changed" : ""}.`);
  return 0;
}

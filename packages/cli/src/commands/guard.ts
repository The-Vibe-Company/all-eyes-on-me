import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs, promisify } from "node:util";
import { ConfigError, guardJourneys, loadConfig, type JourneyReport, type ServerCall } from "@aeom/core";

export const GUARD_HELP = `Usage: aeom guard <before-dir> <after-dir> [options]
       aeom guard --from-scratch <after-dir> [options]

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
                       request needs; repeat it; needs --feature
  --from-scratch       A front built from nothing, on fake data: compared with
                       nothing, so any call it makes is refused
  --api <url>          With --from-scratch, the API the front is plugged into,
                       running on this machine on its own fake data: its calls
                       are let through and listed, any other is refused`;

const git = (args: string[]) => promisify(execFile)("git", args).then(({ stdout }) => stdout);

export async function changedSince(base: string): Promise<string[]> {
  const lines = async (args: string[]) => (await git(args)).split("\n").filter(Boolean);
  // Without rename detection, a moved file shows as its old path deleted and its new path added: both are checked.
  return [...new Set([...(await lines(["diff", "--name-only", "--no-renames", base])), ...(await lines(["ls-files", "--others", "--exclude-standard"]))])];
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

/**
 * The journeys and widths replayed before that the after replay leaves out: their calls would go unchecked.
 * With `finished`, a replay that broke where the before went to its end is left out too: what it would
 * have called after the break is unknown.
 */
export function missingReplays(before: JourneyReport, after: JourneyReport, { finished = false } = {}): string[] {
  return before.journeys.flatMap((j) => {
    const again = after.journeys.find((a) => a.slug === j.slug);
    if (!again) return [`"${j.name}"`];
    return j.runs.flatMap((run) => {
      const now = again.runs.find((r) => r.width === run.width);
      if (!now) return [`"${j.name}" at ${run.width} px`];
      if (finished && now.broken && !run.broken) return [`"${j.name}" at ${run.width} px, which broke at step ${now.broken.step}`];
      return [];
    });
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
    options: { base: { type: "string" }, feature: { type: "string" }, allow: { type: "string", multiple: true }, "from-scratch": { type: "boolean" }, api: { type: "string" }, help: { type: "boolean", short: "h" } },
  });
  // The API a front built from nothing is plugged into: on this machine only, on its own fake data.
  let api: string | null = null;
  if (values.api !== undefined && !values.help) {
    if (!values["from-scratch"]) {
      console.error(`--api goes with --from-scratch: the API a front built from nothing is plugged into.`);
      return 1;
    }
    let target: URL | null = null;
    try {
      target = new URL(values.api);
    } catch {
      target = null;
    }
    const local = target && /^https?:$/.test(target.protocol) && (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(target.hostname) || /\.(localhost|test)$/.test(target.hostname));
    if (!target || !local) {
      console.error(`--api is an API running on this machine, on its own fake data, such as http://localhost:8000: AEOM touches no real data.`);
      return 1;
    }
    api = `${target.origin}${target.pathname.replace(/\/+$/, "")}`;
  }
  // A front built from nothing is compared with nothing: it may make no call at all, but those an API asked for allows.
  if (values["from-scratch"] && !values.help && positionals.length !== 1) {
    console.error(`--from-scratch compares a replay with nothing: give one folder, the replay of the front built.`);
    return 1;
  }
  if (!values.help && values["from-scratch"]) positionals.unshift(positionals[0]!);
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
  const after = await read(positionals[1]!);
  // From scratch, the before is the same journeys, calling nothing.
  // From scratch, the before is the same journeys going to their end and calling nothing: one that breaks is refused below.
  const before = values["from-scratch"] ? (after ? { ...after, journeys: after.journeys.map((j) => ({ ...j, runs: j.runs.map((r) => ({ ...r, calls: [], broken: null })) })) } : null) : await read(positionals[0]!);
  if (!before || !after) return 1;
  const missing = missingReplays(before, after, { finished: true });
  if (missing.length) {
    console.error(`The after replay leaves out ${missing.join(", ")}: replay every journey of the before to its end, at every width, or what they call goes unchecked.`);
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
  const guarded = guardJourneys({ before, after, changed, protectedFiles, allow, scratch: Boolean(values["from-scratch"]) });
  // A call to the API given is the front reading its data: let through, and listed.
  const toApi = (v: { kind: string; what: string }) => api !== null && v.kind === "call" && (() => {
    const target = v.what.slice(v.what.indexOf(" ") + 1);
    return target === api || target.startsWith(`${api}/`);
  })();
  const fromApi = guarded.refused.filter(toApi);
  const refused = guarded.refused.filter((v) => !toApi(v));
  const allowed = guarded.allowed;
  for (const v of fromApi) console.log(`✓ ${v.what}  a call to the API given`);
  for (const v of allowed) console.log(`✓ ${v.what}  let through for the feature asked: "${values.feature}"`);
  for (const v of refused) {
    const journeys = v.journeys ?? (v.journey ? [v.journey] : []);
    console.log(`✗ ${v.what}  ${v.why}${journeys.length ? `, in ${journeys.map((name) => `"${name}"`).join(", ")}` : ""}`);
  }
  if (refused.length && values["from-scratch"]) {
    console.log(`\nRefused: a front built from scratch calls no server but the API given with --api. Read the data through the data module.`);
    return 1;
  }
  if (refused.length) {
    console.log(`\nRefused: ${refused.length === 1 ? "this is" : "these are"} a feature, and AEOM changes navigation, copy and states only. Undo it, or, if the user asked for it explicitly, run again with --feature and --allow.`);
    return 1;
  }
  // What was let through is a call or a file that changed: say only what holds for everything else.
  if (allowed.length) console.log(`\nNothing else: every other call was made before${values.base ? ", and no other protected file changed" : ""}.`);
  else if (values["from-scratch"] && fromApi.length) console.log(`\nNo other call: the front calls the API given and nothing else${values.base ? ", and no protected file changed" : ""}.`);
  else if (values["from-scratch"]) console.log(`No call to a server: the front runs on its own data${values.base ? ", and no protected file changed" : ""}.`);
  else console.log(`No feature added: every call was made before${values.base ? ", and no protected file changed" : ""}.`);
  return 0;
}

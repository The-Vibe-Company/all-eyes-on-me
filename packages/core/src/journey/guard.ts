import type { JourneyReport } from "./replay.js";

/** Something a new version does that the old one did not, and that only a feature would. */
export interface Violation {
  kind: "call" | "fields" | "file";
  /** The call, as `POST /api/orders`, or the file's path. */
  what: string;
  /** Why it counts, in a few words. */
  why: string;
  /** The journey that showed it first, for a call. */
  journey?: string;
}

export interface GuardResult {
  /** What the new version may not do. */
  refused: Violation[];
  /** What it does that the user asked for explicitly. */
  allowed: Violation[];
}

export interface GuardOptions {
  before: JourneyReport;
  after: JourneyReport;
  /** The files the new version changed, relative to the project's root. */
  changed?: string[];
  /** The files that hold the app's data or logic, as globs such as `src/lib/db/**`. */
  protectedFiles?: string[];
  /** Calls (`POST /api/orders`) and files the user's explicit request needs. */
  allow?: string[];
}

/** A glob as a regular expression: `**` crosses folders, `*` and `?` stay in one. */
export function globToRegExp(glob: string): RegExp {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*" && glob[i + 1] === "*") {
      const slash = glob[i + 2] === "/";
      source += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (c === "*") source += "[^/]*";
    else if (c === "?") source += "[^/]";
    else source += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

/**
 * Compares the server calls of two replays of the same journeys, and the files
 * a new version changed, to tell a change of navigation, copy or state from a
 * feature. A call the app never made before, new field names sent to a call
 * it made, or a changed file that holds the app's data or logic are refused,
 * unless the user's explicit request allows them.
 */
export function guardJourneys({ before, after, changed = [], protectedFiles = [], allow = [] }: GuardOptions): GuardResult {
  const known = new Map<string, Set<string>>();
  for (const run of before.journeys.flatMap((j) => j.runs)) {
    for (const call of run.calls ?? []) {
      const names = known.get(`${call.method} ${call.path}`) ?? new Set<string>();
      for (const name of [...call.query, ...call.fields]) names.add(name);
      known.set(`${call.method} ${call.path}`, names);
    }
  }

  const found = new Map<string, Violation>();
  for (const journey of after.journeys) {
    for (const call of journey.runs.flatMap((r) => r.calls ?? [])) {
      const what = `${call.method} ${call.path}`;
      const names = known.get(what);
      if (!names) {
        if (!found.has(`call ${what}`)) found.set(`call ${what}`, { kind: "call", what, why: "a call the app did not make before", journey: journey.name });
        continue;
      }
      const added = [...call.fields, ...call.query].filter((name) => !names.has(name));
      if (added.length && !found.has(`fields ${what}`)) found.set(`fields ${what}`, { kind: "fields", what, why: `sends new fields: ${[...new Set(added)].join(", ")}`, journey: journey.name });
    }
  }
  const patterns = protectedFiles.map(globToRegExp);
  for (const file of changed) {
    if (patterns.some((p) => p.test(file))) found.set(`file ${file}`, { kind: "file", what: file, why: "a file that holds the app's data or logic" });
  }

  const result: GuardResult = { refused: [], allowed: [] };
  for (const violation of found.values()) (allow.includes(violation.what) ? result.allowed : result.refused).push(violation);
  return result;
}

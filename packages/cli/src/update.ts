import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { aeomHome } from "@aeom/core";
import { telemetryOn } from "./telemetry.js";

/** The checkout AEOM runs from: its repository, which `aeom update` pulls. */
export const aeomRepo = () => process.env.AEOM_REPO || fileURLToPath(new URL("../../../", import.meta.url));

/** Git never waits on a password: a remote that asks for one is a check that cannot tell. */
const QUIET_GIT = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? "ssh -o BatchMode=yes" };
export const git = (cwd: string, args: string[], timeout = 20_000) => promisify(execFile)("git", args, { cwd, timeout, env: QUIET_GIT }).then((r) => r.stdout.trim());

/** What AEOM last saw of its latest version. */
export interface UpdateState {
  checkedAt: string;
  /** The commit AEOM ran from then: a later one makes what was seen stale. */
  head: string;
  behind: number;
  latest: string;
  notifiedAt?: string;
  /** A commit pulled whose update steps have not run to their end: the next aeom update runs them. */
  stepsLeft?: string;
}

const stateFile = () => join(aeomHome(), "update.json");

/** What AEOM last saw; null when nothing, or a file broken by hand: then it looks again. */
export async function readUpdateState(): Promise<UpdateState | null> {
  try {
    const state = JSON.parse(await readFile(stateFile(), "utf8")) as UpdateState;
    return state && typeof state.checkedAt === "string" ? state : null;
  } catch {
    return null;
  }
}

/** Written whole or not at all: two commands at once never leave half a file. */
export async function writeUpdateState(state: UpdateState): Promise<void> {
  await mkdir(aeomHome(), { recursive: true });
  const tmp = `${stateFile()}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`);
  await rename(tmp, stateFile());
}

/** AEOM's own checkout, at its root: never another project's, nor a folder inside one. */
export async function isAeomCheckout(repo = aeomRepo()): Promise<boolean> {
  try {
    const [top, here] = await Promise.all([git(repo, ["rev-parse", "--show-toplevel"]).then((t) => realpath(t)), realpath(repo)]);
    if (top !== here) return false;
    return (JSON.parse(await readFile(join(repo, "package.json"), "utf8")) as { name?: string }).name === "all-eyes-on-me";
  } catch {
    return false;
  }
}

/** How many commits AEOM's checkout is behind its remote's main, after fetching it now; null when it cannot tell. */
export async function behindNow(repo = aeomRepo()): Promise<(UpdateState & { branch: string }) | null> {
  if (!(await isAeomCheckout(repo))) return null;
  try {
    await git(repo, ["fetch", "--quiet", "origin", "main"]);
    const [head, behind, latest, branch] = await Promise.all([git(repo, ["rev-parse", "HEAD"]), git(repo, ["rev-list", "--count", "HEAD..origin/main"]), git(repo, ["rev-parse", "--short", "origin/main"]), git(repo, ["branch", "--show-current"])]);
    return { checkedAt: new Date().toISOString(), head, behind: Number(behind), latest, branch };
  } catch {
    return null;
  }
}

/** What was seen, keeping when the person was last told, while it says the same. */
export function seenNow(seen: UpdateState, before: UpdateState | null): UpdateState {
  const same = before?.notifiedAt && before.head === seen.head && before.behind === seen.behind;
  return { ...seen, ...(same ? { notifiedAt: before!.notifiedAt } : {}), ...(before?.stepsLeft ? { stepsLeft: before.stepsLeft } : {}) };
}

/**
 * Whether AEOM looks for its latest version: never with AEOM_UPDATE_CHECK=0, always with
 * AEOM_UPDATE_CHECK=1, and otherwise only when it may send anything at all: not when
 * telemetry is off (AEOM_TELEMETRY=0, DO_NOT_TRACK), in CI, or under AEOM's own tests.
 */
export function updateCheckOn(env: NodeJS.ProcessEnv = process.env): boolean {
  const asked = (env.AEOM_UPDATE_CHECK ?? "").trim().toLowerCase();
  if (["0", "false", "off", "no"].includes(asked)) return false;
  if (["1", "true", "on", "yes"].includes(asked)) return true;
  return telemetryOn(env);
}

const DAY = 24 * 3600_000;
const SIX_HOURS = 6 * 3600_000;

/**
 * After a command that went well: says, on the error output, that AEOM is behind, from
 * what it last saw, at most every six hours; and once a day looks again, in the background,
 * so no command waits on the network. The look is noted before it starts, so commands at
 * once start one, and a look that fails waits a day too.
 */
export async function updateNotice(): Promise<void> {
  if (!updateCheckOn() || process.exitCode) return;
  const state = await readUpdateState();
  const now = Date.now();
  if (!state || now - Date.parse(state.checkedAt) > DAY) {
    await writeUpdateState({ head: "", behind: 0, latest: "", ...state, checkedAt: new Date(now).toISOString() });
    const checker = fileURLToPath(new URL("./update-check.js", import.meta.url));
    spawn(process.execPath, [checker], { detached: true, stdio: "ignore", windowsHide: true, env: process.env }).unref();
  }
  if (!state || state.behind <= 0 || (state.notifiedAt && now - Date.parse(state.notifiedAt) < SIX_HOURS)) return;
  // What was seen from another commit, before an update, says nothing of this one.
  const head = await git(aeomRepo(), ["rev-parse", "HEAD"], 2000).catch(() => null);
  if (head !== state.head) return;
  console.error(`\nAEOM is ${state.behind} commit${state.behind === 1 ? "" : "s"} behind its latest version: aeom update. (AEOM_UPDATE_CHECK=0 turns this off.)`);
  await writeUpdateState({ ...state, notifiedAt: new Date(now).toISOString() });
}

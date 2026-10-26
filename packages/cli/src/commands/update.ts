import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs, promisify } from "node:util";
import { aeomRepo, behindNow, git, readUpdateState, seenNow, writeUpdateState } from "../update.js";

export const UPDATE_HELP = `Usage: aeom update [--check]

Brings AEOM up to date: the checkout it runs from pulls its remote's main,
fast-forward only, then runs the steps its repository writes for it
(\`pnpm run update\`: install, build, the browser). It refuses a checkout with
changes of its own, or on another branch than main. Steps that failed run
again on the next aeom update.

  --check   Look now, and say whether AEOM is up to date (exit 0), behind
            (exit 1), or cannot tell (exit 2: not AEOM's git checkout, no
            network, a remote that asks for a password)

Once a day at most, AEOM looks in the background (a git fetch, nothing else
sent), and a command says it when it is behind. AEOM_UPDATE_CHECK=0 turns it
off; it is off by default when telemetry is (AEOM_TELEMETRY=0, DO_NOT_TRACK)
and in CI.`;

const plural = (n: number) => `${n} commit${n === 1 ? "" : "s"}`;
const why = (error: unknown) => {
  const e = error as { stderr?: string; message?: string };
  return (e.stderr?.trim() || e.message || String(error)).split("\n").filter(Boolean).slice(-5).join("\n");
};

/** The steps the checkout writes for itself, run from it: install what it needs, build it, fetch its browser. */
async function runSteps(repo: string): Promise<string | null> {
  const scripts = await readFile(join(repo, "package.json"), "utf8").then((t) => (JSON.parse(t) as { scripts?: Record<string, string> }).scripts ?? {}).catch(() => ({}) as Record<string, string>);
  if (!scripts.update) return `its package.json writes no update steps: run pnpm install and pnpm build in ${repo}`;
  try {
    await promisify(execFile)("pnpm", ["run", "--silent", "update"], { cwd: repo, timeout: 900_000, maxBuffer: 1 << 26, shell: process.platform === "win32" });
    return null;
  } catch (error) {
    return `its update steps failed: run aeom update again once this is fixed.\n${why(error)}`;
  }
}

export async function runUpdate(argv: string[]): Promise<number> {
  const { values } = parseArgs({ args: argv, options: { check: { type: "boolean" }, help: { type: "boolean", short: "h" } } });
  if (values.help) return (console.log(UPDATE_HELP), 0);
  const repo = aeomRepo();
  const seen = await behindNow(repo);
  if (!seen) {
    console.error(`Cannot tell whether AEOM is up to date: ${repo} is not AEOM's own git checkout with a remote, the network is down, or the remote asks for a password.`);
    return 2;
  }
  const before = await readUpdateState();
  await writeUpdateState(seenNow(seen, before));
  if (values.check) {
    console.log(seen.behind ? `AEOM is ${plural(seen.behind)} behind its latest version: aeom update.` : `AEOM is up to date (${seen.head.slice(0, 7)}).`);
    return seen.behind ? 1 : 0;
  }
  if (!seen.behind) {
    // A pull whose steps failed: they run again, from the commit it pulled.
    if (before?.stepsLeft && before.stepsLeft === seen.head) {
      const failed = await runSteps(repo);
      if (failed) return (console.error(`AEOM is at ${seen.head.slice(0, 7)}, but ${failed}`), 1);
      await writeUpdateState({ ...seenNow(seen, before), stepsLeft: undefined });
      console.log(`AEOM ran the update steps it had left, at ${seen.head.slice(0, 7)}. Restart Claude Code, so it reads the new skills and agents.`);
      return 0;
    }
    return (console.log(`AEOM is up to date (${seen.head.slice(0, 7)}).`), 0);
  }
  if (seen.branch !== "main") return (console.error(`AEOM's checkout is on ${seen.branch || "a detached HEAD"}, not main: switch it to main, then aeom update again.`), 1);
  if (await git(repo, ["status", "--porcelain"])) return (console.error(`AEOM's checkout, ${repo}, has changes of its own: commit or set them aside, then aeom update again.`), 1);
  const from = seen.head.slice(0, 7);
  try {
    await git(repo, ["pull", "--quiet", "--ff-only", "origin", "main"], 120_000);
  } catch (error) {
    return (console.error(`AEOM could not pull its latest version, fast-forward only: ${why(error)}`), 1);
  }
  const head = await git(repo, ["rev-parse", "HEAD"]);
  // Noted before the steps run: a step that fails runs again on the next aeom update.
  await writeUpdateState({ ...seen, head, behind: 0, stepsLeft: head });
  const failed = await runSteps(repo);
  if (failed) return (console.error(`AEOM pulled ${head.slice(0, 7)}, but ${failed}`), 1);
  await writeUpdateState({ ...seen, head, behind: 0 });
  console.log(`Updated AEOM from ${from} to ${head.slice(0, 7)}: ${plural(seen.behind)}. Restart Claude Code, so it reads the new skills and agents.`);
  return 0;
}

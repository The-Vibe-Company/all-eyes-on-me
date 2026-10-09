import { execFile } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseArgs, promisify } from "node:util";
import { prBody, readRun, RunReportError, type ResultPage } from "@aeom/core";
import { latestRun } from "./report.js";

const exec = promisify(execFile);
// A run can touch thousands of files: git's answer must not stop at Node's default megabyte.
const BIG = { maxBuffer: 256 * 1024 * 1024 };

const PR_HELP = `Usage: aeom pr [run-dir] [--base <branch>] [--dry-run]

Pushes the run's branch, aeom/<run>, and opens a pull request toward the branch
the run started from (default: the one noted in the run's folder, base), on the
remote that branch goes to: its own, else origin, else the only one. The
description says in words what the run kept, sent back and why, the missing
features, and where the result page is from the repository's root. When the
branch already has an open PR, its description is updated instead.

No image and no capture leaves the machine. Every commit the PR would carry is
read, from the base as the remote has it, so the user's own not yet pushed too:
one that adds or changes a PNG, JPEG, GIF, WebP, AVIF, BMP, TIFF, ICO, HEIC,
HEIF, JPEG XL, APNG or SVGZ file, or a file of .aeom/runs or .aeom/captures,
is refused. An SVG may go, being code, unless it holds an image (data:image/
or <image>). Taking an image out is fine.

AEOM merges nothing: the PR follows the repository's rules. Without a remote,
a gh signed in to its host, or the base on the remote, the branch stays here.
After « nothing to redo », or a run that kept nothing, no PR.

Options:
  --base <branch>   The branch the run started from
  --dry-run         Say where it would push, print the PR and stop: nothing is pushed`;

/** What a PR must never carry: a capture, an image, or a file of a run's folder. */
const FORBIDDEN = /\.(png|jpe?g|gif|webp|avif|bmp|tiff?|ico|heic|heif|jxl|apng|svgz)$|(^|\/)\.aeom\/(runs|captures)\//i;
// An SVG is code, so it may go; one holding a picture is a picture.
const SVG = /\.svg$/i;
const HOLDS_IMAGE = /data:image\/|<(?:[\w-]+:)?(?:fe)?image[\s/>]/i;

const git = async (args: string[]) => (await exec("git", args, BIG)).stdout;
/** What git prints, or null when what it was asked names nothing; any other failure of git is thrown. */
async function quiet(args: string[]): Promise<string | null> {
  try {
    return (await git(args)).trim();
  } catch (error) {
    const e = error as { code?: number; stderr?: string };
    if (e.code === 1 && !e.stderr?.trim()) return null;
    throw error;
  }
}
const commitOf = (rev: string) => quiet(["rev-parse", "--verify", "--quiet", `${rev}^{commit}`]);
const why = (error: unknown) => (error as { stderr?: string }).stderr?.trim() || (error as Error).message;

/** The host and the repository gh knows a remote's URL by, https or ssh; null for a path, or a URL that is not owner/name. */
export function repoOf(url: string): { host: string; repo: string } | null {
  const m = /^(?:https?|ssh|git):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/.exec(url) ?? /^(?:[^@/]+@)?([^/:]+):(?!\/)(.+)$/.exec(url);
  const path = m?.[2]?.replace(/\/$/, "").replace(/\.git$/, "");
  if (!m || !path || !/^[\w.-]+\/[\w.-]+$/.test(path)) return null;
  const host = m[1]!.toLowerCase();
  return { host, repo: host === "github.com" ? path : `${host}/${path}` };
}

/** The remote the base branch goes to: its own, else origin, else the only one. */
async function remoteOf(base: string): Promise<string | null> {
  const remotes = (await git(["remote"])).split("\n").filter(Boolean);
  const own = await quiet(["config", "--get", `branch.${base}.remote`]);
  if (own && remotes.includes(own)) return own;
  if (remotes.includes("origin")) return "origin";
  return remotes.length === 1 ? remotes[0]! : null;
}

/**
 * What the commits of a range add or change that must not leave the machine:
 * every commit, since a capture added then removed is still in the history,
 * and a merge by what it brings to its first parent.
 */
async function forbiddenIn(range: string): Promise<string[]> {
  const names = await git(["log", "-z", "--name-only", "--format=", "--diff-filter=d", "--diff-merges=first-parent", range]);
  const files = [...new Set(names.split("\0").filter(Boolean))];
  const found = files.filter((f) => FORBIDDEN.test(f));
  if (files.some((f) => SVG.test(f))) found.push(...(await svgsHoldingImages(range)).map((f) => `${f} (it holds an image)`));
  return found;
}

/** The SVGs of a range that hold an image, in any version a commit gave them. */
async function svgsHoldingImages(range: string): Promise<string[]> {
  const raw = (await git(["log", "-z", "--raw", "--no-abbrev", "--format=", "--diff-filter=d", "--diff-merges=first-parent", range])).split("\0");
  const found = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const meta = raw[i]!.trim();
    if (!meta.startsWith(":")) continue;
    const [, , , blob, status] = meta.split(" ");
    // A rename or a copy names where it comes from, then the file it makes.
    const file = raw[(i += /^[RC]/.test(status ?? "") ? 2 : 1)] ?? "";
    if (SVG.test(file) && !found.has(file) && HOLDS_IMAGE.test(await git(["cat-file", "blob", blob!]))) found.add(file);
  }
  return [...found];
}

/** Where the result page is from the repository's root: the PR never says a path of the user's machine. */
async function reportPath(runDir: string, run: string): Promise<string> {
  const inside = relative(await realpath((await git(["rev-parse", "--show-toplevel"])).trim()), await realpath(runDir));
  return inside && !inside.startsWith("..") && !isAbsolute(inside) ? [...inside.split(sep), "report.html"].join("/") : `.aeom/runs/${run}/report.html`;
}

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
  let page: ResultPage;
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
  if (!page.direction && !page.screens.some((s) => s.status === "kept") && !page.journeys.some((j) => j.status === "kept")) {
    console.log(`Nothing kept: no PR.`);
    return 0;
  }
  const noted = values.base ?? (await readFile(join(runDir, "base"), "utf8").then((t) => t.trim(), () => null));
  if (!noted) {
    // The skill notes the branch with git branch --show-current, which prints nothing on a detached HEAD.
    console.error(noted === "" && values.base === undefined ? `The run started from a detached HEAD: no branch to open a PR toward. Give one with --base <branch>.` : `Which branch did the run start from? Give it with --base <branch>.`);
    return 1;
  }
  try {
    return await propose(runDir, page, noted, values["dry-run"] === true);
  } catch (error) {
    if (!String((error as { cmd?: string }).cmd ?? "").startsWith("git")) throw error;
    console.error(`git failed: ${why(error)}`);
    return 1;
  }
}

async function propose(runDir: string, page: ResultPage, base: string, dry: boolean): Promise<number> {
  const remote = await remoteOf(base);
  // The base as the remote has it, when git knows it: the user's commits not pushed yet would go into the PR too.
  const from = (remote ? await commitOf(`refs/remotes/${remote}/${base}`) : null) ?? (await commitOf(base));
  if (!from) {
    console.error(`${base}, the branch the run started from, names nothing here${remote ? ` nor on ${remote}` : ""}: give it with --base <branch>.`);
    return 1;
  }
  const branch = `aeom/${basename(runDir)}`;
  if ((await commitOf(`refs/heads/${branch}`)) === null) {
    console.error(`No branch ${branch} here: run aeom pr in the repository the run changed.`);
    return 1;
  }
  const forbidden = await forbiddenIn(`${from}..${branch}`);
  if (forbidden.length) {
    console.error(`${branch} commits ${forbidden.join(", ")}: no image or capture leaves the machine. Take ${forbidden.length === 1 ? "it" : "them"} out of the branch's history, then aeom pr again.`);
    return 1;
  }

  const { title, body } = prBody(page, await reportPath(runDir, page.run));
  if (dry) {
    console.log(`${remote ? `Would push ${branch} to ${remote} and open a PR toward ${base}:` : `No remote: ${branch} would stay here. The PR it would open toward ${base}:`}\n\n${title}\n\n${body}`);
    return 0;
  }
  const stays = `the branch ${branch} stays here, and so does the result page, ${resolve(runDir, "report.html")}`;
  if (!remote) {
    console.log(`No remote: ${stays}.`);
    return 0;
  }
  const url = (await quiet(["config", "--get", `remote.${remote}.url`])) ?? "";
  const repo = repoOf(url);
  if (!repo) {
    console.log(`${remote} is ${url || "a remote with no URL"}, not a GitHub repository gh can open a PR on: ${stays}. Push it and open the PR by hand.`);
    return 0;
  }
  // A host gh does not know answers like one it is not signed in to.
  if (!(await exec("gh", ["auth", "status", "--hostname", repo.host]).then(() => true, () => false))) {
    console.log(`gh is not installed or not signed in to ${repo.host}: ${stays}. Push it and open the PR by hand, or sign in with gh auth login --hostname ${repo.host} and run aeom pr again.`);
    return 0;
  }
  let heads: string;
  try {
    heads = await git(["ls-remote", "--heads", remote, `refs/heads/${base}`]);
  } catch (error) {
    console.error(`Could not reach ${remote}: ${why(error)}. The branch ${branch} stays here.`);
    return 1;
  }
  if (!heads.trim()) {
    console.log(`${base} is not on ${remote}: the PR would have no branch to go to. The branch ${branch} stays here, and so does the result page, ${resolve(runDir, "report.html")}. Push ${base} first, or give another with --base <branch>.`);
    return 0;
  }
  try {
    await git(["push", "-u", remote, branch]);
  } catch (error) {
    console.error(`Could not push ${branch} to ${remote}: ${why(error)}`);
    return 1;
  }
  return openPr(repo.repo, base, branch, title, body);
}

/** Opens the PR, or updates the description of the one already open for the branch. */
async function openPr(repo: string, base: string, branch: string, title: string, body: string): Promise<number> {
  const dir = await mkdtemp(join(tmpdir(), "aeom-pr-"));
  let open: { url: string; state: string } | null = null;
  try {
    const file = join(dir, "body.md");
    await writeFile(file, body);
    const viewed = await exec("gh", ["pr", "view", branch, "--repo", repo, "--json", "url,state"]).then((r) => r.stdout, () => null);
    open = viewed ? (JSON.parse(viewed) as { url: string; state: string }) : null;
    if (open?.state === "OPEN") {
      await exec("gh", ["pr", "edit", branch, "--repo", repo, "--body-file", file]);
      console.log(`PR updated: ${open.url}\nIt follows the repository's rules: AEOM merges nothing.`);
      return 0;
    }
    const url = (await exec("gh", ["pr", "create", "--repo", repo, "--base", base, "--head", branch, "--title", title, "--body-file", file])).stdout.trim();
    console.log(`PR opened: ${url}\nIt follows the repository's rules: AEOM merges nothing.`);
    return 0;
  } catch (error) {
    console.error(`${branch} is pushed, but the PR could not be ${open?.state === "OPEN" ? "updated" : "opened"}: ${why(error)}`);
    return 1;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

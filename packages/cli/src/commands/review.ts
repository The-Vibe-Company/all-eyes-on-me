import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { appendFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { AppStartError, checkSite, guardJourneys, headerDifference, headerLinks, JourneyError, loadConfig, loadJourneys, pageShape, readStandard, replayJourneys, reviewCode, route, screensTouched, serveFolder, startApp, type Journey, type JourneyReport, type ProjectConfig } from "@aeom/core";
import { APP_OPTIONS, APP_OPTIONS_HELP, parseWidths, servingFolder, signInFromConfig, withApp, withConfig } from "./app.js";

export const REVIEW_HELP = `Usage: aeom review [--base <branch>] [--url <url> | --start "<command>" | --dir <folder>] [options]
       aeom review --install-check [--aeom-ref <ref>] [--force]

Holds the commits of this branch to the standard of the front, in
.aeom/standard.md as the base holds it, with no model. In the front's code
they change: a colour, a font, a size, a space or a radius written in hard
outside the tokens, and a button, a field, a header or a navigation made by
hand while the kit has that very part, each with its file and its line. On
the screens they touch, measured in a browser: the checks of aeom check, and a
header that differs from the rest of the app.

Exits with 1 when something is outside the standard, with 2 when nothing is
in the code but the screens touched could not be measured, and with 0 when
everything was measured and holds.

With --install-check, writes .github/workflows/aeom.yml: on every pull
request, GitHub installs the project and AEOM, starts the app with the
config's start and url, runs aeom review against the PR's base, and shows
the result as a check named aeom, its summary in words. No model is called.

Options:
  --base <branch>      What the branch is compared with (default: the remote's
                       default branch, then main or master)
  --summary <file>     Also write the result in Markdown, words only, to this
                       file, such as $GITHUB_STEP_SUMMARY
  --install-check      Write the GitHub workflow, as above
  --aeom-ref <ref>     With --install-check, the version of AEOM it installs
                       (default main)
  --force              With --install-check, replace a workflow of that name
${APP_OPTIONS_HELP}`;

/** Git as a review reads it: paths as they are, from this folder, with the usual prefixes whatever the user's settings. */
const git = async (args: string[]) => (await promisify(execFile)("git", ["-c", "core.quotepath=false", ...args], { maxBuffer: 1 << 28 })).stdout;
const DIFF = ["--no-color", "--no-ext-diff", "--relative", "--src-prefix=a/", "--dst-prefix=b/", "-M"];
/** The most a review lists: past it, the branch is not a change but a rewrite. */
const MOST = 200;

export async function runReview(argv: string[]): Promise<number> {
  const parsed = parseArgs({ args: argv, options: { ...APP_OPTIONS, base: { type: "string" }, summary: { type: "string" }, "install-check": { type: "boolean" }, "aeom-ref": { type: "string" }, force: { type: "boolean" } } }).values;
  if (parsed.help) {
    console.log(REVIEW_HELP);
    return 0;
  }
  if (parsed["install-check"]) return installCheck(parsed["aeom-ref"], Boolean(parsed.force));
  // A review that stops before it starts says why, in the check's summary too.
  const stop = async (said: string, md: string) => {
    console.error(said);
    if (parsed.summary) await appendFile(parsed.summary, `## aeom review\n\n${md}\n`);
    return 1;
  };
  // The branch against what it will be merged into, from where they parted: the first of these that git knows.
  const candidates = parsed.base ? [parsed.base] : [(await git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).catch(() => "")).trim(), "origin/main", "origin/master", "main", "master"].filter(Boolean);
  let base = "";
  let from = "";
  let why = "";
  for (const candidate of candidates) {
    try {
      from = (await git(["merge-base", "HEAD", candidate])).trim();
      base = candidate;
      break;
    } catch (error) {
      why = (error as { stderr?: string }).stderr?.trim().split("\n")[0] || (error instanceof Error ? error.message.split("\n")[0]! : String(error));
    }
  }
  if (!from) {
    const shallow = (await git(["rev-parse", "--is-shallow-repository"]).catch(() => "")).trim() === "true";
    const said = `Cannot compare this branch with ${candidates.join(", ") || "its base"}: ${why}${shallow ? " The clone is shallow: fetch its history (fetch-depth: 0 in GitHub Actions)." : " Give the branch to compare with: --base <branch>."}`;
    return stop(said, text(said));
  }
  // The standard as the base holds it: a branch never reviews itself against its own edit of it.
  const standardText = (await git(["show", `${from}:./.aeom/standard.md`]).catch(() => null)) ?? (await readFile(join(".aeom", "standard.md"), "utf8").catch(() => null));
  if (standardText === null) return stop(`No standard in .aeom/standard.md: run /aeom first, which writes it from the front as it is.`, "No standard in `.aeom/standard.md`: run /aeom first, which writes it from the front as it is.");
  const branch = (await git(["branch", "--show-current"]).catch(() => "")).trim() || "HEAD";
  const baseName = base;
  const ahead = Number((await git(["rev-list", "--count", `${from}..HEAD`])).trim());
  const changed = (await git(["diff", "--name-only", "--diff-filter=d", ...DIFF, from, "HEAD"])).split("\n").filter(Boolean);
  const diff = await git(["diff", "-U0", ...DIFF, from, "HEAD"]);
  const uncommitted = (await git(["status", "--porcelain"]).catch(() => "")).split("\n").filter(Boolean).length;

  const rows: [string, string][] = reviewCode({ standard: readStandard(standardText), diff, read: (file) => {
    try {
      return readFileSync(file, "utf8");
    } catch {
      return null;
    }
  } }).map((d) => [`${d.file}:${d.line}`, d.what]);
  const notes: string[] = [];

  // The screens they touch, among the routes the project names or AEOM last captured.
  let config;
  try {
    config = await loadConfig();
  } catch {
    config = {};
  }
  const captured = await readFile(join(".aeom", "captures", "manifest.json"), "utf8").then((t) => (JSON.parse(t) as { pages?: { path: string }[] }).pages?.map((p) => p.path) ?? [], () => [] as string[]);
  const known = parsed.dir !== undefined ? [] : config.pages ?? captured;
  const touched = screensTouched(changed, known, parsed.dir !== undefined ? { folder: parsed.dir } : {});
  const routes = touched.all && !touched.routes.length ? ["/"] : touched.routes;
  for (const shape of touched.unmeasured) notes.push(`${shape} was not measured: no route of its shape is known. Add one to "pages" in .aeom/config.json.`);

  let measured = false;
  let journeys: Journey[] = [];
  let onBranch: JourneyReport | null = null;
  let startFailure = "";
  if (routes.length) {
    const values = await withConfig(parsed);
    if (!values.url) notes.push(`No app to start: .aeom/config.json has no url, so the screens were not measured, only the code read.`);
    else {
      const widths = parseWidths(values.widths);
      if (typeof widths === "string") notes.push(widths);
      else {
        const url = values.url;
        const signedOut = values.public?.split(",");
        const except = !servingFolder() && config.except ? config.except : {};
        let failure = "";
        const started = await withApp({ ...values, url }, async () => {
          try {
            const session = await signInFromConfig(url);
            if (session === "failed") {
              notes.push(`The sign-in failed, as said above: the screens were not measured.`);
              return 0;
            }
            const signedIn = session ? session.signedIn : undefined;
            const report = await checkSite({ url, widths, paths: routes, ...(signedIn ? { signedIn } : {}), ...(signedOut ? { signedOut } : {}), except });
            const said = new Set<string>();
            for (const f of report.findings) {
              const line = `${f.check}: ${f.element ? `${f.element}: ` : ""}${f.message}`;
              if (said.has(`${route(f.url)} ${line}`)) continue;
              said.add(`${route(f.url)} ${line}`);
              rows.push([route(f.url), line]);
            }
            for (const e of report.errors) rows.push([route(e.url), `does not load: ${e.reason}`]);
            // The header of each screen touched, against the one most screens it did not touch share.
            const others = known.filter((r) => !routes.includes(r)).slice(0, 3);
            if (!others.length && !routes.includes("/")) others.push("/");
            if (others.length) {
              const headers = await headerLinks({ url, paths: [...others, ...routes], ...(signedIn ? { signedIn } : {}) });
              const reference = headers.slice(0, others.length).filter((h) => !h.failed);
              const counts = new Map<string, { links: string[] | null; n: number }>();
              for (const h of reference) {
                const key = JSON.stringify(h.links);
                counts.set(key, { links: h.links, n: (counts.get(key)?.n ?? 0) + 1 });
              }
              const common = [...counts.values()].sort((a, b) => b.n - a.n)[0];
              const leftOut = (path: string) => (except.header ?? []).some((r) => r.replace(/[?#].*$/, "").replace(/(.)\/+$/, "$1") === path);
              for (const h of headers.slice(others.length)) {
                if (h.failed) {
                  rows.push([h.path, `does not load: ${h.failed}`]);
                  continue;
                }
                const differs = common ? headerDifference(h.links, common.links) : null;
                if (differs && !leftOut(h.path)) rows.push([h.path, `its header differs from the rest of the app: ${differs}`]);
              }
            }
            // The key journeys, replayed on the branch: which of them cross the screens it touches.
            journeys = await loadJourneys(join(".aeom", "journeys")).catch((error: unknown) => {
              if (error instanceof JourneyError) return [];
              throw error;
            });
            if (journeys.length) {
              const reset = !servingFolder() ? config.reset : undefined;
              onBranch = await replayJourneys({ url, journeys, outDir: join(".aeom", "review", "branch"), widths, ...(reset ? { reset } : {}), ...(session ?? {}), ...(servingFolder() ? { closed: { api: null } } : {}) });
            }
            measured = true;
          } catch (error) {
            notes.push(`The screens could not be measured: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
          }
          return 0;
        }, (message, output) => (failure = `${message}${output ? `\n\n\`\`\`\n${output.slice(-2000)}\n\`\`\`` : ""}`));
        if (started !== 0) {
          notes.push(`The app did not start, as said above: the screens were not measured.`);
          if (failure) startFailure = failure;
        }
      }
    }
  }

  // The journeys that cross the screens touched, replayed on the base too: one the branch breaks fails the review,
  // a new call is a feature, said and never refused, since a PR may bring one.
  const passed: string[] = [];
  const features: [string, string][] = [];
  if (measured && !journeys.length) notes.push(`No key journeys recorded in .aeom/journeys: none replayed.`);
  // Set inside the app's run: TypeScript cannot see it there.
  const replayed = onBranch as JourneyReport | null;
  if (replayed) {
    const crossing = replayed.journeys.filter((j) => touched.all || j.runs.some((r) => r.screens.some((s) => routes.some((t) => pageShape(t) === pageShape(s)))));
    if (!crossing.length) notes.push(`No key journey crosses the screens touched.`);
    else {
      const widths = replayed.widths;
      const base = await replayOnBase({ from, journeys: journeys.filter((j) => crossing.some((c) => c.slug === j.slug)), dir: parsed.dir, config, widths });
      if (base.note) notes.push(base.note);
      const branchCrossing: JourneyReport = { ...replayed, journeys: crossing };
      for (const a of crossing) {
        const b = base.report?.journeys.find((x) => x.slug === a.slug);
        const broke = a.runs.find((r) => r.broken);
        if (!broke) {
          passed.push(a.name);
          continue;
        }
        const baseOk = b ? b.runs.every((r) => !r.broken) : null;
        if (baseOk === false) {
          notes.push(`${a.name} already broke on ${baseName}: not this branch's doing.`);
          continue;
        }
        const capture = (broke.steps.find((s) => s.index === broke.broken!.step) ?? broke.steps.at(-1))?.capture;
        rows.push([a.name, `${baseOk ? `went to its end on ${baseName} and breaks` : "breaks"} at step ${broke.broken!.step} at ${broke.width} px: ${broke.broken!.reason}${capture ? ` (${join(".aeom", "review", "branch", capture)})` : ""}`]);
      }
      if (base.report) {
        const { refused } = guardJourneys({ before: base.report, after: branchCrossing });
        for (const v of refused.filter((v) => v.kind !== "file")) features.push([v.journey ?? v.journeys?.[0] ?? "", `${v.what}: ${v.kind === "call" ? "a call the base did not make" : v.why}: a feature, said, not refused`]);
      }
    }
  }

  const lines = [`${branch} against ${base}, held to .aeom/standard.md: ${ahead} commit${ahead === 1 ? "" : "s"} ahead.`, ""];
  const shown = rows.slice(0, MOST);
  const column = Math.max(0, ...shown.map(([where]) => where.length), ...passed.map((n) => n.length), ...features.map(([w]) => w.length)) + 2;
  for (const [where, what] of shown) lines.push(`✗ ${where.padEnd(column)}${what}`);
  if (rows.length > MOST) lines.push(`… and ${rows.length - MOST} more: the branch rewrites more than it changes.`);
  for (const name of passed) lines.push(`✓ ${name.padEnd(column)}still reaches its end`);
  for (const [where, what] of features) lines.push(`⚠ ${where.padEnd(column)}${what}`);
  if (rows.length || passed.length || features.length) lines.push("");
  if (uncommitted) notes.push(`${uncommitted} uncommitted file${uncommitted === 1 ? "" : "s"} not reviewed: commit ${uncommitted === 1 ? "it" : "them"} first.`);
  if (notes.length) lines.push(...notes, "");
  let code = 0;
  if (rows.length) {
    lines.push(`${rows.length} thing${rows.length === 1 ? "" : "s"} outside the standard.`);
    code = 1;
  } else if (routes.length && !measured) {
    lines.push(`Nothing outside the standard in the code; the screens it touches were not measured.`);
    code = 2;
  } else lines.push(routes.length ? `Nothing outside the standard.` : `No screen touched, and nothing outside the standard.`);
  console.log(lines.join("\n"));
  // The check's summary, words only: what is outside the standard, and why nothing could be measured when it could not.
  if (parsed.summary) {
    const md = [`## aeom review`, "", `${asCode(branch)} against ${asCode(base)}, held to ${asCode(".aeom/standard.md")}: ${ahead} commit${ahead === 1 ? "" : "s"} ahead.`, ""];
    for (const [where, what] of shown) md.push(`- ${asCode(where)} ${text(what)}`);
    for (const name of passed) md.push(`- ✓ ${text(name)} still reaches its end`);
    for (const [where, what] of features) md.push(`- ⚠ ${text(where)}: ${text(what)}`);
    if (rows.length > MOST) md.push(`- … and ${rows.length - MOST} more.`);
    if (shown.length) md.push("");
    for (const note of notes) md.push(note.startsWith("The app did not start") && startFailure ? `The app did not start: ${startFailure}` : text(note), "");
    md.push(`**${text(lines.at(-1)!)}**`, "");
    await appendFile(parsed.summary, md.join("\n"));
  }
  return code;
}

/**
 * The journeys replayed on the base, from a worktree of it: its folder of pages served, or its app started with the
 * config's start, sequentially, once the branch's app has stopped. Without a way to start it, the branch is judged alone.
 */
async function replayOnBase({ from, journeys, dir, config, widths }: { from: string; journeys: Journey[]; dir?: string; config: ProjectConfig; widths: number[] }): Promise<{ report: JourneyReport | null; note?: string }> {
  if (dir === undefined && (!config.start || !config.url)) return { report: null, note: `The base's app cannot be started (no start in .aeom/config.json): the journeys were replayed on the branch alone.` };
  const root = (await git(["rev-parse", "--show-toplevel"])).trim();
  const prefix = (await git(["rev-parse", "--show-prefix"])).trim();
  const place = await mkdtemp(join(tmpdir(), "aeom-review-base-"));
  const tree = join(place, "base");
  try {
    await git(["worktree", "add", "-q", "--detach", tree, from]);
    const here = join(tree, prefix);
    // The base runs on the branch's installed dependencies, as AEOM's workers do.
    for (const at of new Set([root, join(root, prefix)])) {
      const modules = join(at, "node_modules");
      const into = join(tree, relative(root, at), "node_modules");
      if (existsSync(modules) && !existsSync(into)) await symlink(modules, into, "dir").catch(() => undefined);
    }
    let url: string;
    let stop: () => Promise<void>;
    if (dir !== undefined) {
      const served = await serveFolder(join(here, dir));
      url = served.url;
      stop = served.stop;
    } else {
      try {
        const app = await startApp(config.start!, config.url!, { cwd: here });
        url = config.url!;
        stop = () => app.stop();
      } catch (error) {
        if (!(error instanceof AppStartError)) throw error;
        return { report: null, note: `The base's app did not start (${error.message.split("\n")[0]}): the journeys were replayed on the branch alone.` };
      }
    }
    try {
      const report = await replayJourneys({ url, journeys, outDir: join(".aeom", "review", "base"), widths, ...(dir === undefined && config.reset ? { reset: config.reset } : {}), ...(dir !== undefined ? { closed: { api: null } } : {}) });
      return { report };
    } finally {
      await stop();
    }
  } catch (error) {
    return { report: null, note: `The journeys could not be replayed on the base (${error instanceof Error ? error.message.split("\n")[0] : String(error)}): the branch is judged alone.` };
  } finally {
    await git(["worktree", "remove", "--force", tree]).catch(() => undefined);
    await rm(place, { recursive: true, force: true });
  }
}

/** Words in Markdown: no HTML, no line that breaks the list. */
const text = (said: string) => said.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\s*\n\s*/g, " ");
/** A path or a name as code, whatever backticks it holds. */
const asCode = (said: string) => (said.includes("`") ? `\`\` ${said.replace(/\n/g, " ")} \`\`` : `\`${said.replace(/\n/g, " ")}\``);

/** The project's package manager, from its lockfile: how GitHub installs it. */
async function installOf(dir: string): Promise<string[]> {
  const has = (file: string) => readFile(join(dir, file)).then(() => true, () => false);
  if (await has("pnpm-lock.yaml")) {
    // pnpm's action reads the version from package.json when the project pins one there, and refuses a second one.
    const pinned = await readFile(join(dir, "package.json"), "utf8").then((t) => /"packageManager"\s*:\s*"pnpm@/.test(t), () => false);
    return ["      - uses: pnpm/action-setup@v4", ...(pinned ? [] : ["        with:", "          version: 10"]), "      - name: Install the project", "        run: pnpm install --frozen-lockfile"];
  }
  if (await has("yarn.lock")) return ["      - name: Install the project", "        run: corepack enable && yarn install --frozen-lockfile"];
  if ((await has("bun.lockb")) || (await has("bun.lock"))) return ["      - uses: oven-sh/setup-bun@v2", "      - name: Install the project", "        run: bun install --frozen-lockfile"];
  if (await has("package-lock.json")) return ["      - name: Install the project", "        run: npm ci"];
  return [];
}

/** The commit of the AEOM this command runs from, when it is a git checkout: the check installs that very one. */
async function ownCommit(): Promise<string | null> {
  const here = dirname(fileURLToPath(import.meta.url));
  return promisify(execFile)("git", ["-C", here, "rev-parse", "HEAD"]).then((r) => r.stdout.trim() || null, () => null);
}

/** Writes the GitHub workflow that runs aeom review on every pull request, as a check named aeom. */
async function installCheck(given: string | undefined, force: boolean): Promise<number> {
  // AEOM pinned: a moving branch would change every project's CI the day it moves.
  const ref = given ?? (await ownCommit()) ?? "main";
  // At the repository's root, where GitHub reads workflows; the project installed where its lockfile is, the app reviewed where it lives.
  const root = (await git(["rev-parse", "--show-toplevel"]).catch(() => "")).trim() || process.cwd();
  const app = relative(root, process.cwd());
  let lockDir = process.cwd();
  while (lockDir.startsWith(root) && !(await installOf(lockDir)).length && lockDir !== root) lockDir = dirname(lockDir);
  const lockAt = relative(root, lockDir);
  const install = (await installOf(lockDir)).flatMap((line) => (lockAt && line.startsWith("        run:") ? [`        working-directory: ${lockAt}`, line] : [line]));
  const file = join(root, ".github", "workflows", "aeom.yml");
  const workflow = [
    "# Written by aeom review --install-check: every pull request held to .aeom/standard.md, with no model.",
    "name: aeom",
    "on:",
    "  pull_request:",
    "permissions:",
    "  contents: read",
    "jobs:",
    "  aeom:",
    "    name: aeom",
    "    runs-on: ubuntu-latest",
    "    timeout-minutes: 30",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "        with:",
    "          fetch-depth: 0",
    "      - uses: actions/setup-node@v4",
    "        with:",
    ...((await readFile(join(root, ".nvmrc")).then(() => true, () => false)) ? ["          node-version-file: .nvmrc"] : ["          node-version: 22"]),
    ...install,
    "      - name: Install AEOM",
    "        run: |",
    `          git init -q "$RUNNER_TEMP/aeom"`,
    `          git -C "$RUNNER_TEMP/aeom" fetch -q --depth 1 https://github.com/The-Vibe-Company/all-eyes-on-me ${ref}`,
    `          git -C "$RUNNER_TEMP/aeom" checkout -q FETCH_HEAD`,
    `          cd "$RUNNER_TEMP/aeom" && corepack pnpm install --frozen-lockfile && corepack pnpm build`,
    `          cd "$RUNNER_TEMP/aeom/packages/core" && npx playwright install --with-deps chromium`,
    "      - name: Hold the pull request to the standard",
    ...(app ? [`        working-directory: ${app}`] : []),
    `        run: node "$RUNNER_TEMP/aeom/packages/cli/dist/index.js" review --base "origin/\${{ github.base_ref }}" --summary "$GITHUB_STEP_SUMMARY"`,
    "",
  ].join("\n");
  const current = await readFile(file, "utf8").catch(() => null);
  if (current === workflow) {
    console.log(`${join(".github", "workflows", "aeom.yml")} already holds this check: nothing to write.`);
    return 0;
  }
  if (current !== null && !force) {
    console.error(`${join(".github", "workflows", "aeom.yml")} is someone else's: run again with --force to replace it, or keep it as it is.`);
    return 1;
  }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, workflow);
  console.log(`Wrote ${relative(process.cwd(), file) === join("..", "..", ".github", "workflows", "aeom.yml") || app ? join(".github", "workflows", "aeom.yml") : relative(process.cwd(), file)}: every pull request is held to .aeom/standard.md, as a check named aeom. Commit it, then make the check required in the repository's branch rules so a PR outside the standard cannot be merged.`);
  return 0;
}

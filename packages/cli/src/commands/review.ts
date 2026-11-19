import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { appendFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { AppStartError, checkSite, guardJourneys, headerDifference, headerLinks, JourneyError, loadConfig, loadJourneys, pageShape, readStandard, replayJourneys, reviewCode, route, routeTouched, screensTouched, serveFolder, sheetLang, startApp, STYLE_CHECKS, WIDTH_RANGE, type Journey, type JourneyReport, type ProjectConfig } from "@aeom/core";
import { reviewWords, type Lang, type ReviewWords } from "./review-words.js";
import { APP_OPTIONS, APP_OPTIONS_HELP, parseWidths, servingFolder, sheetExceptions, signInFromConfig, withApp, withConfig } from "./app.js";

export const REVIEW_HELP = `Usage: aeom review [--base <branch>] [--url <url> | --start "<command>" | --dir <folder>] [options]
       aeom review --install-check [--aeom-ref <ref>] [--force]

Holds the commits of this branch to the standard of the front, in
.aeom/standard.md as the base holds it, with no model. In the front's code
they change: a colour, a font, a size, a space or a radius written in hard
outside the tokens, in CSS, in a style or in a Tailwind class (a colour of
its default palette, a value in brackets), and a button, a field, a header or
a navigation made by hand while the kit has that very part, each with its
file and its line. On
the screens they touch, measured in a browser: the checks of aeom check, and a
header that differs from the rest of the app. A file every screen reads
touches them all: those of "pages" in .aeom/config.json, else those AEOM last
captured, else every page the links lead to from the home page, as aeom check
finds them.

The key journeys in .aeom/journeys that cross the screens touched are replayed
on the branch, then on the base, from a git worktree of it: one the branch
breaks where the base went to its end fails the review, with its step and
its capture in .aeom/review/; a call the base did not make is said as a
feature, and never fails it.

It ends with what it measured: the screens touched, at which widths, how they
were found, those it could not measure, and the journeys replayed. Exits with
1 when something is outside the standard, with 2 when nothing is in the code
but the screens touched could not be measured, and with 0 when everything was
measured and holds.

With --install-check, writes .github/workflows/aeom.yml: on every pull
request, GitHub installs the project and AEOM, starts the app with the
config's start and url, runs aeom review against the PR's base, and shows
the result as a check named aeom, its summary in words, and each deviation of
the code as an annotation at its line in the pull request (ten at most). No
model is called. With AEOM pinned to a commit, the check also runs on each
push to the default branch, only to keep AEOM, built, and its browser in
GitHub's cache, which every pull request reads.

Options:
  --base <branch>      What the branch is compared with (default: the remote's
                       default branch, then main or master)
  --summary <file>     Also write the result in Markdown, words only, to this
                       file, such as $GITHUB_STEP_SUMMARY
  --lang <fr|en>       The language of the result (default: the language of
                       .aeom/product.md, else English); the checks' own words
                       stay as aeom check writes them
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
/** How many pages aeom check reaches by following the links, as discoverPages stops: past it, the review says so. */
const FOLLOWED = 50;

/** The screens a review measured. */
interface Covered {
  /** Those it measured, by their routes. */
  screens: string[];
  /** Those it could not, each with why when no other line of the review says it. */
  missed: string[];
  widths: number[];
  /** The route the links were followed from, when the screens were found that way. */
  from?: string;
  /** The links were followed as far as aeom check goes: there may be more screens. */
  capped: boolean;
}

/** A route as a review compares it: no query, no last slash. */
const bare = (r: string) => r.replace(/[?#].*$/, "").replace(/(.)\/+$/, "$1") || "/";

/** What a review measured, in words: the screens touched, how they were found, those it could not measure, and the journeys replayed. */
function coverage(w: ReviewWords, covered: Covered | null, unmeasured: string[], replayed: { journeys: number; base: string | null } | null): string[] {
  if (!covered && !unmeasured.length) return [];
  const missed = [...new Set([...(covered?.missed ?? []), ...unmeasured])];
  const lines = [w.covered(covered?.screens.length ?? 0, missed, covered?.widths ?? [], covered?.from, covered?.capped ?? false, FOLLOWED)];
  if (replayed?.journeys) lines.push(w.replayed(replayed.journeys, replayed.base));
  return lines;
}

export async function runReview(argv: string[]): Promise<number> {
  const parsed = parseArgs({ args: argv, options: { ...APP_OPTIONS, base: { type: "string" }, summary: { type: "string" }, "install-check": { type: "boolean" }, "aeom-ref": { type: "string" }, force: { type: "boolean" }, lang: { type: "string" } } }).values;
  if (parsed.help) {
    console.log(REVIEW_HELP);
    return 0;
  }
  if (parsed.lang !== undefined && parsed.lang !== "fr" && parsed.lang !== "en") {
    console.error(`--lang is fr or en, not ${parsed.lang}.`);
    return 1;
  }
  if (parsed["install-check"]) return installCheck(parsed["aeom-ref"], Boolean(parsed.force));
  // The person's language: the one asked, else the product sheet's, else English.
  const lang: Lang = (parsed.lang as Lang | undefined) ?? sheetLang(await readFile(join(".aeom", "product.md"), "utf8").catch(() => null)) ?? "en";
  const w = reviewWords(lang);
  // A review that stops before it starts says why, in the check's summary too.
  const stop = async (said: string, md: string) => {
    console.error(said);
    if (parsed.summary) await appendFile(parsed.summary, `## aeom review\n\n${md}\n`);
    return 1;
  };
  // The branch against what it will be merged into, from where they parted: the first of these that git knows.
  // On a pull request, GitHub checks out the PR merged into its base: the PR's own commit numbers the lines as
  // "Files changed" shows them, so the code is read there.
  const head = await pullRequestHead();
  const candidates = parsed.base ? [parsed.base] : [(await git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).catch(() => "")).trim(), "origin/main", "origin/master", "main", "master"].filter(Boolean);
  let base = "";
  let from = "";
  let why = "";
  for (const candidate of candidates) {
    try {
      from = (await git(["merge-base", head, candidate])).trim();
      base = candidate;
      break;
    } catch (error) {
      why = (error as { stderr?: string }).stderr?.trim().split("\n")[0] || (error instanceof Error ? error.message.split("\n")[0]! : String(error));
    }
  }
  if (!from) {
    const shallow = (await git(["rev-parse", "--is-shallow-repository"]).catch(() => "")).trim() === "true";
    const said = w.cannotCompare(candidates.join(", "), why, shallow);
    return stop(said, text(said));
  }
  // The standard as the base holds it: a branch never reviews itself against its own edit of it.
  const standardText = (await git(["show", `${from}:./.aeom/standard.md`]).catch(() => null)) ?? (await readFile(join(".aeom", "standard.md"), "utf8").catch(() => null));
  if (standardText === null) return stop(w.noStandard(".aeom/standard.md"), w.noStandard("`.aeom/standard.md`"));
  const branch = (await git(["branch", "--show-current"]).catch(() => "")).trim() || "HEAD";
  const baseName = base;
  const ahead = Number((await git(["rev-list", "--count", `${from}..${head}`])).trim());
  const changed = (await git(["diff", "--name-only", "--diff-filter=d", ...DIFF, from, head])).split("\n").filter(Boolean);
  const diff = await git(["diff", "-U0", ...DIFF, from, head]);
  // The review's own captures are not the branch's work.
  const status = (await git(["status", "--porcelain"]).catch(() => "")).split("\n").filter(Boolean);
  const uncommitted = status.filter((l) => !/\.aeom\/review(\/|$)/.test(l)).length;
  const reviewShots = status.some((l) => /\.aeom\/review(\/|$)/.test(l));

  const inCode = reviewCode({ standard: readStandard(standardText), diff, lang, read: (file) => {
    try {
      return readFileSync(file, "utf8");
    } catch {
      return null;
    }
  } });
  const rows: [string, string][] = inCode.map((d) => [`${d.file}:${d.line}`, d.what]);
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
  // With the style kept, what impeccable bans on a screen is the charter's: said, never refused.
  const keepStyle = config.style === "keep";
  const charter: [string, string][] = [];
  const touched = screensTouched(changed, known, parsed.dir !== undefined ? { folder: parsed.dir } : {});
  // A file every screen reads, and no list of the screens, as in CI where no capture is committed: they are found as
  // aeom check finds them, by following the links from the home page.
  const follow = touched.all && !known.length;
  const routes = follow ? ["/"] : touched.routes;
  for (const shape of touched.unmeasured) notes.push(w.unmeasuredShape(shape));

  let measured = false;
  let journeys: Journey[] = [];
  let onBranch: JourneyReport | null = null;
  let startFailure = "";
  // What the review measured, said at its end: a green says what it looked at.
  let covered: Covered | null = null;
  let replayedOn: { journeys: number; base: string | null } | null = null;
  if (routes.length) {
    const values = await withConfig(parsed);
    if (!values.url) notes.push(w.noUrl);
    else {
      const widths = parseWidths(values.widths);
      if (typeof widths === "string") notes.push(w.badWidths(WIDTH_RANGE.min, WIDTH_RANGE.max));
      else {
        const url = values.url;
        const signedOut = values.public?.split(",");
        const except = !servingFolder() && config.except ? config.except : {};
        let failure = "";
        const started = await withApp({ ...values, url }, async () => {
          try {
            const session = await signInFromConfig(url);
            if (session === "failed") {
              notes.push(w.signInFailed);
              return 0;
            }
            const signedIn = session ? session.signedIn : undefined;
            // What the product sheet accepts is the project's choice: said, never held against the branch.
            const accepted = (await sheetExceptions(undefined, servingFolder() ? undefined : join(".aeom", "product.md"))) ?? [];
            const report = await checkSite({ url, widths, ...(follow ? {} : { paths: routes }), ...(signedIn ? { signedIn } : {}), ...(signedOut ? { signedOut } : {}), except, folder: servingFolder(), accepted });
            // The routes "public" names are measured on every review: one counts among the screens touched only when it is one.
            const isPublic = (r: string) => (signedOut ?? []).some((p) => bare(p) === bare(r));
            const counted = (r: string) => follow || !isPublic(r) || routes.some((t) => bare(t) === bare(r));
            // Following the links, one that leads off the site or answers 4xx is no screen of the branch's: said, never held
            // against it, since the base most likely has it too. A screen that does not answer, or answers 5xx, still fails.
            const elsewhere = (e: { status?: number; reason: string }) => follow && ((e.status !== undefined && e.status < 500) || e.reason.startsWith("redirects off "));
            const found = [...report.pages, ...report.errors.map((e) => e.url)].map((u) => route(u));
            covered = {
              screens: report.pages.map((p) => route(p)).filter(counted),
              missed: report.errors.filter((e) => counted(route(e.url))).map((e) => (elsewhere(e) ? `${route(e.url)} (${e.reason})` : route(e.url))),
              widths,
              ...(follow ? { from: route(url) } : {}),
              capped: follow && found.filter((r) => !isPublic(r)).length >= FOLLOWED,
            };
            const said = new Set<string>();
            for (const f of report.findings) {
              const line = `${f.check}: ${f.element ? `${f.element}: ` : ""}${f.message}`;
              if (said.has(`${route(f.url)} ${line}`)) continue;
              said.add(`${route(f.url)} ${line}`);
              if (keepStyle && STYLE_CHECKS.includes(f.check)) charter.push([route(f.url), w.charter(line)]);
              else rows.push([route(f.url), line]);
            }
            for (const e of report.errors) if (!elsewhere(e)) rows.push([route(e.url), w.doesNotLoad(e.reason)]);
            // The header of each screen touched, against the one most screens it did not touch share; with every screen
            // touched and found by the links, none is left to compare with.
            const others = known.filter((r) => !routes.includes(r)).slice(0, 3);
            if (!others.length && !routes.includes("/")) others.push("/");
            if (others.length && !follow) {
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
                  rows.push([h.path, w.doesNotLoad(h.failed)]);
                  continue;
                }
                const differs = common ? headerDifference(h.links, common.links, lang) : null;
                if (differs && !leftOut(h.path)) rows.push([h.path, w.headerDiffers(differs)]);
              }
            }
            // The key journeys, replayed on the branch: which of them cross the screens it touches.
            // No folder, or an empty one, is no journey; a file that cannot be replayed is a problem of the repository.
            if (existsSync(join(".aeom", "journeys"))) {
              journeys = await loadJourneys(join(".aeom", "journeys")).catch((error: unknown) => {
                if (!(error instanceof JourneyError)) throw error;
                for (const problem of error.problems) rows.push([".aeom/journeys", w.cannotReplay(problem)]);
                return [];
              });
            }
            if (journeys.length) {
              const reset = !servingFolder() ? config.reset : undefined;
              onBranch = await replayJourneys({ url, journeys, outDir: join(".aeom", "review", "branch"), widths, ...(reset ? { reset } : {}), ...(session ?? {}), ...(servingFolder() ? { closed: { api: null } } : {}) });
            }
            measured = true;
          } catch (error) {
            notes.push(w.couldNotMeasure(error instanceof Error ? error.message.split("\n")[0]! : String(error)));
          }
          return 0;
        }, (message, output) => (failure = `${message}${output ? `\n\n\`\`\`\n${output.slice(-2000)}\n\`\`\`` : ""}`));
        if (started !== 0) {
          notes.push(w.appDidNotStart);
          if (failure) startFailure = failure;
        }
      }
    }
  }

  // The journeys that cross the screens touched, replayed on the base too: one the branch breaks fails the review,
  // a new call is a feature, said and never refused, since a PR may bring one.
  const passed: string[] = [];
  const features: [string, string][] = [];
  if (measured && !journeys.length) notes.push(w.noJourneys);
  // Set inside the app's run: TypeScript cannot see it there.
  const replayed = onBranch as JourneyReport | null;
  if (replayed) {
    // A journey crosses the screens touched when it visits one, or would: its own steps name the routes it opens and lands on,
    // so one the branch breaks before the touched screen is still seen.
    const named = (slug: string) => (journeys.find((j) => j.slug === slug)?.steps ?? []).flatMap((s) => ("path" in s && s.path ? [s.path] : "lands" in s && s.lands ? [s.lands] : []));
    const crossing = replayed.journeys.filter((j) => [...j.runs.flatMap((r) => r.screens), ...named(j.slug)].some((path) => routeTouched(path, touched)));
    if (!crossing.length) notes.push(w.noneCrosses);
    else {
      const widths = replayed.widths;
      const base = await replayOnBase({ from, journeys: journeys.filter((j) => crossing.some((c) => c.slug === j.slug)), dir: parsed.dir, config, widths, start: parsed.start ?? (parsed.url === undefined ? config.start : undefined), url: parsed.url ?? config.url, timeout: parsed.timeout, w });
      if (base.note) notes.push(base.note);
      replayedOn = { journeys: crossing.length, base: base.report ? baseName : null };
      const branchCrossing: JourneyReport = { ...replayed, journeys: crossing };
      for (const a of crossing) {
        const b = base.report?.journeys.find((x) => x.slug === a.slug);
        const broke = a.runs.find((r) => r.broken);
        if (!broke) {
          passed.push(a.name);
          continue;
        }
        // Excused only when the base breaks the same way: the same width, the same step, the same reason.
        const there = b?.runs.find((r) => r.width === broke.width);
        if (there?.broken && there.broken.step === broke.broken!.step && there.broken.reason === broke.broken!.reason) {
          notes.push(w.alreadyBroke(a.name, baseName));
          continue;
        }
        const capture = (broke.steps.find((s) => s.index === broke.broken!.step) ?? broke.steps.at(-1))?.capture;
        const before = !b ? w.brokeBaseUnreplayed : there && !there.broken ? w.wentToEnd(baseName) : w.brokeOtherwise(baseName, there?.broken?.step, there?.broken?.reason);
        rows.push([a.name, `${before}${w.atStep(broke.broken!.step, broke.width, broke.broken!.reason)}${capture ? ` (${join(".aeom", "review", "branch", capture)})` : ""}`]);
      }
      if (base.report) {
        // A base journey that broke early made fewer calls: its warnings would be noise.
        const whole = (r: JourneyReport) => ({ ...r, journeys: r.journeys.filter((j) => (base.report!.journeys.find((x) => x.slug === j.slug)?.runs ?? []).every((x) => !x.broken)) });
        const { refused } = guardJourneys({ before: whole(base.report), after: whole(branchCrossing) });
        for (const v of refused.filter((v) => v.kind !== "file")) features.push([v.journey ?? v.journeys?.[0] ?? "", w.feature(v.what, v.kind === "call" ? null : v.why)]);
      }
    }
  }

  const lines = [w.head(branch, base, ".aeom/standard.md", ahead), ""];
  const shown = rows.slice(0, MOST);
  const column = Math.max(0, ...shown.map(([where]) => where.length), ...passed.map((n) => n.length), ...features.map(([w]) => w.length), ...charter.map(([w]) => w.length)) + 2;
  for (const [where, what] of shown) lines.push(`✗ ${where.padEnd(column)}${what}`);
  // Every screen touched, the rows may be many for one line changed: no rewrite there.
  if (rows.length > MOST) lines.push(w.more(rows.length - MOST, touched.all));
  for (const name of passed) lines.push(`✓ ${name.padEnd(column)}${w.stillReaches}`);
  for (const [where, what] of [...features, ...charter]) lines.push(`⚠ ${where.padEnd(column)}${what}`);
  if (rows.length || passed.length || features.length || charter.length) lines.push("");
  if (reviewShots) notes.push(w.shotsNotIgnored);
  if (uncommitted) notes.push(w.uncommitted(uncommitted));
  if (notes.length) lines.push(...notes, "");
  // Just before the verdict, what it rests on: also when the only screen touched has a route no known one fits. Set
  // inside the app's run: TypeScript cannot see it there.
  const done = measured ? (covered as Covered | null) : null;
  const said = measured || !routes.length ? coverage(w, done, touched.unmeasured, replayedOn) : [];
  if (said.length) lines.push(...said, "");
  // Screens touched and none measured is no green, whatever kept them from being measured.
  const anyScreen = routes.length > 0 || touched.unmeasured.length > 0;
  let code = 0;
  if (rows.length) {
    lines.push(w.outside(rows.length));
    code = 1;
  } else if (anyScreen && !done?.screens.length) {
    lines.push(w.notMeasured);
    code = 2;
  } else lines.push(anyScreen ? w.nothing : w.noScreen);
  console.log(lines.join("\n"));
  // The check's summary, words only: what is outside the standard, and why nothing could be measured when it could not.
  if (parsed.summary) {
    const md = [`## aeom review`, "", w.head(asCode(branch), asCode(base), asCode(".aeom/standard.md"), ahead), ""];
    for (const [where, what] of shown) md.push(`- ${asCode(where)} ${text(what)}`);
    for (const name of passed) md.push(`- ✓ ${text(name)} ${w.stillReaches}`);
    for (const [where, what] of [...features, ...charter]) md.push(`- ⚠ ${text(where)}${w.sep}${text(what)}`);
    if (rows.length > MOST) md.push(`- ${w.moreShort(rows.length - MOST)}`);
    if (shown.length || passed.length || features.length || charter.length) md.push("");
    for (const note of notes) md.push(note === w.appDidNotStart && startFailure ? w.appDidNotStartWith(startFailure) : text(note), "");
    for (const line of said) md.push(text(line), "");
    md.push(`**${text(lines.at(-1)!)}**`, "");
    await appendFile(parsed.summary, md.join("\n"));
  }
  // On GitHub, each deviation of the code at its line in the pull request, its path from the repository's root.
  if (process.env.GITHUB_ACTIONS === "true" && inCode.length) {
    const prefix = (await git(["rev-parse", "--show-prefix"]).catch(() => "")).trim();
    const shownHere = inCode.slice(0, ANNOTATIONS);
    shownHere.forEach((d, i) => {
      const more = i === shownHere.length - 1 && inCode.length > ANNOTATIONS ? w.annotationMore(inCode.length - ANNOTATIONS, Boolean(parsed.summary)) : "";
      console.log(`::error file=${property(prefix + d.file)},line=${d.line},title=aeom::${data(d.what + more)}`);
    });
  }
  return code;
}

/**
 * The commit a review reads the code of: on a pull request in GitHub Actions, the PR's own head when HEAD is the
 * merge GitHub made of it; HEAD everywhere else.
 */
async function pullRequestHead(): Promise<string> {
  const event = process.env.GITHUB_ACTIONS === "true" ? process.env.GITHUB_EVENT_PATH : undefined;
  if (!event) return "HEAD";
  const sha = await readFile(event, "utf8").then((t) => (JSON.parse(t) as { pull_request?: { head?: { sha?: string } } }).pull_request?.head?.sha, () => undefined);
  if (!sha) return "HEAD";
  const second = (await git(["rev-parse", "--verify", "-q", "HEAD^2"]).catch(() => "")).trim();
  return second === sha ? sha : "HEAD";
}

/** GitHub shows ten error annotations a step: past them, the last says how many more there are. */
const ANNOTATIONS = 10;
/** A workflow command's message, and its properties, as GitHub reads them. */
const data = (said: string) => said.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const property = (said: string) => data(said).replace(/:/g, "%3A").replace(/,/g, "%2C");

/**
 * The journeys replayed on the base, from a worktree of it: its folder of pages served, or its app started with the
 * config's start, sequentially, once the branch's app has stopped. Without a way to start it, the branch is judged alone.
 */
async function replayOnBase({ from, journeys, dir, config, widths, start, url: appUrl, timeout, w }: { from: string; journeys: Journey[]; dir?: string; config: ProjectConfig; widths: number[]; start?: string; url?: string; timeout?: string; w: ReviewWords }): Promise<{ report: JourneyReport | null; note?: string }> {
  if (dir === undefined && (!start || !appUrl)) return { report: null, note: w.baseCannotStart };
  const root = (await git(["rev-parse", "--show-toplevel"])).trim();
  const prefix = (await git(["rev-parse", "--show-prefix"])).trim();
  const place = await mkdtemp(join(tmpdir(), "aeom-review-base-"));
  const tree = join(place, "base");
  try {
    await git(["worktree", "add", "-q", "--detach", tree, from]);
    const here = join(tree, prefix);
    // The base runs on the branch's installed dependencies, as AEOM's workers do, and on its local environment files,
    // which git does not carry: linked, never read.
    for (const at of new Set([root, join(root, prefix)])) {
      const modules = join(at, "node_modules");
      const into = join(tree, relative(root, at), "node_modules");
      if (existsSync(modules) && !existsSync(into)) await symlink(modules, into, "dir").catch(() => undefined);
      for (const env of [".env", ".env.local", ".env.development", ".env.development.local", ".env.test"]) {
        if (existsSync(join(at, env)) && !existsSync(join(tree, relative(root, at), env))) await symlink(join(at, env), join(tree, relative(root, at), env)).catch(() => undefined);
      }
    }
    const workspace = existsSync(join(root, "pnpm-workspace.yaml")) || /"workspaces"/.test(await readFile(join(root, "package.json"), "utf8").catch(() => ""));
    let url: string;
    let stop: () => Promise<void>;
    if (dir !== undefined) {
      const served = await serveFolder(join(here, dir));
      url = served.url;
      stop = served.stop;
    } else {
      try {
        const app = await startApp(start!, appUrl!, { cwd: here, timeoutMs: Number(timeout ?? 30) * 1000 });
        url = appUrl!;
        stop = () => app.stop();
      } catch (error) {
        if (!(error instanceof AppStartError)) throw error;
        return { report: null, note: w.baseDidNotStart(error.message.split("\n")[0]!) };
      }
    }
    try {
      // Signed in on the base as on the branch: a journey behind a sign-in breaks on neither for want of one.
      const session = dir === undefined ? await signInFromConfig(url) : null;
      if (session === "failed") return { report: null, note: w.baseSignInFailed };
      const report = await replayJourneys({ url, journeys, outDir: join(".aeom", "review", "base"), widths, ...(dir === undefined && config.reset ? { reset: config.reset, resetCwd: here } : {}), ...(session ?? {}), ...(dir !== undefined ? { closed: { api: null } } : {}) });
      return { report, ...(workspace ? { note: w.workspace } : {}) };
    } finally {
      await stop();
    }
  } catch (error) {
    return { report: null, note: w.baseCouldNotReplay(error instanceof Error ? error.message.split("\n")[0]! : String(error)) };
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

/** What the check keeps in GitHub's cache: AEOM built, and the browser Playwright downloads. */
const CACHED = ["          path: |", "            ${{ runner.temp }}/aeom", "            ~/.cache/ms-playwright"];

/** Writes the GitHub workflow that runs aeom review on every pull request, as a check named aeom. */
async function installCheck(given: string | undefined, force: boolean): Promise<number> {
  // AEOM pinned: a moving branch would change every project's CI the day it moves.
  const ref = given ?? (await ownCommit()) ?? "main";
  // A commit never moves: AEOM built at it, and its browser, can come from GitHub's cache. A branch or a tag can move,
  // and a cache would keep an AEOM it no longer names.
  const cached = /^[0-9a-f]{40}$/.test(ref);
  // GitHub lets every pull request read only the caches of the default branch: a push there keeps AEOM in it.
  const main = cached ? (await git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).catch(() => "")).trim().replace(/^origin\//, "") || "main" : "";
  const onPullRequest = "        if: github.event_name == 'pull_request'";
  // At the repository's root, where GitHub reads workflows; the project installed where its lockfile is, the app reviewed where it lives.
  const root = (await git(["rev-parse", "--show-toplevel"]).catch(() => "")).trim() || process.cwd();
  const app = relative(root, process.cwd());
  let lockDir = process.cwd();
  while (lockDir.startsWith(root) && !(await installOf(lockDir)).length && lockDir !== root) lockDir = dirname(lockDir);
  const lockAt = relative(root, lockDir);
  // The project is installed for a review only: a push to the default branch only keeps AEOM in the cache.
  const install = (await installOf(lockDir)).flatMap((line) => [...(lockAt && line.startsWith("        run:") ? [`        working-directory: ${lockAt}`] : []), line, ...(cached && line === "      - name: Install the project" ? [onPullRequest] : [])]);
  const file = join(root, ".github", "workflows", "aeom.yml");
  const workflow = [
    "# Written by aeom review --install-check: every pull request held to .aeom/standard.md, with no model.",
    "name: aeom",
    "on:",
    "  pull_request:",
    ...(cached ? ["  push:", `    branches: [${JSON.stringify(main)}]`] : []),
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
    ...(cached ? ["      - name: Restore AEOM from the cache", "        id: aeom", "        uses: actions/cache/restore@v4", "        with:", ...CACHED, `          key: aeom-\${{ runner.os }}-\${{ runner.arch }}-${ref}`] : []),
    "      - name: Install AEOM",
    ...(cached ? ["        if: steps.aeom.outputs.cache-hit != 'true'"] : []),
    "        run: |",
    `          git init -q "$RUNNER_TEMP/aeom"`,
    `          git -C "$RUNNER_TEMP/aeom" fetch -q --depth 1 https://github.com/The-Vibe-Company/all-eyes-on-me ${ref}`,
    `          git -C "$RUNNER_TEMP/aeom" checkout -q FETCH_HEAD`,
    `          cd "$RUNNER_TEMP/aeom" && corepack pnpm install --frozen-lockfile && corepack pnpm build`,
    `          cd "$RUNNER_TEMP/aeom/packages/core" && npx playwright install --with-deps chromium`,
    // Kept from the default branch, the one cache every pull request reads: one entry for each version of AEOM.
    ...(cached ? ["      - name: Keep AEOM in the cache", "        if: github.event_name == 'push' && steps.aeom.outputs.cache-hit != 'true'", "        uses: actions/cache/save@v4", "        with:", ...CACHED, "          key: ${{ steps.aeom.outputs.cache-primary-key }}"] : []),
    // From the cache, the browser is there; the system's packages it needs are not, they live outside the cache.
    ...(cached ? ["      - name: Install the browser's system packages", "        if: github.event_name == 'pull_request' && steps.aeom.outputs.cache-hit == 'true'", `        run: cd "$RUNNER_TEMP/aeom/packages/core" && npx playwright install-deps chromium`] : []),
    "      - name: Hold the pull request to the standard",
    ...(cached ? [onPullRequest] : []),
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

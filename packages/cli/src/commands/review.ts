import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs, promisify } from "node:util";
import { checkSite, headerDifference, headerLinks, loadConfig, readStandard, reviewCode, route, screensTouched } from "@aeom/core";
import { APP_OPTIONS, APP_OPTIONS_HELP, parseWidths, servingFolder, signInFromConfig, withApp, withConfig } from "./app.js";

export const REVIEW_HELP = `Usage: aeom review [--base <branch>] [--url <url> | --start "<command>" | --dir <folder>] [options]

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

Options:
  --base <branch>      What the branch is compared with (default: the remote's
                       default branch, then main or master)
${APP_OPTIONS_HELP}`;

/** Git as a review reads it: paths as they are, from this folder, with the usual prefixes whatever the user's settings. */
const git = async (args: string[]) => (await promisify(execFile)("git", ["-c", "core.quotepath=false", ...args], { maxBuffer: 1 << 28 })).stdout;
const DIFF = ["--no-color", "--no-ext-diff", "--relative", "--src-prefix=a/", "--dst-prefix=b/", "-M"];
/** The most a review lists: past it, the branch is not a change but a rewrite. */
const MOST = 200;

export async function runReview(argv: string[]): Promise<number> {
  const parsed = parseArgs({ args: argv, options: { ...APP_OPTIONS, base: { type: "string" } } }).values;
  if (parsed.help) {
    console.log(REVIEW_HELP);
    return 0;
  }
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
    console.error(`Cannot compare this branch with ${candidates.join(", ") || "its base"}: ${why}${shallow ? " The clone is shallow: fetch its history (fetch-depth: 0 in GitHub Actions)." : " Give the branch to compare with: --base <branch>."}`);
    return 1;
  }
  // The standard as the base holds it: a branch never reviews itself against its own edit of it.
  const standardText = (await git(["show", `${from}:./.aeom/standard.md`]).catch(() => null)) ?? (await readFile(join(".aeom", "standard.md"), "utf8").catch(() => null));
  if (standardText === null) {
    console.error(`No standard in .aeom/standard.md: run /aeom first, which writes it from the front as it is.`);
    return 1;
  }
  const branch = (await git(["branch", "--show-current"]).catch(() => "")).trim() || "HEAD";
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
            measured = true;
          } catch (error) {
            notes.push(`The screens could not be measured: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
          }
          return 0;
        });
        if (started !== 0) notes.push(`The app did not start, as said above: the screens were not measured.`);
      }
    }
  }

  const lines = [`${branch} against ${base}, held to .aeom/standard.md: ${ahead} commit${ahead === 1 ? "" : "s"} ahead.`, ""];
  const shown = rows.slice(0, MOST);
  const column = Math.max(0, ...shown.map(([where]) => where.length)) + 2;
  for (const [where, what] of shown) lines.push(`✗ ${where.padEnd(column)}${what}`);
  if (rows.length > MOST) lines.push(`… and ${rows.length - MOST} more: the branch rewrites more than it changes.`);
  if (rows.length) lines.push("");
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
  return code;
}

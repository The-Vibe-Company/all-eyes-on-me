import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs, promisify } from "node:util";
import { checkSite, headerDifference, headerLinks, loadConfig, readStandard, reviewCode, route, screensTouched } from "@aeom/core";
import { APP_OPTIONS, APP_OPTIONS_HELP, parseWidths, servingFolder, signInFromConfig, withApp, withConfig } from "./app.js";

export const REVIEW_HELP = `Usage: aeom review [--base <branch>] [--url <url> | --start "<command>" | --dir <folder>] [options]

Holds the changes of this branch to the standard of the front, in
.aeom/standard.md, with no model. In the code it changed: a colour, a font, a
size or a space written in hard outside the tokens, and a button, a field, a
header or a navigation made by hand while the kit has one, each with its file
and its line. On the screens it touches, measured in a browser: the checks of
aeom check, and a header or a navigation that differs from the rest of the
app. Exits with 1 when something is outside the standard.

Options:
  --base <branch>      What the branch is compared with (default: the remote's
                       default branch, or main)
${APP_OPTIONS_HELP}`;

const git = async (args: string[]) => (await promisify(execFile)("git", args, { maxBuffer: 1 << 26 })).stdout;

export async function runReview(argv: string[]): Promise<number> {
  const parsed = parseArgs({ args: argv, options: { ...APP_OPTIONS, base: { type: "string" }, pages: { type: "string" } } }).values;
  if (parsed.help) {
    console.log(REVIEW_HELP);
    return 0;
  }
  const standardText = await readFile(join(".aeom", "standard.md"), "utf8").catch(() => null);
  if (standardText === null) {
    console.error(`No standard in .aeom/standard.md: run /aeom first, which writes it from the front as it is.`);
    return 1;
  }
  // The branch against what it will be merged into: from where they parted.
  let base = parsed.base;
  if (!base) base = (await git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).catch(() => "")).trim() || "main";
  let from: string, branch: string, changed: string[], diff: string;
  try {
    from = (await git(["merge-base", "HEAD", base])).trim();
    branch = (await git(["branch", "--show-current"])).trim() || "HEAD";
    changed = (await git(["diff", "--name-only", "--no-renames", from, "HEAD"])).split("\n").filter(Boolean);
    diff = await git(["diff", "-U0", "--no-renames", from, "HEAD"]);
  } catch (error) {
    console.error(`Cannot compare this branch with ${base}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    return 1;
  }
  const lines: string[] = [];
  const code = reviewCode({ standard: readStandard(standardText), diff });
  const at = (where: string) => where;
  const rows: [string, string][] = code.map((d) => [at(`${d.file}:${d.line}`), d.what]);

  // The screens it touches, by their routes, among those the project names or AEOM last captured.
  let config;
  try {
    config = await loadConfig();
  } catch {
    config = {};
  }
  const captured = await readFile(join(".aeom", "captures", "manifest.json"), "utf8").then((t) => (JSON.parse(t) as { pages?: { path: string }[] }).pages?.map((p) => p.path) ?? [], () => [] as string[]);
  const known = parsed.dir !== undefined ? [] : config.pages ?? captured;
  const touched = screensTouched(changed, known);
  const routes = touched.all && !touched.routes.length ? ["/"] : touched.routes;

  let note = "";
  if (routes.length) {
    const values = await withConfig(parsed);
    if (!values.url) note = `No app to start: .aeom/config.json has no url, so the screens were not measured, only the code read.`;
    else {
      const widths = parseWidths(values.widths);
      if (typeof widths === "string") {
        console.error(widths);
        return 1;
      }
      const url = values.url;
      const measured = await withApp({ ...values, url }, async () => {
        const session = await signInFromConfig(url);
        if (session === "failed") return 1;
        const signedIn = session ? session.signedIn : undefined;
        const report = await checkSite({ url, widths, paths: routes, ...(signedIn ? { signedIn } : {}), ...(!servingFolder() && config.except ? { except: config.except } : {}) });
        const said = new Set<string>();
        for (const f of report.findings) {
          const line = `${f.check}: ${f.element ? `${f.element}: ` : ""}${f.message}`;
          const key = `${route(f.url)} ${line}`;
          if (said.has(key)) continue;
          said.add(key);
          rows.push([route(f.url), line]);
        }
        for (const e of report.errors) rows.push([route(e.url), `does not load: ${e.reason}`]);
        // The header of each screen touched, against one the branch did not touch.
        const reference = known.find((r) => !routes.includes(r)) ?? (routes.includes("/") ? null : "/");
        if (reference) {
          const headers = await headerLinks({ url, paths: [reference, ...routes], ...(signedIn ? { signedIn } : {}) });
          const ref = headers[0]!.links;
          for (const h of headers.slice(1)) {
            const differs = headerDifference(h.links, ref);
            if (differs) rows.push([h.path, `its header differs from the rest of the app: ${differs}`]);
          }
        }
        return 0;
      });
      if (measured !== 0) return measured;
    }
  }

  lines.push(`${branch} against ${base}, held to .aeom/standard.md:`, "");
  const column = Math.max(0, ...rows.map(([where]) => where.length)) + 2;
  for (const [where, what] of rows) lines.push(`✗ ${where.padEnd(column)}${what}`);
  if (rows.length) lines.push("");
  if (note) lines.push(note, "");
  if (!rows.length) lines.push(routes.length ? `Nothing outside the standard.` : `No screen touched, and nothing outside the standard.`);
  else lines.push(`${rows.length} thing${rows.length === 1 ? "" : "s"} outside the standard.`);
  console.log(lines.join("\n"));
  return rows.length ? 1 : 0;
}

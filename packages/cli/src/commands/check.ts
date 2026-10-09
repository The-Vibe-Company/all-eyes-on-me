import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { CHECKS, checkSite, route, type Finding } from "@aeom/core";
import { APP_OPTIONS, APP_OPTIONS_HELP, parseWidths, plural, signInFromConfig, withApp, withConfig } from "./app.js";

export const CHECK_HELP = `Usage: aeom check [--url <url>] [--start "<command>"] [options]

Runs the measurable checks on every page of a web app: ${CHECKS.join(", ")}.
Exits with 1 when any check fails.

Options:
${APP_OPTIONS_HELP}
  --out <dir>          Where to write check.json (default .aeom/reports)
  --pages <list>       Check only these routes, comma-separated, such as /,/produits
                       (default: pages in .aeom/config.json, or every page the
                       links lead to)`;

export async function runCheck(argv: string[]): Promise<number> {
  const parsed = parseArgs({ args: argv, options: { ...APP_OPTIONS, out: { type: "string", default: ".aeom/reports" }, pages: { type: "string" } } }).values;
  if (parsed.help) {
    console.log(CHECK_HELP);
    return 0;
  }
  if (parsed.url !== undefined && !parsed.url.trim()) {
    console.error(`--url cannot be empty.`);
    return 1;
  }
  const values = await withConfig(parsed);
  if (!values.url) {
    console.error(`--url is required, here or in .aeom/config.json.\n\n${CHECK_HELP}`);
    return 1;
  }
  const widths = parseWidths(values.widths);
  if (typeof widths === "string") {
    console.error(widths);
    return 1;
  }
  const url = values.url;

  return withApp({ ...values, url }, async () => {
    const session = await signInFromConfig(url);
    if (session === "failed") return 1;
    const paths = values.pages?.split(",").map((p) => p.trim()).filter(Boolean);
    if (paths && paths.length === 0) {
      console.error(`--pages lists no route. Give at least one, such as --pages /.`);
      return 1;
    }
    const report = await checkSite({ url, widths, ...(paths ? { paths } : {}), ...(session ? { signedIn: session.signedIn } : {}) });
    await mkdir(values.out, { recursive: true });
    const reportFile = join(values.out, "check.json");
    await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");
    const reportPath = relative(process.cwd(), reportFile);

    if (report.pages.length === 0) {
      console.error(`\nNo page could be checked at ${url}.`);
      return 1;
    }
    const skipped = report.errors.map((e) => `\n✗ ${route(e.url)}  ${e.reason} (not checked)`).join("");
    if (report.findings.length === 0) {
      console.log(`\nAll ${CHECKS.length} checks pass on ${plural(report.pages.length, "page")}.${skipped}`);
      return report.errors.length ? 1 : 0;
    }

    console.log(`\nChecked ${plural(report.pages.length, "page")} at ${widths.join(", ")} px\n`);
    const byPage = new Map<string, Finding[]>();
    for (const finding of report.findings) byPage.set(finding.url, [...(byPage.get(finding.url) ?? []), finding]);
    for (const [pageUrl, findings] of byPage) {
      console.log(route(pageUrl));
      const lines = new Map<string, number>();
      for (const f of findings) {
        const at = f.check === "overflow" ? ` at ${f.width} px` : "";
        const line = `  ✗ ${f.check.padEnd(9)}${f.element ? `${f.element}: ` : ""}${f.message}${at}`;
        lines.set(line, (lines.get(line) ?? 0) + 1);
      }
      for (const [line, count] of lines) console.log(count > 1 ? `${line} (×${count})` : line);
      console.log("");
    }
    if (skipped) console.log(skipped.trimStart() + "\n");
    console.log(`${plural(report.findings.length, "problem")} on ${plural(byPage.size, "page")}. Report: ${reportPath}`);
    return 1;
  });
}

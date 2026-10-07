import { relative } from "node:path";
import { parseArgs } from "node:util";
import { capture, route } from "@aeom/core";
import { APP_OPTIONS, APP_OPTIONS_HELP, parseWidths, plural, withApp, withConfig } from "./app.js";

export const CAPTURE_HELP = `Usage: aeom capture [--url <url>] [--start "<command>"] [options]

Finds every page of a web app by following its links, and screenshots each
page at every width.

Options:
${APP_OPTIONS_HELP}
  --out <dir>          Where to write the screenshots (default .aeom/captures)
  --pages <list>       Capture only these routes, comma-separated, such as /,/produits`;

export async function runCapture(argv: string[]): Promise<number> {
  const parsed = parseArgs({ args: argv, options: { ...APP_OPTIONS, out: { type: "string", default: ".aeom/captures" }, pages: { type: "string" } } }).values;
  if (parsed.help) {
    console.log(CAPTURE_HELP);
    return 0;
  }
  if (parsed.url !== undefined && !parsed.url.trim()) {
    console.error(`--url cannot be empty.`);
    return 1;
  }
  const values = await withConfig(parsed);
  if (!values.url) {
    console.error(`--url is required, here or in .aeom/config.json.\n\n${CAPTURE_HELP}`);
    return 1;
  }
  const widths = parseWidths(values.widths);
  if (typeof widths === "string") {
    console.error(widths);
    return 1;
  }
  const url = values.url;

  return withApp({ ...values, url }, async () => {
    const paths = values.pages?.split(",").map((p) => p.trim()).filter(Boolean);
    if (paths && paths.length === 0) {
      console.error(`--pages lists no route. Give at least one, such as --pages /.`);
      return 1;
    }
    const { pages, errors } = await capture({ url, outDir: values.out, widths, ...(paths ? { paths } : {}) });
    if (pages.length === 0) {
      console.error(`\nNo page could be captured from ${url}.`);
      for (const error of errors) console.error(`  ✗ ${route(error.url)}  ${error.reason}`);
      return 1;
    }

    console.log(`\n${plural(pages.length, "page")} captured${errors.length ? `, ${plural(errors.length, "page")} in error` : ""}\n`);
    const column = Math.max(...pages.map((p) => p.path.length), ...errors.map((e) => route(e.url).length)) + 2;
    const out = relative(process.cwd(), values.out) || ".";
    for (const page of pages) {
      page.files.forEach(({ file }, i) => console.log(`  ${(i === 0 ? page.path : "").padEnd(column)}${out}/${file}`));
    }
    if (errors.length) console.log("");
    for (const error of errors) console.log(`✗ ${route(error.url).padEnd(column)}${error.reason}`);
    console.log(`\nManifest: ${out}/manifest.json`);
    return 0;
  });
}

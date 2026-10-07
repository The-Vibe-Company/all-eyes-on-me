import { relative } from "node:path";
import { parseArgs } from "node:util";
import { AppStartError, capture, DEFAULT_WIDTHS, route, startApp, type RunningApp } from "@aeom/core";

export const CAPTURE_HELP = `Usage: aeom capture --url <url> [--start "<command>"] [options]

Finds every page of a web app by following its links, and screenshots each
page at every width.

Options:
  --url <url>          Where the app answers, such as http://localhost:4317
  --start "<command>"  Start the app with this command first, and stop it after
  --out <dir>          Where to write the screenshots (default .aeom/captures)
  --widths <list>      Comma-separated widths in px (default ${DEFAULT_WIDTHS.join(",")})
  --timeout <seconds>  How long to wait for the app to answer (default 30)`;

export async function runCapture(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      url: { type: "string" },
      start: { type: "string" },
      out: { type: "string", default: ".aeom/captures" },
      widths: { type: "string" },
      timeout: { type: "string", default: "30" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(CAPTURE_HELP);
    return 0;
  }
  if (!values.url) {
    console.error(`--url is required.\n\n${CAPTURE_HELP}`);
    return 1;
  }
  const widths = values.widths ? values.widths.split(",").map((w) => Number(w.trim())) : DEFAULT_WIDTHS;
  if (widths.some((w) => !Number.isInteger(w) || w <= 0)) {
    console.error(`--widths must be positive whole numbers, such as 390,1280.`);
    return 1;
  }

  let app: RunningApp | undefined;
  if (values.start) {
    console.log(`Starting the app: ${values.start}`);
    try {
      app = await startApp(values.start, values.url, { timeoutMs: Number(values.timeout) * 1000 });
    } catch (error) {
      if (!(error instanceof AppStartError)) throw error;
      console.error(`The app did not start. ${error.message}`);
      if (error.log.trim()) console.error(`\nLast output:\n${error.log.trim()}`);
      return 1;
    }
    console.log(`App ready at ${values.url}`);
  }

  try {
    const manifest = await capture({ url: values.url, outDir: values.out, widths });
    const { pages, errors } = manifest;
    if (pages.length === 0) {
      console.error(`\nNo page could be captured from ${values.url}.`);
      for (const error of errors) console.error(`  ✗ ${route(error.url)}  ${error.reason}`);
      return 1;
    }

    const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
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
  } finally {
    await app?.stop();
  }
}

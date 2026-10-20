import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { ConfigError, estimateRun, estimateText, loadConfig, localApiBase, type Estimate, type RunMode } from "@aeom/core";
import { parseWidths, sheetWidths } from "./app.js";

const USAGE = `Usage: aeom estimate [--juger | --garder-le-style | --ux | --maquettes | --from-scratch] [--directions <n>] [--autonome] [--screens <n>] [--journeys <n>] [--widths <list>] [--out <file>]

Says what a run of /aeom would cost before it starts: how many agents, how many
dollars at the API's list prices and how long, phase by phase, at most. The screens are the config's
pages (public ones included), or those of the last aeom capture; the key
journeys, the files in .aeom/journeys.

  --juger            Only judge: stop at the verdict (--diagnostic is the same)
  --garder-le-style  Keep the app's style, as the config's "style": "keep" does
  --ux               The journeys alone, as /aeom --ux: no direction, no page
                     wave (/aeom --directions is a run with --journeys 0)
  --from-scratch     A front built from a spec or a prompt (/aeom build
                     --from-scratch): give --screens, the screens of the key
                     journeys the product sheet lists
  --api <url>        Its API, running on this machine on its own fake data;
                     alone, a front built from scratch plugged into it
  --maquettes        Directions in mockups (/aeom directions), from the front as
                     it is, a prompt or a spec: two screens of static pages
                     each, for you to choose, nothing in the app changed
                     (--depuis is the same)
  --directions <n>   Build this many directions (default 3); with a style
                     kept in the config, build them anyway
  --autonome         Nobody chooses the direction: the judges screen them and
                     play a knockout (without it, the person chooses)
  --screens <n>      Count this many screens instead
  --journeys <n>     Count this many key journeys instead
  --widths <list>    Measure at these widths, such as 1280 (default: widths in
                     .aeom/config.json, or where .aeom/product.md saw the
                     front is used, or 390,1280): fewer widths, fewer
                     captures for each judge to look at
  --out <file>       Keep the estimate there too, as JSON: the result page
                     shows it next to what aeom cost measured`;

const count = (value: string | undefined, what: string, least: number): number | string | undefined => {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= least ? n : `--${what} is a whole number of ${what}, at least ${least}.`;
};

export async function runEstimate(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: { juger: { type: "boolean" }, diagnostic: { type: "boolean" }, ux: { type: "boolean" }, depuis: { type: "boolean" }, maquettes: { type: "boolean" }, "from-scratch": { type: "boolean" }, api: { type: "string" }, "garder-le-style": { type: "boolean" }, directions: { type: "string" }, autonome: { type: "boolean" }, screens: { type: "string" }, journeys: { type: "string" }, widths: { type: "string" }, out: { type: "string" }, help: { type: "boolean", short: "h" } },
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  let config;
  try {
    config = await loadConfig();
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(error.message);
    return 1;
  }
  const widths = parseWidths(values.widths ?? config.widths?.join(",") ?? (await sheetWidths())?.join(","));
  if (typeof widths === "string") return (console.error(widths), 1);
  const given = { screens: count(values.screens, "screens", 1), journeys: count(values.journeys, "journeys", 0), directions: count(values.directions, "directions", 1) };
  for (const v of Object.values(given)) if (typeof v === "string") return (console.error(v), 1);

  // Directions in mockups: whatever the source, each direction draws two screens, and nothing else is counted.
  if (values.maquettes || values.depuis) {
    const estimate = estimateRun({ screens: 2, journeys: 0, mode: "prompt", directions: (given.directions as number | undefined) ?? 3, widths: widths.length });
    return said(estimate, { screens: 2, journeys: 0, widths }, values.out);
  }
  // An API given is checked first, before anything starts: on this machine only, on its own fake data.
  if (values.api !== undefined && !localApiBase(values.api)) {
    console.error(`--api is an API running on this machine, on its own fake data, such as http://localhost:8000: AEOM touches no real data.`);
    return 1;
  }
  // From scratch, there is no app to count yet: the screens are the product sheet's. With --api alone, a front built
  // from scratch is plugged into its API.
  if (values["from-scratch"] || values.api !== undefined) {
    const mode: RunMode = values["from-scratch"] ? "scratch" : "replug";
    if (given.screens === undefined) {
      console.error(`From scratch, give --screens: how many screens the key journeys of the product sheet cross.`);
      return 1;
    }
    const journeysFound = (given.journeys as number | undefined) ?? (await readdir(join(".aeom", "journeys")).catch(() => [] as string[])).filter((f) => f.endsWith(".json")).length;
    const estimate = estimateRun({ screens: given.screens as number, journeys: journeysFound, mode, directions: (given.directions as number | undefined) ?? 3, autonome: Boolean(values.autonome), widths: widths.length });
    return said(estimate, { screens: given.screens as number, journeys: journeysFound, widths }, values.out);
  }
  let screens = given.screens as number | undefined;
  if (screens === undefined && config.pages) screens = config.pages.length + (config.public?.filter((p) => !config.pages!.includes(p)).length ?? 0);
  if (screens === undefined) {
    const manifest = await readFile(join(".aeom", "captures", "manifest.json"), "utf8").then((t) => JSON.parse(t) as { pages?: unknown[] }, () => null);
    if (manifest?.pages?.length) screens = manifest.pages.length;
  }
  if (!screens) {
    console.error(`How many screens? Give --screens, list them in "pages" in .aeom/config.json, or run aeom capture first.`);
    return 1;
  }
  const journeys = (given.journeys as number | undefined) ?? (await readdir(join(".aeom", "journeys")).catch(() => [] as string[])).filter((f) => f.endsWith(".json")).length;
  const mode: RunMode = values.juger || values.diagnostic ? "judge" : values.ux ? "ux" : values["garder-le-style"] || (config.style === "keep" && given.directions === undefined) ? "keep-style" : "full";
  const estimate = estimateRun({ screens, journeys, mode, directions: (given.directions as number | undefined) ?? 3, autonome: Boolean(values.autonome), widths: widths.length });
  return said(estimate, { screens, journeys, widths }, values.out);
}

/** Prints the estimate, and keeps it in a file when asked: the result page shows it next to what the run really cost. */
async function said(estimate: Estimate, counts: { screens: number; journeys: number; widths: number[] }, out: string | undefined): Promise<number> {
  console.log(estimateText(estimate, counts));
  if (out) await writeFile(out, `${JSON.stringify(estimate, null, 2)}\n`);
  return 0;
}

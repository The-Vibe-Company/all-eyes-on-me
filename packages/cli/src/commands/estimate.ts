import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { ConfigError, estimateRun, estimateText, loadConfig, type RunMode } from "@aeom/core";
import { parseWidths, sheetWidths } from "./app.js";

const USAGE = `Usage: aeom estimate [--juger | --garder-le-style | --ux] [--directions <n>] [--autonome] [--screens <n>] [--journeys <n>] [--widths <list>]

Says what a run of /aeom would cost before it starts: how many agents, how many
tokens and how long, phase by phase, at most. The screens are the config's
pages (public ones included), or those of the last aeom capture; the key
journeys, the files in .aeom/journeys.

  --juger            Only judge: stop at the verdict (--diagnostic is the same)
  --garder-le-style  Keep the app's style, as the config's "style": "keep" does
  --ux               The journeys alone, as /aeom --ux: no direction, no page
                     wave (/aeom --directions is a run with --journeys 0)
  --directions <n>   Build this many directions (default 3); with a style
                     kept in the config, build them anyway
  --autonome         Nobody chooses the direction: the judges screen them and
                     play a knockout (without it, the person chooses)
  --screens <n>      Count this many screens instead
  --journeys <n>     Count this many key journeys instead
  --widths <list>    Measure at these widths, such as 1280 (default: widths in
                     .aeom/config.json, or where .aeom/product.md saw the
                     front is used, or 390,1280): fewer widths, fewer
                     captures for each judge to look at`;

const count = (value: string | undefined, what: string, least: number): number | string | undefined => {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= least ? n : `--${what} is a whole number of ${what}, at least ${least}.`;
};

export async function runEstimate(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: { juger: { type: "boolean" }, diagnostic: { type: "boolean" }, ux: { type: "boolean" }, "garder-le-style": { type: "boolean" }, directions: { type: "string" }, autonome: { type: "boolean" }, screens: { type: "string" }, journeys: { type: "string" }, widths: { type: "string" }, help: { type: "boolean", short: "h" } },
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
  console.log(estimateText(estimate, { screens, journeys, widths }));
  return 0;
}

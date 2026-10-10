import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { ConfigError, estimateRun, estimateText, loadConfig, type RunMode } from "@aeom/core";

const USAGE = `Usage: aeom estimate [--juger] [--garder-le-style] [--directions <n>] [--screens <n>] [--journeys <n>]

Says what a run of /aeom would cost before it starts: how many agents, how many
tokens and how long, phase by phase, at most. The screens are the config's
pages (public ones included), or those of the last aeom capture; the key
journeys, the files in .aeom/journeys.

  --juger            Only judge: stop at the verdict
  --garder-le-style  Keep the app's style, as the config's "style": "keep" does
  --directions <n>   Build this many directions (default 6); with a style
                     kept in the config, build them anyway
  --screens <n>      Count this many screens instead
  --journeys <n>     Count this many key journeys instead`;

const count = (value: string | undefined, what: string, least: number): number | string | undefined => {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= least ? n : `--${what} is a whole number of ${what}, at least ${least}.`;
};

export async function runEstimate(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: { juger: { type: "boolean" }, "garder-le-style": { type: "boolean" }, directions: { type: "string" }, screens: { type: "string" }, journeys: { type: "string" }, help: { type: "boolean", short: "h" } },
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
  const mode: RunMode = values.juger ? "judge" : values["garder-le-style"] || (config.style === "keep" && given.directions === undefined) ? "keep-style" : "full";
  const estimate = estimateRun({ screens, journeys, mode, directions: (given.directions as number | undefined) ?? 6 });
  console.log(estimateText(estimate, { screens, journeys }));
  return 0;
}

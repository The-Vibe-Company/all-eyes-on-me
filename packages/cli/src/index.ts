#!/usr/bin/env node
import { createRequire } from "node:module";
import { runCapture } from "./commands/capture.js";
import { runCheck } from "./commands/check.js";
import { runJudge, runPrinciples } from "./commands/judge.js";
import { runSheet, runTournament } from "./commands/directions.js";
import { runGuard } from "./commands/guard.js";
import { runJourney } from "./commands/journey.js";
import { runProduct } from "./commands/product.js";
import { runCompare, runSnapshot } from "./commands/run.js";
import { runFeatures } from "./commands/features.js";
import { runPr } from "./commands/pr.js";
import { runReport } from "./commands/report.js";
import { runVerdict } from "./commands/verdict.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const HELP = `aeom ${version}
All Eyes On Me: the art director of a product coded by agents. It takes your front and makes a better one.

Usage: aeom <command>

Commands:
  capture     Find every page of a web app and screenshot it
  check       Run the measurable checks on every page
  judge       Count the judges' votes on the captures
  principles  Print the principles the judge uses
  snapshot    Keep a copy of the captures and reports, such as before a fleet run
  compare     Compare two snapshots page by page
  sheet       Lay captures side by side in one image
  tournament  Run a knockout between directions, three votes per duel
  product     Write the product sheet AEOM drafted, keeping the user's edits
  journey     Replay each key journey and capture every step
  guard       Refuse a change that adds a feature instead of fixing a journey
  verdict     Say whether the front needs redoing, from what AEOM measured
  report      Write the page of what a run gave, in the run's folder
  features    Name what a blocked journey would need, without building it
  pr          Push the run's branch and open a PR, in words, with no capture

Run aeom <command> --help for its options.
Roadmap: https://github.com/The-Vibe-Company/all-eyes-on-me#what-comes-next`;

const COMMANDS: Record<string, (argv: string[]) => Promise<number>> = {
  capture: runCapture,
  check: runCheck,
  judge: runJudge,
  principles: runPrinciples,
  snapshot: runSnapshot,
  compare: runCompare,
  sheet: runSheet,
  tournament: runTournament,
  product: runProduct,
  journey: runJourney,
  guard: runGuard,
  verdict: runVerdict,
  report: runReport,
  features: runFeatures,
  pr: runPr,
};

const [command, ...rest] = process.argv.slice(2);
if (command === "--version" || command === "-v") {
  console.log(version);
} else if (command && COMMANDS[command]) {
  process.exitCode = await COMMANDS[command](rest);
} else {
  console.log(HELP);
  if (command && command !== "--help" && command !== "-h") process.exitCode = 1;
}

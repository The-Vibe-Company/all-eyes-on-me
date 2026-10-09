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
import { runVerdict } from "./commands/verdict.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const HELP = `aeom ${version}
All Eyes On Me: a fleet of agents that rebuilds your frontend and judges every screen against your taste.

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

Run aeom <command> --help for its options.
Roadmap: https://github.com/The-Vibe-Company/all-eyes-on-me#roadmap`;

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

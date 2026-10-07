#!/usr/bin/env node
import { createRequire } from "node:module";
import { runCapture } from "./commands/capture.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const HELP = `aeom ${version}
All Eyes On Me: a fleet of agents that rebuilds your frontend and judges every screen against your taste.

Usage: aeom <command>

Commands:
  capture   Find every page of a web app and screenshot it

Run aeom <command> --help for its options.
Roadmap: https://github.com/The-Vibe-Company/all-eyes-on-me#roadmap`;

const COMMANDS: Record<string, (argv: string[]) => Promise<number>> = {
  capture: runCapture,
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

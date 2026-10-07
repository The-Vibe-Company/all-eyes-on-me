#!/usr/bin/env node
import { createRequire } from "node:module";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const HELP = `aeom ${version}
All Eyes On Me: a fleet of agents that rebuilds your frontend and judges every screen against your taste.

Usage: aeom <command>

No command is implemented yet.
Roadmap: https://github.com/The-Vibe-Company/all-eyes-on-me#roadmap`;

const arg = process.argv[2];
if (arg === "--version" || arg === "-v") {
  console.log(version);
} else {
  console.log(HELP);
  if (arg && arg !== "--help" && arg !== "-h") process.exitCode = 1;
}

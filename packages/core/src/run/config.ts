import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** `.aeom/config.json`: how to reach the project's app, so commands need no flags. */
export interface ProjectConfig {
  url?: string;
  start?: string;
}

/** `.aeom/config.json` exists but cannot be used. */
export class ConfigError extends Error {}

/** Reads `.aeom/config.json`. No file means no config; a file that is not valid is an error. */
export async function loadConfig(projectDir = process.cwd()): Promise<ProjectConfig> {
  const file = join(projectDir, ".aeom", "config.json");
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(`${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new ConfigError(`${file} must hold an object, such as {"url": "...", "start": "..."}.`);
  const config: ProjectConfig = {};
  for (const key of ["url", "start"] as const) {
    const value = (parsed as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || !value.trim()) throw new ConfigError(`${file}: "${key}" must be a non-empty string.`);
    config[key] = value;
  }
  return config;
}

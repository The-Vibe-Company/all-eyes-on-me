import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** `.aeom/config.json`: how to reach the project's app, so commands need no flags. */
export interface ProjectConfig {
  url?: string;
  start?: string;
  /** A command that puts the app's data back as it was, run before each journey. */
  reset?: string;
  /** How to sign in with a fake account: the sign-in route, a JSON file of the account's fields by label, the button's name. */
  login?: { path: string; account: string; submit: string };
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
    throw new ConfigError(`${file} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(`${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new ConfigError(`${file} must hold an object, such as {"url": "...", "start": "..."}.`);
  const config: ProjectConfig = {};
  for (const key of ["url", "start", "reset"] as const) {
    const value = (parsed as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || !value.trim()) throw new ConfigError(`${file}: "${key}" must be a non-empty string.`);
    config[key] = value;
  }
  const login = (parsed as Record<string, unknown>).login;
  if (login !== undefined) {
    const l = (login ?? {}) as Record<string, unknown>;
    const missing = (["path", "account", "submit"] as const).filter((k) => typeof l[k] !== "string" || !(l[k] as string).trim());
    if (typeof login !== "object" || missing.length) {
      throw new ConfigError(`${file}: "login" needs "path" (the sign-in route), "account" (a JSON file of the fake account's fields by label) and "submit" (the button's name); missing ${missing.join(", ")}.`);
    }
    config.login = { path: l.path as string, account: l.account as string, submit: l.submit as string };
  }
  return config;
}

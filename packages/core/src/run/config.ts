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
  /** The files that hold the app's data or logic, as globs: a change to one is a feature, refused by aeom guard. */
  protected?: string[];
  /** "keep": the app has a style to keep, such as a client's brand charter; AEOM fixes it rather than proposing a new direction. */
  style?: "keep";
  /** The pages to capture and check, when the app has many of one kind (a page per product): one of each kind, rather than every page its links lead to. */
  pages?: string[];
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
  const guarded = (parsed as Record<string, unknown>).protected;
  if (guarded !== undefined) {
    if (!Array.isArray(guarded) || guarded.some((g) => typeof g !== "string" || !g.trim())) throw new ConfigError(`${file}: "protected" must list globs, such as ["src/lib/db/**", "src/app/api/**"].`);
    // A glob is matched against whole paths: stray spaces around it would make it match nothing.
    config.protected = (guarded as string[]).map((g) => g.trim());
  }
  const pages = (parsed as Record<string, unknown>).pages;
  if (pages !== undefined) {
    if (!Array.isArray(pages) || !pages.length || pages.some((p) => typeof p !== "string" || !p.trim().startsWith("/"))) throw new ConfigError(`${file}: "pages" lists routes from the app's root, such as ["/", "/objets/perceuse"].`);
    config.pages = (pages as string[]).map((p) => p.trim());
  }
  const style = (parsed as Record<string, unknown>).style;
  if (style !== undefined) {
    if (style !== "keep") throw new ConfigError(`${file}: "style" is "keep", to keep the existing style, or left out, for a new art direction.`);
    config.style = style;
  }
  const login = (parsed as Record<string, unknown>).login;
  if (login !== undefined) {
    const l = (login ?? {}) as Record<string, unknown>;
    const missing = (["path", "account", "submit"] as const).filter((k) => typeof l[k] !== "string" || !(l[k] as string).trim());
    if (typeof login !== "object" || missing.length) {
      throw new ConfigError(`${file}: "login" needs "path" (the sign-in route), "account" (a JSON file of the fake account's fields by label) and "submit" (the button's name); missing ${missing.join(", ")}.`);
    }
    if (!(l.path as string).startsWith("/")) throw new ConfigError(`${file}: "login.path" is the sign-in route from the app's root, such as "/connexion".`);
    config.login = { path: l.path as string, account: l.account as string, submit: l.submit as string };
  }
  return config;
}

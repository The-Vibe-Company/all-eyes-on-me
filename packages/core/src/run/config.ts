import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { usableWidths, WIDTH_RANGE } from "../capture/capture.js";
import { CHECKS, type CheckExceptions } from "../checks/run.js";

/** `.aeom/config.json`: how to reach the project's app, so commands need no flags. */
export interface ProjectConfig {
  url?: string;
  start?: string;
  /** A command that puts the app's data back as it was, run before each journey. */
  reset?: string;
  /** How to sign in with a fake account: the sign-in route, a JSON file of the account's fields by label, the button's name. */
  login?: LoginConfig;
  /** The files that hold the app's data or logic, as globs: a change to one is a feature, refused by aeom guard. */
  protected?: string[];
  /** "keep": the app has a style to keep, such as a client's brand charter; AEOM fixes it rather than proposing a new direction. */
  style?: "keep";
  /** The pages to capture and check, when the app has many of one kind (a page per product): one of each kind, rather than every page its links lead to. */
  pages?: string[];
  /** Pages seen signed out, such as a public home page that sends a signed-in visitor elsewhere: captured and checked signed out. */
  public?: string[];
  /** The route a signed-in user lands on, when `/` sends them elsewhere: the first screen the directions are built and judged on. */
  home?: string;
  /** The widths that count, in px, such as [1280] for a tool used on a computer only: the only ones captured, checked, replayed and judged. Without it, 390 and 1280. */
  widths?: number[];
  /** The routes where a check does not apply, by check, such as {"header": ["/"]} for a landing page whose header scrolls away on purpose. */
  except?: CheckExceptions;
}

/**
 * How AEOM signs in to the app, with a fake account only: a form it fills (the
 * sign-in route, a JSON file of the account's fields by label, the button), a
 * session saved in a file (a browser state, or a list of cookies), or a
 * command that prints such a session, run with AEOM_URL set.
 */
export type LoginConfig = { path: string; account: string; submit: string } | { state: string } | { script: string };

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
  const open = (parsed as Record<string, unknown>).public;
  if (open !== undefined) {
    if (!Array.isArray(open) || !open.length || open.some((p) => typeof p !== "string" || !p.trim().startsWith("/"))) throw new ConfigError(`${file}: "public" lists the routes to see signed out, such as ["/", "/connexion"].`);
    config.public = (open as string[]).map((p) => p.trim());
  }
  const home = (parsed as Record<string, unknown>).home;
  if (home !== undefined) {
    if (typeof home !== "string" || !home.trim().startsWith("/")) throw new ConfigError(`${file}: "home" is the route a signed-in user lands on, such as "/jeu".`);
    config.home = home.trim();
  }
  const widths = (parsed as Record<string, unknown>).widths;
  if (widths !== undefined) {
    const usable = usableWidths(widths);
    if (!usable) throw new ConfigError(`${file}: "widths" lists the widths to measure, in px between ${WIDTH_RANGE.min} and ${WIDTH_RANGE.max}, such as [1280] or [390, 1280].`);
    config.widths = usable;
  }
  const except = (parsed as Record<string, unknown>).except;
  if (except !== undefined) {
    const say = (why = "") => new ConfigError(`${file}: "except" names checks, each with the routes it leaves out, such as {"header": ["/"]}${why}.`);
    if (!except || typeof except !== "object" || Array.isArray(except)) throw say();
    config.except = {};
    for (const [check, routes] of Object.entries(except)) {
      if (!(CHECKS as string[]).includes(check)) throw say(`: ${check} is not a check (${CHECKS.join(", ")})`);
      if (!Array.isArray(routes) || routes.some((r) => typeof r !== "string" || !r.trim().startsWith("/"))) throw say();
      config.except[check as keyof CheckExceptions] = (routes as string[]).map((r) => r.trim());
    }
  }
  const style = (parsed as Record<string, unknown>).style;
  if (style !== undefined) {
    if (style !== "keep") throw new ConfigError(`${file}: "style" is "keep", to keep the existing style, or left out, for a new art direction.`);
    config.style = style;
  }
  const login = (parsed as Record<string, unknown>).login;
  if (login !== undefined) {
    if (!login || typeof login !== "object" || Array.isArray(login)) throw new ConfigError(`${file}: "login" is one of three: a form ("path", "account", "submit"), a saved session ("state"), or a script that prints one ("script").`);
    const l = login as Record<string, unknown>;
    const ways = [["path", "account", "submit"].some((k) => k in l), "state" in l, "script" in l].filter(Boolean).length;
    if (ways > 1) throw new ConfigError(`${file}: "login" is one of three: a form ("path", "account", "submit"), a saved session ("state"), or a script that prints one ("script").`);
    for (const key of ["state", "script"] as const) {
      if (!(key in l)) continue;
      if (typeof l[key] !== "string" || !(l[key] as string).trim()) throw new ConfigError(`${file}: "login.${key}" is ${key === "state" ? "the file of a saved session" : "the command that prints a session"}.`);
      config.login = key === "state" ? { state: (l.state as string).trim() } : { script: (l.script as string).trim() };
      return config;
    }
    const missing = (["path", "account", "submit"] as const).filter((k) => typeof l[k] !== "string" || !(l[k] as string).trim());
    if (missing.length) {
      throw new ConfigError(`${file}: "login" needs "path" (the sign-in route), "account" (a JSON file of the fake account's fields by label) and "submit" (the button's name); missing ${missing.join(", ")}.`);
    }
    if (!(l.path as string).startsWith("/")) throw new ConfigError(`${file}: "login.path" is the sign-in route from the app's root, such as "/connexion".`);
    config.login = { path: l.path as string, account: l.account as string, submit: l.submit as string };
  }
  return config;
}

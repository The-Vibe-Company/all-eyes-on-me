import { readFile } from "node:fs/promises";
import { AppStartError, ConfigError, DEFAULT_WIDTHS, loadConfig, signInOnce, SignInError, startApp, type RunningApp, type SignedIn } from "@aeom/core";

export const APP_OPTIONS = {
  url: { type: "string" },
  start: { type: "string" },
  widths: { type: "string" },
  timeout: { type: "string", default: "30" },
  help: { type: "boolean", short: "h" },
} as const;

export const APP_OPTIONS_HELP = `  --url <url>          Where the app answers, such as http://localhost:4317
                       (default: url in .aeom/config.json)
  --start "<command>"  Start the app with this command first, and stop it after
                       (default: start in .aeom/config.json, only when --url
                       is not given, so --url alone captures a running app)
  --widths <list>      Comma-separated widths in px (default ${DEFAULT_WIDTHS.join(",")})
  --timeout <seconds>  How long to wait for the app to answer (default 30)`;

/** Parses --widths, or returns an error message. */
export function parseWidths(value: string | undefined): number[] | string {
  if (!value) return DEFAULT_WIDTHS;
  const widths = value.split(",").map((w) => Number(w.trim()));
  return widths.some((w) => !Number.isInteger(w) || w <= 0) ? "--widths must be positive whole numbers, such as 390,1280." : widths;
}

/**
 * Starts the app when --start is given, runs `work`, and always stops the app
 * after. Returns 1 when the app does not start.
 */
export async function withApp(values: { url: string; start?: string; timeout?: string }, work: () => Promise<number>): Promise<number> {
  let app: RunningApp | undefined;
  if (values.start) {
    console.log(`Starting the app: ${values.start}`);
    try {
      app = await startApp(values.start, values.url, { timeoutMs: Number(values.timeout ?? 30) * 1000 });
    } catch (error) {
      if (!(error instanceof AppStartError)) throw error;
      console.error(`The app did not start. ${error.message}`);
      if (error.log.trim()) console.error(`\nLast output:\n${error.log.trim()}`);
      return 1;
    }
    console.log(`App ready at ${values.url}`);
  }
  try {
    return await work();
  } finally {
    await app?.stop();
  }
}

export const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/**
 * Fills --url and --start from .aeom/config.json. The config's start command
 * is used only when --url is not given either: an explicit --url means an app
 * that is already running there.
 */
export async function withConfig<T extends { url?: string; start?: string }>(values: T): Promise<T> {
  let config;
  try {
    config = await loadConfig();
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
  if (values.url !== undefined) return values;
  return { ...values, url: config.url, start: values.start ?? config.start };
}

/**
 * Signs in with the fake account of .aeom/config.json's "login", when there is
 * one, and returns what the signed-in browser keeps with the account's values;
 * null when the app needs no sign-in. Prints why and returns "failed" when it
 * cannot sign in. No value of the account is ever printed.
 */
export async function signInFromConfig(url: string): Promise<{ signedIn: SignedIn; account: Record<string, string> } | null | "failed"> {
  let login;
  try {
    login = (await loadConfig()).login;
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(error.message);
    return "failed";
  }
  if (!login) return null;
  let account: Record<string, string>;
  try {
    const parsed = JSON.parse(await readFile(login.account, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.values(parsed).some((v) => typeof v !== "string")) throw new Error("it must hold the account's fields by label, each a string");
    account = parsed as Record<string, string>;
  } catch (error) {
    console.error(`Cannot read the sign-in account ${login.account}: ${error instanceof Error ? error.message : String(error)}`);
    return "failed";
  }
  try {
    const signedIn = await signInOnce(url, { path: login.path, account, submit: login.submit });
    console.log(`Signed in on ${login.path} with the account in ${login.account}`);
    return { signedIn, account };
  } catch (error) {
    if (!(error instanceof SignInError)) throw error;
    console.error(error.message);
    return "failed";
  }
}

import { readFile } from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { AppStartError, ConfigError, DEFAULT_WIDTHS, loadConfig, platformOf, usableWidths, WIDTH_RANGE, signedInFrom, signInOnce, SignInError, usableSession, startApp, type RunningApp, type SignedIn, type SignIn } from "@aeom/core";

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
  --widths <list>      Comma-separated widths in px (default: widths in
                       .aeom/config.json, or where .aeom/product.md saw the
                       front is used: 390 on mobile, 1280 on desktop; or
                       ${DEFAULT_WIDTHS.join(",")})
  --timeout <seconds>  How long to wait for the app to answer (default 30)`;

/** The widths of the platform the product sheet saw the front is used on; undefined when it does not say, or only guesses. */
export async function sheetWidths(): Promise<number[] | undefined> {
  const sheet = await readFile(".aeom/product.md", "utf8").catch(() => undefined);
  const used = sheet === undefined ? null : platformOf(sheet);
  return used?.seen ? used.widths : undefined;
}

/** Parses --widths, which withConfig fills from the config when it is not given, or returns an error message. */
export function parseWidths(value: string | undefined): number[] | string {
  if (value === undefined) return DEFAULT_WIDTHS;
  const widths = value.trim() ? usableWidths(value.split(",").map((w) => (w.trim() ? Number(w.trim()) : NaN))) : null;
  return widths ?? `--widths lists the widths to measure, in px between ${WIDTH_RANGE.min} and ${WIDTH_RANGE.max}, such as 1280 or 390,1280.`;
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
 * Fills --url, --start and --pages from .aeom/config.json, and the pages seen
 * signed out, `public`: all of them when the pages come from the config or the
 * links, only those --pages names otherwise. The config's start command is
 * used only when --url is not given either: an explicit --url means an app
 * that is already running there.
 */
export async function withConfig<T extends { url?: string; start?: string; pages?: string; widths?: string }>(values: T): Promise<T & { public?: string }> {
  let config;
  try {
    config = await loadConfig();
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
  // The config's pages hold however the app is reached: --pages alone replaces them.
  const given = values.pages?.split(",").map((p) => p.trim());
  const open = config.public?.filter((p) => !given || given.includes(p));
  if (open?.length) values = { ...values, public: open.join(",") };
  if (values.pages === undefined && config.pages) values = { ...values, pages: config.pages.join(",") };
  // The widths that count are the product's, whoever starts the app: --widths alone replaces them.
  if (values.widths === undefined && config.widths) values = { ...values, widths: config.widths.join(",") };
  // Then where the product sheet saw the front is used: a guess to confirm decides nothing.
  const used = values.widths === undefined ? await sheetWidths() : undefined;
  if (used) values = { ...values, widths: used.join(",") };
  if (values.url !== undefined) return values;
  return { ...values, url: config.url, start: values.start ?? config.start };
}

/**
 * Signs in as .aeom/config.json's "login" says, with a fake account only: a
 * form filled with the account's fields, a saved session, or a script that
 * prints one. Returns what the signed-in browser keeps, the account's values
 * (for journeys that fill them; none without a form), and how to sign in
 * again after a reset; null when the app needs no sign-in. Prints why and
 * returns "failed" when it cannot sign in. No value of the account or the
 * session is ever printed.
 */
export async function signInFromConfig(url: string): Promise<{ signedIn: SignedIn; account: Record<string, string>; relogin: () => Promise<SignedIn>; kind: "form" | "state" | "script" } | null | "failed"> {
  let login;
  try {
    login = (await loadConfig()).login;
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(error.message);
    return "failed";
  }
  if (!login) return null;
  if ("state" in login || "script" in login) {
    const read = async () => {
      if ("state" in login) {
        const text = await readFile(login.state, "utf8").catch((error: NodeJS.ErrnoException) => {
          throw new SignInError(`Cannot read the saved session ${login.state}: ${error.code === "ENOENT" ? "the file does not exist" : "the file cannot be read"}.`);
        });
        return usableSession(signedInFrom(text, url));
      }
      const printed = await promisify(exec)(login.script, { env: { ...process.env, AEOM_URL: url }, timeout: 60_000, maxBuffer: 1 << 20 }).catch((error: { code?: number | string }) => {
        // What the script printed may hold a secret: only its exit is said.
        throw new SignInError(`The login script exited with ${error.code ?? "an error"}: run it by hand to see why.`);
      });
      return usableSession(signedInFrom(printed.stdout, url));
    };
    try {
      const signedIn = await read();
      console.log("state" in login ? `Signed in with the session in ${login.state}` : "Signed in with what the login script printed");
      return { signedIn, account: {}, relogin: read, kind: "state" in login ? "state" : "script" };
    } catch (error) {
      if (!(error instanceof SignInError)) throw error;
      console.error(error.message);
      return "failed";
    }
  }
  let account: Record<string, string>;
  try {
    const parsed = JSON.parse(await readFile(login.account, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.values(parsed).some((v) => typeof v !== "string")) throw new Error("it must hold the account's fields by label, each a string");
    account = parsed as Record<string, string>;
  } catch (error) {
    // A JSON error quotes the file, which holds the account: say only what is wrong.
    const code = (error as NodeJS.ErrnoException).code;
    const why = error instanceof SyntaxError ? "it is not valid JSON" : code === "ENOENT" ? "the file does not exist" : code ? "the file cannot be read" : (error as Error).message;
    console.error(`Cannot read the sign-in account ${login.account}: ${why}`);
    return "failed";
  }
  try {
    const how: SignIn = { path: login.path, account, submit: login.submit };
    const signedIn = await signInOnce(url, how);
    console.log(`Signed in on ${login.path} with the account in ${login.account}`);
    return { signedIn, account, relogin: () => signInOnce(url, how), kind: "form" };
  } catch (error) {
    if (!(error instanceof SignInError)) throw error;
    console.error(error.message);
    return "failed";
  }
}


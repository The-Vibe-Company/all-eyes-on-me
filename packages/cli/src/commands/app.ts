import { AppStartError, ConfigError, DEFAULT_WIDTHS, loadConfig, startApp, type RunningApp } from "@aeom/core";

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

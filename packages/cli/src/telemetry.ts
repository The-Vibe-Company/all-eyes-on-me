import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { arch, platform } from "node:os";
import { join } from "node:path";
import { aeomHome } from "@aeom/core";

// The landing's PostHog project (site/analytics.mjs). Its project token is public:
// it can only write events, never read them.
export const POSTHOG_KEY = "phc_t2nnd67anazLHswBGWQNA62esC2v4im5PBaV7QhyhPKw";
const POSTHOG_BATCH = "https://us.i.posthog.com/batch/";

export const NOTICE =
  "AEOM counts its installs and the commands they run: it sends a random id, its version, your OS and the command's name, never anything about your project. AEOM_TELEMETRY=0 turns it off.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A variable that is set and says yes: `CI=false` or `DO_NOT_TRACK=0` say no. */
const yes = (value: string | undefined) => {
  const v = (value ?? "").trim().toLowerCase();
  return v !== "" && v !== "0" && v !== "false";
};

/** Whether this process may send anything: not when turned off, in CI, or under AEOM's own tests. */
export function telemetryOn(env: NodeJS.ProcessEnv = process.env): boolean {
  if (["0", "false", "off", "no"].includes((env.AEOM_TELEMETRY ?? "").trim().toLowerCase())) return false;
  // node --test hands NODE_TEST_CONTEXT to what it runs, so the aeom its tests spawn stays quiet.
  return !yes(env.DO_NOT_TRACK) && !yes(env.CI) && !env.NODE_TEST_CONTEXT;
}

/** The name that leaves: a known command, help or version, never what was typed. */
export function commandName(command: string | undefined, known: string[]): string {
  if (command === undefined || command === "--help" || command === "-h") return "help";
  if (command === "--version" || command === "-v") return "version";
  return known.includes(command) ? command : "unknown";
}

/**
 * The install's random id, in `~/.aeom/install-id`: the run that makes it is the install.
 * Null when the id cannot be kept, so an unwritable home is not a new install on every run.
 */
async function installId(home: string): Promise<{ id: string; first: boolean } | null> {
  const file = join(home, "install-id");
  const kept = async () => {
    const id = (await readFile(file, "utf8").catch(() => "")).trim();
    return UUID.test(id) ? id : null;
  };
  const id = await kept();
  if (id) return { id, first: false };
  try {
    const made = randomUUID();
    await mkdir(home, { recursive: true });
    await writeFile(file, `${made}\n`, { flag: "wx" });
    return { id: made, first: true };
  } catch {
    // Another aeom made it at the same moment: that one is the install.
    const other = await kept();
    return other ? { id: other, first: false } : null;
  }
}

export interface PingOptions {
  env?: NodeJS.ProcessEnv;
  home?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  warn?: (line: string) => void;
}

/**
 * Tells PostHog this command ran, and the install on the first run, after saying so on stderr.
 * It never takes more than `timeoutMs` and never throws: a command never waits on it nor fails by it.
 */
export async function ping(command: string, version: string, options: PingOptions = {}): Promise<void> {
  const env = options.env ?? process.env;
  if (!telemetryOn(env)) return;
  const { fetchImpl = fetch, timeoutMs = 1000, warn = (line: string) => process.stderr.write(`${line}\n`) } = options;
  try {
    const install = await installId(options.home ?? aeomHome());
    if (!install) return;
    if (install.first) warn(NOTICE);
    const properties = {
      distinct_id: install.id,
      command,
      version,
      os: platform(),
      arch: arch(),
      node: process.versions.node,
      $lib: "aeom-cli",
      $process_person_profile: false,
    };
    const timestamp = new Date().toISOString();
    const events = [...(install.first ? ["cli installed"] : []), "cli command"];
    await fetchImpl(env.AEOM_TELEMETRY_URL || POSTHOG_BATCH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        batch: events.map((event) => ({ event, distinct_id: install.id, properties, timestamp })),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // Offline, slow or refused: the command goes on as if nothing was sent.
  }
}

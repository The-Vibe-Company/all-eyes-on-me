import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, link, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { arch, platform } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { aeomHome } from "@aeom/core";

// The landing's PostHog project (site/analytics.mjs). Its project token is public:
// it can only write events, never read them.
export const POSTHOG_KEY = "phc_t2nnd67anazLHswBGWQNA62esC2v4im5PBaV7QhyhPKw";
const POSTHOG_BATCH = "https://us.i.posthog.com/batch/";

export const NOTICE =
  "AEOM counts its installs and the commands they run: it sends a random id, its version, your OS, its architecture, Node's version and the command's name, never anything about your project. AEOM_TELEMETRY=0 turns it off.";

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
 * The install's random id, in `~/.aeom/install-id`: the run that makes it is the first.
 * The id appears whole or not at all (written aside, then linked into place), and a file
 * that holds no id is replaced. Null when no id can be kept, so an unwritable home is not
 * a new install on every run.
 */
async function installId(home: string): Promise<{ id: string; first: boolean } | null> {
  const file = join(home, "install-id");
  const kept = async () => {
    const id = (await readFile(file, "utf8").catch(() => "")).trim();
    return UUID.test(id) ? id : null;
  };
  const id = await kept();
  if (id) return { id, first: false };
  const made = randomUUID();
  const aside = `${file}.${made}`;
  try {
    await mkdir(home, { recursive: true });
    await writeFile(aside, `${made}\n`);
    try {
      await link(aside, file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") return null;
      // Another aeom made it at the same moment: that one is the install.
      const other = await kept();
      if (other) return { id: other, first: false };
      await rename(aside, file);
    }
    return { id: made, first: true };
  } catch {
    return null;
  } finally {
    await rm(aside, { force: true }).catch(() => {});
  }
}

/** Hands the batch to a detached process, so the command neither waits for it nor fails by it. */
function sendAside(url: string, body: string, counted: string): void {
  const sender = fileURLToPath(new URL("./telemetry-send.js", import.meta.url));
  const child = spawn(process.execPath, [sender, url, body, counted], { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", () => {});
  child.unref();
}

export interface PingOptions {
  env?: NodeJS.ProcessEnv;
  home?: string;
  warn?: (line: string) => void;
  /** Sends the batch; `counted` is the file to write once PostHog has taken it. */
  send?: (url: string, body: string, counted: string) => void;
}

/**
 * Tells PostHog this command ran, and the install until PostHog has taken it, after
 * saying so on stderr on the first run. It never throws and never waits on the network.
 */
export async function ping(command: string, version: string, options: PingOptions = {}): Promise<void> {
  const env = options.env ?? process.env;
  if (!telemetryOn(env)) return;
  const { warn = (line: string) => process.stderr.write(`${line}\n`), send = sendAside } = options;
  try {
    const home = options.home ?? aeomHome();
    const install = await installId(home);
    if (!install) return;
    // Until a send of it succeeds, the install goes with each command: a first run that
    // was offline is still counted, and an install is one id, however many times it came.
    const counted = join(home, "install-counted");
    if (install.first) {
      warn(NOTICE);
      await rm(counted, { force: true });
    }
    const pending = await access(counted).then(() => false, () => true);
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
    const events = [...(pending ? ["cli installed"] : []), "cli command"];
    const body = JSON.stringify({
      api_key: POSTHOG_KEY,
      batch: events.map((event) => ({ event, distinct_id: install.id, properties, timestamp })),
    });
    send(env.AEOM_TELEMETRY_URL || POSTHOG_BATCH, body, pending ? counted : "");
  } catch {
    // Nothing about the ping may reach the command.
  }
}

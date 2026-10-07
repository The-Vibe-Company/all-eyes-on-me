import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

export interface RunningApp {
  url: string;
  stop(): Promise<void>;
}

/** The app could not be started. `log` holds the end of what it printed. */
export class AppStartError extends Error {
  constructor(
    message: string,
    readonly log: string,
  ) {
    super(message);
    this.name = "AppStartError";
  }
}

export interface StartAppOptions {
  timeoutMs?: number;
  cwd?: string;
}

/**
 * Runs `command` in a shell and waits until `url` answers any HTTP request.
 * Refuses to start when something already answers at `url`, so a capture
 * never photographs another app by mistake.
 */
export async function startApp(
  command: string,
  url: string,
  { timeoutMs = 30_000, cwd = process.cwd() }: StartAppOptions = {},
): Promise<RunningApp> {
  if (await answers(url)) {
    throw new AppStartError(`Something already answers at ${url}. Stop it, or drop --start to capture it as it is.`, "");
  }

  const child = spawn(command, { shell: true, cwd, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  const keep = (chunk: Buffer) => {
    log = (log + chunk.toString()).slice(-4000);
  };
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);

  let exitCode: number | null | undefined;
  const exited = new Promise<void>((resolve) =>
    child.once("exit", (code) => {
      exitCode = code;
      resolve();
    }),
  );

  const stop = async () => {
    if (exitCode !== undefined || child.pid === undefined) return;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      return;
    }
    const force = setTimeout(() => {
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {}
    }, 3000);
    await exited;
    clearTimeout(force);
  };

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (exitCode !== undefined) {
      throw new AppStartError(`The app exited with code ${exitCode} before ${url} answered.`, log);
    }
    if (await answers(url)) return { url, stop };
    await sleep(250);
  }
  await stop();
  throw new AppStartError(`${url} did not answer within ${Math.round(timeoutMs / 1000)}s.`, log);
}

async function answers(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

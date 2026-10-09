import { execFile, spawn } from "node:child_process";
import { readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { basename, extname, join, relative, resolve } from "node:path";
import { parseArgs, promisify } from "node:util";
import { addFeedback, aeomHome, agreementRates, isInside, pageVerdicts, readFeedback, readRun, resultHtml, RunReportError, runKey, type PageVerdict } from "@aeom/core";

const REPORT_HELP = `Usage: aeom report [run-dir] [--open] [--serve [--port <n>]]

Writes the page of what a run gave, report.html, in the run's folder
(default: the latest one in .aeom/runs): the direction chosen and why, each
screen and each journey before and after, kept or sent back and why, what still
fails; or « nothing to redo », with what was measured. The page needs no network,
and nothing in it leaves the machine.

With --serve, serves the page on this machine only (127.0.0.1) until stopped,
or after 2 hours with no request, so each verdict takes « agree » or « disagree »
and a reason, kept at once in ~/.aeom/taste/, in words and without any capture.
The page shows how often you agreed with AEOM, by category, over every run.

Options:
  --open        Open the page in the browser
  --serve       Serve the page, and keep what you say of each verdict
  --port <n>    The port to serve on, 0 to 65535 (default: 0, any free one)`;

/** The run folder most recently changed in .aeom/runs. */
export async function latestRun(): Promise<string | null> {
  const root = join(".aeom", "runs");
  const names = await readdir(root).catch(() => [] as string[]);
  const runs = await Promise.all(names.map(async (name) => ({ dir: join(root, name), at: (await stat(join(root, name, "before")).catch(() => null))?.mtimeMs })));
  return runs.filter((r) => r.at !== undefined).sort((a, b) => b.at! - a.at!)[0]?.dir ?? null;
}

export async function runReport(argv: string[]): Promise<number> {
  let args;
  try {
    args = parseArgs({ args: argv, allowPositionals: true, options: { open: { type: "boolean" }, serve: { type: "boolean" }, port: { type: "string", default: "0" }, help: { type: "boolean", short: "h" } } });
  } catch {
    console.log(REPORT_HELP);
    return 1;
  }
  const { positionals, values } = args;
  const port = /^\d{1,5}$/.test(values.port) ? Number(values.port) : NaN;
  if (values.help || positionals.length > 1 || !(port <= 65535)) {
    console.log(REPORT_HELP);
    return values.help ? 0 : 1;
  }
  const runDir = positionals[0] ?? (await latestRun());
  if (!runDir) {
    console.error(`No run in .aeom/runs: run /aeom first.`);
    return 1;
  }
  const home = aeomHome();
  let html: string, verdicts: PageVerdict[];
  try {
    const result = await readRun(runDir, basename(runDir));
    html = resultHtml(result, { rates: agreementRates(await readFeedback(home)) });
    verdicts = pageVerdicts(result);
  } catch (error) {
    if (!(error instanceof RunReportError)) throw error;
    console.error(error.message);
    return 1;
  }
  const page = join(runDir, "report.html");
  await writeFile(page, html);
  console.log(`Report: ${relative(process.cwd(), page) || page}`);

  // The captures stay on this machine: a run folder git would commit is said.
  // Asked of the run folder's own repository, wherever aeom runs from.
  const ignored = await promisify(execFile)("git", ["check-ignore", "-q", "."], { cwd: runDir }).then(() => true, (error: { code?: number }) => (error.code === 1 ? false : null));
  if (ignored === false) console.log(`${runDir} is not ignored by git: add .aeom/runs/ to .gitignore, so no capture enters a commit.`);

  if (values.serve) return serve(runDir, home, port, values.open === true, verdicts);
  if (values.open) {
    const file = resolve(page);
    const [opener, args] = process.platform === "darwin" ? ["open", [file]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", file]] : ["xdg-open", [file]];
    const child = spawn(opener, args as string[], { detached: true, stdio: "ignore" });
    // No program to open it, such as on a server: the page is written, so say where it is.
    child.on("error", () => console.log(`Could not open it here: open ${file} in a browser.`));
    child.unref();
  }
  return 0;
}

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".json": "application/json" };
const IDLE_HOURS = 2;

/**
 * The body of a request, decoded once whole, so no letter is cut between two packets;
 * null past `max` bytes. Read to its end either way, so the answer still reaches the sender.
 */
async function bodyOf(req: IncomingMessage, max: number): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) if ((size += chunk.length) <= max) chunks.push(chunk);
  return size > max ? null : Buffer.concat(chunks).toString("utf8");
}

/**
 * Serves the run's folder on this machine only, and keeps each gesture on one of
 * the page's verdicts as it is made. Stops after IDLE_HOURS with no request.
 */
async function serve(runDir: string, home: string, port: number, open: boolean, verdicts: PageVerdict[]): Promise<number> {
  const root = await realpath(runDir);
  const { project, run } = await runKey(runDir);
  const known = new Map(verdicts.map((v) => [v.id, v]));
  // The names this server answers to, set once it listens: a page from elsewhere, through a rebound DNS name, gets nothing.
  let hosts: string[] = [];
  let done!: (code: number) => void;
  const stopped = new Promise<number>((resolve) => (done = resolve));
  let idle: NodeJS.Timeout | undefined;
  const wake = () => {
    clearTimeout(idle);
    idle = setTimeout(() => {
      console.log(`No request for ${IDLE_HOURS} hours: the page is no longer served. Serve it again with aeom report ${runDir} --serve.`);
      server.close();
      server.closeAllConnections();
      done(0);
    }, IDLE_HOURS * 60 * 60 * 1000);
  };
  const server = createServer(async (req, res) => {
    const send = (status: number, body: string, type = "text/plain; charset=utf-8") => res.writeHead(status, { "content-type": type }).end(body);
    try {
      if (!hosts.includes(req.headers.host ?? "")) return send(403, "This page is served to this machine only.");
      wake();
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/api/feedback" && req.method === "GET") {
        const all = await readFeedback(home);
        return send(200, JSON.stringify({ mine: all.filter((f) => f.project === project && f.run === run), rates: agreementRates(all) }), TYPES[".json"]);
      }
      if (url.pathname === "/api/feedback" && req.method === "POST") {
        const origin = req.headers.origin;
        if (origin !== undefined && !hosts.some((h) => origin === `http://${h}`)) return send(403, "Only the page itself can say what you think of it.");
        // JSON only: a page from elsewhere cannot send it without asking first, and nothing here says yes.
        if (!req.headers["content-type"]?.startsWith("application/json")) return send(400, "JSON only.");
        const body = await bodyOf(req, 10_000);
        if (body === null) return send(413, "Too long.");
        const f = JSON.parse(body) as { id?: unknown; agree?: unknown; why?: unknown };
        // The category and the words of the verdict are the page's, never the sender's.
        const verdict = typeof f.id === "string" ? known.get(f.id) : undefined;
        if (!verdict || typeof f.agree !== "boolean" || (f.why !== undefined && (typeof f.why !== "string" || f.why.length > 2000))) return send(400, "A gesture is the id of a verdict on this page, agree true or false, and an optional reason.");
        await addFeedback(home, { project, run, ...verdict, agree: f.agree, ...(f.why ? { why: f.why as string } : {}), at: new Date().toISOString() });
        return send(200, JSON.stringify({ rates: agreementRates(await readFeedback(home)) }), TYPES[".json"]);
      }
      if (req.method !== "GET") return send(405, "No.");
      // The page and its captures, nothing else, judged on the real file: no link leads out of the run folder.
      const file = await realpath(resolve(root, "." + decodeURIComponent(url.pathname === "/" ? "/report.html" : url.pathname))).catch(() => null);
      if (!file || !isInside(file, root) || (file !== join(root, "report.html") && extname(file) !== ".png")) return send(404, "Not here.");
      const data = await readFile(file).catch(() => null);
      if (!data) return send(404, "Not here.");
      res.writeHead(200, { "content-type": TYPES[extname(file)]! }).end(data);
    } catch {
      send(400, "Bad request.");
    }
  });
  server.on("error", (error) => {
    console.error(`Cannot serve the page: ${error.message}`);
    done(1);
  });
  server.listen(port, "127.0.0.1", () => {
    const bound = (server.address() as AddressInfo).port;
    hosts = [`127.0.0.1:${bound}`, `localhost:${bound}`];
    wake();
    const url = `http://127.0.0.1:${bound}/`;
    console.log(`Serving the page at ${url} until you stop it (Ctrl-C), or after ${IDLE_HOURS} hours with no request. What you say of each verdict is kept in ${join(home, "taste")}.`);
    if (open) {
      const [opener, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
      const child = spawn(opener, args as string[], { detached: true, stdio: "ignore" });
      child.on("error", () => console.log(`Could not open it here: open ${url} in a browser.`));
      child.unref();
    }
  });
  return stopped;
}

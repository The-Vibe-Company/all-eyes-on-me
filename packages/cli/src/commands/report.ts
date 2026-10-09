import { execFile, spawn } from "node:child_process";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { parseArgs, promisify } from "node:util";
import { addFeedback, aeomHome, agreementRates, FEEDBACK_CATEGORIES, readFeedback, readRun, resultHtml, RunReportError, type FeedbackCategory } from "@aeom/core";

const REPORT_HELP = `Usage: aeom report [run-dir] [--open] [--serve [--port <n>]]

Writes the page of what a run gave, report.html, in the run's folder
(default: the latest one in .aeom/runs): the direction chosen and why, each
screen and each journey before and after, kept or sent back and why, what still
fails; or « nothing to redo », with what was measured. The page needs no network,
and nothing in it leaves the machine.

With --serve, serves the page on this machine only (127.0.0.1) until stopped,
so each verdict takes « agree » or « disagree » and a reason, kept at once in
~/.aeom/taste/, in words and without any capture. The page shows how often you
agreed with AEOM, by category, over every run.

Options:
  --open        Open the page in the browser
  --serve       Serve the page, and keep what you say of each verdict
  --port <n>    The port to serve on (default: any free one)`;

/** The run folder most recently changed in .aeom/runs. */
export async function latestRun(): Promise<string | null> {
  const root = join(".aeom", "runs");
  const names = await readdir(root).catch(() => [] as string[]);
  const runs = await Promise.all(names.map(async (name) => ({ dir: join(root, name), at: (await stat(join(root, name, "before")).catch(() => null))?.mtimeMs })));
  return runs.filter((r) => r.at !== undefined).sort((a, b) => b.at! - a.at!)[0]?.dir ?? null;
}

export async function runReport(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({ args: argv, allowPositionals: true, options: { open: { type: "boolean" }, serve: { type: "boolean" }, port: { type: "string", default: "0" }, help: { type: "boolean", short: "h" } } });
  if (values.help || positionals.length > 1) {
    console.log(REPORT_HELP);
    return values.help ? 0 : 1;
  }
  const runDir = positionals[0] ?? (await latestRun());
  if (!runDir) {
    console.error(`No run in .aeom/runs: run /aeom first.`);
    return 1;
  }
  const home = aeomHome();
  let html: string;
  try {
    html = resultHtml(await readRun(runDir, basename(runDir)), { rates: agreementRates(await readFeedback(home)) });
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

  if (values.serve) return serve(runDir, home, Number(values.port), values.open === true);
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

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".json": "application/json", ".css": "text/css" };

/** Serves the run's folder on this machine only, and keeps each gesture on a verdict as it is made. */
function serve(runDir: string, home: string, port: number, open: boolean): Promise<number> {
  const root = resolve(runDir);
  const project = process.cwd();
  const run = basename(root);
  const server = createServer(async (req, res) => {
    const send = (status: number, body: string, type = "text/plain; charset=utf-8") => res.writeHead(status, { "content-type": type }).end(body);
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/api/feedback" && req.method === "GET") {
        const all = await readFeedback(home);
        return send(200, JSON.stringify({ mine: all.filter((f) => f.project === project && f.run === run), rates: agreementRates(all) }), TYPES[".json"]);
      }
      if (url.pathname === "/api/feedback" && req.method === "POST") {
        // JSON only: a page from elsewhere cannot send it without asking first, and nothing here says yes.
        if (!req.headers["content-type"]?.startsWith("application/json")) return send(400, "JSON only.");
        let body = "";
        for await (const chunk of req) if ((body += chunk).length > 10_000) return send(413, "Too long.");
        const f = JSON.parse(body) as { id?: unknown; category?: unknown; verdict?: unknown; agree?: unknown; why?: unknown };
        const short = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max;
        if (!short(f.id, 300) || !FEEDBACK_CATEGORIES.includes(f.category as FeedbackCategory) || !short(f.verdict, 300) || typeof f.agree !== "boolean" || (f.why !== undefined && !short(f.why, 2000))) return send(400, "A gesture is an id, a category, a verdict, agree true or false, and an optional reason.");
        await addFeedback(home, { project, run, id: f.id as string, category: f.category as FeedbackCategory, verdict: f.verdict as string, agree: f.agree, ...(f.why ? { why: f.why as string } : {}), at: new Date().toISOString() });
        return send(200, JSON.stringify({ rates: agreementRates(await readFeedback(home)) }), TYPES[".json"]);
      }
      if (req.method !== "GET") return send(405, "No.");
      const file = resolve(root, "." + decodeURIComponent(url.pathname === "/" ? "/report.html" : url.pathname));
      if (file !== root && !file.startsWith(root + sep)) return send(404, "Not here.");
      const data = await readFile(file).catch(() => null);
      if (!data) return send(404, "Not here.");
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(data);
    } catch {
      send(400, "Bad request.");
    }
  });
  return new Promise((done) => {
    server.on("error", (error) => {
      console.error(`Cannot serve the page: ${error.message}`);
      done(1);
    });
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : port}/`;
      console.log(`Serving the page at ${url} until you stop it (Ctrl-C). What you say of each verdict is kept in ${join(home, "taste")}.`);
      if (open) {
        const [opener, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
        const child = spawn(opener, args as string[], { detached: true, stdio: "ignore" });
        child.on("error", () => console.log(`Could not open it here: open ${url} in a browser.`));
        child.unref();
      }
    });
  });
}

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const AEOM = fileURLToPath(new URL("../index.js", import.meta.url));
const run = async (cwd: string, args: string[]) => {
  try {
    const { stdout, stderr } = await promisify(execFile)("node", [AEOM, ...args], { cwd });
    return { code: 0, out: stdout + stderr };
  } catch (error) {
    const e = error as { code: number; stdout: string; stderr: string };
    return { code: e.code, out: e.stdout + e.stderr };
  }
};

let server: Server;
let url: string;

before(async () => {
  // A desktop tool: its link to the orders is hidden on a phone, so the journey breaks there only.
  server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    const viewport = `<meta name="viewport" content="width=device-width, initial-scale=1">`;
    res.end(req.url === "/orders" ? `${viewport}<h1>Commandes</h1>` : `${viewport}<style>@media (max-width: 600px) { nav { display: none } }</style><nav><a href="/orders">Commandes</a></nav><h1>Tri du matin</h1>`);
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  url = `http://localhost:${(server.address() as { port: number }).port}`;
});

after(() => server.close());

const project = async (config: unknown) => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-widths-"));
  await mkdir(join(dir, ".aeom", "journeys"), { recursive: true });
  if (config !== undefined) await writeFile(join(dir, ".aeom", "config.json"), JSON.stringify(config));
  await writeFile(join(dir, ".aeom", "journeys", "see-orders.json"), JSON.stringify({ name: "See the orders", steps: [{ do: "open", path: "/" }, { do: "click", target: { role: "link", name: "Commandes" }, lands: "/orders" }] }));
  return dir;
};

test("the widths the config declares are the only ones captured, checked and replayed: a journey that breaks on a phone alone no longer breaks", async () => {
  const dir = await project({ widths: [1280] });
  try {
    const captured = await run(dir, ["capture", "--url", url, "--pages", "/"]);
    assert.equal(captured.code, 0, captured.out);
    const manifest = JSON.parse(await readFile(join(dir, ".aeom", "captures", "manifest.json"), "utf8"));
    assert.deepEqual(manifest.widths, [1280]);
    assert.deepEqual((await readdir(join(dir, ".aeom", "captures"))).filter((f) => f.includes("@390")), [], "no capture at 390 for a judge to look at");
    const checked = await run(dir, ["check", "--url", url, "--pages", "/"]);
    assert.equal(checked.code, 0, checked.out);
    assert.match(checked.out, /at 1280 px/);
    assert.deepEqual(JSON.parse(await readFile(join(dir, ".aeom", "reports", "check.json"), "utf8")).widths, [1280]);
    // A replay from before the key, at both widths, leaves nothing a judge of the next one would look at.
    assert.equal((await run(dir, ["journey", "--url", url, "--widths", "390,1280"])).code, 1);
    const replayed = await run(dir, ["journey", "--url", url]);
    assert.equal(replayed.code, 0, replayed.out);
    assert.match(replayed.out, /✓ See the orders\s+1280 px/);
    assert.doesNotMatch(replayed.out, /390 px/);
    const left = await readdir(join(dir, ".aeom", "captures", "journeys"));
    assert.deepEqual(left.filter((f) => f.includes("@390")), [], "no replay at 390 left behind");
    assert.ok(left.some((f) => f.includes("@1280")));
    const phone = await run(dir, ["journey", "--url", url, "--widths", "390", "--out", join(dir, "phone")]);
    assert.equal(phone.code, 1, "--widths on the command wins over the config");
    assert.match(phone.out, /✗ See the orders\s+390 px\s+breaks at step 2/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("without widths in the config, a front is measured at 390 and 1280 px, as before", async () => {
  const dir = await project(undefined);
  try {
    const checked = await run(dir, ["check", "--url", url, "--pages", "/"]);
    assert.equal(checked.code, 0, checked.out);
    assert.deepEqual(JSON.parse(await readFile(join(dir, ".aeom", "reports", "check.json"), "utf8")).widths, [390, 1280]);
    const replayed = await run(dir, ["journey", "--url", url]);
    assert.equal(replayed.code, 1, "the journey still breaks on a phone");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an empty list or a width no screen has is refused, in the config and as an option, with what to write instead", async () => {
  for (const widths of [[], [0], [1280.5], [100], [5000], "1280"]) {
    const dir = await project({ widths });
    try {
      const { code, out } = await run(dir, ["check", "--url", url, "--pages", "/"]);
      assert.equal(code, 1, `${JSON.stringify(widths)}: ${out}`);
      assert.match(out, /"widths" lists the widths to measure, in px between 240 and 3840, such as \[1280\] or \[390, 1280\]/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  const dir = await project(undefined);
  try {
    for (const widths of ["", "100", "1280,abc", "5000"]) {
      const { code, out } = await run(dir, ["capture", "--url", url, "--pages", "/", "--widths", widths]);
      assert.equal(code, 1, `--widths ${widths}: ${out}`);
      assert.match(out, /--widths lists the widths to measure, in px between 240 and 3840, such as 1280 or 390,1280/);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

const sheetUsedOn = (used: string) =>
  `# Bruno\n\n## What kind of product\n\`tool\`: a to-do. (seen: /)\n\n## What it is for\nThe morning sort. (seen: /)\n\n## Who uses it\nA team of three. (seen: README.md)\n\n## Where it is used\n${used}\n\n## The main loop\nSort, then meet. (seen: /)\n\n## Key journeys\n\n${["Sort", "Meet", "Close"].map((n) => `### ${n}\nWhy: it. (seen: /)\n1. Open \`/\`.\n`).join("\n")}`;

test("without widths in the config, the platform the product sheet saw gives them; a guess to confirm does not", async () => {
  const dir = await project(undefined);
  try {
    await writeFile(join(dir, ".aeom", "product.md"), sheetUsedOn("`desktop`: the web is for the morning sort; an iOS app serves the phone. (seen: docs/PRD.md)"));
    const replayed = await run(dir, ["journey", "--url", url]);
    assert.equal(replayed.code, 0, replayed.out);
    assert.match(replayed.out, /✓ See the orders\s+1280 px/);
    assert.doesNotMatch(replayed.out, /390 px/);
    assert.match((await run(dir, ["check", "--url", url, "--pages", "/"])).out, /at 1280 px/);
    assert.match((await run(dir, ["estimate", "--screens", "3", "--juger"])).out, /, at 1280 px:/);
    await writeFile(join(dir, ".aeom", "config.json"), JSON.stringify({ widths: [390] }));
    assert.match((await run(dir, ["check", "--url", url, "--pages", "/"])).out, /at 390 px/, "the config wins over the sheet");
    await rm(join(dir, ".aeom", "config.json"));
    await writeFile(join(dir, ".aeom", "product.md"), sheetUsedOn("`desktop`: a back office. (to confirm)"));
    assert.equal((await run(dir, ["journey", "--url", url])).code, 1, "a guess changes nothing: still judged at 390, where it breaks");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom capture and aeom check serve a folder of static pages themselves, with no app and no sign-in", async () => {
  const dir = await project({ url: "http://localhost:1", start: "exit 1", login: { path: "/connexion", account: "nope.json", submit: "Entrer" }, pages: ["/app-only"] });
  try {
    const folder = join(dir, "direction");
    await mkdir(folder);
    await writeFile(join(folder, "index.html"), `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><h1>Accueil</h1><a href="liste.html">Liste</a>`);
    await writeFile(join(folder, "liste.html"), `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><h1>Liste</h1>`);
    const captured = await run(dir, ["capture", "--dir", folder, "--pages", "/,/liste.html", "--widths", "1280", "--out", join(dir, "shots")]);
    assert.equal(captured.code, 0, captured.out);
    const manifest = JSON.parse(await readFile(join(dir, "shots", "manifest.json"), "utf8"));
    assert.deepEqual(manifest.pages.map((p: { path: string }) => p.path), ["/", "/liste.html"]);
    const checked = await run(dir, ["check", "--dir", folder, "--widths", "1280", "--out", join(dir, "reports")]);
    assert.equal(checked.code, 0, checked.out);
    assert.deepEqual(JSON.parse(await readFile(join(dir, "reports", "check.json"), "utf8")).pages.map((u: string) => new URL(u).pathname).sort(), ["/", "/liste.html"], "the folder's own links, not the app's pages");
    // The project's config belongs to its app: its exceptions and its reset never reach a folder of pages.
    await writeFile(join(dir, ".aeom", "config.json"), JSON.stringify({ url: "http://localhost:1", reset: `touch ${join(dir, "reset-ran")}`, except: { "line-length": ["/"] } }));
    await writeFile(join(folder, "index.html"), `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><p style="width:1100px">${"Une ligne bien trop longue pour être lue d'un trait. ".repeat(12)}</p>`);
    const strict = await run(dir, ["check", "--dir", folder, "--pages", "/", "--widths", "1280", "--out", join(dir, "reports2")]);
    assert.equal(strict.code, 1, "the project's exceptions do not hide what fails on the folder");
    assert.match(strict.out, /line-length/);
    await mkdir(join(dir, "journeys"));
    await writeFile(join(dir, "journeys", "open.json"), JSON.stringify({ name: "Open", steps: [{ do: "open", path: "/" }] }));
    const replayed = await run(dir, ["journey", "--dir", folder, "--journeys", join(dir, "journeys"), "--widths", "1280", "--out", join(dir, "replay")]);
    assert.equal(replayed.code, 0, replayed.out);
    assert.equal(existsSync(join(dir, "reset-ran")), false, "the app's reset is not run on a folder of pages");
    assert.match((await run(dir, ["journey", "--dir", folder])).out, /With --dir, say which journeys to replay: --journeys <folder>/);
    const both = await run(dir, ["capture", "--dir", folder, "--url", "http://localhost:1"]);
    assert.equal(both.code, 1);
    assert.match(both.out, /--dir serves a folder: it goes with neither --url nor --start/);
    const missing = await run(dir, ["capture", "--dir", join(dir, "nowhere")]);
    assert.equal(missing.code, 1);
    assert.match(missing.out, /--dir .*nowhere is not a folder/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

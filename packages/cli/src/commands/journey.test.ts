import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
let dir: string;

before(async () => {
  server = createServer((req, res) => {
    if (req.url === "/help") {
      res.writeHead(500);
      return res.end("Internal Server Error");
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(req.url === "/orders" ? "<h1>Mes commandes</h1>" : `<a href="/orders">Commandes</a> <a href="/help">Aide</a>`);
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  url = `http://localhost:${(server.address() as { port: number }).port}`;
  dir = await mkdtemp(join(tmpdir(), "aeom-journey-cli-"));
  await mkdir(join(dir, ".aeom", "journeys"), { recursive: true });
  await writeFile(join(dir, ".aeom", "journeys", "see-my-orders.json"), JSON.stringify({ name: "See my orders", steps: [{ do: "open", path: "/" }, { do: "click", target: { role: "link", name: "Commandes" }, lands: "/orders" }] }));
});

after(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

test("aeom journey replays the journeys in .aeom/journeys and names each one's sheet", async () => {
  const { code, out } = await run(dir, ["journey", "--url", url, "--widths", "390"]);
  assert.equal(code, 0, out);
  assert.match(out, /✓ See my orders\s+390 px\s+2 steps, 2 screens, 0 back/);
  assert.match(out, /\.aeom\/captures\/journeys\/see-my-orders@390\.png/);
  assert.match(out, /No reset command/);
  const plan = await run(dir, ["journey", "--plan"]);
  assert.equal(plan.code, 0, plan.out);
  assert.match(plan.out, /Shared, one worker first, with the navigation: no screen\nSee my orders \(see-my-orders\): \/, \/orders/);
  const empty = await run(dir, ["journey", "--plan", "--out", ""]);
  assert.equal(empty.code, 1);
  assert.match(empty.out, /--out cannot be empty/);
  await writeFile(join(dir, ".aeom", "captures", "journeys", "report.json"), JSON.stringify({ journeys: [{ slug: "x", name: "X" }] }));
  const wrong = await run(dir, ["journey", "--plan"]);
  assert.equal(wrong.code, 1);
  assert.match(wrong.out, /is not a replay of aeom journey to plan from/);
});

test("a journey that breaks makes aeom journey fail, and says at which step and why", async () => {
  await writeFile(join(dir, ".aeom", "journeys", "get-help.json"), JSON.stringify({ name: "Get help", steps: [{ do: "open", path: "/" }, { do: "click", target: { role: "link", name: "Aide" } }] }));
  try {
    const { code, out } = await run(dir, ["journey", "--url", url, "--widths", "390", "--out", join(dir, "out")]);
    assert.equal(code, 1);
    assert.match(out, /✗ Get help\s+390 px\s+breaks at step 2, click link "Aide": the page answered 500/);
  } finally {
    await rm(join(dir, ".aeom", "journeys", "get-help.json"));
  }
});

test("journey files that cannot be replayed are refused before any browser starts", async () => {
  await writeFile(join(dir, ".aeom", "journeys", "bad.json"), JSON.stringify({ name: "Bad", steps: [{ do: "fly" }] }));
  try {
    const { code, out } = await run(dir, ["journey", "--url", url]);
    assert.equal(code, 1);
    assert.match(out, /bad\.json, step 1: unknown action "fly"/);
  } finally {
    await rm(join(dir, ".aeom", "journeys", "bad.json"));
  }
});

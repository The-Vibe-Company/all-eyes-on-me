// The landing says what the code does. These tests fail when the page and
// the code drift apart.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const page = readFileSync(new URL("site/pages/index.html", root), "utf8");
const readme = readFileSync(new URL("README.md", root), "utf8");

function cliCommands() {
  const help = execFileSync("node", [new URL("packages/cli/dist/index.js", root).pathname, "--help"], { encoding: "utf8" });
  const block = help.split("Commands:\n")[1].split("\n\n")[0];
  return new Map(block.split("\n").map((line) => line.trim().match(/^(\S+)\s+(.+)$/).slice(1)));
}

test("the commands on the page are exactly the CLI's, with its words", () => {
  const shown = new Map([...page.matchAll(/<li data-command="([^"]+)"><code>aeom \1<\/code>\s*([^<]+)<\/li>/g)].map(([, name, what]) => [name, what.trim()]));
  assert.deepEqual(shown, cliCommands());
});

test("the roadmap, on the page and in the README, puts the UX layer right after the landing", () => {
  const items = [...page.matchAll(/<li data-stage="([^"]+)">/g)].map(([, stage]) => stage);
  assert.equal(items[items.indexOf("landing") + 1], "ux");
  const roadmap = readme.split("## Roadmap")[1].split("\n## ")[0];
  assert.ok(roadmap.indexOf("**First iteration after V0.**") < roadmap.indexOf("**Then, the UX layer.**"));
  assert.ok(roadmap.indexOf("**Then, the UX layer.**") < roadmap.indexOf("**V1.**"));
});

test("the page links to the repository to star it", () => {
  assert.match(page, /<a [^>]*href="https:\/\/github\.com\/The-Vibe-Company\/all-eyes-on-me"[^>]*>Star on GitHub<\/a>/);
});

async function withSite(run) {
  const port = await new Promise((resolve) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
  const server = spawn("node", [new URL("site/server.mjs", root).pathname], { env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
  try {
    let response;
    for (let i = 0; i < 40 && !response; i++) {
      response = await fetch(`http://localhost:${port}/`).catch(() => new Promise((r) => setTimeout(r, 100)));
    }
    await run(`http://localhost:${port}`, response);
  } finally {
    server.kill();
  }
}

test("the site starts with one command and serves the page", async () => {
  await withSite(async (_, response) => {
    assert.equal(response.status, 200);
    assert.match(await response.text(), /All Eyes On Me/);
  });
});

test("the run that rebuilt the page is kept: six directions, a tournament, before and after", async () => {
  const run = new URL("site/run/", root);
  const tournament = JSON.parse(readFileSync(new URL("directions/tournament.json", run), "utf8"));
  assert.equal(tournament.entrants.length, 6);
  for (const name of tournament.entrants) assert.ok(existsSync(new URL(`directions/${name}.webp`, run)), `${name} has no capture`);
  assert.ok(existsSync(new URL("directions/sheet.webp", run)));
  for (const duel of tournament.duels.filter((d) => d.b)) {
    assert.equal(duel.votes.length, tournament.votesPerDuel, `duel ${duel.id} is not finished`);
    for (const vote of duel.votes) assert.ok(vote.reason.trim(), `a vote on duel ${duel.id} has no reason`);
  }
  for (const side of ["before", "after"]) {
    for (const width of [390, 1280]) assert.ok(existsSync(new URL(`${side}/index@${width}.webp`, run)), `${side} at ${width} px is missing`);
  }
  await withSite(async (url) => {
    const sheet = await fetch(`${url}/run/directions/sheet.webp`);
    assert.equal(sheet.status, 200);
    assert.equal(sheet.headers.get("content-type"), "image/webp");
  });
});

test("the site builds to static files a host serves as is", () => {
  const out = mkdtempSync(join(tmpdir(), "aeom-site-"));
  try {
    execFileSync("node", [new URL("site/build.mjs", root).pathname, out], { stdio: "ignore" });
    const built = readFileSync(join(out, "index.html"), "utf8");
    assert.match(built, /All Eyes On Me/);
    assert.doesNotMatch(built, /<!-- (include|missing partial):/);
    for (const [, href] of built.matchAll(/(?:href|src)="\/((?:shared|run)\/[^"]+)"/g)) {
      assert.ok(existsSync(join(out, href)), `${href} is linked but not built`);
    }
    assert.ok(existsSync(join(out, "shared/kit.css")));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("Vercel builds the site from site/ with that same script", () => {
  const vercel = JSON.parse(readFileSync(new URL("site/vercel.json", root), "utf8"));
  assert.equal(vercel.buildCommand, "node build.mjs");
  assert.equal(vercel.outputDirectory, "dist");
});

test("a partial is inserted as written, even with $ patterns in it", async () => {
  const { insertPartials } = await import(new URL("site/render.mjs", root));
  const html = await insertPartials("<p><!-- include: x --></p>", async () => "costs $& and $' stay");
  assert.equal(html, "<p>costs $& and $' stay</p>");
});

test("the build refuses to empty the site or a folder that holds it", () => {
  for (const out of [new URL("site/", root).pathname, root.pathname]) {
    assert.throws(() => execFileSync("node", [new URL("site/build.mjs", root).pathname, out], { stdio: "pipe" }), /Refusing to build/);
  }
  assert.ok(existsSync(new URL("site/pages/index.html", root)), "nothing was deleted");
});

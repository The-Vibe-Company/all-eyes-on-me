// The landing says what the code does. These tests fail when the page and
// the code drift apart.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
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

test("the commands in the README are exactly the CLI's, with its words", () => {
  const listed = new Map([...readme.matchAll(/^\| `aeom (\S+)` \| (.+?) \|$/gm)].map(([, name, what]) => [name, what.trim()]));
  assert.deepEqual(listed, cliCommands());
});

test("the README and the page say what AEOM is in one sentence, then what works today, apart from what comes", () => {
  const sentence = "All Eyes On Me is the art director of a product coded by agents: it sets the standard of its front, holds every pull request to it, and builds the front that follows it.";
  assert.ok(readme.split("\n").slice(0, 4).join(" ").includes(sentence), "the README opens on the sentence");
  assert.match(page, /the art director of a product coded by agents/i, "the page says what AEOM is, in short");
  const today = readme.split("## What it does today")[1]?.split("\n## ")[0] ?? "";
  const next = readme.split("## What comes next")[1]?.split("\n## ")[0] ?? "";
  assert.ok(today && next, "the README has « What it does today » and « What comes next »");
  assert.ok(readme.indexOf("## What it does today") < readme.indexOf("## What comes next"));
  for (const notYet of [/spend cap/i, /npm/i, /\bCI\b/, /learn/i]) {
    assert.doesNotMatch(today, notYet, `${notYet} is not done: it belongs in « What comes next »`);
    assert.match(next, notYet);
  }
  assert.match(readme, /run on two real projects/i, "the README says how many real projects went through it");
  assert.doesNotMatch(readme + page, /not (yet )?run on a real project/i, "real projects went through it: nothing says the opposite");
});

test("the page links to the repository to star it", () => {
  assert.match(page, /<a [^>]*href="https:\/\/github\.com\/The-Vibe-Company\/all-eyes-on-me"[^>]*>Star on GitHub(?:<span [^>]*data-stars[^>]*><\/span>)?<\/a>/);
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
  await withSite(async (url, response) => {
    assert.equal(response.status, 200);
    assert.match(await response.text(), /All Eyes On Me/);
    const post = await fetch(`${url}/api/stars`, { method: "POST" });
    assert.equal(post.status, 405, "/api/stars only answers GET, like the Vercel function");
    assert.equal(post.headers.get("allow"), "GET");
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

test("the condition report is written from the kept run, not by hand", async () => {
  const { runSection } = await import(new URL("site/run.mjs", root));
  const written = readFileSync(new URL("site/shared/run.html", root), "utf8");
  assert.equal(written, await runSection(), "site/shared/run.html is out of date: run node site/run.mjs");
  const tournament = JSON.parse(readFileSync(new URL("site/run/directions/tournament.json", root), "utf8"));
  for (const slug of tournament.entrants) assert.match(written, new RegExp(`src="/run/directions/${slug}\\.webp"`));
  for (const duel of tournament.duels.filter((d) => d.b)) {
    for (const vote of duel.votes) assert.ok(written.includes(vote.reason.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")), `a reason of duel ${duel.id} is missing`);
  }
  for (const [, src] of written.matchAll(/src="\/(run\/[^"]+)"/g)) assert.ok(existsSync(new URL(`site/${src}`, root)), `${src} does not exist`);
});

test("a partial is inserted as written, even with $ patterns in it", async () => {
  const { insertPartials } = await import(new URL("site/render.mjs", root));
  const html = await insertPartials("<p><!-- include: x --></p>", async () => "costs $& and $' stay");
  assert.equal(html, "<p>costs $& and $' stay</p>");
});

test("the build refuses any folder whose emptying would delete the site", () => {
  // On a copy of the site, so a broken guard can only delete the copy.
  const repo = mkdtempSync(join(tmpdir(), "aeom-guard-"));
  try {
    const site = join(repo, "site");
    cpSync(new URL("site/", root), site, { recursive: true, filter: (src) => !src.includes(`${sep}dist`) });
    symlinkSync(site, join(repo, "alias"));
    const build = (out) => execFileSync("node", [join(site, "build.mjs"), out], { stdio: "pipe" });
    for (const out of [site, repo, join(site, "run"), join(site, "pages"), join(repo, "alias"), join(repo, "alias", "run")]) {
      assert.throws(() => build(out), /Refusing to build/, `${out} is refused`);
    }
    assert.ok(existsSync(join(site, "run/directions/tournament.json")) && existsSync(join(site, "pages/index.html")), "nothing was deleted");
    build(join(site, "dist"));
    assert.ok(existsSync(join(site, "dist/index.html")), "site/dist is still where the site builds");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("the page says the three things AEOM does, the one not built yet marked as coming", () => {
  for (const what of ["It judges your front.", "It redesigns your front.", "It checks every PR against it."]) assert.ok(page.includes(what), `${what} is missing`);
  assert.match(page.split("It checks every PR against it.")[0].split("It redesigns your front.")[1] ?? "", /class="soon"/, "checking every pull request is not built yet: it says so");
  assert.doesNotMatch(page, /before@|looks\//, "no screenshot of a shop: the page explains, it does not show a demo");
  // The prose only: what a drawing shows, such as a terminal's lines, is not read as text to wade through.
  let prose = page.replace(/<(script|style)[\s\S]*?<\/\1>/g, "");
  for (let at = prose.indexOf("data-visual"); at !== -1; at = prose.indexOf("data-visual")) {
    const open = prose.lastIndexOf("<", at);
    const tag = prose.slice(open + 1).match(/^\w+/)[0];
    let depth = 0;
    let end = open;
    for (const m of prose.slice(open).matchAll(new RegExp(`<(/?)${tag}\\b[^>]*>`, "g"))) {
      depth += m[1] ? -1 : 1;
      if (depth === 0) { end = open + m.index + m[0].length; break; }
    }
    prose = prose.slice(0, open) + prose.slice(end);
  }
  const words = prose.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  assert.ok(words.length < 1000, `the page stays short, ${words.length} characters of prose: what does not fit is in the README`);
});

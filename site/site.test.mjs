// The landing says what the code does. These tests fail when the page and
// the code drift apart.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
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

test("the site starts with one command and serves the page", async () => {
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
    assert.equal(response.status, 200);
    assert.match(await response.text(), /All Eyes On Me/);
  } finally {
    server.kill();
  }
});

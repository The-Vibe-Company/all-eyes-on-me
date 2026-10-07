import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const AEOM = fileURLToPath(new URL("../index.js", import.meta.url));
const run = async (args: string[]) => {
  try {
    const { stdout, stderr } = await promisify(execFile)("node", [AEOM, ...args]);
    return { code: 0, out: stdout + stderr };
  } catch (error) {
    const e = error as { code: number; stdout: string; stderr: string };
    return { code: e.code, out: e.stdout + e.stderr };
  }
};

const PRINCIPLES = ["one-direction", "consistent-chrome", "not-generic", "hierarchy", "grid", "density", "states"];

async function setup(voters: string[]) {
  const dir = await mkdtemp(join(tmpdir(), "aeom-judge-cli-"));
  await mkdir(join(dir, "captures"));
  await mkdir(join(dir, "votes"));
  await writeFile(join(dir, "principles.md"), PRINCIPLES.map((id) => `- \`${id}\` — ${id} holds.`).join("\n") + "\n");
  await writeFile(join(dir, "captures", "manifest.json"), JSON.stringify({ url: "x", capturedAt: "", widths: [390], pages: [{ url: "http://x/", path: "/", files: [] }], errors: [] }));
  for (const voter of voters) {
    const verdicts = Object.fromEntries(PRINCIPLES.map((id) => [id, { pass: true, reason: "fine" }]));
    await writeFile(join(dir, "votes", `${voter}.json`), JSON.stringify({ voter, pages: { "/": verdicts } }));
  }
  return dir;
}

test("aeom judge names the voters whose vote is missing", async () => {
  const dir = await setup(["1"]);
  try {
    const { code, out } = await run(["judge", "--captures", join(dir, "captures"), "--votes", join(dir, "votes"), "--out", join(dir, "out"), "--principles", join(dir, "principles.md")]);
    assert.equal(code, 1);
    assert.match(out, /Missing votes from voter 2, 3/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom judge refuses a voter numbered out of range, even when the count is right", async () => {
  const dir = await setup(["1", "2", "4"]);
  try {
    const { code, out } = await run(["judge", "--captures", join(dir, "captures"), "--votes", join(dir, "votes"), "--out", join(dir, "out"), "--principles", join(dir, "principles.md")]);
    assert.equal(code, 1);
    assert.match(out, /Missing votes from voter 3/);
    assert.match(out, /Unexpected voter 4/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom judge refuses to write its verdict into the votes folder", async () => {
  const dir = await setup(["1", "2", "3"]);
  try {
    const { code, out } = await run(["judge", "--captures", join(dir, "captures"), "--votes", join(dir, "votes"), "--out", join(dir, "votes"), "--principles", join(dir, "principles.md")]);
    assert.equal(code, 1);
    assert.match(out, /cannot be the same folder/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom judge passes a page all three voters pass", async () => {
  const dir = await setup(["1", "2", "3"]);
  try {
    const { code, out } = await run(["judge", "--captures", join(dir, "captures"), "--votes", join(dir, "votes"), "--out", join(dir, "out"), "--principles", join(dir, "principles.md")]);
    assert.equal(code, 0, out);
    assert.match(out, /All 7 principles pass on 1 page/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

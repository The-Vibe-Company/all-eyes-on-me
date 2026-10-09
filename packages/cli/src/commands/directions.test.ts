import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
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

test("aeom sheet puts each direction's note under its capture, and refuses a note for a direction it does not show", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-sheet-"));
  try {
    const wrong = await run(dir, ["sheet", "--out", "sheet.png", "tissus=tissus.png", "--note", "plaid=Serves the main loop."]);
    assert.equal(wrong.code, 1);
    assert.match(wrong.out, /A note for plaid, which the sheet does not show/);
    const unsplit = await run(dir, ["sheet", "--out", "sheet.png", "tissus=tissus.png", "--note", "Serves the main loop."]);
    assert.equal(unsplit.code, 1);
    assert.match(unsplit.out, /--note takes <label>=<sentence>/);
    const { code, out } = await run(dir, ["sheet", "--out", "sheet.png", "tissus=tissus.png", "--note", "tissus=Serves the main loop: choose a piece, add it, follow the order."]);
    assert.equal(code, 0, out);
    assert.ok((await stat(join(dir, "sheet.png"))).size > 1000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

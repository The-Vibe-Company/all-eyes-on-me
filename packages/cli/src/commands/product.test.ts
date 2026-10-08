import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

const journey = (name: string) => `### ${name}\nWhy: a visitor wants it. (seen: /)\n1. Open \`/\`.\n2. Click "${name}".\n`;
const sheet = (who = "People buying a gift. (to confirm)", journeys = ["See the products", "See my orders", "Contact the shop"]) =>
  `# Super boutique\n\n## What it is for\nA shop that sells mugs. (seen: /)\n\n## Who uses it\n${who}\n\n## The main loop\nBrowse, order, check. (seen: /produits)\n\n## Key journeys\n\n${journeys.map(journey).join("\n")}`;

async function project() {
  const dir = await mkdtemp(join(tmpdir(), "aeom-product-"));
  return { dir, sheet: join(dir, ".aeom", "product.md"), draft: join(dir, "draft.md") };
}

test("aeom product writes the sheet AEOM drafted into .aeom/product.md", async () => {
  const p = await project();
  try {
    await writeFile(p.draft, sheet());
    const { code, out } = await run(p.dir, ["product", p.draft]);
    assert.equal(code, 0, out);
    assert.equal(await readFile(p.sheet, "utf8"), sheet());
    assert.match(out, /Wrote \.aeom\/product\.md/);
  } finally {
    await rm(p.dir, { recursive: true, force: true });
  }
});

test("an incomplete draft is refused with its problems, and the sheet in place is left as it was", async () => {
  const p = await project();
  try {
    await writeFile(p.draft, sheet());
    await run(p.dir, ["product", p.draft]);
    await writeFile(p.draft, sheet(undefined, ["Only one"]));
    const { code, out } = await run(p.dir, ["product", p.draft]);
    assert.equal(code, 1);
    assert.match(out, /3 to 5 key journeys, found 1/);
    assert.equal(await readFile(p.sheet, "utf8"), sheet(), "the sheet is untouched");
  } finally {
    await rm(p.dir, { recursive: true, force: true });
  }
});

test("a second run keeps what the user corrected and says what changed", async () => {
  const p = await project();
  try {
    await writeFile(p.draft, sheet());
    await run(p.dir, ["product", p.draft]);
    const corrected = (await readFile(p.sheet, "utf8")).replace("People buying a gift. (to confirm)", "Locals, every month. (seen: Antoine)");
    await writeFile(p.sheet, corrected);
    await writeFile(p.draft, sheet(undefined, ["See the products", "See my orders", "Contact the shop", "Find help"]));
    const { code, out } = await run(p.dir, ["product", p.draft]);
    assert.equal(code, 0, out);
    const written = await readFile(p.sheet, "utf8");
    assert.match(written, /Locals, every month/);
    assert.match(written, /### Find help/);
    assert.match(out, /Kept your edits: Who uses it/);
    assert.match(out, /Added: journey "Find help"/);
  } finally {
    await rm(p.dir, { recursive: true, force: true });
  }
});

test("a draft that does not exist is an error, and nothing is written", async () => {
  const p = await project();
  try {
    const { code, out } = await run(p.dir, ["product", p.draft]);
    assert.equal(code, 1);
    assert.match(out, /Cannot read the draft/);
    assert.ok(!existsSync(p.sheet));
  } finally {
    await rm(p.dir, { recursive: true, force: true });
  }
});

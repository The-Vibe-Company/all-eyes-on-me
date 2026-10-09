import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
const put = async (file: string, content: unknown) => {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, typeof content === "string" ? content : JSON.stringify(content));
};
const journey = (slug: string, name: string) => ({ slug, name, runs: [{ width: 1280, steps: [1, 2].map((index) => ({ index, action: `step ${index}`, path: "/", capture: `${slug}@1280-0${index}.png` })), calls: [], screens: ["/"], counts: { steps: 2, screens: 1, back: 0 }, broken: null, sheet: `${slug}@1280.png` }] });
const critique = (failing: Record<string, boolean>) => ({ judgedAt: "", voters: ["1", "2", "3"], principles: [{ id: "result-shown", text: "" }], failures: 0, pages: Object.entries(failing).map(([page, fails]) => ({ page, verdicts: [{ principle: "result-shown", pass: !fails, votes: "", reasons: fails ? ["Ajouter adds nothing."] : [], dissent: [], steps: fails ? [2] : [] }] })) });

test("aeom features names what a blocked journey misses, in the user's words, and keeps it for the result page", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-features-"));
  const R = join(dir, ".aeom", "runs", "run-1");
  try {
    await put(join(R, "journeys-end", "report.json"), { url: "x", replayedAt: "", widths: [1280], warnings: [], journeys: [journey("add", "Add a product"), journey("orders", "See my orders")] });
    await put(join(R, "journeys-end", "judge-journeys.json"), critique({ add: true, orders: false }));
    const ask = await run(dir, ["features", ".aeom/runs/run-1"]);
    assert.equal(ask.code, 1);
    assert.match(ask.out, /Add a product\s+blocks at step 2: Ajouter adds nothing\./);
    assert.match(ask.out, /Say what each one misses, in one sentence and without a technical solution: --missing "add=<sentence>"/);
    const wrong = await run(dir, ["features", ".aeom/runs/run-1", "--missing", "orders=Nothing."]);
    assert.equal(wrong.code, 1);
    assert.match(wrong.out, /See my orders is not blocked/);
    const { code, out } = await run(dir, ["features", ".aeom/runs/run-1", "--missing", "add=A way to put a product in the order."]);
    assert.equal(code, 0, out);
    const saved = JSON.parse(await readFile(join(R, "features.json"), "utf8"));
    assert.deepEqual(saved, { entries: [{ slug: "add", name: "Add a product", step: 2, capture: "journeys-end/add@1280-02.png", why: "Ajouter adds nothing.", missing: "A way to put a product in the order." }], more: 0 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("with no journey blocked, aeom features says so and keeps an empty list", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-features-"));
  const R = join(dir, ".aeom", "runs", "run-2");
  try {
    await put(join(R, "journeys-after", "report.json"), { url: "x", replayedAt: "", widths: [1280], warnings: [], journeys: [journey("orders", "See my orders")] });
    await put(join(R, "journeys-after", "judge-journeys.json"), critique({ orders: false }));
    const { code, out } = await run(dir, ["features", ".aeom/runs/run-2"]);
    assert.equal(code, 0, out);
    assert.match(out, /Every key journey reaches its end: no feature is missing\./);
    assert.deepEqual(JSON.parse(await readFile(join(R, "features.json"), "utf8")), { entries: [], more: 0 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

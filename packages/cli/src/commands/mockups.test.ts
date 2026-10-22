import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const AEOM = fileURLToPath(new URL("../index.js", import.meta.url));
// A capture of the front as it is: one white pixel is enough to lay out.
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", "base64");
const page = (title: string, colour: string, link: string) => `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>body{margin:0;font:16px/1.5 Georgia,serif}main{padding:24px}p{color:${colour}}a{color:#111}</style><main><h1>${title}</h1><p>Les notes de l'équipe.</p><a href="${link}">Suite</a></main>`;

test("aeom mockups captures, lays out and checks every direction of a round in one command, the front as it is first", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-mockups-"));
  try {
    const directions = join(dir, "directions");
    for (const [slug, colour] of [["carnet", "#222"], ["pale", "#ddd"]] as const) {
      await mkdir(join(directions, slug), { recursive: true });
      await writeFile(join(directions, slug, "index.html"), page(slug, colour, "notes.html"));
      await writeFile(join(directions, slug, "notes.html"), page(`${slug} notes`, colour, "index.html"));
    }
    await mkdir(join(directions, "carnet-shots"), { recursive: true });
    await writeFile(join(dir, "now-home.png"), PIXEL);
    const { stdout } = await promisify(execFile)("node", [AEOM, "mockups", directions, "--widths", "390,1280", "--now", `/=${join(dir, "now-home.png")}`, "--note", "carnet=A logbook, ruled and dated."], { cwd: dir, env: { ...process.env, AEOM_HOME: join(dir, ".home"), AEOM_TELEMETRY: "0" } });
    assert.match(stdout, /^2 directions, laid out in \S*sheet\.png, the front as it is first:/, "a folder with no index.html is no direction");
    assert.match(stdout, /carnet +passes every check/);
    assert.match(stdout, /pale +contrast/, "what its checks found, said beside it");
    for (const file of ["sheet.png", "now.png", "carnet.png", "pale.png", "carnet-checks/check.json"]) assert.ok(existsSync(join(directions, file)), file);
    assert.deepEqual(JSON.parse(readFileSync(join(directions, "sheet.json"), "utf8")), [{ label: "now", note: "The front as it is today." }, { label: "carnet", note: "A logbook, ruled and dated." }, { label: "pale" }]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

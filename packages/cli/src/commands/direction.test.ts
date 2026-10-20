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

test("aeom direction keeps the direction chosen in .aeom/direction/, its pages without an image, says it, and forgets it on demand", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-direction-"));
  const run = (args: string[]) => promisify(execFile)("node", [AEOM, ...args], { cwd: dir, env: { ...process.env, AEOM_HOME: join(dir, ".home"), AEOM_TELEMETRY: "0" } }).then((r) => ({ code: 0, out: r.stdout + r.stderr }), (e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, out: e.stdout + e.stderr }));
  try {
    const chosen = join(dir, ".aeom", "runs", "run-20261020-1500", "directions", "carnet-de-bord");
    await mkdir(join(chosen, "img"), { recursive: true });
    await writeFile(join(chosen, "index.html"), "<!doctype html><title>Carnet</title>");
    await writeFile(join(chosen, "style.css"), "body { color: #1f3a2e; }");
    await writeFile(join(chosen, "img", "logo.svg"), "<svg></svg>");
    await writeFile(join(chosen, "shot.png"), "not an image really");

    assert.equal((await run(["direction", "show"])).code, 1, "nothing kept yet");
    const kept = await run(["direction", "keep", chosen, "--sentence", "The logbook a captain keeps, ruled and dated.", "--source", "the front as it is", "--why", "it feels like the boat"]);
    assert.equal(kept.code, 0, kept.out);
    assert.match(kept.out, /Kept carnet-de-bord in \.aeom\/direction\//);
    assert.ok(existsSync(join(dir, ".aeom", "direction", "index.html")) && existsSync(join(dir, ".aeom", "direction", "img", "logo.svg")));
    assert.ok(!existsSync(join(dir, ".aeom", "direction", "shot.png")), "no image a commit would carry: the mockup is its pages");
    const saved = JSON.parse(readFileSync(join(dir, ".aeom", "direction", "direction.json"), "utf8"));
    assert.deepEqual({ ...saved, kept: typeof saved.kept }, { slug: "carnet-de-bord", sentence: "The logbook a captain keeps, ruled and dated.", source: "the front as it is", why: "it feels like the boat", run: "run-20261020-1500", kept: "string" });

    const shown = await run(["direction", "show"]);
    assert.equal(shown.code, 0);
    assert.match(shown.out, /^carnet-de-bord: The logbook a captain keeps, ruled and dated\.\nFrom the front as it is, chosen in run-20261020-1500: it feels like the boat\.\nIts pages: \.aeom\/direction\/index\.html/);

    // Another one replaces it, and says which it replaced.
    const other = join(dir, ".aeom", "runs", "run-20261020-1600", "directions", "atelier");
    await mkdir(other, { recursive: true });
    await writeFile(join(other, "index.html"), "<!doctype html><title>Atelier</title>");
    const replaced = await run(["direction", "keep", other, "--sentence", "A workshop's bench.", "--source", "the prompt"]);
    assert.match(replaced.out, /replaces carnet-de-bord/);
    assert.ok(!existsSync(join(dir, ".aeom", "direction", "style.css")), "nothing of the one before is left");

    assert.equal((await run(["direction", "keep", join(dir, "nowhere"), "--sentence", "x", "--source", "y"])).code, 1, "a folder that is not there");
    assert.equal((await run(["direction", "drop"])).code, 0);
    assert.ok(!existsSync(join(dir, ".aeom", "direction")));
    assert.equal((await run(["direction", "show"])).code, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

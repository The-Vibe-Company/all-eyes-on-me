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

test("aeom direction keeps the direction chosen in .aeom/direction/, its pages and the images generated for it, says it, and forgets it on demand", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-direction-"));
  const run = (args: string[]) => promisify(execFile)("node", [AEOM, ...args], { cwd: dir, env: { ...process.env, AEOM_HOME: join(dir, ".home"), AEOM_TELEMETRY: "0" } }).then((r) => ({ code: 0, out: r.stdout + r.stderr }), (e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, out: e.stdout + e.stderr }));
  try {
    const chosen = join(dir, ".aeom", "runs", "run-20261020-1500", "directions", "carnet-de-bord");
    await mkdir(join(chosen, "img"), { recursive: true });
    await writeFile(join(chosen, "index.html"), "<!doctype html><title>Carnet</title>");
    await writeFile(join(chosen, "style.css"), "body { color: #1f3a2e; }");
    await writeFile(join(chosen, "img", "logo.svg"), "<svg></svg>");
    await writeFile(join(chosen, "img", "hero.png"), "an illustration generated for it");
    await mkdir(`${chosen}-shots`, { recursive: true });
    await writeFile(join(`${chosen}-shots`, "x.png"), "a capture");

    assert.equal((await run(["direction", "show"])).code, 1, "nothing kept yet");
    const kept = await run(["direction", "keep", chosen, "--sentence", "The logbook a captain keeps, ruled and dated.", "--source", "the front as it is", "--why", "it feels like the boat"]);
    assert.equal(kept.code, 0, kept.out);
    assert.match(kept.out, /Kept carnet-de-bord in \.aeom\/direction\//);
    assert.ok(existsSync(join(dir, ".aeom", "direction", "index.html")) && existsSync(join(dir, ".aeom", "direction", "img", "logo.svg")));
    assert.ok(existsSync(join(dir, ".aeom", "direction", "img", "hero.png")), "the images generated for it are the direction's too");
    assert.match(readFileSync(join(dir, ".aeom", "direction", ".gitignore"), "utf8"), /^\*\.png$/m, "and they stay on this machine");
    assert.ok(!existsSync(join(dir, ".aeom", "direction", "x.png")), "its captures, beside its folder, stay in the run");
    const saved = JSON.parse(readFileSync(join(dir, ".aeom", "direction", "direction.json"), "utf8"));
    assert.deepEqual({ ...saved, kept: typeof saved.kept }, { slug: "carnet-de-bord", sentence: "The logbook a captain keeps, ruled and dated.", source: "the front as it is", why: "it feels like the boat", run: "run-20261020-1500", kept: "string" });

    const shown = await run(["direction", "show"]);
    assert.equal(shown.code, 0);
    assert.match(shown.out, /^carnet-de-bord: The logbook a captain keeps, ruled and dated\.\nFrom the front as it is, chosen in run-20261020-1500: it feels like the boat\.\nIts pages: \/\S*\/\.aeom\/direction\/index\.html/, "absolute, for a worker in another folder");
    assert.equal((await run(["direction", "keep", join(dir, ".aeom", "direction"), "--sentence", "x", "--source", "y"])).code, 1, "never kept over itself");
    assert.ok(existsSync(join(dir, ".aeom", "direction", "index.html")), "and still there");

    // Another one replaces it, and says which it replaced.
    const other = join(dir, ".aeom", "runs", "run-20261020-1600", "directions", "atelier");
    await mkdir(other, { recursive: true });
    await writeFile(join(other, "index.html"), "<!doctype html><title>Atelier</title>");
    const replaced = await run(["direction", "keep", other, "--sentence", "A workshop's bench.", "--source", "the prompt"]);
    assert.match(replaced.out, /replaces carnet-de-bord/);
    assert.ok(!existsSync(join(dir, ".aeom", "direction", "style.css")), "nothing of the one before is left");

    assert.equal((await run(["direction", "keep", join(dir, "nowhere"), "--sentence", "x", "--source", "y"])).code, 1, "a folder that is not there");

    // A run builds on it: written in the run as the person's choice, then marked, so no later run builds on it again.
    const redo = join(dir, ".aeom", "runs", "run-20261021-0900");
    await mkdir(redo, { recursive: true });
    const used = await run(["direction", "use", "--run", redo]);
    assert.equal(used.code, 0, used.out);
    const tournament = JSON.parse(readFileSync(join(redo, "directions", "tournament.json"), "utf8"));
    assert.deepEqual([tournament.entrants, tournament.decision.applied, tournament.decision.judges], [["atelier"], "atelier", null]);
    assert.match(tournament.decision.why, /^chosen with \/aeom directions in run-20261020-1600, from the prompt/);
    assert.deepEqual(JSON.parse(readFileSync(join(redo, "directions", "sheet.json"), "utf8")), [{ label: "atelier", note: "A workshop's bench." }]);
    const after = await run(["direction", "show"]);
    assert.equal(after.code, 2, "already built on");
    assert.match(after.out, /Already built on, in run-20261021-0900/);
    assert.equal((await run(["direction", "use", "--run", redo])).code, 1, "not twice");
    assert.equal((await run(["direction", "drop"])).code, 0);
    assert.ok(!existsSync(join(dir, ".aeom", "direction")));
    assert.equal((await run(["direction", "show"])).code, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom direction keep reads the sentence in the direction's direction.json, keeps all it says, and show says its structure", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-direction-"));
  const run = (args: string[]) => promisify(execFile)("node", [AEOM, ...args], { cwd: dir, env: { ...process.env, AEOM_HOME: join(dir, ".home"), AEOM_TELEMETRY: "0" } }).then((r) => ({ code: 0, out: r.stdout + r.stderr }), (e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, out: e.stdout + e.stderr }));
  try {
    const chosen = join(dir, ".aeom", "runs", "run-20261119-1000", "directions", "billet");
    await mkdir(chosen, { recursive: true });
    await writeFile(join(chosen, "index.html"), "<!doctype html><title>Billet</title>");
    const angle = { from: "Un billet en euros", sentence: "Chaque chiffre imprimé comme un billet : l'« affluence » d'un mois.", structure: "Les chiffres en bandes, le tableau dessous.", dense: "affluence.html", seen: "Des fonds pastel. Les chiffres du mois en grand.", closest: "Kraft paper: no stamp keeps it apart." };
    await writeFile(join(chosen, "direction.json"), JSON.stringify(angle));
    const kept = await run(["direction", "keep", chosen, "--source", "the front as it is"]);
    assert.equal(kept.code, 0, kept.out);
    const saved = JSON.parse(readFileSync(join(dir, ".aeom", "direction", "direction.json"), "utf8"));
    assert.deepEqual({ ...saved, kept: typeof saved.kept }, { ...angle, slug: "billet", source: "the front as it is", run: "run-20261119-1000", kept: "string" }, "the sentence from the file, and all it says kept");
    const shown = await run(["direction", "show"]);
    assert.match(shown.out, /^billet: Chaque chiffre imprimé comme un billet : l'« affluence » d'un mois\.\nStructure: Les chiffres en bandes, le tableau dessous\.\nFrom the front as it is, chosen in run-20261119-1000\./);
    // --sentence still says it when the person's words change it.
    const said = await run(["direction", "keep", chosen, "--source", "the front as it is", "--sentence", "Le billet, en plus sobre."]);
    assert.equal(said.code, 0, said.out);
    assert.equal(JSON.parse(readFileSync(join(dir, ".aeom", "direction", "direction.json"), "utf8")).sentence, "Le billet, en plus sobre.");
    // No sentence anywhere: refused, as before.
    const bare = join(dir, ".aeom", "runs", "run-20261119-1000", "directions", "quai");
    await mkdir(bare, { recursive: true });
    await writeFile(join(bare, "index.html"), "<!doctype html>");
    const refused = await run(["direction", "keep", bare, "--source", "the front as it is"]);
    assert.equal(refused.code, 1);
    assert.match(refused.out, /no sentence: give --sentence, or write it in its direction\.json/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

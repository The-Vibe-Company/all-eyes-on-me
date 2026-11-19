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
    // A round that names its directions takes those alone: an earlier round in the folder is not this one.
    const env = { ...process.env, AEOM_HOME: join(dir, ".home"), AEOM_TELEMETRY: "0" };
    const one = await promisify(execFile)("node", [AEOM, "mockups", directions, "carnet", "--widths", "1280"], { cwd: dir, env });
    assert.match(one.stdout, /^1 direction, laid out in/);
    const bad = (args: string[]) => promisify(execFile)("node", [AEOM, "mockups", directions, ...args], { cwd: dir, env }).then(() => 0, (e: { code: number }) => e.code);
    assert.equal(await bad(["--now", "nowhere.png"]), 1, "a capture of the front with no route");
    assert.equal(await bad(["--now", "/=missing.png"]), 1, "a capture that is not there");
    assert.equal(await bad(["--note", "ailleurs=x"]), 1, "a note for no direction of the round");
    assert.equal(await bad(["absent"]), 1, "a slug with no folder");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// A PNG's height, from its header.
const height = (file: string) => readFileSync(file).readUInt32BE(20);

test("aeom mockups lays a round out three directions to a sheet, the front as it is first on each, and gives the screening judge each direction's own image", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-mockups-"));
  try {
    const directions = join(dir, "directions");
    const slugs = ["ardoise", "baie", "craie", "dune"];
    for (const slug of slugs) {
      await mkdir(join(directions, slug), { recursive: true });
      await writeFile(join(directions, slug, "index.html"), page(slug, "#222", "notes.html"));
      await writeFile(join(directions, slug, "notes.html"), page(`${slug} notes`, "#222", "index.html"));
    }
    await writeFile(join(dir, "now-home.png"), PIXEL);
    const env = { ...process.env, AEOM_HOME: join(dir, ".home"), AEOM_TELEMETRY: "0" };
    const { stdout } = await promisify(execFile)("node", [AEOM, "mockups", directions, "--widths", "1280", "--now", `/=${join(dir, "now-home.png")}`], { cwd: dir, env });
    assert.match(stdout, /^4 directions, three to a sheet, laid out in \S*sheet\.png and \S*sheet-2\.png, the front as it is first on each:/);
    assert.ok(!existsSync(join(directions, "sheet-3.png")));
    const second = height(join(directions, "sheet-2.png"));
    assert.ok(second < height(join(directions, "sheet.png")), "the second sheet holds the front as it is and the fourth direction alone");
    // A sheet of several directions is shrunk out of reading for a model: the judge reads each one whole.
    assert.ok(stdout.split("\n").includes(`For the screening judge, one image each: ${["now", ...slugs].map((s) => join(directions, `${s}.png`)).join(", ")}`), stdout);
    assert.deepEqual(JSON.parse(readFileSync(join(directions, "sheet.json"), "utf8")).map((i: { label: string }) => i.label), ["now", ...slugs], "every direction of the round is said, whatever its sheet");
    // Without the front as it is, the second sheet is shorter: it was on that sheet too.
    await promisify(execFile)("node", [AEOM, "mockups", directions, ...slugs, "--widths", "1280"], { cwd: dir, env });
    assert.ok(height(join(directions, "sheet-2.png")) < second, "the front as it is heads the second sheet too");
    // A later round of two leaves no sheet of the earlier one to be shown by mistake.
    const again = await promisify(execFile)("node", [AEOM, "mockups", directions, "ardoise", "baie", "--widths", "1280"], { cwd: dir, env });
    assert.match(again.stdout, /^2 directions, laid out in \S*sheet\.png:/);
    assert.ok(again.stdout.split("\n").includes(`For the screening judge, one image each: ${join(directions, "ardoise.png")}, ${join(directions, "baie.png")}`), again.stdout);
    assert.ok(!existsSync(join(directions, "sheet-2.png")), "the earlier round's second sheet is gone");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a direction redrawn that no longer opens keeps no image of an earlier round, so the judge, the sheet and the comparison speak of the same directions; a direction cannot take the name of the front or of a sheet", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-mockups-"));
  try {
    const directions = join(dir, "directions");
    for (const slug of ["lutrin", "classique"]) {
      await mkdir(join(directions, slug), { recursive: true });
      await writeFile(join(directions, slug, "index.html"), page(slug, "#222", "notes.html"));
    }
    await writeFile(join(directions, "lutrin", "notes.html"), page("lutrin notes", "#222", "index.html"));
    // The classic redrawn, broken: its second page cannot be read. Its capture of the earlier round is still there.
    await mkdir(join(directions, "classique", "notes.html"));
    await writeFile(join(directions, "classique.png"), PIXEL);
    await mkdir(join(directions, "classique-shots"), { recursive: true });
    await writeFile(join(directions, "classique-shots", "manifest.json"), JSON.stringify({ pages: [{ path: "/", files: [{ width: 1280, file: "old.png" }] }, { path: "/notes.html", files: [{ width: 1280, file: "old.png" }] }] }));
    const env = { ...process.env, AEOM_HOME: join(dir, ".home"), AEOM_TELEMETRY: "0" };
    const { stdout } = await promisify(execFile)("node", [AEOM, "mockups", directions, "--widths", "1280"], { cwd: dir, env });
    assert.match(stdout, /classique +did not open, left out/);
    assert.ok(!existsSync(join(directions, "classique.png")), "the earlier round's image is not shown as this one's");
    assert.ok(stdout.split("\n").includes(`For the screening judge, one image each: ${join(directions, "lutrin.png")}`), stdout);
    // The judge compares what it was given, and the comparison takes it.
    const said = { strong: "The list reads first.", weak: "A heavy header.", fit: "A town hall's desk." };
    await writeFile(join(directions, "screening-1.json"), JSON.stringify({ out: {}, compare: { lutrin: said }, start: { source: "lutrin", why: "the list reads first." } }));
    await promisify(execFile)("node", [AEOM, "tournament", "compare", "--dir", directions, "--from", join(directions, "screening-1.json")], { cwd: dir, env });

    for (const reserved of ["now", "sheet", "sheet-2"]) {
      await mkdir(join(directions, reserved), { recursive: true });
      await writeFile(join(directions, reserved, "index.html"), page(reserved, "#222", "index.html"));
      const refused = await promisify(execFile)("node", [AEOM, "mockups", directions, "lutrin", reserved, "--widths", "1280"], { cwd: dir, env }).then(() => null, (e: { code: number; stderr: string }) => e);
      assert.equal(refused?.code, 1, reserved);
      assert.match(refused!.stderr, new RegExp(`${reserved}: a direction cannot be named now, sheet or sheet-<n>`));
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom mockups reads each direction's sentence, structure and dense page in its direction.json, so nothing is retyped in the shell, and says what it could not read", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-mockups-"));
  try {
    const directions = join(dir, "directions");
    const put = async (slug: string, pages: string[], angle?: unknown) => {
      await mkdir(join(directions, slug), { recursive: true });
      for (const p of pages) await writeFile(join(directions, slug, p), page(`${slug} ${p}`, "#222", p === "index.html" ? pages[1]! : "index.html"));
      if (angle !== undefined) await writeFile(join(directions, slug, "direction.json"), typeof angle === "string" ? angle : JSON.stringify(angle));
    };
    // billet names its dense page, which a page a worker left behind sorts before.
    await put("billet", ["index.html", "affluence.html", "aaa-brouillon.html"], { from: "Un billet en euros", sentence: "Chaque chiffre imprimé comme un billet : l'« affluence » d'un mois.", structure: "Les chiffres en bandes, le tableau dessous.", dense: "affluence.html" });
    // quai names a page it did not draw: its other page is captured, and it is said.
    await put("quai", ["index.html", "registre.html"], { sentence: "Le tableau des départs d'une gare.", structure: "Une file lue de gauche à droite.", dense: "absent.html" });
    // gare wrote none, and lune one with no sentence: no sentence under them, said. A --note still wins over a file.
    await put("gare", ["index.html", "notes.html"]);
    await put("lune", ["index.html", "notes.html"], { from: "La lune", structure: "Un seul écran." });
    await put("piste", ["index.html", "notes.html"], { sentence: "Une piste, dite dans le fichier.", structure: "Des couloirs." });
    const env = { ...process.env, AEOM_HOME: join(dir, ".home"), AEOM_TELEMETRY: "0" };
    const { stdout } = await promisify(execFile)("node", [AEOM, "mockups", directions, "--widths", "1280", "--note", "piste=Une piste d'athlétisme."], { cwd: dir, env });
    assert.deepEqual(JSON.parse(readFileSync(join(directions, "sheet.json"), "utf8")), [
      { label: "billet", note: "Chaque chiffre imprimé comme un billet : l'« affluence » d'un mois. Structure: Les chiffres en bandes, le tableau dessous." },
      { label: "gare" },
      { label: "lune" },
      { label: "piste", note: "Une piste d'athlétisme." },
      { label: "quai", note: "Le tableau des départs d'une gare. Structure: Une file lue de gauche à droite." },
    ]);
    const shot = JSON.parse(readFileSync(join(directions, "billet-shots", "manifest.json"), "utf8")) as { pages: { path: string }[] };
    assert.deepEqual(shot.pages.map((p) => p.path), ["/", "/affluence.html"], "the dense page it names, not the first by name");
    assert.match(stdout, /quai +.*; its dense page, absent\.html, is not in its folder: registre\.html captured instead/);
    assert.match(stdout, /gare +.*; no sentence under it: no direction\.json in its folder/);
    assert.match(stdout, /lune +.*; no sentence under it: its direction\.json gives none/);
    assert.doesNotMatch(stdout, /(billet|piste) +.*no sentence/);
    // A direction.json it cannot read stops the round before anything is captured, and names it.
    const before = readFileSync(join(directions, "billet.png"));
    await writeFile(join(directions, "quai", "direction.json"), `{ "sentence": "Le tableau`);
    const broken = await promisify(execFile)("node", [AEOM, "mockups", directions, "--widths", "1280"], { cwd: dir, env }).then(() => null, (e: { code: number; stderr: string }) => e);
    assert.equal(broken?.code, 1);
    assert.match(broken!.stderr, /quai\/direction\.json is not a JSON object/);
    assert.ok(readFileSync(join(directions, "billet.png")).equals(before), "nothing captured again");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

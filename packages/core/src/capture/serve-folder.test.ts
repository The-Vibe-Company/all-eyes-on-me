import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { serveFolder } from "./index.js";

test("a folder of static pages is served as a site: its index at /, its pages, its styles, nothing outside it", async () => {
  const root = await mkdtemp(join(tmpdir(), "aeom-serve-"));
  const dir = join(root, "nuancier");
  await mkdir(join(dir, "liste"), { recursive: true });
  await writeFile(join(dir, "index.html"), `<link rel="stylesheet" href="style.css"><h1>Accueil</h1><a href="liste.html">Liste</a>`);
  await writeFile(join(dir, "liste.html"), `<h1>Liste</h1>`);
  await writeFile(join(dir, "liste", "index.html"), `<h1>Liste, en dossier</h1>`);
  await writeFile(join(dir, "style.css"), `h1 { color: #333 }`);
  await writeFile(join(root, "secret.txt"), "not served");
  const served = await serveFolder(dir);
  try {
    const get = async (path: string) => {
      const res = await fetch(served.url + path);
      return { status: res.status, type: res.headers.get("content-type") ?? "", text: await res.text() };
    };
    assert.match((await get("/")).text, /Accueil/);
    assert.match((await get("/")).type, /^text\/html/);
    assert.match((await get("/liste.html")).text, /<h1>Liste<\/h1>/);
    assert.match((await get("/liste/")).text, /en dossier/);
    const index = await fetch(`${served.url}/index.html`, { redirect: "manual" });
    assert.deepEqual([index.status, index.headers.get("location")], [301, "/"], "index.html and / are one page");
    assert.match((await get("/style.css")).type, /^text\/css/);
    assert.equal((await get("/nope.html")).status, 404);
    assert.equal((await get("/../secret.txt")).status, 404);
    assert.equal((await get("/%2e%2e/secret.txt")).status, 404);
  } finally {
    await served.stop();
    await rm(root, { recursive: true, force: true });
  }
});

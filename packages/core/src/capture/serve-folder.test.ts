import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
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
  await mkdir(join(dir, "日本"));
  await writeFile(join(dir, "日本", "index.html"), `<h1>Japon</h1>`);
  await symlink(join(root, "secret.txt"), join(dir, "lien.txt"));
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
    const japan = await fetch(`${served.url}/${encodeURI("日本")}/index.html?vue=1`, { redirect: "manual" });
    assert.deepEqual([japan.status, japan.headers.get("location")], [301, `/${encodeURI("日本")}/?vue=1`], "a folder of any name, and the query kept");
    const bare = await fetch(`${served.url}/liste`, { redirect: "manual" });
    assert.deepEqual([bare.status, bare.headers.get("location")], [301, "/liste/"], "a folder without its slash, so its links resolve in it");
    assert.equal((await get("/lien.txt")).status, 404, "a link inside the folder to a file outside it is not followed");
    assert.equal((await get("/%0d%0a/index.html")).status, 404, "a path no header can carry does not stop the server");
    assert.match((await get("/")).text, /Accueil/, "and it still answers");
    assert.match((await get("/style.css")).type, /^text\/css/);
    assert.equal((await get("/nope.html")).status, 404);
    assert.equal((await get("/../secret.txt")).status, 404);
    assert.equal((await get("/%2e%2e/secret.txt")).status, 404);
  } finally {
    await served.stop();
    await rm(root, { recursive: true, force: true });
  }
});

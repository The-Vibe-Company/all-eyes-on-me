import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { AppStartError, capture, normalize, slug, startApp, type RunningApp } from "./index.js";

const UGLY_APP = fileURLToPath(new URL("../../../../examples/ugly-app/server.mjs", import.meta.url));

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer().listen(0, () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

describe("capture on the ugly app", () => {
  let app: RunningApp;
  let url: string;
  let outDir: string;

  before(async () => {
    const port = await freePort();
    url = `http://localhost:${port}`;
    outDir = await mkdtemp(join(tmpdir(), "aeom-capture-"));
    app = await startApp(`PORT=${port} node "${UGLY_APP}"`, url);
  });

  after(async () => {
    await app?.stop();
    await rm(outDir, { recursive: true, force: true });
  });

  test("finds the four pages, reports the broken link, writes two screenshots per page", async () => {
    const manifest = await capture({ url, outDir });
    assert.deepEqual(manifest.pages.map((p) => p.path).sort(), ["/", "/commandes", "/contact", "/produits"]);
    assert.equal(manifest.errors.length, 1);
    assert.equal(manifest.errors[0]!.status, 500);
    for (const page of manifest.pages) {
      assert.deepEqual(page.files.map((f) => f.width), [390, 1280]);
      for (const { file } of page.files) assert.ok(existsSync(join(outDir, file)), `${file} exists`);
    }
    assert.ok(existsSync(join(outDir, "manifest.json")));
  });

  test("captures only the pages it is given", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aeom-capture-only-"));
    try {
      const manifest = await capture({ url, outDir: dir, paths: ["/produits"], widths: [390] });
      assert.deepEqual(manifest.pages.map((p) => p.path), ["/produits"]);
      assert.ok(existsSync(join(dir, "produits@390.png")));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("refuses to start a second app where one already answers", async () => {
    await assert.rejects(startApp("node -e 0", url), AppStartError);
  });
});

test("an app that exits early is reported with its exit code", async () => {
  const port = await freePort();
  await assert.rejects(startApp(`node -e "process.exit(3)"`, `http://localhost:${port}`), /exited with code 3/);
});

test("one page has one URL", () => {
  assert.equal(normalize("http://x.test/produits/#top"), "http://x.test/produits");
  assert.equal(normalize("mailto:a@b.c"), null);
  assert.equal(slug("http://x.test/"), "index");
  assert.equal(slug("http://x.test/a/b?x=1"), "a-b-x-1");
});

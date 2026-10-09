import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { AppStartError, capture, normalize, signIn, SignInError, slug, startApp, type RunningApp } from "./index.js";

const UGLY_APP = fileURLToPath(new URL("../../../../examples/ugly-app/server.mjs", import.meta.url));
const ACCOUNT: Record<string, string> = JSON.parse(readFileSync(new URL("../../../../examples/ugly-app/fixtures/compte.json", import.meta.url), "utf8"));
const SIGN_IN = { path: "/connexion", account: ACCOUNT, submit: "Se connecter" };

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
    const browser = await chromium.launch();
    const signedIn = await signIn(browser, url, SIGN_IN).finally(() => browser.close());
    const manifest = await capture({ url, outDir, signedIn });
    assert.deepEqual(manifest.pages.map((p) => p.path).sort(), ["/", "/commandes", "/contact", "/produits"]);
    assert.equal(manifest.errors.length, 1);
    assert.equal(manifest.errors[0]!.status, 500);
    for (const page of manifest.pages) {
      assert.deepEqual(page.files.map((f) => f.width), [390, 1280]);
      for (const { file } of page.files) assert.ok(existsSync(join(outDir, file)), `${file} exists`);
    }
    assert.ok(existsSync(join(outDir, "manifest.json")));
    const home = manifest.pages.find((p) => p.path === "/")!;
    assert.deepEqual(home.identity.fonts, ["Comic Sans MS"], "the fonts the page sets its text in");
    assert.ok(home.identity.palette.includes("#8e2de2") && home.identity.palette.includes("#4a00e0"), "the gradient's colours are in the palette");
    assert.equal(home.identity.logo, "✨ Super Boutique ✨");
  });

  test("signed out, the orders page leads to signing in, and that is what gets captured", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aeom-capture-out-"));
    try {
      const manifest = await capture({ url, outDir: dir, widths: [390] });
      assert.deepEqual(manifest.pages.map((p) => p.path).sort(), ["/", "/connexion", "/contact", "/produits"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("a refused account stops the sign-in with a message that holds no value", async () => {
    const browser = await chromium.launch();
    try {
      const wrong = { ...SIGN_IN, account: { ...ACCOUNT, "Mot de passe": "not-the-password-xyz" } };
      await assert.rejects(signIn(browser, url, wrong), (error: unknown) => {
        assert.ok(error instanceof SignInError);
        assert.match(error.message, /stayed on \/connexion after "Se connecter"/);
        assert.doesNotMatch(error.message, /not-the-password-xyz|client@example\.test/);
        return true;
      });
      await assert.rejects(signIn(browser, url, { ...SIGN_IN, account: { Identifiant: "x" } }), /no single field labelled "Identifiant"/);
    } finally {
      await browser.close();
    }
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

  test("given routes that fail or leave the app are reported, not captured", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aeom-capture-only-"));
    try {
      const manifest = await capture({ url, outDir: dir, paths: ["/produits", "/aide", "https://example.com/"], widths: [390] });
      assert.deepEqual(manifest.pages.map((p) => p.path), ["/produits"]);
      assert.deepEqual(manifest.errors.map((e) => e.status ?? e.reason), [500, `not on ${new URL(url).origin}`]);
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

test("links to files, such as an image or a PDF, are not pages", async () => {
  const files: Record<string, [string, string]> = {
    "/": ["text/html; charset=utf-8", `<a href="/shot.webp">shot</a> <a href="/guide.pdf">guide</a> <a href="/about">about</a>`],
    "/about": ["text/html", "<p>About</p>"],
    "/shot.webp": ["image/webp", "RIFF"],
    "/guide.pdf": ["application/pdf", "%PDF"],
  };
  const server = createHttpServer((req, res) => {
    const [type, body] = files[req.url ?? "/"] ?? ["text/plain", "Not Found"];
    res.writeHead(files[req.url ?? "/"] ? 200 : 404, { "content-type": type });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const url = `http://localhost:${(server.address() as { port: number }).port}`;
  const dir = await mkdtemp(join(tmpdir(), "aeom-capture-files-"));
  try {
    const found = await capture({ url, outDir: dir, widths: [390] });
    assert.deepEqual(found.pages.map((p) => p.path).sort(), ["/", "/about"]);
    assert.deepEqual(found.errors, []);
    const given = await capture({ url, outDir: dir, widths: [390], paths: ["/", "/shot.webp", "/guide.pdf"] });
    assert.deepEqual(given.pages.map((p) => p.path), ["/"]);
    assert.deepEqual(given.errors.map((e) => e.reason), ["not a page: image/webp", "not a page: a download"]);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("what loads on scroll, such as a lazy image far down, is loaded before the screenshot", async () => {
  const asked: string[] = [];
  const server = createHttpServer((req, res) => {
    asked.push(req.url ?? "");
    if (req.url === "/far.svg") {
      res.writeHead(200, { "content-type": "image/svg+xml" });
      res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>`);
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<div style="height: 4000px">Top</div><img loading="lazy" src="/far.svg" alt="" width="10" height="10">`);
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const url = `http://localhost:${(server.address() as { port: number }).port}`;
  const dir = await mkdtemp(join(tmpdir(), "aeom-capture-lazy-"));
  try {
    await capture({ url, outDir: dir, widths: [390], paths: ["/"] });
    assert.ok(asked.includes("/far.svg"), "the lazy image was requested");
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

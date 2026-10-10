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
import { AppStartError, capture, MAX_CAPTURE_HEIGHT, normalize, pinFixed, signIn, SignInError, slug, startApp, type RunningApp } from "./index.js";
import { checkSite } from "../checks/index.js";

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

/** Serves pages from a table, each a function of the request. */
async function serve(routes: Record<string, (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void>) {
  const server = createHttpServer((req, res) => {
    const handle = routes[(req.url ?? "/").split("?")[0]!];
    if (handle) return handle(req, res);
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not Found");
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return { server, url: `http://localhost:${(server.address() as { port: number }).port}` };
}
const html = (body: string) => (_: unknown, res: import("node:http").ServerResponse) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><title>t</title>${body}`);
};

/** The colour of one pixel of a PNG, read in a browser. */
async function pixel(file: string, x: number, y: number): Promise<string> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const data = readFileSync(file).toString("base64");
    return await page.evaluate(
      async ({ data, x, y }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(img, 0, 0);
        const [r, g, b] = context.getImageData(x, y, 1, 1).data;
        return `${r},${g},${b}`;
      },
      { data, x, y },
    );
  } finally {
    await browser.close();
  }
}

test("a page whose network never goes quiet, as Next.js keeps it in development, is still captured and checked, after a bounded wait", async () => {
  const { server, url } = await serve({
    "/": html(`<p>Foyer</p><script>fetch('/stream')</script>`),
    // Never answers: the network never goes quiet.
    "/stream": () => {},
  });
  const dir = await mkdtemp(join(tmpdir(), "aeom-capture-busy-"));
  try {
    const started = Date.now();
    const manifest = await capture({ url, outDir: dir, widths: [390], paths: ["/"] });
    assert.deepEqual(manifest.pages.map((p) => p.path), ["/"]);
    assert.deepEqual(manifest.errors, []);
    const report = await checkSite({ url, widths: [390], paths: ["/"] });
    assert.deepEqual(report.errors, []);
    assert.ok(Date.now() - started < 25_000, "each page waits a few seconds at most");
  } finally {
    server.closeAllConnections();
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("in a full-page capture, a bar fixed to the bottom of the window is drawn at the end of the page, not in the middle", async () => {
  const { server, url } = await serve({
    "/": html(`<body style="margin:0"><div style="height:3000px;background:rgb(255,255,255)"></div><nav style="position:fixed;bottom:0;left:0;right:0;height:50px;background:rgb(255,0,0)">Onglets</nav></body>`),
  });
  const dir = await mkdtemp(join(tmpdir(), "aeom-capture-fixed-"));
  try {
    await capture({ url, outDir: dir, widths: [390], paths: ["/"] });
    const file = join(dir, "index@390.png");
    assert.equal(await pixel(file, 10, 3000 - 25), "255,0,0", "the bar is at the end of the page");
    assert.equal(await pixel(file, 10, 844 - 25), "255,255,255", "and no longer where the window ended");
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("pages the config marks public are captured and checked signed out, the others signed in", async () => {
  const signed = (req: import("node:http").IncomingMessage) => (req.headers.cookie ?? "").includes("session=ok");
  const { server, url } = await serve({
    "/": (req, res) => {
      if (signed(req)) {
        res.writeHead(303, { location: "/jeu" });
        return res.end();
      }
      html(`<h1>Bestia, le jeu</h1><a href="/connexion">Se connecter</a>`)(req, res);
    },
    "/jeu": (req, res) => {
      if (!signed(req)) {
        res.writeHead(303, { location: "/" });
        return res.end();
      }
      html(`<h1>Foyer</h1>`)(req, res);
    },
  });
  const dir = await mkdtemp(join(tmpdir(), "aeom-capture-public-"));
  const signedIn = { cookies: [{ name: "session", value: "ok", domain: "localhost", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" as const }], origins: [] };
  try {
    const manifest = await capture({ url, outDir: dir, widths: [390], paths: ["/jeu"], signedOut: ["/"], signedIn });
    assert.deepEqual(manifest.pages.map((p) => [p.path, p.signedOut ?? false]), [["/jeu", false], ["/", true]]);
    const found = await capture({ url, outDir: dir, widths: [390], signedOut: ["/"], signedIn });
    assert.deepEqual(found.pages.map((p) => p.path).sort(), ["/", "/jeu"], "found by its links signed in, and the public page signed out");
    assert.deepEqual(found.errors, []);
    const report = await checkSite({ url, widths: [390], paths: ["/jeu"], signedOut: ["/"], signedIn });
    assert.deepEqual(report.pages.map((p) => new URL(p).pathname), ["/jeu", "/"]);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("only bars fixed to the bottom of the window move to the end of the page, as they were, and go back after", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(`<body style="margin:0">
      <div id="backdrop" style="position:fixed;inset:0;background:rgb(0,0,255)"></div>
      <header id="top" style="position:fixed;top:0;left:0;right:0;padding:0 20px;height:40px"></header>
      <nav id="bar" style="position:fixed;bottom:0;left:50%;width:200px;height:50px;translate:-50% 0;transform:scale(1)"><span id="inner" style="position:fixed;bottom:0;left:0;height:10px;width:10px"></span></nav>
      <div style="transform:translateZ(0)"><div id="scrolls" style="position:fixed;bottom:0;height:20px;width:20px"></div></div>
      <div style="height:3000px"></div></body>`);
    const box = (id: string) => page.evaluate((id) => { const r = document.getElementById(id)!.getBoundingClientRect(); return { top: Math.round(r.top + scrollY), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) }; }, id);
    const before = { backdrop: await box("backdrop"), top: await box("top"), bar: await box("bar"), scrolls: await box("scrolls") };
    const own = await page.evaluate(() => document.getElementById("bar")!.style.translate);
    const unpin = await pinFixed(page);
    assert.deepEqual(await box("bar"), { ...before.bar, top: 3000 - 50 }, "the bar is at the end of the page, centred and as wide as it was");
    assert.deepEqual(await box("backdrop"), before.backdrop, "what covers the window stays");
    assert.deepEqual(await box("top"), before.top, "a header fixed to the top stays, as wide as it was");
    assert.deepEqual(await box("scrolls"), before.scrolls, "an element that scrolls with the page is not moved");
    assert.equal((await page.evaluate(() => document.documentElement.scrollHeight)), 3000, "the page is no taller");
    await unpin();
    assert.deepEqual(await box("bar"), before.bar, "the bar goes back where it was");
    assert.equal(await page.evaluate(() => document.getElementById("bar")!.style.translate), own, "with its own translate");
  } finally {
    await browser.close();
  }
});

test("a very long page is captured down to a cap, and the manifest says how tall it was", async () => {
  const server = createHttpServer((_, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<body style="margin:0"><div style="height:24000px;background:linear-gradient(red, blue)">Trophées</div></body>`);
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const url = `http://localhost:${(server.address() as { port: number }).port}`;
  const dir = await mkdtemp(join(tmpdir(), "aeom-capture-long-"));
  try {
    const manifest = await capture({ url, outDir: dir, widths: [390], paths: ["/"] });
    const file = manifest.pages[0]!.files[0]!;
    assert.equal(readFileSync(join(dir, file.file)).readUInt32BE(20), MAX_CAPTURE_HEIGHT);
    assert.equal(file.cut, 24000);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

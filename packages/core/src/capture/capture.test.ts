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
import { AppStartError, capture, MAX_CAPTURE_HEIGHT, normalize, findField, pageShape, pairRoutes, pinFixed, signedInFrom, shortenContent, signIn, SignInError, slug, startApp, type RunningApp } from "./index.js";
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

test("each page's content is written beside its captures, as a screen reader reads it at the widest width: its texts, links, buttons and fields, a long list shortened, nothing of its look", async () => {
  const items = Array.from({ length: 40 }, (_, i) => `<li class="carte-produit"><h3>Produit ${i}</h3><p>12,${i} €</p><button>Ajouter au panier</button></li>`).join("");
  // Links alike are as many actions: all kept. Rows whose names hold a colon, and cards of plain blocks, are records: shortened.
  const categories = Array.from({ length: 12 }, (_, i) => `<li><a href="/rayon-${i}">Rayon ${i}</a></li>`).join("");
  const rows = Array.from({ length: 30 }, (_, i) => `<tr><td>Commande #${i}</td><td>Statut: payée</td></tr>`).join("");
  const cards = Array.from({ length: 40 }, (_, i) => `<div><h3>Avis ${i}</h3><p>Très bien</p><button>Répondre</button></div>`).join("");
  const { server, url } = await serve({
    "/": html(`<style>.carte-produit { color: #c0392b } @media (max-width: 600px) { nav { display: none } }</style><header><a href="/">Boutique</a><nav><a href="/commandes">Commandes</a></nav></header><main><h1>Nos produits</h1><label>Chercher <input name="q" placeholder="Un produit"></label><ul>${items}</ul><ul>${categories}</ul><table>${rows}</table>${cards}<button>Valider la commande</button></main>`),
    "/commandes": html(`<h1>Commandes</h1>`),
  });
  const dir = await mkdtemp(join(tmpdir(), "aeom-capture-content-"));
  try {
    const manifest = await capture({ url, outDir: dir, widths: [390, 1280], paths: ["/"] });
    assert.equal(manifest.pages[0]!.content, "index.content.yml");
    const content = readFileSync(join(dir, "index.content.yml"), "utf8");
    assert.match(content, /heading "Nos produits" \[level=1\]/);
    assert.match(content, /textbox "Chercher"/);
    assert.match(content, /link "Commandes"/, "read at the widest width, where the menu shows");
    assert.match(content, /heading "Produit 4" \[level=3\][\s\S]*button "Ajouter au panier"/);
    assert.doesNotMatch(content, /Produit 5\b/, "a long list keeps its first items");
    assert.match(content, /^\s*- … 35 more listitem$/m, "and says how many it leaves out");
    assert.match(content, /link "Rayon 11"/, "every link of a list of links");
    assert.match(content, /row "Commande #4 Statut: payée"/);
    assert.doesNotMatch(content, /Commande #5\b/);
    assert.match(content, /^\s*- … 25 more row$/m);
    assert.match(content, /heading "Avis 4" \[level=3\]/);
    assert.doesNotMatch(content, /Avis 5\b/);
    assert.match(content, /^\s*- … 35 more heading, paragraph, button$/m);
    assert.match(content, /button "Valider la commande"/, "and what comes after them");
    assert.doesNotMatch(content, /c0392b|carte-produit/, "nothing of its look");

    // A new capture in the same folder takes the old content away with the old captures.
    const again = await capture({ url, outDir: dir, widths: [390], paths: ["/commandes"] });
    assert.equal(again.pages[0]!.content, "commandes.content.yml");
    assert.ok(!existsSync(join(dir, "index.content.yml")));
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("a page's content past 500 lines is cut in the middle, its end kept, and says how much was left out", () => {
  const text = shortenContent(Array.from({ length: 620 }, (_, i) => `- paragraph: Ligne ${i}`).join("\n"));
  const lines = text.split("\n");
  assert.equal(lines.length, 501);
  assert.equal(lines[400], "- … cut here: 120 more lines");
  assert.equal(lines.at(-1), "- paragraph: Ligne 619", "what ends the page, often its last actions, is kept");
});

test("a sign-in form whose labels name no field is still filled, by the label's text, its placeholder or the field's name", async () => {
  let posted = "";
  const server = createHttpServer(async (req, res) => {
    if (req.method === "POST") {
      for await (const chunk of req) posted += chunk;
      res.writeHead(303, { location: "/jeu", "set-cookie": "session=ok; Path=/" });
      return res.end();
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(req.url === "/login" ? `<form method="post"><label>Email</label><input name="email"><div><label>Mot de passe</label></div><input type="password" name="password"><input name="code" placeholder="Code"><button>Entrer</button></form>` : "<p>Jeu</p>");
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const url = `http://localhost:${(server.address() as { port: number }).port}`;
  const browser = await chromium.launch();
  try {
    const signed = await signIn(browser, url, { path: "/login", account: { Email: "ana@example.test", "Mot de passe": "fake-pass", Code: "1234" }, submit: "Entrer" });
    assert.ok(signed.cookies.some((c) => c.name === "session"));
    assert.equal(posted, "email=ana%40example.test&password=fake-pass&code=1234");
  } finally {
    await browser.close();
    server.close();
  }
});

test("a session given as a browser state, a list of cookies or what a script prints is read as a signed-in browser", () => {
  const state = { cookies: [{ name: "session", value: "abc", domain: "localhost", path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" as const }], origins: [] };
  assert.deepEqual(signedInFrom(JSON.stringify(state), "http://localhost:4000"), state);
  const fromList = signedInFrom(JSON.stringify([{ name: "session", value: "abc" }]), "http://localhost:4000/app");
  assert.deepEqual(fromList.cookies.map((c) => [c.name, c.value, c.domain, c.path]), [["session", "abc", "localhost", "/"]]);
  assert.deepEqual(signedInFrom(JSON.stringify({ cookies: [{ name: "s", value: "1" }] }), "http://127.0.0.1:1").cookies[0]!.domain, "127.0.0.1");
  assert.throws(() => signedInFrom("not json", "http://x"), /not JSON/);
  assert.throws(() => signedInFrom(JSON.stringify([{ name: "s" }]), "http://x"), /every cookie needs a name and a value/);
});

test("routes that name records pair by their shape, so a screen whose record changes at every visit is still one screen", () => {
  assert.equal(pageShape("/sessions/123"), "/sessions/:id");
  assert.equal(pageShape("/sessions/c72d9f1e-0b1a-4c4e-9a8e-1f2d3c4b5a69/players"), "/sessions/:id/players");
  assert.equal(pageShape("/sessions/play?id=42&tab=infos"), "/sessions/play?id=:id&tab=infos");
  assert.equal(pageShape("/connexion"), "/connexion");
  assert.equal(pageShape("/sessions/new"), "/sessions/new");
  for (const slug of ["/web3-app", "/2fa-setup", "/produits/iphone-15", "/covid19"]) assert.equal(pageShape(slug), slug, `${slug} is a screen of its own`);
  assert.equal(pageShape("/c/clx1abc2def3ghi4"), "/c/:id");
  const pairs = pairRoutes(["/", "/sessions/100", "/sessions/100/players", "/aide"], ["/", "/aide", "/sessions/101/players", "/sessions/101", "/autre/7"]);
  assert.deepEqual([...pairs], [["/", "/"], ["/aide", "/aide"], ["/sessions/101/players", "/sessions/100/players"], ["/sessions/101", "/sessions/100"]]);
});

test("a field is found beside its label without crossing into another row, never off screen, and two fields under one label are no field", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <div class="float"><input id="floated"><label>Ville</label></div>
      <form><div><label>Code</label></div><input id="wrapped"><input name="code" id="trap" style="position:absolute;left:-9999px"></form>
      <table><tr id="r1"><td><label>Quantité</label></td><td><input id="q1"></td></tr><tr id="r2"><td><label>Quantité</label></td><td><input id="q2"></td></tr></table>
      <label for="e1">Email</label><input id="e1"><label for="e2">Email</label><input id="e2">
      <section><div role="dialog" id="d"><label>Code postal</label></div><input id="outside"></section>
      <div><label>Pays</label><div role="combobox" tabindex="0">France</div><input id="tel"></div>`);
    const id = async (label: string, scope: import("playwright").Page | import("playwright").Locator = page) => (await findField(scope, label))?.getAttribute("id") ?? null;
    assert.equal(await id("Ville"), "floated", "a label after its field, in the same box");
    assert.equal(await id("Code"), "wrapped", "a label in its own box, the field right after it; the hidden twin is not seen");
    assert.equal(await id("Quantité", page.locator("#r2")), "q2", "inside the row asked, not the one before");
    assert.equal(await id("Quantité"), null, "two rows: two fields, so none");
    assert.equal(await id("Email"), null, "two fields named Email: none is guessed");
    assert.equal(await id("Code postal", page.locator("#d")), null, "never outside the dialog asked");
    assert.equal(await id("Pays"), null, "a label whose own control is a custom list is not given its neighbour's field");
  } finally {
    await browser.close();
  }
});

test("cookies exported by a browser extension are made fit for a browser, and an expired one is refused", () => {
  const now = Math.floor(Date.now() / 1000);
  const state = signedInFrom(JSON.stringify([
    { name: "a", value: "1", sameSite: "no_restriction", expirationDate: now + 3600 },
    { name: "b", value: "2", sameSite: "lax", session: true },
    { name: "__Secure-c", value: "3", sameSite: null },
  ]), "https://jeu.example.test/");
  assert.deepEqual(state.cookies.map((c) => [c.name, c.sameSite, c.secure, c.expires > 0]), [["a", "None", true, true], ["b", "Lax", true, false], ["__Secure-c", "Lax", true, false]]);
  assert.deepEqual(signedInFrom(JSON.stringify([{ name: "old", value: "1", expires: now - 60 }, { name: "session", value: "2" }]), "http://x").cookies.map((c) => c.name), ["session"], "an expired tracker is left out");
  assert.throws(() => signedInFrom(JSON.stringify([{ name: "old", value: "1", expires: now - 60 }]), "http://x"), /Every cookie of the session given has expired/);
  assert.throws(() => signedInFrom("[]", "http://x"), /holds no cookie/);
});

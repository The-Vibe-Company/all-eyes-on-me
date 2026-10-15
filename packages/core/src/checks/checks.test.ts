import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
import { readFileSync } from "node:fs";
import { signIn, startApp, type RunningApp } from "../capture/index.js";
import { checkClipped, checkContrast, checkCursor, checkFontSize, checkHeader, checkLineLength, checkOverflow, checkPages, checkSite, checkTapSize, checkUneven, checkWrap, checkZoom, watchConsole } from "./index.js";

const UGLY_APP = fileURLToPath(new URL("../../../../examples/ugly-app/server.mjs", import.meta.url));

let browser: Browser;
before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
});

async function pageWith(html: string, width = 1280): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 800 } });
  const page = await context.newPage();
  await page.setContent(html);
  return page;
}

describe("cursor", () => {
  test("flags clickable elements without a pointer cursor, and only those", async () => {
    const page = await pageWith(`
      <button>Go</button>
      <div onclick="void 0">Fake button</div>
      <a href="/x">A link</a>
      <button style="cursor: pointer">Fine</button>
      <button style="display: none">Hidden</button>`);
    const issues = await checkCursor(page);
    assert.deepEqual(issues.map((i) => i.element), ['button "Go"', 'div "Fake button"']);
  });
});

describe("overflow", () => {
  test("flags a page that scrolls sideways and names the element that sticks out", async () => {
    const page = await pageWith(`<body style="margin:0"><div class="wide" style="width:600px">Too wide</div></body>`, 390);
    const issues = await checkOverflow(page);
    assert.equal(issues.length, 1);
    assert.match(issues[0]!.message, /600 px/);
    assert.equal(issues[0]!.element, 'div.wide "Too wide"');
  });

  test("passes a page that fits", async () => {
    const page = await pageWith(`<body style="margin:0"><div>Fits</div></body>`, 390);
    assert.deepEqual(await checkOverflow(page), []);
  });
});

describe("contrast", () => {
  test("flags text below AA contrast", async () => {
    const page = await pageWith(`<main><p style="color:#ccc;background:#fff">Faint text</p><p style="color:#111">Dark text</p></main>`);
    const issues = await checkContrast(page);
    assert.equal(issues.length, 1);
    assert.match(issues[0]!.element ?? "", /Faint text/);
  });
});

describe("console", () => {
  test("collects console errors and uncaught exceptions", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = watchConsole(page);
    await page.setContent(`<script>console.error("boom"); setTimeout(() => { throw new Error("kaboom"); });</script>`);
    await page.waitForTimeout(100);
    const messages = errors().map((i) => i.message).join("\n");
    assert.match(messages, /boom/);
    assert.match(messages, /kaboom/);
  });
});

const TALL = `<main style="height:3000px"><p>Content</p></main>`;

describe("header", () => {
  test("flags a header that leaves the screen when you scroll and does not come back", async () => {
    const issues = await checkHeader(await pageWith(`<body style="margin:0"><header style="height:60px">Logo <a href="/">Accueil</a></header>${TALL}</body>`));
    assert.equal(issues.length, 1);
    assert.match(issues[0]!.message, /the header leaves the screen when you scroll and does not come back when you scroll up/);
  });

  test("passes a header that sticks, and one that hides going down and comes back going up", async () => {
    assert.deepEqual(await checkHeader(await pageWith(`<body style="margin:0"><header style="position:sticky;top:0;height:60px;background:#fff">Logo</header>${TALL}</body>`)), []);
    const hiding = `<body style="margin:0"><header id="h" style="position:fixed;top:0;left:0;right:0;height:60px;background:#fff">Logo</header>${TALL}
      <script>let last = 0; addEventListener("scroll", () => { document.getElementById("h").style.transform = scrollY > last ? "translateY(-100%)" : "none"; last = scrollY; });</script></body>`;
    assert.deepEqual(await checkHeader(await pageWith(hiding)), []);
  });

  test("judges nothing on a page too short to scroll, or with no header", async () => {
    assert.deepEqual(await checkHeader(await pageWith(`<header style="height:60px">Logo</header><main>Short</main>`)), []);
    assert.deepEqual(await checkHeader(await pageWith(`<body style="margin:0"><div style="height:60px">Logo</div>${TALL}</body>`)), []);
  });

  test("on a phone, a header that stays but takes more than a quarter of the screen is flagged", async () => {
    const issues = await checkHeader(await pageWith(`<body style="margin:0"><header style="position:sticky;top:0;height:300px;background:#fff">Logo</header>${TALL}</body>`, 390));
    assert.equal(issues.length, 1);
    assert.match(issues[0]!.message, /the header takes 36% of the screen on a phone: a quarter at most/);
    assert.deepEqual(await checkHeader(await pageWith(`<body style="margin:0"><header style="position:sticky;top:0;height:56px;background:#fff">Logo</header>${TALL}</body>`, 390)), []);
  });
});

describe("wrap", () => {
  test("flags a button, a navigation link, a tab or a chip whose label goes onto two lines", async () => {
    const page = await pageWith(`
      <button style="width:80px">Ajouter au panier</button>
      <nav><a href="/c" style="display:inline-block;width:50px">Mes commandes</a></nav>
      <div role="tab" style="width:40px">Historique complet</div>
      <span class="badge" style="display:inline-block;width:40px">Très populaire</span>
      <button>OK</button>
      <p style="width:80px">A paragraph may wrap as much as it likes, it is not a label.</p>`);
    const issues = await checkWrap(page);
    assert.deepEqual(issues.map((i) => i.element), ['button "Ajouter au panier"', 'a "Mes commandes"', 'div "Historique complet"', 'span.badge "Très populaire"']);
    assert.match(issues[0]!.message, /its label goes onto 2 lines: keep it on one/);
  });
});

describe("uneven", () => {
  const card = (title: string, style = "") => `<article class="card" style="width:150px;${style}"><h3 class="title">${title}</h3><a class="more" href="/x">Voir</a></article>`;
  test("flags cards of one row that differ because a title wraps, naming the title", async () => {
    const issues = await checkUneven(await pageWith(`<div style="display:grid;grid-template-columns:repeat(3,150px);align-items:start;gap:8px">${card("Lampe")}${card("Lampe de chevet en laiton brossé et abat-jour en lin")}${card("Chaise")}</div>`));
    assert.equal(issues.length, 1);
    assert.match(issues[0]!.element ?? "", /^h3\.title "Lampe de chevet en laiton/);
    assert.match(issues[0]!.message, /the items of one row are \d+ to \d+ px tall: it takes \d lines where the others take 1\. Clamp it with an ellipsis/);
  });

  test("flags cards stretched to one height whose content no longer lines up", async () => {
    const issues = await checkUneven(await pageWith(`<div style="display:flex;gap:8px">${card("Lampe")}${card("Lampe de chevet en laiton brossé et abat-jour en lin")}</div>`));
    assert.equal(issues.length, 1);
    assert.match(issues[0]!.message, /the items of one row no longer line up: it takes \d lines where the others take 1\. Clamp it with an ellipsis/);
  });

  test("passes titles clamped to one line, and a row where nothing wraps", async () => {
    const clamp = "display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden";
    const clamped = (t: string) => `<article class="card" style="width:150px"><h3 class="title" style="${clamp}">${t}</h3><a class="more" href="/x">Voir</a></article>`;
    assert.deepEqual(await checkUneven(await pageWith(`<div style="display:flex;gap:8px">${clamped("Lampe")}${clamped("Lampe de chevet en laiton brossé et abat-jour en lin")}</div>`)), []);
    assert.deepEqual(await checkUneven(await pageWith(`<div style="display:flex;gap:8px">${card("Lampe")}${card("Chaise")}${card("Tapis")}</div>`)), []);
    assert.deepEqual(await checkUneven(await pageWith(`<table><tr><td style="width:60px">Court</td><td style="width:60px">Une cellule bien plus longue</td></tr></table>`)), [], "table cells share their row by design");
  });
});

describe("clipped", () => {
  test("flags text cut by its box with no ellipsis, and a word that spills out of its box", async () => {
    const issues = await checkClipped(await pageWith(`
      <p class="one" style="width:100px;white-space:nowrap;overflow:hidden">A long line that is cut short</p>
      <p class="two" style="width:100px;height:20px;overflow:hidden">Several lines of text that the box cuts at the bottom, with nothing to say so.</p>
      <div class="three" style="width:60px">Supercalifragilisticexpialidocious</div>`));
    assert.deepEqual(issues.map((i) => i.element?.split(" ")[0]), ["p.one", "p.two", "div.three"]);
    assert.match(issues[0]!.message, /cut by its box with no ellipsis/);
    assert.match(issues[2]!.message, /its text spills out of its box: let it wrap and break/);
  });

  test("passes text cut with an ellipsis or clamped, and a box that scrolls", async () => {
    assert.deepEqual(await checkClipped(await pageWith(`
      <p style="width:100px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">A long line that ends in an ellipsis</p>
      <p style="width:100px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">Several lines of text clamped to two, with an ellipsis at the end of the second.</p>
      <pre style="width:100px;overflow:auto">a long line of code that scrolls on its own</pre>
      <p style="width:100px">Short words wrap fine.</p>`)), []);
  });
});

describe("what good fronts do, never flagged", () => {
  const clamp = (n: number) => `display:-webkit-box;-webkit-line-clamp:${n};-webkit-box-orient:vertical;overflow:hidden`;
  test("the truncate pattern, a clamp inside a box that crops, text for screen readers, a closed details, an aria-hidden watermark", async () => {
    const page = await pageWith(`
      <div class="card" style="width:150px;overflow:hidden;border-radius:12px"><h3 style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><a href="/x">A title far too long for the card</a></h3></div>
      <div style="height:90px;width:150px;overflow:hidden"><p style="${clamp(3)}"><span>Several lines of a description that the paragraph clamps to three, with an ellipsis, inside a box that crops its corners.</span></p></div>
      <button style="position:relative;overflow:hidden;width:40px;height:40px"><svg width="16" height="16"></svg><span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">Open the navigation menu</span></button>
      <details><summary>More</summary><button style="width:50px">A long button label here</button></details>
      <section style="position:relative;overflow:hidden;width:300px;height:200px"><span aria-hidden="true" style="position:absolute;left:100px;font-size:160px">WATERMARK</span><h1>Hero</h1></section>`);
    assert.deepEqual(await checkClipped(page), []);
    assert.deepEqual(await checkWrap(page), []);
  });

  test("a peeking carousel crops its slides, it does not cut a text", async () => {
    const slide = (t: string) => `<div class="slide" style="flex:0 0 200px"><h3>${t}</h3><p>A short line.</p></div>`;
    assert.deepEqual(await checkClipped(await pageWith(`<div style="width:500px;overflow:hidden"><div style="display:flex;gap:20px">${slide("One")}${slide("Two")}${slide("Three")}</div></div>`)), []);
  });

  test("a long FAQ question, a clickable card, footer links and a two-line CTA are not labels", async () => {
    const page = await pageWith(`
      <button aria-expanded="false" style="width:200px">How do I return a lamp I bought last month?</button>
      <div role="button" style="width:150px"><h3>Starter</h3><p>For a small shop that starts</p></div>
      <footer><nav><a href="/cgv" style="display:inline-block;width:60px">Conditions générales</a></nav></footer>
      <p class="post-tags" style="width:80px">Lampes, chaises, tapis et coussins</p>`, 390);
    assert.deepEqual(await checkWrap(page), []);
  });

  test("a link styled as a button is a label too", async () => {
    const issues = await checkWrap(await pageWith(`<a class="btn btn-primary" href="/r" style="display:inline-block;width:100px">Réserver ma place maintenant</a>`));
    assert.deepEqual(issues.map((i) => i.element), ['a.btn.btn-primary "Réserver ma place maintenant"']);
  });

  test("running text of different lengths side by side is not an uneven row; a clamp that leaves rows uneven asks for its lines reserved", async () => {
    const quote = (t: string) => `<figure class="quote" style="width:150px"><blockquote>${t}</blockquote><figcaption>Bruno</figcaption></figure>`;
    assert.deepEqual(await checkUneven(await pageWith(`<div style="display:flex;align-items:flex-start;gap:8px">${quote("Parfait.")}${quote("Une lampe magnifique, livrée vite et bien emballée, je recommande.")}</div>`)), []);
    const card = (t: string) => `<article class="card" style="width:150px"><h3 class="title" style="${clamp(2)}">${t}</h3><a class="more" href="/x">Voir</a></article>`;
    const issues = await checkUneven(await pageWith(`<div style="display:grid;grid-template-columns:repeat(3,150px);gap:8px">${card("Lampe")}${card("Lampe de chevet en laiton brossé et abat-jour en lin")}${card("Chaise")}</div>`));
    assert.equal(issues.length, 1);
    assert.match(issues[0]!.message, /it is clamped to 2 lines and takes 2 where the others take 1: reserve its 2 lines \(min-height\), so every item keeps one shape/);
  });

  test("a row of thousands of items is measured in a moment", async () => {
    const page = await pageWith(`<ul>${Array.from({ length: 3000 }, (_, i) => `<li class="row"><span>Item ${i}</span></li>`).join("")}</ul>`);
    const started = Date.now();
    await checkUneven(page);
    assert.ok(Date.now() - started < 3000, `took ${Date.now() - started} ms`);
  });

  test("in an app that scrolls an inner box, a word that spills out of its box is still flagged; a line of code in a block that scrolls is not", async () => {
    const issues = await checkClipped(await pageWith(`<main style="height:400px;overflow:auto"><p class="spill" style="width:100px">Supercalifragilisticexpialidocious_long</p><pre style="width:100px;overflow-x:auto"><span style="display:block">a long line of code that scrolls on its own</span></pre></main>`));
    assert.deepEqual(issues.map((i) => i.element?.split(" ")[0]), ["p.spill"]);
  });
});

describe("the header, as sites build it", () => {
  test("a header inside an article is its title, not the site's header; a fixed navigation beside a hero header stays", async () => {
    assert.deepEqual(await checkHeader(await pageWith(`<body style="margin:0"><main><article><header><h1>Un article</h1></header>${TALL}</article></main></body>`)), []);
    assert.deepEqual(await checkHeader(await pageWith(`<body style="margin:0"><nav style="position:fixed;top:0;left:0;right:0;height:56px;background:#fff;z-index:2"><a href="/">Accueil</a></nav><header class="masthead" style="height:400px;padding-top:56px">Hero</header>${TALL}</body>`)), []);
  });

  test("a promotion bar above a sticky header, and a header that comes back after a longer way up, pass", async () => {
    assert.deepEqual(await checkHeader(await pageWith(`<body style="margin:0"><div style="height:40px">Livraison offerte</div><header style="position:sticky;top:0;height:60px;background:#fff">Logo</header>${TALL}</body>`)), []);
    const late = `<body style="margin:0"><header id="h" style="position:fixed;top:0;left:0;right:0;height:60px;background:#fff">Logo</header>${TALL}
      <script>let low = 0; addEventListener("scroll", () => { low = Math.max(low, scrollY); document.getElementById("h").style.transform = low - scrollY > 150 || scrollY < 60 ? "none" : "translateY(-100%)"; if (low - scrollY > 150) low = scrollY; });</script></body>`;
    assert.deepEqual(await checkHeader(await pageWith(late)), []);
  });
});

test("a page that goes elsewhere while it is checked does not stop the check of the others", async () => {
  const server = createHttpServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(req.url === "/leaves" ? `<!doctype html><body style="margin:0"><header style="height:60px">Logo</header><main style="height:3000px"></main><script>setTimeout(() => location.replace("/b"), 500)</script></body>` : `<!doctype html><body style="margin:0"><header style="height:60px">Logo <a href="/leaves">L</a></header><main style="height:3000px">${req.url}</main></body>`);
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  try {
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const findings = await checkPages(browser, [`${url}/leaves`, `${url}/b`], [1280]);
    assert.ok(findings.some((f) => f.check === "header" && new URL(f.url).pathname === "/b"), "the page after it is still checked");
  } finally {
    await new Promise((done) => server.close(done));
  }
});

describe("tap-size", () => {
  test("on a phone, flags a target under 24 by 24 px that sits closer than 24 px to another one, never a link inside a sentence", async () => {
    const page = await pageWith(`
      <div style="display:flex;gap:2px"><button class="close" style="width:20px;height:20px;padding:0">×</button><button class="more" style="width:20px;height:20px;padding:0">⋯</button></div>
      <ul class="links" style="line-height:14px;font-size:12px;margin:40px 0"><li><a href="/a">Mentions</a></li><li><a href="/b">Contact</a></li></ul>
      <button style="min-height:48px;padding:0 16px">Ajouter</button>
      <p>Lisez nos <a href="/cgv">conditions</a> avant de commander.</p>
      <p><small>© 2026. Voir les <a href="/l">mentions</a>.</small></p>
      <label style="display:flex;align-items:center;min-height:48px"><input type="checkbox"> Se souvenir de moi</label>`, 390);
    const issues = await checkTapSize(page);
    assert.deepEqual(issues.map((i) => i.element), ['button.close "×"', 'button.more "⋯"', 'a "Mentions"', 'a "Contact"']);
    assert.match(issues[0]!.message, /20×20 px and closer than 24 px to another target: too small to tap, 24×24 at least, or 24 px apart/);
  });

  test("a small target alone, a hit area wider than the drawing, a field inside a big label, footer links spaced apart and a skip link out of sight pass", async () => {
    const page = await pageWith(`<style>.x{position:relative;width:24px;height:24px;padding:0}.x::before{content:"";position:absolute;inset:-10px}</style>
      <a class="skip" href="#main" style="position:absolute;top:-100px">Aller au contenu</a>
      <div style="padding:60px"><button class="x">×</button></div>
      <div style="padding:60px"><button style="width:20px;height:20px;padding:0">?</button></div>
      <label style="display:block;padding:12px">Email <input type="email" style="height:24px"></label>
      <ul style="line-height:24px;font-size:12px"><li><a href="/a">Mentions</a></li><li><a href="/b">Contact</a></li></ul>`, 390);
    assert.deepEqual(await checkTapSize(page), []);
  });

  test("on a computer, a small target is not a tap", async () => {
    assert.deepEqual(await checkTapSize(await pageWith(`<div><button style="width:12px;height:12px;padding:0">×</button><button style="width:12px;height:12px;padding:0">+</button></div>`)), []);
  });
});

describe("font-size", () => {
  test("flags text under 12 px, and on a phone a field under 16 px, which the phone zooms into", async () => {
    const page = await pageWith(`<p class="fine" style="font-size:10px">Prix indicatif hors livraison.</p><p>Lisible.</p><input class="email" type="email" style="font-size:14px" placeholder="Email"><input type="text" style="font-size:16px">`, 390);
    const issues = await checkFontSize(page);
    assert.deepEqual(issues.map((i) => i.element?.split(" ")[0]), ["p.fine", "input.email"]);
    assert.match(issues[0]!.message, /its text is 10 px: 12 at least/);
    assert.match(issues[1]!.message, /the field's text is 14 px: a phone zooms in when you type in it, 16 at least/);
    assert.deepEqual((await checkFontSize(await pageWith(`<input type="email" style="font-size:14px">`))).length, 0, "a computer does not zoom");
    assert.deepEqual(await checkFontSize(await pageWith(`<p>Prix<sup>1</sup> et H<sub>2</sub>O</p><svg viewBox="0 0 200 100" style="width:100%"><text x="0" y="50" style="font-size:8px">Plan</text></svg><p style="position:absolute;left:-9999px;font-size:9px">Hors de vue</p>`)), [], "a footnote mark, text drawn in an SVG, text moved out of sight");
  });
});

describe("line-length", () => {
  test("measures the lines of a text where they are: columns side by side, a paragraph inside a list item, three lines of 77 characters", async () => {
    const words = "Nos lampes sont faites à la main dans un atelier du Jura, avec du laiton brossé et du lin. ".repeat(4);
    const col = `<div style="width:300px">${words}</div>`;
    assert.deepEqual(await checkLineLength(await pageWith(`<ul><li style="display:flex;gap:24px">${col}${col}${col}</li></ul><p style="column-count:3;width:1100px">${words}${words}</p>`)), []);
    const inside = await checkLineLength(await pageWith(`<ul><li><p style="width:1100px">${words}</p></li></ul>`));
    assert.equal(inside.length, 1, "the paragraph, not its list item too");
    assert.deepEqual(await checkLineLength(await pageWith(`<p style="width:77ch;font-family:monospace">${"x".repeat(76)} ${"y".repeat(76)} ${"z".repeat(76)}</p>`)), [], "77 characters a line is not more than 90");
  });

  test("flags a paragraph of more than 90 characters a line, over three lines or more", async () => {
    const words = "Nos lampes sont faites à la main dans un atelier du Jura, avec du laiton brossé et du lin. ".repeat(4);
    const issues = await checkLineLength(await pageWith(`<p class="wide" style="width:1100px;font-size:16px">${words}</p><p style="max-width:60ch">${words}</p><p style="width:1100px">Une ligne seule, longue ou pas, se lit d'un coup.</p>`));
    assert.deepEqual(issues.map((i) => i.element?.split(" ")[0]), ["p.wide"]);
    assert.match(issues[0]!.message, /about \d{3} characters a line: 90 at most, so the eye finds the next line/);
  });
});

describe("zoom", () => {
  test("flags a page that forbids zooming, and on a phone a page with no viewport tag", async () => {
    const forbids = await pageWith(`<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"><p>Hi</p>`, 390);
    assert.match((await checkZoom(forbids))[0]?.message ?? "", /the page forbids zooming \(user-scalable=no, maximum-scale=1\): let people zoom/);
    assert.match((await checkZoom(await pageWith(`<p>Hi</p>`, 390)))[0]?.message ?? "", /no viewport tag: a phone shows the page as a shrunken computer page/);
    assert.deepEqual(await checkZoom(await pageWith(`<p>Hi</p>`)), [], "a computer needs none");
    assert.deepEqual(await checkZoom(await pageWith(`<meta name="viewport" content="width=device-width, initial-scale=1"><p>Hi</p>`, 390)), []);
    assert.deepEqual(await checkZoom(await pageWith(`<meta name="Viewport" content="width=device-width, initial-scale=1"><p>Hi</p>`, 390)), [], "the tag's name in any case");
  });
});

test("a check the config leaves out of a page finds nothing there, and still runs on the others", async () => {
  const server = createHttpServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><body style="margin:0"><header style="height:60px">Logo <a href="/b">B</a></header><main style="height:3000px">${req.url}</main></body>`);
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  try {
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const report = await checkSite({ url, paths: ["/", "/b"], widths: [1280], except: { header: ["/"] } });
    assert.deepEqual(report.findings.filter((f) => f.check === "header").map((f) => new URL(f.url).pathname), ["/b"]);
    const slashed = await checkSite({ url, paths: ["/", "/b"], widths: [1280], except: { header: ["/b/?from=menu"] } });
    assert.deepEqual(slashed.findings.filter((f) => f.check === "header").map((f) => new URL(f.url).pathname), ["/"], "a route is read without its query or its last slash");
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test("contrast is measured on a page whose Content-Security-Policy forbids inline scripts", async () => {
  const server = createHttpServer((_, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-security-policy": "script-src 'self'" });
    res.end('<!doctype html><title>t</title><p style="color:#ccc;background:#fff">Pâle</p>');
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const page = await browser.newPage();
  try {
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/`);
    const issues = await checkContrast(page);
    assert.equal(issues.length, 1, "the faint paragraph is found, though the page forbids inline scripts");
  } finally {
    await page.close();
    await new Promise((done) => server.close(done));
  }
});

describe("on the ugly app", () => {
  let app: RunningApp;
  let url: string;

  before(async () => {
    const port = await new Promise<number>((resolve) => {
      const server = createServer().listen(0, () => {
        const { port } = server.address() as { port: number };
        server.close(() => resolve(port));
      });
    });
    url = `http://localhost:${port}`;
    app = await startApp(`PORT=${port} node "${UGLY_APP}"`, url);
  });
  after(async () => {
    await app?.stop();
  });

  test("finds each kind of problem where the app has it", async () => {
    const account = JSON.parse(readFileSync(new URL("../../../../examples/ugly-app/fixtures/compte.json", import.meta.url), "utf8"));
    const signedIn = await signIn(browser, url, { path: "/connexion", account, submit: "Se connecter" });
    const report = await checkSite({ url, signedIn });
    const where = (check: string) => [...new Set(report.findings.filter((f) => f.check === check).map((f) => new URL(f.url).pathname))].sort();
    assert.deepEqual(where("cursor"), ["/", "/contact", "/produits"]);
    assert.ok(where("overflow").includes("/"), "the home page scrolls sideways at 390 px");
    assert.ok(report.findings.some((f) => f.check === "overflow" && f.width === 390));
    assert.deepEqual(where("contrast"), ["/", "/produits"], "white on the pink button, and the faint price note");
    assert.deepEqual(where("console"), ["/commandes"]);
    assert.equal(report.errors.length, 1, "the broken link is reported, not checked");
  });

  test("checks only the pages it is given, and still says which do not load", async () => {
    const report = await checkSite({ url, paths: ["/produits", "/aide"] });
    assert.deepEqual(report.pages.map((p) => new URL(p).pathname), ["/produits"]);
    assert.deepEqual(report.errors.map((e) => new URL(e.url).pathname), ["/aide"]);
    assert.ok(report.findings.every((f) => new URL(f.url).pathname === "/produits"));
  });
});

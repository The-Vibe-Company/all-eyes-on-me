import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
import { readFileSync } from "node:fs";
import { signIn, startApp, type RunningApp } from "../capture/index.js";
import { checkClipped, checkContrast, checkCursor, checkFocus, checkFontSize, checkHeader, checkImages, checkLabels, checkLayoutShift, checkLineLength, checkOverflow, checkPages, checkSite, checkTapSize, checkUneven, checkWrap, checkZoom, watchConsole, checkGradientText, checkSideStripe, checkNestedCard, checkBounce, checkPlaceholder, checkAiText, checkHollowWords } from "./index.js";

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

/** A 40 by 30 picture: 4:3. */
const FOUR_THREE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAIAAADRv8uKAAAAK0lEQVR4nO3NMQ0AAAgDsElBCtKQjgw4mvRvputExGKxWCwWi8VisVj8N17ahxo9rJVIzAAAAABJRU5ErkJggg==";

describe("images", () => {
  test("flags an image that does not load, and one stretched or squashed; passes one cropped to fit and one at its own ratio", async () => {
    const page = await pageWith(`
      <img class="gone" src="http://127.0.0.1:9/nope.jpg" alt="Lampe" width="120" height="90">
      <img class="wide" src="${FOUR_THREE}" alt="Chaise" style="width:320px;height:180px">
      <img src="${FOUR_THREE}" alt="Tapis" style="width:320px;height:180px;object-fit:cover">
      <img src="${FOUR_THREE}" alt="Coussin" style="width:200px;height:150px">
      <img src="${FOUR_THREE}" alt="Tournée" style="width:200px;height:150px;transform:rotate(90deg)">
      <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" data-src="vraie.jpg" alt="" style="width:400px;height:300px">`);
    await page.waitForTimeout(300);
    const issues = await checkImages(page);
    assert.deepEqual(issues.map((i) => i.element?.split(" ")[0]), ["img.gone", "img.wide"]);
    assert.match(issues[0]!.message, /the image does not load/);
    assert.match(issues[1]!.message, /the image is stretched: 4:3 shown as 16:9/);
  });
});

describe("labels", () => {
  test("flags a button or a link with no name, a field with no label, an image with no alt; passes what has one, and a decorative image", async () => {
    const page = await pageWith(`
      <button class="icon"><svg width="16" height="16"><path d="M0 0h16v16H0z"/></svg></button>
      <button aria-label="Fermer"><svg width="16" height="16"></svg></button>
      <a class="logo" href="/"><img src="${FOUR_THREE}" alt=""></a>
      <a href="/home"><img src="${FOUR_THREE}" alt="Accueil"></a>
      <input class="email" type="email" placeholder="Email">
      <label>Nom <input type="text"></label>
      <img class="photo" src="${FOUR_THREE}">
      <img src="${FOUR_THREE}" alt="">
      <article><a href="/p/1" aria-hidden="true" tabindex="-1"><img src="${FOUR_THREE}" alt=""></a><h3><a href="/p/1">Lampe</a></h3></article>
      <div inert><button><svg width="16" height="16"></svg></button></div>
      <a href="/t"><span role="img" aria-label="Twitter"></span>&nbsp;</a>
      <form><input type="submit"></form>
      <img src="${FOUR_THREE}" role="none">
      <img src="${FOUR_THREE}" title="Le logo">`);
    const issues = await checkLabels(page);
    assert.deepEqual(issues.map((i) => i.element?.split(" ")[0]), ["button.icon", "a.logo", "input.email", "img.photo"]);
    assert.match(issues[0]!.message, /no name: a screen reader says only « button »/);
    assert.match(issues[2]!.message, /no label: a placeholder is not one, it goes when you type/);
    assert.match(issues[3]!.message, /no alt text: say what it shows, or alt="" when it only decorates/);
  });
});

describe("focus", () => {
  test("flags what shows nothing when it has the keyboard focus; passes the browser's own ring and a style of the page's", async () => {
    const page = await pageWith(`<style>.ring:focus-visible { box-shadow: 0 0 0 3px #36f; outline: none }</style>
      <a class="bare" href="/a" style="outline:none">Produits</a>
      <a href="/b">Commandes</a>
      <button class="ring">Ajouter</button>`);
    const issues = await checkFocus(page);
    assert.deepEqual(issues.map((i) => i.element), ['a.bare "Produits"']);
    assert.match(issues[0]!.message, /nothing shows it has the keyboard focus: give it a visible outline or ring/);
  });

  test("any visible change counts: a filter, a ring on a box around it, a slow border, a skip link that comes into view; one with none after an embed is still found", async () => {
    const page = await pageWith(`<style>
      * { outline: none !important }
      .glow:focus-visible { filter: brightness(1.6) }
      .g { padding: 6px } .g:focus-within { box-shadow: 0 0 0 3px #36f }
      .f { border: 2px solid #ccc; transition: border-color 1s } .f:focus-within { border-color: #36f }
      .skip { position: absolute; left: -9999px } .skip:focus { left: 0; top: 0 }
    </style>
      <a class="skip" href="#main">Aller au contenu</a>
      <a class="glow" href="/a" style="background:#345;color:#fff;padding:8px">Produits</a>
      <div class="g"><div><input placeholder="Recherche"></div></div>
      <div class="f"><input placeholder="Email"></div>
      <iframe srcdoc="<p>Vidéo</p>" style="width:120px;height:60px"></iframe>
      <a class="plain" href="/c">Contact</a>`);
    const issues = await checkFocus(page);
    assert.deepEqual(issues.map((i) => i.element), ['a.plain "Contact"']);
  });
});


describe("layout-shift", () => {
  test("flags a page that moves while it loads; passes one that does not", async () => {
    // Served, not set: a page set by the test counts as typed into, and its shifts as the user's.
    const pages: Record<string, string> = {
      "/moving": `<main><h1>Lampes</h1><p>${"Du texte. ".repeat(1200)}</p></main><script>setTimeout(() => { const b = document.createElement("div"); b.style.height = "300px"; b.textContent = "Bandeau"; document.body.prepend(b); }, 200)</script>`,
      "/still": `<main><h1>Lampes</h1><p>${"Du texte. ".repeat(1200)}</p></main>`,
    };
    const server = createHttpServer((req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`<!doctype html>${pages[req.url ?? ""] ?? ""}`);
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    try {
      const at = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      await page.goto(`${at}/moving`);
      await page.waitForTimeout(600);
      const issues = await checkLayoutShift(page);
      assert.equal(issues.length, 1);
      assert.match(issues[0]!.message, /the page moves while it loads \(shift 0\.\d+, 0\.1 at most\)/);
      await page.goto(`${at}/still`);
      await page.waitForTimeout(300);
      assert.deepEqual(await checkLayoutShift(page), []);
    } finally {
      await page.close();
      await new Promise((done) => server.close(done));
    }
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

describe("gradient-text", () => {
  test("flags text filled with a gradient, and only that", async () => {
    const page = await pageWith(`
      <h1 class="hero" style="background:linear-gradient(90deg,#7c3aed,#2563eb);-webkit-background-clip:text;background-clip:text;color:transparent">Ship faster</h1>
      <h2 style="background:linear-gradient(90deg,#eee,#ddd)">A gradient behind the text, not in it</h2>
      <p style="-webkit-background-clip:text;background-clip:text;background-color:#333;color:transparent">Clipped, but one colour</p>
      <h2 class="solid" style="background:linear-gradient(90deg,#7c3aed,#2563eb);-webkit-background-clip:text;background-clip:text;color:#111">A solid fill over it</h2>
      <h3 style="background:linear-gradient(90deg,#7c3aed,#2563eb);background-clip:text;color:transparent;display:none">Hidden</h3>`);
    const issues = await checkGradientText(page);
    assert.deepEqual(issues.map((i) => i.element), ['h1.hero "Ship faster"']);
    assert.match(issues[0]!.message, /filled with a gradient \(background-clip: text\)/);
  });
});

describe("side-stripe", () => {
  test("flags a coloured border on one side of a box, with or without a hairline around it", async () => {
    const page = await pageWith(`
      <div class="callout" style="border-left:4px solid #e11d48;background:#fff1f2;padding:12px">Heads up</div>
      <ul style="padding:0"><li class="item" style="border:1px solid #eee;border-right:3px solid #2563eb;padding:8px;list-style:none">Right stripe</li></ul>
      <div style="border:2px solid #2563eb;padding:12px">Full border</div>
      <nav><a href="/a" style="display:inline-block;border-right:1px solid #ddd;padding:8px">Hairline</a></nav>
      <div style="border-left:4px solid transparent;background:#eee;padding:12px">Transparent</div>
      <div style="border-left:4px solid oklch(0.6 0.2 25 / 0);background:#eee;padding:12px">Transparent, written in oklch</div>
      <div class="note" style="background:#f5f5f5;border-left:3px solid #333;padding:12px">A dark grey stands out</div>
      <div class="pane" style="background:#fafafa;border-right:2px solid #e5e5e5;padding:16px;width:200px">A pale grey divides</div>`);
    const issues = await checkSideStripe(page);
    assert.deepEqual(issues.map((i) => i.element), ['div.callout "Heads up"', 'li.item "Right stripe"', 'div.note "A dark grey stands out"']);
    assert.match(issues[0]!.message, /a 4 px coloured border on its left side only/);
  });
});

describe("nested-card", () => {
  const card = "border:1px solid #ddd;border-radius:12px;padding:16px";
  test("flags cards inside a card, once per kind", async () => {
    const page = await pageWith(`
      <section class="panel" style="${card}">
        <div class="grid">
          <div class="item" style="${card}"><h3>One</h3><p>A line</p></div>
          <div class="item" style="box-shadow:0 2px 8px oklab(0 0 0 / 0.2);border-radius:12px;padding:16px"><h3>Two</h3><p>A line</p></div>
        </div>
      </section>
      <section class="panel" style="${card}"><div class="item" style="${card}"><h3>Three</h3></div></section>
      <div class="lone" style="box-shadow:0 2px 8px rgba(0,0,0,.2);border-radius:8px;padding:16px">Alone</div>`);
    const issues = await checkNestedCard(page);
    assert.deepEqual(issues.map((i) => i.element), ['div.item "One A line"']);
    assert.match(issues[0]!.message, /^3 cards like this one sit inside a card \(section\.panel\)/);
  });
});

describe("bounce", () => {
  test("flags a transition or an animation that overshoots, once per kind", async () => {
    const page = await pageWith(`
      <style>
        @keyframes pop { from { transform: scale(0) } to { transform: scale(1) } }
        .badge { animation: pop 10s cubic-bezier(.68,-0.55,.27,1.55) }
        @keyframes wobble { from { transform: rotate(0); animation-timing-function: cubic-bezier(.5,-0.6,.5,1.6) } to { transform: rotate(10deg) } }
        .wobble { animation: wobble 10s }
      </style>
      <div class="spring" style="transition:transform .5s linear(0, 1.2 60%, 1)">Spring</div>
      <div class="wobble">Wobbles</div>
      <div class="inside" style="transition:transform .3s cubic-bezier(.5,1.1,.5,.5)">Stays inside</div>
      <div class="nothing" style="transition-property:none;transition-duration:.3s;transition-timing-function:cubic-bezier(.34,1.56,.64,1)">Moves nothing</div>
      <button class="pop" style="transition:transform .3s cubic-bezier(.34,1.56,.64,1)">Pop</button>
      <button class="pop" style="transition:transform .3s cubic-bezier(.34,1.56,.64,1)">Again</button>
      <span class="badge">New</span>`);
    const issues = await checkBounce(page);
    assert.deepEqual(issues.map((i) => i.element), ['div.spring "Spring"', 'button.pop "Pop"', 'span.badge "New"', 'div.wobble "Wobbles"']);
    assert.match(issues[1]!.message, /^its transition overshoots \(cubic-bezier\(0\.34, 1\.56, 0\.64, 1\)\), a bounce/);
    assert.match(issues[0]!.message, /^its transition overshoots \(linear\(/);
    assert.match(issues[2]!.message, /^its animation pop overshoots/);
    assert.match(issues[3]!.message, /^its animation wobble overshoots \(cubic-bezier\(0\.5, -0\.6, 0\.5, 1\.6\)\)/);
  });
});

describe("what impeccable bans, and what good fronts still do", () => {
  test("a card holding fields, buttons, a chip, an image, code or a drop zone; a drawn screen; a chat bubble; a ticket deep in a board; a quote or a lead's rule; table rules; a tab's underline; a skip link; an accordion; fades and slides; a link, a table's frame, a search box, tabs, an alert, a radio tile, a details, a ring and a dialog in a card", async () => {
    const card = "border:1px solid #ddd;border-radius:12px;padding:16px";
    const page = await pageWith(`
      <form class="card" style="${card}">
        <input style="border:1px solid #ccc;border-radius:6px;width:200px;height:40px">
        <select style="border:1px solid #ccc;border-radius:6px;width:200px;height:40px"><option>A</option></select>
        <button style="border:1px solid #ccc;border-radius:6px;width:200px;height:48px;transition:background-color .2s ease-out">Go</button>
        <span class="chip" style="display:inline-block;border:1px solid #ccc;border-radius:99px;padding:2px 8px">New</span>
        <img alt="" style="border:1px solid #ccc;border-radius:8px;width:200px;height:120px">
        <pre style="${card}">npm install</pre>
      </form>
      <blockquote style="border-left:4px solid #999;padding-left:12px">A quote, set off by its rule</blockquote>
      <p class="lead" style="border-left:2px solid #111;padding-left:20px">A lead paragraph, set off by its rule</p>
      <section class="card" style="${card}"><div class="drop" style="border:2px dashed #ccc;border-radius:8px;padding:24px">Drop a file here</div></section>
      <div class="shot" aria-hidden="true" style="${card};box-shadow:0 20px 40px rgba(0,0,0,.2)"><div class="pane" style="${card}">A drawn screen</div></div>
      <a class="skip-link" href="#main" style="position:absolute;top:-40px;transition:top .2s ease-out">Skip to content</a>
      <div class="chat" style="${card}"><div><p class="bubble" style="border:1px solid #ddd;border-radius:16px;padding:8px 12px;width:200px">A message, text alone</p></div></div>
      <div class="board" style="${card}"><div class="col"><div class="list"><div class="row"><div class="ticket" style="${card}"><b>ENG-1</b><p>Deep in a board</p></div></div></div></div></div>
      <div class="accordion" style="transition:height .3s ease-out">An accordion that eases out</div>
      <section class="settings" style="${card}">
        <h2>Settings</h2>
        <a class="cta" href="/start" style="display:block;border:1px solid #333;border-radius:8px;padding:24px"><span>Start for free</span></a>
        <div class="frame" style="border:1px solid #ddd;border-radius:6px"><div class="scroll" style="overflow:auto"><table><tr><td>One</td></tr><tr><td>Two</td></tr><tr><td>Three</td></tr></table></div></div>
        <div class="search" style="border:1px solid #ccc;border-radius:8px;padding:4px"><input style="border:0;height:64px;width:300px"></div>
        <div role="tablist" style="${card}"><button role="tab">Month</button><button role="tab">Year</button></div>
        <div role="alert" style="${card}"><strong>Saved</strong><p>Your changes are kept.</p></div>
        <label class="tile" style="${card};display:block"><input type="radio" name="plan"> <span>Monthly</span></label>
        <details style="${card}"><summary>More</summary><p>Hidden text</p></details>
        <div class="ring" style="box-shadow:0 0 0 0 #000;border-radius:8px;padding:24px"><p>A ring of nothing</p></div>
        <dialog open style="${card};position:static"><div class="inner" style="${card}"><h3>In a dialog</h3></div></dialog>
      </section>
      <table style="border-collapse:collapse"><tr><td style="border-left:2px solid #333;padding:8px">Cell</td></tr></table>
      <div role="tablist"><a href="/a" style="display:inline-block;border-bottom:3px solid #2563eb;padding:8px">Active tab</a></div>
      <aside style="border-right:1px solid #e5e5e5;padding:16px;width:200px">Sidebar</aside>
      <div class="toast" style="transition:opacity .2s ease-out, transform .3s cubic-bezier(.16,1,.3,1)">Fades and slides</div>
      <div style="transition:all .2s">Everything, briefly</div>
      <div style="transition:width 0s">Instant</div>`);
    assert.deepEqual(await checkGradientText(page), []);
    assert.deepEqual(await checkSideStripe(page), []);
    assert.deepEqual(await checkNestedCard(page), []);
    assert.deepEqual(await checkBounce(page), []);
  });
});

describe("placeholder", () => {
  test("names every hole left unfilled, in the text, the title, a field's hint, a menu's choice or an image's alt, once in each", async () => {
    const page = await pageWith(`<title>Dès [PRIX]</title>
      <p class="prix">Dès [PRIX] par mois</p>
      <p>Livraison : [À DÉFINIR]</p>
      <p>Prix :<br>[MONTANT €]</p>
      <p>Soit [PRIX (TTC)] au total</p>
      <h2>Bonjour {{prenom}}</h2>
      <p>Lorem ipsum dolor sit amet.</p>
      <p>Total : NaN €</p>
      <span>undefined</span>
      <div>[object Object]</div>
      <p>Ouvert de XX:XX à XX:XX</p>
      <p>TODO : écrire le texte</p>
      <input placeholder="[Votre nom]">
      <select><option>[CHOISIR UNE VILLE]</option><option>Paris</option></select>
      <img alt="[IMAGE]" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
      <p>Dès [PRIX] par mois</p>`);
    const issues = await checkPlaceholder(page);
    const found = issues.map((i) => i.message.match(/"(.*?)"/)?.[1]);
    assert.deepEqual(found.sort(), ["NaN", "TODO :", "XX:XX", "[CHOISIR UNE VILLE]", "[IMAGE]", "[MONTANT €]", "[PRIX (TTC)]", "[PRIX]", "[PRIX]", "[Votre nom]", "[object Object]", "[À DÉFINIR]", "undefined", "{{prenom}}", "Lorem ipsum"].sort());
    assert.deepEqual(issues.filter((i) => i.message.includes('"[PRIX]"')).map((i) => i.element), ['p.prix "Dès [PRIX] par mois"', "title"], "the page's text, and its title too");
    assert.ok(issues.some((i) => i.element === 'p "Prix : [MONTANT €]"'), "a line break keeps words apart");
    assert.match(issues[0]!.message, /a hole left unfilled/);
  });
});

describe("ai-text", () => {
  test("names text about the interface or the demo, in French and in English, once per sentence", async () => {
    const page = await pageWith(`
      <div class="bandeau">Maquette de démonstration</div>
      <p>Ce bouton vous permet d'ajouter un produit à votre commande.</p>
      <p>Cette section regroupe vos dernières commandes.</p>
      <p><a href="/aide">Cliquez<br>ici</a> pour en savoir plus.</p>
      <p>Ici, vous pouvez gérer vos adresses.</p>
      <p>Voici votre démo : trois écrans du produit.</p>
      <footer><small>Données fictives</small></footer>
      <p>Mode démo</p>
      <p>Ceci est un prototype.</p>
      <p>This section shows your latest orders.</p>
      <p>Here you can manage your team.</p>
      <p>Here’s your demo.</p>
      <p>Sample data, for demonstration purposes.</p>`);
    const issues = await checkAiText(page);
    assert.deepEqual(issues.map((i) => i.message.match(/"(.*?)"/)?.[1]), ["Maquette de démonstration", "Ce bouton vous permet", "Cette section regroupe", "Cliquez ici", "Ici, vous pouvez", "Voici votre démo", "Données fictives", "Mode démo", "Ceci est un prototype", "This section shows", "Here you can", "Here’s your demo", "Sample data"]);
    assert.equal(issues[0]!.element, 'div.bandeau "Maquette de démonstration"');
    assert.match(issues[0]!.message, /text about the interface or the demo, not the product/);
  });
});

describe("hollow-words", () => {
  test("names the hollow words of marketing, in French and in English, each once", async () => {
    const page = await pageWith(`
      <h1>Révolutionnez votre façon de vendre</h1>
      <p>Un outil sans<br>effort, qui booste vos ventes en toute simplicité.</p>
      <p>A seamless platform to supercharge your team, effortlessly.</p>
      <p>Révolutionnez vos stocks.</p>`);
    const words = (await checkHollowWords(page)).map((i) => i.message.match(/"(.*?)"/)?.[1]?.toLowerCase());
    assert.deepEqual(words.sort(), ["booste vos", "effortlessly", "en toute simplicité", "révolutionnez", "sans effort", "seamless", "supercharge"].sort());
  });
});

describe("copy a good front writes, never flagged", () => {
  test("an error message, legal notes, a note or a tag between brackets, a column named TODO, a menu, a game, a demo one books, a brand, words used for what they mean", async () => {
    const page = await pageWith(`<title>Commandes · Boutique</title>
      <p role="alert">Ce champ est obligatoire.</p>
      <p>Cette page n'existe pas : revenez à l'accueil.</p>
      <p>Cette page contient des liens d'affiliation. Ce formulaire contient des données personnelles.</p>
      <p>Ce menu contient des allergènes. Cette carte liste nos plats. Cette carte affiche vos points de vie.</p>
      <p>Une note [1] et une autre [sic]. Brochure [PDF], version [FR], [NEW], [BETA], Louis [II].</p>
      <p>Une chaise du XXe siècle, taille XXL, réf. XX-200.</p>
      <p>Événements à venir : date à définir. Lieu : TBD.</p>
      <h3>TODO</h3>
      <p>Expédié sous 48 h, retour gratuit pendant 30 jours.</p>
      <p>Null part ailleurs, vous ne trouverez ces lampes.</p>
      <p>Réservez une démo. Découvrez une maquette de démonstration interactive. Download sample data. Load demo data, or work on fake data named as such.</p>
      <p>Press here to start. Ouvrir un booster. La fusée propulse les satellites. Imprimantes tout-en-un. Leverage 10x. Next Generation Tour. Une idée révolutionnaire en 1789.</p>
      <button aria-label="Empower">E</button>
      <img alt="Unleash logo" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
      <select><option>Paris</option><option>Lyon</option></select>
      <button>Ajouter au panier</button>
      <a href="/commandes">Voir mes commandes</a>
      <code>const x = undefined; // TODO: x</code>
      <pre>{{ template }}</pre>
      <textarea>[PRIX]</textarea>
      <div style="display:none">[PRIX] Cliquez ici, révolutionnez</div>`);
    assert.deepEqual(await checkPlaceholder(page), []);
    assert.deepEqual(await checkAiText(page), []);
    assert.deepEqual(await checkHollowWords(page), []);
  });
});

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { chromium } from "playwright";
import { signIn } from "../capture/index.js";
import { JourneyError, loadJourneys, ReplayError, replayJourneys, type Journey } from "./index.js";

/** A small shop that remembers its basket until /__reset. */
function shop(): Server {
  let basket = 0;
  const page = (body: string) => `<!doctype html><meta charset="utf-8"><title>Shop</title>${body}`;
  const pages: Record<string, (() => string) | undefined> = {
    "/": () => page(`<nav><a href="/products">Produits</a> <a href="/basket">Panier</a> <a href="/help">Aide</a> <a href="https://example.com/">Ailleurs</a></nav><div onclick="location.href='/products'">Découvrir</div>`),
    "/products": () =>
      page(`<table><tr><td>Lampe</td><td><button onclick="fetch('/add',{method:'POST'}).then(()=>location.href='/basket')">Ajouter</button></td></tr>
        <tr><td>Chaise</td><td><button>Ajouter</button></td></tr></table><a href="/">Accueil</a>`),
    "/basket": () => page(`<p>${basket} article${basket > 1 ? "s" : ""}</p><a href="/products">Produits</a>`),
    "/contact": () => page(`<label>Email <input name="email"></label><button onclick="alert('Envoyé')">Envoyer</button>`),
    "/login": () => page(`<form method="post" action="/login"><label>Email <input name="email"></label><label>Password <input name="password" type="password"></label><button>Sign in</button></form>`),
    "/account": () => page(`<h1>My account</h1>`),
  };
  return createServer(async (req, res) => {
    if (req.url === "/login" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const ok = body === "email=ana%40example.test&password=fake-secret-123";
      res.writeHead(303, ok ? { location: "/account", "set-cookie": "session=ok; Path=/" } : { location: "/login" });
      return res.end();
    }
    if (req.url === "/account" && !(req.headers.cookie ?? "").includes("session=ok")) {
      res.writeHead(303, { location: "/login" });
      return res.end();
    }
    if (req.url === "/add" && req.method === "POST") basket++;
    if (req.url === "/__reset") basket = 0;
    if (req.url === "/add" || req.url === "/__reset") return res.end("ok");
    if (req.url === "/help") {
      res.writeHead(500, { "content-type": "text/plain" });
      return res.end("Internal Server Error");
    }
    const render = pages[req.url ?? "/"];
    res.writeHead(render ? 200 : 404, { "content-type": "text/html; charset=utf-8" });
    res.end(render ? render() : "Not Found");
  });
}

describe("replaying journeys", () => {
  let server: Server;
  let url: string;
  let dir: string;
  const reset = () => `node -e "fetch('${url}/__reset')"`;

  before(async () => {
    server = shop();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    url = `http://localhost:${(server.address() as { port: number }).port}`;
    dir = await mkdtemp(join(tmpdir(), "aeom-journey-"));
  });
  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  });

  const out = (name: string) => join(dir, name);
  const buy: Journey = {
    slug: "buy-a-lamp",
    name: "Buy a lamp",
    steps: [
      { do: "open", path: "/" },
      { do: "click", target: { text: "Découvrir" }, lands: "/products" },
      { do: "click", target: { role: "button", name: "Ajouter", within: { role: "row", name: "Lampe" } }, lands: "/basket" },
      { do: "see", text: "1 article" },
    ],
  };

  test("each step is captured at every width, and a sheet lays them out in order", async () => {
    const report = await replayJourneys({ url, journeys: [buy], outDir: out("steps"), widths: [390, 1280], reset: reset() });
    const replay = report.journeys[0]!;
    assert.deepEqual(replay.runs.map((r) => r.width), [390, 1280]);
    for (const run of replay.runs) {
      assert.equal(run.broken, null);
      assert.equal(run.steps.length, 4);
      for (const step of run.steps) assert.ok(existsSync(join(out("steps"), step.capture!)), `${step.capture} exists`);
      assert.ok(existsSync(join(out("steps"), run.sheet)), "the sheet exists");
    }
    assert.ok(existsSync(join(out("steps"), "report.json")));
  });

  test("the report counts the steps, the screens crossed and the steps back", async () => {
    const back: Journey = { slug: "back-and-forth", name: "Back and forth", steps: [{ do: "open", path: "/" }, { do: "click", target: { role: "link", name: "Produits" } }, { do: "click", target: { role: "link", name: "Accueil" } }, { do: "click", target: { role: "link", name: "Panier" } }] };
    const run = (await replayJourneys({ url, journeys: [back], outDir: out("counts"), widths: [1280], reset: reset() })).journeys[0]!.runs[0]!;
    assert.deepEqual(run.screens, ["/", "/products", "/basket"]);
    assert.equal(run.counts.steps, 4);
    assert.equal(run.counts.screens, 3);
    assert.equal(run.counts.back, 1, "returning to / is a step back");
  });

  test("a target that matches several elements says so, and its container settles it", async () => {
    const ambiguous: Journey = { slug: "ambiguous", name: "Ambiguous", steps: [{ do: "open", path: "/products" }, { do: "click", target: { role: "button", name: "Ajouter" } }] };
    const run = (await replayJourneys({ url, journeys: [ambiguous], outDir: out("ambiguous"), widths: [1280], reset: reset() })).journeys[0]!.runs[0]!;
    assert.equal(run.broken?.step, 2);
    assert.match(run.broken!.reason, /2 elements match button "Ajouter".*within/);
  });

  test("a journey that breaks stops at that step and says why, with its capture", async () => {
    const cases: [Journey["steps"], number, RegExp][] = [
      [[{ do: "open", path: "/" }, { do: "click", target: { role: "link", name: "Commandes" } }], 2, /no link "Commandes"/],
      [[{ do: "open", path: "/" }, { do: "click", target: { role: "link", name: "Aide" } }], 2, /answered 500/],
      [[{ do: "open", path: "/" }, { do: "click", target: { role: "link", name: "Ailleurs" } }], 2, /left the app/],
      [[{ do: "open", path: "/" }, { do: "click", target: { role: "link", name: "Produits" }, lands: "/basket" }], 2, /landed on \/products, not \/basket/],
      [[{ do: "open", path: "/basket" }, { do: "see", text: "3 articles" }], 2, /"3 articles" is not on the screen/],
    ];
    for (const [steps, at, reason] of cases) {
      const run = (await replayJourneys({ url, journeys: [{ slug: "broken", name: "Broken", steps }], outDir: out("broken"), widths: [1280], reset: reset() })).journeys[0]!.runs[0]!;
      assert.equal(run.broken?.step, at, `breaks at step ${at}`);
      assert.match(run.broken!.reason, reason);
      assert.equal(run.steps.length, at, "no step after the break");
      assert.ok(existsSync(join(out("broken"), run.steps.at(-1)!.capture!)), "the breaking step has its capture");
    }
  });

  test("a message the page shows in a dialog is recorded, and the journey goes on", async () => {
    const contact: Journey = { slug: "contact", name: "Contact", steps: [{ do: "open", path: "/contact" }, { do: "fill", target: { role: "textbox", name: "Email" }, value: "a@example.test" }, { do: "click", target: { role: "button", name: "Envoyer" } }] };
    const run = (await replayJourneys({ url, journeys: [contact], outDir: out("dialog"), widths: [1280] })).journeys[0]!.runs[0]!;
    assert.equal(run.broken, null);
    assert.equal(run.steps[2]!.dialog, "Envoyé");
  });

  test("with a reset before each journey, replaying twice gives the same result", async () => {
    for (let i = 0; i < 2; i++) {
      const report = await replayJourneys({ url, journeys: [buy], outDir: out(`twice-${i}`), widths: [1280], reset: reset() });
      assert.equal(report.journeys[0]!.runs[0]!.broken, null, `replay ${i + 1} sees "1 article"`);
      assert.equal(report.warnings.length, 0);
    }
  });

  test("journeys start signed in, except one marked signedOut, which can sign in with the account's values", async () => {
    const account = { Email: "ana@example.test", Password: "fake-secret-123" };
    const browser = await chromium.launch();
    const signedIn = await signIn(browser, url, { path: "/login", account, submit: "Sign in" }).finally(() => browser.close());
    const mine: Journey = { slug: "my-account", name: "My account", steps: [{ do: "open", path: "/account" }, { do: "see", text: "My account" }] };
    const signingIn: Journey = {
      slug: "sign-in",
      name: "Sign in",
      signedOut: true,
      steps: [
        { do: "open", path: "/account" },
        { do: "fill", target: { role: "textbox", name: "Email" }, value: { account: "Email" } },
        { do: "fill", target: { text: "Password" }, value: { account: "Password" } },
        { do: "click", target: { role: "button", name: "Sign in" }, lands: "/account" },
      ],
    };
    const report = await replayJourneys({ url, journeys: [mine, signingIn], outDir: out("signed-in"), widths: [1280], reset: reset(), signedIn, account });
    const [account1, signing] = report.journeys.map((j) => j.runs[0]!);
    assert.equal(account1!.broken, null, "the signed-in journey reaches the account");
    assert.equal(signing!.steps[0]!.path, "/login", "the signed-out journey starts on the sign-in page");
    assert.equal(signing!.broken, null, "and signs in with the account's values");
    assert.doesNotMatch(readFileSync(join(out("signed-in"), "report.json"), "utf8"), /fake-secret-123|ana@example\.test/);
  });

  test("without a reset, AEOM warns that journeys changing data can differ", async () => {
    const report = await replayJourneys({ url, journeys: [buy], outDir: out("no-reset"), widths: [1280] });
    assert.match(report.warnings.join("\n"), /No reset command/);
  });
});

describe("journey files", () => {
  test("every journey file in the folder is read, named after its file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aeom-journeys-"));
    try {
      await writeFile(join(dir, "see-my-orders.json"), JSON.stringify({ name: "See my orders", steps: [{ do: "open", path: "/" }, { do: "click", target: { role: "link", name: "Commandes" } }] }));
      const journeys = await loadJourneys(dir);
      assert.deepEqual(journeys.map((j) => [j.slug, j.name, j.steps.length]), [["see-my-orders", "See my orders", 2]]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("a journey file that cannot be replayed is refused with every problem", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aeom-journeys-"));
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "bad.json"), JSON.stringify({ steps: [{ do: "click" }, { do: "fly" }, { do: "click", target: { role: "link" } }] }));
      await writeFile(join(dir, "broken.json"), "{ not json");
      await writeFile(join(dir, "mixed.json"), JSON.stringify({ name: "Mixed", steps: [{ do: "open", path: "/" }, { do: "click", target: { role: "link", name: "A", text: "A" }, lands: "commandes" }] }));
      await assert.rejects(loadJourneys(dir), (error: unknown) => {
        assert.ok(error instanceof JourneyError);
        assert.match(error.message, /bad\.json: no name/);
        assert.match(error.message, /bad\.json: the journey does not start with an open step/);
        assert.match(error.message, /bad\.json, step 1: click needs a target/);
        assert.match(error.message, /bad\.json, step 2: unknown action "fly"/);
        assert.match(error.message, /bad\.json, step 3: a target needs a role and a name, or a text/);
        assert.match(error.message, /broken\.json: not valid JSON/);
        assert.match(error.message, /mixed\.json, step 2: a target is either a role and a name, or a text, not both/);
        assert.match(error.message, /mixed\.json, step 2: lands needs a route starting with \//);
        return true;
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

test("a reset command that fails stops the replay with a message that says so", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-reset-"));
  try {
    const journey: Journey = { slug: "a", name: "A", steps: [{ do: "open", path: "/" }] };
    await assert.rejects(replayJourneys({ url: "http://localhost:1", journeys: [journey], outDir: dir, widths: [390], reset: "node -e \"process.exit(3)\"" }), (error: unknown) => {
      assert.ok(error instanceof ReplayError);
      assert.match((error as Error).message, /The reset command failed before "A"/);
      return true;
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an app served under a path keeps it, and lands can name a query", async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    if (req.url === "/app/") return res.end(`<a href="/app/list?page=2">Suivant</a> <a href="/app/list" target="_blank">Ailleurs</a> <a href="https://example.com/" target="_blank">Dehors</a>`);
    res.end(`<p>Page ${new URL(req.url ?? "/", "http://x").searchParams.get("page") ?? "1"}</p>`);
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const url = `http://localhost:${(server.address() as { port: number }).port}/app/`;
  const dir = await mkdtemp(join(tmpdir(), "aeom-base-"));
  try {
    const next: Journey = { slug: "next", name: "Next", steps: [{ do: "open", path: "/" }, { do: "click", target: { role: "link", name: "Suivant" }, lands: "/list?page=2" }, { do: "see", text: "Page 2" }] };
    const out: Journey = { slug: "out", name: "Out", steps: [{ do: "open", path: "/" }, { do: "click", target: { role: "link", name: "Dehors" } }] };
    const [nextRun, outRun] = (await replayJourneys({ url, journeys: [next, out], outDir: dir, widths: [1280] })).journeys.map((j) => j.runs[0]!);
    assert.equal(nextRun!.broken, null, "the journey opened /app/ and landed on /app/list?page=2");
    assert.deepEqual(nextRun!.screens, ["/", "/list"]);
    assert.match(outRun!.broken?.reason ?? "", /left the app for https:\/\/example\.com\//, "a new tab outside the app is caught");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

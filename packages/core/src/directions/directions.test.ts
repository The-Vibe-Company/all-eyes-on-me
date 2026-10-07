import assert from "node:assert/strict";
import { test } from "node:test";
import { champion, createTournament, nextDuel, voteDuel, type Tournament } from "./index.js";

const decide = (t: Tournament, winnerOf: (a: string, b: string) => string) => {
  for (let duel = nextDuel(t); duel; duel = nextDuel(t)) {
    const winner = winnerOf(duel.a, duel.b!);
    for (const voter of ["1", "2", "3"]) t = voteDuel(t, { duel: duel.id, voter, winner, reason: `${winner} is clearer` });
  }
  return t;
};

test("six directions meet in five duels, and the one that always wins is champion", () => {
  let t = createTournament(["a", "b", "c", "d", "e", "f"]);
  assert.deepEqual(nextDuel(t) && [nextDuel(t)!.a, nextDuel(t)!.b], ["a", "b"]);
  t = decide(t, (a, b) => ([a, b].includes("d") ? "d" : a < b ? a : b));
  assert.equal(champion(t), "d");
  assert.equal(t.duels.filter((d) => d.b !== null).length, 5);
});

test("a duel is decided by the majority of its three votes, with the winners' reasons", () => {
  let t = createTournament(["a", "b"]);
  t = voteDuel(t, { duel: 1, voter: "1", winner: "a", reason: "calmer" });
  t = voteDuel(t, { duel: 1, voter: "2", winner: "b", reason: "bolder" });
  assert.equal(champion(t), null, "two votes do not decide");
  t = voteDuel(t, { duel: 1, voter: "3", winner: "b", reason: "more specific" });
  assert.equal(champion(t), "b");
  assert.deepEqual(t.duels[0]!.reasons, ["bolder", "more specific"]);
});

test("a vote for a direction outside the duel, a second vote by the same voter, or no reason is refused", () => {
  const t = createTournament(["a", "b", "c", "d"]);
  assert.throws(() => voteDuel(t, { duel: 1, voter: "1", winner: "c", reason: "x" }), /not in duel 1/);
  const once = voteDuel(t, { duel: 1, voter: "1", winner: "a", reason: "x" });
  assert.throws(() => voteDuel(once, { duel: 1, voter: "1", winner: "b", reason: "y" }), /already voted/);
  assert.throws(() => voteDuel(t, { duel: 1, voter: "2", winner: "a", reason: " " }), /reason/);
});

test("a direction that did not build can be left out: five entrants still crown one champion", () => {
  let t = createTournament(["a", "b", "c", "d", "e"]);
  t = decide(t, (a, b) => (a < b ? a : b));
  assert.equal(champion(t), "a");
});

test("a contact sheet lays the captures side by side, and marks a direction that did not build", async () => {
  const { mkdtemp, rm, stat } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { chromium } = await import("playwright");
  const { contactSheet, sheetHtml } = await import("./index.js");
  const dir = await mkdtemp(join(tmpdir(), "aeom-sheet-"));
  try {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
      await page.setContent(`<body style="background:#c33">A</body>`);
      await page.screenshot({ path: join(dir, "a.png") });
    } finally {
      await browser.close();
    }
    const items = [{ label: "1", file: join(dir, "a.png") }, { label: "2", file: join(dir, "missing.png") }];
    const html = await sheetHtml(items, 2, 300);
    assert.match(html, /<figure data-label="1"><figcaption><b>1<\/b><\/figcaption><img src="data:image\/png;base64,/);
    assert.match(html, /<figure data-label="2"><figcaption><b>2<\/b><\/figcaption><div class="missing">No capture: this direction did not build\.<\/div>/);
    assert.match(await sheetHtml([{ label: 'a" onload="x', file: join(dir, "a.png") }], 1, 300), /data-label="a&quot; onload=&quot;x"/);
    await contactSheet({ out: join(dir, "sheet.png"), columns: 2, cellWidth: 300, items });
    assert.ok((await stat(join(dir, "sheet.png"))).size > 1000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a tournament needs an odd number of votes per duel", () => {
  for (const votesPerDuel of [0, 2, -1, 1.5]) assert.throws(() => createTournament(["a", "b"], { votesPerDuel }), /positive odd number/);
});

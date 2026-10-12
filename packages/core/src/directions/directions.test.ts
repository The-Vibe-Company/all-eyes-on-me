import assert from "node:assert/strict";
import { test } from "node:test";
import { applied, champion, createTournament, decideDirection, nextDuel, voteDuel, type Tournament } from "./index.js";

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
    const noted = await sheetHtml([{ label: "tissus", file: join(dir, "a.png"), note: "Serves the main loop: choose a piece & follow it." }], 1, 300);
    assert.match(noted, /<img [^>]*><p class="note">Serves the main loop: choose a piece &amp; follow it\.<\/p><\/figure>/, "the note reads under the capture");
    assert.match(await sheetHtml([{ label: "2", caption: 'click "Ajouter"', file: join(dir, "a.png") }], 1, 300), /<figcaption><b>2<\/b> click &quot;Ajouter&quot;<\/figcaption>/, "a caption reads next to the label");
    await contactSheet({ out: join(dir, "sheet.png"), columns: 2, cellWidth: 300, items });
    assert.ok((await stat(join(dir, "sheet.png"))).size > 1000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a tournament needs an odd number of votes per duel", () => {
  for (const votesPerDuel of [0, 2, -1, 1.5]) assert.throws(() => createTournament(["a", "b"], { votesPerDuel }), /positive odd number/);
});

const crowned = () => decide(createTournament(["topo", "balisage", "brume", "bivouac"]), (a, b) => ([a, b].includes("topo") ? "topo" : a < b ? a : b));
const AT = "2026-10-10T09:00:00.000Z";

test("the person validates the judges' champion, or chooses another direction, and the run applies what they decided", () => {
  const t = crowned();
  assert.equal(champion(t), "topo");
  assert.equal(applied(t), null, "nothing is applied before the person decides");
  const ok = decideDirection(t, { at: AT });
  assert.deepEqual(ok.tournament.decision, { applied: "topo", judges: "topo", dropped: [], at: AT });
  assert.equal(applied(ok.tournament), "topo");
  assert.equal(ok.rerun, null);
  const other = decideDirection(t, { choose: "bivouac", drop: ["topo"], why: "Topo reads like a hiking map, not a game.", at: AT });
  assert.deepEqual(other.tournament.decision, { applied: "bivouac", judges: "topo", dropped: ["topo"], why: "Topo reads like a hiking map, not a game.", at: AT });
  assert.equal(applied(other.tournament), "bivouac");
  assert.equal(decideDirection(t, { choose: "grotte", at: AT, directions: [...t.entrants, "grotte"] }).tournament.decision!.applied, "grotte", "a direction the screening took out can still be chosen");
});

test("dropping the judges' champion without choosing asks for a new knockout among the directions left", () => {
  const t = crowned();
  const dropped = decideDirection(t, { drop: ["topo", "balisage"], at: AT });
  assert.deepEqual(dropped.rerun, ["brume", "bivouac"]);
  assert.equal(dropped.tournament.decision, undefined);
  assert.equal(applied(dropped.tournament), null);
  const one = decideDirection(t, { drop: ["topo", "balisage", "brume"], at: AT });
  assert.equal(one.tournament.decision!.applied, "bivouac", "the one direction left is the person's choice");
  assert.deepEqual(decideDirection(t, { drop: ["topo", "balisage", "brume", "bivouac"], at: AT }).rerun, []);
  const kept = decideDirection(t, { drop: ["brume"], at: AT });
  assert.equal(kept.tournament.decision!.applied, "topo", "dropping another direction validates the champion");
});

test("a decision with nothing chosen and no champion, or on a direction that does not exist, is refused", () => {
  assert.throws(() => decideDirection(createTournament(["a", "b"]), { at: AT }), /No knockout was played: choose one of a, b/);
  assert.throws(() => decideDirection(crowned(), { choose: "plage", at: AT }), /plage is not one of the directions: topo, balisage, brume, bivouac/);
  assert.throws(() => decideDirection(crowned(), { drop: ["plage"], at: AT }), /plage is not one of the directions/);
  assert.throws(() => decideDirection(crowned(), { choose: "brume", drop: ["brume"], at: AT }), /brume is both chosen and dropped/);
});

test("one direction left after the screening is champion without a duel, and the person still decides on it", () => {
  const t = createTournament(["grotte"]);
  assert.equal(nextDuel(t), null);
  assert.equal(champion(t), "grotte");
  assert.equal(decideDirection(t, { at: AT }).tournament.decision!.applied, "grotte");
  assert.throws(() => createTournament([]), /at least one direction/);
});

test("a later decision keeps what the person dropped before, unless they now choose it", () => {
  let t = crowned();
  t = decideDirection(t, { drop: ["topo"], choose: "grotte", at: AT, directions: [...t.entrants, "grotte"] }).tournament;
  const again = decideDirection(t, { drop: ["grotte"], at: AT, directions: [...t.entrants, "grotte"] });
  assert.deepEqual(again.rerun, ["balisage", "brume", "bivouac"], "topo stays dropped: it is not applied back");
  const back = decideDirection(t, { choose: "topo", at: AT, directions: [...t.entrants, "grotte"] });
  assert.deepEqual(back.tournament.decision!.dropped, [], "choosing a direction they dropped takes it back");
  assert.equal(back.tournament.decision!.applied, "topo");
});

test("one vote decides a duel, and three the final", () => {
  let t = createTournament(["a", "b", "c", "d"], { votesPerDuel: 1, finalVotes: 3 });
  t = voteDuel(t, { duel: 1, voter: "1", winner: "a", reason: "calmer" });
  assert.equal(t.duels[0]!.winner, "a", "one vote decides a duel of the first round");
  t = voteDuel(t, { duel: 2, voter: "1", winner: "d", reason: "bolder" });
  const final = nextDuel(t)!;
  assert.deepEqual([final.a, final.b, final.needs], ["a", "d", 3]);
  t = voteDuel(t, { duel: final.id, voter: "1", winner: "d", reason: "more specific" });
  assert.equal(champion(t), null, "the final waits for its three votes");
  t = voteDuel(t, { duel: final.id, voter: "2", winner: "a", reason: "calmer" });
  t = voteDuel(t, { duel: final.id, voter: "3", winner: "d", reason: "made for it" });
  assert.equal(champion(t), "d");
  assert.throws(() => createTournament(["a", "b"], { votesPerDuel: 1, finalVotes: 2 }), /odd number/);
});

test("three directions: one duel of one vote, then a final of three", () => {
  let t = createTournament(["a", "b", "c"], { votesPerDuel: 1, finalVotes: 3 });
  assert.deepEqual(t.duels.map((d) => [d.a, d.b, d.needs ?? t.votesPerDuel]), [["a", "b", 1], ["c", null, 1]]);
  t = voteDuel(t, { duel: 1, voter: "1", winner: "b", reason: "x" });
  assert.equal(nextDuel(t)!.needs, 3);
});

test("with no knockout played, the person chooses alone: the decision names no champion of the judges", () => {
  const t = createTournament(["topo", "balisage", "brume"]);
  assert.equal(champion(t), null);
  const chose = decideDirection(t, { choose: "brume", why: "It feels like the game.", at: AT });
  assert.deepEqual(chose.tournament.decision, { applied: "brume", judges: null, dropped: [], why: "It feels like the game.", at: AT });
  assert.equal(applied(chose.tournament), "brume");
  assert.equal(decideDirection(t, { drop: ["topo", "balisage"], at: AT }).tournament.decision!.applied, "brume", "dropping all but one is choosing it");
  assert.throws(() => decideDirection(t, { at: AT }), /No knockout was played: choose one of topo, balisage, brume/);
  // A knockout half played is not over: its champion is still to come.
  const started = voteDuel(t, { duel: nextDuel(t)!.id, voter: "1", winner: nextDuel(t)!.a, reason: "First." });
  assert.throws(() => decideDirection(started, { choose: "brume", at: AT }), /The knockout is not over/);
});

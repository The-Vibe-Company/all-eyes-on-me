import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { acceptVerdicts, DEFAULT_PRINCIPLES_FILE, lazyVotes, JOURNEY_PRINCIPLES_FILE, JudgeVoteError, loadPrinciples, readVotes, tally, toConfirm, type Vote } from "./index.js";

const refuses = (fn: () => unknown, pattern: RegExp) =>
  assert.throws(fn, (error: unknown) => error instanceof JudgeVoteError && pattern.test(error.message));

const principles = [
  { id: "hierarchy", text: "One focal point." },
  { id: "states", text: "Empty states say something." },
];
const pages = ["/", "/commandes"];
const vote = (voter: string, failing: Record<string, string[]> = {}): Vote => ({
  voter,
  pages: Object.fromEntries(
    pages.map((page) => [
      page,
      Object.fromEntries(principles.map((p) => [p.id, { pass: !(failing[page] ?? []).includes(p.id), reason: `${voter} on ${p.id}` }])),
    ]),
  ),
});

test("the base principles file is plain text with an id per principle", async () => {
  const loaded = await loadPrinciples(DEFAULT_PRINCIPLES_FILE);
  assert.ok(loaded.length >= 7);
  assert.ok(loaded.some((p) => p.id === "consistent-chrome"));
  assert.ok(loaded.some((p) => p.id === "states"));
  assert.ok(!loaded.some((p) => p.id === "pointer"), "the cursor is measured by aeom check, not judged");
  assert.ok(loaded.every((p) => /^[a-z-]+$/.test(p.id) && p.text.length > 10));
});

test("a principle fails a page when most votes fail it", () => {
  const report = tally([vote("1", { "/commandes": ["states"] }), vote("2", { "/commandes": ["states"] }), vote("3")], pages, principles);
  const states = report.pages.find((p) => p.page === "/commandes")!.verdicts.find((v) => v.principle === "states")!;
  assert.equal(states.pass, false);
  assert.equal(states.votes, "2/3 fail");
  assert.deepEqual(states.reasons, ["1 on states", "2 on states"], "the reasons given by the majority");
  assert.deepEqual(states.dissent, ["3 on states"], "the minority's reason is kept too");
  assert.equal(report.failures, 1);
});

test("one dissenting vote does not fail a page", () => {
  const report = tally([vote("1", { "/": ["hierarchy"] }), vote("2"), vote("3")], pages, principles);
  assert.equal(report.failures, 0);
  const hierarchy = report.pages.find((p) => p.page === "/")!.verdicts.find((v) => v.principle === "hierarchy")!;
  assert.deepEqual(hierarchy.reasons, ["2 on hierarchy", "3 on hierarchy"]);
  assert.deepEqual(hierarchy.dissent, ["1 on hierarchy"]);
});

test("a tie fails, so a split judge never lets a page through", () => {
  const report = tally([vote("1", { "/": ["hierarchy"] }), vote("2")], pages, principles, { voters: 2 });
  assert.equal(report.failures, 1);
});

test("a vote that skips a page or a principle, or invents one, is refused with every problem listed", () => {
  const broken: Vote = { voter: "2", pages: { "/": { hierarchy: { pass: true, reason: "" }, invented: { pass: false, reason: "" } } } };
  assert.throws(
    () => tally([vote("1"), broken], pages, principles, { voters: 2 }),
    (error: unknown) =>
      error instanceof JudgeVoteError &&
      /voter 2: no verdict for \/commandes/.test(error.message) &&
      /voter 2, \/: no verdict for states/.test(error.message) &&
      /voter 2, \/: unknown principle invented/.test(error.message),
  );
});

test("votes are read from every json file of the votes folder", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-votes-"));
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "1.json"), JSON.stringify(vote("1")));
    await writeFile(join(dir, "2.json"), JSON.stringify(vote("2")));
    await writeFile(join(dir, "notes.txt"), "ignored");
    const votes = await readVotes(dir);
    assert.deepEqual(votes.map((v) => v.voter).sort(), ["1", "2"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("anything but exactly three votes is refused", () => {
  refuses(() => tally([vote("1"), vote("2")], pages, principles), /expected 3 votes, found 2/);
});

test("a verdict without a reason is refused", () => {
  const silent = vote("3");
  silent.pages["/"]!["states"]!.reason = " ";
  refuses(() => tally([vote("1"), vote("2"), silent], pages, principles), /voter 3, \/: no reason for states/);
});

test("judging zero pages is refused", () => {
  refuses(() => tally([vote("1"), vote("2"), vote("3")], [], principles), /no page to judge/);
});

test("a principles file that defines an id twice is refused", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-principles-"));
  try {
    await writeFile(join(dir, "p.md"), "- `grid` — Line up.\n- `grid` — Line up again.\n");
    await assert.rejects(loadPrinciples(join(dir, "p.md")), /grid more than once/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a vote file that is not valid JSON is named, not mistaken for no vote", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-votes-"));
  try {
    await writeFile(join(dir, "1.json"), JSON.stringify(vote("1")));
    await writeFile(join(dir, "2.json"), "{ not json");
    await assert.rejects(readVotes(dir), (error: unknown) => error instanceof JudgeVoteError && /2\.json: not valid JSON/.test(error.message));
    assert.deepEqual(await readVotes(join(dir, "missing")), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the same voter voting twice is refused", () => {
  refuses(() => tally([vote("1"), vote("1"), vote("3")], pages, principles), /voter 1 voted more than once/);
});

test("a list item in the principles file that is not a principle is refused, with its line", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-principles-"));
  try {
    await writeFile(join(dir, "p.md"), "# P\n\n- `grid` — Line up.\n- density: not in the right shape\n");
    await assert.rejects(loadPrinciples(join(dir, "p.md")), /line 4 is a list item but not a principle/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a vote file that cannot be read is named as unreadable, not as invalid JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-votes-"));
  try {
    await mkdir(join(dir, "1.json"));
    await assert.rejects(readVotes(dir), (error: unknown) => error instanceof JudgeVoteError && /1\.json: cannot be read/.test(error.message) && !/not valid JSON/.test(error.message));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("principles files with Windows line endings load, and indented list items are refused", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-principles-"));
  try {
    await writeFile(join(dir, "crlf.md"), "# P\r\n\r\n- `grid` — Line up.\r\n- `density` — Breathe.\r\n");
    assert.deepEqual((await loadPrinciples(join(dir, "crlf.md"))).map((p) => p.id), ["grid", "density"]);
    await writeFile(join(dir, "indented.md"), "- `grid` — Line up.\n  - `density` — Breathe.\n");
    await assert.rejects(loadPrinciples(join(dir, "indented.md")), /line 2 is a list item but not a principle/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the journey principles are plain text too, one id per principle", async () => {
  const loaded = await loadPrinciples(JOURNEY_PRINCIPLES_FILE);
  assert.ok(loaded.length >= 6);
  for (const id of ["clear-start", "next-step", "result-shown", "no-dead-end", "short", "same-words"]) assert.ok(loaded.some((p) => p.id === id), id);
});

test("a journey's verdict keeps the steps the winning side pointed at", () => {
  const journeys = ["see-my-orders"];
  const ps = [{ id: "result-shown", text: "The outcome is shown." }];
  const v = (voter: string, pass: boolean, step?: number): Vote => ({ voter, pages: { "see-my-orders": { "result-shown": { pass, reason: `${voter} says`, ...(step !== undefined ? { step } : {}) } } } });
  const verdict = tally([v("1", false, 3), v("2", false, 2), v("3", true, 1)], journeys, ps).pages[0]!.verdicts[0]!;
  assert.equal(verdict.pass, false);
  assert.deepEqual(verdict.steps, [2, 3]);
  assert.deepEqual(verdict.at, [{ step: 3, reason: "1 says" }, { step: 2, reason: "2 says" }], "each step with the reason of the voter who pointed at it");
  refuses(() => tally([v("1", false, 0), v("2", false, 2), v("3", true)], journeys, ps), /the step for result-shown must be a step number/);
  // A journey's failure points at a step, or nobody can see where it shows; a page vote has no step.
  refuses(() => tally([v("1", false), v("2", false, 2), v("3", true)], journeys, ps, { steps: true }), /voter 1, see-my-orders: no step for result-shown/);
  assert.equal(tally([v("1", false, 3), v("2", false, 2), v("3", true)], journeys, ps, { steps: true }).pages[0]!.verdicts[0]!.pass, false, "a passing verdict needs no step");
});

/** A vote only on some pages and principles, as the voters who confirm the first one's failures give it. */
const partial = (voter: string, on: Record<string, Record<string, boolean>>): Vote => ({
  voter,
  pages: Object.fromEntries(Object.entries(on).map(([page, verdicts]) => [page, Object.fromEntries(Object.entries(verdicts).map(([id, pass]) => [id, { pass, reason: `${voter} on ${id}` }]))])),
});

test("one vote first: what it passes stands, and only what it fails goes to two more voters", () => {
  const first = vote("1", { "/commandes": ["states"], "/": ["hierarchy"] });
  const confirm = toConfirm(first, pages, principles);
  assert.deepEqual(confirm, { "/": ["hierarchy"], "/commandes": ["states"] });
  const report = tally([first, partial("2", { "/commandes": { states: false }, "/": { hierarchy: true } }), partial("3", { "/commandes": { states: false }, "/": { hierarchy: true } })], pages, principles, { confirm });
  const verdict = (page: string, id: string) => report.pages.find((p) => p.page === page)!.verdicts.find((v) => v.principle === id)!;
  assert.deepEqual([verdict("/commandes", "states").pass, verdict("/commandes", "states").votes], [false, "3/3 fail"]);
  assert.deepEqual([verdict("/", "hierarchy").pass, verdict("/", "hierarchy").votes], [true, "2/3 pass"], "the two others overturn a failure the first one alone saw");
  assert.deepEqual([verdict("/", "states").pass, verdict("/", "states").votes], [true, "1/1 pass"]);
  assert.equal(report.failures, 1);
});

test("a first vote that fails nothing is counted alone; a confirming vote that skips what it was asked is refused", () => {
  const clean = vote("1");
  assert.deepEqual(toConfirm(clean, pages, principles), {});
  assert.equal(tally([clean], pages, principles, { confirm: {} }).failures, 0);
  const first = vote("1", { "/commandes": ["states"] });
  const confirm = toConfirm(first, pages, principles);
  refuses(() => tally([first, partial("2", { "/commandes": { states: false } })], pages, principles, { confirm }), /expected 3 votes, found 2/);
  refuses(() => tally([first, partial("2", { "/": { hierarchy: true } }), partial("3", { "/commandes": { states: true } })], pages, principles, { confirm }), /voter 2: no verdict for \/commandes, whose states voter 1 failed/);
  refuses(() => tally([first, partial("2", { "/commandes": { hierarchy: true } }), partial("3", { "/commandes": { states: true } })], pages, principles, { confirm }), /voter 2, \/commandes: no verdict for states, which voter 1 failed/);
  const extra = tally([first, partial("2", { "/commandes": { states: true }, "/": { hierarchy: false } }), partial("3", { "/commandes": { states: true }, "/": { hierarchy: false } })], pages, principles, { confirm });
  assert.equal(extra.pages.find((p) => p.page === "/")!.verdicts.find((v) => v.principle === "hierarchy")!.votes, "1/1 pass", "what the first vote passed is not reopened");
});

test("a principle the sheet accepts on a page passes there as accepted, with its reason and source; elsewhere it still fails", () => {
  const report = tally([vote("1", { "/": ["hierarchy"], "/commandes": ["hierarchy", "states"] }), vote("2", { "/": ["hierarchy"], "/commandes": ["hierarchy", "states"] }), vote("3")], pages, principles);
  assert.equal(report.failures, 3);
  const accepted = acceptVerdicts(report, [{ id: "hierarchy", pages: ["/"], why: "two focal points, as the charter asks.", source: "Victor" }, { id: "states", pages: "all", why: "the empty state is the spec's.", source: "CCTP 2.1" }]);
  const verdict = (page: string, id: string) => accepted.pages.find((p) => p.page === page)!.verdicts.find((v) => v.principle === id)!;
  assert.deepEqual([verdict("/", "hierarchy").pass, verdict("/", "hierarchy").accepted], [true, { why: "two focal points, as the charter asks.", source: "Victor" }]);
  assert.equal(verdict("/commandes", "hierarchy").pass, false, "accepted on / only");
  assert.equal(verdict("/commandes", "states").accepted?.source, "CCTP 2.1");
  assert.equal(accepted.failures, 1);
  assert.equal(acceptVerdicts(report, [{ id: "hierarchy", journeys: "all", why: "x", source: "y" }]).failures, 3, "a journey's exception is not a page's");
});

test("a journey principle the sheet accepts on a journey, by its name or its slug, passes there as accepted", () => {
  const journeys = ["simuler", "commander"];
  const jvote = (voter: string): Vote => ({ voter, pages: Object.fromEntries(journeys.map((j) => [j, { "result-shown": { pass: false, reason: `${voter}: no result` } }])) });
  const report = tally([jvote("1"), jvote("2"), jvote("3")], journeys, [{ id: "result-shown", text: "The result is shown." }]);
  const accepted = acceptVerdicts(report, [{ id: "result-shown", journeys: ["Simuler une aide"], why: "a simulation, as the spec asks.", source: "CCTP 4.2" }], { journeys: [{ slug: "simuler", name: "Simuler une aide" }, { slug: "commander", name: "Commander" }] });
  assert.deepEqual(accepted.pages.map((p) => p.verdicts[0]!.pass), [true, false]);
});

test("what the sheet accepted is counted again from the votes: an exception taken out of the sheet fails again", () => {
  const report = tally([vote("1", { "/": ["hierarchy"] }), vote("2", { "/": ["hierarchy"] }), vote("3")], pages, principles);
  const once = acceptVerdicts(report, [{ id: "hierarchy", pages: ["/"], why: "two focal points.", source: "Victor" }]);
  assert.equal(once.failures, 0);
  const again = acceptVerdicts(once, []);
  assert.equal(again.failures, 1);
  assert.equal(again.pages[0]!.verdicts.find((v) => v.principle === "hierarchy")!.accepted, undefined);
});

const SAID = [
  ["One focal point: the « Commandes » table, under a slim header.", "The list under Mes commandes is blank, with no word saying there is none.", "The total, 128,40 €, reads first.", "Le tableau vide dit « Aucune commande »."],
  ["Le titre « Mes commandes » domine.", "Nothing tells the blank list of orders is empty.", "Header: 3 links, sticky; the total leads.", "The empty table says Aucune commande, in grey."],
  ["The Commandes table is what the eye meets first.", "La liste est vide et rien ne dit pourquoi.", "Le total de 128,40 € passe devant le reste.", "Empty state shown: « Aucune commande » under the table header."],
];
const careful = (voter: string, n = 0, extra: Record<string, string> = {}): Vote => ({
  voter,
  pages: {
    "/": { hierarchy: { pass: true, reason: extra.hierarchy ?? SAID[n]![0]! }, states: { pass: false, reason: SAID[n]![1]! } },
    "/commandes": { hierarchy: { pass: true, reason: SAID[n]![2]! }, states: { pass: true, reason: SAID[n]![3]! } },
  },
});

test("a vote whose reasons name something on the page counts, in English and in French, short or long", () => {
  assert.deepEqual(lazyVotes([careful("1", 0), careful("2", 1), careful("3", 2)]), []);
});

test("a vote of reasons that name nothing, said again and again, or that owns it did not look, is refused with two of its reasons; one copied on another voter's too", () => {
  const lazy: Vote = { voter: "2", pages: { "/": { hierarchy: { pass: true, reason: "Looks good." }, states: { pass: true, reason: "Fine" } }, "/commandes": { hierarchy: { pass: true, reason: "Conforme." }, states: { pass: false, reason: "The list under Commandes is blank." } } } };
  const blind: Vote = careful("1", 0, { hierarchy: "One generic sentence: I did not re-open the captures." });
  const copy: Vote = careful("3", 0);
  const refused = lazyVotes([blind, lazy, copy]);
  assert.deepEqual(refused.map((r) => r.voter), ["1", "2", "3"]);
  assert.match(refused[0]!.why, /says it did not look: "One generic sentence: I did not re-open the captures\."/);
  assert.match(refused[1]!.why, /3 of 4 reasons name nothing on the page, such as "Looks good\." and "Fine"/);
  assert.match(refused[2]!.why, /copies voter 1's reasons: 3 of 4/);
  const same: Vote = { voter: "1", pages: Object.fromEntries(["/", "/a", "/b"].map((p) => [p, { hierarchy: { pass: true, reason: "The page is clean and the hierarchy is clear." }, states: { pass: true, reason: `The empty list on ${p} says « Rien ».` } }])) };
  assert.match(lazyVotes([same])[0]?.why ?? "", /gives the same reason to 3 of 6 verdicts: "The page is clean and the hierarchy is clear\."/);
});

const said = (voter: string, reasons: Record<string, Record<string, string>>): Vote => ({ voter, pages: Object.fromEntries(Object.entries(reasons).map(([page, byId]) => [page, Object.fromEntries(Object.entries(byId).map(([id, reason]) => [id, { pass: true, reason }]))])) });

test("terse careful reasons count, in French and English: a part of the page, a colour, a finding said on three pages of many, a small confirm vote", () => {
  const terse = said("1", {
    "/": { hierarchy: "One focal point: the headline.", "consistent-chrome": "The top bar doesn't change between pages.", "not-ai-default": "Not cream with a serif and a terracotta accent.", grid: "Edges and gutters agree.", density: "Trois blocs de même poids, bien espacés.", states: "Les étapes vides le disent." },
    "/a": { hierarchy: "Le titre en bleu nuit domine.", "consistent-chrome": "The header is the same on every page.", "not-ai-default": "A green palette, no gradient.", grid: "Columns line up with the logo.", density: "Air between the cards.", states: "The error says what to do." },
    "/b": { hierarchy: "The call-to-action leads.", "consistent-chrome": "The header is the same on every page.", "not-ai-default": "Rien d'un poster suisse.", grid: "Alignment holds.", density: "Dense but readable rows.", states: "Empty search explains itself." },
    "/c": { hierarchy: "Whitespace frames the form.", "consistent-chrome": "The header is the same on every page.", "not-ai-default": "Photographs, not stock icons.", grid: "Margins agree.", density: "Two columns, little noise.", states: "Loading keeps its room." },
  });
  assert.deepEqual(lazyVotes([terse]), []);
  assert.deepEqual(lazyVotes([said("2", { "/": { states: "The list says nothing when empty." } })]), [], "a confirm vote of one precise reason");
  assert.deepEqual(lazyVotes([said("2", { "/": { states: "Cohérent." } })]), [], "one thin reason alone never refuses a small vote");
});

test("what still gives a lazy vote away: two sentences of nothing, straight quotes of nothing, one sentence pasted over most verdicts, an admission in other words", () => {
  const nothing = said("1", { "/": { hierarchy: "Looks good. Nothing to report.", states: "Conforme. Rien à signaler.", grid: "L'ensemble est cohérent avec l'esprit du principe.", density: "Looks good overall." } });
  assert.match(lazyVotes([nothing])[0]?.why ?? "", /name nothing on the page/);
  const pasted = said("1", Object.fromEntries(["/", "/a", "/b", "/c"].map((p) => [p, { hierarchy: "The page follows a single, coherent art direction throughout.", states: "The page follows a single, coherent art direction throughout.", grid: `The grid of ${p} holds its columns.` }])));
  assert.match(lazyVotes([pasted])[0]?.why ?? "", /gives the same reason to 8 of 12 verdicts/);
  for (const admit of ["Je n’ai pas regardé les captures.", "I only skimmed the screenshots.", "Based on the previous verdict, it passes.", "I didn’t open the captures."]) assert.match(lazyVotes([said("1", { "/": { hierarchy: admit, states: "The list says nothing when empty." } })])[0]?.why ?? "", /says it did not look/, admit);
});

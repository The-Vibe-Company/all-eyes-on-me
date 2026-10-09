import assert from "node:assert/strict";
import { test } from "node:test";
import { prBody, type ResultPage } from "./index.js";

const page: ResultPage = {
  run: "run-1",
  verdict: { nothingToRedo: false, line: "Measured: 2 screens at 390, 1280 px.", failures: [] },
  direction: { champion: "tissus", sentence: "Sert la boucle principale.", entrants: ["tissus", "plaid"], reasons: ["Made for this shop."], sheet: "directions/sheet.png" },
  screens: [
    { page: "/", status: "kept", count: { before: 10, after: 1 }, widths: [{ width: 390, before: "before/captures/index@390.png", after: "end/captures/index@390.png" }], cleared: ["grid"], still: ["not-generic"], newly: [] },
    { page: "/contact", status: "sent back", count: { before: 8, after: 8 }, back: { verdict: "same", before: 8, after: 8 }, widths: [], cleared: [], still: ["states"], newly: [] },
    { page: "/produits", status: "sent back", count: { before: 6, after: 6 }, back: { verdict: "worse", before: 6, after: 9 }, widths: [], cleared: [], still: [], newly: [] },
    { page: "/aide", status: "does not load", count: null, widths: [], cleared: [], still: [], newly: [] },
  ],
  journeys: [{ slug: "orders", name: "See my orders", status: "kept", why: "3/3 prefer the new one: one click.", broke: { before: null, after: null }, steps: { before: 4, after: 3 }, widths: [], cleared: ["short"], remaining: [] }],
  stillFailing: [{ kind: "principle", where: "/contact", what: "states: the list is blank" }],
  measuredAfter: true,
  features: { entries: [{ slug: "add", name: "Add a product", step: 2, capture: "journeys-end/add@1280-02.png", why: "Ajouter adds nothing.", missing: "A way to put a product in the order." }], more: 0 },
};

test("the PR says in words what the run kept, sent back and could not do, and where the result page is, with no capture", () => {
  const { title, body } = prBody(page, ".aeom/runs/run-1/report.html");
  assert.equal(title, "AEOM: a new direction, tissus (run-1)");
  for (const words of [/tissus/, /Sert la boucle principale\./, /Made for this shop\./, /`\/` kept: 10 → 1 failing/, /`\/aide` does not load/, /See my orders.*kept.*4 → 3 steps/, /one click/, /Add a product.*step 2.*A way to put a product in the order\./, /states: the list is blank/, /`\.aeom\/runs\/run-1\/report\.html`/])
    assert.match(body, words);
  assert.doesNotMatch(body, /\.png|!\[|<img/, "no capture, no image");
});

test("a screen sent back says why: the same as before or worse, with its counts", () => {
  const { body } = prBody(page, ".aeom/runs/run-1/report.html");
  assert.match(body, /`\/contact` sent back, the same as before: 8 → 8 failing\./);
  assert.match(body, /`\/produits` sent back, worse than before: 6 → 9 failing\./);
});

test("a run that kept the style says so in its title", () => {
  const { title, body } = prBody({ ...page, direction: null, verdict: { ...page.verdict!, keepStyle: true } }, ".aeom/runs/run-1/report.html");
  assert.equal(title, "AEOM: the front fixed, its style kept (run-1)");
  assert.match(body, /Style kept/);
});

test("what the judges and the run wrote stays words: no image, no link, no HTML, no heading, no one notified", () => {
  const trap = "See ![x](https://e.example/t.png) <img src=x> and [here](https://e.example), cc @octocat | a \\*b*\n## Approved";
  const { body } = prBody(
    {
      ...page,
      direction: { ...page.direction!, sentence: trap, reasons: [trap] },
      screens: [{ ...page.screens[0]!, page: "/a`b``c" }],
      journeys: [{ ...page.journeys[0]!, why: trap, broke: { before: `it broke at step 2: ${trap}`, after: null } }],
      features: { entries: [{ ...page.features!.entries[0]!, missing: trap }], more: 0 },
      stillFailing: [{ kind: "principle", where: "/a`b``c", what: `grid: ${trap}` }],
    },
    ".aeom/runs/run-1/report.html",
  );
  assert.doesNotMatch(body, /(?<!\\)!(?<!\\)\[/, "no image");
  assert.doesNotMatch(body, /(?<!\\)\[here(?<!\\)\]/, "no link");
  assert.doesNotMatch(body, /(?<!\\)<img/, "no HTML");
  assert.doesNotMatch(body, /(?<!\\)\|/, "no table");
  assert.ok(body.includes("\\\\\\*b\\*"), "a backslash of the run escapes nothing");
  assert.doesNotMatch(body, /^\s*(>\s*)?#+ Approved/m, "no heading of its own");
  assert.doesNotMatch(body, /@octocat/, "no one notified");
  assert.match(body, /@\u200Boctocat/);
  assert.match(body, /```\/a`b``c```/, "a path keeps its backticks inside a longer fence");
  for (const line of body.split("\n").filter((l) => l.includes("octocat"))) assert.match(line, /^(- |> |\*\*)/, "each text on its own line");
});

/** A run of 40 pages, each failing 8 principles, with reasons of `size` characters. */
function huge(size: number): ResultPage {
  const principles = ["grid", "hierarchy", "density", "states", "one-direction", "consistent-chrome", "not-generic", "not-ai-default"];
  const pages = Array.from({ length: 40 }, (_, i) => `/page-${i}`);
  return {
    ...page,
    screens: pages.map((p) => ({ page: p, status: "sent back", count: { before: 8, after: 8 }, back: { verdict: "same", before: 8, after: 8 }, widths: [], cleared: [], still: principles, newly: [] })),
    journeys: Array.from({ length: 45 }, (_, i) => ({ ...page.journeys[0]!, slug: `j${i}`, name: `Journey ${i}`, status: "sent back" as const })),
    stillFailing: pages.flatMap((p) => principles.map((pr) => ({ kind: "principle" as const, where: p, what: `${pr}: ${"the edges disagree ".repeat(size / 19)}` }))),
  };
}

test("a long run's PR names 40 entries a section, then sends to the result page for the rest", () => {
  const { body } = prBody(huge(200), ".aeom/runs/run-1/report.html");
  assert.ok(body.length < 60_000, `${body.length} characters`);
  assert.match(body, /`\/page-39` sent back/);
  assert.match(body, /- …and 5 more, see the result page\./, "journeys past 40");
  assert.match(body, /- …and 280 more, see the result page\./, "still failing past 40");
  assert.equal(body.split("\n").filter((l) => l.startsWith("- `/page-")).length, 80);
});

test("a PR whose entries are too long is cut under 60,000 characters, between two lines, and says where the rest is", () => {
  const { body } = prBody(huge(3000), ".aeom/runs/run-1/report.html");
  assert.ok(body.length < 60_000, `${body.length} characters`);
  assert.match(body, /…cut here: the rest is on the result page, `\.aeom\/runs\/run-1\/report\.html`\.\n\n---\nOpened by All Eyes On Me/);
  assert.ok(body.split("\n").every((l) => !l.startsWith("- `/page-") || /(\.|disagree)$/.test(l)), "no line cut in the middle");
});

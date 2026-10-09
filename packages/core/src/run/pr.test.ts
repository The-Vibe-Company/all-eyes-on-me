import assert from "node:assert/strict";
import { test } from "node:test";
import { prBody, type ResultPage } from "./index.js";

const page: ResultPage = {
  run: "run-1",
  verdict: { nothingToRedo: false, line: "Measured: 2 screens at 390, 1280 px.", failures: [] },
  direction: { champion: "tissus", sentence: "Sert la boucle principale.", entrants: ["tissus", "plaid"], reasons: ["Made for this shop."], sheet: "directions/sheet.png" },
  screens: [
    { page: "/", status: "kept", count: { before: 10, after: 1 }, widths: [{ width: 390, before: "before/captures/index@390.png", after: "end/captures/index@390.png" }], cleared: ["grid"], still: ["not-generic"], newly: [] },
    { page: "/contact", status: "sent back", count: { before: 8, after: 8 }, widths: [], cleared: [], still: ["states"], newly: [] },
    { page: "/aide", status: "does not load", count: null, widths: [], cleared: [], still: [], newly: [] },
  ],
  journeys: [{ slug: "orders", name: "See my orders", status: "kept", why: "3/3 prefer the new one: one click.", broke: { before: null, after: null }, steps: { before: 4, after: 3 }, widths: [], cleared: ["short"], remaining: [] }],
  stillFailing: [{ kind: "principle", where: "/contact", what: "states: the list is blank" }],
  measuredAfter: true,
  features: { entries: [{ slug: "add", name: "Add a product", step: 2, capture: "journeys-end/add@1280-02.png", why: "Ajouter adds nothing.", missing: "A way to put a product in the order." }], more: 0 },
};

test("the PR says in words what the run kept, sent back and could not do, and where the result page is, with no capture", () => {
  const { title, body } = prBody(page, "/home/me/app/.aeom/runs/run-1/report.html");
  assert.equal(title, "AEOM: a new direction, tissus (run-1)");
  for (const words of [/tissus/, /Sert la boucle principale\./, /Made for this shop\./, /`\/` kept: 10 → 1 failing/, /`\/contact` sent back/, /`\/aide` does not load/, /See my orders.*kept.*4 → 3 steps/, /one click/, /Add a product.*step 2.*A way to put a product in the order\./, /states: the list is blank/, /\/home\/me\/app\/\.aeom\/runs\/run-1\/report\.html/])
    assert.match(body, words);
  assert.doesNotMatch(body, /\.png|!\[|<img/, "no capture, no image");
});

test("a run that kept the style says so in its title", () => {
  const { title, body } = prBody({ ...page, direction: null, verdict: { ...page.verdict!, keepStyle: true } }, "/r/report.html");
  assert.equal(title, "AEOM: the front fixed, its style kept (run-1)");
  assert.match(body, /Style kept/);
});

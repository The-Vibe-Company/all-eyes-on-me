import assert from "node:assert/strict";
import { test } from "node:test";
import { globToRegExp, guardJourneys, type JourneyReport, type ServerCall } from "./index.js";

const replay = (calls: Record<string, ServerCall[]>): JourneyReport => ({
  url: "http://x",
  replayedAt: "",
  widths: [1280],
  warnings: [],
  journeys: Object.entries(calls).map(([slug, made]) => ({
    slug,
    name: slug,
    runs: [{ width: 1280, steps: [], calls: made, screens: [], counts: { steps: 0, screens: 0, back: 0 }, broken: null, sheet: "" }],
  })),
});
const call = (method: string, path: string, fields: string[] = [], query: string[] = []): ServerCall => ({ method, path, query, fields });

test("the same calls as before, in any journey, are no feature", () => {
  const before = replay({ orders: [call("GET", "/api/orders")], add: [call("POST", "/add", ["item"])] });
  const after = replay({ orders: [call("GET", "/api/orders"), call("POST", "/add", ["item"])], add: [] });
  assert.deepEqual(guardJourneys({ before, after }), { refused: [], allowed: [] });
});

test("a call the app never made is refused, naming the journey that made it", () => {
  const result = guardJourneys({ before: replay({ add: [] }), after: replay({ add: [call("POST", "/api/panier", ["item"])] }) });
  assert.deepEqual(result.refused, [{ kind: "call", what: "POST /api/panier", why: "a call the app did not make before", journey: "add" }]);
});

test("the same new call or the same new fields, in several journeys and widths, are refused once", () => {
  const before = replay({ add: [call("POST", "/add", ["item"])], orders: [] });
  const after = replay({ add: [call("POST", "/api/panier"), call("POST", "/add", ["item", "quantity"])], orders: [call("POST", "/api/panier"), call("POST", "/add", ["item", "quantity"])] });
  after.journeys[0]!.runs.push({ ...after.journeys[0]!.runs[0]!, width: 390 });
  const result = guardJourneys({ before, after });
  assert.deepEqual(result.refused.map((v) => [v.kind, v.what, v.journey]), [["call", "POST /api/panier", "add"], ["fields", "POST /add", "add"]]);
});

test("new fields sent to a call the app already made are refused too, by name only", () => {
  const result = guardJourneys({ before: replay({ add: [call("POST", "/add", ["item"])] }), after: replay({ add: [call("POST", "/add", ["item", "quantity"], ["coupon"])] }) });
  assert.deepEqual(result.refused.map((v) => [v.kind, v.what, v.why]), [["fields", "POST /add", "sends new fields: quantity, coupon"]]);
});

test("a changed file that holds data or logic is refused; others are not", () => {
  const empty = replay({});
  const result = guardJourneys({ before: empty, after: empty, changed: ["src/lib/db/schema.ts", "src/app/page.tsx", "server.mjs"], protectedFiles: ["src/lib/db/**", "server.mjs"] });
  assert.deepEqual(result.refused.map((v) => v.what), ["src/lib/db/schema.ts", "server.mjs"]);
});

test("what the user asked for explicitly is let through, and nothing else", () => {
  const before = replay({ add: [] });
  const after = replay({ add: [call("POST", "/api/panier", ["item"]), call("DELETE", "/api/compte")] });
  const result = guardJourneys({ before, after, changed: ["server.mjs"], protectedFiles: ["server.mjs"], allow: ["POST /api/panier", "server.mjs"] });
  assert.deepEqual(result.allowed.map((v) => v.what), ["POST /api/panier", "server.mjs"]);
  assert.deepEqual(result.refused.map((v) => v.what), ["DELETE /api/compte"]);
});

test("globs cross folders with ** and stay in one with *", () => {
  assert.ok(globToRegExp("src/lib/db/**").test("src/lib/db/schema.ts"));
  assert.ok(globToRegExp("src/**/route.ts").test("src/app/api/cards/route.ts"));
  assert.ok(globToRegExp("src/**/route.ts").test("src/route.ts"));
  assert.ok(!globToRegExp("src/*.ts").test("src/lib/x.ts"));
  assert.ok(globToRegExp("scripts/add-*.ts").test("scripts/add-guardian.ts"));
  assert.ok(globToRegExp("db/v?.sql").test("db/v2.sql"));
  assert.ok(!globToRegExp("db/v?.sql").test("db/v10.sql"), "? is one character");
  assert.ok(!globToRegExp("a?b").test("a/b"), "? stays in one folder");
});

test("screens several journeys cross go to one worker, the rest to their own journey", async () => {
  const { planJourneyWave } = await import("./index.js");
  const run = (screens: string[]) => ({ width: 1280, steps: [], calls: [], screens, counts: { steps: 0, screens: 0, back: 0 }, broken: null, sheet: "" });
  const wave = planJourneyWave({
    url: "http://x",
    replayedAt: "",
    widths: [390, 1280],
    warnings: [],
    journeys: [
      { slug: "orders", name: "See my orders", runs: [run(["/", "/produits", "/commandes"]), run(["/", "/commandes"])] },
      { slug: "contact", name: "Contact", runs: [run(["/", "/contact"])] },
      { slug: "sign-in", name: "Sign in", runs: [run(["/", "/connexion", "/commandes"])] },
    ],
  });
  assert.deepEqual(wave.shared, ["/", "/commandes"]);
  assert.deepEqual(wave.own, { orders: ["/produits"], contact: ["/contact"], "sign-in": ["/connexion"] });
});

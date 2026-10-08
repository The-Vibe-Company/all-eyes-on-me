// The star count: GitHub's number when it answers, no number and no error when it does not.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { REPO, keptStarCount, starCount, starsResponse } from "./stars.mjs";

const github = (status, body) => async (url) => {
  assert.equal(url, `https://api.github.com/repos/${REPO}`);
  return new Response(JSON.stringify(body), { status });
};

test("the count is the repository's stargazers on GitHub", async () => {
  assert.equal(await starCount(github(200, { stargazers_count: 1234 })), 1234);
});

test("no count when GitHub refuses, fails, times out or answers nonsense", async () => {
  assert.equal(await starCount(github(403, { message: "API rate limit exceeded" })), null);
  assert.equal(await starCount(github(500, {})), null);
  assert.equal(await starCount(async () => { throw new TypeError("fetch failed"); }), null);
  assert.equal(await starCount(github(200, { stargazers_count: "many" })), null);
  assert.equal(await starCount(async () => new Response("<html>", { status: 200 })), null);
});

test("a GitHub that never answers is given up on, with no count", { timeout: 2000 }, async () => {
  const hangs = (_, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
  // AbortSignal.timeout does not hold Node open on its own; a server would.
  const holdOpen = setTimeout(() => {}, 1500);
  const started = Date.now();
  try {
    assert.equal(await starCount(hangs, { timeoutMs: 50 }), null);
    assert.ok(Date.now() - started < 1000, "the request is aborted, not left waiting");
  } finally {
    clearTimeout(holdOpen);
  }
});

test("GitHub is asked once per window, and once at a time", async () => {
  let calls = 0;
  let clock = 0;
  const count = keptStarCount({ now: () => clock, fetchImpl: async () => (calls++, new Response(JSON.stringify({ stargazers_count: 5 }))) });
  assert.deepEqual(await Promise.all([count(), count(), count()]), [5, 5, 5]);
  assert.equal(calls, 1, "requests arriving together share one call");
  clock += 9 * 60_000;
  assert.equal(await count(), 5);
  assert.equal(calls, 1, "a count is reused for 10 minutes");
  clock += 2 * 60_000;
  await count();
  assert.equal(calls, 2, "then GitHub is asked again");
});

test("a missing count is retried after a minute, not ten", async () => {
  let calls = 0;
  let clock = 0;
  const count = keptStarCount({ now: () => clock, fetchImpl: async () => (calls++, new Response("{}", { status: 403 })) });
  assert.equal(await count(), null);
  clock += 61_000;
  await count();
  assert.equal(calls, 2);
});

test("/api/stars answers 200 either way, so the browser never logs an error", async () => {
  const up = await starsResponse(async () => 7);
  assert.equal(up.status, 200);
  assert.deepEqual(await up.json(), { stars: 7 });
  const down = await starsResponse(async () => null);
  assert.equal(down.status, 200);
  assert.deepEqual(await down.json(), { stars: null });
  assert.match(down.headers.get("cache-control"), /s-maxage=60\b/);
  assert.doesNotMatch(up.headers.get("cache-control"), /stale-while-revalidate=(?!600\b)\d+/, "a stale count is served for 10 minutes at most");
});

test("the Star on GitHub button has a place for the count, hidden until there is one", () => {
  const page = readFileSync(new URL("pages/index.html", import.meta.url), "utf8");
  assert.match(page, />Star on GitHub<span class="btn__count" data-stars hidden><\/span><\/a>/);
  const kit = readFileSync(new URL("shared/kit.js", import.meta.url), "utf8");
  assert.match(kit, /fetch\("\/api\/stars"\)/);
  assert.doesNotMatch(kit, /api\.github\.com/);
});

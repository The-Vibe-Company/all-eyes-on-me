// The star count: GitHub's number when it answers, no number and no error when it does not.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { REPO, starCount, starsResponse } from "./stars.mjs";

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
  assert.equal(await starCount(async () => { throw new DOMException("timed out", "TimeoutError"); }), null);
  assert.equal(await starCount(github(200, { stargazers_count: "many" })), null);
  assert.equal(await starCount(async () => new Response("<html>", { status: 200 })), null);
});

test("/api/stars answers 200 either way, so the browser never logs an error", async () => {
  const up = await starsResponse(github(200, { stargazers_count: 7 }));
  assert.equal(up.status, 200);
  assert.deepEqual(await up.json(), { stars: 7 });
  const down = await starsResponse(github(403, {}));
  assert.equal(down.status, 200);
  assert.deepEqual(await down.json(), { stars: null });
  assert.match(down.headers.get("cache-control"), /s-maxage=60\b/);
});

test("the Star on GitHub button has a place for the count, hidden until there is one", () => {
  const page = readFileSync(new URL("pages/index.html", import.meta.url), "utf8");
  assert.match(page, />Star on GitHub<span class="btn__count" data-stars hidden><\/span><\/a>/);
  const kit = readFileSync(new URL("shared/kit.js", import.meta.url), "utf8");
  assert.match(kit, /fetch\("\/api\/stars"\)/);
  assert.doesNotMatch(kit, /api\.github\.com/);
});

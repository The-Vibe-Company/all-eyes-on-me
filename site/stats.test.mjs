// /api/stats is read-only and answers only to its bearer token. The five
// counts are AEOM installs in PostHog; without a personal API key, or when
// PostHog does not answer them, each one is null.
import assert from "node:assert/strict";
import { test } from "node:test";
import { POSTHOG_APP_HOST, POSTHOG_PROJECT_ID, installCounts, statsResponse } from "./stats.mjs";

const TOKEN = "stats-token";
const env = { STATS_TOKEN: TOKEN };
const NULLS = {
  total_users: null,
  new_users_1d: null,
  new_users_7d: null,
  active_users_1d: null,
  active_users_7d: null,
};
const COUNTS = {
  total_users: 9,
  new_users_1d: 1,
  new_users_7d: 4,
  active_users_1d: 2,
  active_users_7d: 6,
};

function ask(headers, askEnv = env, fetchImpl) {
  return statsResponse(new Request("http://localhost/api/stats", { headers }), askEnv, fetchImpl);
}

const posthog = (status, body) => async (url, init) => {
  assert.equal(url, `${POSTHOG_APP_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`);
  assert.equal(init.method, "POST");
  assert.equal(init.headers.authorization, "Bearer phx_test");
  const sent = JSON.parse(init.body);
  assert.equal(sent.query.kind, "HogQLQuery");
  assert.match(sent.query.query, /event IN \('cli installed', 'cli command'\)/);
  assert.match(sent.query.query, /properties\.\$lib = 'aeom-cli'/);
  assert.match(sent.query.query, /distinct_id/);
  assert.doesNotMatch(sent.query.query, /\$pageview/);
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
};

test("without a personal API key, the bearer token returns the five counts, each null", async () => {
  let called = false;
  const response = await ask({ authorization: `Bearer ${TOKEN}` }, env, async () => {
    called = true;
    return new Response("no");
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), NULLS);
  assert.equal(called, false, "the public token cannot read, so PostHog is not asked");
});

test("the bearer token returns the five install counts PostHog counted", async () => {
  const response = await ask(
    { authorization: `Bearer ${TOKEN}` },
    { ...env, POSTHOG_PERSONAL_API_KEY: "phx_test", POSTHOG_KEY: "phc_public" },
    posthog(200, { columns: Object.keys(COUNTS), results: [Object.values(COUNTS)] }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.text();
  assert.deepEqual(JSON.parse(body), COUNTS);
  assert.equal(body.includes("phx_test"), false, "the personal key never leaves in the answer");
  assert.equal(body.includes("phc_public"), false);
});

test("numeric strings are counts, and a quiet project is zeros rather than null", async () => {
  const row = ["3", "0", "1", "0", "2"];
  assert.deepEqual(
    await installCounts({ POSTHOG_PERSONAL_API_KEY: "phx_test" }, posthog(200, { results: [row] })),
    { total_users: 3, new_users_1d: 0, new_users_7d: 1, active_users_1d: 0, active_users_7d: 2 },
  );
});

test("a missing, wrong, or unset token is refused, and PostHog is not asked", async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return new Response("no");
  };
  const withKey = { ...env, POSTHOG_PERSONAL_API_KEY: "phx_test" };
  const cases = [
    ask({}, env, fetchImpl),
    ask({ authorization: "Bearer wrong" }, withKey, fetchImpl),
    ask({ authorization: `bearer ${TOKEN}` }, withKey, fetchImpl),
    ask({ authorization: `Bearer ${TOKEN}extra` }, withKey, fetchImpl),
    ask({ authorization: "Bearer" }, withKey, fetchImpl),
    ask({ authorization: `Token ${TOKEN}` }, withKey, fetchImpl),
    ask({ authorization: `Bearer ${TOKEN}` }, {}, fetchImpl),
    ask({ authorization: `Bearer ${TOKEN}` }, { STATS_TOKEN: "" }, fetchImpl),
    ask({ authorization: `Bearer ${TOKEN}` }, { STATS_TOKEN: "  " }, fetchImpl),
  ];
  for (const pending of cases) {
    const response = await pending;
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("www-authenticate"), "Bearer");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(await response.text(), "Unauthorized");
  }
  assert.equal(called, false);
});

test("PostHog refusing, failing, or answering something else leaves every count null", async () => {
  const withKey = { ...env, POSTHOG_PERSONAL_API_KEY: "phx_test" };
  const bodies = [
    posthog(401, { detail: "Authentication credentials were not provided." }),
    posthog(500, {}),
    posthog(200, { error: "Unable to resolve field" }),
    posthog(200, { results: [] }),
    posthog(200, { columns: Object.keys(COUNTS), results: [[9, 1, null, 2, 6]] }),
    posthog(200, "<html>"),
    async () => {
      throw new TypeError("fetch failed");
    },
  ];
  for (const fetchImpl of bodies) {
    assert.deepEqual(await installCounts(withKey, fetchImpl), NULLS);
  }
});

test("a PostHog that never answers is given up on, with no counts", { timeout: 2000 }, async () => {
  const hangs = (_, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
  const holdOpen = setTimeout(() => {}, 1500);
  const started = Date.now();
  try {
    assert.deepEqual(await installCounts({ POSTHOG_PERSONAL_API_KEY: "phx_test" }, hangs, { timeoutMs: 50 }), NULLS);
    assert.ok(Date.now() - started < 1000, "the request is aborted, not left waiting");
  } finally {
    clearTimeout(holdOpen);
  }
});

test("the project and the host can be pointed elsewhere, and a bad one is not asked", async () => {
  let seen = null;
  const fetchImpl = async (url) => {
    seen = url;
    return new Response(JSON.stringify({ columns: Object.keys(COUNTS), results: [Object.values(COUNTS)] }));
  };
  const counted = await installCounts(
    { POSTHOG_PERSONAL_API_KEY: "phx_test", POSTHOG_PROJECT_ID: "42", POSTHOG_API_HOST: "https://eu.posthog.com" },
    fetchImpl,
  );
  assert.deepEqual(counted, COUNTS);
  assert.equal(seen, "https://eu.posthog.com/api/projects/42/query/");

  seen = null;
  for (const bad of [
    { POSTHOG_PERSONAL_API_KEY: "  ", POSTHOG_PROJECT_ID: "666519" },
    { POSTHOG_PERSONAL_API_KEY: "phx_test", POSTHOG_PROJECT_ID: "nope" },
    { POSTHOG_PERSONAL_API_KEY: "phx_test", POSTHOG_API_HOST: "http://us.posthog.com" },
    { POSTHOG_PERSONAL_API_KEY: "phx_test", POSTHOG_API_HOST: "https://us.posthog.com/query" },
    { POSTHOG_KEY: "phc_public" },
  ]) {
    assert.deepEqual(await installCounts(bad, fetchImpl), NULLS);
  }
  assert.equal(seen, null, "a public token or a bad host is not sent anywhere");
});

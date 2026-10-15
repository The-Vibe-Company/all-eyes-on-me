// /api/stats is read-only and answers only to its bearer token. With no
// accounts, every count is null.
import assert from "node:assert/strict";
import { test } from "node:test";
import { statsResponse } from "./stats.mjs";

const TOKEN = "stats-token";
const env = { STATS_TOKEN: TOKEN };
const COUNTS = {
  total_users: null,
  new_users_1d: null,
  new_users_7d: null,
  active_users_1d: null,
  active_users_7d: null,
};

function ask(headers, askEnv = env) {
  return statsResponse(new Request("http://localhost/api/stats", { headers }), askEnv);
}

test("the bearer token returns the five counts, each null", async () => {
  const response = ask({ authorization: `Bearer ${TOKEN}` });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), COUNTS);
});

test("a missing, wrong, or unset token is refused", async () => {
  const cases = [
    ask({}),
    ask({ authorization: "Bearer wrong" }),
    ask({ authorization: `bearer ${TOKEN}` }),
    ask({ authorization: `Bearer ${TOKEN}extra` }),
    ask({ authorization: "Bearer" }),
    ask({ authorization: `Token ${TOKEN}` }),
    ask({ authorization: `Bearer ${TOKEN}` }, {}),
    ask({ authorization: `Bearer ${TOKEN}` }, { STATS_TOKEN: "" }),
  ];
  for (const response of cases) {
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("www-authenticate"), "Bearer");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(await response.text(), "Unauthorized");
  }
});

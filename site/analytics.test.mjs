// Page views go to PostHog. The key is POSTHOG_KEY when it is a public token,
// and the project's public key otherwise.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DEFAULT_POSTHOG_KEY, POSTHOG_HOST, posthogKey, posthogKeyScript } from "./analytics.mjs";
import { renderPage } from "./render.mjs";

test("POSTHOG_KEY is used when it is a public token, and the default otherwise", () => {
  assert.equal(posthogKey({}), DEFAULT_POSTHOG_KEY);
  assert.equal(posthogKey({ POSTHOG_KEY: "" }), DEFAULT_POSTHOG_KEY);
  assert.equal(posthogKey({ POSTHOG_KEY: "  phc_customKey123  " }), "phc_customKey123");
  assert.equal(posthogKey({ POSTHOG_KEY: "</script>" }), DEFAULT_POSTHOG_KEY);
  assert.equal(posthogKey({ POSTHOG_KEY: "not-a-token" }), DEFAULT_POSTHOG_KEY);
  assert.equal(DEFAULT_POSTHOG_KEY, "phc_t2nnd67anazLHswBGWQNA62esC2v4im5PBaV7QhyhPKw");
  assert.equal(POSTHOG_HOST, "https://us.i.posthog.com");
});

test("the key script is a JSON string, so a token cannot break out of it", () => {
  assert.equal(posthogKeyScript({ POSTHOG_KEY: "phc_abc" }), '<script>window.AEOM_POSTHOG_KEY="phc_abc"</script>');
});

test("every page names the key and loads the script that captures pageviews", async () => {
  const script = readFileSync(new URL("shared/analytics.js", import.meta.url), "utf8");
  assert.match(script, /\/static\/array\.js/);
  assert.match(script, /api_host: "https:\/\/us\.i\.posthog\.com"/);
  assert.match(script, /capture_pageview: true/);
  assert.match(script, /window\.AEOM_POSTHOG_KEY/);
  for (const file of ["index.html", "commands.html"]) {
    const html = await renderPage(file, { POSTHOG_KEY: "phc_fromEnv" });
    assert.match(html, /<script>window\.AEOM_POSTHOG_KEY="phc_fromEnv"<\/script>\s*<script src="\/shared\/analytics\.js" defer><\/script>/);
    assert.doesNotMatch(html, /<!-- posthog-key -->/);
  }
  const fallback = await renderPage("index.html", {});
  assert.match(fallback, new RegExp(`window\\.AEOM_POSTHOG_KEY="${DEFAULT_POSTHOG_KEY}"`));
});

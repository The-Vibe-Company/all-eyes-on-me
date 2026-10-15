// The landing's PostHog project. POSTHOG_KEY overrides the public default when
// it is itself a public project token (phc_…); anything else is ignored so a
// bad value cannot be written into the page.

export const POSTHOG_HOST = "https://us.i.posthog.com";
export const DEFAULT_POSTHOG_KEY = "phc_t2nnd67anazLHswBGWQNA62esC2v4im5PBaV7QhyhPKw";

const TOKEN = /^phc_[A-Za-z0-9]+$/;

/** The project token the page should load: POSTHOG_KEY, or the public default. */
export function posthogKey(env = process.env) {
  const key = typeof env.POSTHOG_KEY === "string" ? env.POSTHOG_KEY.trim() : "";
  return TOKEN.test(key) ? key : DEFAULT_POSTHOG_KEY;
}

/** Hands that token to /shared/analytics.js, which loads posthog-js. */
export function posthogKeyScript(env = process.env) {
  return `<script>window.AEOM_POSTHOG_KEY=${JSON.stringify(posthogKey(env))}</script>`;
}

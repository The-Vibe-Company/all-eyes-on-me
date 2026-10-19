// Install counts for the weekly audit. AEOM has no accounts: a user is an
// install, the random id the CLI sends to PostHog as distinct_id on
// `cli installed` and `cli command`. The landing's public token
// (site/analytics.mjs) can only write events, so POSTHOG_PERSONAL_API_KEY
// reads them. POSTHOG_PROJECT_ID defaults to this project; POSTHOG_API_HOST
// defaults to the US app host. Landing pageviews are not installs. Without
// the key, or when PostHog does not answer with the five counts, each is null.
import { createHash, timingSafeEqual } from "node:crypto";

export const POSTHOG_APP_HOST = "https://us.posthog.com";
export const POSTHOG_PROJECT_ID = "666519";

const FIELDS = ["total_users", "new_users_1d", "new_users_7d", "active_users_1d", "active_users_7d"];

const UNAVAILABLE = Object.fromEntries(FIELDS.map((field) => [field, null]));

// All installs since the project exists. New and active are rolling windows
// of 24 hours and 7 days ending now. distinct_id is the install id: the CLI
// asks PostHog not to build a person profile.
const QUERY = `SELECT
  count() AS total_users,
  countIf(first_seen >= now() - INTERVAL 1 DAY) AS new_users_1d,
  countIf(first_seen >= now() - INTERVAL 7 DAY) AS new_users_7d,
  countIf(last_seen >= now() - INTERVAL 1 DAY) AS active_users_1d,
  countIf(last_seen >= now() - INTERVAL 7 DAY) AS active_users_7d
FROM (
  SELECT
    distinct_id,
    min(timestamp) AS first_seen,
    max(timestamp) AS last_seen
  FROM events
  WHERE timestamp >= toDateTime('2026-01-01 00:00:00')
    AND event IN ('cli installed', 'cli command')
    AND properties.$lib = 'aeom-cli'
  GROUP BY distinct_id
)`;

function bearerOk(header, token) {
  if (!token || typeof header !== "string") return false;
  const prefix = "Bearer ";
  if (header.length !== prefix.length + token.length || !header.startsWith(prefix)) return false;
  const expected = createHash("sha256").update(token).digest();
  const given = createHash("sha256").update(header.slice(prefix.length)).digest();
  return timingSafeEqual(expected, given);
}

function personalKey(env) {
  const key = typeof env.POSTHOG_PERSONAL_API_KEY === "string" ? env.POSTHOG_PERSONAL_API_KEY.trim() : "";
  return key || null;
}

function projectId(env) {
  const raw = typeof env.POSTHOG_PROJECT_ID === "string" ? env.POSTHOG_PROJECT_ID.trim() : "";
  const id = raw || POSTHOG_PROJECT_ID;
  return /^\d+$/.test(id) ? id : null;
}

/** The app host that serves the query API, never the ingestion host. */
function apiHost(env) {
  const raw = typeof env.POSTHOG_API_HOST === "string" ? env.POSTHOG_API_HOST.trim() : "";
  if (!raw) return POSTHOG_APP_HOST;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function unavailable() {
  return { ...UNAVAILABLE };
}

function countsFrom(body) {
  if (!body || body.error) return unavailable();
  const row = body.results?.[0];
  if (!Array.isArray(row)) return unavailable();
  const names = Array.isArray(body.columns) ? body.columns : FIELDS;
  const counts = {};
  for (const field of FIELDS) {
    const value = row[names.indexOf(field)];
    const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0) return unavailable();
    counts[field] = n;
  }
  return counts;
}

/** The five counts, or nulls when PostHog cannot be asked or does not answer them. */
export async function installCounts(env = process.env, fetchImpl = fetch, { timeoutMs = 8000 } = {}) {
  const key = personalKey(env);
  const project = projectId(env);
  const host = apiHost(env);
  if (!key || !project || !host) return unavailable();
  try {
    const response = await fetchImpl(`${host}/api/projects/${project}/query/`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query: QUERY } }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return unavailable();
    return countsFrom(await response.json());
  } catch {
    return unavailable();
  }
}

/** GET /api/stats. 401 unless Authorization is Bearer and the secret in STATS_TOKEN. */
export async function statsResponse(request, env = process.env, fetchImpl = fetch) {
  if (!bearerOk(request.headers.get("authorization"), env.STATS_TOKEN)) {
    return new Response("Unauthorized", {
      status: 401,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "www-authenticate": "Bearer",
        "cache-control": "no-store",
      },
    });
  }
  return new Response(JSON.stringify(await installCounts(env, fetchImpl)), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

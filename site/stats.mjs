// Read-only counts for the landing. There are no accounts, so each count is
// null: nothing here has a total, a signup, or an active user to report.
import { createHash, timingSafeEqual } from "node:crypto";

const COUNTS = {
  total_users: null,
  new_users_1d: null,
  new_users_7d: null,
  active_users_1d: null,
  active_users_7d: null,
};

function bearerOk(header, token) {
  if (!token || typeof header !== "string") return false;
  const prefix = "Bearer ";
  if (header.length !== prefix.length + token.length || !header.startsWith(prefix)) return false;
  const expected = createHash("sha256").update(token).digest();
  const given = createHash("sha256").update(header.slice(prefix.length)).digest();
  return timingSafeEqual(expected, given);
}

/** GET /api/stats. 401 unless Authorization is Bearer and the secret in STATS_TOKEN. */
export function statsResponse(request, env = process.env) {
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
  return new Response(JSON.stringify(COUNTS), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

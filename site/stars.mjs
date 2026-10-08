// The repository's star count, read from GitHub on the server so a visitor's
// browser never calls GitHub itself. When GitHub is slow, down or limits the
// calls, the answer is still a 200, with no number, and the page stays quiet.
export const REPO = "The-Vibe-Company/all-eyes-on-me";

/** How long an answer is reused: a count for 10 minutes, a missing count for 1. */
const KEEP = { count: 600_000, none: 60_000 };

export async function starCount(fetchImpl = fetch, { timeoutMs = 3000 } = {}) {
  try {
    const response = await fetchImpl(`https://api.github.com/repos/${REPO}`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "aeom-landing" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const { stargazers_count: stars } = await response.json();
    return Number.isInteger(stars) && stars >= 0 ? stars : null;
  } catch {
    return null;
  }
}

/**
 * A star count that asks GitHub at most once per KEEP window, and once at a
 * time: requests that arrive while GitHub is being asked share that answer.
 */
export function keptStarCount({ fetchImpl = fetch, now = Date.now, timeoutMs } = {}) {
  let kept = null;
  let asking = null;
  return () => {
    if (kept && now() - kept.at < (kept.stars === null ? KEEP.none : KEEP.count)) return Promise.resolve(kept.stars);
    asking ??= starCount(fetchImpl, { timeoutMs }).then((stars) => {
      kept = { stars, at: now() };
      asking = null;
      return stars;
    });
    return asking;
  };
}

const stars = keptStarCount();

export async function starsResponse(count = stars) {
  const value = await count();
  return new Response(JSON.stringify({ stars: value }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": value === null ? `public, s-maxage=${KEEP.none / 1000}` : `public, s-maxage=${KEEP.count / 1000}, stale-while-revalidate=${KEEP.count / 1000}`,
    },
  });
}

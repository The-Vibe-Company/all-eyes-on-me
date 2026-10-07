// The repository's star count, read from GitHub on the server so a visitor's
// browser never calls GitHub itself. When GitHub is slow, down or limits the
// calls, the answer is still a 200, with no number, and the page stays quiet.
export const REPO = "The-Vibe-Company/all-eyes-on-me";

export async function starCount(fetchImpl = fetch) {
  try {
    const response = await fetchImpl(`https://api.github.com/repos/${REPO}`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "aeom-landing" },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const { stargazers_count: stars } = await response.json();
    return Number.isInteger(stars) && stars >= 0 ? stars : null;
  } catch {
    return null;
  }
}

export async function starsResponse(fetchImpl = fetch) {
  const stars = await starCount(fetchImpl);
  return new Response(JSON.stringify({ stars }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      // A missing count is cached for a minute only, so the number comes back soon.
      "cache-control": stars === null ? "public, s-maxage=60" : "public, s-maxage=600, stale-while-revalidate=86400",
    },
  });
}

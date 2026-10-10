/**
 * A route that names records, such as /sessions/123, is a different route at
 * every visit when visiting makes the record (GET /sessions/new sends to a new
 * one): capture, check and the judges then name one screen two ways. Its
 * shape, /sessions/:id, is the same, and pairs them.
 */

/**
 * A segment or a query value that names one record: a number, a UUID, or a
 * token of ten characters or more with no hyphen, holding letters and at
 * least two digits (a cuid, a nanoid, a hash). A slug such as web3-app or
 * iphone-15 is a screen of its own.
 */
const isId = (part: string) =>
  /^\d+$/.test(part) ||
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(part) ||
  (/^[A-Za-z0-9_]{10,}$/.test(part) && /[A-Za-z]/.test(part) && (part.match(/\d/g) ?? []).length >= 2);

/** A route with the record ids of its path and query replaced by :id. */
export function pageShape(route: string): string {
  const [path = "", query] = route.split("?");
  const shapedPath = path.split("/").map((segment) => (segment && isId(segment) ? ":id" : segment)).join("/");
  if (query === undefined) return shapedPath;
  const shapedQuery = new URLSearchParams(query);
  for (const [key, value] of [...shapedQuery]) if (isId(value)) shapedQuery.set(key, ":id");
  return `${shapedPath}?${shapedQuery.toString().replace(/%3Aid/g, ":id")}`;
}

/**
 * Pairs the routes of two lists that name the same screens: the same route
 * first, then, among those left, routes of the same shape, in order. Returns,
 * for each route of `b` that has one, its partner in `a`.
 */
export function pairRoutes(a: string[], b: string[]): Map<string, string> {
  const pairs = new Map<string, string>();
  const left = new Set(a);
  for (const route of b) if (left.has(route)) {
    pairs.set(route, route);
    left.delete(route);
  }
  for (const route of b) {
    if (pairs.has(route)) continue;
    const partner = [...left].find((r) => pageShape(r) === pageShape(route));
    if (partner === undefined) continue;
    pairs.set(route, partner);
    left.delete(partner);
  }
  return pairs;
}

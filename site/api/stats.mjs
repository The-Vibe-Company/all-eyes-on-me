// The Vercel function behind /api/stats; the local server answers the same route.
import { statsResponse } from "../stats.mjs";

export function GET(request) {
  return statsResponse(request);
}

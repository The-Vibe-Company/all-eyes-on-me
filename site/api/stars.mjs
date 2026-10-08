// The Vercel function behind /api/stars; the local server answers the same route.
import { starsResponse } from "../stars.mjs";

export function GET() {
  return starsResponse();
}

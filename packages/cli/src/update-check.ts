// Run aside by updateNotice, detached: looks for AEOM's latest version and keeps what it saw.
import { behindNow, readUpdateState, seenNow, writeUpdateState } from "./update.js";

const seen = await behindNow();
// A checkout on another branch than main is someone working on AEOM: nothing to tell them.
if (seen) await writeUpdateState(seenNow({ ...seen, behind: seen.branch === "main" ? seen.behind : 0 }, await readUpdateState()));

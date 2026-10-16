// Sends one batch to PostHog from a process of its own, which aeom does not wait for:
// a network that hangs holds this process, never the command. On a 2xx, the install
// is marked as counted, so `cli installed` stops being sent.
import { writeFile } from "node:fs/promises";

const [url, body, counted] = process.argv.slice(2);
try {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (response.ok && counted) await writeFile(counted, "");
} catch {
  // Offline, slow or refused: nothing to do, the next run sends its own.
}
process.exit(0);

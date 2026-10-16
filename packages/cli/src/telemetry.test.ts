import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { NOTICE, POSTHOG_KEY, commandName, ping, telemetryOn } from "./telemetry.js";

const AEOM = fileURLToPath(new URL("./index.js", import.meta.url));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A fetch that keeps what it was asked to send. */
const recorder = () => {
  const sent: { url: string; body: { api_key: string; batch: { event: string; distinct_id: string; properties: Record<string, unknown> }[] } }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    sent.push({ url, body: JSON.parse(String(init.body)) });
    return new Response("{}");
  }) as typeof fetch;
  return { sent, fetchImpl };
};

const exists = (path: string) => stat(path).then(() => true, () => false);

test("telemetry is off when asked, in CI, and under AEOM's own tests", () => {
  assert.equal(telemetryOn({}), true);
  for (const value of ["0", "false", "off", "no", " OFF "]) assert.equal(telemetryOn({ AEOM_TELEMETRY: value }), false, value);
  assert.equal(telemetryOn({ AEOM_TELEMETRY: "1" }), true);
  assert.equal(telemetryOn({ DO_NOT_TRACK: "1" }), false);
  assert.equal(telemetryOn({ DO_NOT_TRACK: "0" }), true);
  assert.equal(telemetryOn({ CI: "true" }), false);
  assert.equal(telemetryOn({ CI: "false" }), true);
  assert.equal(telemetryOn({ CI: "" }), true);
  assert.equal(telemetryOn({ NODE_TEST_CONTEXT: "child-v8" }), false);
});

test("only a known command's name leaves, never what was typed", () => {
  const known = ["capture", "review"];
  assert.equal(commandName("review", known), "review");
  assert.equal(commandName(undefined, known), "help");
  assert.equal(commandName("--help", known), "help");
  assert.equal(commandName("-h", known), "help");
  assert.equal(commandName("--version", known), "version");
  assert.equal(commandName("-v", known), "version");
  assert.equal(commandName("/Users/someone/secret-project", known), "unknown");
  assert.equal(commandName("constructor", known), "unknown");
});

test("the first run makes the install's id, says so once, and sends the install with the command", async () => {
  const home = await mkdtemp(join(tmpdir(), "aeom-telemetry-"));
  try {
    const { sent, fetchImpl } = recorder();
    const warned: string[] = [];
    const warn = (line: string) => warned.push(line);
    await ping("capture", "1.2.3", { env: {}, home, fetchImpl, warn });

    const id = (await readFile(join(home, "install-id"), "utf8")).trim();
    assert.match(id, UUID);
    assert.deepEqual(warned, [NOTICE]);
    assert.equal(sent.length, 1, "one request for both events");
    assert.equal(sent[0].url, "https://us.i.posthog.com/batch/");
    assert.equal(sent[0].body.api_key, POSTHOG_KEY);
    assert.deepEqual(sent[0].body.batch.map((e) => e.event), ["cli installed", "cli command"]);
    for (const event of sent[0].body.batch) {
      assert.equal(event.distinct_id, id);
      assert.deepEqual(Object.keys(event.properties).sort(), ["$lib", "$process_person_profile", "arch", "command", "distinct_id", "node", "os", "version"]);
      assert.equal(event.properties.command, "capture");
      assert.equal(event.properties.version, "1.2.3");
      assert.equal(event.properties.os, process.platform);
      assert.equal(event.properties.$process_person_profile, false);
    }

    await ping("review", "1.2.3", { env: {}, home, fetchImpl, warn });
    assert.deepEqual(warned, [NOTICE], "the notice is said once");
    assert.deepEqual(sent[1].body.batch.map((e) => [e.event, e.distinct_id, e.properties.command]), [["cli command", id, "review"]]);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("turned off, nothing is sent and nothing is written", async () => {
  const home = await mkdtemp(join(tmpdir(), "aeom-telemetry-"));
  try {
    const { sent, fetchImpl } = recorder();
    const warned: string[] = [];
    await ping("capture", "1.2.3", { env: { AEOM_TELEMETRY: "0" }, home, fetchImpl, warn: (line) => warned.push(line) });
    assert.equal(sent.length, 0);
    assert.deepEqual(warned, []);
    assert.equal(await exists(join(home, "install-id")), false);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("a network that hangs or fails never holds a command past the timeout nor fails it", async () => {
  const home = await mkdtemp(join(tmpdir(), "aeom-telemetry-"));
  try {
    // Holds the event loop the way an open socket does, until the signal gives up.
    const hangs = ((_: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        const socket = setTimeout(() => {}, 10_000);
        init.signal?.addEventListener("abort", () => {
          clearTimeout(socket);
          reject(init.signal?.reason);
        });
      })) as typeof fetch;
    const started = Date.now();
    await ping("capture", "1.2.3", { env: {}, home, fetchImpl: hangs, warn: () => {}, timeoutMs: 50 });
    assert.ok(Date.now() - started < 1000, "given up at the timeout");

    const fails = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await ping("capture", "1.2.3", { env: {}, home, fetchImpl: fails, warn: () => {} });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("a home it cannot write sends nothing, rather than a new install on every run", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-telemetry-"));
  try {
    const home = join(dir, "a-file");
    await writeFile(home, "");
    const { sent, fetchImpl } = recorder();
    await ping("capture", "1.2.3", { env: {}, home, fetchImpl, warn: () => {} });
    assert.equal(sent.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom pings on every command, the notice on stderr, stdout unchanged", async () => {
  const home = await mkdtemp(join(tmpdir(), "aeom-telemetry-"));
  const bodies: string[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      bodies.push(body);
      response.end("{}");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, AEOM_HOME: home, AEOM_TELEMETRY_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/batch/` };
    delete env.NODE_TEST_CONTEXT;
    delete env.CI;
    delete env.DO_NOT_TRACK;
    delete env.AEOM_TELEMETRY;
    const { stdout, stderr } = await promisify(execFile)("node", [AEOM, "--version"], { env });
    assert.match(stdout, /^\d+\.\d+\.\d+\n$/);
    assert.equal(stderr, `${NOTICE}\n`);
    assert.equal(bodies.length, 1);
    const { batch } = JSON.parse(bodies[0]) as { batch: { event: string; properties: { command: string } }[] };
    assert.deepEqual(batch.map((e) => [e.event, e.properties.command]), [["cli installed", "version"], ["cli command", "version"]]);

    const again = await promisify(execFile)("node", [AEOM, "--version"], { env });
    assert.equal(again.stderr, "");
    assert.equal(bodies.length, 2);
  } finally {
    server.close();
    await rm(home, { recursive: true, force: true });
  }
});

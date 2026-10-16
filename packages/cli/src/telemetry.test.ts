import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { NOTICE, POSTHOG_KEY, commandName, ping, telemetryOn } from "./telemetry.js";

const AEOM = fileURLToPath(new URL("./index.js", import.meta.url));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Batch = { api_key: string; batch: { event: string; distinct_id: string; properties: Record<string, unknown> }[] };

/** A send that keeps what it was handed. */
const recorder = () => {
  const sent: { url: string; body: Batch; counted: string }[] = [];
  const send = (url: string, body: string, counted: string) => sent.push({ url, body: JSON.parse(body), counted });
  return { sent, send };
};

const exists = (path: string) => stat(path).then(() => true, () => false);

const until = async (ok: () => boolean | Promise<boolean>, what: string) => {
  const end = Date.now() + 5000;
  while (!(await ok())) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
};

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

test("the first run makes the install's id, says so once, and sends the install until PostHog took it", async () => {
  const home = await mkdtemp(join(tmpdir(), "aeom-telemetry-"));
  try {
    const { sent, send } = recorder();
    const warned: string[] = [];
    const warn = (line: string) => warned.push(line);
    await ping("capture", "1.2.3", { env: {}, home, send, warn });

    const id = (await readFile(join(home, "install-id"), "utf8")).trim();
    assert.match(id, UUID);
    assert.deepEqual(warned, [NOTICE]);
    assert.equal(sent.length, 1, "one batch for both events");
    assert.equal(sent[0].url, "https://us.i.posthog.com/batch/");
    assert.equal(sent[0].counted, join(home, "install-counted"));
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

    await ping("judge", "1.2.3", { env: {}, home, send, warn });
    assert.deepEqual(warned, [NOTICE], "the notice is said once");
    assert.deepEqual(sent[1].body.batch.map((e) => [e.event, e.distinct_id]), [["cli installed", id], ["cli command", id]], "the first send never landed: the install goes again");

    await writeFile(sent[1].counted, "");
    await ping("review", "1.2.3", { env: {}, home, send, warn });
    assert.deepEqual(sent[2].body.batch.map((e) => [e.event, e.distinct_id, e.properties.command]), [["cli command", id, "review"]]);
    assert.equal(sent[2].counted, "");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("turned off, nothing is sent and nothing is written", async () => {
  const home = await mkdtemp(join(tmpdir(), "aeom-telemetry-"));
  try {
    const { sent, send } = recorder();
    const warned: string[] = [];
    await ping("capture", "1.2.3", { env: { AEOM_TELEMETRY: "0" }, home, send, warn: (line) => warned.push(line) });
    assert.equal(sent.length, 0);
    assert.deepEqual(warned, []);
    assert.equal(await exists(join(home, "install-id")), false);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("an id file left empty is replaced, rather than silencing every later run", async () => {
  const home = await mkdtemp(join(tmpdir(), "aeom-telemetry-"));
  try {
    await writeFile(join(home, "install-id"), "");
    await writeFile(join(home, "install-counted"), "");
    const { sent, send } = recorder();
    await ping("capture", "1.2.3", { env: {}, home, send, warn: () => {} });
    const id = (await readFile(join(home, "install-id"), "utf8")).trim();
    assert.match(id, UUID);
    assert.deepEqual(sent[0].body.batch.map((e) => [e.event, e.distinct_id]), [["cli installed", id], ["cli command", id]], "a new id is a new install");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("a home it cannot write sends nothing, rather than a new install on every run", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-telemetry-"));
  try {
    const home = join(dir, "a-file");
    await writeFile(home, "");
    const { sent, send } = recorder();
    await ping("capture", "1.2.3", { env: {}, home, send, warn: () => {} });
    assert.equal(sent.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

/** A PostHog that keeps each batch and answers only when told to. */
const fakePostHog = async () => {
  const bodies: string[] = [];
  const held: ServerResponse[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      bodies.push(body);
      held.push(response);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/batch/`;
  const close = () => {
    server.closeAllConnections();
    server.close();
  };
  return { bodies, held, url, close };
};

const aeom = (home: string, url: string) => {
  const env: NodeJS.ProcessEnv = { ...process.env, AEOM_HOME: home, AEOM_TELEMETRY_URL: url };
  for (const off of ["NODE_TEST_CONTEXT", "CI", "DO_NOT_TRACK", "AEOM_TELEMETRY"]) delete env[off];
  return promisify(execFile)("node", [AEOM, "--version"], { env });
};

test("aeom is done before PostHog answers, and the install is counted once PostHog took it", async () => {
  const home = await mkdtemp(join(tmpdir(), "aeom-telemetry-"));
  const posthog = await fakePostHog();
  try {
    const { stdout, stderr } = await aeom(home, posthog.url);
    assert.match(stdout, /^\d+\.\d+\.\d+\n$/);
    assert.equal(stderr, `${NOTICE}\n`);
    await until(() => posthog.held.length === 1, "the batch");
    const { batch } = JSON.parse(posthog.bodies[0]) as Batch;
    assert.deepEqual(batch.map((e) => [e.event, e.properties.command]), [["cli installed", "version"], ["cli command", "version"]]);
    assert.equal(await exists(join(home, "install-counted")), false, "not counted before PostHog answers");

    posthog.held[0].end("{}");
    await until(() => exists(join(home, "install-counted")), "the install to be counted");

    const again = await aeom(home, posthog.url);
    assert.equal(again.stderr, "");
    await until(() => posthog.held.length === 2, "the second batch");
    assert.deepEqual((JSON.parse(posthog.bodies[1]) as Batch).batch.map((e) => e.event), ["cli command"]);
    posthog.held[1].end("{}");
  } finally {
    posthog.close();
    await rm(home, { recursive: true, force: true });
  }
});

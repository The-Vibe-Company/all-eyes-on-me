import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const AEOM = fileURLToPath(new URL("../index.js", import.meta.url));
const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
const SECRET = "sk-test-never-printed";

test("aeom image generates one image with the image API configured, records it for the run, and never prints the key", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-image-"));
  const asked: { url?: string; auth?: string; body?: Record<string, unknown> }[] = [];
  const server = createServer(async (req: IncomingMessage, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    asked.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(raw) });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ data: [{ b64_json: PIXEL }] }));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  // Only what the test gives: no key from the machine running it.
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(AEOM_IMAGE_|OPENAI_|AZURE_OPENAI_)/.test(k)));
  const run = (args: string[], env: Record<string, string>) =>
    promisify(execFile)("node", [AEOM, "image", ...args], { cwd: dir, env: { ...base, AEOM_HOME: join(dir, ".home"), AEOM_TELEMETRY: "0", ...env } }).then((r) => ({ code: 0, out: r.stdout + r.stderr }), (e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, out: e.stdout + e.stderr }));
  try {
    const none = await run(["--check"], {});
    assert.equal(none.code, 1);
    assert.match(none.out, /No image API configured: directions are drawn in CSS and SVG/);
    assert.equal((await run(["--check"], { AZURE_OPENAI_API_KEY: SECRET })).code, 1, "an Azure key with no address");

    // The key in ~/.aeom/.env, the address and the deployment beside it, as for Azure.
    await mkdir(join(dir, ".home"), { recursive: true });
    await writeFile(join(dir, ".home", ".env"), `AZURE_OPENAI_API_KEY="${SECRET}"\nAEOM_IMAGE_URL=${url}\nAEOM_IMAGE_MODEL=gpt-image-2-1\n`);
    const ok = await run(["--check"], {});
    assert.equal(ok.code, 0, ok.out);
    assert.match(ok.out, /Images from 127\.0\.0\.1:\d+, model gpt-image-2-1\./);

    const runDir = join(dir, ".aeom", "runs", "run-20261026-1000");
    await mkdir(runDir, { recursive: true });
    const made = await run(["A harbour at dawn, engraved in blue ink, no text", "--out", "front/assets/hero.png", "--run", runDir], {});
    assert.equal(made.code, 0, made.out);
    assert.equal(readFileSync(join(dir, "front", "assets", "hero.png")).toString("base64"), PIXEL);
    assert.deepEqual(asked.at(-1)!.body, { model: "gpt-image-2-1", prompt: "A harbour at dawn, engraved in blue ink, no text", size: "1536x1024", quality: "medium", n: 1 });
    assert.equal(asked.at(-1)!.url, "/v1/images/generations");
    assert.equal(asked.at(-1)!.auth, `Bearer ${SECRET}`);
    assert.equal(readFileSync(join(runDir, "assets.txt"), "utf8"), "front/assets/hero.png\n", "listed for the run's PR, once");
    await run(["Again", "--out", "front/assets/hero.png", "--run", runDir], {});
    assert.equal(readFileSync(join(runDir, "assets.txt"), "utf8"), "front/assets/hero.png\n");

    for (const out of [none.out, ok.out, made.out]) assert.ok(!out.includes(SECRET), "the key is never printed");
    assert.equal((await run(["x", "--out", "a.png", "--size", "800x600"], {})).code, 1, "a size the API does not draw");
    assert.ok(!existsSync(join(dir, "a.png")));
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

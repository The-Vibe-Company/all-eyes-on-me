import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const AEOM = fileURLToPath(new URL("../index.js", import.meta.url));
const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
const SECRET = "sk-test-never-printed-0123456789";

test("aeom image generates one image only with AEOM_IMAGE_KEY, checks what it writes, lists it for the run by content and path, and never prints the key", async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "aeom-image-")));
  const asked: { url?: string; auth?: string; body?: Record<string, unknown> }[] = [];
  // What the fake API answers next.
  let answer: (res: ServerResponse) => void = (res) => res.end(JSON.stringify({ data: [{ b64_json: PIXEL }] }));
  const server = createServer(async (req: IncomingMessage, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    asked.push({ url: req.url, auth: req.headers.authorization, ...(raw ? { body: JSON.parse(raw) } : {}) });
    res.setHeader("content-type", "application/json");
    answer(res);
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  // Only what the test gives: no key from the machine running it.
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(AEOM_IMAGE_|OPENAI_|AZURE_OPENAI_)/.test(k)));
  const project = join(dir, "boutique");
  const run = (args: string[], env: Record<string, string> = {}, cwd = join(project, "front")) =>
    promisify(execFile)("node", [AEOM, "image", ...args], { cwd, env: { ...base, AEOM_HOME: join(dir, ".home"), AEOM_TELEMETRY: "0", ...env } }).then((r) => ({ code: 0, out: r.stdout + r.stderr }), (e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, out: e.stdout + e.stderr }));
  try {
    await mkdir(join(project, "front"), { recursive: true });
    execFileSync("git", ["init", "-q"], { cwd: project });
    const outputs: string[] = [];
    const said = async (args: string[], env?: Record<string, string>) => {
      const r = await run(args, env);
      outputs.push(r.out);
      return r;
    };

    // Another key of the machine never turns generation on.
    const ambient = await said(["--check"], { OPENAI_API_KEY: SECRET, AZURE_OPENAI_API_KEY: SECRET });
    assert.equal(ambient.code, 1);
    assert.match(ambient.out, /No image generation: AEOM_IMAGE_KEY is not set/);
    assert.equal((await said(["--check"], { AEOM_IMAGE_KEY: SECRET, AEOM_IMAGE_URL: "http://example.com/v1" })).code, 1, "a key over plain http to another machine");

    // The key in ~/.aeom/.env, a comment after the address, as for Azure.
    await mkdir(join(dir, ".home"), { recursive: true });
    await writeFile(join(dir, ".home", ".env"), `AEOM_IMAGE_KEY="${SECRET}" # mine\r\nAEOM_IMAGE_URL=${url}  # the fake\r\nAEOM_IMAGE_MODEL=gpt-image-2-1\r\n`);
    const ok = await said(["--check"]);
    assert.equal(ok.code, 0, ok.out);
    assert.match(ok.out, /Images from 127\.0\.0\.1:\d+, model gpt-image-2-1\./);

    // A run folder that is not there is said before anything is paid for.
    const before = asked.length;
    assert.equal((await said(["x", "--out", "assets/x.png", "--run", join(dir, "nowhere")])).code, 1);
    assert.equal(asked.length, before, "no call made");

    const runDir = join(project, ".aeom", "runs", "run-20261026-1000");
    await mkdir(runDir, { recursive: true });
    const made = await said(["A harbour at dawn, engraved in blue ink, no text", "--out", "assets/hero.png", "--run", runDir]);
    assert.equal(made.code, 0, made.out);
    assert.equal(readFileSync(join(project, "front", "assets", "hero.png")).toString("base64"), PIXEL);
    assert.deepEqual(asked.at(-1)!.body, { model: "gpt-image-2-1", prompt: "A harbour at dawn, engraved in blue ink, no text", size: "1536x1024", quality: "medium", output_format: "png", n: 1 });
    assert.equal(asked.at(-1)!.url, "/v1/images/generations");
    assert.equal(asked.at(-1)!.auth, `Bearer ${SECRET}`);
    const blob = execFileSync("git", ["hash-object", join(project, "front", "assets", "hero.png")]).toString().trim();
    assert.equal(readFileSync(join(runDir, "assets.txt"), "utf8"), `${blob} front/assets/hero.png\n`, "its content and its path from the repository's root, once");
    await said(["Again", "--out", "assets/hero.png", "--run", runDir]);
    assert.equal(readFileSync(join(runDir, "assets.txt"), "utf8"), `${blob} front/assets/hero.png\n`);

    // An image of the direction kept, copied into the front, is listed the same way.
    await writeFile(join(project, "front", "assets", "kept.png"), Buffer.from(PIXEL, "base64"));
    assert.equal((await said(["--adopt", "assets/kept.png", "--run", runDir])).code, 0);
    assert.match(readFileSync(join(runDir, "assets.txt"), "utf8"), / front\/assets\/kept\.png\n$/);
    await writeFile(join(project, "front", "notes.png"), "not an image");
    assert.equal((await said(["--adopt", "notes.png", "--run", runDir])).code, 1, "only an image is listed");

    // What is not an image is never written; a key refused is said without the API's words.
    answer = (res) => res.end(JSON.stringify({ data: [{ b64_json: Buffer.from("<html>404</html>").toString("base64") }] }));
    assert.equal((await said(["x", "--out", "assets/bad.png"])).code, 1);
    assert.ok(!existsSync(join(project, "front", "assets", "bad.png")));
    answer = (res) => {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: { message: `Incorrect API key provided: ${SECRET.slice(0, 8)}****${SECRET.slice(-4)}` } }));
    };
    const refused = await said(["x", "--out", "assets/y.png"]);
    assert.equal(refused.code, 1);
    assert.match(refused.out, /The image API refused the key \(401\)/);
    assert.doesNotMatch(refused.out, /sk-test|6789/);

    assert.equal((await said(["x", "--out", "assets/x.gif"])).code, 1, "a format the API does not write");
    for (const out of outputs) assert.ok(!out.includes(SECRET), "the key is never printed");
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

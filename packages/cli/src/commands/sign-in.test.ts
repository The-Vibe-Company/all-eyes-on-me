import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const AEOM = fileURLToPath(new URL("../index.js", import.meta.url));
const UGLY_APP = fileURLToPath(new URL("../../../../examples/ugly-app/server.mjs", import.meta.url));
const ACCOUNT = fileURLToPath(new URL("../../../../examples/ugly-app/fixtures/compte.json", import.meta.url));

const run = async (cwd: string, args: string[]) => {
  try {
    const { stdout, stderr } = await promisify(execFile)("node", [AEOM, ...args], { cwd });
    return { code: 0, out: stdout + stderr };
  } catch (error) {
    const e = error as { code: number; stdout: string; stderr: string };
    return { code: e.code, out: e.stdout + e.stderr };
  }
};

const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createServer().listen(0, () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });

async function project(account: string) {
  const dir = await mkdtemp(join(tmpdir(), "aeom-sign-in-"));
  const port = await freePort();
  await mkdir(join(dir, ".aeom"));
  const config = { url: `http://localhost:${port}`, start: `PORT=${port} node "${UGLY_APP}"`, login: { path: "/connexion", account, submit: "Se connecter" } };
  await writeFile(join(dir, ".aeom", "config.json"), JSON.stringify(config));
  return dir;
}

test("with a login in the config, aeom capture signs in first and captures the pages behind it", async () => {
  const dir = await project(ACCOUNT);
  try {
    const { code, out } = await run(dir, ["capture", "--widths", "390", "--out", join(dir, "captures")]);
    assert.equal(code, 0, out);
    assert.match(out, /Signed in on \/connexion/);
    const manifest = await readFile(join(dir, "captures", "manifest.json"), "utf8");
    assert.match(manifest, /"path": "\/commandes"/);
    const password = JSON.parse(await readFile(ACCOUNT, "utf8"))["Mot de passe"] as string;
    assert.ok(!out.includes(password) && !manifest.includes(password), "the password is in no output and no report");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a refused account stops aeom capture before anything is captured, without printing the account", async () => {
  const dir = await project("wrong.json");
  try {
    await writeFile(join(dir, "wrong.json"), JSON.stringify({ Email: "client@example.test", "Mot de passe": "not-it-42" }));
    const { code, out } = await run(dir, ["capture", "--widths", "390", "--out", join(dir, "captures")]);
    assert.equal(code, 1);
    assert.match(out, /Signing in did not work: the app stayed on \/connexion after "Se connecter"/);
    assert.doesNotMatch(out, /not-it-42/);
    await assert.rejects(readFile(join(dir, "captures", "manifest.json")), "nothing was captured");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

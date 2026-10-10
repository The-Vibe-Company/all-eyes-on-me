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
    for (const value of Object.values(JSON.parse(await readFile(ACCOUNT, "utf8")) as Record<string, string>)) {
      assert.ok(!out.includes(value) && !manifest.includes(value), "no value of the account is in the output or the report");
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("pages the config marks public are captured and checked signed out, beside the pages behind the sign-in", async () => {
  const dir = await project(ACCOUNT);
  try {
    const file = join(dir, ".aeom", "config.json");
    await writeFile(file, JSON.stringify({ ...JSON.parse(await readFile(file, "utf8")), pages: ["/produits"], public: ["/commandes"] }));
    const { code, out } = await run(dir, ["capture", "--widths", "390", "--out", join(dir, "captures")]);
    assert.equal(code, 0, out);
    const manifest = JSON.parse(await readFile(join(dir, "captures", "manifest.json"), "utf8"));
    assert.deepEqual(manifest.pages.map((p: { path: string; signedOut?: boolean }) => [p.path, p.signedOut ?? false]), [["/produits", false], ["/connexion", true]], "signed out, the orders page leads to signing in");
    const given = await run(dir, ["capture", "--widths", "390", "--pages", "/", "--out", join(dir, "given")]);
    assert.deepEqual(JSON.parse(await readFile(join(dir, "given", "manifest.json"), "utf8")).pages.map((p: { path: string }) => p.path), ["/"], "--pages alone says what is captured");
    assert.equal(given.code, 0, given.out);
    const checked = await run(dir, ["check", "--widths", "390", "--out", join(dir, "reports")]);
    assert.deepEqual(JSON.parse(await readFile(join(dir, "reports", "check.json"), "utf8")).pages.map((p: string) => new URL(p).pathname), ["/produits", "/connexion"], checked.out);
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
    assert.doesNotMatch(out, /not-it-42|client@example\.test/);
    await assert.rejects(readFile(join(dir, "captures", "manifest.json")), "nothing was captured");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an account file that is not valid JSON is refused without quoting it", async () => {
  const dir = await project("broken.json");
  try {
    await writeFile(join(dir, "broken.json"), `{ "Email": "client@example.test", "Mot de passe": "secret-77" `);
    const { code, out } = await run(dir, ["capture", "--widths", "390", "--out", join(dir, "captures")]);
    assert.equal(code, 1);
    assert.match(out, /Cannot read the sign-in account broken\.json: it is not valid JSON/);
    assert.doesNotMatch(out, /secret-77|client@example\.test/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

/** A script that signs in to the demo app itself and prints its session cookie, as a project's own script would. */
const SCRIPT = (account: string) =>
  `node -e "const a=require('${account.replace(/\\/g, "/")}');fetch(process.env.AEOM_URL+'/connexion',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:a['Email'],mdp:a['Mot de passe']})}).then(r=>{const c=r.headers.get('set-cookie').split(';')[0].split('=');process.stdout.write(JSON.stringify([{name:c[0],value:c[1]}]))})"`;

test("a login given as a script that prints the session signs in, without the account in the config, and never prints it", async () => {
  const dir = await project(ACCOUNT);
  try {
    const file = join(dir, ".aeom", "config.json");
    const config = JSON.parse(await readFile(file, "utf8"));
    await writeFile(file, JSON.stringify({ ...config, login: { script: SCRIPT(ACCOUNT) } }));
    const { code, out } = await run(dir, ["capture", "--widths", "390", "--pages", "/commandes", "--out", join(dir, "captures")]);
    assert.equal(code, 0, out);
    assert.match(out, /Signed in with what the login script printed/);
    const manifest = JSON.parse(await readFile(join(dir, "captures", "manifest.json"), "utf8"));
    assert.deepEqual(manifest.pages.map((p: { path: string }) => p.path), ["/commandes"], "behind the sign-in, not sent to it");
    assert.doesNotMatch(out, /session=|"value"/);
    await writeFile(file, JSON.stringify({ ...config, login: { script: "node -e \"console.error('token xyz');process.exit(3)\"" } }));
    const failed = await run(dir, ["capture", "--widths", "390", "--pages", "/commandes", "--out", join(dir, "captures")]);
    assert.equal(failed.code, 1);
    assert.match(failed.out, /The login script exited with 3/);
    assert.doesNotMatch(failed.out, /token xyz/, "what the script says is never repeated: it may hold a secret");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a login given as a saved browser state signs in with it; a login that mixes two ways is refused", async () => {
  const dir = await project(ACCOUNT);
  try {
    const file = join(dir, ".aeom", "config.json");
    const config = JSON.parse(await readFile(file, "utf8"));
    await writeFile(join(dir, "state.json"), "[]");
    await writeFile(file, JSON.stringify({ ...config, login: { state: join(dir, "state.json"), path: "/connexion" } }));
    const mixed = await run(dir, ["capture", "--widths", "390", "--out", join(dir, "captures")]);
    assert.equal(mixed.code, 1);
    assert.match(mixed.out, /"login" is one of three: a form \("path", "account", "submit"\), a saved session \("state"\), or a script that prints one \("script"\)/);
    await writeFile(file, JSON.stringify({ ...config, login: { state: join(dir, "state.json") } }));
    const empty = await run(dir, ["capture", "--widths", "390", "--out", join(dir, "captures")]);
    assert.equal(empty.code, 1);
    assert.match(empty.out, /holds no cookie/, "an empty session would capture signed out");
    await writeFile(join(dir, "state.json"), JSON.stringify([{ name: "session", value: "x", path: "jeu" }]));
    const broken = await run(dir, ["capture", "--widths", "390", "--out", join(dir, "captures")]);
    assert.equal(broken.code, 1);
    assert.match(broken.out, /cannot be set in a browser/);
    await writeFile(file, JSON.stringify({ ...config, login: "/connexion" }));
    assert.match((await run(dir, ["capture", "--out", join(dir, "captures")])).out, /"login" is one of three/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

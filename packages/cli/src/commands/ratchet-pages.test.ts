import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const AEOM = fileURLToPath(new URL("../index.js", import.meta.url));
const run = async (cwd: string, args: string[]) => {
  try {
    const { stdout, stderr } = await promisify(execFile)("node", [AEOM, ...args], { cwd });
    return { code: 0, out: stdout + stderr };
  } catch (error) {
    const e = error as { code: number; stdout: string; stderr: string };
    return { code: e.code, out: e.stdout + e.stderr };
  }
};
const git = async (cwd: string, ...args: string[]) => (await promisify(execFile)("git", args, { cwd })).stdout.trim();
const write = async (dir: string, file: string, text: string) => {
  await mkdir(join(dir, file, ".."), { recursive: true });
  await writeFile(join(dir, file), text);
};
const commit = async (dir: string, message: string) => {
  await git(dir, "add", "-A");
  await git(dir, "commit", "-qm", message);
  return git(dir, "rev-parse", "HEAD");
};
const buy = (button: string) => JSON.stringify({ name: "Buy", steps: [{ do: "open", path: "/" }, { do: "click", target: { role: "link", name: "Panier" } }, { do: "click", target: { role: "button", name: button } }] });
const steps = (paths: string[]) => paths.map((path, i) => ({ index: i + 1, action: `step ${i + 1}`, path, capture: null }));
const replay = (journeys: Record<string, string[]>) =>
  JSON.stringify({ url: "http://localhost:3000/", replayedAt: "", widths: [1280], warnings: [], journeys: Object.entries(journeys).map(([slug, paths]) => ({ slug, name: `Journey ${slug}`, runs: [{ width: 1280, steps: steps(paths), calls: [], screens: [...new Set(paths)], counts: { steps: paths.length, screens: paths.length, back: 0 }, broken: null, sheet: "" }] })) });

test("aeom ratchet keeps the pages that got better, puts the others back with the journey files rewritten for them, and commits on the run branch only", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-ratchet-"));
  try {
    await git(dir, "init", "-q", "-b", "main");
    await git(dir, "config", "user.email", "t@example.test");
    await git(dir, "config", "user.name", "T");
    await write(dir, ".gitignore", ".aeom/runs/\n");
    await write(dir, "pages/home.html", "home v1");
    await write(dir, "pages/cart.html", "cart v1");
    await write(dir, "shared/kit.css", "kit v1");
    await write(dir, ".aeom/journeys/buy.json", buy("Commander"));
    await commit(dir, "app");
    await git(dir, "checkout", "-q", "-b", "aeom/run-1");
    await write(dir, "shared/kit.css", "kit v2");
    const wave = await commit(dir, "kit");
    // Two page workers, each on its own branch from the run branch with the kit, merged one after the other.
    await git(dir, "checkout", "-q", "-b", "aeom/run-1-cart");
    await write(dir, "pages/cart.html", "cart v2");
    await write(dir, "pages/cart.css", ".cart {}");
    await commit(dir, "cart");
    await git(dir, "checkout", "-q", "-b", "aeom/run-1-home", wave);
    await write(dir, "pages/home.html", "home v2");
    await commit(dir, "home");
    await git(dir, "checkout", "-q", "aeom/run-1");
    await git(dir, "merge", "-q", "--no-ff", "-m", "merge cart", "aeom/run-1-cart");
    await git(dir, "merge", "-q", "--no-ff", "-m", "merge home", "aeom/run-1-home");
    // The cart's worker renamed a button a journey clicks on the cart: the run rewrote that step on the run branch.
    await write(dir, ".aeom/journeys/buy.json", buy("Valider la commande"));
    const rewritten = await commit(dir, "aeom: the journeys renamed");

    const R = ".aeom/runs/run-1";
    await mkdir(join(dir, R), { recursive: true });
    assert.equal((await run(dir, ["run", "mark", R, "--phase", "measure", "--step", "5", "--set", `WAVE_BASE=${wave}`])).code, 0);
    for (const [name, page] of [["cart", "/cart"], ["home", "/"]] as const) {
      const marked = await run(dir, ["run", "agent", R, "--name", name, "--kind", "page worker", "--status", "launched", "--branch", `aeom/run-1-${name}`, "--from", wave, "--page", page]);
      assert.equal(marked.code, 0, marked.out);
    }
    // The run's judges are marked too, with no page: they are not page workers.
    assert.equal((await run(dir, ["run", "agent", R, "--name", "judge-1", "--kind", "page judge", "--status", "launched"])).code, 0);
    assert.match((await run(dir, ["run", "agent", R, "--name", "cart", "--status", "launched", "--page", "cart"])).out, /--page takes the route the page worker rebuilt/);
    const missing = await run(dir, ["ratchet", R]);
    assert.equal(missing.code, 1);
    assert.match(missing.out, /after\/compare\.json is missing: aeom compare \.aeom\/runs\/run-1\/before \.aeom\/runs\/run-1\/after first/);

    const total = (n: number) => ({ page: "", checks: n, principles: 0, total: n, failing: [] });
    await write(dir, `${R}/after/compare.json`, JSON.stringify([
      { page: "/", before: total(4), after: total(1), verdict: "better", newly: [] },
      { page: "/cart", before: total(3), after: total(3), verdict: "same", newly: [] },
      { page: "/about", before: total(0), after: total(0), verdict: "same", newly: [] },
    ]));
    await write(dir, `${R}/no-worker.json`, `["/about"]`);
    await write(dir, `${R}/journeys-after/report.json`, replay({ buy: ["/", "/cart", "/cart"] }));

    const said = await run(dir, ["ratchet", R]);
    assert.equal(said.code, 0, said.out);
    assert.match(said.out, /No journey ratchet in \.aeom\/runs\/run-1\/journeys-after: decided on the screens alone\./);
    assert.match(said.out, /^\/ +kept +better: 4 → 1 failing$/m);
    assert.match(said.out, /^\/cart +back +the same as before: 3 → 3 failing$/m);
    assert.match(said.out, /^\/about +kept +the same as before: 0 → 0 failing, but no worker touched it \(no-worker\.json\)$/m);
    assert.match(said.out, /1 page goes back: \/cart \(2 files\)\. \.aeom\/journeys\/buy\.json goes back with it\./);
    assert.match(said.out, /Run again with --apply, on aeom\/run-1, to put it back and commit\./);
    const decision = JSON.parse(await readFile(join(dir, R, "after", "ratchet.json"), "utf8"));
    assert.deepEqual(decision.pages.find((p: { page: string }) => p.page === "/cart").files, ["pages/cart.css", "pages/cart.html"]);
    assert.deepEqual(decision.journeyFiles, [".aeom/journeys/buy.json"]);
    assert.equal(decision.applied, null);
    assert.equal(await git(dir, "rev-parse", "HEAD"), rewritten, "without --apply nothing is touched");
    const noted = async () => JSON.parse(await readFile(join(dir, R, "state.json"), "utf8")) as { branchAt: string | null; history: { phase: string; done?: string }[] };
    assert.deepEqual((await noted()).history.at(-1), { ...(await noted()).history.at(-1), phase: "measure", done: "aeom ratchet: /cart goes back" });

    await git(dir, "checkout", "-q", "main");
    const elsewhere = await run(dir, ["ratchet", R, "--apply"]);
    assert.equal(elsewhere.code, 1);
    assert.match(elsewhere.out, /--apply puts pages back on the run branch, aeom\/run-1, and this checkout is on main/);
    await git(dir, "checkout", "-q", "aeom/run-1");
    await write(dir, "pages/cart.html", "cart, edited by hand");
    const dirty = await run(dir, ["ratchet", R, "--apply"]);
    assert.equal(dirty.code, 1);
    assert.match(dirty.out, /pages\/cart\.html has changes not committed/);
    await git(dir, "checkout", "--", "pages/cart.html");

    const applied = await run(dir, ["ratchet", R, "--apply"]);
    assert.equal(applied.code, 0, applied.out);
    assert.equal(await readFile(join(dir, "pages/cart.html"), "utf8"), "cart v1");
    assert.equal(existsSync(join(dir, "pages/cart.css")), false, "a file the worker added goes");
    assert.equal(await readFile(join(dir, ".aeom/journeys/buy.json"), "utf8"), buy("Commander"));
    assert.equal(await readFile(join(dir, "pages/home.html"), "utf8"), "home v2", "a page that got better stays");
    assert.equal(await readFile(join(dir, "shared/kit.css"), "utf8"), "kit v2", "the kit stays");
    assert.match(await git(dir, "log", "-1", "--format=%s"), /^aeom: pages put back as they were before the screen wave: \/cart$/);
    assert.equal(await git(dir, "status", "--porcelain", "--", "pages", "shared", ".aeom/journeys"), "");
    assert.match(applied.out, /Put back and committed \([0-9a-f]{7}\): \/cart\./);
    assert.match(applied.out, /aeom snapshot \.aeom\/runs\/run-1\/after-revert/);
    assert.match(applied.out, /replay them again into \.aeom\/runs\/run-1\/journeys-after/);
    assert.match(JSON.parse(await readFile(join(dir, R, "after", "ratchet.json"), "utf8")).applied, /^[0-9a-f]{40}$/);
    assert.equal((await noted()).history.at(-1)!.done, "aeom ratchet --apply: /cart put back");
    assert.equal((await noted()).branchAt, await git(dir, "rev-parse", "HEAD"), "its own commit is not a stranger's to a run taken up");

    const head = await git(dir, "rev-parse", "HEAD");
    const again = await run(dir, ["ratchet", R, "--apply"]);
    assert.equal(again.code, 0, again.out);
    assert.match(again.out, /already as they were before the wave: nothing to commit/);
    assert.equal((await noted()).history.at(-1)!.done, "aeom ratchet --apply: /cart already as before the wave");
    assert.equal(await git(dir, "rev-parse", "HEAD"), head);
    assert.equal(JSON.parse(await readFile(join(dir, R, "after", "ratchet.json"), "utf8")).applied, head, "the commit of the first --apply stays named");
    assert.match((await run(dir, ["ratchet", R, "--back", "/nowhere=gone"])).out, /--back \/nowhere=gone: no page of .* starts it/);

    // A page worker marked with a page the measure does not name is refused, never left « rebuilt by no worker ».
    assert.equal((await run(dir, ["run", "agent", R, "--name", "promo", "--kind", "page worker", "--status", "launched", "--branch", "aeom/run-1-cart", "--from", wave, "--page", "/promo"])).code, 0);
    const astray = await run(dir, ["ratchet", R]);
    assert.equal(astray.code, 1);
    assert.match(astray.out, /promo was marked with --page \/promo, which no page of .*compare\.json is: mark it again with the route the measure names \(\/, \/cart, \/about\)/);
    assert.equal((await run(dir, ["run", "agent", R, "--name", "promo", "--status", "refused"])).code, 0);

    // A page worker the run marked without its page: its files cannot be found, so nothing is decided.
    assert.equal((await run(dir, ["run", "agent", R, "--name", "orders", "--kind", "page worker", "--status", "launched", "--branch", "aeom/run-1-orders", "--from", wave])).code, 0);
    const unmarked = await run(dir, ["ratchet", R]);
    assert.equal(unmarked.code, 1);
    assert.match(unmarked.out, /orders ran as a page worker with no page: mark it with aeom run agent \.aeom\/runs\/run-1 --name orders --status launched --page <the route it rebuilt>/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("in a project that is a folder of its repository, aeom ratchet reads and puts back the project's own paths", async () => {
  const repo = await mkdtemp(join(tmpdir(), "aeom-ratchet-sub-"));
  const dir = join(repo, "web");
  try {
    await git(repo, "init", "-q", "-b", "main");
    await git(repo, "config", "user.email", "t@example.test");
    await git(repo, "config", "user.name", "T");
    await write(repo, ".gitignore", "web/.aeom/runs/\n");
    await write(dir, "pages/cart.html", "cart v1");
    await commit(repo, "app");
    await git(repo, "checkout", "-q", "-b", "aeom/run-1");
    const wave = await git(repo, "rev-parse", "HEAD");
    await git(repo, "checkout", "-q", "-b", "aeom/run-1-cart");
    await write(dir, "pages/cart.html", "cart v2");
    await commit(repo, "cart");
    await git(repo, "checkout", "-q", "aeom/run-1");
    await git(repo, "merge", "-q", "--no-ff", "-m", "merge cart", "aeom/run-1-cart");
    // Something of the person's own, outside what goes back, never stops it.
    await write(repo, "notes.txt", "mine");

    const R = ".aeom/runs/run-1";
    await mkdir(join(dir, R), { recursive: true });
    assert.equal((await run(dir, ["run", "agent", R, "--name", "cart", "--kind", "page worker", "--status", "launched", "--branch", "aeom/run-1-cart", "--from", wave, "--page", "/cart"])).code, 0);
    const total = (n: number) => ({ page: "", checks: n, principles: 0, total: n, failing: [] });
    await write(dir, `${R}/after/compare.json`, JSON.stringify([{ page: "/cart", before: total(2), after: total(2), verdict: "same", newly: [] }]));
    const applied = await run(dir, ["ratchet", R, "--apply"]);
    assert.equal(applied.code, 0, applied.out);
    assert.match(applied.out, /1 page goes back: \/cart \(1 file\)/);
    assert.equal(await readFile(join(dir, "pages/cart.html"), "utf8"), "cart v1");
    assert.match(await git(repo, "log", "-1", "--format=%s"), /pages put back as they were before the screen wave: \/cart$/);
    assert.equal(await readFile(join(repo, "notes.txt"), "utf8"), "mine");
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
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

const journey = (name: string) => `### ${name}\nWhy: a visitor wants it. (seen: /)\n1. Open \`/\`.\n2. Click "${name}".\n`;
const sheet = (who = "People buying a gift. (to confirm)", journeys = ["See the products", "See my orders", "Contact the shop"], used = "\`both\`: a shop people open on their phone and their computer. (seen: README.md)") =>
  `# Super boutique\n\n## What kind of product\n\`tool\`: an online shop. (seen: /)\n\n## What it is for\nA shop that sells mugs. (seen: /)\n\n## Who uses it\n${who}\n\n## Where it is used\n${used}\n\n## The main loop\nBrowse, order, check. (seen: /produits)\n\n## Key journeys\n\n${journeys.map(journey).join("\n")}`;

async function project() {
  const dir = await mkdtemp(join(tmpdir(), "aeom-product-"));
  return { dir, sheet: join(dir, ".aeom", "product.md"), draft: join(dir, "draft.md") };
}

test("aeom product writes the sheet AEOM drafted into .aeom/product.md", async () => {
  const p = await project();
  try {
    await writeFile(p.draft, sheet());
    const { code, out } = await run(p.dir, ["product", p.draft]);
    assert.equal(code, 0, out);
    assert.match(await readFile(p.sheet, "utf8"), /^# Super boutique\n\n## What kind of product\n`tool`: an online shop\. \(seen: \/\)\n\n## What it is for\n/);
    assert.match(out, /Wrote \.aeom\/product\.md, a first sheet with 3 key journeys/);
  } finally {
    await rm(p.dir, { recursive: true, force: true });
  }
});

test("an incomplete draft is refused with its problems, and the sheet in place is left as it was", async () => {
  const p = await project();
  try {
    await writeFile(p.draft, sheet());
    await run(p.dir, ["product", p.draft]);
    await writeFile(p.draft, sheet(undefined, ["Only one"]));
    const { code, out } = await run(p.dir, ["product", p.draft]);
    assert.equal(code, 1);
    assert.match(out, /3 to 5 key journeys, found 1/);
    assert.match(await readFile(p.sheet, "utf8"), /### Contact the shop/, "the sheet is untouched");
  } finally {
    await rm(p.dir, { recursive: true, force: true });
  }
});

test("a second run keeps what the user corrected and says what changed", async () => {
  const p = await project();
  try {
    await writeFile(p.draft, sheet());
    await run(p.dir, ["product", p.draft]);
    const corrected = (await readFile(p.sheet, "utf8")).replace("People buying a gift. (to confirm)", "Locals, every month. (seen: Antoine)");
    await writeFile(p.sheet, corrected);
    await writeFile(p.draft, sheet(undefined, ["See the products", "See my orders", "Contact the shop", "Find help"]));
    const { code, out } = await run(p.dir, ["product", p.draft]);
    assert.equal(code, 0, out);
    const written = await readFile(p.sheet, "utf8");
    assert.match(written, /Locals, every month/);
    assert.match(written, /### Find help/);
    assert.match(out, /Kept your edits: Who uses it/);
    assert.match(out, /Added: journey "Find help"/);
  } finally {
    await rm(p.dir, { recursive: true, force: true });
  }
});

test("a draft that does not exist is an error, and nothing is written", async () => {
  const p = await project();
  try {
    const { code, out } = await run(p.dir, ["product", p.draft]);
    assert.equal(code, 1);
    assert.match(out, /Cannot read the draft/);
    assert.ok(!existsSync(p.sheet));
  } finally {
    await rm(p.dir, { recursive: true, force: true });
  }
});

test("a file waiting at the old temporary path is never followed or overwritten", async () => {
  const p = await project();
  try {
    await mkdir(join(p.dir, ".aeom"));
    const outside = join(p.dir, "outside.txt");
    await writeFile(outside, "keep me");
    await symlink(outside, join(p.dir, ".aeom", "product.md.tmp"));
    await writeFile(p.draft, sheet());
    const { code, out } = await run(p.dir, ["product", p.draft]);
    assert.equal(code, 0, out);
    assert.equal(await readFile(outside, "utf8"), "keep me");
  } finally {
    await rm(p.dir, { recursive: true, force: true });
  }
});

test("an update that stopped between the sheet and its base is finished, or dropped if the sheet was never written", async () => {
  const p = await project();
  const pending = join(p.dir, ".aeom", "product.pending.json");
  const base = join(p.dir, ".aeom", "product.base.md");
  const hash = (text: string) => createHash("sha256").update(text).digest("hex");
  try {
    await writeFile(p.draft, sheet());
    await run(p.dir, ["product", p.draft]);
    // Stopped after writing the sheet: the base is finished from the pending update.
    const written = await readFile(p.sheet, "utf8");
    await writeFile(pending, JSON.stringify({ base: "the new base", sheet: hash(written) }));
    await run(p.dir, ["product", p.draft]);
    assert.equal(existsSync(pending), false);
    // Stopped before writing the sheet: the pending update is dropped, the base stays.
    await writeFile(pending, JSON.stringify({ base: "never used", sheet: hash("another sheet") }));
    const before = await readFile(base, "utf8");
    await run(p.dir, ["product", p.draft]);
    assert.notEqual(await readFile(base, "utf8"), "never used");
    assert.equal(existsSync(pending), false);
    assert.equal(before, sheet());
  } finally {
    await rm(p.dir, { recursive: true, force: true });
  }
});

test("corrections that leave a required part out are refused, and the sheet stays as the user left it", async () => {
  const p = await project();
  try {
    await writeFile(p.draft, sheet());
    await run(p.dir, ["product", p.draft]);
    const renamed = (await readFile(p.sheet, "utf8")).replace("## Who uses it", "## Who reads it");
    await writeFile(p.sheet, renamed);
    const { code, out } = await run(p.dir, ["product", p.draft]);
    assert.equal(code, 1);
    assert.match(out, /missing "Who uses it"/);
    assert.equal(await readFile(p.sheet, "utf8"), renamed);
  } finally {
    await rm(p.dir, { recursive: true, force: true });
  }
});

test("journeys AEOM no longer proposes are removed and said so", async () => {
  const p = await project();
  try {
    await writeFile(p.draft, sheet(undefined, ["See the products", "See my orders", "Contact the shop", "Find help"]));
    await run(p.dir, ["product", p.draft]);
    await writeFile(p.draft, sheet());
    const { code, out } = await run(p.dir, ["product", p.draft]);
    assert.equal(code, 0, out);
    assert.match(out, /Removed, no longer in AEOM's draft: journey "Find help"/);
    assert.doesNotMatch(await readFile(p.sheet, "utf8"), /Find help/);
  } finally {
    await rm(p.dir, { recursive: true, force: true });
  }
});

test("a second aeom product waits its turn: it is refused while another one writes", async () => {
  const p = await project();
  try {
    await mkdir(join(p.dir, ".aeom"));
    await writeFile(join(p.dir, ".aeom", "product.lock"), String(process.pid));
    await writeFile(p.draft, sheet());
    const busy = await run(p.dir, ["product", p.draft]);
    assert.equal(busy.code, 1);
    assert.match(busy.out, /Another aeom product \(process \d+\) is writing the sheet/);
    assert.ok(!existsSync(p.sheet));
    // A lock left by a process that is gone is taken over.
    await writeFile(join(p.dir, ".aeom", "product.lock"), "999999");
    const after = await run(p.dir, ["product", p.draft]);
    assert.equal(after.code, 0, after.out);
    assert.ok(!existsSync(join(p.dir, ".aeom", "product.lock")), "the lock is released");
  } finally {
    await rm(p.dir, { recursive: true, force: true });
  }
});

test("aeom product --brief gives the directions what the app is for, who uses it and its loop, and names what is left out as to confirm", async () => {
  const { dir, sheet: file } = await project();
  try {
    const none = await run(dir, ["product", "--brief"]);
    assert.equal(none.code, 1);
    assert.match(none.out, /No product sheet in \.aeom\/product\.md/);
    await mkdir(join(dir, ".aeom"), { recursive: true });
    await writeFile(file, sheet());
    const { code, out } = await run(dir, ["product", "--brief"]);
    assert.equal(code, 0, out);
    assert.match(out, /^Super boutique\nKind: tool\n\nWhat it is for: A shop that sells mugs\.\nThe main loop: Browse, order, check\.\n/);
    assert.doesNotMatch(out, /\(seen:/);
    assert.match(out, /Left out, to confirm:\n- Who uses it: People buying a gift\./);
    await writeFile(file, sheet().replace("`tool`: an online shop.", "`game`: a strategy game.").replace("## Key journeys", "## Genre and fiction\nTamed beasts on a wild planet. (seen: README.md)\n\n## The feeling it aims for\nPride. (seen: README.md)\n\n## References\nHearthstone. (to confirm)\n\n## Visual assets\nPainted beasts. (seen: public/illustrations/)\n\n## Key journeys"));
    const game = await run(dir, ["product", "--brief"]);
    assert.equal(game.code, 0, game.out);
    assert.match(game.out, /^Super boutique\nKind: game: the directions start from its world, its visual assets and its genre's interface, not from the real things it names\n/);
    assert.match(game.out, /Genre and fiction: Tamed beasts on a wild planet\.\nThe feeling it aims for: Pride\.\nVisual assets: Painted beasts\./);
    assert.match(game.out, /- References: Hearthstone\./);
    await writeFile(file, sheet().replace(/## What kind of product\n.*\n\n/, ""));
    assert.match((await run(dir, ["product", "--brief"])).out, /^Super boutique\nKind: not said: the sheet was written before AEOM said it, so it reads as a tool's\. Draft the sheet again and write it with aeom product, so it says the kind first\.\n/);
    await writeFile(file, sheet().replace("## What it is for", "## What it's for"));
    const renamed = await run(dir, ["product", "--brief"]);
    assert.equal(renamed.code, 1);
    assert.match(renamed.out, /has no "What it is for": put the heading back/);
    await writeFile(file, sheet().replace("mugs. (seen: /)", "mugs. (to confirm)").replace("(seen: /produits)", "(to confirm)"));
    const guessed = await run(dir, ["product", "--brief"]);
    assert.equal(guessed.code, 1);
    assert.match(guessed.out, /Nothing in \.aeom\/product\.md is confirmed/);
    await writeFile(file, sheet().replace("mugs. (seen: /)", "mugs. (to confirm)").replace("(seen: /produits)", "(to confirm)").replace("`tool`: an online shop.", "`game`: a game.").replace("## Key journeys", "## Genre and fiction\nBeasts. (seen: README.md)\n\n## The feeling it aims for\nPride. (to confirm)\n\n## References\nNone. (to confirm)\n\n## Visual assets\nPaintings. (seen: public/)\n\n## Key journeys"));
    assert.equal((await run(dir, ["product", "--brief"])).code, 1, "a world confirmed is not enough when what the app is for, who uses it and its loop are all guesses");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom product --widths says the widths the front is judged at and why, and exits 2 when only the user can say", async () => {
  const { dir, sheet: file } = await project();
  try {
    await mkdir(join(dir, ".aeom"), { recursive: true });
    const none = await run(dir, ["product", "--widths"]);
    assert.equal(none.code, 2);
    assert.match(none.out, /Not known: there is no product sheet/);
    await writeFile(file, sheet(undefined, undefined, "`desktop`: the web is for the morning sort; an iOS app serves the phone. (seen: docs/PRD.md)"));
    const desktop = await run(dir, ["product", "--widths"]);
    assert.equal(desktop.code, 0, desktop.out);
    assert.match(desktop.out, /^Widths: 1280\. The front is used on desktop \(seen: docs\/PRD\.md\)\.$/m);
    await writeFile(file, sheet(undefined, undefined, "`both`: nothing says it. (to confirm)"));
    const guess = await run(dir, ["product", "--widths"]);
    assert.equal(guess.code, 2);
    assert.match(guess.out, /Not known: the sheet says both without a \(seen: …\) source, a guess\. Ask the user whether the front is used on mobile, desktop or both, then record it: aeom product --used-on <mobile\|desktop\|both> --by <their name>/);
    await writeFile(join(dir, ".aeom", "config.json"), JSON.stringify({ widths: [390, 768, 1280] }));
    const config = await run(dir, ["product", "--widths"]);
    assert.equal(config.code, 0, "the config wins over the sheet");
    assert.match(config.out, /^Widths: 390,768,1280\. From "widths" in \.aeom\/config\.json\.$/m);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom product --used-on records the user's answer in the sheet as their own correction, so no later run asks again", async () => {
  const { dir, sheet: file, draft } = await project();
  try {
    await writeFile(draft, sheet(undefined, undefined, "`both`: nothing says it. (to confirm)"));
    assert.equal((await run(dir, ["product", draft])).code, 0);
    const answered = await run(dir, ["product", "--used-on", "desktop", "--by", "Antoine"]);
    assert.equal(answered.code, 0, answered.out);
    assert.match(await readFile(file, "utf8"), /## Where it is used\n`desktop`: Antoine said so\. \(seen: Antoine\)\n/);
    assert.match((await run(dir, ["product", "--widths"])).out, /^Widths: 1280\. The front is used on desktop \(seen: Antoine\)\.$/m);
    // The next run drafts its guess again: the user's answer stays.
    assert.equal((await run(dir, ["product", draft])).code, 0);
    assert.match(await readFile(file, "utf8"), /`desktop`: Antoine said so\. \(seen: Antoine\)/);
    const wrong = await run(dir, ["product", "--used-on", "tablet", "--by", "Antoine"]);
    assert.equal(wrong.code, 1);
    assert.match(wrong.out, /--used-on is mobile, desktop or both/);
    assert.equal((await run(dir, ["product", "--used-on", "mobile"])).code, 1, "an answer says whose it is");
    for (const by of ["<me>", "Antoine (CEO", "Antoine\nBruno"]) {
      const odd = await run(dir, ["product", "--used-on", "mobile", "--by", by]);
      assert.equal(odd.code, 1, `--by ${JSON.stringify(by)}`);
      assert.match(odd.out, /--by is a name on one line, without parentheses or angle brackets/);
    }
    assert.match(await readFile(file, "utf8"), /`desktop`: Antoine said so\. \(seen: Antoine\)/, "a refused answer leaves the sheet as it was");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom product --used-on refuses a sheet AEOM never wrote: the user's own parts would read as AEOM's and be overwritten", async () => {
  const { dir, sheet: file } = await project();
  try {
    await mkdir(join(dir, ".aeom"), { recursive: true });
    await writeFile(file, sheet("Written by hand. (seen: Antoine)"));
    const { code, out } = await run(dir, ["product", "--used-on", "desktop", "--by", "Antoine"]);
    assert.equal(code, 1);
    assert.match(out, /AEOM never wrote .aeom\/product\.md with aeom product: write its draft with aeom product <draft> first/);
    assert.match(await readFile(file, "utf8"), /Written by hand\. \(seen: Antoine\)/);
    assert.equal(existsSync(join(dir, ".aeom", "product.base.md")), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom product refuses an accepted exception that names no principle or check AEOM knows, or that AEOM guessed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-product-exceptions-"));
  try {
    const withExceptions = (lines: string) => sheet().replace("## Key journeys", `## Accepted exceptions\n${lines}\n\n## Key journeys`);
    await writeFile(join(dir, "draft.md"), withExceptions("- `not-generic` on every page: the deep violet is the brand's, chosen. (seen: Victor)\n- `contrast` on /: the grey of the charter. (seen: charte.pdf)"));
    const ok = await run(dir, ["product", "draft.md"]);
    assert.equal(ok.code, 0, ok.out);
    await writeFile(join(dir, "draft.md"), withExceptions("- `not-a-check` on /: why not. (seen: Victor)\n- `hierarchy` on /: two focal points. (to confirm)"));
    const refused = await run(dir, ["product", "draft.md"]);
    assert.equal(refused.code, 1);
    assert.match(refused.out, /`not-a-check` is no principle or check AEOM knows/);
    assert.match(refused.out, /`hierarchy` on \/ is a guess: only the person or the spec accepts an exception, never AEOM/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

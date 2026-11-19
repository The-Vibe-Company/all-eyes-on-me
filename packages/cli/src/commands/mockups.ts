import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs, promisify } from "node:util";
import { contactSheet, readAngle, type Angle } from "@aeom/core";
import { parseWidths } from "./app.js";

export const MOCKUPS_HELP = `Usage: aeom mockups <directions folder> [<slug>...] [--widths <list>] [--now <route>=<capture>]... [--note <slug>=<sentence>]... [--product <sheet>]

Every direction of a round of /aeom directions, in one command: the slugs
given, or else each folder in <directions folder> that holds an index.html.
Each says in its folder's direction.json its sentence, its structure and its
dense page; one that does not is laid out with no sentence, its first other
page as its dense one.
For each direction, its index.html
and its other page are captured at the widest width and laid out in
<slug>.png, and it is checked at every width. Then they are laid out three
to a sheet, one under the other, in sheet.png, then sheet-2.png and
sheet-3.png, the front as it is first on each when --now gives its captures,
each with its sentence. It says, for each, what its checks found, and names
the images the screening judge reads: one per direction, never a sheet.

  --widths <list>          The run's widths (default 390,1280)
  --now <route>=<capture>  A screen of the front as it is, captured: laid out
                           first, as now.png
  --note <slug>=<sentence> One sentence read under that direction, in place of
                           the one its direction.json gives
  --product <sheet>        A product sheet whose accepted exceptions the checks
                           say apart, such as a spec's`;

const CLI = process.argv[1]!;
/** The CLI itself, for what it already does: capture and check a folder it serves. */
const aeom = (args: string[]) =>
  // A child says nothing of AEOM's version: its last line is what went wrong, or nothing.
  promisify(execFile)(process.execPath, [CLI, ...args], { maxBuffer: 1 << 26, env: { ...process.env, AEOM_UPDATE_CHECK: "0" } }).then(
    () => ({ code: 0, said: "" }),
    (e: { code?: number; stderr?: string }) => ({ code: e.code ?? 1, said: (e.stderr ?? "").trim().split("\n").filter(Boolean).at(-1) ?? "" }),
  );
const json = async <T>(file: string): Promise<T | null> => readFile(file, "utf8").then((t) => JSON.parse(t) as T, () => null);
/** Directions to a sheet: a sheet of six or nine is too tall to read, for a person as for a model. */
const PER_SHEET = 3;
const listed = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

interface Shot {
  path: string;
  files: { width: number; file: string }[];
}

export async function runMockups(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { widths: { type: "string" }, now: { type: "string", multiple: true }, note: { type: "string", multiple: true }, product: { type: "string" }, help: { type: "boolean", short: "h" } } });
  const [dir, ...named] = positionals;
  if (values.help || !dir) {
    console.log(MOCKUPS_HELP);
    return values.help ? 0 : 1;
  }
  const widths = parseWidths(values.widths ?? "390,1280");
  if (typeof widths === "string") return (console.error(widths), 1);
  const widest = Math.max(...widths);
  // The round's directions when it names them: an earlier round left in the same folder is not this one.
  const slugs = named.length ? named : (await readdir(dir, { withFileTypes: true }).catch(() => [])).filter((d) => d.isDirectory() && existsSync(join(dir, d.name, "index.html"))).map((d) => d.name).sort();
  const absent = slugs.filter((slug) => !existsSync(join(dir, slug, "index.html")));
  if (!slugs.length || absent.length) {
    console.error(absent.length ? `No index.html in ${absent.map((a) => join(dir, a)).join(", ")}: a direction is a folder holding one.` : `No direction in ${dir}: each is a folder holding an index.html.`);
    return 1;
  }
  // The front as it is and the sheets have these names in the folder: a direction named so would be lost among them.
  const reserved = slugs.filter((slug) => /^(now|sheet(-\d+)?)$/.test(slug));
  if (reserved.length) return (console.error(`${reserved.join(", ")}: a direction cannot be named now, sheet or sheet-<n>, which name the front as it is and the sheets. Rename its folder.`), 1);
  const notes = new Map<string, string>();
  for (const note of values.note ?? []) {
    const at = note.indexOf("=");
    if (at < 1 || !note.slice(at + 1).trim()) return (console.error(`--note takes <slug>=<sentence>.`), 1);
    const slug = note.slice(0, at);
    if (!slugs.includes(slug)) return (console.error(`A note for ${slug}, which is not a direction of this round.`), 1);
    if (notes.has(slug)) return (console.error(`Two notes for ${slug}: give each direction one sentence.`), 1);
    notes.set(slug, note.slice(at + 1).trim());
  }
  // What each direction is meant to be, written in its folder: its sentence and structure under it, unless --note says otherwise.
  const angles = new Map<string, Angle | null>();
  const unreadable: string[] = [];
  for (const slug of slugs) {
    const read = await readAngle(join(dir, slug));
    if (read.problem) unreadable.push(read.problem);
    angles.set(slug, read.angle ?? null);
  }
  if (unreadable.length) return (console.error(unreadable.join("\n")), 1);
  for (const [slug, angle] of angles) if (!notes.has(slug) && angle?.sentence) notes.set(slug, angle.structure ? `${angle.sentence} Structure: ${angle.structure}` : angle.sentence);
  const now: { label: string; file: string }[] = [];
  for (const n of values.now ?? []) {
    const at = n.lastIndexOf("=");
    if (at < 1) return (console.error(`--now takes <route>=<capture>.`), 1);
    if (!existsSync(n.slice(at + 1))) return (console.error(`${n.slice(at + 1)} is not there: give the capture of the front as it is.`), 1);
    now.push({ label: n.slice(0, at), file: n.slice(at + 1) });
  }

  // Every direction at once: a capture of its two pages, their sheet, and its checks at every width.
  const results = await Promise.all(
    slugs.map(async (slug) => {
      const folder = join(dir, slug);
      // The dense page its direction.json names; else, or when it is not there, its first other page, said.
      const others = (await readdir(folder)).filter((f) => f.endsWith(".html") && f !== "index.html").sort();
      const named = angles.get(slug)?.dense;
      const dense = named && others.includes(named) ? named : others[0];
      const misnamed = named && dense !== named ? `its dense page, ${named}, is not in its folder: ${dense ? `${dense} captured instead` : "its first page alone captured"}` : "";
      const pages = ["/", ...(dense ? [`/${dense}`] : [])];
      const shots = join(dir, `${slug}-shots`);
      // What an earlier round left of it never stands for this one: a direction that no longer opens has no image.
      await Promise.all([`${slug}.png`, `${slug}-shots`, `${slug}-checks`].map((f) => rm(join(dir, f), { recursive: true, force: true })));
      const captured = await aeom(["capture", "--dir", folder, "--pages", pages.join(","), "--widths", String(widest), "--out", shots]);
      const manifest = await json<{ pages: Shot[] }>(join(shots, "manifest.json"));
      const files = pages.map((page) => ({ page, file: manifest?.pages.find((p) => p.path === page)?.files.find((f) => f.width === widest)?.file }));
      if (!manifest || files.some((f) => !f.file)) return { slug, opened: false as const, why: captured.said, misnamed };
      await contactSheet({ out: join(dir, `${slug}.png`), items: files.map((f) => ({ label: f.page, file: join(shots, f.file!) })), columns: files.length, cellWidth: 640 });
      await aeom(["check", "--dir", folder, "--widths", widths.join(","), "--out", join(dir, `${slug}-checks`), ...(values.product ? ["--product", values.product] : [])]);
      const report = await json<{ pages?: unknown[]; errors?: unknown[]; findings?: { check: string }[] }>(join(dir, `${slug}-checks`, "check.json"));
      const counts = new Map<string, number>();
      for (const f of report?.findings ?? []) counts.set(f.check, (counts.get(f.check) ?? 0) + 1);
      // A check that measured no page, or not all of them, has not passed them.
      const unchecked = report?.errors?.length ?? 0;
      return { slug, opened: true as const, failing: [...counts].map(([check, n]) => (n > 1 ? `${check} ×${n}` : check)), checked: Boolean(report?.pages?.length), unchecked, misnamed };
    }),
  );

  // Three directions to a sheet, the front as it is first on each, every direction with its sentence; one that did not open shows as a gap.
  const first = now.length ? [{ label: "now", file: join(dir, "now.png"), note: "The front as it is today." }] : [];
  if (now.length) await contactSheet({ out: join(dir, "now.png"), items: now, columns: now.length, cellWidth: 640 });
  const items: { label: string; file: string; note?: string }[] = results.map((r) => ({ label: r.slug, file: join(dir, `${r.slug}.png`), ...(notes.has(r.slug) ? { note: notes.get(r.slug)! } : {}) }));
  const sheets: string[] = [];
  for (let at = 0; at < items.length; at += PER_SHEET) {
    const out = join(dir, sheets.length ? `sheet-${sheets.length + 1}.png` : "sheet.png");
    await contactSheet({ out, items: [...first, ...items.slice(at, at + PER_SHEET)], columns: 1, cellWidth: 1600 });
    sheets.push(out);
  }
  // An earlier round's sheets beyond these would be shown with this one by mistake.
  for (const file of await readdir(dir)) if (Number(/^sheet-(\d+)\.png$/.exec(file)?.[1]) > sheets.length) await rm(join(dir, file), { force: true });
  await writeFile(join(dir, "sheet.json"), `${JSON.stringify([...first, ...items].map(({ label, note }) => ({ label, note })), null, 2)}\n`);

  const column = Math.max(...slugs.map((s) => s.length)) + 2;
  // What it could not read of a direction's folder, said after what its checks found.
  const unsaid = (r: (typeof results)[number]) => `${r.misnamed ? `; ${r.misnamed}` : ""}${notes.has(r.slug) ? "" : "; no sentence under it: its direction.json gives none"}`;
  const lines = results.map((r) => {
    if (!r.opened) return `  ${r.slug.padEnd(column)}did not open, left out${r.why ? `: ${r.why}` : ""}${r.misnamed ? `; ${r.misnamed}` : ""}`;
    if (!r.checked) return `  ${r.slug.padEnd(column)}not checked${unsaid(r)}`;
    const found = r.failing.length ? r.failing.join(", ") : "passes every check";
    return `  ${r.slug.padEnd(column)}${found}${r.unchecked ? `; ${r.unchecked} page${r.unchecked === 1 ? "" : "s"} not checked` : ""}${unsaid(r)}`;
  });
  const laid = sheets.length > 1 ? `three to a sheet, laid out in ${listed(sheets)}${now.length ? ", the front as it is first on each" : ""}` : `laid out in ${sheets[0]}${now.length ? ", the front as it is first" : ""}`;
  console.log(`${slugs.length} direction${slugs.length === 1 ? "" : "s"}, ${laid}:\n${lines.join("\n")}`);
  // A model shrinks a tall sheet until it reads nothing on it: the screening judge reads each direction whole.
  const opened = results.filter((r) => r.opened).map((r) => join(dir, `${r.slug}.png`));
  if (opened.length) console.log(`For the screening judge, one image each: ${[...first.map((f) => f.file), ...opened].join(", ")}`);
  return results.some((r) => r.opened) ? 0 : 1;
}

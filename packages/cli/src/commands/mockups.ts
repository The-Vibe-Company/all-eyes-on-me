import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs, promisify } from "node:util";
import { contactSheet } from "@aeom/core";
import { parseWidths } from "./app.js";

export const MOCKUPS_HELP = `Usage: aeom mockups <directions folder> [<slug>...] [--widths <list>] [--now <route>=<capture>]... [--note <slug>=<sentence>]... [--product <sheet>]

Every direction of a round of /aeom directions, in one command: the slugs
given, or else each folder in <directions folder> that holds an index.html.
For each direction, its index.html
and its other page are captured at the widest width and laid out in
<slug>.png, and it is checked at every width. Then sheet.png lays them all
out, one under the other, the front as it is first when --now gives its
captures, each with its sentence. It says, for each, what its checks found.

  --widths <list>          The run's widths (default 390,1280)
  --now <route>=<capture>  A screen of the front as it is, captured: laid out
                           first, as now.png
  --note <slug>=<sentence> One sentence read under that direction
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
  const notes = new Map<string, string>();
  for (const note of values.note ?? []) {
    const at = note.indexOf("=");
    if (at < 1 || !note.slice(at + 1).trim()) return (console.error(`--note takes <slug>=<sentence>.`), 1);
    const slug = note.slice(0, at);
    if (!slugs.includes(slug)) return (console.error(`A note for ${slug}, which is not a direction of this round.`), 1);
    if (notes.has(slug)) return (console.error(`Two notes for ${slug}: give each direction one sentence.`), 1);
    notes.set(slug, note.slice(at + 1).trim());
  }
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
      const dense = (await readdir(folder)).filter((f) => f.endsWith(".html") && f !== "index.html").sort()[0];
      const pages = ["/", ...(dense ? [`/${dense}`] : [])];
      const shots = join(dir, `${slug}-shots`);
      const captured = await aeom(["capture", "--dir", folder, "--pages", pages.join(","), "--widths", String(widest), "--out", shots]);
      const manifest = await json<{ pages: Shot[] }>(join(shots, "manifest.json"));
      const files = pages.map((page) => ({ page, file: manifest?.pages.find((p) => p.path === page)?.files.find((f) => f.width === widest)?.file }));
      if (!manifest || files.some((f) => !f.file)) return { slug, opened: false as const, why: captured.said };
      await contactSheet({ out: join(dir, `${slug}.png`), items: files.map((f) => ({ label: f.page, file: join(shots, f.file!) })), columns: files.length, cellWidth: 640 });
      await aeom(["check", "--dir", folder, "--widths", widths.join(","), "--out", join(dir, `${slug}-checks`), ...(values.product ? ["--product", values.product] : [])]);
      const report = await json<{ pages?: unknown[]; errors?: unknown[]; findings?: { check: string }[] }>(join(dir, `${slug}-checks`, "check.json"));
      const counts = new Map<string, number>();
      for (const f of report?.findings ?? []) counts.set(f.check, (counts.get(f.check) ?? 0) + 1);
      // A check that measured no page, or not all of them, has not passed them.
      const unchecked = report?.errors?.length ?? 0;
      return { slug, opened: true as const, failing: [...counts].map(([check, n]) => (n > 1 ? `${check} ×${n}` : check)), checked: Boolean(report?.pages?.length), unchecked };
    }),
  );

  // The front as it is first, then every direction, each with its sentence; one that did not open shows as a gap.
  const items: { label: string; file: string; note?: string }[] = [];
  if (now.length) {
    await contactSheet({ out: join(dir, "now.png"), items: now, columns: now.length, cellWidth: 640 });
    items.push({ label: "now", file: join(dir, "now.png"), note: "The front as it is today." });
  }
  for (const r of results) items.push({ label: r.slug, file: join(dir, `${r.slug}.png`), ...(notes.has(r.slug) ? { note: notes.get(r.slug)! } : {}) });
  await contactSheet({ out: join(dir, "sheet.png"), items, columns: 1, cellWidth: 1600 });
  await writeFile(join(dir, "sheet.json"), `${JSON.stringify(items.map(({ label, note }) => ({ label, note })), null, 2)}\n`);

  const column = Math.max(...slugs.map((s) => s.length)) + 2;
  const lines = results.map((r) => {
    if (!r.opened) return `  ${r.slug.padEnd(column)}did not open, left out${r.why ? `: ${r.why}` : ""}`;
    if (!r.checked) return `  ${r.slug.padEnd(column)}not checked`;
    const found = r.failing.length ? r.failing.join(", ") : "passes every check";
    return `  ${r.slug.padEnd(column)}${found}${r.unchecked ? `; ${r.unchecked} page${r.unchecked === 1 ? "" : "s"} not checked` : ""}`;
  });
  console.log(`${slugs.length} direction${slugs.length === 1 ? "" : "s"}, laid out in ${join(dir, "sheet.png")}${now.length ? ", the front as it is first" : ""}:\n${lines.join("\n")}`);
  return results.some((r) => r.opened) ? 0 : 1;
}

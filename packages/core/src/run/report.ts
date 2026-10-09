import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CaptureManifest } from "../capture/capture.js";
import type { CheckReport } from "../checks/run.js";
import { champion, type Tournament } from "../directions/tournament.js";
import type { JourneyReport } from "../journey/replay.js";
import type { RatchetVerdict } from "../journey/ratchet.js";
import type { JudgeReport } from "../judge/tally.js";
import { comparePages, scorePages } from "./compare.js";
import { STYLE_PRINCIPLES, verdictOf, type Failure } from "./verdict.js";

/** What `aeom verdict --out` keeps of a verdict. */
export interface SavedVerdict {
  nothingToRedo: boolean;
  /** The line saying what was measured. */
  line: string;
  failures: Failure[];
  keepStyle?: boolean;
}

export interface ResultPage {
  run: string;
  verdict: SavedVerdict | null;
  /** The direction the knockout chose, when the run built directions. */
  direction: { champion: string; entrants: string[]; reasons: string[]; sheet: string | null } | null;
  screens: {
    page: string;
    status: "kept" | "sent back" | "new" | "missing" | "unchanged";
    widths: { width: number; before: string | null; after: string | null }[];
    cleared: string[];
    still: string[];
    newly: string[];
  }[];
  journeys: {
    slug: string;
    name: string;
    status: "kept" | "sent back" | "unchanged";
    why: string | null;
    steps: { before: number | null; after: number | null };
    widths: { width: number; before: string | null; after: string | null }[];
    cleared: string[];
    remaining: string[];
  }[];
  stillFailing: Failure[];
}

/** A run folder without what the page needs. */
export class RunReportError extends Error {}

const exists = (file: string) => access(file).then(() => true, () => false);
async function json<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new RunReportError(`${file} cannot be read: ${(error as Error).message}`);
  }
}
/** The first of these folders of the run that holds a file, by name. */
async function first(runDir: string, names: string[], file: string): Promise<string | null> {
  for (const name of names) if (await exists(join(runDir, name, file))) return name;
  return null;
}

/**
 * Reads what a run left in its folder (`.aeom/runs/<run>/`): the snapshots
 * before and at the end, the knockout, the journeys' replays and ratchet, the
 * verdict. Every path in the result is relative to the run's folder.
 */
export async function readRun(runDir: string, run: string): Promise<ResultPage> {
  const before = await json<CaptureManifest>(join(runDir, "before", "captures", "manifest.json"));
  if (!before) throw new RunReportError(`${join(runDir, "before")} holds no snapshot: the run took none, so there is nothing to show.`);
  const verdict = await json<SavedVerdict>(join(runDir, "verdict.json"));
  const keepStyle = verdict?.keepStyle === true;

  // The last state the run branch matches: after the journeys, after pages were put back, or after the pages.
  const last = await first(runDir, ["end", "after-revert", "after"], join("captures", "manifest.json"));
  const after = last ? await json<CaptureManifest>(join(runDir, last, "captures", "manifest.json")) : null;
  const reports = async (dir: string) => ({ check: (await json<CheckReport>(join(runDir, dir, "reports", "check.json"))) ?? undefined, judge: (await json<JudgeReport>(join(runDir, dir, "reports", "judge.json"))) ?? undefined });
  const was = await reports("before");
  const now = last ? await reports(last) : null;
  const ignore = keepStyle ? STYLE_PRINCIPLES : [];
  const comparison = now ? comparePages(scorePages(was.check, was.judge, ignore), scorePages(now.check, now.judge, ignore)) : [];

  const pages = [...new Set([...before.pages.map((p) => p.path), ...(after?.pages.map((p) => p.path) ?? [])])];
  const screens: ResultPage["screens"] = pages.map((page) => {
    const b = before.pages.find((p) => p.path === page);
    const a = after?.pages.find((p) => p.path === page);
    const widths = [...new Set([...(b?.files ?? []), ...(a?.files ?? [])].map((f) => f.width))].sort((x, y) => x - y);
    const c = comparison.find((x) => x.page === page);
    const failingBefore = c?.before?.failing ?? [];
    const failingAfter = c?.after?.failing ?? [];
    const status = !c ? "unchanged" : c.verdict === "better" ? "kept" : c.verdict === "new" || c.verdict === "missing" ? c.verdict : "sent back";
    return {
      page,
      status,
      widths: widths.map((width) => ({
        width,
        before: b?.files.find((f) => f.width === width) ? `before/captures/${b.files.find((f) => f.width === width)!.file}` : null,
        after: a?.files.find((f) => f.width === width) ? `${last}/captures/${a.files.find((f) => f.width === width)!.file}` : null,
      })),
      cleared: failingBefore.filter((f) => !failingAfter.includes(f)),
      still: failingAfter.filter((f) => failingBefore.includes(f)),
      newly: c?.newly ?? [],
    };
  });

  const tournament = await json<Tournament>(join(runDir, "directions", "tournament.json"));
  const winner = tournament ? champion(tournament) : null;
  const final = tournament?.duels.filter((d) => d.winner === winner).sort((x, y) => y.round - x.round)[0];
  const direction = tournament && winner ? { champion: winner, entrants: tournament.entrants, reasons: final?.reasons ?? [], sheet: (await exists(join(runDir, "directions", "sheet.png"))) ? "directions/sheet.png" : null } : null;

  const replayBefore = await json<JourneyReport>(join(runDir, "journeys-before", "report.json"));
  const lastReplay = await first(runDir, ["journeys-end", "journeys-after"], "report.json");
  const replayAfter = lastReplay ? await json<JourneyReport>(join(runDir, lastReplay, "report.json")) : null;
  const ratchet = (await json<RatchetVerdict[]>(join(runDir, "journeys-end", "ratchet.json"))) ?? [];
  const widest = (r: JourneyReport["journeys"][number] | undefined) => r?.runs.reduce<(typeof r.runs)[number] | undefined>((w, x) => (!w || x.width > w.width ? x : w), undefined);
  const journeys: ResultPage["journeys"] = (replayBefore?.journeys ?? []).map((j) => {
    const a = replayAfter?.journeys.find((x) => x.slug === j.slug);
    const verdictOfJourney = ratchet.find((r) => r.slug === j.slug);
    const widths = [...new Set([...j.runs, ...(a?.runs ?? [])].map((r) => r.width))].sort((x, y) => x - y);
    return {
      slug: j.slug,
      name: j.name,
      status: verdictOfJourney ? (verdictOfJourney.kept ? "kept" : "sent back") : "unchanged",
      why: verdictOfJourney?.why ?? null,
      steps: { before: widest(j)?.counts.steps ?? null, after: a ? (widest(a)?.counts.steps ?? null) : null },
      widths: widths.map((width) => ({
        width,
        before: j.runs.find((r) => r.width === width)?.sheet ? `journeys-before/${j.runs.find((r) => r.width === width)!.sheet}` : null,
        after: a?.runs.find((r) => r.width === width)?.sheet ? `${lastReplay}/${a.runs.find((r) => r.width === width)!.sheet}` : null,
      })),
      cleared: verdictOfJourney?.cleared ?? [],
      remaining: verdictOfJourney?.remaining ?? [],
    };
  });

  // What still fails: the verdict of the last state, screens and journeys.
  let stillFailing: Failure[] = [];
  if (now?.check && now.judge) {
    const journeyJudge = lastReplay ? ((await json<JudgeReport>(join(runDir, lastReplay, "judge-journeys.json"))) ?? undefined) : undefined;
    stillFailing = verdictOf({ check: now.check, judge: now.judge, journeys: replayAfter ?? undefined, journeyJudge, recorded: replayAfter?.journeys.map((j) => j.slug) ?? [], keepStyle }).failures;
  }
  return { run, verdict, direction, screens, journeys, stillFailing };
}

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const img = (src: string | null, alt: string) => (src ? `<img src="${escape(src)}" alt="${escape(alt)}" loading="lazy">` : `<p class="none">No capture</p>`);
const list = (label: string, items: string[]) => (items.length ? `<p><span class="label">${label}</span> ${items.map(escape).join(", ")}</p>` : "");

/** The page, standalone: its styles inline, its images beside it in the run's folder, nothing from the network. */
export function resultHtml(r: ResultPage): string {
  const nothing = r.verdict?.nothingToRedo === true;
  const head = `<header><p class="run">${escape(r.run)}</p><h1>${nothing ? "Nothing to redo" : "What the run gave"}</h1>${r.verdict ? `<p class="line">${escape(r.verdict.line)}</p>` : ""}</header>`;
  const nav = nothing ? "" : `<nav><a href="#direction">Direction</a><a href="#screens">Screens</a><a href="#journeys">Journeys</a><a href="#still">Still failing</a></nav>`;

  const direction = r.direction
    ? `<section id="direction"><h2>Direction: ${escape(r.direction.champion)}</h2><p class="muted">Chosen by knockout among ${r.direction.entrants.map(escape).join(", ")}.</p>${r.direction.reasons.map((x) => `<blockquote>${escape(x)}</blockquote>`).join("")}${r.direction.sheet ? `<figure>${img(r.direction.sheet, "The directions, side by side")}</figure>` : ""}</section>`
    : r.verdict?.keepStyle
      ? `<section id="direction"><h2>Style kept</h2><p class="muted">No new direction: the run fixed what failed on the app's own style.</p></section>`
      : "";

  const pair = (w: { width: number; before: string | null; after: string | null }, what: string) =>
    `<div class="pair"><p class="label">${w.width} px</p><div class="sides"><figure><figcaption>Before</figcaption>${img(w.before, `${what} before, ${w.width} px`)}</figure>${nothing ? "" : `<figure><figcaption>After</figcaption>${img(w.after, `${what} after, ${w.width} px`)}</figure>`}</div></div>`;
  const screens = r.screens
    .map((s) => `<section class="screen" data-page="${escape(s.page)}" data-status="${s.status}"><h3>${escape(s.page)} <span class="status ${s.status.replace(" ", "-")}">${s.status}</span></h3>${list("Cleared:", s.cleared)}${list("Still failing:", s.still)}${list("Newly failing:", s.newly)}${s.widths.map((w) => pair(w, s.page)).join("")}</section>`)
    .join("");
  const journeys = r.journeys
    .map((j) => `<section class="journey" data-journey="${escape(j.slug)}" data-status="${j.status}"><h3>${escape(j.name)} <span class="status ${j.status.replace(" ", "-")}">${j.status}</span></h3><p>${j.steps.before ?? "?"} → ${j.steps.after ?? "?"} steps</p>${j.why ? `<p class="muted">${escape(j.why)}</p>` : ""}${list("Cleared:", j.cleared)}${list("Still failing:", j.remaining)}${j.widths.map((w) => pair(w, j.name)).join("")}</section>`)
    .join("");
  const still = r.stillFailing.length
    ? `<ul>${r.stillFailing.map((f) => `<li><strong>${escape(f.where)}</strong> ${escape(f.what)}</li>`).join("")}</ul>`
    : `<p>Nothing.</p>`;

  const body = nothing
    ? `<section id="screens"><h2>Screens</h2>${screens}</section>`
    : `${direction}<section id="screens"><h2>Screens</h2>${screens}</section>${r.journeys.length ? `<section id="journeys"><h2>Journeys</h2>${journeys}</section>` : ""}<section id="still"><h2>Still failing</h2>${still}</section>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AEOM · ${escape(r.run)}</title>
<style>
  :root { --ink: #161616; --muted: #5c5c5c; --rule: #d9d9d9; --paper: #ffffff; --kept: #1d6b33; --back: #a3261b; }
  @media (prefers-color-scheme: dark) { :root { --ink: #ececec; --muted: #a8a8a8; --rule: #3a3a3a; --paper: #141414; --kept: #6fcf8a; --back: #f08a7e; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  header, nav, section { max-width: 1200px; margin: 0 auto; padding: 0 16px; }
  header { padding-top: 32px; border-bottom: 1px solid var(--rule); padding-bottom: 16px; }
  h1 { margin: 4px 0 8px; font-size: 28px; } h2 { margin: 40px 0 8px; font-size: 22px; border-bottom: 1px solid var(--rule); padding-bottom: 6px; } h3 { margin: 28px 0 6px; font-size: 18px; }
  .run, .muted, .label, figcaption { color: var(--muted); } .run { margin: 0; font-size: 14px; } .line { margin: 0; }
  nav { display: flex; gap: 16px; padding-top: 12px; padding-bottom: 12px; position: sticky; top: 0; background: var(--paper); border-bottom: 1px solid var(--rule); }
  nav a { color: var(--ink); }
  .status { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; margin-left: 8px; }
  .status.kept { color: var(--kept); } .status.sent-back, .status.missing { color: var(--back); } .status.unchanged, .status.new { color: var(--muted); }
  blockquote { margin: 8px 0; padding-left: 12px; border-left: 3px solid var(--rule); }
  .sides { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
  figure { margin: 0; } figcaption { font-size: 13px; margin-bottom: 4px; }
  img { display: block; max-width: 100%; height: auto; border: 1px solid var(--rule); }
  .pair { margin: 12px 0 20px; } .pair > .label { margin: 0 0 4px; font-size: 13px; }
  .none { color: var(--muted); font-style: italic; }
  ul { padding-left: 20px; } li { margin: 4px 0; }
  @media (max-width: 640px) { .sides { grid-template-columns: 1fr; } }
</style>
</head>
<body>
${head}
${nav}
${body}
</body>
</html>
`;
}

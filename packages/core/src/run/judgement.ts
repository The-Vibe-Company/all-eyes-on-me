import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CaptureManifest } from "../capture/capture.js";
import { route } from "../capture/capture.js";
import type { CheckReport } from "../checks/run.js";
import type { JourneyReport } from "../journey/replay.js";
import { concreteness } from "../judge/lazy.js";
import type { JudgeReport, PrincipleVerdict } from "../judge/tally.js";
import { fontFaces } from "./fonts.js";
import type { FeedbackCategory } from "./taste.js";
import { IDENTITY_PRINCIPLES, STYLE_CHECKS, STYLE_PRINCIPLES } from "./verdict.js";

/**
 * The page of a run that only judged (`/aeom judge`): what the product is, what was measured, the verdict, what the
 * judges found good, what fails from the worst, what to check outside the demo, a lead for each weak point, and every
 * screen and journey in detail. Read from the run's folder, then written as one page, without any comparison.
 */

export type JudgementLang = "en" | "fr";
export type Effort = "quick" | "medium" | "big";
export type Effect = "high" | "medium" | "low";

/** One place a weak point shows: a screen or a journey, what the judges or the check said there, and its capture. */
export interface WeakPlace {
  where: string;
  /** How many judges failed it, such as `3/3`: a principle's. */
  votes?: string;
  reason: string;
  shot: string | null;
}

/** One thing that fails, merged across every screen or journey it fails on. */
export interface WeakPoint {
  /** `weak:<kind>:<key>`, or `env:<kind>:<key>` for one set apart as the test environment's. */
  id: string;
  kind: "does-not-load" | "breaks" | "journey-principle" | "principle" | "check";
  /** The principle or the check, the journey's slug when it breaks, `does-not-load` for screens that do not load. */
  key: string;
  /** A journey that breaks: its name and the step where it does. */
  journey?: { name: string; step: number };
  places: WeakPlace[];
  /** The judges' most concrete fix, when they gave one; the page says its own otherwise. */
  fix: string | null;
  effort: Effort;
  effect: Effect;
}

/** What the judges found good, on one principle, with the most concrete reason they gave and where. */
export interface Strength {
  principle: string;
  kind: "screens" | "journeys";
  /** On how many screens or journeys it passes, of how many judged. */
  count: number;
  of: number;
  reason: string;
  where: string;
  shot: string | null;
}

export interface Judgement {
  product: { name: string | null; sentence: string | null };
  /** The product sheet's language, else the run's: the page's own words speak it unless --lang says otherwise. */
  lang: JudgementLang | null;
  measured: { screens: number; widths: number[]; checks: number; principles: number; journeys: number; journeyPrinciples: number; judges: number };
  nothingToRedo: boolean;
  /** What `aeom verdict` recommends: keep the front's own direction and improve it, or new directions. */
  recommend: "keep" | "directions" | null;
  /** The identity principles that fail, and where: why the front has no direction of its own yet. */
  identityFails: { principle: string; where: string[] }[];
  /** A direction kept with /aeom directions, ready for /aeom redo. */
  direction: string | null;
  keepStyle: boolean;
  strengths: Strength[];
  /** What fails, worst first: journeys that break, principles, checks. */
  weak: WeakPoint[];
  /** What most likely comes from the test environment, to check outside the demo. */
  env: WeakPoint[];
  /** With the style kept, the principles and checks that judge the charter itself: said, never a weak point. */
  leftToStyle: string[];
  accepted: { where: string; what: string }[];
  screens: { page: string; shot: string | null; error?: string; verdicts: { principle: string; pass: boolean; votes: string; reason: string; accepted?: true }[]; checks: { check: string; count: number; example: string }[] }[];
  journeys: { slug: string; name: string; broke: { step: number; reason: string } | null; steps: { index: number; action: string; shot: string | null }[]; verdicts: { principle: string; pass: boolean; votes: string; reason: string; steps: number[] }[] }[];
  judges?: { models: string[]; principles: string };
}

/** What `aeom verdict --out` keeps that the judgement reads. */
interface SavedVerdict {
  nothingToRedo?: boolean;
  recommend?: string;
  identity?: boolean;
  direction?: string;
  keepStyle?: boolean;
  judges?: { models: string[]; principles: string };
}

export interface JudgementInput {
  manifest: CaptureManifest | null;
  check: CheckReport;
  judge: JudgeReport;
  replay: JourneyReport | null;
  journeyJudge: JudgeReport | null;
  verdict: SavedVerdict | null;
  /** The product sheet's text. */
  product: string | null;
  /** The language the run kept, `AEOM_LANG` in its state, when the sheet does not say. */
  runLang?: string | null;
  /** Where the screens' captures and the journeys' replay are, from the run's folder. */
  dirs: { captures: string; replay: string };
}

// ——— Reading the product sheet ———

const section = (text: string, title: string) => text.split(/\r?\n(?=## )/).find((s) => s.startsWith(`## ${title}`))?.split(/\r?\n/).slice(1).join("\n").trim() ?? "";
/** A sentence of the sheet without its sources: what AEOM saw or supposes is the sheet's, not the page's. */
const unsourced = (text: string) => text.replace(/\((seen|vu)\s*:[^)]*\)|\(to confirm\)|\(à confirmer\)/gi, "").replace(/\s+/g, " ").trim();
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The product's name, its `#` heading, and one sentence saying what it is: its kind's words, else the first of what it is for. */
export function productHead(text: string | null): Judgement["product"] {
  if (!text) return { name: null, sentence: null };
  const name = text.match(/^# (.+?)\s*$/m)?.[1] ?? null;
  const kind = unsourced(section(text, "What kind of product").replace(/^`[a-z]+`\s*:?\s*/i, ""));
  const purpose = unsourced(section(text, "What it is for")).match(/^.*?[.!?](?=\s|$)/)?.[0] ?? "";
  const sentence = kind || purpose;
  return { name, sentence: sentence ? capital(sentence) : null };
}

const FR_WORDS = new Set("le la les des une un du de et est pour avec qui que dans sur au aux ce cette ses son sa leur leurs par où pas plus sont à ne se il elle on nous vous chaque".split(" "));
const EN_WORDS = new Set("the a an and is are for with who that this in on of to by or not be it its their they we you from at as each".split(" "));

/** The language the sheet is written in, from its own sentences, its headings and steps left out: they follow AEOM's template. */
export function sheetLang(text: string | null): JudgementLang | null {
  if (!text) return null;
  const prose = text
    .split(/\r?\n/)
    .filter((line) => !/^\s*(#|\d+\.\s)/.test(line))
    .join(" ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\((seen|vu)\s*:[^)]*\)|\(to confirm\)/gi, " ")
    .replace(/^\s*why:/gim, " ");
  const words = prose.toLowerCase().match(/[\p{L}’']+/gu) ?? [];
  const fr = words.filter((w) => FR_WORDS.has(w) || /^[ldjnsc]['’]/.test(w)).length;
  const en = words.filter((w) => EN_WORDS.has(w)).length;
  return fr > en ? "fr" : en > fr ? "en" : null;
}

// ——— What comes from the test environment ———

/**
 * What says a service is not there rather than a screen badly made: not configured, unavailable, a demo mode, a
 * server answering 5xx. Read in the judges' reasons, the checks' messages and where a journey broke.
 */
const ENV = /n['’]est pas configur|not configured|non configur|unconfigured|config(uration)? error|erreur de config|(?<!\p{L})(indisponible|unavailable)(?!\p{L})|mode d[ée]mo|demo mode|service unavailable|status (code )?(of )?5\d\d(?!\d)|(?<!\p{L})(error|erreur|http) 5\d\d(?!\d)|variable d['’]environnement|environment variable|missing (api )?key/iu;
/** What a page left blank by a missing service fails besides its own state: nothing to look at, nothing to place. */
const BLANK = ["states", "density", "hierarchy"];
const isEnv = (...texts: (string | undefined)[]) => texts.some((t) => !!t && ENV.test(t));

// ——— What each weak point costs to fix ———

const EFFORT: Record<string, Effort> = {
  "does-not-load": "medium", breaks: "medium",
  "one-direction": "big", "not-generic": "big", "not-ai-default": "big", "consistent-chrome": "medium", hierarchy: "medium", grid: "medium", density: "medium", states: "medium",
  "clear-start": "medium", "next-step": "medium", "result-shown": "medium", "no-dead-end": "quick", short: "medium", "same-words": "quick",
  cursor: "quick", overflow: "medium", contrast: "quick", console: "medium", header: "medium", wrap: "quick", uneven: "medium", clipped: "quick", "tap-size": "quick", "font-size": "quick",
  "line-length": "quick", zoom: "quick", images: "medium", labels: "quick", focus: "quick", "layout-shift": "medium", "gradient-text": "quick", "side-stripe": "quick", "nested-card": "medium",
  bounce: "quick", placeholder: "medium", "ai-text": "quick", "hollow-words": "quick", "nested-radius": "quick", orphan: "quick", motion: "quick", finish: "quick",
};

/** How many judges failed it, out of how many voted: `3/3 fail` is 1, `2/3 fail` two thirds. */
const agreement = (votes: string) => {
  const m = votes.match(/(\d+)\/(\d+)/);
  return m && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : 1;
};
const shortVotes = (votes: string) => votes.match(/\d+\/\d+/)?.[0] ?? votes;

// ——— Building the judgement ———

const normal = (text: string) => text.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").replace(/[\s.!…]+$/u, "").trim();
const best = (texts: string[]) => texts.reduce<string | null>((b, t) => (b === null || concreteness(t) > concreteness(b) ? t : b), null);
/** A check's finding in what a person sees: the text of the element at fault, then what is wrong, without the advice. */
const findingSaid = (element: string | undefined, message: string) => {
  const text = element?.match(/"[^"]*"/)?.[0] ?? element?.match(/^[a-z][a-z0-9-]*/i)?.[0];
  const what = message.replace(/:\s*(give|keep|mark|use|add|make|set|let|leave|move|put|remove|drop|ajoute|donne|garde)\b[\s\S]*$/i, "");
  return text ? `${text}: ${what}` : what;
};

/** Reads what a judged run left and makes it the judgement. Pure: every path in it is relative to the run's folder. */
export function judgementOf(input: JudgementInput): Judgement {
  const { manifest, check, judge, replay, journeyJudge, verdict, product, dirs } = input;
  const keepStyle = verdict?.keepStyle === true;
  const styleOnly = new Set(keepStyle ? [...STYLE_PRINCIPLES, ...STYLE_CHECKS] : []);
  const widest = <T extends { width: number }>(list: T[]) => list.reduce<T | undefined>((w, x) => (!w || x.width > w.width ? x : w), undefined);
  const shotOf = (page: string) => {
    const file = widest(manifest?.pages.find((p) => p.path === page)?.files ?? [])?.file;
    return file ? `${dirs.captures}/${file}` : null;
  };
  const runOf = (slug: string) => widest(replay?.journeys.find((j) => j.slug === slug)?.runs ?? []);
  const stepShot = (slug: string, step: number | undefined) => {
    const run = runOf(slug);
    if (!run) return null;
    const capture = (step ? run.steps.find((s) => s.index === step)?.capture : null) ?? run.steps.at(-1)?.capture ?? run.sheet;
    return capture ? `${dirs.replay}/${capture}` : null;
  };
  const nameOf = (slug: string) => replay?.journeys.find((j) => j.slug === slug)?.name ?? slug;

  // ——— Strengths: what passes on most screens or journeys, said by the most concrete reason no other principle shares.
  const principlesOf = new Map<string, Set<string>>();
  for (const report of [judge, journeyJudge]) for (const p of report?.pages ?? []) for (const v of p.verdicts) for (const r of [...v.reasons, ...v.dissent]) principlesOf.set(normal(r), new Set([...(principlesOf.get(normal(r)) ?? []), v.principle]));
  const says = (r: string) => r.trim() && (principlesOf.get(normal(r))?.size ?? 0) < 2;
  type Said = { where: string; v: PrincipleVerdict; reason: string; concrete: number };
  const candidates: { principle: string; kind: Strength["kind"]; count: number; of: number; said: Said[] }[] = [];
  for (const [report, kind] of [[judge, "screens"], [journeyJudge, "journeys"]] as const) {
    if (!report) continue;
    for (const { id } of report.principles) {
      if (styleOnly.has(id)) continue;
      const passing = report.pages.flatMap((p) => p.verdicts.filter((v) => v.principle === id && v.pass && !v.accepted).map((v) => ({ where: p.page, v })));
      const of = report.pages.length;
      if (!passing.length || passing.length * 2 < of) continue;
      const said = passing.flatMap(({ where, v }) => v.reasons.filter(says).map((reason) => ({ where, v, reason, concrete: concreteness(reason) }))).sort((a, b) => b.concrete - a.concrete);
      if (said.length) candidates.push({ principle: id, kind, count: passing.length, of, said });
    }
  }
  // The widest first; each says it with its most concrete reason, on a screen or a journey no strength showed yet
  // when one says it nearly as well, so six strengths are not six times the same screen.
  candidates.sort((a, b) => b.count / b.of - a.count / a.of || b.said[0]!.concrete - a.said[0]!.concrete);
  const shown = new Set<string>();
  const strengths: Strength[] = candidates.slice(0, 6).map(({ principle, kind, count, of, said }) => {
    const chosen = said.find((s) => !shown.has(s.where) && s.concrete * 2 >= said[0]!.concrete) ?? said[0]!;
    shown.add(chosen.where);
    const step = chosen.v.at?.find((a) => a.reason === chosen.reason)?.step ?? chosen.v.steps[0];
    return { principle, kind, count, of, reason: chosen.reason, where: kind === "screens" ? chosen.where : nameOf(chosen.where), shot: kind === "screens" ? shotOf(chosen.where) : stepShot(chosen.where, step) };
  });

  // ——— Weak points, each merged across the screens or journeys it fails on, the environment's set apart.
  type Draft = { kind: WeakPoint["kind"]; key: string; env: boolean; journey?: WeakPoint["journey"]; places: (WeakPlace & { weight: number })[]; fixes: string[] };
  const drafts = new Map<string, Draft>();
  const add = (kind: WeakPoint["kind"], key: string, env: boolean, place: WeakPlace & { weight: number }, fix?: string, journey?: WeakPoint["journey"]) => {
    const id = `${env ? "env" : "weak"}:${kind}:${key}`;
    const draft = drafts.get(id) ?? { kind, key, env, places: [], fixes: [], ...(journey ? { journey } : {}) };
    draft.places.push(place);
    if (fix) draft.fixes.push(fix);
    drafts.set(id, draft);
  };

  // Screens that do not load: broken for whoever opens them.
  for (const e of [...(check.errors ?? []), ...(manifest?.errors ?? [])]) {
    const where = route(e.url);
    if ([...drafts.values()].some((d) => d.kind === "does-not-load" && d.places.some((p) => p.where === where))) continue;
    add("does-not-load", "does-not-load", isEnv(e.reason) || /(?<!\d)5\d\d(?!\d)/.test(e.reason), { where, reason: e.reason, shot: null, weight: 1 });
  }
  // Journeys that break, each once, where it breaks at its widest width.
  for (const j of replay?.journeys ?? []) {
    const run = widest(j.runs.filter((r) => r.broken));
    if (!run?.broken) continue;
    const { step, reason } = run.broken;
    const dialog = run.steps.find((s) => s.index === step)?.dialog;
    const critique = journeyJudge?.pages.find((p) => p.page === j.slug)?.verdicts.filter((v) => !v.pass && v.steps.includes(step)) ?? [];
    const env = isEnv(reason, dialog) || critique.some((v) => isEnv(...v.reasons));
    // Its lead is the page's own: a fix the judges gave on that step answers its principle, not the break.
    add("breaks", j.slug, env, { where: j.name, reason, shot: stepShot(j.slug, step), weight: 1 }, undefined, { name: j.name, step });
  }
  // Principles: a screen a missing service left blank fails its state, its density and its hierarchy for that.
  const pageEnv = new Set(judge.pages.filter((p) => p.verdicts.some((v) => isEnv(...v.reasons, ...v.dissent))).map((p) => p.page));
  const failing = (v: PrincipleVerdict) => !v.pass && !v.accepted && !styleOnly.has(v.principle);
  for (const p of judge.pages) {
    for (const v of p.verdicts.filter(failing)) {
      const env = isEnv(...v.reasons, ...v.dissent) || (pageEnv.has(p.page) && BLANK.includes(v.principle));
      add("principle", v.principle, env, { where: p.page, votes: shortVotes(v.votes), reason: v.reasons[0] ?? "", shot: shotOf(p.page), weight: agreement(v.votes) }, v.fix);
    }
  }
  for (const p of journeyJudge?.pages ?? []) {
    for (const v of p.verdicts.filter(failing)) {
      add("journey-principle", v.principle, isEnv(...v.reasons, ...v.dissent), { where: nameOf(p.page), votes: shortVotes(v.votes), reason: v.reasons[0] ?? "", shot: stepShot(p.page, v.steps[0]), weight: agreement(v.votes) }, v.fix);
    }
  }
  // Checks: one point per check, each screen once with how many elements fail it there.
  const byCheck = new Map<string, Map<string, { count: number; example: string; env: boolean }>>();
  for (const f of check.findings) {
    if (styleOnly.has(f.check)) continue;
    const pages = byCheck.get(f.check) ?? new Map();
    const where = route(f.url);
    const entry = pages.get(where) ?? { count: 0, example: findingSaid(f.element, f.message), env: true };
    entry.count++;
    entry.env &&= f.check === "console" && isEnv(f.message);
    pages.set(where, entry);
    byCheck.set(f.check, pages);
  }
  for (const [name, pages] of byCheck) for (const [where, e] of pages) add("check", name, e.env, { where, reason: e.count > 1 ? `${e.example} (+${e.count - 1})` : e.example, shot: shotOf(where), weight: e.count });

  const screens = manifest?.pages.length ?? check.pages.length;
  const point = (d: Draft): WeakPoint & { score: number; rank: number } => {
    const mean = d.places.reduce((n, p) => n + p.weight, 0) / d.places.length;
    const rank = d.kind === "does-not-load" || d.kind === "breaks" ? 0 : d.kind === "check" ? 2 : 1;
    const effect: Effect = rank === 0 ? "high" : rank === 1 ? (d.places.length >= 2 || d.places.some((p) => p.weight === 1 && Number(p.votes?.split("/")[1]) >= 3) ? "high" : "medium") : d.places.length >= 2 && d.places.length * 2 >= screens ? "medium" : "low";
    return {
      id: `${d.env ? "env" : "weak"}:${d.kind}:${d.key}`,
      kind: d.kind,
      key: d.key,
      ...(d.journey ? { journey: d.journey } : {}),
      places: d.places.map(({ weight: _weight, ...place }) => place),
      fix: best(d.fixes),
      effort: EFFORT[d.key] ?? EFFORT[d.kind] ?? "medium",
      effect,
      // Checks weigh by their screens, then by how many elements fail them; principles by places and agreement.
      score: rank === 2 ? d.places.length + d.places.reduce((n, p) => n + p.weight, 0) / 1000 : d.places.length * mean,
      rank,
    };
  };
  const ordered = [...drafts.values()].map(point).sort((a, b) => a.rank - b.rank || b.score - a.score || (a.kind === "journey-principle" ? -1 : 0) - (b.kind === "journey-principle" ? -1 : 0) || a.key.localeCompare(b.key));
  const clean = ({ score: _score, rank: _rank, ...w }: WeakPoint & { score: number; rank: number }): WeakPoint => w;

  const identityFails = IDENTITY_PRINCIPLES.map((principle) => ({ principle, where: judge.pages.filter((p) => p.verdicts.some((v) => v.principle === principle && failing(v))).map((p) => p.page) })).filter((f) => f.where.length);
  const recommend = verdict?.recommend === "keep" || verdict?.recommend === "directions" ? verdict.recommend : keepStyle || (verdict?.identity ?? !identityFails.length) ? "keep" : "directions";
  const accepted = [
    ...judge.pages.flatMap((p) => p.verdicts.filter((v) => v.accepted).map((v) => ({ where: p.page, what: `${v.principle}: ${v.accepted!.why} (seen: ${v.accepted!.source})` }))),
    ...(journeyJudge?.pages ?? []).flatMap((p) => p.verdicts.filter((v) => v.accepted).map((v) => ({ where: nameOf(p.page), what: `${v.principle}: ${v.accepted!.why} (seen: ${v.accepted!.source})` }))),
    ...[...new Set((check.accepted ?? []).map((f) => `${route(f.url)}\n${f.check}: ${f.why} (seen: ${f.source})`))].map((line) => ({ where: line.split("\n")[0]!, what: line.split("\n")[1]! })),
  ];
  const weak = ordered.filter((w) => !w.id.startsWith("env:")).map(clean);
  const env = ordered.filter((w) => w.id.startsWith("env:")).map(clean);
  const judges = (judge.voters?.length ?? 0) + (journeyJudge?.voters?.length ?? 0);
  return {
    product: productHead(product),
    lang: sheetLang(product) ?? (input.runLang === "fr" || input.runLang === "en" ? input.runLang : null),
    measured: { screens, widths: check.widths, checks: check.checks.length, principles: judge.principles.length, journeys: replay?.journeys.length ?? 0, journeyPrinciples: journeyJudge?.principles.length ?? 0, judges },
    nothingToRedo: !weak.length && !env.length,
    recommend,
    identityFails,
    direction: !keepStyle && verdict?.direction ? verdict.direction : null,
    keepStyle,
    strengths,
    weak,
    env,
    leftToStyle: keepStyle ? [...new Set([...judge.pages.flatMap((p) => p.verdicts.filter((v) => !v.pass && styleOnly.has(v.principle)).map((v) => v.principle)), ...check.findings.filter((f) => styleOnly.has(f.check)).map((f) => f.check)])] : [],
    accepted,
    screens: (manifest?.pages.map((p) => p.path) ?? check.pages.map(route)).map((page) => ({
      page,
      shot: shotOf(page),
      verdicts: (judge.pages.find((p) => p.page === page)?.verdicts ?? []).map((v) => ({ principle: v.principle, pass: v.pass, votes: shortVotes(v.votes), reason: v.reasons[0] ?? "", ...(v.accepted ? { accepted: true as const } : {}) })),
      checks: [...byCheck].flatMap(([name, pages]) => (pages.has(page) ? [{ check: name, count: pages.get(page)!.count, example: pages.get(page)!.example }] : [])),
    })),
    journeys: (replay?.journeys ?? []).map((j) => {
      const run = widest(j.runs);
      const broke = widest(j.runs.filter((r) => r.broken))?.broken ?? null;
      return {
        slug: j.slug,
        name: j.name,
        broke,
        steps: (Array.isArray(run?.steps) ? run.steps : []).filter((s) => s && typeof s.index === "number").map((s) => ({ index: s.index, action: String(s.action ?? ""), shot: s.capture ? `${dirs.replay}/${s.capture}` : null })),
        verdicts: (journeyJudge?.pages.find((p) => p.page === j.slug)?.verdicts ?? []).map((v) => ({ principle: v.principle, pass: v.pass, votes: shortVotes(v.votes), reason: v.reasons[0] ?? "", steps: v.steps })),
      };
    }),
    ...((verdict?.judges ?? judge.judges) ? { judges: verdict?.judges ?? judge.judges } : {}),
  };
}

const exists = async (file: string) => readFile(file).then(() => true, () => false);
async function json<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * The judgement of a run folder: its before snapshot (captures, checks, verdict), the replay of its journeys and their
 * critique where the run kept them, its saved verdict, and the product sheet beside the runs. Null when the snapshot
 * holds no checks or no verdict of the judges: nothing to say then.
 */
export async function readJudgement(runDir: string): Promise<Judgement | null> {
  const check = await json<CheckReport>(join(runDir, "before", "reports", "check.json"));
  const judge = await json<JudgeReport>(join(runDir, "before", "reports", "judge.json"));
  if (!check || !judge || !Array.isArray(check.findings) || !Array.isArray(judge.pages)) return null;
  // The journeys replayed into their own folder (section 1), else as the snapshot kept them with the captures.
  const replayDir = (await exists(join(runDir, "journeys-before", "report.json"))) ? "journeys-before" : "before/captures/journeys";
  const replay = await json<JourneyReport>(join(runDir, replayDir, "report.json"));
  const journeyJudge = (await json<JudgeReport>(join(runDir, "before", "reports", "judge-journeys.json"))) ?? (await json<JudgeReport>(join(runDir, "journeys-before", "judge-journeys.json")));
  // The sheet the person may have corrected first, beside the runs; else the draft the run kept.
  const product = (await readFile(join(runDir, "..", "..", "product.md"), "utf8").catch(() => null)) ?? (await readFile(join(runDir, "product.md"), "utf8").catch(() => null));
  const state = await json<{ vars?: Record<string, unknown> }>(join(runDir, "state.json"));
  return judgementOf({
    manifest: await json<CaptureManifest>(join(runDir, "before", "captures", "manifest.json")),
    check,
    judge,
    replay: Array.isArray(replay?.journeys) ? replay : null,
    journeyJudge: Array.isArray(journeyJudge?.pages) ? journeyJudge : null,
    verdict: await json<SavedVerdict>(join(runDir, "verdict.json")),
    product,
    runLang: typeof state?.vars?.AEOM_LANG === "string" ? state.vars.AEOM_LANG : null,
    dirs: { captures: "before/captures", replay: replayDir },
  });
}

/** The verdicts of a judgement the person can agree or disagree with: every weak point, those set apart included. */
export function judgementVerdicts(j: Judgement): { id: string; category: FeedbackCategory; verdict: string }[] {
  return [...j.weak, ...j.env].map((w) => ({
    id: w.id,
    category: w.kind === "breaks" ? "journeys" : w.kind === "check" || w.kind === "does-not-load" ? "screens" : "principles",
    verdict: `${w.kind === "breaks" ? `${w.journey!.name} breaks at step ${w.journey!.step}` : w.kind === "does-not-load" ? `${w.places.map((p) => p.where).join(", ")} does not load` : `${w.key} fails on ${w.places.map((p) => p.where).join(", ")}`}${w.id.startsWith("env:") ? " (to check outside the demo)" : ""}`,
  }));
}

// ——— The page ———

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** « /a, /b et /c »: the places of a list, the last joined by the language's own word. */
const and = (items: string[], word: string) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} ${word} ${items.at(-1)}` : (items[0] ?? ""));

const WORDS = {
  fr: {
    kicker: "Jugement du front", noName: "Le front jugé",
    measured: (m: Judgement["measured"]) => [`${plural(m.screens, "écran", "écrans")} à ${m.widths.join(" et ")} px`, `${plural(m.checks, "contrôle", "contrôles")} et ${plural(m.principles, "principe", "principes")} par écran`, ...(m.journeys ? [`${m.journeys} parcours sur ${plural(m.journeyPrinciples, "principe", "principes")}`] : []), plural(m.judges, "juge", "juges")],
    verdict: (n: number, breaks: number, env: number) => (n === 0 && env === 0 ? "Rien à reprendre : tout ce qui a été mesuré passe." : `${n === 0 ? "Aucun point de design à reprendre" : plural(n, "point à reprendre", "points à reprendre")}${breaks ? `, dont ${breaks} parcours qui casse${breaks > 1 ? "nt" : ""}` : ""}${env ? ` ; ${plural(env, "autre à vérifier", "autres à vérifier")} hors démo` : ""}.`),
    recommend: {
      direction: (d: string) => `La direction gardée avec <code>/aeom directions</code>, ${d}, est prête : <code>/aeom redo</code> la porte dans l'app.`,
      style: "Le style est gardé : <code>/aeom redo</code> corrige ce qui échoue sans toucher à la charte.",
      keep: "Le front a une direction à lui : AEOM recommande de l'améliorer en gardant son style, avec <code>/aeom redo</code>.",
      directions: (where: string[]) => `Le front ne tient pas encore une direction à lui sur tous ses écrans${where.length ? ` : ${and(where, "et")} ${where.length > 1 ? "en sortent" : "en sort"}` : ""}. AEOM recommande de nouvelles directions, avec <code>/aeom directions</code> puis <code>/aeom redo</code>.`,
      nothing: "Rien à refaire : le front peut rester tel qu'il est.",
    },
    strengths: "Points forts", strengthsNote: "Ce que les juges ont vu de bon, regroupé par thème, avec l'écran ou l'étape qui le montre.",
    noStrength: "Les juges n'ont rien dit de précis de ce qui passe.",
    on: (n: number, of: number, kind: "screens" | "journeys") => (kind === "screens" ? (n === of ? (of > 1 ? `sur les ${of} écrans` : "sur l'écran") : `sur ${n} écrans sur ${of}`) : n === of ? (of > 1 ? `sur les ${of} parcours` : "sur le parcours") : `sur ${n} parcours sur ${of}`),
    weak: "Points faibles", weakNote: "Du plus grave au moins grave : les parcours qui cassent, puis les principes, puis les contrôles mesurables. Ce qui se répète d'un écran à l'autre est un seul point.",
    noWeak: "Rien ne casse et rien n'échoue, hors ce qui est à vérifier hors démo.",
    env: "À vérifier hors démo", envNote: "Ces points viennent sans doute de l'environnement de test, un service non configuré ou un serveur qui répond en erreur, plutôt que du design. Vérifiez-les sur une version configurée avant de les corriger.",
    leads: "Pistes d'amélioration", leadsNote: "Une piste par point faible, sans nouvelle fonction ni nouvelle donnée : le texte, les états, l'ordre des étapes, la navigation, le style.",
    effect: { high: "Le plus d'effet", medium: "Effet moyen", low: "Moins d'effet" } as Record<Effect, string>,
    effort: { quick: "Rapide", medium: "Moyen", big: "Gros chantier" } as Record<Effort, string>,
    detail: "Le détail", detailNote: "Écran par écran et parcours par parcours, tout ce que les juges et les contrôles ont dit.",
    kinds: { "does-not-load": "Écran qui ne charge pas", breaks: "Parcours qui casse", "journey-principle": "Parcours", principle: "Principe", check: "Contrôle" } as Record<WeakPoint["kind"], string>,
    onScreens: (n: number) => plural(n, "écran", "écrans"), onJourneys: (n: number) => `${n} parcours`,
    breaksAt: (name: string, step: number) => `« ${name} » s'arrête à l'étape ${step}`,
    noLoad: "Des écrans ne se chargent pas",
    votes: "juges", lead: "Piste", seeWeak: "Voir le point",
    passes: "passe", fails: "échoue", accepted: "accepté", goesThrough: "va au bout", stopsAt: (n: number) => `s'arrête à l'étape ${n}`,
    failing: (p: number, c: number) => [p ? plural(p, "principe en échec", "principes en échec") : "", c ? plural(c, "contrôle en échec", "contrôles en échec") : ""].filter(Boolean).join(" · ") || "rien en échec",
    checksTitle: "Contrôles en échec", stepsTitle: "Les étapes", screensTitle: "Les écrans", journeysTitle: "Les parcours", judgesTitle: "Les juges",
    acceptedTitle: "Accepté par la fiche produit", leftToStyle: (ids: string) => `Laissé au style gardé : ${ids}.`,
    judgedBy: (m: string, p: string) => `Jugé par ${m}, sur ${p}.`, unnamed: "un modèle que les votants n'ont pas nommé",
    theme: "Changer de thème", close: "Fermer", enlarge: "Agrandir",
    feedbackNote: "Pour dire si vous êtes d'accord avec chaque point, ouvrez cette page avec <code>aeom report --serve</code>.",
    titles: {
      "one-direction": "L'écran sort de la direction du reste", "consistent-chrome": "L'en-tête ou les boutons changent d'un écran à l'autre", "not-generic": "Un écran qui pourrait être celui de n'importe quel produit", "not-ai-default": "Le look par défaut d'une IA",
      hierarchy: "L'œil ne sait pas par où commencer", grid: "Les éléments ne tombent pas sur une grille", density: "Trop serré ou trop vide", states: "Un état vide ou d'erreur laissé en blanc",
      "clear-start": "On ne voit pas par où commencer", "next-step": "L'étape suivante n'est pas en vue", "result-shown": "Le résultat n'est pas montré à la fin", "no-dead-end": "Une impasse : rien pour avancer ni revenir", short: "Le parcours fait un détour", "same-words": "Ce qu'on cherche change de nom en route",
      cursor: "Ce qui se clique ne montre pas la main", overflow: "La page défile de côté", contrast: "Du texte trop pâle pour être bien lu", console: "Des erreurs dans la console du navigateur", header: "L'en-tête disparaît quand on défile", wrap: "Des libellés coupés sur deux lignes",
      uneven: "Des cartes d'une même rangée de tailles différentes", clipped: "Du texte coupé net", "tap-size": "Des cibles trop petites pour le doigt", "font-size": "Du texte trop petit pour être lu", "line-length": "Des lignes trop longues à suivre", zoom: "Le zoom est bloqué",
      images: "Des images qui ne chargent pas ou se déforment", labels: "Des contrôles sans nom pour un lecteur d'écran", focus: "Au clavier, on ne voit pas où l'on est", "layout-shift": "La page saute pendant qu'elle charge", "gradient-text": "Du texte rempli d'un dégradé", "side-stripe": "Des blocs marqués d'un liseré sur un côté",
      "nested-card": "Des cartes dans des cartes", bounce: "Des animations qui rebondissent", placeholder: "Des trous laissés à remplir", "ai-text": "Du texte qui parle de l'interface ou de la démo", "hollow-words": "Des mots creux", "nested-radius": "Des coins arrondis qui ne se suivent pas",
      orphan: "Un mot seul en fin de titre", motion: "Des animations qui déplacent la mise en page", finish: "La page n'est pas finie",
    } as Record<string, string>,
    fixes: {
      "does-not-load": "Faire répondre ces écrans, ou les retirer des liens qui y mènent.", breaks: "Faire aboutir cette étape : l'écran montre ce que le parcours attend, ou dit pourquoi et propose une suite.",
      "one-direction": "Ramener l'écran dans la direction du reste : mêmes typographies, mêmes couleurs, mêmes composants.", "consistent-chrome": "Reprendre l'en-tête, la navigation et le style de bouton des autres écrans.", "not-generic": "Remplacer le gabarit passe-partout par ce qui est propre au produit : ses mots, ses couleurs, ses formes.", "not-ai-default": "Sortir du look par défaut en partant du monde du produit plutôt que d'un style tout fait.",
      hierarchy: "Donner un seul point de départ : un titre ou une action nettement plus fort que le reste.", grid: "Aligner les blocs sur les mêmes colonnes et les mêmes marges que l'en-tête.", density: "Resserrer ce qui flotte, aérer ce qui étouffe, et donner un rôle à chaque zone vide.", states: "Dessiner l'état : dire ce qui manque et proposer l'action suivante, au lieu d'un blanc.",
      "clear-start": "Mettre la première action en vue sur l'écran de départ, nommée avec les mots de l'utilisateur.", "next-step": "Rendre l'étape suivante visible sur chaque écran : un lien ou un bouton nommé, sans détour.", "result-shown": "Montrer le résultat à la fin : ce qui a été trouvé ou fait, ou un état vide qui dit quoi faire.", "no-dead-end": "Donner à chaque écran d'erreur un moyen d'avancer ou de revenir.", short: "Ouvrir un accès direct à l'écran visé, sans passer par un écran qui n'est pas le but.", "same-words": "Donner un seul nom à ce que cherche l'utilisateur, du lien au titre et au bouton.",
      cursor: "Donner le curseur main à tout ce qui se clique.", overflow: "Contenir la largeur : rien ne doit dépasser de l'écran.", contrast: "Foncer les textes trop pâles jusqu'à un contraste de 4,5:1 sur leur fond.", console: "Corriger les erreurs que la page écrit dans la console.", header: "Garder l'en-tête visible quand on défile.", wrap: "Raccourcir ou élargir les libellés pour qu'ils tiennent sur une ligne.",
      uneven: "Donner la même hauteur aux cartes d'une rangée.", clipped: "Laisser le texte entier, ou le couper avec des points de suspension.", "tap-size": "Agrandir les cibles à 44 px de côté au moins.", "font-size": "Passer les petits textes à 12 px au moins.", "line-length": "Limiter les paragraphes à 75 caractères par ligne environ.", zoom: "Retirer ce qui bloque le zoom dans la balise viewport.",
      images: "Réparer les images cassées et garder leurs proportions.", labels: "Donner un nom à chaque bouton, lien, champ et image.", focus: "Ajouter un contour visible au focus clavier (:focus-visible).", "layout-shift": "Réserver la place de ce qui charge, pour que rien ne saute.", "gradient-text": "Remplir le texte d'une couleur pleine.", "side-stripe": "Marquer ces blocs autrement qu'avec un liseré d'un côté.",
      "nested-card": "Sortir les cartes de la carte qui les contient.", bounce: "Remplacer le rebond par une courbe douce.", placeholder: "Remplir les trous avec le vrai contenu.", "ai-text": "Remplacer le texte sur l'interface par les mots du produit.", "hollow-words": "Remplacer les mots creux par ce que le produit fait vraiment.", "nested-radius": "Faire suivre au rayon intérieur celui du coin qui le contient.",
      orphan: "Équilibrer les titres pour qu'aucun mot ne reste seul.", motion: "Animer sans déplacer la mise en page : transformations et opacité seulement.", finish: "Finir la page : titre, icône, description, image de partage, et une 404 qui ramène.",
    } as Record<string, string>,
    names: {
      "one-direction": "Une seule direction", "consistent-chrome": "En-tête et boutons pareils partout", "not-generic": "Rien de générique", "not-ai-default": "Pas un look d'IA par défaut",
      hierarchy: "Une hiérarchie claire", grid: "Une grille alignée", density: "Une densité maîtrisée", states: "Des états vides et d'erreur dessinés",
      "clear-start": "Un départ clair", "next-step": "L'étape suivante en vue", "result-shown": "Le résultat montré", "no-dead-end": "Pas d'impasse", short: "Des parcours courts", "same-words": "Les mêmes mots partout",
    } as Record<string, string>,
  },
  en: {
    kicker: "Judgement of the front", noName: "The front judged",
    measured: (m: Judgement["measured"]) => [`${plural(m.screens, "screen", "screens")} at ${m.widths.join(" and ")} px`, `${plural(m.checks, "check", "checks")} and ${plural(m.principles, "principle", "principles")} on each`, ...(m.journeys ? [`${plural(m.journeys, "journey", "journeys")} on ${plural(m.journeyPrinciples, "principle", "principles")}`] : []), plural(m.judges, "judge", "judges")],
    verdict: (n: number, breaks: number, env: number) => (n === 0 && env === 0 ? "Nothing to rework: everything measured passes." : `${n === 0 ? "No design point to rework" : plural(n, "point to rework", "points to rework")}${breaks ? `, ${plural(breaks, "journey that breaks", "journeys that break")} among them` : ""}${env ? `; ${env} more to check outside the demo` : ""}.`),
    recommend: {
      direction: (d: string) => `The direction kept with <code>/aeom directions</code>, ${d}, is ready: <code>/aeom redo</code> carries it into the app.`,
      style: "The style is kept: <code>/aeom redo</code> fixes what fails without touching the charter.",
      keep: "The front has a direction of its own: AEOM recommends improving it while keeping its style, with <code>/aeom redo</code>.",
      directions: (where: string[]) => `The front does not hold one direction of its own on every screen yet${where.length ? `: ${and(where, "and")} ${where.length > 1 ? "step" : "steps"} out of it` : ""}. AEOM recommends new directions, with <code>/aeom directions</code> then <code>/aeom redo</code>.`,
      nothing: "Nothing to redo: the front can stay as it is.",
    },
    strengths: "Strengths", strengthsNote: "What the judges saw as good, grouped by theme, with the screen or the step that shows it.",
    noStrength: "The judges said nothing precise about what passes.",
    on: (n: number, of: number, kind: "screens" | "journeys") => (n === of ? (of > 1 ? `on all ${of} ${kind}` : `on the ${kind === "screens" ? "screen" : "journey"}`) : `on ${n} of ${of} ${kind}`),
    weak: "Weak points", weakNote: "Worst first: journeys that break, then principles, then measurable checks. What repeats from screen to screen is one point.",
    noWeak: "Nothing breaks and nothing fails, apart from what is to check outside the demo.",
    env: "To check outside the demo", envNote: "These most likely come from the test environment, a service not configured or a server answering with an error, rather than from the design. Check them on a configured version before fixing them.",
    leads: "Leads", leadsNote: "One lead per weak point, with no new feature and no new data: the copy, the states, the order of steps, the navigation, the style.",
    effect: { high: "Most effect", medium: "Some effect", low: "Less effect" } as Record<Effect, string>,
    effort: { quick: "Quick", medium: "Medium", big: "Big job" } as Record<Effort, string>,
    detail: "In detail", detailNote: "Screen by screen and journey by journey, everything the judges and the checks said.",
    kinds: { "does-not-load": "Screen that does not load", breaks: "Journey that breaks", "journey-principle": "Journey", principle: "Principle", check: "Check" } as Record<WeakPoint["kind"], string>,
    onScreens: (n: number) => plural(n, "screen", "screens"), onJourneys: (n: number) => plural(n, "journey", "journeys"),
    breaksAt: (name: string, step: number) => `“${name}” stops at step ${step}`,
    noLoad: "Screens that do not load",
    votes: "judges", lead: "Lead", seeWeak: "See the point",
    passes: "passes", fails: "fails", accepted: "accepted", goesThrough: "goes to its end", stopsAt: (n: number) => `stops at step ${n}`,
    failing: (p: number, c: number) => [p ? plural(p, "principle failing", "principles failing") : "", c ? plural(c, "check failing", "checks failing") : ""].filter(Boolean).join(" · ") || "nothing failing",
    checksTitle: "Checks failing", stepsTitle: "The steps", screensTitle: "Screens", journeysTitle: "Journeys", judgesTitle: "The judges",
    acceptedTitle: "Accepted by the product sheet", leftToStyle: (ids: string) => `Left to the style kept: ${ids}.`,
    judgedBy: (m: string, p: string) => `Judged by ${m}, on ${p}.`, unnamed: "a model the voters did not name",
    theme: "Switch theme", close: "Close", enlarge: "Enlarge",
    feedbackNote: "To say whether you agree with each point, open this page with <code>aeom report --serve</code>.",
    titles: {
      "one-direction": "The screen leaves the direction of the rest", "consistent-chrome": "The header or the buttons change from screen to screen", "not-generic": "A screen that could belong to any product", "not-ai-default": "An AI's default look",
      hierarchy: "The eye does not know where to start", grid: "Elements do not sit on a grid", density: "Too cramped or too empty", states: "An empty or error state left blank",
      "clear-start": "Where to start is not in sight", "next-step": "The next step is not in sight", "result-shown": "The result is not shown at the end", "no-dead-end": "A dead end: nothing to go on or back", short: "The journey takes a detour", "same-words": "What the user is after changes names on the way",
      cursor: "What clicks does not show the hand", overflow: "The page scrolls sideways", contrast: "Text too pale to read well", console: "Errors in the browser's console", header: "The header goes away on scroll", wrap: "Labels broken over two lines",
      uneven: "Cards of one row in different sizes", clipped: "Text cut off", "tap-size": "Targets too small for a finger", "font-size": "Text too small to read", "line-length": "Lines too long to follow", zoom: "Zoom is blocked",
      images: "Images that do not load or lose their shape", labels: "Controls without a name for a screen reader", focus: "With a keyboard, you cannot see where you are", "layout-shift": "The page jumps while it loads", "gradient-text": "Text filled with a gradient", "side-stripe": "Blocks marked by a stripe on one side",
      "nested-card": "Cards inside cards", bounce: "Motion that bounces", placeholder: "Holes left to fill", "ai-text": "Text about the interface or the demo", "hollow-words": "Hollow words", "nested-radius": "Rounded corners that do not follow",
      orphan: "A word alone on a heading's last line", motion: "Motion that moves the layout", finish: "The page is not finished",
    } as Record<string, string>,
    fixes: {
      "does-not-load": "Make these screens answer, or take them out of the links that lead to them.", breaks: "Make this step go through: the screen shows what the journey expects, or says why and offers a way on.",
      "one-direction": "Bring the screen back into the direction of the rest: the same type, colours and components.", "consistent-chrome": "Take the header, the navigation and the button style of the other screens.", "not-generic": "Replace the all-purpose template with what is the product's own: its words, colours and shapes.", "not-ai-default": "Leave the default look by starting from the product's world rather than a ready-made style.",
      hierarchy: "Give one place to start: a title or an action clearly stronger than the rest.", grid: "Line the blocks up on the same columns and margins as the header.", density: "Tighten what floats, give air to what is cramped, and give each empty area a role.", states: "Design the state: say what is missing and offer the next action, instead of a blank.",
      "clear-start": "Put the first action in sight on the starting screen, named in the user's words.", "next-step": "Make the next step visible on every screen: a named link or button, with no detour.", "result-shown": "Show the result at the end: what was found or done, or an empty state that says what to do.", "no-dead-end": "Give every error screen a way on or a way back.", short: "Open a direct way to the screen the user wants, without a screen that is not the goal.", "same-words": "Give what the user is after one name, from the link to the title and the button.",
      cursor: "Give the pointer cursor to everything that clicks.", overflow: "Contain the width: nothing goes past the screen.", contrast: "Darken pale text to a 4.5:1 contrast on its background.", console: "Fix the errors the page writes to the console.", header: "Keep the header in sight on scroll.", wrap: "Shorten or widen labels so they hold on one line.",
      uneven: "Give the cards of one row the same height.", clipped: "Leave the text whole, or cut it with an ellipsis.", "tap-size": "Make targets 44 px wide at least.", "font-size": "Set small text to 12 px at least.", "line-length": "Keep paragraphs to about 75 characters a line.", zoom: "Remove what blocks zoom in the viewport tag.",
      images: "Repair broken images and keep their proportions.", labels: "Give every button, link, field and image a name.", focus: "Add a visible outline to the keyboard focus (:focus-visible).", "layout-shift": "Reserve room for what loads, so nothing jumps.", "gradient-text": "Fill text with a solid colour.", "side-stripe": "Mark these blocks otherwise than with a stripe on one side.",
      "nested-card": "Take the cards out of the card that holds them.", bounce: "Replace the bounce with a soft curve.", placeholder: "Fill the holes with the real content.", "ai-text": "Replace text about the interface with the product's own words.", "hollow-words": "Replace hollow words with what the product really does.", "nested-radius": "Make the inner radius follow the corner that holds it.",
      orphan: "Balance headings so no word stays alone.", motion: "Animate without moving the layout: transforms and opacity only.", finish: "Finish the page: a title, an icon, a description, a share image, and a 404 that leads back.",
    } as Record<string, string>,
    names: {
      "one-direction": "One direction", "consistent-chrome": "The same header and buttons everywhere", "not-generic": "Nothing generic", "not-ai-default": "Not an AI's default look",
      hierarchy: "A clear hierarchy", grid: "A grid that lines up", density: "A controlled density", states: "Designed empty and error states",
      "clear-start": "A clear start", "next-step": "The next step in sight", "result-shown": "The result shown", "no-dead-end": "No dead end", short: "Short journeys", "same-words": "The same words throughout",
    } as Record<string, string>,
  },
};
type Words = (typeof WORDS)["fr"];

const esc = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** A path inside the run's folder, each segment URL-encoded: a `#` or `?` in a file name stays part of the name. */
const href = (path: string) => path.split("/").map((s) => encodeURI(s).replace(/#/g, "%23").replace(/\?/g, "%3F")).join("/");

/** What the page around it gives the judgement: the boxes to agree or disagree, the rates, and the script that sends them. */
export interface JudgementPageParts {
  run: string;
  lang: JudgementLang;
  say: (v: { id: string; category: FeedbackCategory; verdict: string } | null) => string;
  rates: string;
  feedbackScript: string;
}

/** The judgement as one page: its styles, fonts and scripts inline, its captures beside it in the run's folder. */
export function judgementHtml(j: Judgement, parts: JudgementPageParts): string {
  const w: Words = WORDS[parts.lang] ?? WORDS.en;
  const verdicts = new Map(judgementVerdicts(j).map((v) => [v.id, v]));
  const title = (wp: WeakPoint) => (wp.kind === "breaks" ? w.breaksAt(wp.journey!.name, wp.journey!.step) : wp.kind === "does-not-load" ? w.noLoad : (w.titles[wp.key] ?? wp.key));
  const fixOf = (wp: WeakPoint) => wp.fix ?? w.fixes[wp.key] ?? w.fixes[wp.kind] ?? "";
  const shot = (src: string | null, alt: string, cls = "") => (src ? `<button type="button" class="shot${cls ? ` ${cls}` : ""}" data-full="${esc(href(src))}" data-title="${esc(alt)}" aria-label="${esc(`${w.enlarge} : ${alt}`)}"><img src="${esc(href(src))}" alt="${esc(alt)}" loading="lazy"></button>` : "");
  // A screen by its route, in the type of code; a journey by its name, in the page's own.
  const route = (where: string) => `<span class="where${where.startsWith("/") ? "" : " where--name"}">${esc(where)}</span>`;
  const count = (wp: WeakPoint) => (wp.kind === "breaks" ? "" : wp.kind === "journey-principle" ? w.onJourneys(wp.places.length) : w.onScreens(wp.places.length));

  // ——— Head: the product, what was measured, the verdict and what comes next.
  const breaks = j.weak.filter((wp) => wp.kind === "breaks").length;
  const outside = [...new Set(j.identityFails.flatMap((f) => f.where))].map((where) => `<span class="where">${esc(where)}</span>`);
  const recommendation = j.nothingToRedo ? w.recommend.nothing : j.direction ? w.recommend.direction(esc(j.direction)) : j.keepStyle ? w.recommend.style : j.recommend === "directions" ? w.recommend.directions(outside) : w.recommend.keep;
  const head = `<header class="hero"><div class="wrap">
<div class="bar"><span class="brand"><span class="eye" aria-hidden="true"><i></i></span>AEOM</span><span class="bar__end"><span class="run">${esc(parts.run)}</span><button type="button" class="theme" data-theme-toggle aria-label="${w.theme}"><span aria-hidden="true">◐</span></button></span></div>
<p class="kicker">${w.kicker}</p>
<h1>${esc(j.product.name ?? w.noName)}</h1>
${j.product.sentence ? `<p class="what">${esc(j.product.sentence)}</p>` : ""}
<ul class="measured">${w.measured(j.measured).map((m) => `<li>${esc(m)}</li>`).join("")}</ul>
<div class="call"><p class="verdict">${esc(w.verdict(j.weak.length, breaks, j.env.length))}</p><p class="next">${recommendation}</p>${j.leftToStyle.length ? `<p class="small">${esc(w.leftToStyle(j.leftToStyle.join(", ")))}</p>` : ""}${j.nothingToRedo ? parts.say({ id: "nothing-to-redo", category: "screens", verdict: "Nothing to redo" }) : ""}</div>
</div></header>`;

  const nav = `<nav class="jump" aria-label="${esc(w.detail)}"><div class="wrap"><a href="#strengths">${w.strengths}<b>${j.strengths.length}</b></a><a href="#weak">${w.weak}<b>${j.weak.length}</b></a>${j.env.length ? `<a href="#env">${w.env}<b>${j.env.length}</b></a>` : ""}${j.weak.length ? `<a href="#leads">${w.leads}<b>${j.weak.length}</b></a>` : ""}<a href="#detail">${w.detail}</a></div></nav>`;

  // ——— Strengths.
  const strengths = `<section id="strengths"><div class="wrap"><h2>${w.strengths}</h2><p class="note">${w.strengthsNote}</p>${
    j.strengths.length
      ? `<ul class="strengths">${j.strengths.map((s) => `<li class="strength">${shot(s.shot, `${s.where}`, "shot--wide")}<div class="strength__text"><h3>${esc(w.names[s.principle] ?? s.principle)}</h3><p class="scope">${esc(w.on(s.count, s.of, s.kind))}</p><blockquote>${esc(s.reason)}</blockquote><p class="small">${route(s.where)}</p></div></li>`).join("")}</ul>`
      : `<p class="muted">${w.noStrength}</p>`
  }</div></section>`;

  // ——— Weak points, and those set apart.
  let n = 0;
  const weakHtml = (wp: WeakPoint) => {
    const anchor = wp.id.startsWith("env:") ? "" : ` id="weak-${++n}"`;
    const shots = [...new Set(wp.places.map((p) => p.shot).filter((s): s is string => !!s))].slice(0, 3);
    const places = wp.places.map((p) => `<li>${wp.kind === "breaks" ? "" : route(p.where)}${p.votes ? `<span class="votes" title="${w.votes}">${esc(p.votes)}</span>` : ""}<span class="said">${esc(p.reason)}</span></li>`);
    // Four places in sight, the others folded: a check on eleven screens stays one point that reads at a glance.
    const list = places.length > 4 ? `<ul class="places">${places.slice(0, 4).join("")}</ul><details><summary>+ ${places.length - 4}</summary><ul class="places">${places.slice(4).join("")}</ul></details>` : `<ul class="places">${places.join("")}</ul>`;
    return `<article class="point" data-weak="${esc(wp.id)}"${anchor}>${anchor ? `<span class="point__n" aria-hidden="true">${n}</span>` : ""}<div class="point__body"><p class="point__kind"><span class="kind kind--${wp.kind}">${w.kinds[wp.kind]}</span>${count(wp) ? ` <span class="muted">${esc(count(wp))}</span>` : ""}</p><h3>${esc(title(wp))}</h3>${list}${shots.length ? `<div class="shots">${shots.map((s, i) => shot(s, `${title(wp)} · ${wp.places.find((p) => p.shot === s)?.where ?? i + 1}`)).join("")}</div>` : ""}${parts.say(verdicts.get(wp.id) ?? null)}</div></article>`;
  };
  const weak = `<section id="weak"><div class="wrap"><h2>${w.weak}</h2><p class="note">${w.weakNote}</p>${parts.rates}<p class="muted small" id="feedback-note" hidden>${w.feedbackNote}</p>${j.weak.length ? `<div class="points">${j.weak.map(weakHtml).join("")}</div>` : `<p class="muted">${w.noWeak}</p>`}</div></section>`;
  const env = j.env.length ? `<section id="env"><div class="wrap"><div class="aside"><h2>${w.env}</h2><p class="note">${w.envNote}</p><div class="points points--env">${j.env.map(weakHtml).join("")}</div></div></div></section>` : "";

  // ——— Leads: one per weak point, the most effect first, then the quickest.
  const indexOf = new Map(j.weak.map((wp, i) => [wp.id, i + 1]));
  const rank = { high: 0, medium: 1, low: 2, quick: 0, big: 2 } as Record<string, number>;
  const leadsByEffect = (["high", "medium", "low"] as Effect[]).map((effect) => ({ effect, items: j.weak.filter((wp) => wp.effect === effect).sort((a, b) => rank[a.effort]! - rank[b.effort]! || indexOf.get(a.id)! - indexOf.get(b.id)!) })).filter((g) => g.items.length);
  const leads = j.weak.length
    ? `<section id="leads"><div class="wrap"><h2>${w.leads}</h2><p class="note">${w.leadsNote}</p>${leadsByEffect.map((g) => `<div class="leads"><h3>${w.effect[g.effect]}</h3><ol>${g.items.map((wp) => `<li class="lead" data-effect="${wp.effect}" data-effort="${wp.effort}"><p class="lead__fix">${esc(fixOf(wp))}</p><p class="lead__meta"><span class="effort effort--${wp.effort}">${w.effort[wp.effort]}</span><a href="#weak-${indexOf.get(wp.id)}">${indexOf.get(wp.id)}. ${esc(title(wp))}</a></p></li>`).join("")}</ol></div>`).join("")}</div></section>`
    : "";

  // ——— Detail: every screen and every journey, folded.
  const mark = (pass: boolean, accepted?: boolean) => `<span class="mark ${accepted ? "mark--accepted" : pass ? "mark--ok" : "mark--bad"}">${accepted ? w.accepted : pass ? w.passes : w.fails}</span>`;
  const screenDetail = (s: Judgement["screens"][number]) => {
    const failing = s.verdicts.filter((v) => !v.pass).length;
    return `<details class="fold"><summary>${route(s.page)}<span class="muted">${esc(w.failing(failing, s.checks.length))}</span></summary><div class="fold__body">${shot(s.shot, s.page, "shot--tall")}<div><ul class="verdicts">${s.verdicts.map((v) => `<li>${mark(v.pass, v.accepted)}<b>${esc(w.names[v.principle] ?? v.principle)}</b><span class="votes">${esc(v.votes)}</span><span class="said">${esc(v.reason)}</span></li>`).join("")}</ul>${s.checks.length ? `<h4>${w.checksTitle}</h4><ul class="verdicts">${s.checks.map((c) => `<li>${mark(false)}<b>${esc(w.titles[c.check] ?? c.check)}</b><span class="votes">×${c.count}</span><span class="said">${esc(c.example)}</span></li>`).join("")}</ul>` : ""}</div></div></details>`;
  };
  const journeyDetail = (jr: Judgement["journeys"][number]) =>
    `<details class="fold"><summary><span class="name">${esc(jr.name)}</span><span class="muted">${esc(jr.broke ? w.stopsAt(jr.broke.step) : w.goesThrough)}</span></summary><div class="fold__body fold__body--journey"><ol class="steps">${jr.steps.map((s) => `<li${jr.broke?.step === s.index ? ' class="steps__broke"' : ""}>${shot(s.shot, `${jr.name} · ${s.index}. ${s.action}`)}<span class="steps__n">${s.index}</span><span class="small">${esc(s.action)}</span></li>`).join("")}</ol>${jr.broke ? `<p class="said">${esc(jr.broke.reason)}</p>` : ""}<ul class="verdicts">${jr.verdicts.map((v) => `<li>${mark(v.pass)}<b>${esc(w.names[v.principle] ?? v.principle)}</b><span class="votes">${esc(v.votes)}</span><span class="said">${esc(v.reason)}</span></li>`).join("")}</ul></div></details>`;
  const accepted = j.accepted.length ? `<h3>${w.acceptedTitle}</h3><ul class="plain">${j.accepted.map((a) => `<li>${route(a.where)} ${esc(a.what)}</li>`).join("")}</ul>` : "";
  const detail = `<section id="detail"><div class="wrap"><h2>${w.detail}</h2><p class="note">${w.detailNote}</p><h3>${w.screensTitle}</h3><div class="folds">${j.screens.map(screenDetail).join("")}</div>${j.journeys.length ? `<h3>${w.journeysTitle}</h3><div class="folds">${j.journeys.map(journeyDetail).join("")}</div>` : ""}${accepted}</div></section>`;

  const foot = `<footer><div class="wrap">${j.judges ? `<p>${w.judgedBy(esc(j.judges.models.join(", ") || w.unnamed), esc(j.judges.principles))}</p>` : ""}<p>${esc(parts.run)}</p></div></footer>`;
  const dialog = `<dialog id="large" aria-labelledby="large-title"><div class="large"><div class="large__bar"><span id="large-title"></span><button type="button" class="large__close">${w.close}</button></div><div class="large__body"><img alt=""></div></div></dialog>`;

  return `<!doctype html>
<html lang="${parts.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AEOM · ${esc(j.product.name ?? parts.run)}</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='14' fill='%23fff' stroke='%2316130f' stroke-width='3'/%3E%3Ccircle cx='18' cy='16' r='6' fill='%2316130f'/%3E%3C/svg%3E">
<script>try{var t=localStorage.getItem("aeom-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}</script>
<style>
${fontFaces()}
${STYLE}
</style>
</head>
<body>
${head}
${nav}
<main>
${strengths}
${weak}
${env}
${leads}
${detail}
</main>
${foot}
${dialog}
<script>${parts.feedbackScript}</script>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

/** The page's own gestures: a capture opened large, the theme switched and kept. */
const SCRIPT = `
(() => {
  const root = document.documentElement;
  const dark = () => (root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
  const toggle = document.querySelector("[data-theme-toggle]");
  if (toggle) toggle.addEventListener("click", () => {
    const next = dark() ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("aeom-theme", next); } catch (e) {}
  });
  const dialog = document.getElementById("large");
  const image = dialog.querySelector("img");
  document.addEventListener("click", (event) => {
    const opener = event.target.closest(".shot");
    if (!opener) return;
    image.src = opener.dataset.full;
    image.alt = opener.dataset.title || "";
    dialog.querySelector("#large-title").textContent = opener.dataset.title || "";
    dialog.showModal();
    dialog.querySelector(".large__body").scrollTop = 0;
  });
  dialog.querySelector(".large__close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
})();`;

/**
 * AEOM's own kit, as its site and its other pages wear it: sun, ink, paper and the eye, Bricolage Grotesque and
 * JetBrains Mono. A page to read top to bottom: the verdict, then what is good, what fails, what to do. Light and dark.
 */
const STYLE = `
  :root {
    --sun: #ffd84d; --ink: #16130f; --paper: #fffaf0; --surface: #ffffff; --muted: #5f5649; --rule: rgba(22, 19, 15, 0.14);
    --ok: #1f7a45; --ok-soft: #dff3e5; --bad: #b8321a; --bad-soft: #ffe3dc; --warn: #8a5a00; --warn-soft: #fff1c7; --flat: #efe8d8;
    --hero: var(--sun); --hero-ink: var(--ink); --shadow: var(--ink);
    --display: "Bricolage Grotesque", system-ui, -apple-system, "Segoe UI", sans-serif;
    --mono: "JetBrains Mono", ui-monospace, Menlo, monospace;
    --gutter: max(16px, min(4vw, 40px));
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --ink: #f4ecdb; --paper: #14110d; --surface: #1e1a14; --muted: #b5aa95; --rule: rgba(244, 236, 219, 0.14);
      --ok: #7fd6a0; --ok-soft: #173023; --bad: #ff9277; --bad-soft: #3a1d15; --warn: #ffd27a; --warn-soft: #33290f; --flat: #2a241b;
      --hero: #1e1a14; --hero-ink: #f4ecdb; --shadow: #000;
      color-scheme: dark;
    }
  }
  :root[data-theme="dark"] {
    --ink: #f4ecdb; --paper: #14110d; --surface: #1e1a14; --muted: #b5aa95; --rule: rgba(244, 236, 219, 0.14);
    --ok: #7fd6a0; --ok-soft: #173023; --bad: #ff9277; --bad-soft: #3a1d15; --warn: #ffd27a; --warn-soft: #33290f; --flat: #2a241b;
    --hero: #1e1a14; --hero-ink: #f4ecdb; --shadow: #000;
    color-scheme: dark;
  }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  html { scroll-padding-top: 64px; }
  body { margin: 0; background: var(--paper); color: var(--ink); font: 500 15.5px/1.5 var(--display); -webkit-font-smoothing: antialiased; }
  h1, h2, h3, h4, p, ul, ol, figure, blockquote { margin: 0; }
  h1, h2, h3, h4 { font-weight: 800; letter-spacing: -0.02em; text-wrap: balance; }
  p, li, blockquote { text-wrap: pretty; }
  img { display: block; max-width: 100%; height: auto; }
  button { font: inherit; color: inherit; cursor: pointer; }
  a { color: inherit; }
  code, .where, .run, .votes { font-family: var(--mono); font-weight: 500; }
  code { font-size: 0.9em; padding: 1px 5px; border-radius: 5px; background: var(--flat); }
  :focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; border-radius: 6px; }
  .wrap { max-width: 1040px; margin: 0 auto; padding-inline: var(--gutter); }
  .muted, .note { color: var(--muted); }
  .small { font-size: 13px; }
  .note { max-width: 68ch; margin-bottom: 18px; }

  .eye { display: inline-block; flex: none; position: relative; width: 20px; height: 20px; border-radius: 50%; background: #fff; border: 2px solid currentColor; }
  .eye i { position: absolute; width: 44%; height: 44%; left: 28%; top: 28%; border-radius: 50%; background: #16130f; transform: translate(18%, 4%); }

  .hero { background: var(--hero); color: var(--hero-ink); border-bottom: 2px solid var(--ink); }
  .hero .wrap { padding-block: 20px 34px; display: grid; gap: 12px; }
  .bar { display: flex; gap: 8px 16px; align-items: center; justify-content: space-between; margin-bottom: 18px; }
  .brand { display: inline-flex; gap: 8px; align-items: center; font-weight: 800; letter-spacing: 0.04em; }
  .bar__end { display: inline-flex; gap: 12px; align-items: center; }
  .run { font-size: 12px; opacity: 0.75; }
  .theme { width: 34px; height: 34px; border-radius: 50%; border: 2px solid currentColor; background: transparent; font-size: 17px; line-height: 1; display: grid; place-items: center; }
  .kicker { font-weight: 800; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; }
  .hero h1 { font-size: clamp(36px, 6vw, 64px); line-height: 0.98; letter-spacing: -0.045em; }
  .what { font-size: clamp(17px, 2vw, 20px); max-width: 52ch; }
  .measured { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
  .measured li { font-size: 13px; font-weight: 700; padding: 4px 10px; border-radius: 999px; border: 1.5px solid currentColor; }
  .call { margin-top: 14px; display: grid; gap: 8px; max-width: 72ch; }
  .verdict { font-size: clamp(22px, 3vw, 30px); font-weight: 800; letter-spacing: -0.025em; line-height: 1.15; }
  .next { font-size: 16px; }
  .next code { background: rgba(22, 19, 15, 0.1); }
  :root[data-theme="dark"] .next code { background: var(--flat); }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .next code { background: var(--flat); } }

  .jump { position: sticky; top: 0; z-index: 5; background: var(--paper); border-bottom: 1px solid var(--rule); }
  .jump .wrap { display: flex; gap: 6px; overflow-x: auto; padding-block: 10px; scrollbar-width: none; }
  .jump a { flex: none; text-decoration: none; font-weight: 700; font-size: 14px; padding: 6px 12px; border-radius: 999px; border: 1.5px solid var(--ink); background: var(--surface); }
  .jump a:hover { background: var(--sun); color: #16130f; }
  .jump b { margin-left: 6px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .jump a:hover b { color: inherit; }

  section { padding-block: 44px 8px; }
  section h2 { font-size: clamp(24px, 3vw, 32px); letter-spacing: -0.03em; margin-bottom: 6px; }

  .shot { display: block; padding: 0; border: 1.5px solid var(--ink); border-radius: 10px; overflow: hidden; background: var(--surface); aspect-ratio: 16 / 10; width: 100%; cursor: zoom-in; }
  .shot img { width: 100%; height: 100%; object-fit: cover; object-position: top; transition: transform 0.25s ease-out; }
  .shot:hover img { transform: scale(1.03); }
  .shot--tall { aspect-ratio: 4 / 5; }

  .strengths { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 26px 36px; }
  .strength { display: grid; grid-template-columns: 168px minmax(0, 1fr); gap: 16px; align-items: start; }
  .strength__text { display: grid; gap: 6px; }
  .strength h3 { font-size: 20px; }
  .scope { font-weight: 700; color: var(--ok); font-size: 14px; }
  blockquote { font-size: 15px; padding: 2px 0 2px 14px; border-left: 3px solid var(--sun); }

  .points { display: grid; gap: 14px; }
  .point { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 4px 14px; padding: 18px 0 20px; border-top: 1.5px solid var(--ink); }
  .points--env .point { grid-template-columns: minmax(0, 1fr); }
  .point__n { font-size: 30px; font-weight: 800; line-height: 1; letter-spacing: -0.04em; font-variant-numeric: tabular-nums; }
  .point__body { display: grid; gap: 10px; min-width: 0; }
  .point h3 { font-size: 20px; line-height: 1.2; }
  .point__kind { font-size: 13px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .kind { font-weight: 800; padding: 3px 9px; border-radius: 999px; background: var(--flat); color: var(--muted); }
  .kind--breaks, .kind--does-not-load { background: var(--bad); color: var(--paper); }
  .kind--principle, .kind--journey-principle { background: var(--bad-soft); color: var(--bad); }
  .places { list-style: none; padding: 0; display: grid; gap: 6px; }
  .places li { display: grid; grid-template-columns: minmax(90px, max-content) auto minmax(0, 1fr); gap: 4px 12px; align-items: baseline; font-size: 14px; }
  .where { font-size: 13px; overflow-wrap: anywhere; }
  .where--name { font-family: var(--display); font-size: 14px; font-weight: 700; }
  .next .where { font-size: 0.92em; }
  .votes { font-size: 12px; font-weight: 700; padding: 1px 7px; border-radius: 6px; background: var(--bad-soft); color: var(--bad); white-space: nowrap; }
  .places li:not(:has(.votes)) { grid-template-columns: minmax(90px, max-content) minmax(0, 1fr); }
  .places li:not(:has(.where)) { grid-template-columns: minmax(0, 1fr); }
  .said { color: var(--muted); }
  .shots { display: grid; grid-template-columns: repeat(3, minmax(0, 220px)); gap: 10px; }
  .point details summary { cursor: pointer; font-size: 13px; font-weight: 700; color: var(--muted); }

  .aside { background: var(--warn-soft); border: 2px dashed var(--warn); border-radius: 18px; padding: 22px 22px 8px; }
  .aside h2 { color: var(--warn); }
  .aside .point { border-top-color: var(--rule); }
  .points--env .kind { background: transparent; border: 1.5px solid var(--warn); color: var(--warn); }

  .leads { margin-top: 18px; }
  .leads h3 { font-size: 15px; letter-spacing: 0.02em; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
  .leads ol { list-style: none; padding: 0; display: grid; gap: 0; }
  .lead { display: grid; gap: 6px; padding: 12px 0; border-top: 1px solid var(--rule); }
  .lead__fix { font-size: 16.5px; font-weight: 600; max-width: 72ch; }
  .lead__meta { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; font-size: 13px; color: var(--muted); }
  .lead__meta a { text-underline-offset: 3px; }
  .effort { font-weight: 800; font-size: 12px; padding: 2px 9px; border-radius: 999px; border: 1.5px solid var(--ink); color: var(--ink); }
  .effort--quick { background: var(--sun); color: #16130f; border-color: #16130f; }

  .folds { display: grid; gap: 0; margin-bottom: 22px; border-top: 1.5px solid var(--ink); }
  .fold { border-bottom: 1px solid var(--rule); }
  .fold summary { cursor: pointer; display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: baseline; padding: 12px 0; font-weight: 700; list-style: none; }
  .fold summary::-webkit-details-marker { display: none; }
  .fold summary::before { content: "+"; width: 18px; font: 800 16px/1 var(--mono); color: var(--muted); }
  .fold[open] summary::before { content: "−"; }
  .fold summary .muted { font-size: 13px; font-weight: 600; }
  .fold__body { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 18px; padding: 4px 0 20px; }
  .fold__body--journey { grid-template-columns: minmax(0, 1fr); }
  .fold h4 { font-size: 14px; margin: 14px 0 6px; }
  .verdicts { list-style: none; padding: 0; display: grid; gap: 7px; }
  .verdicts li { display: grid; grid-template-columns: 70px minmax(140px, max-content) auto minmax(0, 1fr); gap: 4px 10px; align-items: baseline; font-size: 13.5px; }
  .mark { font-size: 12px; font-weight: 800; }
  .mark--ok { color: var(--ok); } .mark--bad { color: var(--bad); } .mark--accepted { color: var(--muted); }
  .verdicts .votes { background: var(--flat); color: var(--muted); }
  .steps { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
  .steps li { position: relative; display: grid; gap: 6px; align-content: start; }
  .steps__n { position: absolute; left: 6px; top: 6px; width: 22px; height: 22px; border-radius: 50%; background: #16130f; color: var(--sun); font: 800 12px/22px var(--display); text-align: center; pointer-events: none; }
  .steps__broke .shot { border-color: var(--bad); border-width: 2.5px; }
  .plain { list-style: none; padding: 0; display: grid; gap: 8px; font-size: 14px; }
  #detail h3 { font-size: 17px; margin: 8px 0; }

  .say { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .say button { border: 1.5px solid var(--ink); background: var(--surface); border-radius: 999px; padding: 4px 11px; font-size: 12.5px; font-weight: 700; }
  .say button[aria-pressed="true"][data-agree="true"] { background: var(--ok); border-color: var(--ok); color: var(--paper); }
  .say button[aria-pressed="true"][data-agree="false"] { background: var(--bad); border-color: var(--bad); color: var(--paper); }
  .say input { display: none; font: inherit; font-size: 13px; padding: 4px 8px; border: 1.5px solid var(--ink); border-radius: 8px; background: var(--surface); color: var(--ink); flex: 1 1 200px; min-width: 0; }
  .say[data-agree="false"] input { display: block; }
  .said[role="status"] { font-size: 12.5px; }
  .rates { font-size: 13px; color: var(--muted); margin-bottom: 14px; }

  footer { padding-block: 40px 48px; }
  footer p { font-size: 13px; color: var(--muted); }

  dialog { width: min(1200px, 96vw); height: 92vh; max-height: 92vh; padding: 0; border: 2px solid var(--ink); border-radius: 16px; background: var(--paper); color: var(--ink); }
  dialog::backdrop { background: rgba(10, 8, 6, 0.7); }
  .large { display: grid; grid-template-rows: auto minmax(0, 1fr); height: 100%; }
  .large__bar { display: flex; gap: 12px; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1.5px solid var(--ink); background: var(--sun); color: #16130f; font-size: 14px; font-weight: 700; }
  .large__close { border: 1.5px solid #16130f; background: #fff; color: #16130f; border-radius: 999px; padding: 5px 12px; font-weight: 800; }
  .large__body { overflow: auto; padding: 14px; }
  .large__body img { margin: 0 auto; border: 1.5px solid var(--ink); border-radius: 6px; }

  @media (max-width: 760px) {
    .strengths { grid-template-columns: 1fr; }
    .strength { grid-template-columns: 120px minmax(0, 1fr); }
    .point { grid-template-columns: 30px minmax(0, 1fr); }
    .point__n { font-size: 22px; }
    .places li, .places li:not(:has(.votes)) { grid-template-columns: 1fr; gap: 2px; }
    .places .votes { justify-self: start; }
    .shots { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .fold__body { grid-template-columns: 1fr; }
    .fold__body .shot--tall { max-width: 260px; }
    .verdicts li { grid-template-columns: 64px minmax(0, 1fr); }
    .verdicts .votes, .verdicts .said { grid-column: 2; }
  }
  @media (prefers-reduced-motion: reduce) { .shot img { transition: none; } }
`;

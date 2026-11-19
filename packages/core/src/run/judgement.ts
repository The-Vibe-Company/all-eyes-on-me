import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CaptureManifest } from "../capture/capture.js";
import { route } from "../capture/capture.js";
import { pairRoutes } from "../capture/shape.js";
import type { CheckReport } from "../checks/run.js";
import type { JourneyReport } from "../journey/replay.js";
import { concreteness } from "../judge/lazy.js";
import type { JudgeReport, PrincipleVerdict } from "../judge/tally.js";
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
  /** On a journey: its slug and the step it shows at. */
  journey?: string;
  step?: number;
}

/** One thing that fails, merged across every screen or journey it fails on. */
export interface WeakPoint {
  /** `weak:<kind>:<key>`, or `env:<kind>:<key>` for one set apart as the test environment's. */
  id: string;
  kind: "does-not-load" | "breaks" | "journey-principle" | "principle" | "check" | "page";
  /**
   * The principle or the check, the journey's slug when it breaks, `does-not-load` for screens that do not load, the
   * route of a screen the demo left blank (`page`, set apart whole).
   */
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
  /** What each screen says, as a screen reader reads it, by route: where the screen itself says a service is missing. */
  texts?: Record<string, string>;
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
 * What says a service is not there rather than a screen badly made: not configured, unavailable in the demo, a demo
 * mode, a server answering 5xx. Read in the winning side's reasons, the checks' messages, where a journey broke and
 * the screen's own words; never a bare « unavailable », which a screen may say on purpose.
 */
const ENV = /n['’]est pas configur|not configured|non configur|unconfigured|config(uration)? error|erreur de config|(indisponible|unavailable) (en|in)( the)? d[ée]mo|mode d[ée]mo|demo mode|service (unavailable|indisponible)|status (code )?(of )?5\d\d(?!\d)|(?<!\p{L})(error|erreur|http) 5\d\d(?!\d)|variable d['’]environnement|environment variable|missing api key|cl[ée] (d['’])?api manquante/iu;
/** What a journey owes whatever the environment: an error state that says what to do, a way on or back. */
const NEVER_ENV = ["states", "no-dead-end"];
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
  const { manifest, check, judge, replay, journeyJudge, verdict, product, dirs, texts = {} } = input;
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
  // A screen checked and judged under two routes of one shape, such as a record made at each visit, named as judged.
  const pairs = pairRoutes(judge.pages.map((p) => p.page), [...(check.pages ?? []).map(route), ...(check.errors ?? []).map((e) => route(e.url))]);
  const named = (url: string) => pairs.get(route(url)) ?? route(url);

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
    const where = named(e.url);
    if ([...drafts.values()].some((d) => d.kind === "does-not-load" && d.places.some((p) => p.where === where))) continue;
    add("does-not-load", "does-not-load", isEnv(e.reason), { where, reason: e.reason, shot: null, weight: 1 });
  }
  // Journeys that break, each once, where it breaks at its widest width.
  for (const j of replay?.journeys ?? []) {
    const run = widest(j.runs.filter((r) => r.broken));
    if (!run?.broken) continue;
    const { step, reason } = run.broken;
    const dialog = run.steps.find((s) => s.index === step)?.dialog;
    const critique = journeyJudge?.pages.find((p) => p.page === j.slug)?.verdicts.filter((v) => !v.pass && (v.steps ?? []).includes(step)) ?? [];
    const env = isEnv(reason, dialog) || critique.some((v) => isEnv(...v.reasons));
    // Its lead is the page's own: a fix the judges gave on that step answers its principle, not the break.
    add("breaks", j.slug, env, { where: j.name, reason, shot: stepShot(j.slug, step), journey: j.slug, step, weight: 1 }, undefined, { name: j.name, step });
  }
  // Principles. A screen that says a service is missing, in its own words or in what failed it, is the demo's: set
  // apart whole, as one point, never half among the design's weak points.
  const failing = (v: PrincipleVerdict) => !v.pass && !v.accepted && !styleOnly.has(v.principle);
  const pageEnv = new Set(judge.pages.filter((p) => isEnv(texts[p.page]) || p.verdicts.some((v) => failing(v) && isEnv(...v.reasons))).map((p) => p.page));
  for (const p of judge.pages) {
    const fails = p.verdicts.filter(failing);
    if (pageEnv.has(p.page) && fails.length) {
      const said = fails.find((v) => isEnv(...v.reasons)) ?? fails[0]!;
      add("page", p.page, true, { where: p.page, reason: said.reasons[0] ?? "", shot: shotOf(p.page), weight: 1 });
      continue;
    }
    for (const v of fails) add("principle", v.principle, false, { where: p.page, votes: shortVotes(v.votes), reason: v.reasons[0] ?? "", shot: shotOf(p.page), weight: agreement(v.votes) }, v.fix);
  }
  for (const p of journeyJudge?.pages ?? []) {
    for (const v of p.verdicts.filter(failing)) {
      const step = (v.steps ?? [])[0];
      add("journey-principle", v.principle, !NEVER_ENV.includes(v.principle) && isEnv(...v.reasons), { where: nameOf(p.page), votes: shortVotes(v.votes), reason: v.reasons[0] ?? "", shot: stepShot(p.page, step), journey: p.page, ...(step ? { step } : {}), weight: agreement(v.votes) }, v.fix);
    }
  }
  // Checks: one point per check, each screen once with how many elements fail it there, each element once whatever
  // the widths it fails at.
  const byCheck = new Map<string, Map<string, { elements: Set<string>; example: string; env: boolean }>>();
  for (const f of check.findings) {
    if (styleOnly.has(f.check)) continue;
    const pages = byCheck.get(f.check) ?? new Map();
    const where = named(f.url);
    const entry = pages.get(where) ?? { elements: new Set<string>(), example: findingSaid(f.element, f.message), env: true };
    entry.elements.add(`${f.element ?? ""}\n${f.message}`);
    entry.env &&= f.check === "console" && isEnv(f.message);
    pages.set(where, entry);
    byCheck.set(f.check, pages);
  }
  for (const [name, pages] of byCheck) for (const [where, e] of pages) add("check", name, e.env, { where, reason: e.elements.size > 1 ? `${e.example} (+${e.elements.size - 1})` : e.example, shot: shotOf(where), weight: e.elements.size });

  const screens = manifest?.pages.length ?? check.pages.length;
  const point = (d: Draft): WeakPoint & { score: number; rank: number } => {
    const mean = d.places.reduce((n, p) => n + p.weight, 0) / d.places.length;
    // Worst first: what breaks, then what a journey fails, then what a screen fails, then what is measured.
    const rank = d.kind === "does-not-load" || d.kind === "breaks" ? 0 : d.kind === "journey-principle" ? 1 : d.kind === "check" ? 3 : 2;
    const judged = rank === 1 || rank === 2;
    const effect: Effect = rank === 0 ? "high" : judged ? (d.places.length >= 2 || d.places.some((p) => p.weight === 1 && Number(p.votes?.split("/")[1]) >= 3) ? "high" : "medium") : d.places.length >= 2 && d.places.length * 2 >= screens ? "medium" : "low";
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
      score: rank === 3 ? d.places.length + d.places.reduce((n, p) => n + p.weight, 0) / 1000 : d.places.length * mean,
      rank,
    };
  };
  const ordered = [...drafts.values()].map(point).sort((a, b) => a.rank - b.rank || b.score - a.score || a.key.localeCompare(b.key));
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
      checks: [...byCheck].flatMap(([name, pages]) => (pages.has(page) ? [{ check: name, count: pages.get(page)!.elements.size, example: pages.get(page)!.example }] : [])),
    })),
    journeys: (replay?.journeys ?? []).map((j) => {
      const run = widest(j.runs);
      const broke = widest(j.runs.filter((r) => r.broken))?.broken ?? null;
      return {
        slug: j.slug,
        name: j.name,
        broke,
        steps: (Array.isArray(run?.steps) ? run.steps : []).filter((s) => s && typeof s.index === "number").map((s) => ({ index: s.index, action: String(s.action ?? ""), shot: s.capture ? `${dirs.replay}/${s.capture}` : null })),
        verdicts: (journeyJudge?.pages.find((p) => p.page === j.slug)?.verdicts ?? []).map((v) => ({ principle: v.principle, pass: v.pass, votes: shortVotes(v.votes), reason: v.reasons[0] ?? "", steps: v.steps ?? [] })),
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
  const manifest = await json<CaptureManifest>(join(runDir, "before", "captures", "manifest.json"));
  const texts: Record<string, string> = {};
  for (const p of manifest?.pages ?? []) if (typeof p.content === "string") texts[p.path] = (await readFile(join(runDir, "before", "captures", p.content), "utf8").catch(() => "")).slice(0, 20_000);
  return judgementOf({
    manifest,
    texts,
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

/** The verdicts of a judgement the person can agree or disagree with: every point to rework. */
export function judgementVerdicts(j: Judgement): { id: string; category: FeedbackCategory; verdict: string }[] {
  return j.weak.map((w) => ({
    id: w.id,
    category: w.kind === "breaks" ? "journeys" : w.kind === "check" || w.kind === "does-not-load" ? "screens" : "principles",
    verdict: w.kind === "breaks" ? `${w.journey!.name} breaks at step ${w.journey!.step}` : w.kind === "does-not-load" ? `${w.places.map((p) => p.where).join(", ")} does not load` : `${w.key} fails on ${w.places.map((p) => p.where).join(", ")}`,
  }));
}

// ——— The page: a triage list ———

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** « /a, /b et /c »: the places of a list, the last joined by the language's own word. */
const and = (items: string[], word: string) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} ${word} ${items.at(-1)}` : (items[0] ?? ""));

/** What a weak point is, as the list sorts and colours it: a journey, a principle of a screen, or what a check measured. */
type Type = "journey" | "principle" | "check";
const typeOf = (wp: WeakPoint): Type => (wp.kind === "breaks" || wp.kind === "journey-principle" ? "journey" : wp.kind === "principle" || wp.kind === "page" ? "principle" : "check");
/** How grave, in three bars: what breaks or what a journey fails, then a screen, then what is measured. */
const severity = (wp: WeakPoint) => (wp.kind === "does-not-load" || typeOf(wp) === "journey" ? 3 : typeOf(wp) === "principle" ? 2 : 1);

const WORDS = {
  fr: {
    judgement: "Jugement", judgedOn: (d: string) => `Jugement du ${d}`, toRework: (n: number) => `${n} à reprendre`, next: "Suite conseillée", copied: "Copiée", theme: "Changer de thème",
    held: (held: number, total: number, out: string[]) =>
      total === 0 ? "" : held === total ? `<b>${total === 1 ? "L’écran tient le style." : `Les ${total} écrans tiennent le style.`}</b>` : `<b>${held} écran${held > 1 ? "s" : ""} sur ${total} tiennent le style.</b> ${and(out, "et")} ${out.length > 1 ? "en sortent" : "en sort"} :`,
    advise: { directions: "AEOM conseille de repartir de nouvelles directions.", keep: "AEOM conseille de le corriger en gardant son style.", style: "AEOM conseille de corriger ce qui échoue sans toucher à la charte.", direction: (d: string) => `AEOM conseille de porter dans l’app la direction gardée, ${d}.`, nothing: "Rien à reprendre." },
    stats: (m: Judgement["measured"]) => [plural(m.screens, "écran", "écrans"), ...(m.journeys ? [`${m.journeys} parcours`] : []), plural(m.judges, "juge", "juges"), `${m.widths.join(" · ")} px`],
    meter: "Écrans qui tiennent la direction",
    view: "Vue", rework: "À reprendre", strengths: "Points forts", demo: "Hors démo", type: "Type", effortTitle: "Effort", journeysTitle: "Parcours",
    types: { journey: "Parcours", principle: "Principes", check: "Contrôles" } as Record<Type, string>,
    kinds: { "does-not-load": "Écran", breaks: "Parcours", "journey-principle": "Parcours", principle: "Principe", check: "Contrôle", page: "Écran" } as Record<WeakPoint["kind"], string>,
    effort: { quick: "Rapide", medium: "Moyen", big: "Gros chantier" } as Record<Effort, string>,
    effect: { high: "beaucoup d’effet", medium: "effet moyen", low: "peu d’effet" } as Record<Effect, string>,
    worst: "Du plus grave ↓", onScreens: (n: number) => plural(n, "écran", "écrans"), onJourneys: (n: number) => `${n} parcours`,
    judges: (v: string) => `${v} juges`, agreeing: (v: string) => `${v} juges d’accord`, measured: "mesuré", measuredBy: "mesuré par AEOM", number: (n: number) => `n° ${n}`,
    step: (name: string, n: number) => `${name} · étape ${n}`, noShot: "Capture absente",
    lived: "Ce que vit l’utilisateur", lead: "Piste", agree: "D’accord avec ce point ?", keys: "pour passer au suivant",
    nothingLeft: "Rien à reprendre : tout ce qui a été mesuré passe.",
    keepTag: "À garder", keepTitle: "Ce qui tient déjà", noStrength: "Les juges n’ont rien dit de précis de ce qui passe.",
    on: (n: number, of: number, kind: "screens" | "journeys") => (kind === "screens" ? (n === of ? (of > 1 ? `sur les ${of} écrans` : "sur l’écran") : `${n} écrans sur ${of}`) : n === of ? (of > 1 ? `sur les ${of} parcours` : "sur le parcours") : `${n} parcours sur ${of}`),
    checkTag: "À vérifier", demoTitle: "Sans doute l’environnement de démo, pas le design", demoNote: "Un service non configuré ou un serveur qui répond en erreur. À revoir sur une version branchée avant d’y toucher.", noDemo: "Rien ne semble venir de l’environnement de démo.",
    acceptedTitle: "Accepté par la fiche produit", leftToStyle: (ids: string) => `Laissé au style gardé : ${ids}.`,
    judgedBy: (m: string, p: string) => `Jugé par ${m}, sur ${p}.`, unnamed: "un modèle que les votants n’ont pas nommé",
    feedbackNote: "Pour dire si vous êtes d’accord avec chaque point, ouvrez cette page avec <code>aeom report --serve</code>.",
    close: "Fermer", enlarge: "Agrandir",
    breaksAt: (name: string, step: number) => `« ${name} » s’arrête à l’étape ${step}`, noLoad: "Des écrans ne se chargent pas", blankPage: "Une page vide en démo",
    titles: {
      "one-direction": "L’écran sort de la direction du reste", "consistent-chrome": "L’en-tête et les boutons changent d’un écran à l’autre", "not-generic": "Un écran qui pourrait être celui de n’importe quel produit", "not-ai-default": "Le look par défaut d’une IA",
      hierarchy: "L’œil ne sait pas par où commencer", grid: "Les blocs ne tombent pas sur une grille", density: "Trop serré ici, trop vide là", states: "Une erreur ou un vide laissé en blanc",
      "clear-start": "On ne voit pas par où commencer", "next-step": "L’étape suivante n’est pas en vue", "result-shown": "Le résultat n’est pas montré à la fin", "no-dead-end": "Une impasse : rien pour avancer ni revenir", short: "Le parcours fait un détour", "same-words": "Ce qu’on cherche change de nom en route",
      cursor: "Ce qui se clique ne montre pas la main", overflow: "La page défile de côté", contrast: "Du texte trop pâle", console: "Des erreurs dans la console du navigateur", header: "L’en-tête disparaît quand on défile", wrap: "Des libellés coupés sur deux lignes",
      uneven: "Des cartes d’une même rangée de tailles différentes", clipped: "Du texte coupé net", "tap-size": "Des cibles trop petites pour le doigt", "font-size": "Du texte trop petit pour être lu", "line-length": "Des lignes trop longues à suivre", zoom: "Le zoom est bloqué",
      images: "Des images qui ne chargent pas ou se déforment", labels: "Des contrôles sans nom pour un lecteur d’écran", focus: "Au clavier, on ne voit pas où l’on est", "layout-shift": "La page saute pendant qu’elle charge", "gradient-text": "Du texte rempli d’un dégradé", "side-stripe": "Des blocs marqués d’un liseré sur un côté",
      "nested-card": "Des cartes dans des cartes", bounce: "Des animations qui rebondissent", placeholder: "Des trous laissés à remplir", "ai-text": "Du texte qui parle de l’interface ou de la démo", "hollow-words": "Des mots creux", "nested-radius": "Des coins arrondis qui ne se suivent pas",
      orphan: "Un mot seul en fin de titre", motion: "Des animations qui déplacent la mise en page", finish: "La page n’est pas finie",
    } as Record<string, string>,
    fixes: {
      "does-not-load": "Faire répondre ces écrans, ou les retirer des liens qui y mènent.", breaks: "Faire aboutir cette étape : l’écran montre ce que le parcours attend, ou dit pourquoi et propose une suite.",
      "one-direction": "Ramener l’écran dans la direction du reste : mêmes typographies, mêmes couleurs, mêmes composants.", "consistent-chrome": "Reprendre l’en-tête, la navigation et le style de bouton des autres écrans.", "not-generic": "Remplacer le gabarit passe-partout par ce qui est propre au produit : ses mots, ses couleurs, ses formes.", "not-ai-default": "Sortir du look par défaut en partant du monde du produit plutôt que d’un style tout fait.",
      hierarchy: "Donner un seul point de départ : un titre ou une action nettement plus fort que le reste.", grid: "Aligner les blocs sur les mêmes colonnes et les mêmes marges que l’en-tête.", density: "Resserrer ce qui flotte, aérer ce qui étouffe, et donner un rôle à chaque zone vide.", states: "Dessiner l’état : dire ce qui manque et proposer l’action suivante, au lieu d’un blanc.",
      "clear-start": "Mettre la première action en vue sur l’écran de départ, nommée avec les mots de l’utilisateur.", "next-step": "Rendre l’étape suivante visible sur chaque écran : un lien ou un bouton nommé, sans détour.", "result-shown": "Montrer le résultat à la fin : ce qui a été trouvé ou fait, ou un état vide qui dit quoi faire.", "no-dead-end": "Donner à chaque écran d’erreur un moyen d’avancer ou de revenir.", short: "Ouvrir un accès direct à l’écran visé, sans passer par un écran qui n’est pas le but.", "same-words": "Donner un seul nom à ce que cherche l’utilisateur, du lien au titre et au bouton.",
      cursor: "Donner le curseur main à tout ce qui se clique.", overflow: "Contenir la largeur : rien ne doit dépasser de l’écran.", contrast: "Foncer les textes trop pâles jusqu’à un contraste de 4,5:1 sur leur fond.", console: "Corriger les erreurs que la page écrit dans la console.", header: "Garder l’en-tête visible quand on défile.", wrap: "Raccourcir ou élargir les libellés pour qu’ils tiennent sur une ligne.",
      uneven: "Donner la même hauteur aux cartes d’une rangée.", clipped: "Laisser le texte entier, ou le couper avec des points de suspension.", "tap-size": "Agrandir les cibles à 44 px de côté au moins.", "font-size": "Passer les petits textes à 12 px au moins.", "line-length": "Limiter les paragraphes à 75 caractères par ligne environ.", zoom: "Retirer ce qui bloque le zoom dans la balise viewport.",
      images: "Réparer les images cassées et garder leurs proportions.", labels: "Donner un nom à chaque bouton, lien, champ et image.", focus: "Ajouter un contour visible au focus clavier (:focus-visible).", "layout-shift": "Réserver la place de ce qui charge, pour que rien ne saute.", "gradient-text": "Remplir le texte d’une couleur pleine.", "side-stripe": "Remplacer le liseré par un fond teinté ou une pastille.",
      "nested-card": "Garder un seul niveau de cadre : sortir les cartes de la carte.", bounce: "Remplacer le rebond par une courbe douce.", placeholder: "Remplir les trous avec le vrai contenu.", "ai-text": "Remplacer le texte sur l’interface par les mots du produit.", "hollow-words": "Remplacer les mots creux par ce que le produit fait vraiment.", "nested-radius": "Faire suivre au rayon intérieur celui du coin qui le contient.",
      orphan: "Équilibrer les titres pour qu’aucun mot ne reste seul.", motion: "Animer sans déplacer la mise en page : transformations et opacité seulement.", finish: "Finir la page : titre, icône, description, image de partage, et une 404 qui ramène.",
    } as Record<string, string>,
    names: {
      "one-direction": "Une seule direction", "consistent-chrome": "En-tête et boutons pareils partout", "not-generic": "Rien de générique", "not-ai-default": "Pas un look d’IA par défaut",
      hierarchy: "Une hiérarchie claire", grid: "Une grille alignée", density: "Une densité maîtrisée", states: "Des états vides et d’erreur dessinés",
      "clear-start": "Un départ clair", "next-step": "L’étape suivante en vue", "result-shown": "Le résultat montré", "no-dead-end": "Pas d’impasse", short: "Des parcours courts", "same-words": "Les mêmes mots partout",
    } as Record<string, string>,
  },
  en: {
    judgement: "Judgement", judgedOn: (d: string) => `Judgement of ${d}`, toRework: (n: number) => `${n} to rework`, next: "Next", copied: "Copied", theme: "Switch theme",
    held: (held: number, total: number, out: string[]) =>
      total === 0 ? "" : held === total ? `<b>${total === 1 ? "The screen holds the style." : `All ${total} screens hold the style.`}</b>` : `<b>${held} of ${total} screens hold the style.</b> ${and(out, "and")} ${out.length > 1 ? "step" : "steps"} out of it:`,
    advise: { directions: "AEOM advises starting again from new directions.", keep: "AEOM advises fixing it while keeping its style.", style: "AEOM advises fixing what fails without touching the charter.", direction: (d: string) => `AEOM advises carrying the direction kept, ${d}, into the app.`, nothing: "Nothing to rework." },
    stats: (m: Judgement["measured"]) => [plural(m.screens, "screen", "screens"), ...(m.journeys ? [plural(m.journeys, "journey", "journeys")] : []), plural(m.judges, "judge", "judges"), `${m.widths.join(" · ")} px`],
    meter: "Screens that hold the direction",
    view: "View", rework: "To rework", strengths: "Strengths", demo: "Outside the demo", type: "Type", effortTitle: "Effort", journeysTitle: "Journeys",
    types: { journey: "Journeys", principle: "Principles", check: "Checks" } as Record<Type, string>,
    kinds: { "does-not-load": "Screen", breaks: "Journey", "journey-principle": "Journey", principle: "Principle", check: "Check", page: "Screen" } as Record<WeakPoint["kind"], string>,
    effort: { quick: "Quick", medium: "Medium", big: "Big job" } as Record<Effort, string>,
    effect: { high: "a lot of effect", medium: "some effect", low: "little effect" } as Record<Effect, string>,
    worst: "Worst first ↓", onScreens: (n: number) => plural(n, "screen", "screens"), onJourneys: (n: number) => plural(n, "journey", "journeys"),
    judges: (v: string) => `${v} judges`, agreeing: (v: string) => `${v} judges agree`, measured: "measured", measuredBy: "measured by AEOM", number: (n: number) => `no. ${n}`,
    step: (name: string, n: number) => `${name} · step ${n}`, noShot: "No screenshot",
    lived: "What the user lives", lead: "Lead", agree: "Do you agree with this point?", keys: "to go to the next",
    nothingLeft: "Nothing to rework: everything measured passes.",
    keepTag: "To keep", keepTitle: "What already holds", noStrength: "The judges said nothing precise about what passes.",
    on: (n: number, of: number, kind: "screens" | "journeys") => (n === of ? (of > 1 ? `on all ${of} ${kind}` : `on the ${kind === "screens" ? "screen" : "journey"}`) : `${n} of ${of} ${kind}`),
    checkTag: "To check", demoTitle: "Most likely the demo environment, not the design", demoNote: "A service not configured, or a server answering with an error. Look again on a connected version before touching it.", noDemo: "Nothing seems to come from the demo environment.",
    acceptedTitle: "Accepted by the product sheet", leftToStyle: (ids: string) => `Left to the style kept: ${ids}.`,
    judgedBy: (m: string, p: string) => `Judged by ${m}, on ${p}.`, unnamed: "a model the voters did not name",
    feedbackNote: "To say whether you agree with each point, open this page with <code>aeom report --serve</code>.",
    close: "Close", enlarge: "Enlarge",
    breaksAt: (name: string, step: number) => `“${name}” stops at step ${step}`, noLoad: "Screens that do not load", blankPage: "A page blank in the demo",
    titles: {
      "one-direction": "The screen leaves the direction of the rest", "consistent-chrome": "The header and the buttons change from screen to screen", "not-generic": "A screen that could belong to any product", "not-ai-default": "An AI's default look",
      hierarchy: "The eye does not know where to start", grid: "Blocks do not sit on a grid", density: "Too cramped here, too empty there", states: "An error or an emptiness left blank",
      "clear-start": "Where to start is not in sight", "next-step": "The next step is not in sight", "result-shown": "The result is not shown at the end", "no-dead-end": "A dead end: nothing to go on or back", short: "The journey takes a detour", "same-words": "What the user is after changes names on the way",
      cursor: "What clicks does not show the hand", overflow: "The page scrolls sideways", contrast: "Text too pale", console: "Errors in the browser's console", header: "The header goes away on scroll", wrap: "Labels broken over two lines",
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
      images: "Repair broken images and keep their proportions.", labels: "Give every button, link, field and image a name.", focus: "Add a visible outline to the keyboard focus (:focus-visible).", "layout-shift": "Reserve room for what loads, so nothing jumps.", "gradient-text": "Fill text with a solid colour.", "side-stripe": "Replace the stripe with a tinted ground or a badge.",
      "nested-card": "Keep one level of frame: take the cards out of the card.", bounce: "Replace the bounce with a soft curve.", placeholder: "Fill the holes with the real content.", "ai-text": "Replace text about the interface with the product's own words.", "hollow-words": "Replace hollow words with what the product really does.", "nested-radius": "Make the inner radius follow the corner that holds it.",
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
/** The day of a run, from its name (`run-20261118-1949`), in the page's language; null for a name without one. */
const dayOf = (run: string, lang: JudgementLang) => {
  const m = run.match(/(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);
};
/** The product as an address shows it: `crispy-tenders/opportunites`. */
const slugOf = (name: string | null) => (name ?? "app").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "app";

/** What the page around it gives the judgement: the boxes to agree or disagree, the rates, and the script that sends them. */
export interface JudgementPageParts {
  run: string;
  lang: JudgementLang;
  say: (v: { id: string; category: FeedbackCategory; verdict: string } | null) => string;
  rates: string;
  feedbackScript: string;
}

/**
 * The judgement as a triage list, one page: a bar with the product and what comes next, a band with the verdict,
 * then the filters, the weak points from the worst, and the one chosen in detail with its captures and its lead. Its
 * styles and scripts inline, its captures beside it in the run's folder, nothing from the network.
 */
export function judgementHtml(j: Judgement, parts: JudgementPageParts): string {
  const w: Words = WORDS[parts.lang] ?? WORDS.en;
  const verdicts = new Map(judgementVerdicts(j).map((v) => [v.id, v]));
  const title = (wp: WeakPoint) => (wp.kind === "breaks" ? w.breaksAt(wp.journey!.name, wp.journey!.step) : wp.kind === "does-not-load" ? w.noLoad : wp.kind === "page" ? w.blankPage : (w.titles[wp.key] ?? wp.key));
  const fixOf = (wp: WeakPoint) => wp.fix ?? w.fixes[wp.key] ?? w.fixes[wp.kind] ?? "";
  const scope = (wp: WeakPoint) => (wp.kind === "page" ? wp.places[0]!.where : typeOf(wp) === "journey" ? w.onJourneys(new Set(wp.places.map((p) => p.journey ?? p.where)).size) : w.onScreens(wp.places.length));
  const judged = (wp: WeakPoint) => wp.kind === "principle" || wp.kind === "journey-principle";
  const slug = slugOf(j.product.name);
  const addressOf = (p: WeakPlace) => (p.journey && p.step ? w.step(p.where, p.step) : p.where.startsWith("/") ? `${slug}${p.where}` : p.where);
  const img = (src: string | null, alt: string) => (src ? `<img src="${esc(href(src))}" alt="${esc(alt)}" loading="lazy">` : `<span class="noshot">${w.noShot}</span>`);
  const bars = (n: number, cls: string) => `<span class="sev ${cls}" aria-hidden="true">${[1, 2, 3].map((i) => `<i${i <= n ? ' class="on"' : ""}></i>`).join("")}</span>`;

  // ——— The bar: the product, the day, what is to rework, and the command that comes next.
  const advice = j.nothingToRedo ? { say: w.advise.nothing, cmd: null } : j.direction ? { say: w.advise.direction(esc(j.direction)), cmd: "/aeom redo" } : j.keepStyle ? { say: w.advise.style, cmd: "/aeom redo" } : j.recommend === "directions" ? { say: w.advise.directions, cmd: "/aeom directions" } : { say: w.advise.keep, cmd: "/aeom redo --garder-le-style" };
  const day = dayOf(parts.run, parts.lang);
  const top = `<header class="top"><div class="logo"><i></i>AEOM</div><div class="crumb"><span>/</span><b class="prod"${j.product.sentence ? ` title="${esc(j.product.sentence)}"` : ""}>${esc(j.product.name ?? parts.run)}</b><span>/</span><span>${day ? w.judgedOn(day) : w.judgement}</span></div><div class="sp"></div><span class="pill"><i></i>${w.toRework(j.weak.length)}</span><button type="button" class="btn sec" data-theme-toggle aria-label="${w.theme}" title="${w.theme}">◐</button>${advice.cmd ? `<button type="button" class="btn pri" data-copy="${esc(advice.cmd)}" data-done="${w.copied}"><span class="lab">${w.next}</span> <span class="mono">${esc(advice.cmd)}</span></button>` : ""}</header>`;

  // ——— The band: a cell per screen, red where it leaves the direction, the verdict in a sentence, what was measured.
  const direction = j.screens.map((s) => ({ page: s.page, verdict: s.verdicts.find((v) => v.principle === "one-direction") })).filter((s) => s.verdict);
  const out = direction.filter((s) => !s.verdict!.pass).map((s) => s.page);
  const held = w.held(direction.length - out.length, direction.length, out.map(esc));
  const band = `<div class="verdict"><div class="meter" title="${w.meter}">${direction.map((s) => `<i class="cell${s.verdict!.pass ? "" : " on"}" title="${esc(s.page)}"></i>`).join("")}</div><span class="vphrase">${held}${held ? " " : ""}${advice.say}</span><div class="stats">${w.stats(j.measured).map((x) => `<span>${esc(x)}</span>`).join("")}</div></div>\n`;

  // ——— The filters, each with its count.
  const count = { type: (t: Type) => j.weak.filter((wp) => typeOf(wp) === t).length, effort: (e: Effort) => j.weak.filter((wp) => wp.effort === e).length };
  const journeysOf = (wp: WeakPoint) => [...new Set(wp.places.map((p) => p.journey).filter((s): s is string => !!s))];
  const filter = (id: string, label: string, n: number, mark: string, on = false) => `<button type="button" class="f${on ? " on" : ""}" data-f="${esc(id)}">${mark}<span class="fl">${esc(label)}</span><span class="c">${n}</span></button>`;
  const dot = (cls: string) => `<span class="d ${cls}"></span>`;
  const glyph = (g: string) => `<span class="q">${g}</span>`;
  const side = `<aside class="side"><p class="gl">${w.view}</p>${filter("all", w.rework, j.weak.length, dot("red"), true)}${filter("forts", w.strengths, j.strengths.length, dot("green"))}${filter("demo", w.demo, j.env.length, dot("amber"))}<p class="gl">${w.type}</p>${filter("type:journey", w.types.journey, count.type("journey"), glyph("↝"))}${filter("type:principle", w.types.principle, count.type("principle"), glyph("◇"))}${filter("type:check", w.types.check, count.type("check"), glyph("✓"))}<p class="gl">${w.effortTitle}</p>${filter("effort:quick", w.effort.quick, count.effort("quick"), glyph("⚡"))}${filter("effort:medium", w.effort.medium, count.effort("medium"), glyph("◑"))}${filter("effort:big", w.effort.big, count.effort("big"), glyph("●"))}${
    j.journeys.length ? `<p class="gl">${w.journeysTitle}</p>${j.journeys.map((jr) => filter(`journey:${jr.slug}`, jr.name, j.weak.filter((wp) => journeysOf(wp).includes(jr.slug)).length, glyph("↝"))).join("")}` : ""
  }<div class="foot">${parts.rates}<p class="small" id="feedback-note" hidden>${w.feedbackNote}</p>${j.judges ? `<p class="small">${w.judgedBy(esc(j.judges.models.join(", ") || w.unnamed), esc(j.judges.principles))}</p>` : ""}</div></aside>`;

  // ——— The list: the weak points from the worst; the strengths and what is set apart, each in its own view.
  const votesShown = (wp: WeakPoint) => (judged(wp) && wp.places[0]?.votes ? w.judges(wp.places[0].votes) : w.measured);
  const row = (wp: WeakPoint, i: number) =>
    `<button type="button" class="row${i === 0 ? " on" : ""}" data-n="${i + 1}" data-weak="${esc(wp.id)}" data-type="${typeOf(wp)}" data-effort="${wp.effort}" data-journeys="${esc(journeysOf(wp).join(" "))}">${bars(severity(wp), `s${severity(wp)}`)}<span class="rt"><span class="t">${esc(title(wp))}</span><span class="w"><span class="ty ty-${typeOf(wp)}${wp.kind === "does-not-load" ? " ty-journey" : ""}">${w.kinds[wp.kind]}</span> · ${esc(scope(wp))}</span></span><span class="r"><span class="eff ${wp.effort}">${w.effort[wp.effort]}</span><span class="vt">${esc(votesShown(wp))}</span></span></button>`;
  const quiet = (t: string, s: string, cls: string) => `<div class="row quiet">${bars(3, cls)}<span class="rt"><span class="t">${esc(t)}</span><span class="w">${esc(s)}</span></span></div>`;
  const list = `<section class="list"><div class="lh" data-view="faibles"><h2>${w.rework} <span id="count-faibles">${j.weak.length}</span></h2><span class="sort">${w.worst}</span></div><div class="lh" data-view="forts" hidden><h2>${w.strengths} <span>${j.strengths.length}</span></h2></div><div class="lh" data-view="demo" hidden><h2>${w.demo} <span>${j.env.length}</span></h2></div><div class="rows" data-view="faibles">${j.weak.length ? j.weak.map(row).join("") : `<p class="empty">${w.nothingLeft}</p>`}</div><div class="rows" data-view="forts" hidden>${j.strengths.map((s) => quiet(w.names[s.principle] ?? s.principle, w.on(s.count, s.of, s.kind), "green")).join("")}</div><div class="rows" data-view="demo" hidden>${j.env.map((e) => quiet(title(e), scope(e), "amber")).join("")}</div></section>`;

  // ——— The detail of each point: its capture in a browser's frame, a place for each screen or step it touches, what
  // the user lives there, its lead, and whether the person agrees.
  const point = (wp: WeakPoint, i: number) => {
    const first = wp.places[0]!;
    const places = wp.places.length > 1 ? `<div class="places">${wp.places.map((p, k) => `<button type="button" class="place${k === 0 ? " on" : ""}" data-src="${p.shot ? esc(href(p.shot)) : ""}" data-url="${esc(addressOf(p))}" data-lived="${esc(p.reason)}">${p.shot ? `<img src="${esc(href(p.shot))}" alt="" loading="lazy">` : ""}${esc(p.where)}</button>`).join("")}</div>` : "";
    const where = wp.kind === "check" && wp.places.length > 1 ? `<span class="src mono">${wp.places.map((p) => esc(p.where)).join(" · ")}</span>` : "";
    const agreement = judged(wp) && first.votes ? w.agreeing(first.votes) : w.measuredBy;
    return `<article class="point" data-weak="${esc(wp.id)}" data-n="${i + 1}"${i === 0 ? "" : " hidden"}><p class="dk"><span class="ty ty-${typeOf(wp)}">${w.kinds[wp.kind]}</span> · ${w.number(i + 1)} · ${esc(scope(wp))} · ${esc(agreement)}</p><h2 class="dt">${esc(title(wp))}</h2><div class="viewer"><div class="chrome"><i></i><i></i><i></i><span class="url mono">${esc(addressOf(first))}</span></div><div class="vimg">${img(first.shot, first.where)}</div>${places}</div><div class="blk"><h3>${w.lived}</h3><p class="lived">${esc(first.reason)}</p>${where}</div><div class="blk"><h3>${w.lead}</h3><div class="fix"><span class="ic" aria-hidden="true">→</span><div><p>${esc(fixOf(wp))}</p><p class="m">${w.effort[wp.effort]} · ${w.effect[wp.effect]}</p></div></div></div><div class="agree"><span>${w.agree}</span>${parts.say(verdicts.get(wp.id) ?? null)}<span class="k"><kbd>J</kbd> <kbd>K</kbd> ${w.keys}</span></div></article>`;
  };
  const strong = `<section id="view-forts" data-view="forts" hidden><p class="dk"><span class="ty ty-green">${w.keepTag}</span></p><h2 class="dt">${w.keepTitle}</h2>${
    j.strengths.length ? `<div class="strong">${j.strengths.map((s) => `<div class="card">${s.shot ? `<button type="button" class="zoom" data-full="${esc(href(s.shot))}" data-title="${esc(s.where)}">${img(s.shot, s.where)}</button>` : ""}<div class="cb"><b>${esc(w.names[s.principle] ?? s.principle)}</b><span class="cs">${esc(w.on(s.count, s.of, s.kind))}</span><p>${esc(s.reason)}</p><span class="src mono">${esc(s.where)}</span></div></div>`).join("")}</div>` : `<p class="lived">${w.noStrength}</p>`
  }${j.accepted.length ? `<div class="blk"><h3>${w.acceptedTitle}</h3><ul class="plain">${j.accepted.map((a) => `<li><span class="mono">${esc(a.where)}</span> ${esc(a.what)}</li>`).join("")}</ul></div>` : ""}${j.leftToStyle.length ? `<p class="small">${esc(w.leftToStyle(j.leftToStyle.join(", ")))}</p>` : ""}</section>`;
  const demo = `<section id="view-demo" data-view="demo" hidden><p class="dk"><span class="ty ty-amber">${w.checkTag}</span></p><h2 class="dt">${w.demoTitle}</h2><p class="lived">${j.env.length ? w.demoNote : w.noDemo}</p>${
    j.env.length ? `<ul class="demo">${j.env.map((e) => `<li>${e.places[0]?.shot ? `<button type="button" class="zoom" data-full="${esc(href(e.places[0].shot))}" data-title="${esc(title(e))}">${img(e.places[0].shot, e.places[0].where)}</button>` : ""}<div><b>${esc(title(e))}</b><span class="src mono">${esc(scope(e))}</span><p>${esc(e.places[0]?.reason ?? "")}</p></div></li>`).join("")}</ul>` : ""
  }</section>`;
  const detail = `<section class="detail"><div data-view="faibles">${j.weak.length ? j.weak.map(point).join("") : `<p class="lived">${w.nothingLeft}</p>${parts.say({ id: "nothing-to-redo", category: "screens", verdict: "Nothing to redo" })}`}</div>${strong}${demo}</section>`;

  const dialog = `<dialog id="large" aria-labelledby="large-title"><div class="large"><div class="large__bar"><span id="large-title"></span><button type="button" class="large__close">${w.close}</button></div><div class="large__body"><img alt=""></div></div></dialog>`;

  return `<!doctype html>
<html lang="${parts.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AEOM · ${esc(j.product.name ?? parts.run)}</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='9' fill='%230F1115'/%3E%3Ccircle cx='16' cy='16' r='6' fill='%23fff'/%3E%3C/svg%3E">
<script>try{var t=localStorage.getItem("aeom-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}</script>
<style>${STYLE}</style>
</head>
<body>
${top}
${band}<main class="app">
${side}
${list}
${detail}
</main>
${dialog}
<script>${parts.feedbackScript}</script>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

/** The page's own gestures: the views and the filters, a point chosen by a click or J and K, a place, a capture large, the theme, the command copied. */
const SCRIPT = `
(() => {
  const root = document.documentElement;
  const dark = () => (root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelectorAll("[data-theme-toggle]").forEach((b) => b.addEventListener("click", () => {
    const next = dark() ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("aeom-theme", next); } catch (e) {}
  }));
  document.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
    const text = b.dataset.copy;
    try { await navigator.clipboard.writeText(text); } catch (e) {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.append(area);
      area.select();
      try { document.execCommand("copy"); } catch (e2) {}
      area.remove();
    }
    const label = b.querySelector(".lab");
    const was = label.textContent;
    label.textContent = b.dataset.done;
    setTimeout(() => { label.textContent = was; }, 1600);
  }));

  let view = "faibles", filter = "all";
  const rows = [...document.querySelectorAll("button.row")];
  const points = [...document.querySelectorAll("article.point")];
  let chosen = rows[0] ? rows[0].dataset.weak : null;
  const matches = (r) => {
    if (filter === "all") return true;
    const [k, v] = filter.split(":");
    if (k === "type") return r.dataset.type === v;
    if (k === "effort") return r.dataset.effort === v;
    if (k === "journey") return (r.dataset.journeys || "").split(" ").includes(v);
    return true;
  };
  const choose = (id) => {
    chosen = id;
    rows.forEach((r) => r.classList.toggle("on", r.dataset.weak === id));
    points.forEach((p) => (p.hidden = p.dataset.weak !== id));
  };
  const render = () => {
    document.querySelectorAll("[data-view]").forEach((e) => (e.hidden = e.dataset.view !== view));
    document.querySelectorAll(".f").forEach((b) => b.classList.toggle("on", view === "faibles" ? b.dataset.f === filter : b.dataset.f === view));
    if (view !== "faibles") return;
    const shown = rows.filter(matches);
    rows.forEach((r) => (r.hidden = !shown.includes(r)));
    const n = document.getElementById("count-faibles");
    if (n) n.textContent = shown.length;
    choose(shown.some((r) => r.dataset.weak === chosen) ? chosen : shown[0] ? shown[0].dataset.weak : null);
  };
  document.querySelectorAll(".f").forEach((b) => b.addEventListener("click", () => {
    const f = b.dataset.f;
    if (f === "forts" || f === "demo") view = f;
    else { view = "faibles"; filter = f; }
    render();
  }));
  rows.forEach((r) => r.addEventListener("click", () => choose(r.dataset.weak)));
  document.addEventListener("keydown", (e) => {
    if (view !== "faibles" || e.metaKey || e.ctrlKey || e.altKey || (e.key !== "j" && e.key !== "k")) return;
    if (e.target.closest && e.target.closest("input, textarea")) return;
    const shown = rows.filter((r) => !r.hidden);
    const i = shown.findIndex((r) => r.dataset.weak === chosen);
    const next = shown[e.key === "j" ? i + 1 : i - 1];
    if (!next) return;
    choose(next.dataset.weak);
    next.scrollIntoView({ block: "nearest" });
  });
  points.forEach((p) => p.querySelectorAll(".place").forEach((b) => b.addEventListener("click", () => {
    p.querySelectorAll(".place").forEach((x) => x.classList.toggle("on", x === b));
    const box = p.querySelector(".vimg");
    if (b.dataset.src) {
      let image = box.querySelector("img");
      if (!image) { box.replaceChildren(); image = document.createElement("img"); image.alt = ""; box.append(image); }
      image.src = b.dataset.src;
    }
    p.querySelector(".url").textContent = b.dataset.url;
    p.querySelector(".lived").textContent = b.dataset.lived;
  })));

  const dialog = document.getElementById("large");
  const large = dialog.querySelector("img");
  const open = (src, label) => {
    large.src = src;
    large.alt = label || "";
    dialog.querySelector("#large-title").textContent = label || "";
    dialog.showModal();
    dialog.querySelector(".large__body").scrollTop = 0;
  };
  document.addEventListener("click", (e) => {
    const zoom = e.target.closest && e.target.closest(".zoom");
    if (zoom) return open(zoom.dataset.full, zoom.dataset.title);
    const shot = e.target.closest && e.target.closest(".vimg img");
    if (shot) open(shot.getAttribute("src"), shot.closest("article").querySelector(".url").textContent);
  });
  dialog.querySelector(".large__close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  render();
})();`;

/**
 * The colours and the type of the validated mockup, « la liste de tri », light and dark. Geist when the machine has
 * it, the system's sans otherwise: AEOM ships no copy of it, and the page loads nothing from the network.
 */
const STYLE = `
:root{
  --bg:#F5F6F8; --panel:#FFFFFF; --ink:#0F1115; --ink-2:#3A3F4A; --muted:#6B7280; --line:#E3E5EA; --soft:#F0F1F4; --sel:#EEF1FF; --sel-line:#C9D2FF;
  --accent:#3451E0; --red:#E5484D; --orange:#EC7A1C; --gray:#9AA0AB; --green:#1F9D61; --green-bg:#E7F6EE; --amber:#B7740C; --amber-bg:#FDF3E2;
  --sans:Geist, system-ui, -apple-system, "Segoe UI", sans-serif; --mono:"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  color-scheme:light;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0E1013;--panel:#15181D;--ink:#ECEEF2;--ink-2:#C4C8D0;--muted:#8B919C;--line:#252A31;--soft:#1C2026;--sel:#1C2342;--sel-line:#2F3D7A;--accent:#7C8FFF;--green-bg:#122A1E;--amber-bg:#2E2412;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0E1013;--panel:#15181D;--ink:#ECEEF2;--ink-2:#C4C8D0;--muted:#8B919C;--line:#252A31;--soft:#1C2026;--sel:#1C2342;--sel-line:#2F3D7A;--accent:#7C8FFF;--green-bg:#122A1E;--amber-bg:#2E2412;color-scheme:dark}
*{box-sizing:border-box;margin:0;padding:0}
[hidden]{display:none!important}
html,body{height:100%}
body{background:var(--bg);color:var(--ink);font:400 14px/1.5 var(--sans);-webkit-font-smoothing:antialiased;display:flex;flex-direction:column}
button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px}
.mono,code,kbd{font-family:var(--mono)}
code{font-size:.92em;background:var(--soft);padding:1px 5px;border-radius:5px}
.small{font-size:12px;color:var(--muted)}

.top{height:56px;flex:none;display:flex;align-items:center;gap:16px;padding:0 20px;border-bottom:1px solid var(--line);background:var(--panel)}
.logo{display:flex;align-items:center;gap:8px;font-weight:700;letter-spacing:-.01em}
.logo i{width:20px;height:20px;border-radius:6px;background:var(--ink);display:grid;place-items:center}
.logo i:after{content:"";width:8px;height:8px;border-radius:50%;background:var(--panel)}
.crumb{color:var(--muted);display:flex;gap:8px;align-items:center;min-width:0;white-space:nowrap}
.crumb b{color:var(--ink);font-weight:500;overflow:hidden;text-overflow:ellipsis}
.sp{flex:1}
.pill{display:inline-flex;align-items:center;gap:7px;padding:5px 11px;border-radius:99px;background:var(--soft);font-weight:500;font-size:13px;white-space:nowrap}
.pill i{width:7px;height:7px;border-radius:50%;background:var(--red)}
.btn{display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 14px;border-radius:9px;font-weight:500;font-size:13px;white-space:nowrap}
.btn.pri{background:var(--ink);color:var(--panel)}
.btn.sec{border:1px solid var(--line);background:var(--panel)}
.btn .mono{font-size:12px;opacity:.7}

.verdict{flex:none;display:flex;align-items:center;gap:14px;padding:10px 20px;background:var(--panel);border-bottom:1px solid var(--line);font-size:13.5px;color:var(--ink-2)}
.verdict b{color:var(--ink);font-weight:600}
.meter{display:flex;gap:3px;align-items:center;flex:none}
.meter i{width:14px;height:6px;border-radius:2px;background:var(--line)}
.meter i.on{background:var(--red)}
.vphrase .where,.vphrase code{font-family:var(--mono);font-size:.92em}
.verdict .stats{margin-left:auto;display:flex;gap:16px;color:var(--muted);font-size:13px;white-space:nowrap}

.app{flex:1;display:grid;grid-template-columns:232px 440px minmax(0,1fr);min-height:0}
.side{border-right:1px solid var(--line);padding:16px 12px;overflow:auto;background:var(--panel)}
.gl{font-size:11.5px;font-weight:600;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;padding:14px 10px 6px}
.gl:first-child{padding-top:0}
.f{display:flex;align-items:center;gap:10px;width:100%;padding:7px 10px;border-radius:8px;color:var(--ink-2);text-align:left}
.f:hover{background:var(--soft)}
.f.on{background:var(--sel);color:var(--ink);font-weight:500}
.f .fl{min-width:0}
.f .c{margin-left:auto;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.f .d{flex:none;width:8px;height:8px;border-radius:50%}
.d.red{background:var(--red)}.d.green{background:var(--green)}.d.amber{background:var(--amber)}
.f .q{flex:none;width:16px;text-align:center;color:var(--muted)}
.foot{margin:18px 10px 0;padding-top:14px;border-top:1px solid var(--line);display:grid;gap:8px}
.rates{font-size:12px;color:var(--muted)}

.list{border-right:1px solid var(--line);overflow:auto;background:var(--panel)}
.lh{position:sticky;top:0;background:var(--panel);display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--line);z-index:1}
.lh h2{font-size:15px;font-weight:600}
.lh h2 span{color:var(--muted);font-weight:400;margin-left:6px}
.lh .sort{font-size:12.5px;color:var(--muted)}
.row{display:grid;grid-template-columns:18px minmax(0,1fr) auto;gap:12px;width:100%;padding:12px 18px;border-bottom:1px solid var(--soft);text-align:left;align-items:start}
button.row{cursor:pointer}
button.row:hover{background:var(--soft)}
.row.on{background:var(--sel);box-shadow:inset 3px 0 0 var(--accent)}
.row.quiet{grid-template-columns:18px minmax(0,1fr)}
.sev{margin-top:4px;display:flex;gap:2px;align-items:flex-end;height:12px}
.sev i{width:3px;border-radius:1px;background:var(--line)}
.sev i:nth-child(1){height:5px}.sev i:nth-child(2){height:8px}.sev i:nth-child(3){height:12px}
.sev.s3 i.on{background:var(--red)}.sev.s2 i.on{background:var(--orange)}.sev.s1 i.on{background:var(--gray)}
.sev.green i{background:var(--green)}.sev.amber i{background:var(--amber)}
.rt{display:block;min-width:0}
.row .t{display:block;font-weight:500;line-height:1.35}
.row .w{display:block;color:var(--muted);font-size:12.5px;margin-top:3px}
.ty{font-weight:500}
.ty-journey{color:var(--red)}.ty-principle{color:var(--orange)}.ty-check{color:var(--muted)}.ty-green{color:var(--green)}.ty-amber{color:var(--amber)}
.row .r{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.eff{font-size:11.5px;font-weight:500;padding:2px 8px;border-radius:6px;background:var(--soft);color:var(--ink-2);white-space:nowrap}
.eff.quick{background:var(--green-bg);color:var(--green)}
.eff.big{background:var(--amber-bg);color:var(--amber)}
.vt{font-size:12px;color:var(--muted);white-space:nowrap}
.empty{padding:18px;color:var(--muted)}

.detail{overflow:auto;padding:24px 28px 40px}
.dk{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12.5px;color:var(--muted)}
.dk .ty{font-weight:600}
.dt{font-size:26px;line-height:1.2;letter-spacing:-.02em;font-weight:600;margin:8px 0 18px;max-width:22em}
.viewer{background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.chrome{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--line);font-size:12px;color:var(--muted)}
.chrome i{width:9px;height:9px;border-radius:50%;background:var(--line)}
.chrome .url{margin-left:8px;background:var(--soft);padding:3px 10px;border-radius:6px;flex:1;max-width:420px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vimg{aspect-ratio:16/9.2;overflow:hidden;background:var(--soft);display:grid;place-items:start center}
.vimg img{width:100%;display:block;cursor:zoom-in}
.noshot{place-self:center;color:var(--muted);font-size:13px}
.places{display:flex;gap:8px;padding:12px;border-top:1px solid var(--line);overflow:auto}
.place{flex:none;display:flex;gap:9px;align-items:center;padding:5px 10px 5px 5px;border-radius:9px;border:1px solid var(--line);font-size:12.5px;color:var(--ink-2);background:var(--panel)}
.place img{width:44px;height:28px;object-fit:cover;object-position:top;border-radius:5px}
.place.on{border-color:var(--accent);background:var(--sel);color:var(--ink)}
.blk{margin-top:22px}
.blk h3{font-size:12px;font-weight:600;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px}
.lived{font-size:16px;line-height:1.55;color:var(--ink)}
.src{display:block;font-size:12.5px;color:var(--muted);margin-top:6px}
.fix{display:flex;gap:14px;padding:16px 18px;border-radius:12px;background:var(--green-bg);align-items:flex-start}
.fix .ic{flex:none;width:28px;height:28px;border-radius:8px;background:var(--green);color:#fff;display:grid;place-items:center;font-weight:600}
.fix p{font-size:15px;font-weight:500;color:var(--ink)}
.fix .m{font-size:12.5px;color:var(--green);font-weight:500;margin-top:3px}
.agree{margin-top:22px;display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding-top:18px;border-top:1px solid var(--line)}
.agree .k{margin-left:auto;font-size:12px;color:var(--muted)}
.say{display:inline-flex;flex-wrap:wrap;align-items:center;gap:10px}
.say button{padding:7px 14px;font-size:13px;font-weight:500;border:1px solid var(--line);background:var(--panel)}
.say button:first-of-type{border-radius:9px 0 0 9px}
.say button+button{border-left:0;border-radius:0 9px 9px 0}
.say button[aria-pressed="true"]{background:var(--ink);color:var(--panel);border-color:var(--ink)}
.say input{display:none;font:inherit;font-size:13px;padding:6px 10px;border:1px solid var(--line);border-radius:9px;background:var(--panel);color:var(--ink);min-width:220px}
.say[data-agree="false"] input{display:block}
.say .said{font-size:12.5px;color:var(--muted)}
kbd{font-size:11px;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:1px 5px;background:var(--panel)}

.strong{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.zoom{display:block;width:100%;cursor:zoom-in}
.card .zoom img{width:100%;aspect-ratio:16/8;object-fit:cover;object-position:top;display:block;border-bottom:1px solid var(--line)}
.cb{padding:12px 14px}
.cb b{font-weight:600;display:flex;gap:8px;align-items:center}
.cb b:before{content:"✓";flex:none;width:18px;height:18px;border-radius:50%;background:var(--green-bg);color:var(--green);display:grid;place-items:center;font-size:11px}
.cs{display:block;font-size:12.5px;color:var(--green);margin:2px 0 4px 26px}
.cb p{font-size:13px;color:var(--ink-2);margin-left:26px}
.cb .src{margin-left:26px}
.demo{list-style:none;margin-top:18px;display:grid;gap:10px}
.demo li{display:grid;grid-template-columns:160px minmax(0,1fr);gap:14px;align-items:start;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px}
.demo li:not(:has(.zoom)){grid-template-columns:minmax(0,1fr)}
.demo .zoom img{width:100%;aspect-ratio:16/10;object-fit:cover;object-position:top;border-radius:8px;display:block}
.demo b{font-weight:600}
.demo p{font-size:13px;color:var(--ink-2);margin-top:4px}
.plain{list-style:none;display:grid;gap:6px;font-size:13px;color:var(--ink-2)}

dialog{width:min(1200px,96vw);height:92vh;max-height:92vh;margin:auto;padding:0;border:1px solid var(--line);border-radius:14px;background:var(--panel);color:var(--ink)}
dialog::backdrop{background:rgba(8,9,12,.6)}
.large{display:grid;grid-template-rows:auto minmax(0,1fr);height:100%}
.large__bar{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--line);font-size:13px;color:var(--muted);font-family:var(--mono)}
.large__close{font-family:var(--sans);border:1px solid var(--line);border-radius:9px;padding:5px 12px;font-weight:500;color:var(--ink)}
.large__body{overflow:auto;padding:14px;background:var(--soft)}
.large__body img{display:block;margin:0 auto;max-width:100%;border-radius:6px}

@media (max-width:1100px){
  html,body{height:auto}
  .app{grid-template-columns:1fr}
  .side{border-right:0;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:4px;align-items:center}
  .side .gl{width:100%;padding:8px 4px 2px}
  .side .f{width:auto}
  .side .foot{width:100%}
  .list{max-height:50vh;border-right:0;border-bottom:1px solid var(--line)}
  .verdict{flex-wrap:wrap}
  .verdict .stats{margin-left:0}
  .top{gap:10px;padding:0 14px}
  .crumb span:last-child{display:none}
  .strong{grid-template-columns:1fr}
}
@media (max-width:640px){
  .top .pill,.btn.pri .lab{display:none}
  .demo li{grid-template-columns:1fr}
}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
`;

import { buildCommand } from "./features.js";
import type { PageLang, ResultPage } from "./report.js";

/** GitHub refuses a description over 65,536 characters: the PR stays well under. */
const MAX_BODY = 60_000;
/** Entries a section names; the result page has the rest. */
const MAX_ENTRIES = 40;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** The PR's own words, in the person's language; what the judges, the workers and the run wrote stays as they wrote it. */
const WORDS = {
  en: {
    title: {
      asked: (request: string) => `AEOM: ${request}`,
      replug: "AEOM: the front plugged into its API",
      built: (champion: string | null) => `AEOM: a first front${champion ? `, on ${champion}` : ""}`,
      direction: (champion: string) => `AEOM: a new direction, ${champion}`,
      kept: "AEOM: the front fixed, its style kept",
      fixed: "AEOM: the front fixed",
    },
    intro: (report: string) => `What All Eyes On Me did on this run, in words. The captures stay on the machine that ran it, and so does the result page: ${report}, from the repository's root.`,
    beforeRun: "Before the run.",
    measured: (m: Measured) => `Measured: ${m.screens} ${plural(m.screens, "screen", "screens")} at ${m.widths} px, ${m.checks} ${plural(m.checks, "check", "checks")} and ${m.principles} ${plural(m.principles, "principle", "principles")} each${m.journeys === null ? "" : `; ${m.journeys} ${plural(m.journeys, "journey", "journeys")} on ${m.journeyPrinciples} ${plural(m.journeyPrinciples!, "principle", "principles")}`}.`,
    knockout: (among: string) => `chosen by knockout among ${among}`,
    person: "chosen by the person",
    personNoKnockout: (among: string) => `chosen by the person among ${among}, with no knockout`,
    validated: (among: string) => `chosen by knockout among ${among}, and validated by the person`,
    overruled: (among: string, judges: string) => `chosen by the person; the judges' knockout among ${among} had picked ${judges}`,
    direction: "Direction",
    styleKept: "Style kept",
    styleKeptText: "No new direction: the run fixed what failed on the app's own style.",
    plugged: "Plugged into its API",
    pluggedText: (api: string, data: string) => `The screens did not change: the data module now reads ${api}; what it does not provide yet stays fake, listed in ${data}.`,
    anApi: "the API given",
    scratch: "Built from scratch",
    scratchApi: (api: string, data: string) => `Every screen reads its data from the API given, ${api}, running on the machine that ran it; what it does not provide yet stays fake, in one module, listed in ${data}.`,
    scratchFake: "Every screen runs on fake data, kept in one module and named as such, until an API replaces it.",
    screens: "Screens",
    journeys: "Journeys",
    status: { kept: "kept", new: "new", changed: "changed", missing: "missing", unchanged: "unchanged", "does not load": "does not load", "sent back": "sent back" } as Record<string, string>,
    journeyStatus: { kept: "kept", "sent back": "sent back", unchanged: "unchanged", new: "new" } as Record<string, string>,
    counts: (before: number, after: number) => `${before} → ${after} failing`,
    steps: (before: number, after: number) => `${before} → ${after} steps`,
    lostAll: "sent back: it lost what it let its users do.",
    backSame: "sent back, the same as before",
    backWorse: "sent back, worse than before",
    cleared: "Cleared",
    still: "Still failing",
    newly: "Newly failing",
    lost: "Lost",
    brokeBefore: (how: string) => `Before the run, ${how}.`,
    atEnd: (how: string) => `At the end, ${how}.`,
    asked: "Asked",
    review: "Review of the standard",
    notReviewed: "Not reviewed against the standard yet.",
    alreadyThere: (n: number, brought: boolean) =>
      brought ? `${n} more ${n === 1 ? "was" : "were"} already there before this run: see the result page.`
      : n === 1 ? "It was already there before this run: the branch brought none." : `All ${n} were already there before this run: the branch brought none.`,
    unmeasured: (n: number) => `${n} on ${n === 1 ? "a screen" : "screens"} this run did not measure before: whether ${n === 1 ? "it was" : "they were"} there is not known, see the result page.`,
    features: "Missing features",
    featuresText: "What a key journey would need to reach its end. AEOM built none of it.",
    blocks: (name: string, step: number, missing: string) => `**${name}**, blocks at step ${step}: ${missing}`,
    frontOnly: (command: string) => `Front only: ${command}`,
    needsBack: (back: string) => `Needs the back too: ${back}`,
    more: (n: number) => `${n} more blocked ${plural(n, "journey", "journeys")}, not named.`,
    stillFailing: "Still failing",
    notMeasured: "Not measured after the run: what failed before it.",
    nothing: "Nothing.",
    andMore: (n: number) => `…and ${n} more, see the result page.`,
    cut: (report: string) => `…cut here: the rest is on the result page, ${report}.`,
    footer: "Opened by All Eyes On Me. It follows this repository's rules: AEOM merges nothing.",
    colon: ":",
    said: (text: string) => text,
  },
  fr: {
    title: {
      asked: (request: string) => `AEOM : ${request}`,
      replug: "AEOM : le front branché sur son API",
      built: (champion: string | null) => `AEOM : un premier front${champion ? `, sur ${champion}` : ""}`,
      direction: (champion: string) => `AEOM : une nouvelle direction, ${champion}`,
      kept: "AEOM : le front corrigé, son style gardé",
      fixed: "AEOM : le front corrigé",
    },
    intro: (report: string) => `Ce qu'All Eyes On Me a fait sur ce run, en mots. Les captures restent sur la machine qui l'a lancé, comme la page de résultat : ${report}, depuis la racine du dépôt.`,
    beforeRun: "Avant le run.",
    measured: (m: Measured) => `Mesuré : ${m.screens} ${plural(m.screens, "écran", "écrans")} à ${m.widths} px, ${m.checks} ${plural(m.checks, "contrôle", "contrôles")} et ${m.principles} ${plural(m.principles, "principe", "principes")} chacun${m.journeys === null ? "" : ` ; ${m.journeys} parcours sur ${m.journeyPrinciples} ${plural(m.journeyPrinciples!, "principe", "principes")}`}.`,
    knockout: (among: string) => `choisie par élimination parmi ${among}`,
    person: "choisie par la personne",
    personNoKnockout: (among: string) => `choisie par la personne parmi ${among}, sans élimination`,
    validated: (among: string) => `choisie par élimination parmi ${among}, et validée par la personne`,
    overruled: (among: string, judges: string) => `choisie par la personne ; l'élimination des juges parmi ${among} avait retenu ${judges}`,
    direction: "Direction",
    styleKept: "Style gardé",
    styleKeptText: "Pas de nouvelle direction : le run a corrigé ce qui échouait, dans le style de l'app.",
    plugged: "Branché sur son API",
    pluggedText: (api: string, data: string) => `Les écrans n'ont pas changé : le module de données lit maintenant ${api} ; ce qu'elle ne fournit pas encore reste fictif, listé dans ${data}.`,
    anApi: "l'API donnée",
    scratch: "Construit de zéro",
    scratchApi: (api: string, data: string) => `Chaque écran lit ses données dans l'API donnée, ${api}, qui tourne sur la machine qui a lancé le run ; ce qu'elle ne fournit pas encore reste fictif, dans un seul module, listé dans ${data}.`,
    scratchFake: "Chaque écran tourne sur des données fictives, gardées dans un seul module et nommées comme telles, jusqu'à ce qu'une API les remplace.",
    screens: "Écrans",
    journeys: "Parcours",
    status: { kept: "gardé", new: "nouveau", changed: "modifié", missing: "disparu", unchanged: "inchangé", "does not load": "ne charge pas", "sent back": "renvoyé" } as Record<string, string>,
    journeyStatus: { kept: "amélioré", "sent back": "remis", unchanged: "inchangé", new: "nouveau" } as Record<string, string>,
    counts: (before: number, after: number) => `${before} → ${after} en échec`,
    steps: (before: number, after: number) => `${before} → ${after} étapes`,
    lostAll: "renvoyé : il a perdu ce qu'il permettait de faire.",
    backSame: "renvoyé, pareil qu'avant",
    backWorse: "renvoyé, moins bien qu'avant",
    cleared: "Réglé",
    still: "Encore en échec",
    newly: "Nouvel échec",
    lost: "Perdu",
    brokeBefore: (how: string) => `Avant le run, ${how}.`,
    atEnd: (how: string) => `À la fin, ${how}.`,
    asked: "Demandé",
    review: "Relecture du standard",
    notReviewed: "Pas encore relu au regard du standard.",
    alreadyThere: (n: number, brought: boolean) =>
      brought ? `${n} ${n === 1 ? "autre était" : "autres étaient"} déjà là avant ce run : voir la page de résultat.`
      : n === 1 ? "Il était déjà là avant ce run : la branche n'en a apporté aucun." : `Les ${n} étaient déjà là avant ce run : la branche n'en a apporté aucun.`,
    unmeasured: (n: number) => `${n} sur ${n === 1 ? "un écran" : "des écrans"} que ce run n'avait pas ${n === 1 ? "mesuré" : "mesurés"} avant : on ne sait pas ${n === 1 ? "s'il était" : "s'ils étaient"} là, voir la page de résultat.`,
    features: "Fonctions manquantes",
    featuresText: "Ce qu'il faudrait à un parcours clé pour aller au bout. AEOM n'en a rien construit.",
    blocks: (name: string, step: number, missing: string) => `**${name}**, bloque à l'étape ${step} : ${missing}`,
    frontOnly: (command: string) => `Seulement du front : ${command}`,
    needsBack: (back: string) => `Demande aussi du back : ${back}`,
    more: (n: number) => `${n} ${plural(n, "autre parcours bloqué, non nommé", "autres parcours bloqués, non nommés")}.`,
    stillFailing: "Encore en échec",
    notMeasured: "Pas mesuré après le run : ce qui échouait avant lui.",
    nothing: "Rien.",
    andMore: (n: number) => `…et ${n} de plus, sur la page de résultat.`,
    cut: (report: string) => `…coupé ici : la suite est sur la page de résultat, ${report}.`,
    footer: "Ouverte par All Eyes On Me. Elle suit les règles de ce dépôt : AEOM ne merge rien.",
    colon: " :",
    // What the CLI writes in English, in the words the result page gives it in French; any other text stays as written.
    said: (text: string) =>
      text === "Nothing outside the standard." ? "Rien hors du standard."
      : text === "No screen touched, and nothing outside the standard." ? "Aucun écran touché, et rien hors du standard."
      : text === "Nothing outside the standard in the code; the screens it touches were not measured." ? "Rien hors du standard dans le code ; les écrans touchés n'ont pas été mesurés."
      : text === "did not load before the run, and was not measured after the run" ? "ne chargeait pas avant le run, et n'a pas été mesurée après"
      : text
          .replace(/^(\d+) things? outside the standard\.$/, (_, n: string) => `${n} ${n === "1" ? "chose" : "choses"} hors du standard.`)
          .replace(/^it broke at step (\d+): ([\s\S]*)$/, (_, n: string, why: string) => `il s'est arrêté à l'étape ${n} : ${why}`),
  },
};
type Words = (typeof WORDS)["en"];

/** What `aeom verdict` says it measured, read back from its line. */
interface Measured {
  screens: number;
  widths: string;
  checks: number;
  principles: number;
  journeys: number | null;
  journeyPrinciples: number | null;
}

/** The line `aeom verdict` writes, in the PR's language; a line of another shape stays as it was written. */
function measuredLine(line: string, w: Words): string {
  const m = /^Measured: (\d+) screens? at ([\d, ]+) px, (\d+) checks? and (\d+) principles? each(?:; (\d+) journeys? on (\d+) principles?)?\.$/.exec(line.trim());
  if (!m) return line;
  return w.measured({ screens: Number(m[1]), widths: m[2]!, checks: Number(m[3]), principles: Number(m[4]), journeys: m[5] === undefined ? null : Number(m[5]), journeyPrinciples: m[6] === undefined ? null : Number(m[6]) });
}

/** Text on one line, as a title takes it. */
const flat = (text: string) => text.replace(/\s*[\r\n]+\s*/g, " ").trim();

/**
 * What a judge, a worker or the run wrote, as plain words in Markdown: on one
 * line, with nothing GitHub would render as an image, a link, HTML, a heading
 * or a table, and no @mention that would notify anyone.
 */
function words(text: string): string {
  return flat(text)
    .replace(/[\\`*_[\]!<>#|~&]/g, "\\$&")
    .replace(/(^|[^A-Za-z0-9])@(?=[A-Za-z0-9])/g, "$1@​");
}

/** A path as code, its fence longer than any run of backticks inside it. */
function code(path: string): string {
  const text = flat(path);
  const fence = "`".repeat(Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length)) + 1);
  const pad = /^`|`$/.test(text) ? " " : "";
  return `${fence}${pad}${text}${pad}${fence}`;
}

/** The first entries of a section, then how many more the result page has. */
const capped = (entries: string[], w: Words) => (entries.length > MAX_ENTRIES ? [...entries.slice(0, MAX_ENTRIES), `- ${w.andMore(entries.length - MAX_ENTRIES)}`] : entries);

const list = (label: string, items: string[], w: Words) => (items.length ? ` ${label}${w.colon} ${items.map(words).join(", ")}.` : "");

function screenLine(s: ResultPage["screens"][number], w: Words): string {
  const status = w.status[s.status] ?? s.status;
  if (s.status !== "sent back") return `- ${code(s.page)} ${status}${s.count ? `${w.colon} ${w.counts(s.count.before, s.count.after)}` : ""}.${list(w.cleared, s.cleared, w)}${list(w.still, s.still, w)}${list(w.newly, s.newly, w)}`;
  // Sent back by what the page wave measured: the counts of the version that was put back.
  const counts = s.back && s.back.before !== null && s.back.after !== null ? { before: s.back.before, after: s.back.after } : s.count;
  const worse = s.back ? s.back.verdict === "worse" : Boolean(s.count && s.count.after > s.count.before);
  // A page that lost a link is sent back for it, whatever its count.
  if (s.back?.lost?.length) return `- ${code(s.page)} ${w.lostAll}${list(w.lost, s.back.lost, w)}${list(w.still, s.still, w)}`;
  return `- ${code(s.page)} ${worse ? w.backWorse : w.backSame}${counts ? `${w.colon} ${w.counts(counts.before, counts.after)}` : ""}.${list(w.still, s.still, w)}${list(w.newly, s.newly, w)}`;
}

function journeyLine(j: ResultPage["journeys"][number], w: Words, asked = false): string {
  const steps = j.steps.before !== null && j.steps.after !== null ? `, ${w.steps(j.steps.before, j.steps.after)}` : "";
  // A run that built what was asked weighs no journey against another: where one breaks at its end is said.
  const end = asked && j.broke.after ? ` ${w.atEnd(words(w.said(j.broke.after)))}` : "";
  return `- **${words(j.name)}** ${w.journeyStatus[j.status] ?? j.status}${steps}.${j.why ? ` ${words(j.why)}` : ""}${j.broke.before ? ` ${w.brokeBefore(words(w.said(j.broke.before)))}` : ""}${end}${list(w.cleared, j.cleared, w)}${list(w.still, j.remaining, w)}`;
}

/** Cut between two lines, under GitHub's limit, saying where the rest is. */
function fit(text: string, report: string, w: Words): string {
  const footer = `---\n${w.footer}`;
  if (text.length + footer.length < MAX_BODY) return `${text}${footer}`;
  const cut = w.cut(report);
  return `${text.slice(0, text.lastIndexOf("\n", MAX_BODY - footer.length - cut.length - 8))}\n\n${cut}\n\n${footer}`;
}

/**
 * The pull request of a run, in words only, in the person's language: what
 * it kept, what it sent back and why, what it could not do without a
 * feature, and where the result page is, from the repository's root. No
 * capture and no image: they stay on the machine that ran it.
 */
export function prBody(page: ResultPage, reportPath: string, lang: PageLang = "en"): { title: string; body: string } {
  const w: Words = WORDS[lang];
  // What was asked names the PR, cut to stay a title.
  const asked = page.asked ? flat(page.asked.request) : "";
  const name = page.asked
    ? w.title.asked(asked.length > 90 ? `${asked.slice(0, 89).trimEnd()}…` : asked)
    : page.replug
    ? w.title.replug
    : page.built
      ? w.title.built(page.direction ? flat(page.direction.champion) : null)
      : page.direction
        ? w.title.direction(flat(page.direction.champion))
        : page.verdict?.keepStyle
          ? w.title.kept
          : w.title.fixed;
  const title = `${name} (${flat(page.run)})`;
  const report = code(reportPath);
  const lines: string[] = [w.intro(report), ""];
  // The verdict's line is written in English: said again in the PR's language, never rewritten in its own.
  if (page.verdict) lines.push(`**${w.beforeRun}** ${words(lang === "en" ? page.verdict.line : measuredLine(page.verdict.line, w))}`, "");

  if (page.direction) {
    const d = page.direction;
    const among = d.entrants.map(words).join(", ");
    const chosen = !d.decision
      ? w.knockout(among)
      : d.decision.judges === null && d.entrants.length === 1
        ? w.person
        : d.decision.judges === null
          ? w.personNoKnockout(among)
          : d.decision.judges === d.champion
            ? w.validated(among)
            : w.overruled(among, words(d.decision.judges));
    lines.push(`## ${w.direction}`, "", `**${words(d.champion)}**, ${chosen}.${d.sentence ? ` ${words(d.sentence)}` : ""}`, "");
    for (const reason of [...d.reasons, ...(d.decision?.why ? [d.decision.why] : [])].slice(0, MAX_ENTRIES)) lines.push(`> ${words(reason)}`, "");
  } else if (page.verdict?.keepStyle) {
    lines.push(`## ${w.styleKept}`, "", w.styleKeptText, "");
  }

  if (page.asked) lines.push(`## ${w.asked}`, "", words(page.asked.request), "", ...(page.asked.plan ? [words(page.asked.plan), ""] : []));
  if (page.replug) lines.push(`## ${w.plugged}`, "", w.pluggedText(code(page.api ?? w.anApi), code("front/data.md")), "");
  else if (page.built && page.api) lines.push(`## ${w.scratch}`, "", w.scratchApi(code(page.api), code("front/data.md")), "");
  else if (page.built) lines.push(`## ${w.scratch}`, "", w.scratchFake, "");
  if (page.screens.length) lines.push(`## ${w.screens}`, "", ...capped(page.screens.map((s) => screenLine(s, w)), w), "");
  if (page.journeys.length) lines.push(`## ${w.journeys}`, "", ...capped(page.journeys.map((j) => journeyLine(j, w, Boolean(page.asked))), w), "");
  if (page.features?.entries.length) {
    lines.push(`## ${w.features}`, "", w.featuresText, "");
    // Front alone, the command that builds it; the back too, what the back would have to provide.
    const needs = (f: (typeof page.features.entries)[number]) => (f.needs === "front" ? ` ${w.frontOnly(code(buildCommand(f)))}` : f.needs === "back" && f.back ? ` ${w.needsBack(words(f.back))}` : "");
    for (const f of page.features.entries) lines.push(`- ${w.blocks(words(f.name), f.step, words(f.missing))}${needs(f)}`);
    if (page.features.more) lines.push(`- ${w.more(page.features.more)}`);
    lines.push("");
  }
  // What a run that built what was asked measures is the review of the standard, not a verdict of judges.
  if (page.asked) {
    const review = page.asked.review;
    lines.push(`## ${w.review}`, "", ...(review ? [`**${words(w.said(review.verdict))}**`, "", ...(review.lines.length ? [...capped(review.lines.map((l) => `- ${words(l)}`), w), ""] : []), ...(review.already?.length ? [w.alreadyThere(review.already.length, review.lines.some((l) => !/^[✓⚠]/.test(l))), ""] : []), ...(review.unmeasured?.length ? [w.unmeasured(review.unmeasured.length), ""] : [])] : [w.notReviewed, ""]));
    return { title, body: fit(lines.join("\n") + "\n", report, w) };
  }
  lines.push(`## ${w.stillFailing}`, "");
  if (!page.measuredAfter) lines.push(w.notMeasured, "");
  if (page.stillFailing.length) lines.push(...capped(page.stillFailing.map((f) => `- ${code(f.where)} ${words(w.said(f.what))}`), w), "");
  else if (page.measuredAfter) lines.push(w.nothing, "");
  return { title, body: fit(lines.join("\n") + "\n", report, w) };
}

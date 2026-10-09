import type { ResultPage } from "./report.js";

/** GitHub refuses a description over 65,536 characters: the PR stays well under. */
const MAX_BODY = 60_000;
/** Entries a section names; the result page has the rest. */
const MAX_ENTRIES = 40;
const FOOTER = "---\nOpened by All Eyes On Me. It follows this repository's rules: AEOM merges nothing.";

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
const capped = (entries: string[]) => (entries.length > MAX_ENTRIES ? [...entries.slice(0, MAX_ENTRIES), `- …and ${entries.length - MAX_ENTRIES} more, see the result page.`] : entries);

const list = (label: string, items: string[]) => (items.length ? ` ${label}: ${items.map(words).join(", ")}.` : "");

function screenLine(s: ResultPage["screens"][number]): string {
  if (s.status !== "sent back") return `- ${code(s.page)} ${s.status}${s.count ? `: ${s.count.before} → ${s.count.after} failing` : ""}.${list("Cleared", s.cleared)}${list("Still failing", s.still)}${list("Newly failing", s.newly)}`;
  // Sent back by what the page wave measured: the counts of the version that was put back.
  const counts = s.back && s.back.before !== null && s.back.after !== null ? { before: s.back.before, after: s.back.after } : s.count;
  const worse = s.back ? s.back.verdict === "worse" : Boolean(s.count && s.count.after > s.count.before);
  return `- ${code(s.page)} sent back, ${worse ? "worse than before" : "the same as before"}${counts ? `: ${counts.before} → ${counts.after} failing` : ""}.${list("Still failing", s.still)}${list("Newly failing", s.newly)}`;
}

function journeyLine(j: ResultPage["journeys"][number]): string {
  const steps = j.steps.before !== null && j.steps.after !== null ? `, ${j.steps.before} → ${j.steps.after} steps` : "";
  return `- **${words(j.name)}** ${j.status}${steps}.${j.why ? ` ${words(j.why)}` : ""}${j.broke.before ? ` Before the run, ${words(j.broke.before)}.` : ""}${list("Cleared", j.cleared)}${list("Still failing", j.remaining)}`;
}

/** Cut between two lines, under GitHub's limit, saying where the rest is. */
function fit(text: string, report: string): string {
  if (text.length + FOOTER.length < MAX_BODY) return `${text}${FOOTER}`;
  const cut = `…cut here: the rest is on the result page, ${report}.`;
  return `${text.slice(0, text.lastIndexOf("\n", MAX_BODY - FOOTER.length - cut.length - 8))}\n\n${cut}\n\n${FOOTER}`;
}

/**
 * The pull request of a run, in words only: what it kept, what it sent back
 * and why, what it could not do without a feature, and where the result page
 * is, from the repository's root. No capture and no image: they stay on the
 * machine that ran it.
 */
export function prBody(page: ResultPage, reportPath: string): { title: string; body: string } {
  const title = page.direction
    ? `AEOM: a new direction, ${flat(page.direction.champion)} (${flat(page.run)})`
    : page.verdict?.keepStyle
      ? `AEOM: the front fixed, its style kept (${flat(page.run)})`
      : `AEOM: the front fixed (${flat(page.run)})`;
  const report = code(reportPath);
  const lines: string[] = [`What All Eyes On Me did on this run, in words. The captures stay on the machine that ran it, and so does the result page: ${report}, from the repository's root.`, ""];
  if (page.verdict) lines.push(`**Before the run.** ${words(page.verdict.line)}`, "");

  if (page.direction) {
    const d = page.direction;
    lines.push("## Direction", "", `**${words(d.champion)}**, chosen by knockout among ${d.entrants.map(words).join(", ")}.${d.sentence ? ` ${words(d.sentence)}` : ""}`, "");
    for (const reason of d.reasons.slice(0, MAX_ENTRIES)) lines.push(`> ${words(reason)}`, "");
  } else if (page.verdict?.keepStyle) {
    lines.push("## Style kept", "", "No new direction: the run fixed what failed on the app's own style.", "");
  }

  if (page.screens.length) lines.push("## Screens", "", ...capped(page.screens.map(screenLine)), "");
  if (page.journeys.length) lines.push("## Journeys", "", ...capped(page.journeys.map(journeyLine)), "");
  if (page.features?.entries.length) {
    lines.push("## Missing features", "", "What a key journey would need to reach its end. AEOM built none of it.", "");
    for (const f of page.features.entries) lines.push(`- **${words(f.name)}**, blocks at step ${f.step}: ${words(f.missing)}`);
    if (page.features.more) lines.push(`- ${page.features.more} more blocked journey${page.features.more === 1 ? "" : "s"}, not named.`);
    lines.push("");
  }
  lines.push("## Still failing", "");
  if (!page.measuredAfter) lines.push("Not measured after the run: what failed before it.", "");
  if (page.stillFailing.length) lines.push(...capped(page.stillFailing.map((f) => `- ${code(f.where)} ${words(f.what)}`)), "");
  else if (page.measuredAfter) lines.push("Nothing.", "");
  return { title, body: fit(lines.join("\n") + "\n", report) };
}

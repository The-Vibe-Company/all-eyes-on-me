import type { ResultPage } from "./report.js";

/**
 * The pull request of a run, in words only: what it kept, what it sent back
 * and why, what it could not do without a feature, and where the result page
 * is. No capture and no image: they stay on the machine that ran it.
 */
export function prBody(page: ResultPage, reportPath: string): { title: string; body: string } {
  const title = page.direction
    ? `AEOM: a new direction, ${page.direction.champion} (${page.run})`
    : page.verdict?.keepStyle
      ? `AEOM: the front fixed, its style kept (${page.run})`
      : `AEOM: the front fixed (${page.run})`;
  const list = (label: string, items: string[]) => (items.length ? ` ${label}: ${items.join(", ")}.` : "");
  const lines: string[] = [`What All Eyes On Me did on this run, in words. The captures stay on the machine that ran it: the result page is at \`${reportPath}\`.`, ""];
  if (page.verdict) lines.push(`**Before the run.** ${page.verdict.line}`, "");

  if (page.direction) {
    const d = page.direction;
    lines.push("## Direction", "", `**${d.champion}**, chosen by knockout among ${d.entrants.join(", ")}.${d.sentence ? ` ${d.sentence}` : ""}`, "");
    for (const reason of d.reasons) lines.push(`> ${reason}`, "");
  } else if (page.verdict?.keepStyle) {
    lines.push("## Style kept", "", "No new direction: the run fixed what failed on the app's own style.", "");
  }

  if (page.screens.length) {
    lines.push("## Screens", "");
    for (const s of page.screens) {
      const count = s.count ? `: ${s.count.before} → ${s.count.after} failing` : "";
      lines.push(`- \`${s.page}\` ${s.status}${count}.${list("Cleared", s.cleared)}${list("Still failing", s.still)}${list("Newly failing", s.newly)}`);
    }
    lines.push("");
  }
  if (page.journeys.length) {
    lines.push("## Journeys", "");
    for (const j of page.journeys) {
      const steps = j.steps.before !== null && j.steps.after !== null ? `, ${j.steps.before} → ${j.steps.after} steps` : "";
      lines.push(`- **${j.name}** ${j.status}${steps}.${j.why ? ` ${j.why}` : ""}${j.broke.before ? ` Before the run, ${j.broke.before}.` : ""}${list("Cleared", j.cleared)}${list("Still failing", j.remaining)}`);
    }
    lines.push("");
  }
  if (page.features?.entries.length) {
    lines.push("## Missing features", "", "What a key journey would need to reach its end. AEOM built none of it.", "");
    for (const f of page.features.entries) lines.push(`- **${f.name}**, blocks at step ${f.step}: ${f.missing}`);
    if (page.features.more) lines.push(`- ${page.features.more} more blocked journey${page.features.more === 1 ? "" : "s"}, not named.`);
    lines.push("");
  }
  lines.push("## Still failing", "");
  if (!page.measuredAfter) lines.push("Not measured after the run: what failed before it.", "");
  lines.push(...(page.stillFailing.length ? page.stillFailing.map((f) => `- \`${f.where}\` ${f.what}`) : ["Nothing."]), "");
  lines.push("---", "Opened by All Eyes On Me. It follows this repository's rules: AEOM merges nothing.");
  return { title, body: lines.join("\n") };
}

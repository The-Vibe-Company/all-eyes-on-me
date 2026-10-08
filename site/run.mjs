// The "Condition report" section, written from the run that rebuilt this page
// and nothing else: site/run/ holds the captures, the reports and the
// tournament, and this script turns them into the partial shared/run.html.
// Run `node site/run.mjs` after replacing site/run/; a test fails until then.
import { readFile, writeFile } from "node:fs/promises";

const here = (path) => new URL(path, import.meta.url);
const json = async (path) => JSON.parse(await readFile(here(path), "utf8"));
const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const name = (slug) => slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const words = (n) => ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"][n] ?? String(n);

/** What fails on the page, counted as `aeom compare` counts it. */
function score(check, judge) {
  const checks = new Set(check.findings.map((f) => f.check)).size;
  const principles = judge.pages.flatMap((p) => p.verdicts).filter((v) => !v.pass).length;
  return { checks, principles, total: checks + principles, ofChecks: check.checks.length, ofPrinciples: judge.principles.length };
}

function state(side, title, what, s) {
  const verdict = s.total === 0
    ? `Nothing fails: all ${words(s.ofChecks)} checks and all ${words(s.ofPrinciples)} principles pass.`
    : `${capital(words(s.total))} ${s.total === 1 ? "thing fails" : "things fail"}: ${words(s.checks)} of ${words(s.ofChecks)} checks and ${words(s.principles)} of ${words(s.ofPrinciples)} principles.`;
  const src = `/run/${side}/index@1280.webp`;
  return `      <figure class="treatment__state">
        <a class="treatment__plate" href="${src}"><img src="${src}" alt="This page ${side}, at desktop width" loading="lazy" decoding="async"></a>
        <figcaption><b>${title}</b> ${what}. ${verdict}</figcaption>
      </figure>`;
}

function specimen(slug, kept) {
  const src = `/run/directions/${slug}.webp`;
  return `      <li class="specimen${kept ? " specimen--kept" : ""}">
        <a class="specimen__plate" href="${src}"><img src="${src}" alt="The ${esc(name(slug))} direction, as built on this page" loading="lazy" decoding="async"></a>
        <span class="specimen__name">${esc(name(slug))}</span>${kept ? `<span class="specimen__kept">Kept</span>` : ""}
      </li>`;
}

function bout(duel, last) {
  const round = duel.round === last ? "Final" : `Round ${duel.round}`;
  if (!duel.b) return `      <li class="bout bout--bye"><span class="bout__round">${round}</span><p class="bout__pair">${esc(name(duel.a))} goes through without a duel.</p></li>`;
  const loser = duel.winner === duel.a ? duel.b : duel.a;
  const won = duel.votes.filter((v) => v.winner === duel.winner).length;
  const reasons = duel.votes.map((v) => `<li>${esc(v.reason)}</li>`).join("");
  return `      <li class="bout"><span class="bout__round">${round}</span><p class="bout__pair"><b>${esc(name(duel.winner))}</b> beat ${esc(name(loser))}, ${won}&ndash;${duel.votes.length - won}</p><p class="bout__why">${esc(duel.votes.find((v) => v.winner === duel.winner).reason)}</p><details class="bout__all"><summary>All ${words(duel.votes.length)} reasons</summary><ul>${reasons}</ul></details></li>`;
}

export async function runSection() {
  const tournament = await json("run/directions/tournament.json");
  const before = score(await json("run/before/check.json"), await json("run/before/judge.json"));
  const after = score(await json("run/after/check.json"), await json("run/after/judge.json"));
  const last = Math.max(...tournament.duels.map((d) => d.round));
  const champion = tournament.duels.find((d) => d.round === last).winner;
  return `<section id="provenance" class="wrap grid section" aria-labelledby="provenance-title">
  <div class="section__head">
    <p class="kicker"><span class="kicker__ref">03</span> Condition report</p>
    <h2 id="provenance-title">This page, before and after</h2>
  </div>
  <div class="section__body">
    <p>AEOM rebuilt this page from its bare first version. Everything below is read from that run, kept in the repository under <code>site/run</code>.</p>
    <div class="treatment">
${state("before", "Before.", "The bare first version", before)}
      <span class="treatment__arrow" aria-hidden="true">&rarr;</span>
${state("after", "After.", "Rebuilt by AEOM", after)}
    </div>
    <h3>${capital(words(tournament.entrants.length))} directions, one kept</h3>
    <ol class="specimens">
${tournament.entrants.map((slug) => specimen(slug, slug === champion)).join("\n")}
    </ol>
    <h3>The knockout, ${words(tournament.votesPerDuel)} judges a duel</h3>
    <ol class="bouts">
${tournament.duels.map((d) => bout(d, last)).join("\n")}
    </ol>
  </div>
</section>
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await writeFile(here("shared/run.html"), await runSection());
  console.log("Wrote site/shared/run.html from site/run/");
}

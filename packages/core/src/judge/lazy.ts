import type { Vote } from "./tally.js";

/** A sentence that names nothing: what a vote says when it did not look. Read sentence by sentence, lower case. */
const GENERIC = new RegExp(
  [
    "^(it |all |everything )?(looks?|seems?|is|reads) (good|fine|ok|okay|great|clean|nice|correct|consistent|clear)( overall| here| to me| enough)?$",
    "^(good|fine|ok|okay|great|clean|nice|correct|consistent|clear|passes|pass|n/a)( overall| here)?$",
    "^(no (issues?|problems?)( found| here)?|nothing to (report|flag|note)|(meets|follows) the principle)$",
    "^(conforme|correct|bien|ok pour moi|rien à signaler|rien à redire|ça passe|propre|clair|cohérent( avec le reste)?|respecte le principe)$",
  ].join("|"),
  "u",
);
/**
 * A vote that owns it judged without looking at the captures, or on something else than them. Only
 * the captures count: « I cannot tell which one is mine without opening them » says what a user lives.
 */
const BLIND = /(?<!\p{L})(did ?n[o’']t|have ?n[o’']t|has ?n[o’']t|never|without) (re-?)?(open(ed|ing)?|look(ed|ing)? at|view(ed|ing)?|check(ed|ing)?) (the |any |all )?(captures?|screenshots?|sheets?)(?!\p{L})|(?<!\p{L})(only )?skimm(ed|ing)(?!\p{L})|(?<!\p{L})based on the (previous|earlier|other) (verdict|vote)s?(?!\p{L})|(?<!\p{L})from memory(?!\p{L})|(?<!\p{L})(je n[’']ai pas|sans) (re)?(regardé|regarder|ouvert|ouvrir|vu|voir) (les |la |l[’'])?(captures?|planches?)(?!\p{L})/iu;
/** The things a page shows, which a reason that looked names: a part of it, its layout, a colour, a word of the trade. */
const THINGS = new RegExp(
  `(?<!\\p{L})(${[
    "buttons?", "links?", "headers?", "footers?", "menus?", "nav(igation)?", "bars?", "titles?", "headings?", "headlines?", "lists?", "tables?", "cards?", "forms?", "fields?", "inputs?", "labels?", "images?", "photos?", "photographs?", "logos?", "icons?", "illustrations?", "posters?",
    "colou?rs?", "palettes?", "backgrounds?", "gradients?", "accents?", "fonts?", "serifs?", "sans", "type", "typography", "grids?", "columns?", "rows?", "gutters?", "edges?", "margins?", "padding", "borders?", "shadows?", "spacing", "whitespace", "alignment", "aligned",
    "sidebars?", "panels?", "panes?", "banners?", "hero", "modals?", "dialogs?", "tabs?", "badges?", "charts?", "maps?", "prices?", "totals?", "search", "filters?", "empty", "errors?", "loading", "steps?", "call-to-action", "cta", "contrast", "focal", "blocks?",
    "black", "white", "grey", "gray", "red", "green", "blue", "yellow", "orange", "purple", "violet", "pink", "brown", "beige", "cream", "terracotta", "navy", "teal", "gold", "amber",
    "boutons?", "liens?", "en-têtes?", "entêtes?", "pied", "barres?", "titres?", "listes?", "tableaux?", "tableau", "cartes?", "formulaires?", "champs?", "étiquettes?", "icônes?", "affiches?",
    "couleurs?", "palettes?", "fonds?", "dégradés?", "polices?", "grilles?", "colonnes?", "lignes?", "marges?", "bordures?", "ombres?", "blocs?", "panneaux?", "bandeaux?", "onglets?", "prix", "recherche", "filtres?", "vides?", "erreurs?", "étapes?", "chargement", "contraste",
    "noir", "blanc", "gris", "rouge", "vert", "bleu", "jaune", "violet", "rose", "brun", "crème", "doré",
  ].join("|")})(?!\\p{L})`,
  "iu",
);

const normal = (text: string) => text.toLowerCase().normalize("NFKC").replace(/[’']/g, "'").replace(/[\s.!…]+$/u, "").replace(/\s+/g, " ").trim();
const sentences = (reason: string) => reason.split(/(?<=[.!?…])\s+/).map(normal).filter(Boolean);

/** Whether a reason names something on the page: a word of it in quotation marks, a number, a colour, a part of it, a name, or many words of what it saw. */
function precise(reason: string): boolean {
  if (/["“”«»‘’]\s*\S[^"“”«»‘’]*["“”«»‘’]/u.test(reason) || /\d/.test(reason) || /#[0-9a-f]{3,8}\b/i.test(reason) || THINGS.test(reason)) return true;
  // A name of the page, « the Commandes table »: a capital word inside a sentence, not the first of a new one.
  const words = reason.trim().split(/\s+/);
  if (words.some((w, i) => i > 0 && !/[.!?…:]$/.test(words[i - 1]!) && /^\p{Lu}\p{Ll}{2,}/u.test(w))) return true;
  return words.length >= 14;
}

/** A reason that names nothing: every sentence of it a word such as « Fine », a single word, or nothing of the page in it. */
const thinReason = (reason: string) => sentences(reason).every((s) => GENERIC.test(s)) || reason.trim().split(/\s+/).length < 2 || !precise(reason);

const quote = (r: string) => `"${r.length > 80 ? `${r.slice(0, 79)}…` : r}"`;

/**
 * The votes too thin to count, each with why. A refused vote costs a voter relaunched, so
 * only what gives a lazy vote away refuses one: a vote that owns it did not look; one that
 * copies an earlier voter's reasons (half of its own or more, three at least); one sentence
 * pasted over half its verdicts or more (four at least); two reasons or more that name
 * nothing on the page, a third of the vote or more. A careful vote passes, terse or long,
 * in English or in French, a finding said on a few pages of many included.
 */
export function lazyVotes(votes: Vote[]): { voter: string; why: string }[] {
  const reasonsOf = (v: Vote) =>
    Object.values(v.pages && typeof v.pages === "object" ? v.pages : {}).flatMap((p) => Object.values(p && typeof p === "object" ? p : {}).map((verdict) => (typeof verdict?.reason === "string" ? verdict.reason.trim() : "")));
  const refused: { voter: string; why: string }[] = [];
  const ordered = [...votes].sort((a, b) => Number(a.voter) - Number(b.voter) || String(a.voter).localeCompare(String(b.voter)));
  ordered.forEach((vote, i) => {
    const reasons = reasonsOf(vote);
    if (!reasons.length) return;
    const blind = reasons.find((r) => BLIND.test(r));
    if (blind) return void refused.push({ voter: vote.voter, why: `says it did not look: ${quote(blind)}` });
    // Copied on an earlier voter's: what one judge read of another's vote is not a vote.
    for (const other of ordered.slice(0, i)) {
      const theirs = new Set(reasonsOf(other).map(normal));
      const copied = reasons.filter((r) => theirs.has(normal(r)));
      if (copied.length >= 3 && copied.length * 2 >= reasons.length) return void refused.push({ voter: vote.voter, why: `copies voter ${other.voter}'s reasons: ${copied.length} of ${reasons.length}, such as ${quote(copied[0]!)}` });
    }
    const counts = new Map<string, number>();
    for (const r of reasons) counts.set(normal(r), (counts.get(normal(r)) ?? 0) + 1);
    const [pasted, times] = [...counts].sort((a, b) => b[1] - a[1])[0]!;
    if (reasons.length >= 4 && times >= 3 && times * 2 >= reasons.length) return void refused.push({ voter: vote.voter, why: `gives the same reason to ${times} of ${reasons.length} verdicts: ${quote(reasons.find((r) => normal(r) === pasted)!)}` });
    const thin = reasons.filter(thinReason);
    if (thin.length >= 2 && thin.length * 3 >= reasons.length) refused.push({ voter: vote.voter, why: `${thin.length} of ${reasons.length} reasons name nothing on the page, such as ${thin.slice(0, 2).map(quote).join(" and ")}` });
  });
  return refused;
}

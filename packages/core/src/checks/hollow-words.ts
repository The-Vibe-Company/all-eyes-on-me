import type { Page } from "playwright";
import { matches, pageText } from "./text.js";
import type { Issue } from "./types.js";

/** The words of marketing that say nothing, in English and in French, whole. */
const HOLLOW = [
  /\brevolutioni[sz](?:e|es|ed|ing)\b/i,
  /\bsupercharg(?:e|es|ed|ing)\b/i,
  /\beffortless(?:ly)?\b/i,
  /\bseamless(?:ly)?\b/i,
  /\bgame[- ]chang(?:er|ers|ing)\b/i,
  /\bcutting[- ]edge\b/i,
  /\bnext-gen\b/i,
  /\bunleash(?:es|ed|ing)?\b/i,
  /\bunlock (?:your|the) (?:full )?(?:potential|power)\b/i,
  /\bempower(?:s|ing)?\b/i,
  /\bstreamlin(?:e|es|ed|ing)\b/i,
  /\belevate your\b/i,
  /\b(?:world|best[- ]in)[- ]class\b/i,
  /\bstate[- ]of[- ]the[- ]art\b/i,
  /\bsynerg(?:y|ies)\b/i,
  /\bskyrocket(?:s|ing)?\b/i,
  /\bto the next level\b/i,
  // The verbs, said to the reader: « révolutionnaire » in a history of 1789, a booster one opens, are not hollow.
  /\brévolutionn(?:er|ez|e|ent|ons)\b/iu,
  /\bsans effort\b/iu,
  /\ben toute simplicité(?!\p{L})/iu,
  /\b(?:boost|propuls|décupl)(?:ez|er|e) (?:vos|votre|ton|ta|tes)\b/iu,
  /\blibére[rz] (?:le |votre |tout votre |tout le )?potentiel\b/iu,
  /\bde nouvelle génération\b/iu,
  /(?<!\p{L})à la pointe de la technologie\b/iu,
  /\bsimplifiez-vous la vie\b/iu,
];

/**
 * No hollow word: « revolutionize », « seamless », « supercharge », « révolutionnez »,
 * « sans effort »… say nothing a reader can check. Read in what the page shows, never in
 * a name it gives, which may be a brand's. Said once per word.
 */
export async function checkHollowWords(page: Page): Promise<Issue[]> {
  return matches(await pageText(page), HOLLOW).map(({ element, found }) => ({
    element,
    message: `hollow words, "${found}": say plainly what the product does`,
  }));
}

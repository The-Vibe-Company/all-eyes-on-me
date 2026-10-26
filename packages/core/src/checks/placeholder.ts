import type { Page } from "playwright";
import { matches, pageText } from "./text.js";
import type { Issue } from "./types.js";

/** What a page shows when it was never filled in, or when a value is missing. */
const HOLES = [
  // A slot between brackets in capitals: two words or more, « [À DÉFINIR] », « [MONTANT €] », or one that names what to
  // write, « [PRIX] ». A tag such as « [PDF] », « [FR] », « [BETA] », a note in lower case or a number is not one.
  /\[(?=[^\]]*\p{Lu}{2})[\p{Lu}\d'’/.,:;€$%()+-]+(?: [\p{Lu}\d'’/.,:;€$%()+-]+)+\]/u,
  /\[(?:PRIX|NOM|PRÉNOM|DATE|ADRESSE|MONTANT|TITRE|TEXTE|IMAGE|PHOTO|LOGO|VILLE|EMAIL|TÉLÉPHONE|LIEN|PRICE|NAME|TITLE|TEXT|CITY|COMPANY|ADDRESS|PHONE|AMOUNT|LINK|PLACEHOLDER|INSERT)\]/u,
  /\[(?:insérer|inserer|insert|votre|vos|ton|ta|tes|your|nom|name|prénom|placeholder|à définir|a definir|à compléter|to be defined)\b[^\]]{0,40}\]/iu,
  // A template never rendered.
  /\{\{[^{}]{1,60}\}\}/,
  /\$\{[^{}]{1,60}\}/,
  /\blorem ipsum\b/i,
  // A note left for later; a column or a list named « TODO » is not one.
  /\b(?:TODO|FIXME)\b\s*:/,
  // A value the code did not have.
  /\b(?:undefined|NaN)\b/,
  /\[object Object\]/,
  /^null$/,
  // Digits to come, « XX,XX € », « XX:XX ».
  /\bX{2,}(?:[,.:h]X{2,})+\b/,
];

/**
 * No hole left unfilled: a slot between brackets, a template never rendered, lorem ipsum,
 * a TODO, a value missing (« undefined », « NaN »), in what the page shows, its title, the
 * hints of its fields, the choices of its menus and the alt of its images. Said once per
 * hole on the page, and once in its attributes.
 */
export async function checkPlaceholder(page: Page): Promise<Issue[]> {
  return matches(await pageText(page, { attributes: true }), HOLES).map(({ element, found }) => ({
    element,
    message: `a hole left unfilled, "${found}": write what it holds, with believable data from the product`,
  }));
}

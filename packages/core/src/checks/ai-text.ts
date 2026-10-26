import type { Page } from "playwright";
import { matches, pageText } from "./text.js";
import type { Issue } from "./types.js";

/** A sentence about the interface or the demo, which an AI writes and a product never does. */
const META = [
  // The demo, said on the page: a banner or a sentence that starts by saying so. A demo one books, or sample data one
  // downloads, is the product's own.
  /^(?:maquette|version|page|données|mode) (?:de )?démo(?:nstration)?\b/iu,
  /^(?:données|chiffres) (?:fictives|fictifs|factices)\b/iu,
  /^voici (?:ta|votre|la|une) (?:démo|maquette|démonstration)\b/iu,
  /^ceci est une? (?:démo|maquette|démonstration|prototype)\b/iu,
  /^this is a (?:demo|mock-?up|prototype|sample page)\b/i,
  /^(?:demo|sample|dummy|mock|fake) (?:data|content|mode|version)\b/i,
  /^here(?:'s|’s| is) your (?:demo|mock-?up)\b/i,
  /\bfor demo(?:nstration)? purposes\b/i,
  // The interface, explaining itself.
  /\b(?:ce|cet|cette|ces) (?:bouton|lien|section|écran|bloc|encart|champ|panneau|onglet|formulaire|module|espace|vue|widget)s? (?:vous |te )?(?:permet|permettent|sert|servent|présente|présentent|regroupe|regroupent|rassemble|rassemblent|centralise|centralisent)\b/iu,
  /\bthis (?:button|link|section|screen|panel|field|tab|form|view|widget|module) (?:lets|allows|helps|shows|displays|gathers|is where)\b/i,
  /\b(?:cliquez|clique|cliquer|click) (?:ici|here)\b/iu,
  /\b(?:ici|here),? (?:vous pouvez|tu peux|you can)\b/iu,
  /\butilisez (?:ce|cet|cette|le|la) (?:bouton|lien|champ|formulaire) (?:ci-dessous |ci-dessus )?pour\b/iu,
  /\buse (?:this|the) (?:button|link|field|form) (?:below |above )?to\b/i,
];

/**
 * No text about the interface or the demo: a sentence that says what a button or a
 * section is for, « click here », a banner saying it is a mockup or its data are made
 * up. Every text is the product's own. Said once per sentence.
 */
export async function checkAiText(page: Page): Promise<Issue[]> {
  return matches(await pageText(page), META, { oncePerSentence: true }).map(({ element, found }) => ({
    element,
    message: `text about the interface or the demo, not the product, "${found}": say what the product does, or nothing`,
  }));
}

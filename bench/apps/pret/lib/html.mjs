// Petit moteur de gabarits : html`…` échappe toute valeur insérée,
// sauf ce qui vient d'un autre html`…` ou de brut().
// Le texte écrit en dur dans les gabarits reçoit la typographie française
// (espaces insécables avant « ; ! ? : » et à l'intérieur des guillemets).

class Sur {
  constructor(texte) { this.texte = texte; }
  toString() { return this.texte; }
}

export const brut = (texte) => new Sur(String(texte));

const ENTITES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const echapper = (v) => String(v).replace(/[&<>"']/g, (c) => ENTITES[c]);

export function typo(texte) {
  return texte
    .replace(/ ([;!?])/g, ' $1')
    .replace(/ ([:»])/g, ' $1')
    .replace(/« /g, '« ')
    .replace(/(\d) (?=(?:V|W|kg|cm|m|m²|°C|h|bars|jours?|places|pots|boules|personnes)\b|°C|m²)/g, '$1 ');
}

function rendre(valeur) {
  if (valeur === null || valeur === undefined || valeur === false) return '';
  if (Array.isArray(valeur)) return valeur.map(rendre).join('');
  if (valeur instanceof Sur) return valeur.texte;
  return echapper(valeur);
}

const cache = new WeakMap();
export function html(chaines, ...valeurs) {
  let fixes = cache.get(chaines);
  if (!fixes) {
    fixes = chaines.map(typo);
    cache.set(chaines, fixes);
  }
  let sortie = fixes[0];
  valeurs.forEach((v, i) => { sortie += rendre(v) + fixes[i + 1]; });
  return new Sur(sortie);
}

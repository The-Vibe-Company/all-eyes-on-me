// Dates au format ISO « AAAA-MM-JJ », calculées sur le fuseau de Paris.
// Toutes les comparaisons se font sur ces chaînes : elles se trient dans l'ordre.

const FUSEAU = 'Europe/Paris';
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

export function aujourdhui(maintenant = new Date()) {
  const morceaux = new Intl.DateTimeFormat('en-GB', {
    timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(maintenant);
  const p = Object.fromEntries(morceaux.map((m) => [m.type, m.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

const versDate = (iso) => new Date(`${iso}T00:00:00Z`);

export function ajouterJours(iso, n) {
  const d = versDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const ecartJours = (a, b) => Math.round((versDate(b) - versDate(a)) / 86_400_000);

export function estDateIso(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = versDate(s);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** 0 = dimanche … 6 = samedi */
export const jourSemaine = (iso) => versDate(iso).getUTCDay();

const numeroJour = (n) => (n === 1 ? '1er' : String(n));

export function dateLongue(iso) {
  const d = versDate(iso);
  return `${JOURS[d.getUTCDay()]} ${numeroJour(d.getUTCDate())} ${MOIS[d.getUTCMonth()]}`;
}

export function dateCourte(iso) {
  const d = versDate(iso);
  return `${numeroJour(d.getUTCDate())} ${MOIS_COURTS[d.getUTCMonth()]}`;
}

export function moisCourt(iso) {
  return MOIS_COURTS[versDate(iso).getUTCMonth()];
}

export function numeroDuJour(iso) {
  return versDate(iso).getUTCDate();
}

/** « du lundi 6 au jeudi 9 octobre », « du mardi 30 septembre au jeudi 2 octobre », « le vendredi 3 octobre » */
export function periode(debut, fin) {
  if (debut === fin) return `le ${dateLongue(debut)}`;
  const a = versDate(debut);
  const b = versDate(fin);
  if (a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()) {
    return `du ${JOURS[a.getUTCDay()]} ${numeroJour(a.getUTCDate())} au ${dateLongue(fin)}`;
  }
  return `du ${dateLongue(debut)} au ${dateLongue(fin)}`;
}

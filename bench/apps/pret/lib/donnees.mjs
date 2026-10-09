// Lecture et écriture des données de l'application.
//
// data/initial.json : l'état de départ. Les dates y sont écrites en décalage
//   de jours par rapport au jour de la remise à zéro (-2 = avant-hier, 3 = dans
//   trois jours), pour que la démo reste vivante quel que soit le jour.
// data/donnees.json : l'état courant, réécrit à chaque emprunt, retour ou
//   proposition. Créé à partir de initial.json s'il n'existe pas.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ajouterJours, aujourdhui } from './dates.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
export const FICHIER_INITIAL = join(RACINE, 'data', 'initial.json');
export const FICHIER_DONNEES = process.env.PRET_DONNEES
  ? resolve(RACINE, process.env.PRET_DONNEES)
  : join(RACINE, 'data', 'donnees.json');

export function construireDonneesInitiales(jour = aujourdhui()) {
  const { _aLire, ...graine } = JSON.parse(readFileSync(FICHIER_INITIAL, 'utf8'));
  const date = (valeur) => (typeof valeur === 'number' ? ajouterJours(jour, valeur) : valeur);
  return {
    ...graine,
    objets: graine.objets.map((o) => ({ ...o, ajouteLe: date(o.ajouteLe) })),
    emprunts: graine.emprunts.map((e) => {
      const emprunt = { ...e, debut: date(e.debut), fin: date(e.fin), creeLe: date(e.creeLe) };
      if (e.renduLe !== undefined) emprunt.renduLe = date(e.renduLe);
      if (e.annuleLe !== undefined) emprunt.annuleLe = date(e.annuleLe);
      return emprunt;
    }),
  };
}

export function ecrire(donnees) {
  const temporaire = `${FICHIER_DONNEES}.tmp`;
  writeFileSync(temporaire, `${JSON.stringify(donnees, null, 2)}\n`);
  renameSync(temporaire, FICHIER_DONNEES);
}

export function reinitialiser() {
  const donnees = construireDonneesInitiales();
  ecrire(donnees);
  return donnees;
}

/** Relu à chaque requête : le fichier est petit, et `node reset.mjs` prend effet sans redémarrer. */
export function lire() {
  if (!existsSync(FICHIER_DONNEES)) return reinitialiser();
  return JSON.parse(readFileSync(FICHIER_DONNEES, 'utf8'));
}

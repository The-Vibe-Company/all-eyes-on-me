// Règles du prêt : disponibilité d'un objet, statut d'un emprunt, validation des formulaires.

import { randomBytes } from 'node:crypto';
import { ajouterJours, ecartJours, estDateIso, periode } from './dates.mjs';

export const ETATS = [
  { id: 'comme-neuf', libelle: 'Comme neuf' },
  { id: 'tres-bon', libelle: 'Très bon état' },
  { id: 'bon', libelle: 'Bon état' },
  { id: 'use', libelle: 'Usé, mais fonctionne' },
];
export const libelleEtat = (id) => ETATS.find((e) => e.id === id)?.libelle ?? id;

export const DUREE_MAX_DEFAUT = 7;
export const RESERVATION_MAX_AVANCE = 60; // jours

/** en-cours | a-venir | en-retard | rendu | annule */
export function statutEmprunt(emprunt, jour) {
  if (emprunt.statut === 'rendu' || emprunt.statut === 'annule') return emprunt.statut;
  if (jour < emprunt.debut) return 'a-venir';
  if (jour > emprunt.fin) return 'en-retard';
  return 'en-cours';
}

export const LIBELLES_STATUT = {
  'en-cours': 'En cours',
  'a-venir': 'À venir',
  'en-retard': 'En retard',
  rendu: 'Rendu',
  annule: 'Annulé',
};

export function empruntsActifs(objetId, emprunts) {
  return emprunts
    .filter((e) => e.objet === objetId && e.statut === 'actif')
    .sort((a, b) => a.debut.localeCompare(b.debut));
}

const chevauche = (a, b) => a.debut <= b.fin && b.debut <= a.fin;

/**
 * etat : « disponible » (libre aujourd'hui), « prete » (pris aujourd'hui, libre à `libreLe`)
 * ou « attente-retour » (un emprunt a dépassé sa date de fin sans être rendu).
 */
export function disponibilite(objet, emprunts, jour) {
  const actifs = empruntsActifs(objet.id, emprunts);
  const enRetard = actifs.find((e) => e.fin < jour);
  if (enRetard) return { etat: 'attente-retour', enRetard, actifs };
  let libreLe = jour;
  let enCours = null;
  for (const e of actifs) {
    if (e.debut <= libreLe && e.fin >= libreLe) {
      if (!enCours) enCours = e;
      libreLe = ajouterJours(e.fin, 1);
    }
  }
  const aVenir = actifs.filter((e) => e.debut > jour);
  return { etat: libreLe === jour ? 'disponible' : 'prete', libreLe, enCours, aVenir, actifs };
}

export function jourReserve(iso, actifs) {
  return actifs.some((e) => e.debut <= iso && iso <= e.fin);
}

export function validerEmprunt({ objet, preteur, moi, debut, fin, emprunts, jour }) {
  const erreurs = {};
  if (objet.preteur === moi.id) {
    erreurs.general = 'Vous ne pouvez pas emprunter un objet que vous prêtez vous-même.';
    return erreurs;
  }
  const dureeMax = objet.dureeMax ?? DUREE_MAX_DEFAUT;

  if (!estDateIso(debut)) erreurs.debut = 'Indiquez le jour où vous venez chercher l’objet.';
  else if (debut < jour) erreurs.debut = 'Ce jour est déjà passé : choisissez aujourd’hui ou plus tard.';
  else if (ecartJours(jour, debut) > RESERVATION_MAX_AVANCE) erreurs.debut = 'On réserve au plus deux mois à l’avance.';

  if (!estDateIso(fin)) erreurs.fin = 'Indiquez le jour où vous rendez l’objet.';
  else if (!erreurs.debut && fin < debut) erreurs.fin = 'Le retour doit tomber le même jour que le début, ou après.';
  else if (!erreurs.debut && ecartJours(debut, fin) + 1 > dureeMax) {
    erreurs.fin = `${preteur.prenom} prête cet objet ${dureeMax} jours au plus. Rapprochez la date de retour.`;
  }

  if (!erreurs.debut && !erreurs.fin) {
    const conflit = empruntsActifs(objet.id, emprunts).find((e) => chevauche(e, { debut, fin }));
    if (conflit) {
      erreurs.general = `L’objet est déjà réservé ${periode(conflit.debut, conflit.fin)}. Choisissez d’autres dates.`;
    }
  }
  return erreurs;
}

export function validerProposition(valeurs, categories) {
  const erreurs = {};
  const nom = valeurs.nom.trim();
  const description = valeurs.description.trim();
  if (nom.length < 3) erreurs.nom = 'Donnez un nom à l’objet (3 caractères au moins).';
  else if (nom.length > 60) erreurs.nom = 'Le nom fait 60 caractères au plus.';
  if (!categories.some((c) => c.id === valeurs.categorie)) erreurs.categorie = 'Choisissez une catégorie.';
  if (description.length < 20) erreurs.description = 'Décrivez l’objet en une ou deux phrases (20 caractères au moins).';
  else if (description.length > 600) erreurs.description = 'La description fait 600 caractères au plus.';
  if (!ETATS.some((e) => e.id === valeurs.etat)) erreurs.etat = 'Indiquez l’état de l’objet.';
  return erreurs;
}

export function identifiantObjet(nom, objets) {
  const base = nom
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 40) || 'objet';
  let id = base;
  for (let n = 2; objets.some((o) => o.id === id); n += 1) id = `${base}-${n}`;
  return id;
}

export const identifiantEmprunt = () => `e-${randomBytes(4).toString('hex')}`;


// Remet les données du Prêt dans leur état de départ : `node reset.mjs`.
// Les emprunts et propositions faits depuis sont effacés ; les dates de la démo
// sont recalculées à partir d'aujourd'hui. Pas besoin de redémarrer le serveur.

import { FICHIER_DONNEES, reinitialiser } from './lib/donnees.mjs';

const donnees = reinitialiser();
console.log(`Données remises à zéro : ${donnees.objets.length} objets, ${donnees.voisins.length} voisins, ${donnees.emprunts.length} emprunts.`);
console.log(`Fichier : ${FICHIER_DONNEES}`);

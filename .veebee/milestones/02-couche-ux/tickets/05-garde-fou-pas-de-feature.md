---
id: 05
title: Le garde-fou « pas de feature »
milestone: 02-couche-ux
depends_on: [02]
design: null
status: done
tracker: { tool: github, id: 34, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/34 }
---

## Ce que l'utilisateur fait
Il laisse AEOM refaire ses parcours en sachant qu'aucune feature n'apparaîtra en douce : pas de nouvelle donnée, pas de logique métier, pas d'appel serveur, sauf s'il le demande très explicitement.

## Ce qu'il voit
Pour chaque parcours, la liste des appels que l'app fait à son serveur. Quand un changement en ajoute un, ou touche aux fichiers de données ou de logique, un refus qui dit lequel, sur quel parcours.

## C'est fini quand
- [x] Pendant chaque parcours, AEOM note les appels que l'app fait à son serveur (méthode et chemin) dans le rapport du parcours
- [x] Une version qui fait un appel que l'avant ne faisait pas est refusée, comme une version qui envoie à un appel existant des champs nouveaux (noms des paramètres et du corps, jamais leurs valeurs, qui n'apparaissent dans aucun rapport) ; AEOM dit lequel et sur quel parcours
- [x] Une version qui touche aux fichiers de données ou de logique listés dans la config (schéma, migrations, routes d'API) est refusée de même
- [x] Changer l'ordre des étapes, un lien, un texte, un état ou regrouper des écrans passe
- [x] Sur l'app de démo, une fausse feature (un formulaire qui poste vers une nouvelle route) est refusée ; mettre « Voir mes commandes » dans le menu passe
- [x] Avec une demande très explicite (`/aeom --ux --feature "<ce qui est demandé>"`), ce qui la sert passe, y compris un nouvel appel ou un fichier protégé qu'elle exige ; tout le reste est toujours refusé, et le run dit ce qu'il a laissé passer et pourquoi

## Comment
- Les appels se lisent pendant le rejeu de 02 (les requêtes réseau de Playwright), sans compter les fichiers statiques.
- Les fichiers protégés se déclarent dans `.aeom/config.json` ; pour l'app de démo, `examples/ugly-app/server.mjs`.
- Ajouter **Garde-fou** (feature guard) à `CONTEXT.md`.

## Hors ticket
- Les workers qui refont les parcours : 06.

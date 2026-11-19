---
id: 08
title: Chaque écart du code s'affiche à sa ligne dans la PR, avec le token le plus proche
milestone: 04-garder-a-chaque-pr
depends_on: [02, 07]
design: null
status: done
tracker: { tool: github, id: 196, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/196 }
---

## Ce que l'utilisateur fait
Il ouvre une PR, le check `aeom` échoue, et il veut corriger (lui ou l'agent qui a écrit la PR).

## Ce qu'il voit aujourd'hui
Les écarts sont dans le résumé du check : il faut l'ouvrir, puis retrouver chaque fichier et chaque ligne. Et pour une couleur ou une valeur inconnue, la relecture dit seulement « #7c3aed is not a colour of the standard », sans dire quoi mettre à la place.

## Ce qu'il doit voir
- Dans l'onglet « Files changed » de la PR, chaque écart du code affiché à sa ligne, sans token ni modèle.
- Pour une couleur, une taille, un espace ou un arrondi qui n'est pas dans le standard, le token le plus proche : « #7c3aed is not a colour of the standard: the nearest is --accent (#6d28d9) ».

## C'est fini quand
- [ ] Sur GitHub Actions (`GITHUB_ACTIONS=true`), `aeom review` écrit chaque écart du code en annotation (`::error file=…,line=…::…`), le chemin pris depuis la racine du dépôt, même quand l'app vit dans un sous-dossier ; hors de GitHub, rien ne change dans le terminal
- [ ] GitHub n'affiche que 10 annotations d'erreur par étape : au-delà, la dernière dit combien restent dans le résumé
- [ ] Une couleur inconnue nomme la couleur du standard la plus proche (distance perceptuelle), avec sa valeur ; une taille, un espace ou un arrondi inconnu nomme le token du même genre le plus proche
- [ ] Les messages restent tels quels quand le standard n'a aucun token du genre
- [ ] Des tests dans `packages/core/src/review/review.test.ts` et `packages/cli/src/commands/review.test.ts`

## Hors ticket
- Le token le plus proche pour une couleur de la palette Tailwind (`bg-purple-600`) : la relecture ne connaît pas ses valeurs.
- Corriger les écarts à la place de la personne.

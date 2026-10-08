---
id: 07
title: Le cliquet des parcours
milestone: 02-couche-ux
depends_on: [06]
design: null
tracker: { tool: github, id: 36, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/36 }
---

## Ce que l'utilisateur fait
Il retrouve à la fin du run des parcours qui ne peuvent qu'être meilleurs : un parcours refait que le juge ne préfère pas est rejeté.

## Ce qu'il voit
Pour chaque parcours, l'avant et l'après en deux bandes de captures, le nombre d'étapes avant et après, les constats levés, et pour ceux rejetés, pourquoi.

## C'est fini quand
- [ ] Pour chaque parcours, trois juges comparent l'ancien et le nouveau côte à côte et choisissent ; la majorité décide
- [ ] Un parcours n'est gardé que si le juge préfère le nouveau, s'il se rejoue sans casser et s'il passe le garde-fou ; sinon l'ancien revient, et le run dit pourquoi
- [ ] La fin du run montre chaque parcours avant et après, avec le nombre d'étapes ; un constat n'y est dit levé que si la critique (04), refaite sur le nouveau parcours, ne le trouve plus, et ceux qui restent sont listés
- [ ] Tout ce que le run garde est sur une branche `aeom/<run>`, jamais sur la branche de l'utilisateur
- [ ] Un run sans constat ne change rien et le dit

## Comment
- La comparaison par paires existe pour les directions (`packages/core/src/directions/tournament.ts`, trois votes par duel) ; ici chaque parcours est un seul duel, l'avant contre l'après.
- `aeom snapshot` et `aeom compare` (`packages/core/src/run/`) gardent l'avant et comparent ; ils apprennent les parcours.

## Hors ticket
- Le pilote sur un vrai produit : 08.

---
id: 17
title: aeom judge refuse ses deux étapes en une fois, et --by-page donne la capture de chaque étape
milestone: 03-la-commande-unique
depends_on: [13]
design: null
tracker: { tool: github, id: 98, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/98 }
---

## Ce que l'utilisateur fait
Rien de plus : deux défauts vus pendant le run de démo du ticket 15.

## Ce qu'il voit
`aeom judge --changed-since <snapshot> --to-confirm` refuse et dit l'ordre des deux étapes, au lieu d'ignorer `--to-confirm` sans rien dire. `aeom journey --by-page` donne, pour chaque problème rangé sur une page, la capture de l'étape où il se voit, que le coordinateur passe au worker de la page.

## C'est fini quand
- [ ] Les deux options ensemble sortent en erreur, avec l'ordre à suivre
- [ ] Chaque problème de `--by-page` (texte et `--json`) porte le chemin de la capture de son étape, à la plus grande largeur qui l'a atteinte ; une cassure, celle de l'étape où le parcours s'est arrêté
- [ ] Un problème sans étape n'a pas de capture

## Comment
`packages/cli/src/commands/judge.ts`, `packages/core/src/journey/by-page.ts`, `packages/cli/src/commands/journey.ts`.

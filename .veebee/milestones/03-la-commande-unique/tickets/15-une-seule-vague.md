---
id: 15
title: Une seule vague, les pages corrigent aussi leurs parcours
milestone: 03-la-commande-unique
depends_on: [13, 14]
design: null
status: done
tracker: { tool: github, id: 94, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/94 }
---

## Ce que l'utilisateur fait
Il lance `/aeom redo` : le run coûte environ un tiers de tokens en moins et une demi-heure de moins quand aucun parcours ne casse.

## Ce qu'il voit
Chaque worker de page reçoit, en plus des échecs de sa page, les problèmes de parcours qui tombent dessus (`aeom journey --by-page`). Un problème qui demande un fichier partagé devient un candidat au kit, appliqué par la promotion. Après la vague : une seule mesure des pages, un rejeu, une seule critique des parcours, puis le cliquet sans duel (`--by-critique`). Une page qui fait reculer un parcours est remise comme une page qui n'est pas meilleure. La vague des parcours à part ne part plus que pour un parcours qui casse encore, et seulement pour lui.

## C'est fini quand
- [ ] Le skill dit tout cela à la place des étapes 6 et 7 actuelles de « Without an option », sans contradiction avec la section 2c (qui reste pour `--ux`)
- [ ] `aeom estimate` compte la critique des parcours dans la vague des pages, et la vague des parcours seulement pour les parcours qui cassent ; pour 8 écrans et 4 parcours, le total sans parcours qui casse baisse d'au moins 1 M de tokens
- [ ] Un run réel sur l'app de démo va au bout avec une seule vague, ce qu'il garde est dans la PR, et la page de résultat montre les parcours avant/après

## Comment
`skills/aeom/SKILL.md` (« Without an option » étapes 5 à 7, section 4, section 5), `packages/core/src/run/estimate.ts` et ses tests.

## Hors ticket
Les workers en Sonnet : ticket 16.

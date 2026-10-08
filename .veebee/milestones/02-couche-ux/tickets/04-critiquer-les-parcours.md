---
id: 04
title: Le juge critique chaque parcours étape par étape
milestone: 02-couche-ux
depends_on: [02]
design: null
tracker: { tool: github, id: 33, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/33 }
---

## Ce que l'utilisateur fait
Il voit ce qui ne va pas dans chacun de ses parcours, dit comme le vivrait quelqu'un qui utilise l'app, avec la capture de l'étape en cause.

## Ce qu'il voit
Par parcours : les principes de parcours qui passent et qui échouent, et des constats du type « pour voir ses commandes, il faut descendre tout en bas de la page produits », chacun avec sa capture.

## C'est fini quand
- [ ] Les principes de parcours sont du texte dans le repo, à côté des principes de base, et `aeom principles` les affiche
- [ ] Trois juges votent sur chaque parcours (ses captures dans l'ordre), principe par principe ; `aeom judge` compte à la majorité, une égalité échoue
- [ ] Chaque constat nomme le parcours, l'étape et sa capture, et dit ce que vit l'utilisateur
- [ ] Sur l'app de démo, le parcours « voir mes commandes » échoue sur au moins un principe
- [ ] Un parcours qui casse au rejeu (02) est un constat en soi, pas une erreur du juge
- [ ] Pendant le run, AEOM montre chaque parcours critiqué avec ses constats

## Comment
- Les principes de base sont dans `principles/base.md`, lus par `loadPrinciples` (`packages/core/src/judge/principles.ts`). Les principes de parcours suivent le même format, par exemple : la boucle se lance depuis l'accueil, chaque étape dit ce qui vient ensuite, une action finie montre son résultat, pas d'impasse, les mots de l'utilisateur, une première visite sans pile d'obstacles.
- Le compte des votes réutilise `tally` (`packages/core/src/judge/tally.ts`) avec un parcours à la place d'une page ; le brief des juges vit dans `skills/aeom-judge/SKILL.md`.

## Hors ticket
- Corriger les parcours : 06.

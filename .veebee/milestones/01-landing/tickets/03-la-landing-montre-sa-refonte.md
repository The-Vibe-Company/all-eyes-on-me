---
id: 03
title: La landing montre son propre avant / après et le tournoi qui l'a choisie
milestone: 01-landing
depends_on: [02]
design: null
tracker: { tool: github, id: 16, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/16 }
---

## Ce que l'utilisateur fait
Il voit comment AEOM a refait la page qu'il est en train de lire.

## Ce qu'il voit
La V0 brute et la page actuelle côte à côte, la planche des 6 directions, et le tableau du tournoi avec la raison de chaque duel.

## C'est fini quand
- [ ] Un visiteur voit la V0 brute et la landing actuelle côte à côte
- [ ] Il voit les 6 directions et le tableau du tournoi, avec la raison de chaque duel
- [ ] Tout vient du vrai run gardé dans le repo, rien n'est refait à la main
- [ ] Sur téléphone, les images se lisent sans défilement horizontal

## Comment
- Une section de la page lit `site/run/tournament.json` et les captures du run de 02.

## Hors ticket
- La mise en ligne : 05.

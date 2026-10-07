---
id: 02
title: AEOM refait sa propre landing : 6 directions, un tournoi, la gagnante appliquée
milestone: 01-landing
depends_on: [01]
design: null
status: done
tracker: { tool: github, id: 15, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/15 }
---

## Ce que l'utilisateur fait
Il ouvre la landing et voit une page conçue par AEOM, pas par un humain.

## Ce qu'il voit
La landing refaite dans la direction gagnante du tournoi, avec le même contenu que la V0.

## C'est fini quand
- [ ] 6 directions construites en vrai code sur la landing, à partir de sources du monde de ceux qui font du front, aucune dans la liste noire
- [ ] La planche des 6 et le tableau du tournoi (votes et raisons) sont gardés dans le repo
- [ ] La gagnante devient la landing : les 4 contrôles passent à 390 et 1280 px
- [ ] La page avant et après est capturée et gardée

## Comment
- `/aeom --directions` sur `site/`, en suivant `skills/aeom/SKILL.md` et `skills/aeom/directions.md`.
- Le run est gardé sous `site/run/` (planche, captures, `tournament.json`) pour que 03 le montre.

## Hors ticket
- Montrer l'avant / après sur la page : 03.

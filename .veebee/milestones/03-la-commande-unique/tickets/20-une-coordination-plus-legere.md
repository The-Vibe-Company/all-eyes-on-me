---
id: 20
title: Une coordination plus légère
milestone: 03-la-commande-unique
depends_on: [18, 19]
design: null
tracker: { tool: github, id: 101, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/101 }
---

## Ce que l'utilisateur fait
Il lance `/aeom redo` : la session qui coordonne lit moins, donc coûte moins.

## Ce qu'il voit
Le skill est découpé par phase : `SKILL.md` garde le déroulé et renvoie à un fichier par phase (directions, vague, mesure, fin), lu seulement au moment d'y entrer. Chaque agent écrit son résultat dans un fichier du run et ne rend qu'une ligne.

## C'est fini quand
- [ ] `SKILL.md` fait moins de la moitié de sa taille d'aujourd'hui, et chaque phase est dans son fichier
- [ ] Chaque consigne d'agent finit par « écris ton rapport dans <fichier>, et réponds en une ligne »
- [ ] Un run de démo va au bout comme avant

## Comment
`skills/aeom/`.

---
id: 27
title: Ce qu'on touche et ce qu'on lit, mesuré
milestone: 03-la-commande-unique
depends_on: [26]
design: null
status: done
tracker: { tool: github, id: 117, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/117 }
---

## Ce que l'utilisateur fait
Il lance `/aeom judge` : AEOM mesure aussi ce qu'on touche du doigt et ce qu'on lit.

## Ce qu'il voit
« tap-size: link "Aide" is 18×20 px, too small to tap », « font-size: input "Email" is 14 px: the phone zooms in when you type », « line-length: p "Nos lampes…" holds 120 characters a line », « zoom: the page forbids zooming ».

## C'est fini quand
- [ ] `tap-size` : sur téléphone, un bouton ou un lien de moins de 44×44 px est signalé ; un lien au milieu d'une phrase ne l'est pas
- [ ] `font-size` : un texte sous 12 px est signalé ; sur téléphone, un champ sous 16 px aussi
- [ ] `line-length` : un paragraphe de plus de 90 caractères par ligne, sur trois lignes ou plus, est signalé
- [ ] `zoom` : une page qui bloque le zoom, ou sans balise viewport quand le front est jugé sur téléphone, est signalée
- [ ] Chaque check respecte `"except"`

## Hors ticket
- Le header et les textes qui débordent : ticket 26. Images, noms, focus, sauts : ticket 28.

---
id: 28
title: Ce qu'on ne voit pas tout de suite, mesuré
milestone: 03-la-commande-unique
depends_on: [26]
design: null
status: done
tracker: { tool: github, id: 118, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/118 }
---

## Ce que l'utilisateur fait
Il lance `/aeom judge` : AEOM mesure aussi ce qu'une capture ne montre pas.

## Ce qu'il voit
« images: img "hero.jpg" does not load », « images: img "lampe.jpg" is stretched (4:3 shown as 16:9) », « labels: button with no name (an icon alone) », « focus: link "Produits" shows nothing when it has the keyboard focus », « layout-shift: the page moves while it loads (0.24) ».

## C'est fini quand
- [ ] `images` : une image qui ne charge pas, ou déformée (étirée ou écrasée), est signalée
- [ ] `labels` : un bouton ou un lien sans nom, un champ sans libellé, une image sans texte alternatif (une image décorative `alt=""` passe) est signalé
- [ ] `focus` : un élément atteint au clavier qui ne montre rien quand il a le focus est signalé
- [ ] `layout-shift` : une page qui bouge pendant qu'elle charge (décalage cumulé au-dessus de 0,1) est signalée
- [ ] Chaque check respecte `"except"`

## Hors ticket
- Le header et les textes : ticket 26. Toucher et lire : ticket 27.

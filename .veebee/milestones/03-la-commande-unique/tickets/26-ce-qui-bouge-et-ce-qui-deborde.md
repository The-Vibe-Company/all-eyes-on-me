---
id: 26
title: Ce qui bouge et ce qui déborde, mesuré
milestone: 03-la-commande-unique
depends_on: []
design: null
status: done
tracker: { tool: github, id: 116, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/116 }
---

## Ce que l'utilisateur fait
Il lance `/aeom judge` : AEOM mesure, en plus du curseur, du défilement horizontal, du contraste et de la console, que le header reste là quand on scrolle et que les textes tiennent dans leurs boîtes.

## Ce qu'il voit
De nouvelles lignes dans le verdict, écran par écran et largeur par largeur : « header: the header leaves the screen when you scroll », « wrap: button "Ajouter au panier" goes onto 2 lines », « uneven: the cards of one row are 240 to 268 px tall: h3 "Lampe de chevet en laiton…" takes 3 lines where the others take 1 », « clipped: p.desc is cut by its box with no ellipsis ».

## C'est fini quand
- [ ] `header` : un header qui quitte l'écran quand on descend d'un écran et demi et ne revient pas quand on remonte un peu est signalé ; un header qui se cache en descendant et revient en remontant passe ; sur téléphone, un header qui reste mais prend plus d'un quart de l'écran est signalé ; une page trop courte pour défiler, ou sans header, n'est pas jugée
- [ ] `wrap` : un bouton, un lien de navigation, un onglet ou une pastille dont le libellé passe sur deux lignes est signalé
- [ ] `uneven` : des éléments répétés d'une même rangée (cartes, lignes) de hauteurs différentes parce qu'un texte passe à la ligne sont signalés, avec le texte en cause, pour qu'il soit coupé avec une ellipse
- [ ] `clipped` : un texte coupé par sa boîte sans ellipse, ou un mot qui sort de sa boîte, est signalé
- [ ] `"except": { "header": ["/"] }` dans la config retire un check d'une page ; un nom de check inconnu est refusé
- [ ] Les textes qui disent « quatre checks » (README, landing) disent le nouveau compte

## Hors ticket
- Cibles tactiles, taille de texte, longueur de ligne, zoom : ticket 27.
- Images, noms accessibles, focus, sauts de mise en page : ticket 28.

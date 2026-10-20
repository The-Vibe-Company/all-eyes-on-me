---
id: 05
title: /aeom directions propose trois directions en maquettes, sur un produit existant, un prompt ou un cahier des charges, sans rien toucher
milestone: 05-construire
depends_on: []
design: null
tracker: { tool: github, id: 144, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/144 }
---

## Ce que l'utilisateur fait
Il tape `/aeom directions` dans un projet qui a déjà un front, ou `/aeom directions "une phrase"`, ou `/aeom directions cahier.md`. Il voit trois directions artistiques en maquettes, choisit celle qui lui parle, ou aucune. Plus tard, s'il le décide, `/aeom redo` ou `/aeom build --from-scratch` construit sur ce choix.

## Ce qu'il voit
Une planche : le front tel qu'il est en premier (quand il existe), puis chaque direction sur deux ou trois écrans, avec sa phrase, ce que ses contrôles trouvent, et la remarque d'un juge à côté. Puis la question : laquelle, ou aucune.

## C'est fini quand
- [ ] `/aeom directions` sans source part du produit du dossier. Il lit sa fiche produit (ou l'écrit, sans parcours ni juges), capture deux ou trois de ses vrais écrans, et chaque direction les redessine en maquette HTML/CSS avec leur vrai contenu, sans ajouter ni retirer de feature
- [ ] `/aeom directions "une phrase"` ou `/aeom directions prompt.md` part d'un prompt, comme `/aeom --depuis` aujourd'hui
- [ ] `/aeom directions cahier.md` part d'un cahier des charges : il en tire la fiche produit, puis les directions
- [ ] Rien dans le projet ne change : pas de branche, pas de worktree, pas de commit. Seuls `.aeom/direction/` (le choix) et `.aeom/product.md` (s'il l'a écrit) apparaissent
- [ ] Toutes les directions construites sont montrées : un juge peut dire ce qu'il voit à côté d'une direction, il n'en écarte aucune. Le redo cesse aussi d'écarter des directions avant que la personne choisisse
- [ ] Le coût est annoncé avant (≈ 7 $ au prix de l'API pour trois directions)
- [ ] Le choix est gardé dans `.aeom/direction/` (les pages de la maquette et ce qui la décrit, sans image). `/aeom redo` construit sur lui au lieu de tirer de nouvelles directions, et `/aeom build --from-scratch` aussi ; `aeom direction drop` l'oublie
- [ ] `/aeom --depuis` disparaît des pages : `/aeom directions` le remplace
- [ ] La landing présente `/aeom directions`

## Les règles
- « Non, n'écarte rien, c'est à l'utilisateur de choisir » (Antoine, 16 octobre).
- AEOM ne construit aucune feature sans demande explicite.

## Hors ticket
- La maquette complète sur la direction choisie : #125.

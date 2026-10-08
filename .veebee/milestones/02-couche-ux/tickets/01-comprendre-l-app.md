---
id: 01
title: /aeom --ux comprend seul l'app de démo et écrit .aeom/product.md
milestone: 02-couche-ux
depends_on: []
design: null
status: done
tracker: { tool: github, id: 30, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/30 }
---

## Ce que l'utilisateur fait
Il lance `/aeom --ux` sur un projet et, sans répondre à rien, retrouve dans `.aeom/product.md` ce qu'est son app : à quoi elle sert, pour qui, sa boucle, ses parcours clés.

## Ce qu'il voit
Pendant le run, les captures des écrans qu'AEOM visite. À la fin, `.aeom/product.md` : un court texte en quatre parties (à quoi sert l'app, pour qui, la boucle principale, 3 à 5 parcours clés), chaque parcours écrit comme une suite d'étapes.

## C'est fini quand
- [x] Sur l'app de démo, `/aeom --ux` écrit `.aeom/product.md` sans poser de question : à quoi elle sert, pour qui, sa boucle principale, 3 à 5 parcours clés
- [x] Chaque parcours est une suite d'étapes qui nomment des écrans et des actions qui existent vraiment : on peut le refaire à la main en suivant le fichier
- [x] Chaque affirmation dit d'où elle vient (un écran, un fichier du code) ; ce qu'AEOM suppose sans l'avoir vu est marqué « à confirmer »
- [x] Pendant l'exploration, AEOM montre les captures des écrans qu'il visite
- [x] Un second run part du `product.md` existant : ce que l'utilisateur y a corrigé reste tel quel, AEOM ajoute ce qu'il a appris et dit ce qui a changé
- [x] L'app ne démarre pas : AEOM s'arrête, dit pourquoi, et n'écrit pas de `product.md` à moitié
- [x] Rien d'autre que `.aeom/` ne change dans le projet

## Comment
- Un mode `--ux` dans `skills/aeom/SKILL.md`, à côté de `--directions`. Le coordinateur lit le code (routes, écrans, données affichées), puis visite l'app avec `aeom capture` et ses captures.
- L'app de démo est `examples/ugly-app/` : une boutique en quatre pages, avec un lien cassé (`/aide`) et « Voir mes commandes » caché en bas des produits.
- Ajouter **Parcours** (journey) et **Fiche produit** (`product.md`) à `CONTEXT.md`.

## Hors ticket
- Rejouer les parcours et en capturer chaque étape : 02.
- Une app derrière un login : 03.
- Critiquer les parcours : 04.

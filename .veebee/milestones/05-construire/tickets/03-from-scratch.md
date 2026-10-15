---
id: 03
title: Une maquette from scratch, depuis un cahier des charges ou un prompt
milestone: 05-construire
depends_on: [01]
design: null
status: done
tracker: { tool: github, id: 67, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/67 }
---

## Ce que l'utilisateur fait
Pour un produit qui n'a pas encore de front, il donne à AEOM son cahier des charges, ou une phrase, et son API s'il en a une ; AEOM rédige la fiche produit, lui fait choisir une DA, écrit le standard et monte la maquette des écrans de ses parcours clés.

## Ce qu'il voit
La fiche produit rédigée, ce que le run va coûter, les trois directions tirées du produit et celle qu'il choisit, le standard écrit, puis chaque parcours clé construit et rejoué jusqu'au bout, dans la page de résultat.

## C'est fini quand
- [ ] Sans front, `/aeom build --from-scratch <cahier des charges>` ou `/aeom build --from-scratch "<une phrase>"` rédige `.aeom/product.md` et ses parcours clés, et marque « (to confirm) » ce que la source ne dit pas
- [ ] AEOM dit ce que le run va coûter et attend le go, comme `/aeom`
- [ ] Trois directions tirées du monde du produit, chacune sur une page d'accueil construite pour l'occasion ; l'utilisateur en choisit une (avec `--autonome`, le tournoi choisit)
- [ ] La direction choisie devient le kit, et AEOM écrit le standard
- [ ] AEOM construit les écrans des parcours clés de la fiche, sur le standard
- [ ] Sans API, les écrans tournent sur des données fictives, nommées comme telles, dans un seul module
- [ ] Chaque parcours clé se rejoue jusqu'au bout, chaque écran passe les seize checks et les juges, et le garde-fou ne voit aucun appel serveur ; `aeom review` s'y ajoutera quand il existera (04-garder-a-chaque-pr/01)
- [ ] Tout est sur `aeom/<run>`, avec la page de résultat et une PR

## Comment
- C'est la quatrième chose que la landing promet (bloc 04 et `/aeom build` sur la page Commands), marquée « Soon » tant que ce ticket n'est pas fait.
- Les directions, le choix de l'utilisateur et le tournoi existent (section 2b, `skills/aeom/phase-directions.md`) ; la fiche produit suit le format de `skills/aeom/product.md`.

## Hors ticket
- Brancher les écrans sur une API, qu'elle soit donnée au départ ou qu'elle arrive après : 04.

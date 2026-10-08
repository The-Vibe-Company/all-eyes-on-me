---
id: 03
title: Un front from scratch, depuis une fiche produit et une API
milestone: 05-construire
depends_on: [01]
design: null
tracker: { tool: github, id: 67, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/67 }
---

## Ce que l'utilisateur fait
Pour un produit qui n'a pas encore de front, il écrit sa fiche produit et donne son API, ou rien ; AEOM pose une DA, écrit le standard et construit les écrans de ses parcours clés.

## Ce qu'il voit
Les six directions et le tournoi, la DA retenue, le standard écrit, puis chaque parcours clé construit et rejoué jusqu'au bout, dans la page de résultat.

## C'est fini quand
- [ ] Avec une fiche produit écrite à la main et sans front, `/aeom build --from-scratch` lance les six directions sur une page d'accueil construite pour l'occasion, puis le tournoi
- [ ] Le champion devient le kit, et AEOM écrit le standard
- [ ] AEOM construit les écrans des parcours clés de la fiche, sur le standard, branchés sur l'API donnée
- [ ] Sans API, les écrans tournent sur des données fictives, nommées comme telles, dans un seul module
- [ ] Chaque parcours clé se rejoue jusqu'au bout, et chaque écran passe `aeom review`
- [ ] Tout est sur `aeom/<run>`, avec la page de résultat

## Comment
- Les directions et le tournoi existent (`skills/aeom/SKILL.md` 2b) ; la fiche produit suit le format de `skills/aeom/product.md`.

## Hors ticket
- Remplacer les données fictives quand l'API arrive après un run qui n'en avait pas : 04.

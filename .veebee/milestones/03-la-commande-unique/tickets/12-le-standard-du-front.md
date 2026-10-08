---
id: 12
title: Le run écrit le standard du front
milestone: 03-la-commande-unique
depends_on: [01]
design: null
tracker: { tool: github, id: 59, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/59 }
---

## Ce que l'utilisateur fait
À la fin d'un run, il trouve dans son projet ce qui définit désormais son front : sa DA, ses valeurs, ses composants, ses règles. C'est contre ce standard que chaque PR sera vérifiée ensuite.

## Ce qu'il voit
Un fichier `.aeom/standard.md`, en mots : la DA retenue (sa source, ce qu'elle tire de la fiche produit), les tokens (couleurs, polices, tailles, espacements) avec le fichier du code où chacun vit, les composants du kit et où ils sont, et les règles propres au produit.

## C'est fini quand
- [ ] À la fin d'un run qui garde quelque chose, AEOM écrit `.aeom/standard.md` et le commite sur `aeom/<run>` avec le reste
- [ ] Le standard nomme la DA retenue, sa source et ce qu'elle tire de la fiche produit
- [ ] Chaque token et chaque composant du kit y figure avec le fichier du code où il vit ; une valeur absente du code n'y est pas
- [ ] Après un run « rien à refaire », AEOM écrit aussi le standard, tiré du front tel qu'il est
- [ ] Un run suivant part du standard existant : ce que l'utilisateur y a corrigé à la main reste tel quel, et AEOM dit ce qu'il a changé
- [ ] Le standard est du texte seulement : aucune capture, aucune image

## Comment
- La fiche produit garde déjà les corrections de l'utilisateur d'un run à l'autre (`aeom product`, `packages/core/src/product/product.ts`, fusion à trois) : même mécanisme pour le standard.
- Les tokens et les composants se lisent dans les fichiers partagés que la vague kit, ou le champion du tournoi, a écrits (sections 2b et 3 de `skills/aeom/SKILL.md`).

## Hors ticket
- Vérifier une PR contre le standard : le jalon suivant (garder).
- Construire dans le standard : le jalon d'après (construire).

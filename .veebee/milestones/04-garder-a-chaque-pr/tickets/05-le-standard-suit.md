---
id: 05
title: Une PR qui change le standard exprès le dit, et le standard suit une fois mergée
milestone: 04-garder-a-chaque-pr
depends_on: [01]
design: null
tracker: { tool: github, id: 64, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/64 }
---

## Ce que l'utilisateur fait
Quand il fait évoluer sa DA exprès (une nouvelle couleur, un nouveau composant), la relecture ne le bloque pas pour rien, et le standard suit.

## Ce qu'il voit
La relecture présente le changement du standard à part : les tokens et composants ajoutés ou modifiés, et les écrans qui les utilisent.

## C'est fini quand
- [ ] Une PR qui ajoute ou modifie un token ou un composant dans les fichiers du kit est présentée comme un changement du standard, pas comme un écart
- [ ] Les écrans de la PR qui utilisent le nouveau token ou le nouveau composant passent
- [ ] Un changement du kit qui fait échouer un contrôle sur un écran existant (contraste, débordement) reste un écart
- [ ] `aeom standard` met `.aeom/standard.md` à jour depuis le code ; la relecture rappelle de le lancer quand le kit a changé sans que le standard suive
- [ ] Ce que l'utilisateur a corrigé à la main dans le standard reste tel quel

## Comment
- Même fusion que la fiche produit (`packages/core/src/product/product.ts`) pour garder les corrections à la main.

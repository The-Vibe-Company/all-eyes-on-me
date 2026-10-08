---
id: 03
title: « Est-ce le même produit ? » : trois juges comparent les écrans de la PR au reste, en commentaire
milestone: 04-garder-a-chaque-pr
depends_on: [01]
design: null
tracker: { tool: github, id: 62, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/62 }
---

## Ce que l'utilisateur fait
Il lit sur la PR, en mots, si les nouveaux écrans ont l'air du même produit que le reste de l'app.

## Ce qu'il voit
Un commentaire sur la PR : pour chaque écran touché, si les juges le trouvent cohérent avec le reste, et sinon ce qui détonne, avec l'écran existant auquel ils l'ont comparé.

## C'est fini quand
- [ ] Trois juges comparent chaque écran touché à deux écrans existants de l'app, sur les principes de cohérence (`one-direction`, `consistent-chrome`, `not-generic`) et le standard ; la majorité décide
- [ ] Le verdict est posté en commentaire sur la PR, en mots, sans capture ni image
- [ ] Ce commentaire ne bloque jamais le merge
- [ ] Une nouvelle relecture met à jour le même commentaire au lieu d'en ajouter un
- [ ] Sans `gh` connecté, le verdict s'affiche dans le terminal

## Comment
- Les juges sont des sous-agents (`skills/aeom-judge/SKILL.md`) : la relecture se lance depuis une session, par exemple `/aeom --review <PR>`.

## Hors ticket
- Lancer ce jugement tout seul en CI, avec un modèle et une clé : pas dans ce jalon.

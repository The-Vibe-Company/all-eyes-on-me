---
id: 18
title: Pas de tournoi quand c'est l'utilisateur qui choisit la direction
milestone: 03-la-commande-unique
depends_on: [15]
design: null
status: done
tracker: { tool: github, id: 99, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/99 }
---

## Ce que l'utilisateur fait
Il lance `/aeom redo` : AEOM lui montre les directions dès qu'elles sont construites et lui demande laquelle appliquer, sans juges entre les deux.

## Ce qu'il voit
Sans `--autonome`, plus de juges de tri ni de duels : la planche des directions, chacune avec ses deux phrases simples, et la question. Avec `--autonome`, le tri et le tournoi restent, puisque personne ne choisit. `aeom estimate` ne compte les juges des directions qu'avec `--autonome`.

## C'est fini quand
- [ ] Le skill ne lance ni juge de tri ni duel sans `--autonome`, et garde le tournoi avec
- [ ] La décision est gardée comme aujourd'hui (`aeom tournament decide`), avec la direction choisie et les autres
- [ ] `aeom estimate` sans `--autonome` compte les directions sans juges ; avec, comme aujourd'hui
- [ ] La page de résultat et la PR disent que la direction a été choisie par l'utilisateur

## Comment
`skills/aeom/SKILL.md` (section 2b, étapes 5 à 8), `packages/core/src/run/estimate.ts`, `packages/cli/src/commands/estimate.ts`, `packages/cli/src/commands/tournament.ts` si `decide` demande un tournoi joué.

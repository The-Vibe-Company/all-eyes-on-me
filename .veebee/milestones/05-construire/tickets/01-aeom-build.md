---
id: 01
title: /aeom build construit ce qu'on lui demande, dans le standard
milestone: 05-construire
depends_on: [04-garder-a-chaque-pr/01]
design: null
tracker: { tool: github, id: 65, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/65 }
---

## Ce que l'utilisateur fait
Il demande à AEOM, en une phrase, un écran ou une modification de front, et la retrouve construite dans le standard, sur une branche.

## Ce qu'il voit
AEOM dit ce qu'il va construire, sur quels écrans et avec quels composants du kit ; puis l'écran construit, avant et après, et la relecture du niveau 2 qui passe.

## C'est fini quand
- [ ] `/aeom build "<ce qu'il faut>"` construit la demande sur `aeom/<run>`, avec les tokens et les composants du standard
- [ ] Avant de construire, AEOM dit ce qu'il va faire et sur quels fichiers, sans attendre de réponse
- [ ] Le résultat passe `aeom review` avant d'être rendu ; sinon AEOM corrige, puis dit ce qui reste
- [ ] Une demande qui exige du back (une nouvelle donnée, un appel serveur, de la logique métier) est refusée, avec ce qu'il faudrait côté back
- [ ] Le garde-fou ne voit aucun appel serveur nouveau à la fin ; seule une API donnée explicitement (03 et 04) en ajoute, et seulement les siens
- [ ] La page de résultat montre ce qui a été construit
- [ ] Sans standard, AEOM le dit et propose d'abord un run de `/aeom`

## Comment
- Les workers de la flotte écrivent déjà du front dans des worktrees (`skills/aeom/SKILL.md`, « Briefing any worker ») ; le niveau 2 vérifie.

## Hors ticket
- Les features nommées par un run : 02.
- Un front from scratch : 03.

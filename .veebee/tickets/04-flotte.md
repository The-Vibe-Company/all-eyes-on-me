---
id: 04
title: /aeom : la flotte corrige en parallèle et montre l'avant / après
milestone: null
depends_on: [02, 03]
design: null
tracker: null
---

## Ce que l'utilisateur fait
Il tape `/aeom` dans Claude Code, dans un projet, et la flotte corrige le front toute seule.

## Ce qu'il voit
Dans la session : les étapes qui s'enchaînent, les workers lancés, puis l'avant / après de chaque page et la branche à merger.

## C'est fini quand
- [ ] `/aeom` lancé sur ugly-app enchaîne capture, check et juge sans autre commande
- [ ] Ce qui est partagé (header, boutons) est corrigé d'abord, par un seul worker
- [ ] Ensuite, un worker par page tourne en même temps, chacun dans son worktree, limité aux fichiers de sa page
- [ ] Après les workers, AEOM recapture, relance check et juge, et montre l'avant / après de chaque page
- [ ] Une page qui ne s'améliore pas garde son ancienne version
- [ ] Le résultat finit sur une branche, prête à merger

## Les règles
- La vague kit a un seul worker ; la vague écrans a un worker par écran, sur des dossiers disjoints (CONTEXT.md).
- Cliquet : une nouvelle version n'est gardée que si elle est meilleure que l'actuelle (CONTEXT.md).

## Comment
- `skills/aeom/SKILL.md` : le coordinateur. Il appelle `aeom capture` et `aeom check`, lance le juge de 03, puis les workers en sous-agents (worktree isolé, en arrière-plan).
- En V0, « meilleure » veut dire moins de contrôles en échec et moins de principes qui ne passent pas. La comparaison par paires viendra après.
- Le coordinateur sépare les fichiers partagés de ceux propres à une page à partir de l'arbre du projet. ugly-app doit rendre cette séparation évidente.
- Une branche par lancement, `aeom/run-<date>`, dans laquelle les worktrees sont fusionnés.

## Hors ticket
- Les directions : 05.
- Les retours de l'utilisateur, les règles, la boucle jusqu'au plateau, le plafond de dépense : après la V0.

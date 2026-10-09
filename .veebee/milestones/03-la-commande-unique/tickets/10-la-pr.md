---
id: 10
title: Le run se termine par une PR, sans captures
milestone: 03-la-commande-unique
depends_on: [05, 06]
design: null
status: done
tracker: { tool: github, id: 56, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/56 }
---

## Ce que l'utilisateur fait
À la fin d'un run, ce qu'AEOM a gardé arrive en PR sur son dépôt, sans qu'aucune capture en sorte.

## Ce qu'il voit
Une PR depuis `aeom/<run>` vers la branche d'où le run est parti : la DA choisie et pourquoi, les écrans et parcours gardés, ce qui a été renvoyé, les features manquantes, en mots, et le chemin de la page de résultat sur sa machine.

## C'est fini quand
- [ ] À la fin d'un run qui garde quelque chose, AEOM pousse `aeom/<run>` et ouvre une PR vers la branche d'où il est parti
- [ ] La description est en mots : DA, écrans et parcours gardés, renvoyés avec la raison, features manquantes ; aucune image ni capture dans la PR ni dans ses commits
- [ ] AEOM n'active ni ne force aucun merge : la PR suit les règles du dépôt
- [ ] Sans remote ou sans `gh` connecté, AEOM le dit, laisse la branche, et la page de résultat reste
- [ ] Après un run « rien à refaire », aucune PR
- [ ] Avec `--sans-pr`, AEOM s'arrête à la branche

## Comment
- Le résumé reprend ce que la page de résultat lit déjà dans `.aeom/runs/<run>/`.

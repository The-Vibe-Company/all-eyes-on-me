---
id: 02
title: La DA vient du propos du produit : chaque direction dit ce qu'elle tire de la fiche produit
milestone: 03-la-commande-unique
depends_on: [01]
design: null
tracker: { tool: github, id: 48, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/48 }
---

## Ce que l'utilisateur fait
Il voit que la DA choisie parle de son produit : il comprend d'où elle vient dans ce qu'est l'app et dans les gens à qui elle s'adresse.

## Ce qu'il voit
La planche des six directions, chacune avec sa source et, sous sa capture, la phrase de la fiche produit qu'elle sert. Le champion du tournoi, avec la raison des juges.

## C'est fini quand
- [ ] Le brief des directions part de la fiche produit (à quoi sert l'app, pour qui, sa boucle principale) et non plus de deux lignes sur l'app
- [ ] Chaque direction nomme sa source et la partie de la fiche produit qu'elle sert, en une phrase lisible sous sa capture sur la planche
- [ ] Les juges du tournoi pèsent aussi l'accord avec le propos du produit, et leur raison le dit quand c'est ce qui a départagé
- [ ] Ce que la fiche produit marque « à confirmer » ne sert de base à aucune direction
- [ ] La liste noire des looks s'applique toujours, avant le tournoi
- [ ] Deux runs lancés chacun sur une copie neuve de l'app de démo proposent des sources différentes

## Comment
- Les sources se choisissent dans `skills/aeom/directions.md` (douze sources, six retenues) ; le brief et le duel sont dans `skills/aeom/SKILL.md` (2b) et `skills/aeom-judge/SKILL.md`.
- La note sous chaque capture passe par `note` de `SheetItem` (`packages/core/src/directions/sheet.ts`).

## Hors ticket
- Changer la façon dont le tournoi élimine (trois votes par duel) : rien ne change là.

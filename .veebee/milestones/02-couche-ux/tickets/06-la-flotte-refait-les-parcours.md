---
id: 06
title: La flotte refait les parcours
milestone: 02-couche-ux
depends_on: [04, 05]
design: null
tracker: { tool: github, id: 35, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/35 }
---

## Ce que l'utilisateur fait
Il laisse `/aeom --ux` corriger ce que la critique a trouvé, et ses parcours deviennent plus courts et plus clairs, sans feature nouvelle.

## Ce qu'il voit
Chaque parcours refait dès qu'il est fusionné, avant et après côte à côte, avec ce qui a changé : une étape en moins, un raccourci, un texte, un état.

## C'est fini quand
- [ ] `/aeom --ux` répartit les constats : la navigation commune à un seul worker d'abord, puis un worker par parcours sur ses propres écrans, en parallèle
- [ ] Chaque changement est l'un de ceux-ci : ordre des étapes, regroupement d'écrans, raccourci vers une action qui existe, texte, état ; tout le reste est refusé par le garde-fou (05)
- [ ] Chaque parcours refait est rejoué (02) avant d'être fusionné ; un parcours qui casse ne l'est pas
- [ ] Sur l'app de démo, « voir mes commandes » prend moins d'étapes après qu'avant
- [ ] Les pages touchées ne perdent aucun contrôle ni principe de base
- [ ] AEOM montre chaque parcours refait dès qu'il est fusionné

## Comment
- Même découpage que la refonte visuelle (`skills/aeom/SKILL.md`, sections Plan, Kit wave, Screen wave) : la navigation joue le rôle du kit, un seul écrivain ; chaque parcours, celui d'un écran, dans ses fichiers.
- Les règles des workers restent celles de « Briefing any worker » : CLI du checkout principal, port et dossier à eux, leurs seuls processus, leur propre navigateur, commit d'abord.

## Hors ticket
- Garder ou rejeter un parcours refait : 07.

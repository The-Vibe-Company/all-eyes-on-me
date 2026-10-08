---
id: 06
title: La flotte refait les parcours
milestone: 02-couche-ux
depends_on: [04, 05]
design: null
status: done
tracker: { tool: github, id: 35, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/35 }
---

## Ce que l'utilisateur fait
Il laisse `/aeom --ux` corriger ce que la critique a trouvé, et ses parcours deviennent plus courts et plus clairs, sans feature nouvelle.

## Ce qu'il voit
Chaque parcours refait dès qu'il est fusionné, avant et après côte à côte, avec ce qui a changé : une étape en moins, un raccourci, un texte, un état.

## C'est fini quand
- [x] `/aeom --ux` répartit les constats : d'abord un seul worker pour la navigation commune et pour tout écran que plusieurs parcours traversent, puis un worker par parcours, en parallèle, sur les écrans que seul ce parcours traverse ; deux workers n'écrivent jamais le même fichier
- [x] Le brief de chaque worker ne lui permet que ces changements : ordre des étapes, regroupement d'écrans, raccourci vers une action qui existe, texte, état ; avant de fusionner, le garde-fou (05) refuse ce qu'il sait voir, un nouvel appel serveur ou un fichier de données ou de logique touché
- [x] Chaque parcours refait est rejoué (02) avant d'être fusionné ; un parcours qui casse ne l'est pas
- [x] Sur l'app de démo, « voir mes commandes » prend moins d'étapes après qu'avant
- [x] Les pages touchées ne perdent aucun contrôle ni principe de base
- [x] AEOM montre chaque parcours refait dès qu'il est fusionné

## Comment
- Même découpage que la refonte visuelle (`skills/aeom/SKILL.md`, sections Plan, Kit wave, Screen wave) : la navigation joue le rôle du kit, un seul écrivain ; chaque parcours, celui d'un écran, dans ses fichiers.
- Les règles des workers restent celles de « Briefing any worker » : CLI du checkout principal, port et dossier à eux, leurs seuls processus, leur propre navigateur, commit d'abord.

## Hors ticket
- Garder ou rejeter un parcours refait : 07.

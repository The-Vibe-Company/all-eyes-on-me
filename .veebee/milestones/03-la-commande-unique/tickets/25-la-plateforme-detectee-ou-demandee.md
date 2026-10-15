---
id: 25
title: AEOM sait sur quelle plateforme juger le front, ou le demande
milestone: 03-la-commande-unique
depends_on: [23, 24]
design: null
status: done
tracker: { tool: github, id: 114, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/114 }
---

## Ce que l'utilisateur fait
Il lance `/aeom` sans rien configurer : AEOM détecte seul si le front sert sur mobile, sur ordinateur ou les deux, et ne juge qu'aux largeurs qui comptent. S'il ne peut pas le savoir, il le lui demande une fois.

## Ce qu'il voit
La fiche produit gagne une partie « Where it is used » : `mobile`, `desktop` ou `both`, avec sa source. Pour Bruno, le PRD dit « le web pour le tri et la réunion du matin, l'app iOS pour la journée » : `desktop` (seen: docs/PRD.md), et le run ne juge qu'en 1280 sans rien demander. Pour une app dont rien ne dit l'usage, AEOM devine, marque `(to confirm)`, et demande avant de rejouer les parcours et de lancer les juges : mobile, ordinateur ou les deux ? La réponse est écrite dans la fiche : le run suivant ne redemande pas.

## C'est fini quand
- [ ] La fiche dit où le front est utilisé, `mobile`, `desktop` ou `both`, d'après les mots du projet ou une app native à côté ; sinon c'est une supposition `(to confirm)`
- [ ] Sans `widths` dans la config, capture, contrôle, rejeu et estimation prennent les largeurs de la plateforme que la fiche dit : mobile 390, desktop 1280, les deux 390 et 1280
- [ ] Quand la fiche ne fait que supposer, `/aeom` demande une fois, avant tout rejeu et tout juge ; la réponse est écrite dans la fiche, et le run suivant ne redemande pas ; avec `--autonome`, il ne demande rien et garde 390 et 1280
- [ ] `aeom product --widths` dit les largeurs et d'où elles viennent, et sort en 2 quand il faut demander
- [ ] La clé `widths` de la config et `--widths` l'emportent toujours sur la fiche
- [ ] Une fiche d'avant, sans cette partie, juge en 390 et 1280 comme aujourd'hui, et AEOM pose la question

## Hors ticket
- Déduire la plateforme d'un front qui déborde sur téléphone : un front cassé en 390 n'est pas un front desktop, c'est peut-être justement ce qu'il faut réparer.
- Les largeurs elles-mêmes, le coût, la page et le cliquet : tickets 23 et 24.

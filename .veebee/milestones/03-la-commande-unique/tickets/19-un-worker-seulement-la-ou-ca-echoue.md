---
id: 19
title: Un worker de page seulement là où quelque chose échoue encore après le kit
milestone: 03-la-commande-unique
depends_on: [15]
design: null
status: done
tracker: { tool: github, id: 100, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/100 }
---

## Ce que l'utilisateur fait
Il lance `/aeom redo` sur une app dont les pages partagent leur mise en page : celles que le kit a déjà réparées ne coûtent plus un worker.

## Ce qu'il voit
Après le kit (ou la direction appliquée), AEOM refait les vérifications de toutes les pages et un seul vote du juge. Une page où plus rien n'échoue, et sur laquelle ne tombe aucun problème de parcours, n'a pas de worker ; elle est dite « réparée par le kit » dans la page de résultat.

## C'est fini quand
- [ ] Le skill mesure après le kit, avant la vague, et ne lance un worker que sur les pages qui échouent encore ou portent un problème de parcours
- [ ] Une page sans worker reste mesurée à la fin comme les autres
- [ ] `aeom estimate` compte cette mesure (les vérifications et un vote)

## Comment
`skills/aeom/SKILL.md` (sections 3 à 5), `packages/core/src/run/estimate.ts`.

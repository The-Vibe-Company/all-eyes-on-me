---
id: 09
title: Le résultat de aeom review dans la langue de la fiche produit
milestone: 04-garder-a-chaque-pr
depends_on: [07, 08]
design: null
status: todo
tracker: { tool: github, id: 197, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/197 }
---

## Ce que l'utilisateur fait
Il lance `/aeom review`, ou lit le check `aeom` sur une PR, alors que son produit est en français.

## Ce qu'il voit aujourd'hui
Tout est en anglais : « is not a colour of the standard », « Nothing outside the standard. », même dans le résumé du check que lit toute l'équipe. Les juges, eux, parlent déjà la langue de la personne (#170).

## Ce qu'il doit voir
Le résultat de la relecture dans la langue de la fiche produit, en français ou en anglais, dans le terminal comme dans le résumé du check.

## C'est fini quand
- [ ] `aeom review --lang fr|en` ; sans l'option, la langue de `.aeom/product.md` (comme la page de jugement, `sheetLang`), sinon l'anglais
- [ ] En français : la ligne d'en-tête, chaque écart du code, le header qui diffère, la page qui ne charge pas, les parcours (va au bout, casse à l'étape, feature), les notes, la ligne de couverture et le verdict
- [ ] Le check GitHub prend la langue de la fiche sans rien changer au workflow
- [ ] En anglais, rien ne change mot pour mot : les tests existants passent tels quels
- [ ] Des tests dans `packages/cli/src/commands/review.test.ts`

## Hors ticket
- Le texte des contrôles d'`aeom check` et la raison d'un parcours qui casse restent tels que ces outils les écrivent.
- Une autre langue que le français et l'anglais.

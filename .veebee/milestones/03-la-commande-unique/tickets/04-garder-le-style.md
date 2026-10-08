---
id: 04
title: --garder-le-style : une app à charte est corrigée sans changer de DA
milestone: 03-la-commande-unique
depends_on: [01]
design: null
tracker: { tool: github, id: 50, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/50 }
---

## Ce que l'utilisateur fait
Sur l'app d'un client qui a une charte, il lance `/aeom --garder-le-style` et obtient ses erreurs d'UI et d'UX corrigées sans nouvelle DA.

## Ce qu'il voit
Ni directions ni tournoi : la vague kit corrige le style existant, puis les pages et les parcours sont refaits dessus.

## C'est fini quand
- [ ] `/aeom --garder-le-style` ne lance ni directions ni tournoi
- [ ] Les couleurs, les polices et le logo de la page d'accueil sont les mêmes avant et après, sauf là où un contraste échouait
- [ ] La vague kit corrige ce qui échoue sur le style existant (contraste, curseurs, états vides et d'erreur) sans le remplacer
- [ ] Les pages puis les parcours sont refaits comme sans option (01 et 03)
- [ ] `"style": "keep"` dans `.aeom/config.json` vaut l'option à chaque run, sans la redire
- [ ] Rien n'échoue : « rien à refaire », comme sans option

## Comment
- La vague kit existe (`skills/aeom/SKILL.md`, section 3) : son brief demande aujourd'hui une direction « propre au produit » ; avec l'option, il demande de garder l'identité existante et de ne corriger que ce qui échoue.
- La config se lit dans `packages/core/src/run/config.ts`.

## Hors ticket
- Mélanger la charte et une DA nouvelle : pas dans ce jalon.

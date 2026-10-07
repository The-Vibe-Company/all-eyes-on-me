---
id: 05
title: /aeom propose 6 directions brutes et le juge en garde une
milestone: null
depends_on: [04]
design: null
status: done
tracker: { tool: github, id: 5, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/5 }
---

## Ce que l'utilisateur fait
Il lance `/aeom --directions` : AEOM lui propose 6 directions artistiques et en garde une.

## Ce qu'il voit
Les 6 captures de la page d'accueil côte à côte, puis la direction gagnante et la raison de sa victoire, puis le résultat appliqué à toutes les pages.

## C'est fini quand
- [x] `/aeom --directions` produit 6 directions différentes sur la page d'accueil d'ugly-app
- [x] Les 6 captures s'affichent côte à côte dans la session
- [x] Le juge les compare deux à deux et en garde une, avec la raison
- [x] La direction gagnante est appliquée à toutes les pages par la boucle de 04
- [x] Une direction qui ne compile pas : les 5 autres sont montrées et l'échec est dit

## Les règles
- Le juge compare deux versions, il ne note jamais (CONTEXT.md, comparaison par paires).

## Comment
- 6 workers en sous-agents, chacun dans son worktree, partent chacun d'un archétype différent tiré d'une liste courte dans `skills/aeom/archetypes.md` (suisse, brutaliste, éditorial, terminal rétro, luxe à empattements, artisanal).
- Chaque direction sert l'app sur son propre port pour être capturée.
- Le tournoi réutilise le juge de 03 avec une consigne « A ou B ».
- La gagnante sert de point de départ à la vague kit de 04.

## Hors ticket
- Les axes, l'historique et le tirage au sort des archétypes : après la V0.
- Des directions appliquées à plusieurs écrans : après la V0.
- La landing page d'AEOM, construite avec AEOM : première itération après la V0.

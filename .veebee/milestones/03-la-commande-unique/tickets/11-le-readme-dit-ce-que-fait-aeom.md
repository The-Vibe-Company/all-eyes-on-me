---
id: 11
title: Le README et la landing disent ce que fait aeom
milestone: 03-la-commande-unique
depends_on: [01, 05]
design: null
tracker: { tool: github, id: 57, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/57 }
---

## Ce que l'utilisateur fait
Un visiteur du repo ou de la landing comprend en une phrase ce que fait `aeom`, et voit ce qui existe vraiment.

## Ce qu'il voit
« Tu lances aeom, il prend ton front et en fait un mieux : il corrige l'UI et l'UX, et part sur une DA tirée de ton produit. » Puis ce qui marche, et ce qui vient.

## C'est fini quand
- [ ] Les premières lignes du README disent en une phrase ce que fait `aeom`
- [ ] Ce qui existe et ce qui vient sont séparés ; rien n'est donné pour fait s'il ne l'est pas (le plafond, l'apprentissage du goût, le check en CI, npm restent dans « ce qui vient »)
- [ ] La landing dit la même chose, avec le run de l'app de démo comme preuve
- [ ] Les commandes que listent le README et la landing sont celles de `aeom --help` (le test du site l'exige déjà)
- [ ] Rien de visuel d'un projet client n'y apparaît

## Comment
- Le README (« How it works », « Roadmap ») et `site/pages/index.html` ; le test `site/site.test.mjs` vérifie déjà la légende des commandes.

## Hors ticket
- La mise en ligne de la landing : 01-landing/05.

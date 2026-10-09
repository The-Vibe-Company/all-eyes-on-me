---
id: 04
title: Quand la vraie API arrive, les données fictives sont remplacées sans retoucher les écrans
milestone: 05-construire
depends_on: [03]
design: null
tracker: { tool: github, id: 68, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/68 }
---

## Ce que l'utilisateur fait
Quand son back est prêt, il donne l'API à AEOM, et son front from scratch passe des données fictives aux vraies, sans que les écrans changent.

## Ce qu'il voit
La liste des données que chaque écran attend, celles que l'API fournit, et celles qui manquent encore.

## C'est fini quand
- [ ] Les données fictives d'un front from scratch passent toutes par un seul module, qui dit quelle donnée attend quel écran
- [ ] `/aeom build --api <url ou spécification>` remplace ce module par des appels à l'API, sans modifier les écrans
- [ ] Les parcours clés se rejouent jusqu'au bout sur l'API, avec ses propres données fictives
- [ ] Une donnée que l'API ne fournit pas est listée, et l'écran garde sa donnée fictive en le disant
- [ ] Aucune logique métier n'est écrite côté front pour combler un manque de l'API
- [ ] Le garde-fou laisse passer les appels à l'API donnée, et seulement ceux-là : il les liste, et refuse tout autre appel nouveau

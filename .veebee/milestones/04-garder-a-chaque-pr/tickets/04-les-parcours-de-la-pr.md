---
id: 04
title: Les parcours que la PR traverse sont rejoués : un parcours qui casse bloque, une feature est signalée
milestone: 04-garder-a-chaque-pr
depends_on: [01]
design: null
tracker: { tool: github, id: 63, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/63 }
---

## Ce que l'utilisateur fait
Il sait, avant de merger, si la PR casse un de ses parcours clés ou apporte une feature.

## Ce qu'il voit
Dans la relecture : les parcours que la PR traverse, rejoués sur la base et sur la branche ; ceux qui cassent, à quelle étape ; les appels serveur nouveaux.

## C'est fini quand
- [ ] `aeom review` trouve les parcours clés qui traversent les écrans touchés et les rejoue sur la base et sur la branche
- [ ] Un parcours qui allait au bout sur la base et casse sur la branche fait échouer la relecture, avec l'étape et sa capture locale
- [ ] Un appel serveur nouveau ou un champ nouveau est signalé comme feature, sans bloquer : une PR a le droit d'en apporter une
- [ ] Aucun parcours ne traverse les écrans touchés : la relecture le dit et passe
- [ ] Sans parcours enregistrés dans le dépôt, la relecture le dit

## Comment
- `aeom journey`, `aeom guard` et `missingReplays` existent déjà ; `aeom journey --plan` sait quels écrans chaque parcours traverse.

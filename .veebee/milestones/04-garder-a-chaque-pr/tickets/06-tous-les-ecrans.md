---
id: 06
title: Un fichier partagé changé fait vérifier tous les écrans, même sur GitHub, et la relecture dit ce qu'elle a couvert
milestone: 04-garder-a-chaque-pr
depends_on: [01]
design: null
status: done
tracker: { tool: github, id: 183, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/183 }
---

## Ce que l'utilisateur fait
Il ouvre une PR qui change un fichier que tous les écrans lisent (un composant partagé, une feuille de style, le thème), et regarde le check `aeom` sur GitHub.

## Ce qu'il voit aujourd'hui
Pour savoir quels écrans vérifier, `aeom review` lit `pages` dans `.aeom/config.json`, sinon la liste des écrans capturés au dernier passage d'AEOM (`.aeom/captures/manifest.json`). Ce fichier n'est jamais commité : sur GitHub, il n'existe pas. Sans `pages`, la relecture ne vérifie donc que la page d'accueil, et passe au vert sans dire qu'elle n'a regardé qu'un écran. Même chose en local avec `--dir`.

## Ce qu'il doit voir
- Sans liste d'écrans, la relecture trouve elle-même les écrans en suivant les liens depuis l'accueil, comme `aeom check`, et les vérifie tous.
- À la fin du résultat, une ligne dit ce qui a été couvert : combien d'écrans mesurés sur combien, à quelles largeurs, comment ils ont été trouvés, lesquels ne l'ont pas été ; et combien de parcours clés ont été rejoués, sur la branche et sur la base, ou sur la branche seule.

## C'est fini quand
- [ ] Un fichier que tous les écrans lisent, sans `pages` ni captures, fait vérifier chaque écran trouvé par les liens depuis l'accueil (en local, en CI, avec `--dir`)
- [ ] Le résultat (terminal et résumé du check) se termine par la ligne de couverture : écrans mesurés sur écrans touchés, largeurs, écrans non mesurés, parcours rejoués
- [ ] Quand la recherche s'arrête à 50 pages, la ligne le dit
- [ ] En suivant les liens, un lien mort (4xx) ou qui sort du site est dit « non mesuré », jamais reproché à la branche ; une page qui ne répond pas ou plante (5xx) échoue comme avant
- [ ] Avec `pages` dans la config, rien ne change : c'est cette liste qui sert
- [ ] Les codes de sortie ne changent pas, sauf un faux vert : des écrans touchés dont aucun n'a été mesuré (une route à paramètre sans exemple connu) sortent en 2, plus en 0 ; toujours sans modèle
- [ ] Un test dans `packages/cli/src/commands/review.test.ts` : une feuille de style partagée changée, un défaut sur un écran autre que l'accueil, trouvé et dit

## Où
`packages/cli/src/commands/review.ts` seulement : `checkSite` (`packages/core/src/checks/run.ts`) trouve déjà les écrans quand on ne lui donne pas de routes ; il n'est pas modifié.

## Hors ticket
- Une route à paramètre (`/produit/:id`) sans exemple connu reste non mesurée, et la ligne de couverture le dit.
- La traduction du résultat dans la langue de la personne, et le cache du check en CI : des tickets à part.


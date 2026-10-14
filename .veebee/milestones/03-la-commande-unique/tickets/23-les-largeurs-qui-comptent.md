---
id: 23
title: Déclarer les largeurs qui comptent
milestone: 03-la-commande-unique
depends_on: []
design: null
status: done
tracker: { tool: github, id: 110, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/110 }
---

## Ce que l'utilisateur fait
Il écrit `"widths": [1280]` dans `.aeom/config.json` (ou lance `/aeom --widths 1280`) pour une app dont le web ne sert que sur ordinateur, et AEOM ne capture, ne mesure, ne rejoue et ne juge plus que cette largeur.

## Ce qu'il voit
Sur Bruno (web pour le tri et la réunion du matin, app iOS pour le reste), un `--juger` donnait 55 constats, dont 28 touchés par le 390 px, et 3 parcours « cassés » qui vont tous au bout en 1280. Avec la clé, le verdict dit « Measured: 9 screens at 1280 px » et ne parle que du desktop. Sans la clé, rien ne change : 390 et 1280.

## C'est fini quand
- [ ] `"widths": [1280]` dans la config : `aeom capture` n'écrit aucune capture en 390, `aeom check` ne mesure qu'en 1280, `aeom journey` ne rejoue qu'en 1280 ; un parcours qui ne casse qu'en 390 n'est plus cassé
- [ ] `--widths` sur une commande l'emporte sur la config ; `/aeom --widths 1280` vaut pour tout le run, workers compris
- [ ] Le run note ses largeurs au départ : `/aeom --reprendre` garde celles du run d'origine, même si la config a changé entre-temps, et les snapshots d'un run gardent la même liste
- [ ] Sans la clé, tout se passe exactement comme aujourd'hui : 390 et 1280
- [ ] Une liste vide, une largeur qui n'est pas un entier, ou hors de 240 à 3840 px, est refusée avec un message clair, dans la config comme en option
- [ ] Le verdict dit les largeurs mesurées, et `identity` et `recommend` ne portent que sur elles ; le juge ne voit que les captures de ces largeurs
- [ ] Les directions sont capturées à la plus large des largeurs du run

## Hors ticket
- L'estimation qui baisse, la page de résultat qui dit les largeurs, le cliquet qui refuse de comparer deux listes différentes, et la question quand la fiche parle d'une app native : ticket 24.
- Lire `## Who uses it` de la fiche produit pour choisir les largeurs : jamais, la config reste explicite.

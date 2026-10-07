---
id: 01
title: Un visiteur ouvre la landing V0 : ce que fait AEOM, comment l'installer, le repo à starer
milestone: 01-landing
depends_on: []
design: null
status: done
tracker: { tool: github, id: 14, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/14 }
---

## Ce que l'utilisateur fait
Il ouvre la page et comprend en une minute ce que fait AEOM, comment l'essayer, et où est le repo.

## Ce qu'il voit
Une page unique en anglais, volontairement brute : la promesse en une phrase, la boucle d'AEOM en quelques lignes, les commandes, l'installation, un lien « Star on GitHub », la feuille de route.

## C'est fini quand
- [x] La page s'ouvre en local avec une seule commande et dit en une phrase ce que fait AEOM
- [x] La boucle (capture, check, judge, waves, ratchet, directions) est expliquée en quelques lignes
- [x] Les commandes de la CLI affichées sont exactement celles de `aeom --help` ; un test échoue si elles divergent
- [x] L'installation affichée marche vraiment aujourd'hui (depuis les sources tant que npm n'est pas publié)
- [x] Un lien « Star on GitHub » mène au repo
- [x] La feuille de route, sur la landing et dans le README, place la couche UX juste après la landing

## Comment
- `site/` à la racine : HTML statique servi par un petit serveur Node, sur le modèle de `examples/ugly-app/server.mjs` (`pages/`, `shared/`, partials), pour qu'AEOM puisse tourner dessus sans configuration.
- `.aeom/config.json` du repo pointe encore sur l'app moche ; la landing a sa propre commande de démarrage, passée avec `--start` et `--url`.
- Les commandes viennent de l'aide de la CLI (`packages/cli/src/index.ts`) : un test lit `aeom --help` et la page, et compare.

## Hors ticket
- La refonte de la page par AEOM : 02.
- Le compteur d'étoiles en direct : 04.
- La mise en ligne : 05.

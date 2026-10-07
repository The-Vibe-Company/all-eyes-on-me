---
id: 01
title: L'app moche de démo et aeom capture : AEOM lance une app web et photographie toutes ses pages
milestone: null
depends_on: []
design: null
tracker: { tool: github, id: 1, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/1 }
---

## Ce que l'utilisateur fait
Il lance `aeom capture` sur une app web et récupère une capture de chaque page, à deux largeurs.

## Ce qu'il voit
Dans le terminal, la liste des pages trouvées et, pour chacune, le chemin de ses deux captures. Dans `.aeom/captures/`, une image par page et par largeur.

## C'est fini quand
- [ ] `examples/ugly-app` démarre avec une seule commande : 4 pages, un header différent sur chacune, des boutons sans curseur pointer, une liste sans état vide
- [ ] `aeom capture --start "<commande>" --url <url>` démarre l'app, suit les liens internes et trouve les 4 pages
- [ ] Chaque page est capturée à 390 et 1280 px dans `.aeom/captures/`
- [ ] L'app ne démarre pas : `aeom capture` s'arrête et donne la raison
- [ ] Une page qui renvoie une erreur est signalée, et les autres sont capturées quand même

## Les règles
- Une capture, c'est un écran, dans un état, à une largeur (CONTEXT.md).
- AEOM ne lit ni n'écrit jamais de données de production.

## Comment
- `packages/cli/src/index.ts` ne gère aujourd'hui que `--help` et `--version`. On y ajoute un routage par commande, avec `commands/capture.ts`.
- La capture va dans `packages/core/src/capture/` : Playwright (Chromium), démarrage de l'app avec `--start`, attente de l'URL, parcours des liens internes de même origine.
- `examples/ugly-app` reste le plus simple possible (HTML statique servi par un petit serveur Node), hors des paquets publiés.
- `.aeom/captures/` est déjà dans `.gitignore`.

## Hors ticket
- Les contrôles sur les pages : 02.
- Le jugement : 03.
- La connexion, le mobile, les états vide et erreur simulés : après la V0.

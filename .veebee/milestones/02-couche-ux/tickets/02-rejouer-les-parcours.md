---
id: 02
title: aeom journey rejoue chaque parcours et en capture chaque étape
milestone: 02-couche-ux
depends_on: [01]
design: null
tracker: { tool: github, id: 31, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/31 }
---

## Ce que l'utilisateur fait
Il lance `aeom journey` et voit chacun de ses parcours clés refait dans un navigateur, étape par étape, avec une capture à chaque étape.

## Ce qu'il voit
Pour chaque parcours, une planche : ses étapes dans l'ordre, à 390 et à 1280 px. Un rapport qui dit, par parcours, combien d'étapes, quels écrans traversés, combien de retours en arrière, et où il casse s'il casse.

## C'est fini quand
- [ ] `/aeom --ux` enregistre chaque parcours de `product.md` pendant qu'il le fait, sous une forme que la machine rejoue (`.aeom/journeys/`)
- [ ] `aeom journey` rejoue chaque parcours dans un navigateur neuf et capture chaque étape à 390 et 1280 px
- [ ] Une planche par parcours montre ses étapes dans l'ordre
- [ ] Le rapport compte, par parcours, les étapes, les écrans traversés et les retours en arrière
- [ ] Un parcours qui casse (élément introuvable, page en erreur, sortie de l'app) s'arrête à cette étape ; le rapport dit laquelle et pourquoi, avec sa capture
- [ ] Rejouer deux fois de suite donne le même résultat
- [ ] La landing liste `aeom journey` avec les mots de `aeom --help` (le test du site l'exige)

## Comment
- Le moteur de capture est déjà là : `packages/core/src/capture/` (Playwright, défilement, attente des images). Un parcours ajoute des actions entre les captures : aller à, cliquer, remplir, appuyer.
- Une étape vise un élément par son rôle et son nom accessibles plutôt que par un sélecteur CSS, pour survivre aux refontes des tickets 06 et 07.
- La planche réutilise `sheetHtml` / `contactSheet` de `packages/core/src/directions/sheet.ts`.

## Hors ticket
- Se connecter avant de rejouer : 03.
- Juger les parcours : 04.
- Noter les appels serveur pendant le parcours : 05.

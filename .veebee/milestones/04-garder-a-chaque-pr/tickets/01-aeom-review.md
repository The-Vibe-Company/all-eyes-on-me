---
id: 01
title: aeom review dit en quoi les écrans d'une PR s'écartent du standard
milestone: 04-garder-a-chaque-pr
depends_on: [03-la-commande-unique/12]
design: null
tracker: { tool: github, id: 60, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/60 }
---

## Ce que l'utilisateur fait
Avant de merger une PR, il lance `aeom review` et sait si les écrans qu'elle touche respectent le standard du front.

## Ce qu'il voit
Pour chaque écran que la PR touche : ses écarts au standard (une couleur ou une police hors des tokens, un composant refait à la main alors que le kit l'a, un en-tête ou une navigation différents), avec l'endroit dans le code, les contrôles mesurables en échec, puis un verdict net.

## C'est fini quand
- [ ] `aeom review` compare la branche à sa base, trouve les écrans que ses changements touchent, et ne mesure que ceux-là
- [ ] Une couleur, une police, une taille ou un espacement écrit en dur hors des tokens du standard est signalé, avec le fichier et la ligne
- [ ] Un bouton, un champ ou un en-tête refait à la main alors que le kit en a un est signalé, avec le composant du kit à utiliser
- [ ] Un écran dont l'en-tête ou la navigation diffère du reste de l'app est signalé
- [ ] Les contrôles mesurables (curseur, débordement, contraste, console) passent sur les écrans touchés, sinon ils sont signalés
- [ ] La sortie finit par un verdict : conforme, ou la liste de ce qui ne l'est pas, et la commande sort alors en erreur
- [ ] Sans standard dans le dépôt, `aeom review` le dit et propose d'abord un run de `/aeom`

## Comment
- Le standard est `.aeom/standard.md` (03-la-commande-unique/12) ; les contrôles mesurables existent (`aeom check`) ; les fichiers changés depuis une base se lisent déjà dans `packages/cli/src/commands/guard.ts` (`changedSince`).

## Hors ticket
- Le check GitHub : 02.
- Le jugement « même produit » : 03.
- Les parcours : 04.
- Un changement voulu du standard : 05.

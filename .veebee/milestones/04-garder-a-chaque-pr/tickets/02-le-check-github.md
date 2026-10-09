---
id: 02
title: Sur chaque PR, un check GitHub bloque ce qui s'écarte du standard, sans modèle
milestone: 04-garder-a-chaque-pr
depends_on: [01]
design: null
tracker: { tool: github, id: 61, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/61 }
---

## Ce que l'utilisateur fait
Il installe le check une fois ; ensuite, chaque PR qui touche le front montre si elle respecte le standard, et ne se merge pas sinon.

## Ce qu'il voit
Un check « aeom » sur la PR : vert, ou rouge avec la liste des écarts, en mots.

## C'est fini quand
- [ ] Une commande ajoute au dépôt le workflow GitHub qui lance `aeom review` sur chaque PR
- [ ] Le check démarre l'app sur ses données fictives, lance `aeom review`, et passe au rouge sur un écart au standard ou un contrôle en échec
- [ ] Il n'appelle aucun modèle : seulement les contrôles mesurables et le standard
- [ ] Le résumé du check liste les écarts en mots, sans capture
- [ ] Une PR qui ne touche aucun écran passe sans démarrer l'app
- [ ] L'app ne démarre pas en CI : le check échoue en disant pourquoi, avec la sortie de la commande de démarrage

## Comment
- GitHub Actions avec Playwright ; l'app démarre avec `start` et `url` de `.aeom/config.json`.

## Hors ticket
- Le jugement en commentaire : 03.

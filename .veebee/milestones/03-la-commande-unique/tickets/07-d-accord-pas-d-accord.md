---
id: 07
title: D'accord / pas d'accord : un geste par verdict, compté chez toi
milestone: 03-la-commande-unique
depends_on: [05]
design: null
status: done
tracker: { tool: github, id: 53, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/53 }
---

## Ce que l'utilisateur fait
Sur la page de résultat, il dit en un clic s'il est d'accord avec chaque verdict d'AEOM, et pourquoi quand il ne l'est pas.

## Ce qu'il voit
À côté de chaque verdict (la DA choisie, un écran gardé ou renvoyé, un parcours, un principe en échec) : « d'accord » et « pas d'accord », avec un champ facultatif pour dire pourquoi. En haut, le taux d'accord d'AEOM avec lui, par catégorie, sur tous les runs.

## C'est fini quand
- [ ] Chaque verdict de la page porte « d'accord » et « pas d'accord », et un champ libre facultatif
- [ ] Un retour est enregistré dès le clic, sans téléchargement : la page rouverte montre ce qui a été dit
- [ ] Les retours sont gardés sur la machine, en mots, sans aucune capture, dans `~/.aeom/taste/`
- [ ] La page du run suivant montre le taux d'accord par catégorie (DA, écrans, parcours, principes) depuis le premier retour
- [ ] Sans aucun retour encore, la page dit « pas encore de retour » au lieu d'un taux
- [ ] Les retours ne changent rien au juge pour l'instant : ils sont seulement comptés

## Comment
- La visionneuse de skill-creator enregistre déjà les retours par résultat dans `feedback.json` à travers un petit serveur local : même principe, servi par `aeom report`.
- `~/.aeom/taste/` est la couche perso décrite dans `CONTEXT.md` ; rien n'en sort de la machine.

## Hors ticket
- Tirer des principes des retours (la distillation) : plus tard, quand il y en aura assez.

---
id: 05
title: La page de résultat : ce que le run a rendu, sur ta machine seulement
milestone: 03-la-commande-unique
depends_on: [01]
design: null
status: done
tracker: { tool: github, id: 51, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/51 }
---

## Ce que l'utilisateur fait
À la fin d'un run, il ouvre une page sur sa machine et voit ce que ça rend.

## Ce qu'il voit
La DA choisie et pourquoi ; chaque écran avant et après, aux deux largeurs ; chaque parcours avant et après, en planches avec ses étapes ; ce qui a été gardé et ce qui a été renvoyé, avec la raison ; ce qui échoue encore.

## C'est fini quand
- [ ] À la fin de `/aeom`, AEOM dit où est la page et l'ouvre ; elle s'affiche dans un navigateur sans connexion
- [ ] La page montre la DA choisie, sa source, et la raison du tournoi
- [ ] Chaque écran : avant et après côte à côte, à 390 et 1280 px, gardé ou renvoyé, avec la raison
- [ ] Chaque parcours : ses planches avant et après, son nombre d'étapes, gardé ou renvoyé, avec la raison
- [ ] Ce qui échoue encore est listé, écran par écran et parcours par parcours
- [ ] Après un run « rien à refaire », la page le dit, avec ce qui a été mesuré
- [ ] Rien n'est publié : la page et ses captures restent dans `.aeom/runs/<run>/`, et aucune capture n'entre dans un commit

## Comment
- Le modèle est la visionneuse d'évaluation de skill-creator (`eval-viewer/generate_review.py`) : un onglet par résultat, un onglet de mesures, une page générée à partir des fichiers du run.
- Tout ce qu'il faut est déjà écrit par le run dans `.aeom/runs/$RUN/` : les instantanés avant et après, `tournament.json`, les rapports de contrôle et de juge, `ratchet.json`. Une commande `aeom report <run>` peut générer la page ; les planches réutilisent `aeom sheet`.

## Hors ticket
- Les features manquantes : 06.
- Les retours d'accord ou de désaccord : 07.
- La PR : 10.

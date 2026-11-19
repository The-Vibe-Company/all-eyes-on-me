---
id: 10
title: Le check aeom démarre vite : AEOM et Chromium viennent du cache de GitHub
milestone: 04-garder-a-chaque-pr
depends_on: [02]
design: null
status: todo
tracker: { tool: github, id: 198, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/198 }
---

## Ce que l'utilisateur fait
Il ouvre une PR sur un projet qui a le check `aeom`, et attend le résultat.

## Ce qu'il voit aujourd'hui
À chaque PR, le check réinstalle AEOM de zéro : clone, `pnpm install`, build, puis le téléchargement de Chromium et de ses dépendances. Plusieurs minutes avant que la relecture commence.

## Ce qu'il doit voir
Le check démarre vite dès la deuxième PR : AEOM et Chromium viennent du cache de GitHub, tant que la version d'AEOM épinglée ne change pas.

## C'est fini quand
- [ ] Le workflow écrit par `aeom review --install-check` met en cache AEOM construit et le navigateur de Playwright, avec une clé qui contient la version épinglée d'AEOM
- [ ] Sur un cache trouvé, ni clone, ni install, ni build d'AEOM, ni téléchargement de Chromium ; seules les dépendances système du navigateur sont installées
- [ ] Sur un cache manqué, le workflow fait ce qu'il fait aujourd'hui
- [ ] Un test dans `packages/cli/src/commands/review.test.ts`
- [ ] Vérifié sur un vrai run GitHub : deux PR de suite, la seconde plus rapide

## Hors ticket
- Mettre en cache l'install du projet lui-même : c'est son affaire, avec son gestionnaire de paquets.

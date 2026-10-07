---
id: 04
title: Le nombre d'étoiles GitHub s'affiche en direct, et la page tient sans lui
milestone: 01-landing
depends_on: [01]
design: null
status: done
tracker: { tool: github, id: 17, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/17 }
---

## Ce que l'utilisateur fait
Il voit combien de personnes ont starré le repo, et peut le starer à son tour.

## Ce qu'il voit
Le bouton « Star on GitHub » avec le nombre d'étoiles à côté.

## C'est fini quand
- [x] Le bouton « Star on GitHub » affiche le nombre d'étoiles du repo
- [x] Si GitHub ne répond pas ou limite les appels, le bouton reste là, sans nombre et sans erreur dans la console

## Comment
- Lecture côté navigateur de l'API publique de GitHub pour `The-Vibe-Company/all-eyes-on-me`.

## Hors ticket
- La mise en ligne : 05.

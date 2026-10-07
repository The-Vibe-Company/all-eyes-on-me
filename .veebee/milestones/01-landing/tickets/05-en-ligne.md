---
id: 05
title: La landing est en ligne sur aeom.thevibecompany.co, redéployée à chaque merge
milestone: 01-landing
depends_on: [01]
design: null
tracker: { tool: github, id: 18, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/18 }
---

## Ce que l'utilisateur fait
Il tape aeom.thevibecompany.co et tombe sur la landing.

## Ce qu'il voit
La landing, toujours à jour avec `main`.

## C'est fini quand
- [ ] https://aeom.thevibecompany.co affiche la landing
- [ ] Un merge dans main met la page en ligne sans geste manuel
- [ ] Chaque PR qui touche site/ a sa preview

## Comment
- Un projet Vercel dans l'équipe The Vibe Company, relié au repo, avec `site/` comme racine.
- Le domaine thevibecompany.co est chez Cloudflare : l'enregistrement DNS de aeom.thevibecompany.co doit être ajouté par quelqu'un qui y a accès, comme pour armada.

## Hors ticket
- Le contenu de la page : 01 à 04.

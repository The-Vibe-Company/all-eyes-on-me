---
id: 15
title: Un vote bâclé est refusé, et son votant relancé
milestone: 05-construire
depends_on: []
design: null
status: done
tracker: { tool: github, id: 166, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/166 }
---

## Ce que l'utilisateur fait
Il lance `/aeom` ou `/aeom judge` comme avant. Quand un juge rend un vote fait à la va-vite, AEOM le refuse tout seul et le juge recommence, sans que personne n'ait à le remarquer.

## Ce qu'il voit
Des verdicts dont chaque raison nomme ce qu'on voit sur la page. Quand un vote a été refusé, `aeom judge` dit quel votant et pourquoi, et la session le relance.

## C'est fini quand
- [ ] `aeom judge` refuse un vote dont les raisons ne nomment rien de la page : trop courtes, toutes faites (« Looks good », « Fine », « Conforme »), ou sans rien de précis (un texte de la page, un élément, une couleur, un nombre). Il le refuse dès qu'un tiers de ses raisons sont ainsi
- [ ] Il refuse un vote qui répète la même raison d'une page ou d'un principe à l'autre, et un vote qui avoue ne pas avoir regardé (« I did not re-open the captures »)
- [ ] Il refuse un vote recopié sur celui d'un autre votant
- [ ] Le refus nomme le votant, dit pourquoi avec deux raisons en exemple, et le skill relance ce votant seul, avec le même brief
- [ ] Un vote soigné passe, en français comme en anglais, même avec des raisons courtes quand elles nomment ce qu'on voit

## Les règles
- « Le premier votant bâcle parfois » : des raisons génériques (« one generic sentence per principle [...] I did not re-open the captures »), et l'agent a dû le relancer ; un juge a aussi lu le vote d'un autre par erreur (retour de Victor, 26 octobre).

## Hors ticket
- Juger la justesse d'une raison : AEOM vérifie qu'elle nomme quelque chose, pas qu'elle a raison.

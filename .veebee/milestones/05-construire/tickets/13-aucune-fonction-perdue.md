---
id: 13
title: Aucune fonction perdue, mesurée avant et après le run
milestone: 05-construire
depends_on: [07]
design: null
status: done
tracker: { tool: github, id: 162, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/162 }
---

## Ce que l'utilisateur fait
Il lance `/aeom` ou `/aeom redo` comme avant. Le front change de look et de structure, mais tout ce qu'il permettait reste là : chaque lien, chaque bouton, chaque champ existe encore quelque part.

## Ce qu'il voit
Quand une page refaite a perdu un lien ou une action, AEOM le dit, page par page : « le lien « Dossier GitHub » (vers github.com/…) était sur /dossiers/:id, aucune page ne l'a plus ». La page est renvoyée, comme une page qui a empiré. Une action qui a changé de page n'est pas perdue.

## C'est fini quand
- [ ] `aeom compare <avant> <après>` lit ce que chaque page contient (`<page>.content.yml`, ticket 07) et nomme chaque lien (par sa cible), bouton ou champ (par son nom) que le front avait avant et qu'aucune page n'a après
- [ ] Ce qui a changé de page, ou dont la cible ne change que par un identifiant (`/dossiers/12`, `/dossiers/:id`), n'est pas perdu ; un lien qui ne mène qu'à la page elle-même, ou un élément d'une longue liste raccourcie, n'est pas compté
- [ ] Avec `--strict`, une fonction perdue fait sortir `aeom compare` en 1, comme une page qui empire ; la liste est gardée dans `lost.json` à côté de la comparaison
- [ ] Le skill renvoie la page qui l'a perdue (section 5), et chaque brief de page dit que tout lien, bouton et champ de la page reste accessible, ici ou sur une autre page
- [ ] Sans `content.yml` d'un côté (une capture d'avant le ticket 07), `aeom compare` le dit et ne compte rien comme perdu

## Les règles
- « Sur Radar, la simplification a fait disparaître des liens et des actions (dossier GitHub, livrables, preuve de dépôt), et ni le juge ni les parcours ne l'ont vu. C'est la relecture de PR qui l'a attrapé. » (retour de Victor, 26 octobre).

## Hors ticket
- Les maquettes de `/aeom directions`, qui redessinent deux écrans : elles gardent déjà toutes les actions par leur brief.
- `aeom review` sur une branche : plus tard.

---
id: 06
title: Les features manquantes, au plus trois, seulement quand un parcours ne peut pas aboutir
milestone: 03-la-commande-unique
depends_on: [05]
design: null
status: done
tracker: { tool: github, id: 52, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/52 }
---

## Ce que l'utilisateur fait
Il voit, à part, ce qu'il faudrait construire pour qu'un parcours clé aboutisse, sans qu'AEOM l'ait construit.

## Ce qu'il voit
Une section de la page de résultat, « Il faudrait une feature », avec au plus trois entrées : le parcours, l'étape où il bloque, sa capture, et ce qui manque en une phrase.

## C'est fini quand
- [ ] Une feature n'est nommée que pour un parcours clé qui ne va pas au bout à la fin du run, à l'étape où il bloque
- [ ] Au plus trois par run ; s'il y en a plus, celles des parcours de la boucle principale de la fiche produit passent d'abord
- [ ] Chaque entrée dit le parcours, l'étape, sa capture et ce qui manque, sans solution technique
- [ ] Sur l'app de démo, l'ajout au panier (« Ajouter » ne fait rien) apparaît
- [ ] AEOM ne code aucune de ces features : le garde-fou ne voit aucun appel nouveau à la fin du run
- [ ] Aucun parcours bloqué : la section n'apparaît pas

## Comment
- Un parcours bloqué se lit dans le rapport du rejeu (`broken`) et dans la critique des parcours (`result-shown`, `no-dead-end`).

## Hors ticket
- Construire ces features : jamais, sauf demande explicite (`--feature` de `aeom guard`).

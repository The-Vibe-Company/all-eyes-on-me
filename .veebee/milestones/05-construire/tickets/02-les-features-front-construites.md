---
id: 02
title: Les features front qu'un run a nommées sont construites sur demande
milestone: 05-construire
depends_on: [01, 03-la-commande-unique/06]
design: null
tracker: { tool: github, id: 66, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/66 }
---

## Ce que l'utilisateur fait
Sur la page de résultat, il choisit une feature manquante qui ne demande que du front, et AEOM la construit.

## Ce qu'il voit
Dans la section des features manquantes : pour chacune, si elle ne demande que du front ou aussi du back, et pour une feature front, la commande qui la construit.

## C'est fini quand
- [ ] Chaque feature manquante dit si elle ne demande que du front (un état, un écran de résultat, un message) ou aussi du back
- [ ] Pour une feature front, la page donne la commande `/aeom build` qui la construit
- [ ] Une feature qui demande du back n'a pas de commande, et dit ce qu'il faudrait côté back
- [ ] Construite, la feature fait aboutir au rejeu le parcours qui bloquait
- [ ] Rien n'est construit sans qu'on le demande

## Comment
- La section vient de 03-la-commande-unique/06.

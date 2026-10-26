---
id: 14
title: Une page de résultat qui sert : dans la langue de la personne, avec les maquettes, à chaque tour
milestone: 05-construire
depends_on: [11]
design: null
status: done
tracker: { tool: github, id: 164, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/164 }
---

## Ce que l'utilisateur fait
Après `/aeom directions` ou un run avec de nouvelles directions, il ouvre la page de résultat. Il y voit les directions en grand, tour après tour, avec ce que la fiche comparative en dit et celle qu'il a choisie, dans sa langue.

## Ce qu'il voit
Une page en français quand il parle français. En tête, les directions : le front tel qu'il est d'abord, puis chaque direction avec ses deux écrans en grand, sa phrase, sa structure, son point fort, son point faible et son adéquation, ce que ses contrôles ont trouvé. Chaque tour est gardé, le premier comme ceux des variantes et des mélanges. Ensuite, celle qu'il a choisie et pourquoi. La page s'ouvre aussi comme un simple fichier, images comprises.

## C'est fini quand
- [ ] `aeom report --lang fr` écrit la page en français, ses propres mots compris (titres, étiquettes, « avant », « après », « gardé », « renvoyé »…) ; `--lang en` en anglais, par défaut
- [ ] Un run de `/aeom directions` a sa page : le front tel qu'il est d'abord, puis chaque direction avec ses écrans en grand, sa phrase et sa structure, sa fiche comparative et ce que ses contrôles ont trouvé, puis la décision et ses mots
- [ ] Chaque tour est gardé : `aeom tournament start` note le tour, ses directions et leurs phrases, `compare` et `decide` y ajoutent leur fiche et leur décision, et la page les montre tous, le dernier en premier
- [ ] La page ouverte comme fichier montre ses images ; servie, elle garde « d'accord / pas d'accord »
- [ ] Le skill passe la langue de la personne à `aeom report` et donne le lien de la page à la fin de `/aeom directions`

## Les règles
- La page « inutilisable : en anglais, sans images, et figée sur le premier tour » ; « Je ne vois pas le résultat de la maquette, je ne vois que les questions [...] je veux voir la différence de DA » (retour de Victor, 26 octobre).

## Hors ticket
- D'autres langues que le français et l'anglais.
- Un lien public : la page reste sur la machine, rien de visuel d'un projet client ne sort.

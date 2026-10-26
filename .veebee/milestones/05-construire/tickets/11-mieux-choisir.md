---
id: 11
title: Choisir une direction avec une fiche comparative, ou en mélanger deux
milestone: 05-construire
depends_on: [10]
design: null
status: done
tracker: { tool: github, id: 157, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/157 }
---

## Ce que l'utilisateur fait
Il lance `/aeom directions` ou `/aeom redo` avec de nouvelles directions. Au moment de choisir, il lit pour chacune son point fort, son point faible et son adéquation au projet, et celle par laquelle AEOM commencerait, avec la raison. Il choisit une direction, ou un mélange : « Lutrin avec l'air de Verrière ».

## Ce qu'il voit
Sous la planche, une fiche comparative en texte, lisible même sans voir les images. La recommandation est un conseil, jamais un choix : toutes les directions restent montrées. Un mélange demandé est dessiné, montré à côté des deux directions dont il vient, puis gardé quand il le dit.

## C'est fini quand
- [ ] Le juge de tri écrit aussi, pour chaque direction montrée, son point fort, son point faible et son adéquation au projet, une phrase chacun qui nomme ce qu'il voit, et la direction par laquelle il commencerait, avec la raison. Il n'en laisse aucune de côté
- [ ] `aeom tournament compare` vérifie cette réponse : chaque direction de la planche et aucune autre, une seule recommandée, parmi elles. Puis il écrit `compare.json` et affiche la fiche en texte
- [ ] La question posée à la personne montre, pour chaque direction, ces trois phrases, puis la recommandation dite comme un conseil, et propose le mélange
- [ ] Un mélange (« Lutrin avec l'air de Verrière ») est dessiné comme une variante de la première direction, qui emprunte à l'autre ce que la personne a nommé. Il est montré à côté des deux et gardé quand elle le dit, ses mots devenant sa raison
- [ ] `aeom tournament decide` note si la personne a suivi la recommandation, dans le run et dans son goût (`~/.aeom/taste/`), pour qu'on puisse mesurer le tri contre elle

## Les règles
- « Fais un comparatif des trois, dis-moi leur point fort et un point faible et sur lequel tu partirais et pourquoi » (Victor, Clichy, 20 octobre).
- « Le tri doit éclairer le choix, pas le faire » : sur Radar, le juge ne gardait que Chemises, et Victor a choisi Signalétique (retour de Victor, 26 octobre).
- Les choix mixtes sont fréquents : « Lutrin avec l'air de Verrière », « Guichet avec deux emprunts à Square », « Signalétique avec les couleurs actuelles » (retour de Victor, 26 octobre).
- On n'écarte rien quand la personne choisit (Antoine, 16 octobre).

## Hors ticket
- Une page de résultat utilisable, dans la langue de la personne, avec ses images, à jour à chaque tour : P2.
- Refuser les votes bâclés : P2.

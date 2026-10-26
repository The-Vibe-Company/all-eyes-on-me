---
id: 07
title: Des directions vraiment différentes, pas trois habillages du même squelette
milestone: 05-construire
depends_on: [05]
design: null
status: done
tracker: { tool: github, id: 150, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/150 }
---

## Ce que l'utilisateur fait
Il lance `/aeom directions`, `/aeom redo` avec de nouvelles directions ou `/aeom build`, comme avant. Dès le premier tour, les trois directions sont trois façons de faire le site, pas trois couleurs posées sur la même page.

## Ce qu'il voit
Trois maquettes dont la mise en page diffère : l'une ouvre sur une image, une autre range l'écran en volets comme un poste de travail, une autre suit une chronologie. Chacune garde tout ce que l'écran contient (les mêmes données, toutes les actions) et en change l'allure et la disposition. Dans la question, chaque direction dit sa structure en mots simples. Quand deux directions ont le même squelette, le juge le dit à côté d'elles.

## C'est fini quand
- [ ] Chaque direction reçoit, en plus de sa source, une structure à elle (où est l'action principale, comment le contenu est rangé, comment on navigue). Deux directions d'un même tour n'ont jamais la même ; sur le produit tel qu'il est, aucune ne reprend la structure actuelle
- [ ] Les explorateurs ne voient pas le front tel qu'il est : ni ses captures, ni ses feuilles de style, ni les autres directions. Ils reçoivent ce que chaque écran contient, en texte
- [ ] `aeom capture` écrit, à côté des captures de chaque page, son contenu (`<page>.content.yml`) : ses titres, ses textes, ses liens, ses boutons, ses champs, et une longue liste raccourcie à ses premiers éléments. Le manifeste le cite, et une nouvelle capture l'efface
- [ ] Le juge de tri nomme une direction qui a le même squelette qu'une autre ou que le front actuel (même en-tête, même barre de recherche, mêmes cartes aux mêmes endroits, seules les couleurs et la police changent), ou qui ne suit pas sa structure. Ce qu'il dit va à côté de la direction : tout est montré, rien n'est écarté
- [ ] Avec `--autonome`, de deux directions au même squelette, les juges n'en nomment qu'une, celle qui suit le moins sa structure : les deux ne tombent pas ensemble

## Les règles
- « il n'y a pas 3 DA différentes, 3 façons de faire le site » (Victor, Tours, 15 octobre) : c'est ce qu'on veut dès le premier tour.
- Des explorateurs qui ne voient ni les captures, ni le CSS existant, ni les autres propositions, et une thèse de structure différente imposée à chacun (retour de Victor, 26 octobre).
- Tout montrer, avec la raison à côté : on n'écarte rien quand la personne choisit (Antoine, 16 octobre).

## Comment
`aeom capture` (packages/core/src/capture/capture.ts) prend l'arbre d'accessibilité de chaque page à la plus grande largeur (`ariaSnapshot` de Playwright), le raccourcit et l'écrit à côté de la capture. Les briefs vivent dans `skills/aeom/directions.md` (la structure, à côté de la source), `phase-mockups.md` (2d) et `phase-directions.md` (2b, le tri).

## Hors ticket
- Les méta-textes d'IA, les espaces réservés et les contrôles mesurables d'Elaya : ticket 08.
- Les exceptions déclarées dans `product.md`, et le modèle des juges figé dans le run : ticket 09.
- La fiche comparative et les choix mixtes : ticket 10.

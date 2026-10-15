---
id: 29
title: Trois directions depuis un prompt, en quelques minutes
milestone: 03-la-commande-unique
depends_on: []
design: null
status: done
tracker: { tool: github, id: 124, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/124 }
---

## Ce que l'utilisateur fait
Il n'a ni app ni visuel. Il passe `/style`, qui lui donne une charte et un prompt, puis lance `/aeom --depuis prompt.md`. Quelques minutes plus tard, AEOM lui montre trois directions côte à côte, et il en choisit une.

## Ce qu'il voit
Une ligne de coût, puis, en une dizaine de minutes au plus, la planche des trois directions. Chacune tient sur deux écrans du prompt (le premier, et le plus dense) en HTML/CSS statique avec des données fictives, et se résume en deux phrases. Les trois respectent la charte de `/style` et varient sur ce qu'elle laisse ouvert : composition, densité, matières, mise en avant de l'action principale. Celles qui sont laides ou datées ont été écartées avant.

## C'est fini quand
- [ ] `/aeom --depuis <prompt.md>` lit le prompt, et la charte `.veebee/style.md` quand elle existe ; sans phase de compréhension, sans app, sans branche
- [ ] Trois workers construisent chacun deux écrans en HTML/CSS statique, sans worktree, sans installation ni build
- [ ] `aeom capture --dir` et `aeom check --dir` servent eux-mêmes un dossier de pages statiques : aucun serveur à lancer
- [ ] Les seize checks tournent sur chaque direction ; un juge écarte celles qui sont laides, datées ou qui trahissent la charte ; la planche est montrée, et la personne choisit
- [ ] `aeom estimate --depuis` dit le coût : environ 4 agents et 10 minutes ; le run l'affiche et part sans attendre
- [ ] Les directions respectent ce que la charte fixe ; un look interdit ne passe jamais devant ce que la charte demande explicitement

## Hors ticket
- Étendre la direction choisie à tous les écrans du prompt, en maquette cliquable jugée : ticket 30.
- Construire l'app sur cette direction.

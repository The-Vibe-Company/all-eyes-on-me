---
id: 01
title: Un run coûte deux fois moins, sans rien changer à ce qu'il rend
milestone: 06-moins-cher-et-sur-codex
depends_on: []
design: null
tracker: { tool: github, id: 133, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/133 }
---

## Ce que l'utilisateur fait
Il lance `/aeom` comme avant, et le run pèse environ deux fois moins sur son forfait.

## Ce qu'il voit
Le même run, les mêmes captures, le même résultat. Il n'y a qu'une étape de plus, une fois : lier les agents AEOM à l'installation, puis redémarrer Claude Code.

## C'est fini quand
- [ ] Les workers et les juges sont des agents AEOM dédiés, `aeom-worker` et `aeom-judge`, installés avec les skills. Sonnet est fixé dans leur définition, et ils ne reçoivent que les outils dont ils se servent : aucun MCP, aucun navigateur partagé, aucune liste de skills
- [ ] Les workers de direction sont des `aeom-worker` sur le modèle de la session, comme aujourd'hui
- [ ] Si les agents ne sont pas installés, le run marche comme avant (agent généraliste sur Sonnet) et dit une fois comment les installer
- [ ] Le coordinateur n'ouvre jamais une capture pour la montrer : il l'envoie. Il ne pilote jamais l'app dans le navigateur de la session, n'attend jamais un agent avec `sleep`, et lance d'un seul coup les agents d'une même étape
- [ ] Un juge ne lit pas le CLAUDE.md du projet : il juge des captures sur des principes écrits
- [ ] Le README dit comment lier les agents et qu'il faut redémarrer Claude Code une fois

## Les mesures de départ
Run Road-To-Mastock du 10 octobre (8 écrans, 4 parcours), tout sur Opus : ~238 $ au prix de l'API.
- Le coordinateur : 66 $, 309 appels, un contexte qui monte de 75k à 635k tokens.
- 6 workers de direction : 67 $.
- 12 workers de page : 38 $, sur Opus alors qu'ils devaient tourner sur Sonnet.
- Juges : ~32 $.

Chaque sous-agent démarre avec ~54k tokens de contexte avant d'avoir rien lu, relus à chaque appel.

## Hors ticket
- Le coordinateur et les directions sur un modèle plus léger : non tranché par Antoine.
- AEOM lancé depuis Codex : ticket 02.
- L'estimation exprimée en coût réel, et le coût mesuré après un run : ticket 03.

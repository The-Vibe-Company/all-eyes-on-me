---
id: 16
title: AEOM apprend de ce qu'on lui dit, et l'ordre d'un run tient dans le code
milestone: 05-construire
depends_on: [11, 14]
design: null
status: done
tracker: { tool: github, id: 168, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/168 }
---

## Ce que l'utilisateur fait
Pendant un run, il dit une préférence (« jamais de fond crème », « les boutons en capitales ») : AEOM la garde tout de suite, pour ce projet ou pour lui. Sur la page de résultat, il dit qu'il n'est pas d'accord ; au moment de choisir une direction, il ne suit pas le conseil du tri. Au run suivant, AEOM en a tiré des leçons, et les workers les lisent.

## Ce qu'il voit
`aeom taste` montre ce qu'il a appris à AEOM : les règles du projet d'abord, les siennes, puis les leçons, les plus confirmées en tête. Et une pull request ne part jamais d'un run qui a sauté une étape : `aeom pr` dit laquelle.

## C'est fini quand
- [x] `aeom taste rule "<règle>" [--project]` garde une règle dite, une fois, dans `.aeom/taste.md` (le projet, lu en premier) ou `~/.aeom/taste/rules.md` (la personne)
- [x] `aeom taste learn` nomme les runs du projet qui ont quelque chose à apprendre (un désaccord, un choix contre le conseil) ; `aeom taste learn <run>` en donne les preuves ; le run est appris à sa première leçon gardée, ou avec `--none` quand rien n'y tient
- [x] `aeom taste lesson "<leçon>" --run <run> --evidence "<preuve>"` garde au plus cinq leçons par run, chacune appuyée sur une preuve que ce run a montrée ; une leçon apprise à nouveau compte une fois de plus ; une leçon d'un seul projet reste à ce projet
- [x] `aeom taste --brief` donne un index de 200 lignes au plus ; les briefs des workers et le tri le lisent, jamais les juges des principes
- [x] `aeom pr` refuse un run dont l'état (`state.json`) dit qu'il a refait des pages ou des parcours, et qui ne les a pas mesurées après leur vague, pas rejoué ses parcours à la fin, pas remesuré ses écrans après une vague des parcours, ou pas atteint l'étape du standard ; il nomme l'étape. Un run sans `state.json` n'est pas tenu

## Les règles
- Repris du retour de LangChain sur leur agent de design (27 octobre) : deux boucles d'apprentissage (une règle gardée tout de suite, des leçons tirées des jobs, appuyées sur des preuves, notées par les suivants), un index court ; et « l'ordre qui doit toujours tenir vit dans le code, le jugement reste dans le prompt ».
- Antoine : « prends ce qui est à prendre, fais une PR et merge » (28 octobre).

## Hors ticket
- Retirer du skill les règles qui compensaient un modèle plus faible : il faut le mesurer avec `aeom bench`, avant et après, sur de vrais runs.
- Le canevas partagé où l'on commente en pointant.

---
id: 18
title: Les juges écrivent leurs constats dans la langue de la personne
milestone: 05-construire
depends_on: []
design: null
status: done
tracker: { tool: github, id: 170, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/170 }
---

## Ce que l'utilisateur fait
Il lance `/aeom` en français. Ce que les juges trouvent sur ses écrans et ses parcours, il le lit en français, sur la page de résultat comme dans le chat.

## Ce qu'il voit
Sur la page de résultat, dans « Encore à régler », des constats comme « Sur téléphone, la capture du tableau de bord est réduite à 350 px de large : ses textes et ses tableaux deviennent illisibles. ». Aujourd'hui, il lit « On mobile the full desktop dashboard screenshot is shrunk to about 350px wide… ».

## C'est fini quand
- [ ] Un run lancé en français a tous ses constats en français : ceux des écrans, ceux des parcours, ceux du style gardé, et la raison d'une fonctionnalité qui manque.
- [ ] Les noms des principes ne changent pas avec la langue. Les votes se comptent toujours à la majorité, et un run en français se compare à un run en anglais.
- [ ] L'accord par catégorie et les leçons se comptent ensemble, quelle que soit la langue du run.
- [ ] Quand la langue de la personne n'est pas connue, les constats sont en anglais, comme aujourd'hui.

## Les règles
- Le run du 4 novembre, sur le site de The Vibe Company, avait sa page en français et ses constats en anglais.

## Comment
- **Le skill.** `skills/aeom/SKILL.md` connaît déjà la langue de la personne : il la passe à `aeom report --lang`. Il la donne aussi au brief de chaque juge.
- **Les juges.** `skills/aeom-judge/SKILL.md` écrit le constat dans cette langue, et le nom du principe toujours tel quel.
- **Les agents.** `agents/claude/aeom-judge.md` et `agents/codex/`, pour que Claude Code et Codex fassent pareil.

## Hors ticket
- La forme de la page de résultat : ticket 17.
- D'autres langues que le français et l'anglais.

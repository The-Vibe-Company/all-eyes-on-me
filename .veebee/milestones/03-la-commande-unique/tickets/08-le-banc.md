---
id: 08
title: Le banc : trois apps aux défauts notés à la main, et ce qu'AEOM en trouve et en corrige
milestone: 03-la-commande-unique
depends_on: [01, 03]
design: null
tracker: { tool: github, id: 54, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/54 }
---

## Ce que l'utilisateur fait
Il lance le banc et voit, en chiffres, ce qu'AEOM trouve et corrige sur des apps dont on connaît les défauts.

## Ce qu'il voit
Un tableau par app : défauts connus trouvés sur le total, corrigés sur le total, régressions, features en douce, coût en tokens. À part, ce qu'AEOM a trouvé en plus des défauts notés.

## C'est fini quand
- [ ] Le repo contient trois apps de banc : l'app de démo et deux apps faites par un agent sans AEOM, chacune avec ses défauts notés à la main (écran ou parcours, ce qui ne va pas)
- [ ] Chaque app de banc a ses parcours clés enregistrés (`.aeom/journeys/`) et, si elle garde des données, sa commande de remise à zéro : le garde-fou et le cliquet des parcours peuvent mesurer sur les trois
- [ ] Le banc lance `/aeom` sans option sur chacune, avec des données fictives, et compare le résultat aux défauts notés
- [ ] Le tableau compte, par app : défauts trouvés, défauts corrigés, régressions (un contrôle ou un principe qui passait et échoue après), features en douce (le garde-fou) et coût en tokens
- [ ] Un défaut trouvé est apparié à un défaut noté par son écran ou son parcours et le contrôle ou le principe en cause ; chaque appariement cite sa preuve
- [ ] Ce qu'AEOM trouve en plus des défauts notés est listé à part, pour qu'on l'ajoute à la liste ou qu'on le rejette
- [ ] Une app de banc qui ne démarre pas : le banc le dit et continue avec les autres

## Comment
- Le modèle est l'évaluation de skill-creator : des attentes par cas (`evals.json`), une correction qui cite sa preuve (`grading.json`), un tableau agrégé (`benchmark.json`).
- Le run reste piloté par le skill, dans une session Claude Code (les juges sont des sous-agents) ; une commande peut compter les résultats à partir de `.aeom/runs/<run>/` et des défauts notés.

## Hors ticket
- Plusieurs passages et l'écart avec le jalon d'avant : 09.

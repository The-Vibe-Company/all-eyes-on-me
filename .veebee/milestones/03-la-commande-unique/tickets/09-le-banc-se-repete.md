---
id: 09
title: Le banc se répète : stabilité sur trois passages et écart avec la fois d'avant
milestone: 03-la-commande-unique
depends_on: [08]
design: null
tracker: { tool: github, id: 55, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/55 }
---

## Ce que l'utilisateur fait
Il sait si AEOM dit la même chose d'un passage à l'autre, et s'il progresse d'un jalon à l'autre.

## Ce qu'il voit
Pour chaque app, les trois passages, ce sur quoi ils divergent, et l'écart avec le passage du jalon d'avant, en mieux ou en moins bien.

## C'est fini quand
- [ ] Le banc passe trois fois sur chaque app ; le tableau donne, pour chaque mesure, la moyenne et l'écart
- [ ] Les verdicts qui changent d'un passage à l'autre sont listés (un défaut trouvé une fois sur trois, un principe qui change de camp)
- [ ] Chaque passage est gardé avec sa date et la version d'AEOM ; le tableau montre l'écart avec le précédent
- [ ] À la fin d'un jalon, les chiffres du banc sont dans le journal de l'autopilot
- [ ] La première fois, sans passage précédent, le banc le dit au lieu d'un écart vide

## Comment
- L'analyste de skill-creator (`agents/analyzer.md`) repère déjà les attentes qui ne discriminent rien et les cas instables : même lecture pour les principes et les juges.

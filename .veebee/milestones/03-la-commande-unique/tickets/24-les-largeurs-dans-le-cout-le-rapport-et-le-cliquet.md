---
id: 24
title: Les largeurs dans le coût, le rapport et le cliquet
milestone: 03-la-commande-unique
depends_on: [23]
design: null
tracker: { tool: github, id: 111, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/111 }
---

## Ce que l'utilisateur fait
Il a déclaré les largeurs qui comptent : il paie moins, la page de résultat le dit, et AEOM ne compare jamais deux mesures faites sur des largeurs différentes.

## Ce qu'il voit
`aeom estimate` coûte moins avec une seule largeur. En tête de la page de résultat : « Measured at 1280 px; 390 px left out by the config ». Quand la fiche produit parle d'une app native et que la config ne dit rien des largeurs, AEOM demande une fois, avant les juges : « la fiche parle d'une app iOS pour le mobile : faut-il quand même juger en 390 px ? ».

## C'est fini quand
- [ ] `aeom estimate` lit les largeurs (config ou `--widths`) : avec une seule largeur, les juges et les rejeux coûtent moins, en tokens et en minutes
- [ ] La page de résultat dit en tête les largeurs mesurées, et celle du défaut qui a été écartée
- [ ] `aeom compare` et le cliquet des parcours refusent de comparer deux mesures faites sur des listes de largeurs différentes, et disent lesquelles
- [ ] Quand la fiche parle d'une app native à côté et que la config ne dit rien des largeurs, `/aeom` le signale une fois avant les juges et demande s'il faut juger en 390 px ; non : le run prend `--widths 1280`, et AEOM dit la clé à écrire pour les prochains runs
- [ ] Sans la clé, l'estimation, la page et le cliquet restent ceux d'aujourd'hui

## Hors ticket
- La clé elle-même et sa propagation dans la capture, le contrôle, le rejeu et le verdict : ticket 23.

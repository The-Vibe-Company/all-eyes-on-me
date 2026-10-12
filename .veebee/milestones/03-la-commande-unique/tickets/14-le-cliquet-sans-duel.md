---
id: 14
title: Le cliquet des parcours tranche sur les critiques, sans duel
milestone: 03-la-commande-unique
depends_on: []
design: null
status: done
tracker: { tool: github, id: 93, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/93 }
---

## Ce que l'utilisateur fait
Rien de plus : un run garde ou renvoie un parcours sans payer trois juges de duel.

## Ce qu'il voit
`aeom compare --journeys <avant> <après> --by-critique` décide parcours par parcours à partir des deux critiques, sans duel : un parcours reste s'il va au bout partout où il y allait, que le garde-fou ne refuse rien, qu'aucun principe qui passait n'échoue maintenant, et qu'au moins un problème a disparu. Sinon il dit pourquoi l'ancien revient.

## C'est fini quand
- [ ] Avec `--by-critique`, un parcours qui garde ses principes et en règle un reste, sans aucun vote de duel
- [ ] Un principe qui passait avant et échoue après fait revenir l'ancien, en le nommant
- [ ] Un parcours sans aucun changement de critique revient, avec « rien de mieux selon la critique »
- [ ] Une cassure nouvelle ou un refus du garde-fou le fait revenir, comme aujourd'hui
- [ ] Sans `--by-critique`, rien ne change : les duels décident
- [ ] Sans critique de l'un des deux rejeux, il le dit et sort en erreur

## Comment
`ratchetJourneys` dans `packages/core/src/journey/ratchet.ts`, l'option dans la commande `compare` de la CLI.

## Hors ticket
Le skill qui s'en sert : ticket 15.

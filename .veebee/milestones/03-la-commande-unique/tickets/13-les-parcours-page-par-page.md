---
id: 13
title: aeom journey --by-page range les problèmes des parcours page par page
milestone: 03-la-commande-unique
depends_on: []
design: null
status: done
tracker: { tool: github, id: 92, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/92 }
---

## Ce que l'utilisateur fait
Rien de plus : c'est ce qui permet à `/aeom redo` de donner à chaque worker de page les problèmes de parcours qui tombent sur sa page, au lieu de lancer une vague de parcours à part.

## Ce qu'il voit
`aeom journey --by-page` lit le dernier rejeu (`--out`) et la critique des parcours (`--critique`, `.aeom/reports/judge-journeys.json` par défaut), et dit, page par page (une route par forme, `/notes/:id`), chaque étape d'un parcours qui s'y trouve et y échoue : le parcours, le numéro de l'étape, le principe, la raison ; et chaque parcours qui casse sur cette page. Sans critique, il ne donne que les cassures.

## C'est fini quand
- [ ] Un principe qui échoue à l'étape 3 d'un parcours est rangé sous la route où l'utilisateur est à l'étape 3
- [ ] Un parcours qui casse à l'étape N est rangé sous la route où il était avant l'étape N, la page de départ quand N vaut 1
- [ ] Deux routes de même forme (`/notes/1`, `/notes/2`) font une seule page
- [ ] `--json` écrit le même contenu en JSON, pour le coordinateur
- [ ] Sans rejeu, ou avec un rejeu illisible, il le dit et sort en erreur ; sans critique, il le dit et ne donne que les cassures

## Comment
`packages/core/src/journey/` (une fonction pure à côté de `planJourneyWave`, testée), `packages/cli/src/commands/journey.ts` pour l'option, `pairRoutes`/`pageShape` de `packages/core/src/capture/shape.ts` pour les formes de route.

## Hors ticket
Le skill qui s'en sert : ticket 15.

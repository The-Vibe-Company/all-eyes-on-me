---
id: 02
title: aeom check : 4 contrôles mesurables
milestone: null
depends_on: [01]
design: null
status: done
tracker: { tool: github, id: 2, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/2 }
---

## Ce que l'utilisateur fait
Il lance `aeom check` et apprend ce qui est objectivement cassé, page par page.

## Ce qu'il voit
Pour chaque page, les contrôles en échec avec l'élément en cause, ou une seule ligne si tout passe. Un rapport JSON dans `.aeom/reports/`.

## C'est fini quand
- [ ] Sur ugly-app, `aeom check` trouve les boutons sans curseur pointer
- [ ] Il trouve les pages qui défilent horizontalement à 390 px
- [ ] Il trouve les textes sous le contraste AA
- [ ] Il trouve les erreurs dans la console
- [ ] Il écrit son rapport dans `.aeom/reports/` et sort en erreur dès qu'un contrôle échoue
- [ ] Tout passe : une ligne, et un code de sortie à 0

## Les règles
- Tout contrôle est bloquant : une page qui en échoue un n'est pas mergée (CONTEXT.md).

## Comment
- `packages/core/src/checks/` : un module par contrôle (`cursor.ts`, `overflow.ts`, `contrast.ts`, `console.ts`), tous avec la même signature, qui prennent une page Playwright ouverte.
- Curseur : style calculé des éléments cliquables (liens, boutons, `[role=button]`, éléments avec un gestionnaire de clic).
- Contraste : axe-core injecté dans la page.
- Réutilise le démarrage de l'app et la découverte des pages de 01.
- `packages/cli/src/commands/check.ts`.

## Hors ticket
- Valeurs en dur, composants du kit, header identique partout : ils arrivent avec le kit, après la V0.
- Hiérarchie, alignements, densité : 03.

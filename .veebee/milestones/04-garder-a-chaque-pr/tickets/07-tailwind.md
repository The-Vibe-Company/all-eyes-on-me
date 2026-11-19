---
id: 07
title: La relecture lit les classes Tailwind : une couleur de la palette ou une valeur entre crochets hors du standard est dite
milestone: 04-garder-a-chaque-pr
depends_on: [01]
design: null
status: done
tracker: { tool: github, id: 195, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/195 }
---

## Ce que l'utilisateur fait
Il ouvre une PR sur un front en Tailwind (le cas de la plupart des fronts faits par des agents) et regarde ce que `aeom review` en dit.

## Ce qu'il voit aujourd'hui
La relecture du code ne lit que la forme `propriété: valeur` (CSS, style en JSX) et les couleurs entre crochets (`bg-[#7c3aed]`). Une classe `bg-purple-600`, `p-[13px]`, `rounded-[10px]`, `text-[18px]` ou `font-['Inter']` passe sans rien dire, alors qu'elle sort du standard.

## Ce qu'il doit voir
Chaque classe Tailwind hors du standard, avec son fichier et sa ligne, dite comme les autres écarts :
- une couleur de la palette par défaut de Tailwind (`bg-purple-600`, `text-gray-500/80`, `hover:border-red-200`) quand le standard a ses propres couleurs ;
- une valeur arbitraire entre crochets en espace (`p-[13px]`, `mt-[22px]`, `gap-[10px]`), en taille de texte (`text-[18px]`), en arrondi (`rounded-[10px]`) ou en police (`font-['Inter']`), qui n'est pas une valeur du standard, ou qui est la valeur d'un token écrite en dur.

## C'est fini quand
- [ ] `reviewCode` (`packages/core/src/review/review.ts`) lit les classes des lignes ajoutées, variantes (`hover:`, `md:`, `dark:`), `!` et opacité (`/50`) comprises
- [ ] Une couleur de la palette par défaut est un écart quand le standard a des couleurs, sauf si le standard a un token de ce nom (`--color-purple-600` en Tailwind v4, `purple` dans `tailwind.config`)
- [ ] `white`, `black`, `transparent`, `current`, `inherit` ne sont jamais un écart
- [ ] Une valeur entre crochets en espace, taille, arrondi ou police est dite comme les mêmes valeurs en CSS : « the space 13px is not a space of the standard », ou « … is --x written in hard: use the token »
- [ ] Les échelles par défaut de Tailwind (`p-4`, `text-lg`, `rounded-xl`) ne sont jamais un écart ; une valeur entre crochets qui passe par une variable (`p-[var(--s)]`) non plus
- [ ] Les fichiers des tokens, `fill-` et `stroke-` (le dessin d'une icône) ne sont pas lus, comme aujourd'hui
- [ ] Des tests dans `packages/core/src/review/review.test.ts`, et un test de bout en bout dans `packages/cli/src/commands/review.test.ts`

## Hors ticket
- Proposer le token le plus proche : ticket 08.
- Lire `tailwind.config` pour écrire le standard : c'est l'écriture du standard (session redo).

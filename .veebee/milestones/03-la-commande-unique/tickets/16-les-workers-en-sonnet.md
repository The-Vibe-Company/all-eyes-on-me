---
id: 16
title: Les workers tournent en Sonnet
milestone: 03-la-commande-unique
depends_on: []
design: null
status: done
tracker: { tool: github, id: 95, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/95 }
---

## Ce que l'utilisateur fait
Il lance `/aeom redo` depuis une session Opus : les workers ne coûtent plus le prix d'Opus.

## Ce qu'il voit
Le skill lance chaque worker (directions, kit, pages, promotion, parcours) avec `model: "sonnet"`, comme les juges. `aeom estimate` dit sur quel modèle tournent les agents.

## C'est fini quand
- [ ] Chaque brief de worker du skill demande `model: "sonnet"` à l'outil Agent
- [ ] `aeom estimate` dit que juges et workers tournent en Sonnet, la session qui coordonne sur son propre modèle
- [ ] Un run réel sur l'app de démo en Sonnet garde au moins autant de pages et de parcours qu'avant, mesuré par le banc

## Comment
`skills/aeom/SKILL.md` (« Briefing any worker »), `packages/core/src/run/estimate.ts`.

## Hors ticket
Le choix du modèle par l'utilisateur : plus tard, s'il le demande.

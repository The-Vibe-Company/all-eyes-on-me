---
id: 03
title: AEOM dit ce qu'un run a vraiment coûté, et l'estimation part de là
milestone: 06-moins-cher-et-sur-codex
depends_on: [01]
design: null
tracker: { tool: github, id: 135, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/135 }
---

## Ce que l'utilisateur fait
Après un run, il demande ce que ce run a coûté. Avant un run, l'estimation lui annonce un chiffre qui tient.

## Ce qu'il voit
Le coût du run, rôle par rôle : le coordinateur, les directions, les pages, les parcours, les juges. Pour chacun : les tokens relus, écrits et produits, le modèle et l'équivalent au prix de l'API.

## C'est fini quand
- [ ] `aeom cost <run>` lit les transcripts locaux de la session qui a mené le run et de ses sous-agents, et donne le coût rôle par rôle
- [ ] Il marche sur un run mené depuis Claude Code et sur un run mené depuis Codex
- [ ] Il ne lit que les comptes d'usage et les premières lignes des briefs, jamais le reste des conversations, et rien ne sort de la machine
- [ ] L'estimation d'avant le run est recalibrée sur ces mesures et annonce un équivalent au prix de l'API, plus des tokens qui ne disent pas ce que coûte le run
- [ ] La page de résultat montre le coût réel à côté de l'estimation

## Hors ticket
- Un plafond de dépense qui arrête un run.

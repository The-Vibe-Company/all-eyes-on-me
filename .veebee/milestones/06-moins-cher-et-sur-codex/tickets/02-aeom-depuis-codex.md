---
id: 02
title: AEOM se lance depuis Codex
milestone: 06-moins-cher-et-sur-codex
depends_on: [01]
design: null
tracker: { tool: github, id: 134, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/134 }
---

## Ce que l'utilisateur fait
Il lance AEOM depuis Codex comme depuis Claude Code (`$aeom`, `$aeom judge`, `$aeom review`…), sur son forfait ChatGPT.

## Ce qu'il voit
Le même run : le coût annoncé avant les juges, les captures envoyées au fil de l'eau, les questions posées avec l'outil de question de Codex, la page de résultat et la PR.

## C'est fini quand
- [ ] Les skills `aeom` et `aeom-judge` s'installent pour Codex, et le README dit comment
- [ ] `aeom-worker` et `aeom-judge` existent comme agents Codex (`~/.codex/agents/*.toml`), avec un modèle léger et un effort de raisonnement réglés, sans apps, plugins ni mémoires
- [ ] Les skills disent ce qu'il faut faire sur chacun des deux hôtes : lancer un agent, poser une question (`AskUserQuestion` / `request_user_input`), montrer une capture
- [ ] Un `$aeom judge` complet tourne depuis Codex sur l'app d'exemple, du coût annoncé jusqu'au verdict
- [ ] Rien de ce qui marche dans Claude Code ne change

## Comment
Codex lit les skills au format SKILL.md et lance les agents définis dans `~/.codex/agents/` (`name`, `description`, `developer_instructions`, `model`, `model_reasoning_effort`), en parallèle. Le CLI `aeom` ne change pas : il est le même pour les deux hôtes.

## Hors ticket
- Un run mené depuis Claude Code qui délègue ses workers à Codex.
- Le coût mesuré d'un run Codex : ticket 03.

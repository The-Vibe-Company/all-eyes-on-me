---
id: 01
title: /aeom sans option comprend le produit et, si quelque chose échoue, part sur une DA nouvelle et refait les pages dessus
milestone: 03-la-commande-unique
depends_on: []
design: null
tracker: { tool: github, id: 47, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/47 }
---

## Ce que l'utilisateur fait
Il lance `/aeom` sur son app, sans choisir de mode, et retrouve son front refait sur une branche, ou apprend qu'il n'y a rien à refaire.

## Ce qu'il voit
AEOM dit ce qu'il fait à chaque étape : la fiche produit, les parcours rejoués, les écrans mesurés, puis les six directions, le tournoi, le champion, la vague des pages, et ce que le cliquet a gardé. Ou une seule phrase, « rien à refaire », avec ce qu'il a mesuré.

## C'est fini quand
- [ ] Sur l'app de démo, `/aeom` sans option écrit la fiche produit, rejoue les parcours et mesure chaque écran, puis lance les six directions et le tournoi sans qu'on le lui demande
- [ ] Le champion devient le kit, la vague des pages refait les autres écrans dessus, et le cliquet ne garde que les écrans meilleurs, le tout sur `aeom/<run>`
- [ ] Sur une app où aucun contrôle et aucun principe n'échoue, `/aeom` dit « rien à refaire », montre ce qu'il a mesuré, et ne crée ni branche ni worktree
- [ ] `/aeom --directions` et `/aeom --ux` forcent encore leur mode, comme aujourd'hui
- [ ] L'app ne démarre pas : AEOM s'arrête, dit pourquoi avec la sortie de la commande de démarrage, et ne crée rien
- [ ] La branche de l'utilisateur ne change pas : tout ce que le run garde est sur `aeom/<run>`

## Comment
- Les étapes existent déjà dans `skills/aeom/SKILL.md`. Le ticket ajoute en tête une section « Sans option » qui les enchaîne dans cet ordre et décide : d'abord comprendre le produit (2c, étapes 1 à 9), puisque les directions en partent ; puis regarder (section 1) ; rien n'échoue, on s'arrête ; sinon les directions (2b), la vague des pages (4), et mesurer pour garder ce qui est meilleur (5).
- Une app où rien n'échoue pour le vérifier : la landing d'AEOM (`site/`) si elle passe tout, sinon une petite app propre dans les fixtures des tests.

## Hors ticket
- La DA tirée de la fiche produit : 02.
- Les parcours refaits dans le même run : 03.
- Garder le style existant : 04.
- La page de résultat : 05.
- La PR : 10.

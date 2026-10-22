---
id: 04
title: Un run coûte ce qu'il doit, sans qu'on en parle à l'utilisateur
milestone: 06-moins-cher-et-sur-codex
depends_on: [03]
design: null
status: done
tracker: { tool: github, id: 146, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/146 }
---

## Ce que l'utilisateur fait
Il lance `/aeom`, `/aeom directions` ou `/aeom build` : le run démarre et va au bout sans lui parler d'argent. Il coûte moins cher qu'avant.

## Ce qu'il voit
Plus aucun tableau de coût, plus d'attente d'un go pour le coût, rien en dollars : ni dans la session, ni sur la page de résultat, ni sur la landing.

## C'est fini quand
- [ ] Le skill n'annonce plus le coût et n'attend plus de go pour le coût, dans aucun de ses modes. `/aeom judge` s'arrête toujours au verdict
- [ ] La page de résultat ne montre plus de coût. La landing et le README n'en parlent plus à l'utilisateur
- [ ] `aeom estimate` et `aeom cost` restent, pour mesurer et pour le banc, sans que le skill les montre
- [ ] Le coordinateur reste sur Opus mais réfléchit moins (`effort: medium` sur le skill)
- [ ] Toutes les directions d'un tour sont capturées, mises en planche et contrôlées en une seule commande, au lieu de trois appels par direction
- [ ] Une variante d'une direction déjà retenue tourne sur Sonnet ; une nouvelle direction garde le modèle de la session

## Les mesures de départ
`/aeom directions` du 22 octobre, avec trois tours (3 directions, 3 nouvelles, 6 variantes) : ≈ 25 $ au prix de l'API.
- Coordinateur : 6,4 $ (65 appels, Opus).
- 12 workers de direction : 19 $ (Opus).
- Juges : 0,3 $.

## Les règles
- « Je ne suis pas pour annoncer le coût à l'user, c'est anxiogène, juste le rendre acceptable » (Antoine, 22 octobre).
- Le coordinateur reste sur Opus (Antoine, 22 octobre).

## Hors ticket
- Les nouvelles directions sur Sonnet : non décidé.
- AEOM depuis Codex : #134.

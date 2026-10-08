---
id: 08
title: Le pilote : /aeom --ux sur Road-To-Mastock, avec des données fictives
milestone: 02-couche-ux
depends_on: [03, 07]
design: null
tracker: { tool: github, id: 37, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/37 }
---

## Ce que l'utilisateur fait
Antoine lance `/aeom --ux` sur Road-To-Mastock, son suivi de séances Basic-Fit mêlé à un jeu de collection de cartes, et récupère sa fiche produit, la critique de ses parcours et des parcours refaits, sans que ses vraies données soient jamais touchées.

## Ce qu'il voit
Dans Road-To-Mastock : `.aeom/product.md` écrit seul, les parcours critiqués avec captures, une branche `aeom/<run>` avec les parcours refaits et l'avant/après de chacun.

## C'est fini quand
- [ ] Antoine fournit la base et le compte fictifs ; AEOM ne démarre Road-To-Mastock qu'avec cette base, et s'arrête en le disant si elle manque
- [ ] `/aeom --ux` écrit seul le `product.md` de Road-To-Mastock : la boucle séance, jeton, paquet, carte, et 3 à 5 parcours clés
- [ ] Les parcours se rejouent sur la base fictive, y compris ceux qui terminent une séance malgré la règle d'une récompense par jour
- [ ] La critique, les parcours refaits et l'avant/après restent dans Road-To-Mastock (`.aeom/` et une branche `aeom/<run>`) ; rien n'est poussé dans le repo d'AEOM, aucune capture n'est publiée
- [ ] Antoine corrige `product.md` après coup, et le run suivant part de sa version
- [ ] Ce que le pilote apprend à AEOM devient une issue ou une PR sur AEOM, en mots, sans capture de Road-To-Mastock

## Comment
- Road-To-Mastock est une app web Next.js (pnpm, port 3000), tout derrière un login email + mot de passe, données dans Neon via `DATABASE_URL`. Il n'a ni seed ni compte de démo : la base fictive et le compte viennent d'Antoine, par exemple dans un `.env` réservé à AEOM.
- Lancer l'app construite (`pnpm build` puis `pnpm start`) plutôt que `pnpm dev` : en dev, le garde-fou d'hydratation recharge la page si la première compilation dépasse 4 secondes.
- À la première visite, l'accueil empile plusieurs fenêtres d'annonce. C'est un constat à faire (04), pas un obstacle à contourner en douce.
- Les parcours qui terminent une séance ont besoin d'une date différente, ou d'une base remise à zéro, à chaque passage.

## Hors ticket
- Ce que les corrections d'Antoine apprennent au juge : la distillation, en V1.
- Carnet, l'autre pilote : plus tard, et jamais sur ses vraies données.

---
id: 03
title: Une app derrière un login : AEOM se connecte avec un compte fictif
milestone: 02-couche-ux
depends_on: [02]
design: null
status: done
tracker: { tool: github, id: 32, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/32 }
---

## Ce que l'utilisateur fait
Il lance AEOM sur une app où il faut être connecté, comme Road-To-Mastock, et AEOM se connecte tout seul avec un compte de test avant de capturer et de parcourir.

## Ce qu'il voit
Des captures de l'app connectée, pas de la page de connexion. Si le compte ne marche pas, un message clair qui le dit, et rien de capturé.

## C'est fini quand
- [x] L'app de démo a une page de connexion ; sans être connecté, ses pages y mènent
- [x] Le compte fictif de l'app de démo est dans ses fixtures ; la config d'AEOM dit comment se connecter et où prendre le compte, jamais un vrai
- [x] `aeom capture`, `aeom check` et `aeom journey` se connectent avant de commencer, et les captures montrent l'app connectée
- [x] Compte refusé : AEOM s'arrête et dit que la connexion a échoué, au lieu de capturer la page de connexion comme si c'était l'app
- [x] Le mot de passe n'apparaît dans aucun rapport, aucune capture de champ, aucun log
- [x] La page de connexion elle-même peut être un parcours, jugé comme les autres : un parcours marqué comme partant sans session démarre déconnecté, tous les autres se connectent d'abord

## Comment
- `examples/ugly-app/server.mjs` gagne une page `/connexion` et un cookie de session ; le compte fictif vit à côté de l'app (une fixture), pas dans le code d'AEOM.
- La connexion se fait une fois par run et se garde dans l'état du navigateur (Playwright `storageState`), réutilisé par capture, check et journey.
- `.aeom/config.json` (`loadConfig` dans `packages/core/src/run/config.ts`) gagne une entrée de connexion.

## Hors ticket
- La base et le compte fictifs de Road-To-Mastock : fournis par Antoine, pour 08.

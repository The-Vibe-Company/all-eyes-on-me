---
id: 03
title: Le juge : un sous-agent passe chaque page à la grille des principes de base
milestone: null
depends_on: [01]
design: null
tracker: null
---

## Ce que l'utilisateur fait
Il demande au juge ce que valent ses pages, et reçoit un verdict pour chaque principe.

## Ce qu'il voit
Pour chaque page, la liste des principes de base, chacun marqué passe ou ne passe pas, avec une phrase de raison. Le verdict est aussi écrit dans `.aeom/reports/`.

## C'est fini quand
- [ ] `principles/base.md` contient le brouillon des principes de base, en texte seul
- [ ] Le juge lit les captures et rend, pour chaque page et chaque principe, passe ou ne passe pas, avec la raison
- [ ] Sur ugly-app, il relève les headers différents et l'état vide absent
- [ ] Il vote 3 fois par page et garde la majorité
- [ ] Son verdict est écrit dans `.aeom/reports/`

## Les règles
- Les principes de base sont du texte, sans images (CONTEXT.md).
- Le juge vote trois fois, la majorité l'emporte (CONTEXT.md).

## Comment
- `principles/base.md` à la racine du repo. Le brouillon : curseur pointer sur tout ce qui est cliquable ; une seule DA assumée ; header, navigation et boutons identiques partout ; rien de générique (pas de dégradé violet, pas de cartes avec ombre partout, pas d'emojis décoratifs, pas de mise en page façon template SaaS) ; une hiérarchie claire avec un seul point focal par écran ; des alignements sur une grille ; une densité maîtrisée ; des états vide, erreur et chargement présents.
- `skills/aeom-judge/SKILL.md` : le skill que le coordinateur confie à un sous-agent. Il lit `.aeom/captures/` et `principles/base.md`, et écrit un JSON par page. La CLI n'appelle aucune API : le modèle est celui de la session.
- Les 3 votes sont 3 sous-agents indépendants ; on garde la majorité principe par principe.

## Hors ticket
- La comparaison par paires : 05 pour les directions, puis le cliquet après la V0.
- La version définitive des principes de base se fixe lors d'une séance, pas dans ce ticket.

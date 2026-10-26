---
id: 09
title: Les finitions d'un front soigné, mesurées
milestone: 05-construire
depends_on: [08]
design: null
status: done
tracker: { tool: github, id: 153, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/153 }
---

## Ce que l'utilisateur fait
Il lance `/aeom` ou `/aeom judge` comme avant. AEOM mesure aussi les détails qu'un designer soigneux ne laisse jamais passer, et que les workers oublient.

## Ce qu'il voit
`aeom check` nomme, page par page, l'élément fautif et ce qu'il faudrait :
- un coin intérieur aussi rond que la carte qui le tient ;
- un mot seul sur la dernière ligne d'un titre ;
- une transition laissée à la courbe par défaut du navigateur, ou une animation qui déplace la mise en page ;
- une finition oubliée : le titre de la page, sa description, son image de partage, son icône, le lien d'évitement, la page 404.

## C'est fini quand
- [ ] Les rayons imbriqués : quand une forme arrondie en tient une autre à moins de 32 px de son bord, le rayon intérieur vaut le rayon extérieur moins l'écart (à 4 px près) ; sinon `aeom check` le nomme, avec le rayon attendu
- [ ] Le mot orphelin : un titre de plusieurs lignes dont la dernière ligne n'a qu'un mot est nommé, à chaque largeur, avec `text-wrap: balance` comme remède
- [ ] Les animations : une transition laissée à la courbe par défaut (`ease`) ou à `linear` sur un élément qu'on touche, une transition de `top`, `left`, `width` ou des marges, et une animation qui change aussi `height`, sont nommées ; un accordéon qui s'ouvre sur sa hauteur et un lien d'évitement qui glisse sont laissés
- [ ] Les finitions, une fois par page : un titre absent ou générique (« React App », « Vite App », « Document »), une icône absente ; sur une page publique, sa description et son image de partage ; un lien d'évitement vers le contenu quand la page a une navigation avant lui
- [ ] La page 404 : une adresse qui n'existe pas répond 404 avec une page qui dit où l'on est et ramène quelque part ; vérifié une fois par site, jamais sur une maquette
- [ ] Ce qu'un bon front fait n'est pas nommé : une pilule dans une carte, une animation de `transform` ou d'`opacity`, un titre d'une ligne, une icône SVG, un lien d'évitement caché jusqu'au focus
- [ ] Avec le style gardé, les rayons et les animations appartiennent à la charte : dits, jamais refaits

## Les règles
- Les règles de métier mesurables du skill d'Elaya (rayons imbriqués, mot orphelin, animations, finitions), prises comme contrôles et pas comme style (Antoine, 26 octobre).

## Comment
Quatre contrôles de plus dans `packages/core/src/checks/` (`nested-radius`, `orphan`, `motion`, `finish`), dans `run.ts`. La 404 se mesure une fois dans `checkSite`, pas sur un dossier servi (`aeom check --dir`). `nested-radius` et `motion` rejoignent `STYLE_CHECKS` (`packages/core/src/run/verdict.ts`).

## Hors ticket
- Les choix de style d'Elaya (ses polices, son échelle d'espacements, son titre en dégradé) : AEOM tire chaque direction du produit, pas d'un système figé.
- Déclarer qu'une finition est voulue autrement : les exceptions de `product.md`, ticket 10.

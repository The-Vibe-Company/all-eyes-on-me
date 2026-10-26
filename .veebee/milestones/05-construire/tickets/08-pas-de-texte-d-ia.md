---
id: 08
title: Pas de texte d'IA, pas de trous, pas de mots creux
milestone: 05-construire
depends_on: [07]
design: null
status: done
tracker: { tool: github, id: 152, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/152 }
---

## Ce que l'utilisateur fait
Il lance `/aeom`, `/aeom directions` ou `/aeom build` comme avant. Les écrans qu'AEOM rend ne parlent jamais d'eux-mêmes : pas de petite phrase sous un bouton pour dire à quoi il sert, pas de bandeau « Maquette de démonstration », pas de « Dès [PRIX] » oublié, pas de « révolutionnez votre quotidien ».

## Ce qu'il voit
Des écrans dont chaque texte est celui du produit, rempli de données crédibles. Quand un écran (le sien, ou celui d'un worker) a encore un de ces textes, `aeom check` le nomme, avec l'élément et le texte trouvé, et le verdict le compte comme un échec à refaire.

## C'est fini quand
- [ ] `aeom check` nomme les trous laissés dans une page : un texte entre crochets en capitales (« [PRIX] », « [À DÉFINIR] »), un gabarit non rempli (« {{nom}} »), du lorem ipsum, un TODO, une valeur vide affichée (« undefined », « NaN », « [object Object] »), dans le texte visible comme dans le titre, les textes d'aide des champs et les textes alternatifs
- [ ] `aeom check` nomme le texte d'IA : une phrase qui parle de l'interface (« Ce bouton vous permet de… », « Cliquez ici pour… », « Ici, vous pouvez… ») ou de la démo (« Maquette de démonstration », « Voici votre démo », « Données fictives »), en français et en anglais
- [ ] `aeom check` nomme les mots creux : « révolutionnez », « sans effort », « boostez », « revolutionize », « seamless », « supercharge »…, en français et en anglais
- [ ] Une page saine n'est pas nommée : un message d'erreur (« Ce champ est obligatoire »), une note entre crochets en minuscules, un nombre entre crochets, un siècle en chiffres romains
- [ ] Les maquettes de `/aeom directions` sont contrôlées de la même façon, et `aeom mockups` dit ce qu'il trouve à côté de chaque direction
- [ ] Les workers (directions, maquettes, kit, pages, parcours, build) ont une consigne ferme : aucun texte sur l'interface ou la démo, aucun trou, aucun mot creux ; chaque texte est celui du produit

## Les règles
- « je veux pas de petites phrases que l'IA met partout, petites phrases explicatives de ça sert à ci, ça sert à ça, voici ta démo » (Victor, 16 octobre).
- Des bandeaux « Maquette de démonstration » et des trous comme « Dès [PRIX] » ou « [À DÉFINIR] » sont passés à travers des runs (retour de Victor, 26 octobre).
- Les mots creux d'Elaya : « revolutionize », « supercharge », « effortless » (26 octobre).

## Comment
Trois contrôles de plus dans `packages/core/src/checks/` (`placeholder`, `ai-text`, `hollow-words`), mesurés une fois par page à la plus grande largeur, à côté des autres dans `run.ts`. Les consignes vivent dans `skills/aeom/phase-wave.md` (« Briefing any worker »), `phase-mockups.md` (le brief des maquettes) et `phase-build.md`.

## Hors ticket
- Les rayons imbriqués, le mot orphelin, les animations et les finitions (titre, description, og:image, favicon, lien d'évitement, 404) : ticket 09.
- Déclarer qu'un texte est voulu (une démo assumée) : les exceptions de `product.md`, ticket 10.

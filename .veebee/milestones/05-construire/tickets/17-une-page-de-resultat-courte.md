---
id: 17
title: "La page de résultat tient en quelques écrans : le verdict d'abord, l'avant / après au curseur"
milestone: 05-construire
depends_on: [14]
design: null
status: done
tracker: { tool: github, id: 171, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/171 }
---

## Ce que l'utilisateur fait
À la fin d'un run, il ouvre la page de résultat et sait en un écran ce que le run a donné. Il glisse sur un écran refait pour passer d'avant à après, et n'ouvre une page entière que s'il le veut.

## Ce qu'il voit
Une maquette a été faite le 10 novembre sur un vrai run, celui du site de The Vibe Company (`run-20261104-1134`). Elle est restée sur la machine, puisque les captures ne sortent pas. Elle fait 4 092 px de haut à l'ordinateur, contre 48 846 pour la page d'aujourd'hui. Elle prend le style du site d'AEOM : le jaune, l'encre et l'œil (`site/shared/kit.css`).

- **En tête, sur le jaune.** Le verdict en titre (« 3 écrans refaits sur 11, 1 parcours amélioré sur 5 »), puis une phrase sur ce qui reste. Ensuite, quatre chiffres : les problèmes sur les écrans (avant → fin), les problèmes sur les parcours, les fonctionnalités ajoutées, et ce qui reste à régler. La direction tient en une ligne, son texte entier replié.
- **Une barre collée en haut** : Refaits, Remis comme avant, Parcours, Ce qui manque, Encore à régler, chacun avec son nombre.
- **Les écrans refaits, en grand.** Le haut de la page à l'ordinateur et au téléphone, avec avant et après sur la même image et un curseur à glisser. À côté : le nombre de problèmes avant → après, ce qui est réglé dit en mots, « Voir la page entière », et « d'accord / pas d'accord ».
- **Les écrans remis comme avant.** Une ligne chacun : une vignette, la raison (« sa version faisait pire : 2 → 3 »), et combien de problèmes à la fin.
- **Les parcours.** Le parcours amélioré montre ses étapes en vignettes, les autres sont repliés. Pour chacun, ce qui est réglé et ce qui reste, en mots.
- **Ce qui manque**, avec la capture de l'étape qui bloque, puis **ce qui reste à régler**, groupé par écran et par parcours.
- **La page entière ne s'ouvre qu'au clic** : avant et après côte à côte, à l'ordinateur ou au téléphone.

## C'est fini quand
- [ ] Sur le run du 4 novembre, la page fait moins de 5 000 px de haut à 1 280 px de large (48 846 aujourd'hui) et moins de 7 000 px à 390 (26 759 aujourd'hui), sans défiler de côté.
- [ ] Le premier écran, sans défiler, dit combien d'écrans et de parcours ont été refaits, les problèmes avant → fin, et ce qui reste à régler.
- [ ] Sur un écran refait, glisser sur l'image passe d'avant à après, à l'ordinateur comme au téléphone. « Voir la page entière » ouvre les deux captures complètes côte à côte, et on y arrive au clavier.
- [ ] Les principes et les contrôles sont dits en mots dans la langue de la page (« en-tête et pied pareils partout »), jamais par leur nom de code.
- [ ] Servie, la page garde « d'accord / pas d'accord » et sa raison sur chaque verdict, comme aujourd'hui. Ouverte comme fichier et sans réseau, elle garde ses polices et ses images.
- [ ] Un `/aeom judge` (qu'il y ait quelque chose à refaire ou non), un `/aeom directions` et un `/aeom build --from-scratch` ont leur page sous cette forme, sans rien perdre de ce qu'elle montre aujourd'hui.
- [ ] La page passe elle-même les contrôles d'AEOM (`aeom capture` sur la page servie).

## Les règles
- Antoine, le 10 novembre : « Déjà c'est super long, la page est illisible et trop longue […] enfin c'est moche moche moche ».
- Rien de visuel d'un projet ne sort de la machine : la page et ses captures restent locales.

## Comment
- **La page.** Elle se dessine dans `resultHtml`, dans `packages/core/src/run/report.ts`. Le style est inline ; les paires avant / après sont dans `pair()`, et les sections écrans et parcours se construisent juste en dessous.
- **Les données.** `readRun` donne déjà tout : `screens[].count`, `back`, `cleared`, `still` et `newly` ; `journeys[].steps`, `cleared` et `remaining` ; `features`. Les captures des étapes d'un parcours sont `journeys-after/<slug>@<largeur>-NN.png`.
- **Les mots.** Les mots de la page sont dans `WORDS`, en anglais et en français. Ils prennent aussi le nom de chaque principe et de chaque contrôle en mots.
- **Les polices.** Bricolage Grotesque et JetBrains Mono (licence OFL), embarquées en woff2 dans la page, pour qu'elle marche sans réseau.
- **Ce qui reste tel quel.** Le script d'avis (`feedbackScript`) et `pageVerdicts`, qui disent à `aeom report --serve` sur quoi on peut donner son avis.
- **Les tests.** `packages/core/src/run/report.test.ts` et `packages/cli/src/commands/report.test.ts`.

## Hors ticket
- Les constats des juges écrits en français : ticket 18. Jusque-là, ils restent tels que les juges les ont écrits.
- Un lien public vers la page.

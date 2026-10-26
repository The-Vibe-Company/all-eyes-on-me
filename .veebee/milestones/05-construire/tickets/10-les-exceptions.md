---
id: 10
title: Un choix assumé ou une exigence du cahier des charges n'est plus compté comme un échec
milestone: 05-construire
depends_on: [09]
design: null
status: done
tracker: { tool: github, id: 155, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/155 }
---

## Ce que l'utilisateur fait
Il écrit dans `.aeom/product.md`, sous « Accepted exceptions », ce qu'il a choisi en connaissance de cause : « `not-generic` sur toutes les pages : le fond violet profond est celui de la marque, choisi (seen: Victor) », ou ce que son cahier des charges exige : « `one-direction` sur /eole : le CCTP 8.3 demande une identité propre pour Eole (seen: CCTP 8.3) ». Puis il relance `/aeom` comme avant.

## Ce qu'il voit
Les juges et les contrôles ne comptent plus ces choix comme des échecs. Le verdict, la comparaison et la page de résultat les montrent à part, « accepté », avec leur raison et leur source. Le verdict dit aussi quel modèle a jugé et sur quelle version des principes, et une comparaison prévient quand les juges ont changé entre deux mesures.

## C'est fini quand
- [ ] `.aeom/product.md` peut avoir une partie « Accepted exceptions ». Chaque ligne nomme un principe ou un contrôle, où il s'applique (toutes les pages, des routes, un parcours) et pourquoi, avec sa source : une personne ou un article du cahier des charges. `aeom product` refuse une ligne sans source, une ligne « (to confirm) », un principe ou un contrôle qui n'existe pas
- [ ] Un principe accepté sur une page n'y échoue plus : `aeom judge` le compte « accepté », et le verdict, `aeom compare` et la page de résultat le montrent à part, avec sa raison
- [ ] Un contrôle accepté sur une page n'y échoue plus : `aeom check` le dit à part, accepté, avec sa raison
- [ ] Le cahier des charges passe en premier : depuis un cahier des charges, AEOM écrit en exceptions acceptées ce que ses exigences font échouer à un principe (une identité propre, une couleur imposée, une simulation demandée), en citant l'article. Les directions gardent ce qu'il fixe, comme une charte. AEOM n'accepte jamais une exception de lui-même
- [ ] `judge.json` garde le modèle des juges et la version des principes (la version d'AEOM et l'empreinte du fichier). Le verdict et la page de résultat les disent, et `aeom compare` prévient quand ils diffèrent entre deux mesures

## Les règles
- « On ne peut pas déclarer un choix assumé ou une exigence » : not-generic échoue sur toutes les pages de Radar à cause du fond violet choisi, one-direction sur Craponne parce que le CCTP 8.3 exige une identité propre pour Eole, « Résultat visible » refuse une simulation voulue sur ODEADOM (retour de Victor, 26 octobre).
- « Le cahier des charges c'est le numéro 1 » pour les appels d'offres (retour de Victor, 26 octobre).
- « Les verdicts changent selon le modèle » : avec des votants Haiku, Tours passait partout le 16/10 ; avec des votants Sonnet, 21 échecs sur les mêmes pages le 22/10 (retour de Victor, 26 octobre).

## Hors ticket
- La fiche comparative et les choix mixtes : ticket 11.
- Les juges qui ne voient que des captures pleine page (défilement, menus natifs) : plus tard.

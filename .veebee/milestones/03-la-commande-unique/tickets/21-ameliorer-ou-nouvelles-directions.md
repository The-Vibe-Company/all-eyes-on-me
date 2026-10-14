---
id: 21
title: Améliorer la direction actuelle ou en proposer de nouvelles, la question d'abord
milestone: 03-la-commande-unique
depends_on: []
design: null
status: done
tracker: { tool: github, id: 106, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/106 }
---

## Ce que l'utilisateur fait
Il lance `/aeom redo` sur un front qui a déjà sa propre direction : AEOM lui demande s'il veut l'améliorer ou en voir de nouvelles, et lui recommande d'améliorer.

## Ce qu'il voit
Le verdict dit si le front a une identité à lui : aucune page n'échoue sur « une seule direction », « rien de générique » ni « rien d'une IA par défaut ». Alors sa dernière ligne recommande d'améliorer la direction actuelle (le style gardé, seuls les défauts corrigés) ; sinon, de nouvelles directions. Le skill pose la question avec la recommandation en premier, la capture du front actuel sous les yeux. Avec `--autonome`, il suit la recommandation. `--garder-le-style` et `--forcer-directions` répondent d'avance.

## C'est fini quand
- [ ] `aeom verdict` écrit dans `verdict.json` si le front a une identité et ce qu'il recommande, et sa dernière ligne le dit
- [ ] Un front dont seuls des principes hors identité échouent se voit recommander l'amélioration ; un front sans identité, de nouvelles directions
- [ ] Le skill pose la question après le verdict, sauf avec `--autonome`, `--garder-le-style` ou `--forcer-directions`, et garde la réponse dans l'état du run
- [ ] Le run qui améliore suit le chemin du style gardé

## Hors ticket
La qualité des directions elles-mêmes : ticket 22.

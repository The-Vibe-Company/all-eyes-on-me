---
id: 03
title: Dans le même run, les parcours sont refaits sur la nouvelle DA
milestone: 03-la-commande-unique
depends_on: [01]
design: null
tracker: { tool: github, id: 49, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/49 }
---

## Ce que l'utilisateur fait
Après la nouvelle DA, il voit ses parcours clés devenus plus courts et plus clairs, dans le même run, sans feature nouvelle.

## Ce qu'il voit
Pour chaque parcours, la planche avant et après, avec le nombre d'étapes, gardé ou renvoyé et la raison.

## C'est fini quand
- [ ] Après la vague des pages, `/aeom` sans option refait les parcours qui échouent : vague partagée, puis un worker par parcours
- [ ] Le garde-fou passe avant chaque fusion de worker : une feature en douce n'est pas fusionnée, et le run dit laquelle
- [ ] Le cliquet des parcours ne garde que les parcours meilleurs ; un parcours renvoyé revient à sa version sur la nouvelle DA, avec la raison
- [ ] Les écrans que la vague des parcours touche sont remesurés : aucun contrôle ni principe qui passait après la vague des pages n'échoue à la fin
- [ ] Sur l'app de démo, « See my orders » prend moins d'étapes à la fin du run qu'au début
- [ ] Aucun parcours n'échoue : la vague des parcours est sautée, et le run le dit

## Comment
- Tout existe déjà dans `skills/aeom/SKILL.md`, section 2c, étapes 10 et 11 (`aeom journey --plan`, `aeom guard`, `aeom compare --journeys`). Le ticket les enchaîne après la section 5, sur la branche du run déjà ouverte.

## Hors ticket
- Nommer les features manquantes : 06.

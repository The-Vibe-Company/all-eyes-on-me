---
id: 12
title: AEOM dit quand il a une nouvelle version, et aeom update le met à jour
milestone: 05-construire
depends_on: []
design: null
status: done
tracker: { tool: github, id: 160, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/160 }
---

## Ce que l'utilisateur fait
Il utilise AEOM comme d'habitude. Quand une nouvelle version existe, AEOM le lui dit, avec le nombre de commits de retard. Il tape `aeom update`, et AEOM se met à jour : le code, ses dépendances, son build.

## Ce qu'il voit
Sous une commande, une ligne : « AEOM a 21 commits de retard : aeom update. ». Au début d'un run, la session le lui dit une fois. Après `aeom update`, d'où à où AEOM est passé, combien de commits, et ce qu'il faut relancer.

## C'est fini quand
- [ ] Au plus une fois par jour, AEOM regarde en arrière-plan si son dépôt a de nouveaux commits (un `git fetch`, rien d'autre n'est envoyé). La commande suivante dit sur sa sortie d'erreur de combien de commits il est en retard, avec `aeom update`, au plus toutes les six heures. Désactivé par `AEOM_UPDATE_CHECK=0`, et par défaut quand la télémétrie est coupée ou en CI
- [ ] `aeom update --check` regarde tout de suite et dit « à jour » ou « N commits de retard » (sortie 0 ou 1, 2 quand il ne peut pas savoir : pas un dépôt git, pas de réseau)
- [ ] `aeom update` met à jour le dépôt d'AEOM. Il refuse un arbre modifié ou une autre branche que `main`, tire en avance rapide seulement, puis lance les étapes de mise à jour que le dépôt écrit lui-même (installer, construire, le navigateur). Il dit d'où à où, combien de commits, et ce qu'il faut redémarrer
- [ ] Au début d'un run, la session lance `aeom update --check`. Quand AEOM est en retard, elle le dit une fois à la personne, et ne met jamais AEOM à jour au milieu d'un run
- [ ] Le README dit `aeom update` dans « Try it »

## Les règles
- Victor a tourné douze jours sur une version du 14 octobre, 21 commits de retard, sans le savoir : « Le fait qu'on soit resté sur une vieille version sans le savoir est déjà un retour en soi » (retour de Victor, 26 octobre).

## Hors ticket
- La copie des skills pour Codex : avec le support de Codex (#134).
- Un paquet npm : plus tard.

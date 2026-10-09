# Terre & Tour

Site de réservation de Terre & Tour, un petit atelier de céramique à Lyon (fictif).
Les visiteurs consultent les cours de la semaine (tournage, modelage, émaillage), réservent
des places sans créer de compte, retrouvent ou annulent leurs réservations avec leur e-mail et
un code, commandent une carte cadeau (sans paiement en ligne) et découvrent l’atelier et l’équipe.

Node 22, aucune dépendance npm, pas de compilation : le serveur rend les pages HTML lui-même.

## Démarrer

```sh
node server.mjs            # http://localhost:4402
PORT=8080 node server.mjs  # sur un autre port
```

## Remettre les données à zéro

```sh
node reset.mjs
```

Les données de départ sont dans `data/seed.json` (12 cours, 3 enseignants, quelques réservations,
une liste d’attente, une carte cadeau). Le site écrit dans `data/db.json`, créé à partir de
`seed.json` au premier démarrage ; `reset.mjs` recopie `seed.json` par-dessus.

## Essayer « Mes réservations »

- E-mail : `lea.test@example.test`
- Code : `TT-K7P4` (Léa a aussi le code `TT-M3RX`)

Le cours « Initiation au tour » du vendredi est complet : sa page propose la liste d’attente.

## Vérification rapide

```sh
node scripts/smoke.mjs
```

Démarre le serveur sur le port 4499 avec une copie jetable des données, vérifie que chaque page
répond, puis réserve, s’inscrit en liste d’attente, annule et commande une carte cadeau.

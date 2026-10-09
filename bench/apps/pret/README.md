# Le Prêt

La bibliothèque d'objets du quartier des Tilleuls : les voisins se prêtent une perceuse, une échelle, un appareil à raclette, une tente… gratuitement. Première version, données fictives.

- On parcourt les objets (recherche, catégories, « libres aujourd'hui »), on ouvre la fiche d'un objet : qui le prête, son état, son calendrier.
- Une fois connecté, on réserve un objet pour des dates choisies, on suit « Mes emprunts » (en cours, à venir, historique) et on rend un objet (ou on annule une réservation qui n'a pas commencé).
- On peut aussi prêter un objet : nom, catégorie, description, état. Il apparaît tout de suite dans le catalogue.
- Une page « Comment ça marche » explique les règles.

## Démarrer

Node 22, aucune dépendance, aucune compilation :

```sh
node server.mjs            # http://localhost:4401
PORT=5000 node server.mjs  # autre port
```

## Pages

| Route | Page |
| --- | --- |
| `/` | Accueil |
| `/objets` | Catalogue (`?q=`, `?categorie=`, `?dispo=1`) |
| `/objets/:id` | Fiche d'un objet, calendrier, réservation |
| `/connexion` | Connexion |
| `/mes-emprunts` | Mes emprunts (connexion requise) |
| `/proposer` | Prêter un objet |
| `/a-propos` | Comment ça marche |

## Données

- `data/initial.json` : l'état de départ (7 voisins, 17 objets, 14 emprunts). Les dates y sont des décalages en jours par rapport au jour de la remise à zéro, pour que la démo reste vraisemblable quel que soit le jour.
- `data/donnees.json` : l'état courant, écrit par l'application à chaque réservation, retour ou proposition. Créé automatiquement au premier lancement.

Remettre les données à zéro (pas besoin de redémarrer le serveur) :

```sh
node reset.mjs
```

## Compte de démonstration

Un seul compte, fictif, dans `fixtures/compte.json`. Les clés sont les libellés des champs du formulaire de connexion :

```json
{ "Adresse e-mail": "camille.test@example.test", "Mot de passe": "tilleuls-test-2026" }
```

Le mot de passe est stocké haché (scrypt) dans `data/initial.json`.

## Vérifier

```sh
node verifier.mjs
```

Démarre le serveur sur le port 4499 avec un fichier de données jetable, vérifie que chaque page répond, que la connexion fonctionne, puis rejoue une réservation, un retour et une proposition.

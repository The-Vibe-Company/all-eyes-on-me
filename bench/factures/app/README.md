# Factures

Un suivi de factures pour une indépendante : tableau de bord (facturé ce mois-ci, en attente, en retard), clients, factures avec leur statut (brouillon, envoyée, payée, en retard), création d'une facture avec ses lignes, détail d'une facture et marquage « payée ». Les données sont fictives.

HTML, CSS et JavaScript simples dans `public/`, un serveur Node 22 sans dépendance.

```
node server.mjs   # http://localhost:4420 (ou le port de PORT)
node reset.mjs    # remet data/db.json à l'état de data/seed.json
```

Au premier lancement, `data/db.json` est copié depuis `data/seed.json` ; les nouvelles factures et les changements de statut y sont écrits.

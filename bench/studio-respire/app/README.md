# Studio Respire

Site d’un petit studio de yoga à Lyon : le planning de la semaine, la fiche de chaque cours et de son professeur, la réservation d’une place (nom et e-mail), « Mes réservations » avec annulation, et les coordonnées du studio. Interface en français, données fictives.

HTML, CSS et JavaScript simples dans `public/`, sans framework ni dépendance. Un serveur Node 22 (modules intégrés) sert `public/` et l’API JSON sous `/api/...`.

```
node server.mjs   # http://localhost:4410 (ou le port de la variable PORT)
node reset.mjs    # remet data/db.json à l’état de data/seed.json
```

Au démarrage, si `data/db.json` n’existe pas, le serveur y copie `data/seed.json`. Les réservations et annulations s’écrivent dans `data/db.json` (ignoré par git). L’adresse `camille@example.com` a trois réservations au départ.

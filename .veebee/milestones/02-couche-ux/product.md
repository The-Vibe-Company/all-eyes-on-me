# La couche UX d'All Eyes On Me

Après la landing, AEOM ne regarde plus seulement des pages : il regarde ce que les gens font dans l'app. Avant de toucher un écran, il comprend seul le produit (il lit le code, utilise l'app) et écrit `.aeom/product.md` : à quoi sert l'app, pour qui, sa boucle principale, 3 à 5 parcours clés. Antoine corrige ce fichier après coup, sans jamais bloquer le run.

AEOM critique ensuite l'existant parcours par parcours, avec des captures de chaque étape, et juge des parcours, pas seulement des pages. Il peut changer la navigation et les parcours : l'ordre des étapes, le regroupement des écrans, des raccourcis vers des actions qui existent déjà, les textes, les états. Il ne fabrique jamais de feature (pas de nouvelle donnée, pas de logique métier, pas d'appel serveur), sauf demande très explicite de l'utilisateur.

Tout se construit et se vérifie sur l'app de démo du repo, avec des données fictives. Le premier pilote est Road-To-Mastock, un suivi de séances Basic-Fit mêlé à un jeu de collection de cartes : il tourne sur une base fictive fournie par Antoine, et rien de ce qu'il produit ne sort de sa machine.

Pas encore dans cette couche : ce que les corrections d'Antoine apprennent au juge. C'est la distillation, prévue en V1.

# Construire, dans le standard

Le troisième niveau d'All Eyes On Me. Une fois un front jugé et son standard posé, AEOM construit : une modification demandée en une phrase, une feature front qu'un run a nommée, ou un front entier à partir de zéro, depuis une fiche produit et une API.

AEOM ne construit que du front. Il se branche sur un back existant, ou sur des données fictives nommées comme telles, qu'on remplace quand la vraie API arrive. Il n'écrit jamais de logique métier ni de donnée inventée : une demande qui exige du back est refusée, avec ce qu'il faudrait côté back. Tout ce qu'il construit passe la relecture du niveau 2 avant d'être rendu, sur une branche `aeom/<run>`, avec la page de résultat.

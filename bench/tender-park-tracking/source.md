# Brief visuel neutre · espace de suivi de l'écosystème web du Parc naturel régional des Hautes-Combes

Transmis tel quel à chaque explorateur de direction. Il dit ce que le produit fait, pour qui, ce qui est obligatoire et ce qui est libre. Il ne dit rien de son apparence. Aucune capture, feuille de style ou maquette existante n'est jointe. Source : le cahier des charges du marché (CCAE), article entre parenthèses.

## 1. Le produit

Le Parc naturel régional des Hautes-Combes est un syndicat mixte installé à Saint-Aubin, en Hautes-Combes. Il fait vivre un écosystème numérique pour les habitants, les visiteurs et ses partenaires (CCAE 1) :

- six sites sous WordPress : le site du Parc (parc-hautes-combes.fr), le site événementiel des Noiseraies (noiseraies.fr), le parcours artistique La Ligne de Crête (lalignedecrete.fr), le site touristique Destination Parc des Hautes-Combes (destination-parc-hautes-combes.fr), le site participatif Patrimoines (patrimoines.parc-hautes-combes.fr), le site du réseau des Réseau des Géoparcs (reseau-geoparcs.fr) ;
- Geotrek : une plateforme Geotrek-admin que le Parc administre et partage avec les intercommunalités et offices de tourisme partenaires, des portails Geotrek-rando pour ces partenaires, et l'application mobile Rando Hautes-Combes ;
- des flux de données : le site Destination affiche des fiches venues d'APIDAE (la base touristique régionale) et de Geotrek ;
- Brevo pour environ huit lettres d'information par an, un outil de réservation en ligne, la mesure d'audience.

L'écran à concevoir n'est aucun de ces sites. C'est l'espace en ligne que le prestataire de maintenance met à la disposition du Parc pour l'année 2027 : on y dépose une demande, on la suit jusqu'à sa résolution, on y lit l'état technique de chaque site et le compte rendu de chaque mois. C'est un outil de travail utilisé au bureau sur ordinateur, plusieurs fois par semaine.

Aucune charte n'est imposée pour cet outil. « Parc naturel régional des Hautes-Combes » et les noms des sites s'écrivent en texte, sans logo.

## 2. Qui l'utilise

- La responsable de la communication du Parc : elle pilote la mission, dépose et suit les demandes, valide les évolutions avant leur mise en ligne, lit le compte rendu mensuel (CCAE 9.1).
- Le référent Geotrek et activités de pleine nature : il dépose les demandes sur Geotrek, les portails partenaires et l'application.
- Le chargé de mission culture : il suit le site Patrimoines et son réseau de contributeurs.
- Des partenaires autorisés : les administrateurs du Géoparc des Causses pour le site des Géoparcs, les partenaires Geotrek.
- L'équipe du prestataire (quatre personnes) : qualifie chaque demande, la traite, note le temps passé, rédige le compte rendu.

## 3. Ce qu'ils viennent faire

1. Voir d'un coup d'œil les demandes en cours, sur quel site ou outil, à quelle priorité, où elles en sont et ce qui bloque.
2. Déposer une demande et savoir qu'elle sera prise en compte et qualifiée sous 48 heures ouvrées (CCAE 9.3).
3. Suivre un incident qui bloque un service essentiel : diagnostic, conséquences, solution de contournement, délai prévisionnel de rétablissement, avancement (CCAE 9.3).
4. Valider une évolution testée en recette avant sa mise en ligne (CCAE 5.4, 8.3).
5. Lire chaque mois ce qui a été fait, et trancher ce qui demande une décision du Parc (CCAE 10).
6. Savoir si chaque site est à jour, sauvegardé, et son certificat valide (CCAE 5.3, 5.7).

## 4. Les écrans

Les directions dessinent deux de ces écrans : le tableau de suivi, premier écran ouvert, et le compte rendu mensuel. Les autres sont décrits pour que la navigation et les liens restent justes.

### Tableau de suivi partagé (`/index.html`)

Premier écran. Obligatoire, pour chaque demande (CCAE 9.2) : la date de réception, le demandeur, l'outil concerné, la nature de la demande, son niveau de priorité, son statut, le responsable de son traitement, le temps consacré, la date de prise en charge, la date de résolution, les actions réalisées, les éventuels points de blocage. Une demande s'ouvre pour lire le détail ; la liste montre au moins le numéro, l'outil, la nature, la priorité, le statut, le responsable et le blocage s'il y en a un. Aussi sur cet écran : l'incident en cours s'il y en a un, avec son délai prévisionnel ; les évolutions qui attendent la validation du Parc ; l'état court de chaque site ou outil (à jour ou non, dernière sauvegarde) ; l'accès direct à « Déposer une demande » ; le rappel de la prise en compte sous 48 heures ouvrées.

### Compte rendu mensuel (`/comptes-rendus/2027-02.html`)

Le compte rendu de février 2027, remis début mars. Obligatoire (CCAE 10) : les demandes reçues, traitées et restant ouvertes ; les délais de prise en charge ; les incidents rencontrés ; les mises à jour réalisées ; les mises en production effectuées ; les actions de sécurité ; l'état des sauvegardes ; les évolutions en cours ; les risques ou arbitrages qui demandent une décision du Parc ; les actions prévues pour le mois suivant. Le temps consacré dans le mois, en jours, par site ou outil. Les comptes rendus précédents restent accessibles.

### Déposer une demande (`/demandes/nouvelle.html`)

Un formulaire : site ou outil concerné, nature (anomalie, mise à jour de contenu, évolution, question, formation), ce qui se passe et ce qui est attendu, pièce jointe facultative, priorité. Après l'envoi : le numéro, l'heure de dépôt et l'engagement de qualification sous 48 heures ouvrées.

### État du parc (`/parc.html`)

Pour chaque site et outil : la version en service (WordPress, Geotrek-admin, application), les mises à jour en attente, la dernière sauvegarde et le dernier test de restauration, l'échéance du certificat de sécurité, l'hébergeur.

### Feuilles de route (`/feuilles-de-route.html`)

Les projets de l'année : la Grande Traversée (itinéraire intégré dans Geotrek, contenus audio, étapes géolocalisées), la coopération avec l'instance Geotrek de Haut-Val sur le Grand Mont, la feuille de route annuelle. Pour chacun : objectifs, étapes, calendrier, validations, risques (CCAE 9.4).

### Documentation (`/documentation.html`)

Les guides des contributeurs et administrateurs, les procédures de sauvegarde, de restauration et de déploiement, la documentation des connecteurs (CCAE 10).

## 5. Ce qui est libre

Couleurs, typographie, composition, densité, façon de montrer les priorités et les statuts. Les priorités et les statuts s'écrivent toujours en toutes lettres, jamais par la seule couleur. Texte en français, sans tiret long, sans phrase qui parle de l'interface ou d'une démonstration.

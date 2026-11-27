# Les meilleurs produits du genre : suivi de demandes, état de services, compte rendu

Genre : un outil de travail partagé entre un client et son prestataire web, où l'on suit des demandes, l'état de services et un compte rendu périodique. Registre : **calme**. Raison : c'est un outil lu au bureau plusieurs fois par semaine par une responsable de la communication et une équipe technique ; on y cherche une information exacte, pas une ambiance.

On regarde leur niveau, jamais leur look : aucune mise en page, couleur ou marque n'est reprise.

## Cloudflare System Status (cloudflarestatus.com)
- L'incident actif est seul en tête, dans un bloc teinté, avec ses services touchés et son état écrit en mot (« Identified »). Le reste attend dessous.
- « No active maintenance » : l'état vide est écrit en clair, pas masqué.
- Beaucoup d'air, une seule colonne centrée de 860 px, titres de section à 20 px, texte à 16 px. Un seul bleu pour l'action.

## GitHub, liste des demandes (vercel/next.js/issues)
- Chaque ligne : un titre lisible à 15-16 px, puis une ligne secondaire grise (numéro, auteur, ancienneté). Deux niveaux nets, jamais trois.
- Compteurs Ouvertes / Actives / Fermées en onglets au-dessus de la liste : on sait combien avant de lire.
- Le bouton principal (« New issue ») est seul en couleur pleine, en haut à droite.
- Icônes en trait fin, homogènes, alignées sur la première ligne.

## GitLab, tableau par colonnes (gitlab-org/gitlab/-/boards)
- Colonnes à fond gris clair, cartes blanches, numéro et état en bas de carte. Le statut se lit par la colonne.
- Défaut à éviter : trop d'étiquettes colorées par carte, on ne sait plus laquelle compte.

## Linear, journal des nouveautés (linear.app/changelog)
- Une date dans une marge à gauche, le contenu dans une colonne de lecture de 600 px : un document daté se lit d'un trait.
- Les détails (« Fixes », « Improvements ») sont repliés en lignes cliquables sous chaque entrée.

## Simple Analytics, tableau public (dashboard.simpleanalytics.com)
- Quatre chiffres clés en très grand (40 px) avec leur libellé en petit au-dessus : la donnée d'abord.
- Les listes de détail ont le nombre en tête de ligne, aligné, en couleur d'accent, et une barre de proportion derrière la valeur.
- Une seule couleur d'accent sur fond blanc, une police à chasse homogène pour les chiffres.

## Ce qu'une direction doit atteindre
- Une seule chose en tête de chaque écran (l'incident, ou ce qui attend le Parc).
- Texte courant à 16 px, jamais sous 13 px ; chiffres principaux bien plus grands, alignés, en chiffres tabulaires.
- Statuts et priorités écrits en mots, la couleur en plus seulement.
- Icônes d'un seul jeu, en trait (Lucide fourni dans `icons/`), jamais d'émoji ni de pictogramme dessiné à la main.
- États vides écrits en clair.

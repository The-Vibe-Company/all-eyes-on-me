# Les meilleurs produits du genre : pages d'état de service et suivi d'incident

Capturés le 27/11/2026 à 1280 px. Ils montrent le niveau à atteindre, jamais un look à reprendre : aucune mise en page, couleur ou marque n'est copiée. Les captures ne sont pas gardées dans le bench.

- **GitHub Status** : une phrase d'état en tête, sur une bande pleine qui dit l'état global en un mot ; puis une grille de services, chacun avec sa barre de 90 jours (un trait par jour), son pourcentage écrit et un mot d'état (« Normal »). Ce qui le rend bon : l'état global se lit en une seconde, chaque service a la même forme, le chiffre et le mot sont toujours à côté de la couleur.
- **OpenAI / incident.io** : une seule colonne étroite et calme, un encadré d'état en tête, la disponibilité de chaque groupe en barre de jours avec son pourcentage aligné à droite, un calendrier du mois qui marque les jours touchés. Bon par sa retenue : beaucoup d'air, une seule couleur d'état, des chiffres alignés à droite en chiffres tabulaires.
- **Cloudflare** : les incidents actifs d'abord, chacun une ligne avec son statut écrit dans une étiquette (« Investigating », « Identified »), puis les maintenances à venir. Bon parce que ce qui est ouvert passe avant ce qui va bien.
- **Better Stack** : un grand titre d'état centré, l'heure de dernière mise à jour juste dessous, une seule barre de disponibilité très lisible. Bon par l'échelle : un message, un chiffre, une date.
- **Fiche d'incident GitHub** : le titre de l'incident, puis une colonne de points d'avancement, chacun avec son statut à gauche (« Investigating », « Update », « Monitoring », « Resolved ») et son heure exacte dessous. Bon parce que l'historique se lit de haut en bas sans effort, le statut de chaque point dit en un mot.

Ce qu'ils ont en commun et qu'une direction doit atteindre : le chiffre principal (disponibilité, état) bien plus grand que le reste ; chaque couleur doublée d'un mot ; des pourcentages et des heures en chiffres tabulaires alignés ; des pictogrammes sobres d'une seule famille au trait ; des lignes qui respirent (au moins 12 px de marge verticale) ; du texte à 14–16 px, des titres de section à 18–20 px ; ce qui est ouvert avant ce qui va bien.

Registre du genre : **calme**. C'est un outil de travail lu tous les jours au bureau par une administratrice et une équipe d'exploitation : neutres, un accent, une ou deux familles de caractères, la couleur seulement là où elle veut dire quelque chose ; l'audace est dans la façon de dessiner la donnée principale (disponibilité, temps restant, état de chaque service), jamais dans une palette ou un motif.

Icônes : Lucide 0.460.0, licence ISC.

## Ajout du second tour (27/11/2026)

- **Linear** (l'écran produit de sa page d'accueil) : niveau de finition visé. Très peu de mots par ligne, le secondaire en gris, des pictogrammes fins, une seule chose mise en avant, des listes sans cadre autour de chaque ligne, un panneau latéral pour le détail, beaucoup d'air. Le niveau, jamais le look : ni son fond sombre ni sa mise en page.

# Second tour : ce que la personne a dit, et ce qui change

Lis ce fichier avant `brief-commun.md` : il passe avant lui partout où ils diffèrent. La spec (`source.md`) passe avant les deux.

## Ce que la personne a dit du premier tour (27/11/2026)

Les six directions du premier tour ont toutes été refusées : « c'est brouillon, pas beau ; beaucoup d'infos, sans tooltip, rien de dépliable, tout affiché, il y a un effet masse pas ouf ». Tu ne vois pas le premier tour ; retiens seulement ce qu'il a fait de travers : tout était affiché en même temps, en petit, serré, en tableaux et en blocs bordés, sans rien qui se déplie.

Ses règles, gardées par AEOM (`aeom taste --brief`) :
- Un outil se lit d'abord en résumé : au premier écran, une phrase d'état, deux ou trois chiffres clés et une ligne par bloc ; le détail (listes, historiques, définitions, mesures secondaires) se déplie au clic ou s'ouvre en infobulle au survol et au focus. Jamais tout affiché d'un coup, jamais d'effet de masse.
- Finition d'agence sérieuse : beaucoup d'air, une hiérarchie nette, peu de bordures et de cadres, des alignements exacts ; un outil de travail reste sobre, avec un seul geste fort, une police, un accent et des neutres, jamais criard.

## Le niveau visé

Ouvre `references/linear-app-site/produit.png` : l'écran produit de Linear. C'est le niveau de finition attendu, pas un look à copier (pas de fond sombre, pas sa mise en page) : très peu de mots par ligne, le secondaire en gris, des pictogrammes fins, une seule chose mise en avant, des listes sans cadre autour de chaque ligne, beaucoup d'air. Les captures de pages d'état (`references/*/index@1280.png`) restent la référence du genre.

## Lecture en couches, obligatoire

1. **Premier écran, à 1280 × 800 sans défiler** : une phrase d'état de la plateforme, deux ou trois chiffres clés (dont la disponibilité du mois contre 96 %), ce qui demande une action de l'administratrice, et « Déclarer un incident ». Rien d'autre ne se bat pour l'œil.
2. **Chaque élément obligatoire de la spec reste visible en une ligne résumée** (un mot d'état et un chiffre), jamais caché : par exemple « Serveur : normal · disque 71 % » ou « Dernière sauvegarde : réussie, cette nuit à 2 h 10 ». Son détail se déplie : les mesures de chaque ressource avec les seuils de 80 et 90 %, le temps de réponse du catalogue, la disponibilité du mois précédent, la liste de l'administration de la semaine, les étapes du prochain changement.
3. **Comment ça se déplie, sans script** : `<details>` et `<summary>` pour une ligne qui s'ouvre sur son détail (un chevron qui tourne) ; l'attribut HTML `popover` avec un bouton `popovertarget` pour un panneau ; une infobulle en CSS qui s'ouvre au survol **et** au focus (`:hover`, `:focus-visible`, `:focus-within`) pour une définition courte (la définition d'un niveau, ce que sont les heures ouvrées, ce que veut dire un seuil). Le contenu replié est dans le HTML, lisible au lecteur d'écran. Un repère discret dit qu'il y a plus (chevron, « Détails », souligné pointillé pour une infobulle). Dans chaque page, laisse **un seul** dépli ouvert par défaut (`<details open>`), celui qui sert le plus, pour que la capture montre comment ça s'ouvre.
4. **La fiche d'incident** : en tête, le numéro, le service, le niveau « Bloquant » (sa définition en infobulle), le statut, les deux délais en grand et l'action qui attend l'administratrice. Puis les trois derniers points d'avancement ; les plus anciens repliés (« 4 points plus anciens »). L'avis technique, l'intervention urgente et sa validation, la page d'indisponibilité publiée et la qualification avec le PV signé : chacun une ligne avec son statut et son heure, qui se déplie sur son contenu. Les trois actions (apporter une précision, valider l'intervention urgente, signer la qualification) restent visibles.
5. **L'air** : au moins 20 px entre deux lignes d'une liste, 48 à 64 px entre deux sections, des marges de page généreuses ; peu de cadres (un filet fin ou un fond très léger, jamais une bordure autour de chaque bloc) ; deux tailles de texte courant au plus ; le secondaire en gris lisible (contraste d'au moins 4,5:1).

## Avant de répondre

Ouvre tes deux pages dans un navigateur sans fenêtre à 1280 × 800 et regarde la capture du premier écran et de la page entière. Mets tes captures et fichiers de travail dans `<ton dossier>/.work/`, jamais dans un dossier partagé ni dans un autre dossier de direction. Demande-toi : un directeur artistique d'agence la livrerait-il telle quelle ? Est-ce que ça respire, est-ce qu'un seul élément saute aux yeux, est-ce qu'il reste un effet de masse ? Si oui, enlève, replie, espace, puis recommence. Lance ensuite `aeom check --dir <ton dossier> --pages /index.html,/incident.html --widths 1280 --out <ton dossier>/.work/check` et corrige ce qu'il signale sur tes deux pages (les liens vers les autres écrans non dessinés ne comptent pas).

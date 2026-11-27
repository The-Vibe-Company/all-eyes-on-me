# Brief commun des six directions · run-20261127-1612 (mode appel d'offres)

Lis ce fichier en entier avant de dessiner. Images : off (aucune image générée). Largeur : 1280 px (outil de bureau).

## Ce que la personne a appris à AEOM (après la charte, une leçon ne l'emporte jamais sur elle)
The person's own rules:
- Un outil se lit d'abord en résumé : au premier écran, une phrase d'état, deux ou trois chiffres clés et une ligne par bloc ; le détail (listes, historiques, définitions, mesures secondaires) se déplie au clic ou s'ouvre en infobulle au survol et au focus. Jamais tout affiché d'un coup, jamais d'effet de masse.
- Finition d'agence sérieuse : beaucoup d'air, une hiérarchie nette, peu de bordures et de cadres, des alignements exacts ; un outil de travail reste sobre, avec un seul geste fort, une police, un accent et des neutres, jamais criard.

## La spec : le brief neutre de l'acheteur (vaut charte : tout ce qu'il fixe est gardé entier, chaque exigence visible)

## Brief visuel neutre · espace de suivi de l'écosystème web du Parc naturel régional des Hautes-Combes

Transmis tel quel à chaque explorateur de direction. Il dit ce que le produit fait, pour qui, ce qui est obligatoire et ce qui est libre. Il ne dit rien de son apparence. Aucune capture, feuille de style ou maquette existante n'est jointe. Source : le cahier des charges du marché (CCAE), article entre parenthèses.

### 1. Le produit

Le Parc naturel régional des Hautes-Combes est un syndicat mixte installé à Saint-Aubin, en Hautes-Combes. Il fait vivre un écosystème numérique pour les habitants, les visiteurs et ses partenaires (CCAE 1) :

- six sites sous WordPress : le site du Parc (parc-hautes-combes.fr), le site événementiel des Noiseraies (noiseraies.fr), le parcours artistique La Ligne de Crête (lalignedecrete.fr), le site touristique Destination Parc des Hautes-Combes (destination-parc-hautes-combes.fr), le site participatif Patrimoines (patrimoines.parc-hautes-combes.fr), le site du réseau des Réseau des Géoparcs (reseau-geoparcs.fr) ;
- Geotrek : une plateforme Geotrek-admin que le Parc administre et partage avec les intercommunalités et offices de tourisme partenaires, des portails Geotrek-rando pour ces partenaires, et l'application mobile Rando Hautes-Combes ;
- des flux de données : le site Destination affiche des fiches venues d'APIDAE (la base touristique régionale) et de Geotrek ;
- Brevo pour environ huit lettres d'information par an, un outil de réservation en ligne, la mesure d'audience.

L'écran à concevoir n'est aucun de ces sites. C'est l'espace en ligne que le prestataire de maintenance met à la disposition du Parc pour l'année 2027 : on y dépose une demande, on la suit jusqu'à sa résolution, on y lit l'état technique de chaque site et le compte rendu de chaque mois. C'est un outil de travail utilisé au bureau sur ordinateur, plusieurs fois par semaine.

Aucune charte n'est imposée pour cet outil. « Parc naturel régional des Hautes-Combes » et les noms des sites s'écrivent en texte, sans logo.

### 2. Qui l'utilise

- La responsable de la communication du Parc : elle pilote la mission, dépose et suit les demandes, valide les évolutions avant leur mise en ligne, lit le compte rendu mensuel (CCAE 9.1).
- Le référent Geotrek et activités de pleine nature : il dépose les demandes sur Geotrek, les portails partenaires et l'application.
- Le chargé de mission culture : il suit le site Patrimoines et son réseau de contributeurs.
- Des partenaires autorisés : les administrateurs du Géoparc des Causses pour le site des Géoparcs, les partenaires Geotrek.
- L'équipe du prestataire (quatre personnes) : qualifie chaque demande, la traite, note le temps passé, rédige le compte rendu.

### 3. Ce qu'ils viennent faire

1. Voir d'un coup d'œil les demandes en cours, sur quel site ou outil, à quelle priorité, où elles en sont et ce qui bloque.
2. Déposer une demande et savoir qu'elle sera prise en compte et qualifiée sous 48 heures ouvrées (CCAE 9.3).
3. Suivre un incident qui bloque un service essentiel : diagnostic, conséquences, solution de contournement, délai prévisionnel de rétablissement, avancement (CCAE 9.3).
4. Valider une évolution testée en recette avant sa mise en ligne (CCAE 5.4, 8.3).
5. Lire chaque mois ce qui a été fait, et trancher ce qui demande une décision du Parc (CCAE 10).
6. Savoir si chaque site est à jour, sauvegardé, et son certificat valide (CCAE 5.3, 5.7).

### 4. Les écrans

Les directions dessinent deux de ces écrans : le tableau de suivi, premier écran ouvert, et le compte rendu mensuel. Les autres sont décrits pour que la navigation et les liens restent justes.

#### Tableau de suivi partagé (`/index.html`)

Premier écran. Obligatoire, pour chaque demande (CCAE 9.2) : la date de réception, le demandeur, l'outil concerné, la nature de la demande, son niveau de priorité, son statut, le responsable de son traitement, le temps consacré, la date de prise en charge, la date de résolution, les actions réalisées, les éventuels points de blocage. Une demande s'ouvre pour lire le détail ; la liste montre au moins le numéro, l'outil, la nature, la priorité, le statut, le responsable et le blocage s'il y en a un. Aussi sur cet écran : l'incident en cours s'il y en a un, avec son délai prévisionnel ; les évolutions qui attendent la validation du Parc ; l'état court de chaque site ou outil (à jour ou non, dernière sauvegarde) ; l'accès direct à « Déposer une demande » ; le rappel de la prise en compte sous 48 heures ouvrées.

#### Compte rendu mensuel (`/comptes-rendus/2027-02.html`)

Le compte rendu de février 2027, remis début mars. Obligatoire (CCAE 10) : les demandes reçues, traitées et restant ouvertes ; les délais de prise en charge ; les incidents rencontrés ; les mises à jour réalisées ; les mises en production effectuées ; les actions de sécurité ; l'état des sauvegardes ; les évolutions en cours ; les risques ou arbitrages qui demandent une décision du Parc ; les actions prévues pour le mois suivant. Le temps consacré dans le mois, en jours, par site ou outil. Les comptes rendus précédents restent accessibles.

#### Déposer une demande (`/demandes/nouvelle.html`)

Un formulaire : site ou outil concerné, nature (anomalie, mise à jour de contenu, évolution, question, formation), ce qui se passe et ce qui est attendu, pièce jointe facultative, priorité. Après l'envoi : le numéro, l'heure de dépôt et l'engagement de qualification sous 48 heures ouvrées.

#### État du parc (`/parc.html`)

Pour chaque site et outil : la version en service (WordPress, Geotrek-admin, application), les mises à jour en attente, la dernière sauvegarde et le dernier test de restauration, l'échéance du certificat de sécurité, l'hébergeur.

#### Feuilles de route (`/feuilles-de-route.html`)

Les projets de l'année : la Grande Traversée (itinéraire intégré dans Geotrek, contenus audio, étapes géolocalisées), la coopération avec l'instance Geotrek de Haut-Val sur le Grand Mont, la feuille de route annuelle. Pour chacun : objectifs, étapes, calendrier, validations, risques (CCAE 9.4).

#### Documentation (`/documentation.html`)

Les guides des contributeurs et administrateurs, les procédures de sauvegarde, de restauration et de déploiement, la documentation des connecteurs (CCAE 10).

### 5. Ce qui est libre

Couleurs, typographie, composition, densité, façon de montrer les priorités et les statuts. Les priorités et les statuts s'écrivent toujours en toutes lettres, jamais par la seule couleur. Texte en français, sans tiret long, sans phrase qui parle de l'interface ou d'une démonstration.

## Les deux écrans

- `index.html` : le tableau de suivi partagé, premier écran ouvert. Qui : la responsable de la communication du Parc (Hélène Roux). Ce qu'elle vient faire : voir l'incident, ce qui attend sa validation, les demandes en cours, l'état court de chaque site, déposer une demande. Ce qu'il contient, données et actions : `$MAIN/.aeom/runs/run-20261127-1612/now/index-html.content.yml`.
- `compte-rendu.html` : le compte rendu mensuel de février 2027. Qui : la même personne, début mars. Ce qu'elle vient faire : lire ce qui a été fait et trancher l'arbitrage demandé au Parc. Contenu : `$MAIN/.aeom/runs/run-20261127-1612/now/comptes-rendus-2027-02-html.content.yml`.

Les deux pages se lient par leurs noms de fichier. Les autres liens de navigation (Déposer une demande, État du parc, Feuilles de route, Documentation) restent présents, en `#`.

## Les meilleurs produits du genre

Notes : `$MAIN/.aeom/runs/run-20261127-1612/references/notes.md`. Captures (à regarder pour le niveau, jamais pour le look) : `$MAIN/.aeom/runs/run-20261127-1612/references/*/*.png`.

## Icônes

Jeu Lucide 0.460.0 sous licence ISC dans `$MAIN/.aeom/runs/run-20261127-1612/icons/` (LICENSE à côté). Copie dans ton dossier, sous `icons/`, celles que tu utilises, avec `LICENSE`. Aucune autre icône.

## Registre : calme

C'est un outil de travail lu au bureau plusieurs fois par semaine : neutres, un accent, une ou deux familles de police, la couleur seulement là où elle signifie. Son audace est dans la façon de montrer la donnée principale, jamais dans une palette ou un motif. La couleur qui tient de la place : une bande au plus.

## The banned looks

A model asked to "be bold" reaches for these. A direction that one of them describes as a whole is named, whatever its quality: when the person chooses, beside it, and they decide; with `--autonome`, the screening judges remove it before the bracket, so two banned directions can never meet in a duel. One trait alone does not make a banned look; a cream background or a serif headline can be a real brand choice. It is the combination that gives the default away.

- Cream or newsprint paper, a big serif headline, a red, brick or terracotta accent.
- A near-black screen with one amber, acid green or phosphor accent, in monospace.
- Newspaper hairlines, magazine columns, drop caps, pull quotes.
- A white Swiss poster: a huge grotesque headline and one red square.
- A black-and-yellow brutalist grid with heavy borders.
- Didot or another high-contrast serif with small caps and a gold or brass accent.
- Kraft paper, rubber stamps, scalloped edges, hand-drawn labels.
- A purple-to-blue gradient, glassy cards, glow.
- Inter or Space Grotesk on white with rounded cards, but for the classic of `/aeom directions`.
- A dated look, the web of the 2000s and early 2010s: glossy or bevelled buttons, a gradient on every block, heavy borders and drop shadows on everything, clip-art pictograms, rounded bubbly type. A direction must look like what a good team would ship this year.
- On a game or a creative product, a document interface laid over it: a survey map with contour lines and a graduated frame, an administrative form, a dashboard of cards and charts, a spreadsheet. Players open a game to enter its world, not to read a document about it.

Design movements are banned as starting points for the same reason: "Swiss", "brutalist", "editorial", "retro terminal", "luxury" and "artisanal" are exactly where these looks come from.


## Where a direction comes from

**The product's name may give a wink, never the look.** A detail that makes sense, once, and only when it comes naturally from the direction's own source: the eye in the O of All Eyes On Me, a fleet in formation in the hero of Armada, a nod to Star Wars for a tool that runs a fleet of coding agents. These are examples of the kind, not winks to reuse. The look itself comes from the world of the people who use the product: Armada's users are developers who run agents, so its world is the review and the merge (a diff read line by line, a queue of pull requests, a run that turns green), not a navy, signal flags or a sky full of planes, and not a phosphor terminal either, which is a banned look. A direction drawn from the name alone is a costume: drop it.


## A structure of its own

A source alone gives three skins on one skeleton: the same header, the same search bar, the same cards in the same places, only the colours and the type changing. So each direction gets a structure too, its thesis, and no two directions of a round share one. The source decides the look; the thesis decides the skeleton.

1. **One thesis per direction**, in one plain sentence beside its source's: where the main action sits, how the content is laid out, how one goes from screen to screen (a bar at the top, a rail at the side, tabs at the bottom, none). Such as the image first and the action under it; a workbench in panes, the list on one side and the record open beside it; a timeline one scrolls through; one column read from top to bottom like a letter; a board whose columns the work moves across; one action in front and the rest folded away. These are examples of the kind, not a list to reuse: draw each from its source and from what the users do most, as a counter's ticket rail gives a queue read from left to right, or a lectern one document in the middle with its notes in the margin.
2. **None the same.** Two theses that would draw the same skeleton, such as two grids of cards under a header, are one: change one. On the product as it is, none is its current structure: a direction that keeps its header, its menu and its blocks where they are is the front repainted.
3. **What a screen holds stays**: every piece of data and every action, laid out anew. A thesis never drops an action to make room, nor adds one.
4. **A charter that fixes the look** keeps it whole in every direction: the theses are then what sets them apart. Without one, the product's own colour, its logo's, comes back as a touch at most, never as the palette.

## A direction that dares

Steering clear of the banned looks is not a direction. A round where every direction is grey, slate or navy, in one condensed sans, with colour only on a badge, has avoided every cliché and still says nothing: a person who sees ten proposals, a client or the jury of a tender, has forgotten it by evening. Every direction but the classic takes a real risk, drawn from its source:

- **A signature**: on the first screen, one thing no other product of its kind shows, that one could describe from memory the next day, such as a garden shop's plants laid across the page from deep shade to full sun, as they need light, or a rowing club's crews set as the lanes of a race. These are examples of the kind, not signatures to reuse. It comes from the source and carries the main loop: a way of showing the data or the action, never a decoration set beside it.
- **A colour that owns space**: at least one colour of the source in large areas, a band, a field, a whole panel, not only on a badge or a button. Greys with one accent are the classic's palette.
- **A type with a voice**: a typeface chosen for its character, from the source, for the titles and the figures. No two directions of a round share a family.
- **Contrast of scale**: what the user came for, a figure, a level, a deadline, set far bigger than the rest. A screen where everything is one size reads as a form.

Daring is never ornament. No geometry drawn for the source's sake: a polygon, a cone or a beam of light, a halo, a rosette, a dial; no object of the source drawn to carry the content, such as a plate or a lighthouse holding the forecast. The source gives the colours, the type and the rhythm; the content keeps the shape of its kind. Dense screens dare too: a table takes the direction's colour, type and rhythm. A dense screen that is the classic's with another header has not dared. Daring is in how a thing is shown, never in what is hidden: what the brief keeps stays whole, readable, and every level written out; contrast is measured by `aeom check`.

## Pictures

What a screen shows of the real world is shown as it is. A real place, building, landscape, species, crop, object or event, such as a town and its port, a museum's collection or a field in spring, is a photograph of it under a free licence, from Wikimedia Commons (public domain, CC0, CC BY or CC BY-SA), found through its API with a generic User-Agent and only the thing it shows as the words of the query. Its author and its licence are written beside it on the screen, and kept with its address in `credits.md` beside the images. A photograph stands beside the content it shows, never as decoration: a kind that shows none, such as a weather home that leads with the weather or a work tool, has none, and its pictograms and charts carry it. Never a picture drawn in CSS or SVG, never a landscape in flat shapes, never a generated image of a real place, never a fake logo: CSS and SVG draw icons, charts and maps of data only. A generated image, `aeom image`, is for a product that draws its own world, such as a game or a brand that illustrates, in that world's illustration style.

## For a tender

`/aeom directions --tender` is for a call for tenders, a pitch or a brief answered with mockups: a jury compares them with other bids, in a few minutes each, and buys what it can picture in production. The directions must sell, so they are different from each other without going in every direction:

- **Its kind at a glance.** A weather site looks like a weather site: today's weather and the days ahead first, the warning, the town; a work tool looks like a work tool. A jury that has to be told what it looks at has already moved on. A direction's structure is one of its kind's known patterns (a top bar, a side rail, a board, a list and its record), each direction a different one; never a radial page, a hidden main menu or a layout that must be learnt.
- **The register of its kind.** Decide it once from the brief, before drawing, and give it to every worker. A work tool, a back office, a public service's forms, a dashboard read every day is **calm**: neutrals, one accent, one or two families of type, colour only where it means something; its daring is in how its main data is drawn, such as the week's deadlines on one strip, the day read as a timetable or the search set as the whole head of the page, never in a palette or a motif. A product the public opens for a subject that is itself alive, such as the weather, a festival, a museum or a coast, is **lively**, and its life comes from its data and its real world: the colour of the sky behind today's weather, a temperature scale on every bar, the photograph of the place. A town's site sits between: calm, with the town in its photographs. A jury buys a calm tool and a lively subject; it never buys a tool in costume, nor a dull weather.
- **One mark, where it serves.** The direction's mark, an arrow, a stripe, a highlight, a stamp, a colour code, appears where it carries the data or the main action. Repeated on every button, every row, every heading or the edge of every block, it is ornament: an arrow on each button, a flag before each line, a highlighter under each title, capitals on each label, a ruler along the page. In the calm register, the colour that owns space is one band at most, such as the head of the page or its search.
- **Pictures of the real world, or none**, as **Pictures** above says: a town's site shows the town, a museum its collection, each photograph credited beside it; a weather home or a work tool shows none.
- **The difference is in colour, type, density and composition**, and in how the main data is shown: the days as bands, a deadline set huge, the warning as a whole field. **A direction that dares** holds, and its ban on ornament first: nothing drawn, no texture, no metaphor of the source made literal.
- **The level of the best of its kind.** Before drawing, look at four to six of the best products of the kind, and say what makes them good: how the main figure is set, how the data is drawn, the icons, the spacing, the type sizes. A direction reaches that level, never their look: no layout, colour or brand taken from one of them.
- **Its kind's icons and charts.** A kind that lives by pictograms gets a real icon set, consistent and under an open licence, its licence kept beside the pages: a weather site its sky pictograms, a shop its product photos. Its data is drawn the way its users already read it, such as an hour-by-hour strip, a high and low range bar, rain as bars. These are not ornament: the ban on ornament is about decoration, never about the pictograms and charts of the kind.
- **Readable first.** Text at 16 px, never under 13 px, numbers that carry the screen far bigger, rows and blocks with room to breathe, one focal point per screen; `aeom check`'s font-size passes. Type that reads: a voice in the titles at most, figures that line up and look plain, never a slashed or dotted zero outside code, capitals for a short label only. A requirement is visible, not every row of every table at once: the detail folds behind a link when the spec keeps it a click away.
- **Every requirement in sight.** What the spec asks to see (dates, levels written out, deadlines, a phone number, a legal mention) is visible and readable, because the jury checks it against its grid: a direction that hides one loses points whatever its look. A requirement is shown by the product doing it, never by quoting the spec: no article number, no « CCTP » or « RC » on a screen, no sentence that argues for the bid, such as how the figures are computed, « sans ressaisie », or « 10 engagements sur 11 tenus » set as a headline. The screen informs; the written answer argues. A number the users themselves use, such as an indicator's in its own table, stays, once; a figure is said once per screen. A colour that already means something in the product's world keeps that meaning only: where yellow, orange and red are warning levels, they never colour a rain band, a brand or a deadline.
- **Real and finished**: the spec's own data and words, every state drawn, a brand the client could replace by its own when the spec asks for it, pages that look delivered, not explored.

The sources still come from the product's world, as **Where a direction comes from** says, but each gives a palette, a type and a rhythm, never a picture. The classic is drawn as ever.


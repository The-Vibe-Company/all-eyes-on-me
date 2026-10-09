// Gabarits HTML de toutes les pages.

import { ajouterJours, dateCourte, dateLongue, jourSemaine, moisCourt, numeroDuJour, periode } from './dates.mjs';
import { brut, html, typo } from './html.mjs';
import {
  DUREE_MAX_DEFAUT, ETATS, LIBELLES_STATUT, disponibilite, jourReserve, libelleEtat, statutEmprunt,
} from './regles.mjs';

// ---------------------------------------------------------------- icônes

const trace = (chemins) => brut(
  `<svg class="icone" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${chemins}</svg>`,
);

const ICONES = {
  bricolage: trace('<path d="M14.7 6.3a4 4 0 0 0 5 5L21 10a5 5 0 0 1-6.4 3.6L7 21.2a2 2 0 0 1-2.8-2.8l7.6-7.6A5 5 0 0 1 15.4 4.4l-1.3 1.3a4 4 0 0 0 .6.6z"/>'),
  jardinage: trace('<path d="M12 21v-8"/><path d="M12 13c0-4.4 3-7.5 8-7.5 0 5-3 7.5-8 7.5z"/><path d="M12 15.5c0-3.3-2.5-6-7-6 0 4 2.5 6 7 6z"/>'),
  cuisine: trace('<path d="M4 11h16v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M2 11h2"/><path d="M20 11h2"/><path d="M9.5 3.5c-.8 1 .8 2 0 3.5"/><path d="M14 3.5c-.8 1 .8 2 0 3.5"/>'),
  maison: trace('<path d="M3.5 11.5 12 4l8.5 7.5"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5.5h4V20"/>'),
  'plein-air': trace('<path d="M2.5 20h19"/><path d="M12 4 3.8 20"/><path d="M12 4l8.2 16"/><path d="M12 12.5 9 20h6z"/>'),
  'fetes-jeux': trace('<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="15" r="1.1" fill="currentColor" stroke="none"/>'),
};
const icone = (categorie) => ICONES[categorie] ?? ICONES.maison;

const LOGO = brut('<svg class="marque__logo" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false"><path class="logo__etiquette" d="M6 4h13l9 9.5-11 11.5L6 14z"/><circle class="logo__trou" cx="11" cy="9.5" r="2.2"/><path class="logo__ficelle" d="M11 9.5C8 6 4.5 5 2.5 7"/></svg>');

// ---------------------------------------------------------------- outils

const nomVoisin = (v) => (v ? `${v.prenom} ${v.initiale}` : 'un voisin');
const trouverVoisin = (d, id) => d.voisins.find((v) => v.id === id);
const trouverCategorie = (d, id) => d.categories.find((c) => c.id === id);
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

function pastille(dispo) {
  if (dispo.etat === 'disponible') return html`<span class="pastille pastille--libre">Disponible</span>`;
  if (dispo.etat === 'attente-retour') return html`<span class="pastille pastille--attente">Retour attendu</span>`;
  return html`<span class="pastille">Libre le ${dateCourte(dispo.libreLe)}</span>`;
}

const erreurChamp = (erreurs, champ) => (erreurs[champ]
  ? html`<p class="champ__erreur" id="erreur-${champ}">${erreurs[champ]}</p>`
  : '');

const attributsErreur = (erreurs, champ, aide) => {
  const decrit = [aide, erreurs[champ] ? `erreur-${champ}` : null].filter(Boolean).join(' ');
  return brut(`${erreurs[champ] ? ' aria-invalid="true"' : ''}${decrit ? ` aria-describedby="${decrit}"` : ''}`);
};

function resumeErreurs(erreurs, libelles) {
  const cles = Object.keys(erreurs);
  if (!cles.length) return '';
  return html`
    <div class="alerte alerte--erreur" role="alert" tabindex="-1" id="erreurs">
      <p class="alerte__titre">${cles.length > 1 ? 'Quelques points à corriger :' : 'Un point à corriger :'}</p>
      <ul>${cles.map((c) => (c === 'general'
        ? html`<li>${erreurs[c]}</li>`
        : html`<li><a href="#${c}">${libelles[c] ?? c}</a> : ${erreurs[c]}</li>`))}</ul>
    </div>`;
}

const MESSAGES = {
  connecte: 'Vous êtes connecté. Bonne visite !',
  deconnecte: 'Vous êtes déconnecté. À bientôt dans le quartier.',
  reserve: 'C’est réservé. L’adresse et les horaires du prêteur sont juste en dessous.',
  rendu: 'Merci ! L’objet est noté comme rendu.',
  annule: 'Réservation annulée : l’objet est de nouveau libre à ces dates.',
  propose: 'Merci ! Votre objet est en ligne, les voisins peuvent déjà le réserver.',
};

export function messageFlash(cle) {
  const texte = MESSAGES[cle];
  return texte ? html`<p class="alerte alerte--ok" role="status">${typo(texte)}</p>` : '';
}

// ---------------------------------------------------------------- mise en page

function lienNav(href, texte, cle, actif) {
  return html`<li><a href="${href}"${brut(cle === actif ? ' aria-current="page"' : '')}>${texte}</a></li>`;
}

export function miseEnPage({ titre, actif = '', moi = null, contenu, flash = '' }) {
  return String(html`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titre ? `${titre} · Le Prêt` : 'Le Prêt · on s’emprunte des objets entre voisins'}</title>
<meta name="description" content="Le Prêt, la bibliothèque d’objets du quartier des Tilleuls : perceuse, échelle, appareil à raclette, tente… à emprunter gratuitement à vos voisins.">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/style.css">
<script src="/app.js" defer></script>
</head>
<body>
<a class="evitement" href="#contenu">Aller au contenu</a>
<header class="entete">
  <div class="entete__dedans">
    <a class="marque" href="/">${LOGO}<span class="marque__nom">Le Prêt</span><span class="marque__lieu">quartier des Tilleuls</span></a>
    <nav class="nav" aria-label="Navigation principale">
      <ul>
        ${lienNav('/objets', 'Les objets', 'objets', actif)}
        ${lienNav('/proposer', 'Prêter un objet', 'proposer', actif)}
        ${lienNav('/a-propos', 'Comment ça marche', 'a-propos', actif)}
        ${moi ? lienNav('/mes-emprunts', 'Mes emprunts', 'mes-emprunts', actif) : lienNav('/connexion', 'Se connecter', 'connexion', actif)}
      </ul>
    </nav>
    ${moi ? html`
    <form class="session" method="post" action="/deconnexion">
      <span class="session__nom">${nomVoisin(moi)}</span>
      <button class="lien-bouton" type="submit">Se déconnecter</button>
    </form>` : ''}
  </div>
</header>
<main id="contenu" class="page" tabindex="-1">
${flash}
${contenu}
</main>
<footer class="pied">
  <div class="pied__dedans">
    <p><strong>Le Prêt</strong> : on s’emprunte des objets entre voisins, gratuitement, dans le quartier des Tilleuls.</p>
    <p class="pied__note">Prototype : les voisins, les objets et le compte sont fictifs.</p>
  </div>
</footer>
</body>
</html>
`);
}

// ---------------------------------------------------------------- cartes d'objets

function carteObjet(d, objet, jour) {
  const preteur = trouverVoisin(d, objet.preteur);
  const categorie = trouverCategorie(d, objet.categorie);
  const dispo = disponibilite(objet, d.emprunts, jour);
  return html`
    <li class="carte">
      <p class="carte__categorie">${icone(objet.categorie)}${categorie?.nom ?? ''}</p>
      <h3 class="carte__nom"><a href="/objets/${objet.id}">${objet.nom}</a></h3>
      <p class="carte__meta">${libelleEtat(objet.etat)} · prêté par ${nomVoisin(preteur)}</p>
      <p class="carte__dispo">${pastille(dispo)}</p>
    </li>`;
}

const grilleObjets = (d, objets, jour) => html`<ul class="grille" role="list">${objets.map((o) => carteObjet(d, o, jour))}</ul>`;

// ---------------------------------------------------------------- accueil

export function accueil({ d, jour }) {
  const libres = d.objets.filter((o) => disponibilite(o, d.emprunts, jour).etat === 'disponible');
  const recents = [...d.objets].sort((a, b) => b.ajouteLe.localeCompare(a.ajouteLe)).slice(0, 3);
  return html`
  <section class="une">
    <div class="une__texte">
      <p class="surtitre">Bibliothèque d’objets du quartier des Tilleuls</p>
      <h1>Ce qui dort dans le placard d’un voisin peut vous servir ce week-end.</h1>
      <p class="chapo">Une perceuse pour un après-midi, une échelle pour les gouttières, un appareil à raclette pour samedi soir. ${pluriel(d.voisins.length, 'voisin prête', 'voisins prêtent')} ${pluriel(d.objets.length, 'objet', 'objets')}, gratuitement, à quelques rues de chez vous.</p>
      <form class="recherche recherche--une" action="/objets" method="get" role="search">
        <label for="q-une">De quoi avez-vous besoin ?</label>
        <div class="recherche__ligne">
          <input id="q-une" name="q" type="search" placeholder="Ex. : perceuse, tente, raclette" autocomplete="off">
          <button class="bouton" type="submit">Chercher</button>
        </div>
      </form>
    </div>
    <aside class="une__etiquettes" aria-label="Catégories">
      <h2 class="titre-discret">Parcourir par catégorie</h2>
      <ul class="categories" role="list">
        ${d.categories.map((c) => {
          const n = d.objets.filter((o) => o.categorie === c.id).length;
          return html`<li><a href="/objets?categorie=${c.id}">${icone(c.id)}<span>${c.nom}</span><span class="categories__compte">${n}</span></a></li>`;
        })}
      </ul>
    </aside>
  </section>

  <section class="bloc">
    <div class="bloc__tete">
      <h2>Libres aujourd’hui</h2>
      <a href="/objets?dispo=1">Tous les objets libres (${libres.length})</a>
    </div>
    ${grilleObjets(d, libres.slice(0, 6), jour)}
  </section>

  <section class="bloc bloc--etapes">
    <h2>Emprunter, en trois temps</h2>
    <ol class="etapes">
      <li><strong>Choisissez vos dates.</strong> Chaque objet a son calendrier : vous voyez tout de suite quand il est libre.</li>
      <li><strong>Passez le chercher.</strong> Une fois la réservation faite, vous recevez l’adresse et les horaires du voisin qui le prête.</li>
      <li><strong>Rendez-le comme vous l’avez trouvé.</strong> Propre, chargé, complet. Puis indiquez-le dans « Mes emprunts ».</li>
    </ol>
    <p><a href="/a-propos">Les règles du Prêt et les questions fréquentes</a></p>
  </section>

  <section class="bloc">
    <div class="bloc__tete">
      <h2>Arrivés récemment</h2>
      <a href="/proposer">Vous aussi, prêtez un objet</a>
    </div>
    ${grilleObjets(d, recents, jour)}
  </section>`;
}

// ---------------------------------------------------------------- catalogue

const sansAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtrerObjets(d, { q, categorie, dispo }, jour) {
  const mots = sansAccents(q).split(/\s+/).filter(Boolean);
  return d.objets
    .filter((o) => !categorie || o.categorie === categorie)
    .filter((o) => {
      if (!mots.length) return true;
      const texte = sansAccents(`${o.nom} ${o.description} ${trouverCategorie(d, o.categorie)?.nom ?? ''}`);
      return mots.every((m) => texte.includes(m));
    })
    .filter((o) => !dispo || disponibilite(o, d.emprunts, jour).etat === 'disponible')
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

function lienFiltre({ q, dispo }, categorie) {
  const p = new URLSearchParams();
  if (categorie) p.set('categorie', categorie);
  if (q) p.set('q', q);
  if (dispo) p.set('dispo', '1');
  const chaine = p.toString();
  return chaine ? `/objets?${chaine}` : '/objets';
}

export function catalogue({ d, jour, filtres }) {
  const objets = filtrerObjets(d, filtres, jour);
  const categorie = trouverCategorie(d, filtres.categorie);
  const actuel = (id) => brut((filtres.categorie || '') === id ? ' aria-current="true"' : '');
  return html`
  <div class="titre-page">
    <h1>${categorie ? categorie.nom : 'Tous les objets'}</h1>
    <p class="chapo">Tout ce que les voisins du quartier mettent à disposition. Ouvrez un objet pour voir son calendrier et le réserver.</p>
  </div>

  <form class="filtres" action="/objets" method="get" role="search">
    ${filtres.categorie ? html`<input type="hidden" name="categorie" value="${filtres.categorie}">` : ''}
    <div class="filtres__champ">
      <label for="q">Rechercher un objet</label>
      <input id="q" name="q" type="search" value="${filtres.q}" placeholder="Ex. : scie, fondue, échelle" autocomplete="off">
    </div>
    <label class="case"><input type="checkbox" name="dispo" value="1"${brut(filtres.dispo ? ' checked' : '')}> Libres aujourd’hui seulement</label>
    <button class="bouton" type="submit">Rechercher</button>
  </form>

  <nav class="onglets" aria-label="Catégories">
    <ul role="list">
      <li><a href="${lienFiltre(filtres, '')}"${actuel('')}>Toutes</a></li>
      ${d.categories.map((c) => html`<li><a href="${lienFiltre(filtres, c.id)}"${actuel(c.id)}>${icone(c.id)}${c.nom}</a></li>`)}
    </ul>
  </nav>

  ${objets.length ? html`<p class="compte" role="status">${pluriel(objets.length, 'objet', 'objets')}${filtres.q ? html` pour « ${filtres.q} »` : ''}</p>` : ''}

  ${objets.length
    ? grilleObjets(d, objets, jour)
    : html`<div class="vide">
        <p>Aucun objet ne correspond${filtres.q ? html` à « ${filtres.q} »` : ''}${categorie ? html` dans ${categorie.nom}` : ''}${filtres.dispo ? ' parmi les objets libres aujourd’hui' : ''}.</p>
        <p><a href="/objets">Voir tous les objets</a> ou <a href="/proposer">prêter le vôtre</a> : quelqu’un d’autre le cherche peut-être aussi.</p>
      </div>`}`;
}

// ---------------------------------------------------------------- fiche d'un objet

function calendrier(dispo, jour, moi) {
  const decalage = (jourSemaine(jour) + 6) % 7; // lundi = 0
  const premier = ajouterJours(jour, -decalage);
  const semaines = [];
  for (let s = 0; s < 5; s += 1) {
    const jours = [];
    for (let j = 0; j < 7; j += 1) jours.push(ajouterJours(premier, s * 7 + j));
    semaines.push(jours);
  }
  const mien = (iso) => moi && dispo.actifs.some((e) => e.voisin === moi.id && e.debut <= iso && iso <= e.fin);
  const cellule = (iso, index) => {
    const n = numeroDuJour(iso);
    const etiquette = n === 1 || (index === 0 && iso === premier) ? `${n} ${moisCourt(iso)}` : String(n);
    let classe = 'libre';
    let etat = 'libre';
    if (iso < jour) { classe = 'passe'; etat = 'passé'; }
    else if (mien(iso)) { classe = 'mien'; etat = 'réservé par vous'; }
    else if (jourReserve(iso, dispo.actifs)) { classe = 'pris'; etat = 'réservé'; }
    return html`<td class="jour jour--${classe}${iso === jour ? ' jour--aujourdhui' : ''}"><span aria-hidden="true">${etiquette}</span><span class="invisible">${dateLongue(iso)} : ${etat}</span></td>`;
  };
  return html`
    <table class="calendrier">
      <caption class="invisible">Calendrier des cinq prochaines semaines</caption>
      <thead><tr>${['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'].map((j) => html`<th scope="col"><abbr title="${j}">${j[0].toUpperCase()}</abbr></th>`)}</tr></thead>
      <tbody>${semaines.map((jours) => html`<tr>${jours.map((iso, i) => cellule(iso, i))}</tr>`)}</tbody>
    </table>
    <ul class="legende" role="list">
      <li><span class="legende__case jour--libre"></span>Libre</li>
      <li><span class="legende__case jour--pris"></span>Réservé</li>
      ${moi ? html`<li><span class="legende__case jour--mien"></span>Votre réservation</li>` : ''}
    </ul>`;
}

function etatDuJour(dispo, preteur) {
  if (dispo.etat === 'disponible') {
    return html`<p class="tampon tampon--libre">Libre aujourd’hui</p>
      ${dispo.aVenir.length
        ? html`<p>Prochaine réservation ${periode(dispo.aVenir[0].debut, dispo.aVenir[0].fin)}.</p>`
        : html`<p>Aucune réservation à venir.</p>`}`;
  }
  if (dispo.etat === 'attente-retour') {
    return html`<p class="tampon">Retour attendu</p>
      <p>Il devait revenir chez ${preteur.prenom} le ${dateLongue(dispo.enRetard.fin)}. Vous pouvez quand même réserver des dates plus tard.</p>`;
  }
  return html`<p class="tampon">Prêté en ce moment</p>
    <p>Libre à partir du <strong>${dateLongue(dispo.libreLe)}</strong>.</p>`;
}

function formulaireEmprunt({ objet, preteur, moi, dispo, jour, erreurs, valeurs }) {
  if (!moi) {
    return html`
      <div class="encart">
        <h2>Emprunter cet objet</h2>
        <p>Le Prêt est réservé aux habitants du quartier. Connectez-vous pour choisir vos dates.</p>
        <a class="bouton" href="/connexion?suite=${encodeURIComponent(`/objets/${objet.id}`)}">Se connecter pour emprunter</a>
      </div>`;
  }
  if (objet.preteur === moi.id) {
    return html`
      <div class="encart">
        <h2>C’est votre objet</h2>
        <p>Vous le prêtez aux voisins. Ses réservations apparaissent aussi dans <a href="/mes-emprunts">Mes emprunts</a>.</p>
      </div>`;
  }
  const dureeMax = objet.dureeMax ?? DUREE_MAX_DEFAUT;
  const debutParDefaut = dispo.etat === 'attente-retour' ? ajouterJours(jour, 1) : dispo.libreLe;
  const debut = valeurs.debut ?? debutParDefaut;
  const fin = valeurs.fin ?? debutParDefaut;
  const max = ajouterJours(jour, 60);
  return html`
    <form class="encart formulaire" method="post" action="/objets/${objet.id}/emprunter" novalidate>
      <h2>Réserver cet objet</h2>
      ${resumeErreurs(erreurs, { debut: 'Début', fin: 'Retour' })}
      <div class="formulaire__dates">
        <div class="champ">
          <label for="debut">Je viens le chercher le</label>
          <input id="debut" name="debut" type="date" value="${debut}" min="${jour}" max="${max}" required${attributsErreur(erreurs, 'debut')}>
          ${erreurChamp(erreurs, 'debut')}
        </div>
        <div class="champ">
          <label for="fin">Je le rends le</label>
          <input id="fin" name="fin" type="date" value="${fin}" min="${jour}" max="${max}" required data-duree-max="${dureeMax}"${attributsErreur(erreurs, 'fin', 'aide-duree')}>
          ${erreurChamp(erreurs, 'fin')}
        </div>
      </div>
      <p class="champ__aide" id="aide-duree">${preteur.prenom} le prête ${pluriel(dureeMax, 'jour', 'jours')} au plus. <span data-duree-affichee></span></p>
      <button class="bouton" type="submit">Réserver</button>
    </form>`;
}

export function ficheObjet({ d, jour, moi, objet, erreurs = {}, valeurs = {} }) {
  const preteur = trouverVoisin(d, objet.preteur);
  const categorie = trouverCategorie(d, objet.categorie);
  const dispo = disponibilite(objet, d.emprunts, jour);
  const prochaines = dispo.actifs.filter((e) => e.fin >= jour);
  return html`
  <nav class="fil" aria-label="Fil d’Ariane">
    <a href="/objets">Les objets</a> <span aria-hidden="true">/</span>
    <a href="/objets?categorie=${objet.categorie}">${categorie?.nom ?? ''}</a>
  </nav>

  <div class="fiche">
    <article class="fiche__principal">
      <p class="carte__categorie">${icone(objet.categorie)}${categorie?.nom ?? ''}</p>
      <h1>${objet.nom}</h1>
      <p class="fiche__etat">${libelleEtat(objet.etat)}</p>
      <p class="fiche__description">${typo(objet.description)}</p>
      ${objet.consignes ? html`
      <div class="consigne">
        <h2 class="titre-discret">Le mot de ${preteur.prenom}</h2>
        <p>${typo(objet.consignes)}</p>
      </div>` : ''}

      <section class="preteur" aria-labelledby="titre-preteur">
        <h2 id="titre-preteur" class="titre-discret">Qui le prête</h2>
        <p class="preteur__nom">${nomVoisin(preteur)}, ${preteur.rue}</p>
        <p>${typo(preteur.mot)}</p>
        <p class="preteur__depuis">Prête des objets au Prêt depuis ${preteur.depuis}. Durée de prêt : ${pluriel(objet.dureeMax ?? DUREE_MAX_DEFAUT, 'jour', 'jours')} au plus.</p>
      </section>
    </article>

    <aside class="fiche__cote" aria-label="Disponibilité et réservation">
      <section class="encart">
        <h2>Disponibilité</h2>
        ${etatDuJour(dispo, preteur)}
        ${calendrier(dispo, jour, moi)}
        ${prochaines.length ? html`
        <h3 class="titre-discret">Fiche de prêt</h3>
        <ul class="fiche-pret" role="list">
          ${prochaines.map((e) => html`<li><span>${periode(e.debut, e.fin)}</span><span>${moi && e.voisin === moi.id ? 'vous' : 'réservé'}</span></li>`)}
        </ul>` : ''}
      </section>
      ${formulaireEmprunt({ objet, preteur, moi, dispo, jour, erreurs, valeurs })}
    </aside>
  </div>`;
}

// ---------------------------------------------------------------- connexion

export function connexion({ erreur = '', email = '', suite = '' }) {
  return html`
  <div class="etroit">
    <h1>Se connecter</h1>
    <p class="chapo">Connectez-vous pour réserver un objet, suivre vos emprunts et prêter les vôtres.</p>
    ${erreur ? html`<div class="alerte alerte--erreur" role="alert"><p>${erreur}</p></div>` : ''}
    <form class="formulaire encart" method="post" action="/connexion">
      ${suite ? html`<input type="hidden" name="suite" value="${suite}">` : ''}
      <div class="champ">
        <label for="email">Adresse e-mail</label>
        <input id="email" name="email" type="email" value="${email}" autocomplete="username" required spellcheck="false"${brut(erreur ? ' aria-invalid="true"' : '')}>
      </div>
      <div class="champ">
        <label for="motdepasse">Mot de passe</label>
        <input id="motdepasse" name="motdepasse" type="password" autocomplete="current-password" required${brut(erreur ? ' aria-invalid="true"' : '')}>
      </div>
      <button class="bouton" type="submit">Se connecter</button>
    </form>
    <p class="note">Prototype : il n’existe qu’un compte de démonstration, décrit dans le README.</p>
  </div>`;
}

// ---------------------------------------------------------------- mes emprunts

function ligneEmprunt(d, e, jour) {
  const objet = d.objets.find((o) => o.id === e.objet);
  const preteur = trouverVoisin(d, objet?.preteur);
  const statut = statutEmprunt(e, jour);
  const action = statut === 'a-venir'
    ? html`<button class="bouton bouton--second" type="submit">Annuler la réservation</button>`
    : html`<button class="bouton" type="submit">J’ai rendu l’objet</button>`;
  return html`
    <li class="emprunt emprunt--${statut}">
      <div class="emprunt__tete">
        <h3><a href="/objets/${e.objet}">${objet?.nom ?? 'Objet retiré'}</a></h3>
        <span class="statut statut--${statut}">${LIBELLES_STATUT[statut]}</span>
      </div>
      <p class="emprunt__dates">${periode(e.debut, e.fin)}</p>
      ${preteur ? html`<p>Chez <strong>${nomVoisin(preteur)}</strong>, ${preteur.adresse}. Passer ${preteur.creneaux}.</p>` : ''}
      ${statut === 'en-retard' ? html`<p class="emprunt__alerte">Le retour était prévu le ${dateLongue(e.fin)}. ${preteur?.prenom ?? 'Le prêteur'} attend son objet.</p>` : ''}
      ${objet?.consignes ? html`<p class="emprunt__consigne">${typo(objet.consignes)}</p>` : ''}
      <form method="post" action="/emprunts/${e.id}/rendre">${action}</form>
    </li>`;
}

export function mesEmprunts({ d, jour, moi }) {
  const miens = d.emprunts.filter((e) => e.voisin === moi.id);
  const actifs = miens.filter((e) => e.statut === 'actif').sort((a, b) => a.debut.localeCompare(b.debut));
  const passes = miens.filter((e) => e.statut !== 'actif').sort((a, b) => b.debut.localeCompare(a.debut));
  const mesObjets = d.objets.filter((o) => o.preteur === moi.id);
  return html`
  <div class="titre-page">
    <h1>Mes emprunts</h1>
    <p class="chapo">Bonjour ${moi.prenom}. Voici ce que vous avez emprunté ou réservé, et ce que vous prêtez.</p>
  </div>

  <section class="bloc" aria-labelledby="titre-en-cours">
    <h2 id="titre-en-cours">En cours et à venir</h2>
    ${actifs.length
      ? html`<ul class="emprunts" role="list">${actifs.map((e) => ligneEmprunt(d, e, jour))}</ul>`
      : html`<div class="vide"><p>Rien en ce moment.</p><p><a href="/objets">Trouver un objet à emprunter</a></p></div>`}
  </section>

  <section class="bloc" aria-labelledby="titre-historique">
    <h2 id="titre-historique">Historique</h2>
    ${passes.length ? html`
    <table class="tableau">
      <thead><tr><th scope="col">Objet</th><th scope="col">Dates</th><th scope="col">Statut</th></tr></thead>
      <tbody>
        ${passes.map((e) => {
          const objet = d.objets.find((o) => o.id === e.objet);
          const statut = e.statut === 'rendu'
            ? `Rendu le ${dateLongue(e.renduLe ?? e.fin)}`
            : `Annulé${e.annuleLe ? ` le ${dateLongue(e.annuleLe)}` : ''}`;
          return html`<tr><td><a href="/objets/${e.objet}">${objet?.nom ?? 'Objet retiré'}</a></td><td>${periode(e.debut, e.fin)}</td><td>${statut}</td></tr>`;
        })}
      </tbody>
    </table>` : html`<p class="vide">Pas encore d’historique.</p>`}
  </section>

  <section class="bloc" aria-labelledby="titre-mes-objets">
    <div class="bloc__tete">
      <h2 id="titre-mes-objets">Ce que je prête</h2>
      <a href="/proposer">Prêter un autre objet</a>
    </div>
    ${mesObjets.length ? html`
    <ul class="emprunts" role="list">
      ${mesObjets.map((o) => {
        const dispo = disponibilite(o, d.emprunts, jour);
        const prochaines = dispo.actifs.filter((e) => e.fin >= jour);
        return html`
        <li class="emprunt">
          <div class="emprunt__tete">
            <h3><a href="/objets/${o.id}">${o.nom}</a></h3>
            ${pastille(dispo)}
          </div>
          ${prochaines.length
            ? html`<ul class="sous-liste">${prochaines.map((e) => html`<li>${nomVoisin(trouverVoisin(d, e.voisin))}, ${periode(e.debut, e.fin)}</li>`)}</ul>`
            : html`<p>Aucune réservation pour l’instant.</p>`}
        </li>`;
      })}
    </ul>` : html`<p class="vide">Vous ne prêtez encore rien. <a href="/proposer">Proposer un objet</a></p>`}
  </section>`;
}

// ---------------------------------------------------------------- proposer un objet

export function proposer({ d, moi, erreurs = {}, valeurs = {} }) {
  const v = { nom: '', categorie: '', description: '', etat: '', ...valeurs };
  const intro = html`
  <div class="titre-page">
    <h1>Prêter un objet</h1>
    <p class="chapo">Un objet qui sert deux fois par an chez vous peut dépanner quelqu’un dans la rue d’à côté. Décrivez-le en quelques lignes : il apparaît tout de suite dans le catalogue, à votre nom.</p>
  </div>`;
  if (!moi) {
    return html`${intro}
    <div class="encart etroit">
      <p>Pour prêter un objet, connectez-vous : les voisins doivent savoir chez qui venir le chercher.</p>
      <a class="bouton" href="/connexion?suite=%2Fproposer">Se connecter pour prêter</a>
    </div>`;
  }
  return html`${intro}
  <form class="formulaire encart etroit" method="post" action="/proposer" novalidate>
    ${resumeErreurs(erreurs, { nom: 'Nom de l’objet', categorie: 'Catégorie', description: 'Description', etat: 'État' })}
    <div class="champ">
      <label for="nom">Nom de l’objet</label>
      <input id="nom" name="nom" type="text" value="${v.nom}" maxlength="60" required${attributsErreur(erreurs, 'nom', 'aide-nom')}>
      <p class="champ__aide" id="aide-nom">Le plus simple possible : « Ponceuse vibrante », « Nappe ronde 8 couverts ».</p>
      ${erreurChamp(erreurs, 'nom')}
    </div>
    <div class="champ">
      <label for="categorie">Catégorie</label>
      <select id="categorie" name="categorie" required${attributsErreur(erreurs, 'categorie')}>
        <option value="">Choisir…</option>
        ${d.categories.map((c) => html`<option value="${c.id}"${brut(v.categorie === c.id ? ' selected' : '')}>${c.nom}</option>`)}
      </select>
      ${erreurChamp(erreurs, 'categorie')}
    </div>
    <div class="champ">
      <label for="description">Description</label>
      <textarea id="description" name="description" rows="5" maxlength="600" required${attributsErreur(erreurs, 'description', 'aide-description')}>${v.description}</textarea>
      <p class="champ__aide" id="aide-description">Ce qui est fourni avec, à quoi il sert, ce qu’il ne sait pas faire.</p>
      ${erreurChamp(erreurs, 'description')}
    </div>
    <fieldset class="champ" id="etat"${attributsErreur(erreurs, 'etat')}>
      <legend>État</legend>
      <div class="choix">
        ${ETATS.map((e) => html`<label class="case"><input type="radio" name="etat" value="${e.id}"${brut(v.etat === e.id ? ' checked' : '')}> ${e.libelle}</label>`)}
      </div>
      ${erreurChamp(erreurs, 'etat')}
    </fieldset>
    <p class="note">Il sera prêté au plus ${DUREE_MAX_DEFAUT} jours d’affilée, à récupérer chez vous (${moi.adresse}).</p>
    <button class="bouton" type="submit">Proposer l’objet</button>
  </form>`;
}

// ---------------------------------------------------------------- à propos

export function aPropos({ d }) {
  return html`
  <div class="titre-page">
    <h1>Comment ça marche</h1>
    <p class="chapo">Le Prêt est une bibliothèque d’objets sans local ni étagères : les objets restent chez ceux qui les prêtent, le site sert à savoir qui a quoi et quand c’est libre.</p>
  </div>

  <div class="colonnes">
    <section class="bloc">
      <h2>Pour emprunter</h2>
      <ol class="etapes">
        <li><strong>Trouvez l’objet.</strong> Cherchez par nom ou par catégorie. Chaque fiche dit dans quel état il est et qui le prête.</li>
        <li><strong>Réservez vos dates.</strong> Le calendrier montre les jours déjà pris. Chaque prêteur fixe une durée maximale, souvent une semaine.</li>
        <li><strong>Passez le chercher.</strong> L’adresse et les horaires du prêteur s’affichent dans « Mes emprunts » une fois la réservation faite.</li>
        <li><strong>Rendez-le, puis dites-le.</strong> Rapportez l’objet propre et complet, puis cliquez sur « J’ai rendu l’objet ».</li>
      </ol>
    </section>

    <section class="bloc">
      <h2>Pour prêter</h2>
      <p>Tout habitant du quartier peut prêter un objet. Remplissez le formulaire <a href="/proposer">Prêter un objet</a> : nom, catégorie, description, état. L’objet apparaît aussitôt dans le catalogue.</p>
      <p>Vous restez maître de votre objet : il ne quitte votre placard que le temps d’un emprunt, et vous voyez qui l’a réservé dans « Mes emprunts ».</p>
    </section>
  </div>

  <section class="bloc">
    <h2>Les règles de la maison</h2>
    <ul class="regles">
      <li><strong>C’est gratuit.</strong> Ni location ni caution : on se rend service entre voisins.</li>
      <li><strong>On rend à l’heure.</strong> Si vous avez besoin d’un jour de plus, prévenez le prêteur avant la date de retour.</li>
      <li><strong>On rend comme on a trouvé.</strong> Propre, batterie chargée, toutes les pièces dans la boîte.</li>
      <li><strong>Un pépin, on le dit.</strong> Un objet abîmé, ça arrive. Prévenez le prêteur tout de suite, on trouve toujours un arrangement.</li>
    </ul>
  </section>

  <section class="bloc">
    <h2>Questions fréquentes</h2>
    <div class="faq">
      <details>
        <summary>Qui peut emprunter ?</summary>
        <p>Les habitants du quartier des Tilleuls qui ont un compte. Il suffit d’une adresse dans le quartier.</p>
      </details>
      <details>
        <summary>Et si je casse l’objet ?</summary>
        <p>Prévenez le prêteur sans attendre. Selon les cas, on répare ensemble, on remplace la pièce ou on partage les frais. Le Prêt repose sur la confiance, pas sur une assurance.</p>
      </details>
      <details>
        <summary>Combien d’objets puis-je réserver ?</summary>
        <p>Autant que vous voulez, tant que les dates sont libres. Pensez juste aux autres : on ne réserve pas plus de deux mois à l’avance.</p>
      </details>
      <details>
        <summary>Je ne peux plus venir, comment annuler ?</summary>
        <p>Dans « Mes emprunts », une réservation qui n’a pas commencé peut être annulée d’un clic. Les dates redeviennent libres pour les autres.</p>
      </details>
    </div>
  </section>

  <section class="bloc encart">
    <h2>Aujourd’hui au Prêt</h2>
    <p>${pluriel(d.voisins.length, 'voisin', 'voisins')}, ${pluriel(d.objets.length, 'objet', 'objets')} à emprunter. <a href="/objets">Voir les objets</a></p>
  </section>`;
}

// ---------------------------------------------------------------- erreurs

export function introuvable() {
  return html`
  <div class="etroit">
    <h1>Cette page n’existe pas</h1>
    <p class="chapo">L’objet a peut-être été retiré, ou l’adresse est mal recopiée.</p>
    <p><a class="bouton" href="/objets">Revenir aux objets</a></p>
  </div>`;
}

export function erreurServeur() {
  return html`
  <div class="etroit">
    <h1>Un problème est survenu</h1>
    <p class="chapo">Le site a rencontré une erreur. Réessayez dans un instant.</p>
    <p><a class="bouton" href="/">Revenir à l’accueil</a></p>
  </div>`;
}

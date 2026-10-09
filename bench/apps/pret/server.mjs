// Le Prêt : serveur HTTP sans dépendance. `node server.mjs`, port PORT (4401 par défaut).

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aujourdhui } from './lib/dates.mjs';
import { ecrire, lire } from './lib/donnees.mjs';
import {
  DUREE_MAX_DEFAUT, identifiantEmprunt, identifiantObjet, statutEmprunt, validerEmprunt, validerProposition,
} from './lib/regles.mjs';
import * as vues from './lib/vues.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(ICI, 'public');
const PORT = Number(process.env.PORT) || 4401;
const TAILLE_MAX_FORMULAIRE = 16 * 1024;
const COOKIE = 'pret_session';

/** jeton de session → identifiant du voisin. En mémoire : un redémarrage déconnecte tout le monde. */
const sessions = new Map();

const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const SECURITE = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};

// ---------------------------------------------------------------- outils HTTP

function lireCookies(req) {
  const cookies = {};
  for (const morceau of (req.headers.cookie ?? '').split(';')) {
    const i = morceau.indexOf('=');
    if (i <= 0) continue;
    try { cookies[morceau.slice(0, i).trim()] = decodeURIComponent(morceau.slice(i + 1).trim()); } catch { /* cookie illisible : ignoré */ }
  }
  return cookies;
}

function lireFormulaire(req) {
  return new Promise((resoudre, rejeter) => {
    let taille = 0;
    const morceaux = [];
    req.on('data', (m) => {
      taille += m.length;
      if (taille > TAILLE_MAX_FORMULAIRE) {
        rejeter(Object.assign(new Error('Formulaire trop volumineux'), { statut: 413 }));
        req.destroy();
        return;
      }
      morceaux.push(m);
    });
    req.on('end', () => resoudre(new URLSearchParams(Buffer.concat(morceaux).toString('utf8'))));
    req.on('error', rejeter);
  });
}

function envoyerPage(req, res, statut, page, entetes = {}) {
  res.writeHead(statut, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITE, ...entetes });
  res.end(req.method === 'HEAD' ? undefined : page);
}

function rediriger(res, lieu, entetes = {}) {
  res.writeHead(303, { Location: lieu, 'Cache-Control': 'no-store', ...SECURITE, ...entetes });
  res.end();
}

/** N'accepte qu'un chemin interne (« /objets/… »), jamais une autre origine. */
function suiteSure(suite, parDefaut = '/mes-emprunts') {
  return typeof suite === 'string' && /^\/(?![/\\])/.test(suite) ? suite : parDefaut;
}

const page = (ctx, statut, options) => envoyerPage(ctx.req, ctx.res, statut, vues.miseEnPage({ moi: ctx.moi, ...options }));

const exigerConnexion = (ctx, retour) => {
  if (ctx.moi) return false;
  rediriger(ctx.res, `/connexion?suite=${encodeURIComponent(retour)}`);
  return true;
};

// ---------------------------------------------------------------- mots de passe

function motDePasseValide(voisin, motDePasse) {
  if (!voisin?.sel || !voisin?.empreinte) return false;
  const attendue = Buffer.from(voisin.empreinte, 'hex');
  const calculee = scryptSync(motDePasse, voisin.sel, attendue.length);
  return timingSafeEqual(attendue, calculee);
}

// ---------------------------------------------------------------- pages

const routes = [
  ['GET', /^\/$/, (ctx) => page(ctx, 200, {
    titre: '', contenu: vues.accueil(ctx), flash: vues.messageFlash(ctx.url.searchParams.get('ok')),
  })],

  ['GET', /^\/objets$/, (ctx) => {
    const p = ctx.url.searchParams;
    const categorie = p.get('categorie') ?? '';
    const filtres = {
      q: (p.get('q') ?? '').trim().slice(0, 80),
      categorie: ctx.d.categories.some((c) => c.id === categorie) ? categorie : '',
      dispo: p.get('dispo') === '1',
    };
    const nomCategorie = ctx.d.categories.find((c) => c.id === filtres.categorie)?.nom;
    page(ctx, 200, { titre: nomCategorie ?? 'Les objets', actif: 'objets', contenu: vues.catalogue({ ...ctx, filtres }) });
  }],

  ['GET', /^\/objets\/([a-z0-9-]+)$/, (ctx, [id]) => {
    const objet = ctx.d.objets.find((o) => o.id === id);
    if (!objet) return introuvable(ctx);
    return page(ctx, 200, {
      titre: objet.nom, actif: 'objets', contenu: vues.ficheObjet({ ...ctx, objet }), flash: vues.messageFlash(ctx.url.searchParams.get('ok')),
    });
  }],

  ['POST', /^\/objets\/([a-z0-9-]+)\/emprunter$/, async (ctx, [id]) => {
    const objet = ctx.d.objets.find((o) => o.id === id);
    if (!objet) return introuvable(ctx);
    if (exigerConnexion(ctx, `/objets/${id}`)) return undefined;
    const form = await lireFormulaire(ctx.req);
    const valeurs = { debut: form.get('debut') ?? '', fin: form.get('fin') ?? '' };
    const d = lire(); // relu juste avant d'écrire
    const preteur = d.voisins.find((v) => v.id === objet.preteur);
    const erreurs = validerEmprunt({ objet, preteur, moi: ctx.moi, ...valeurs, emprunts: d.emprunts, jour: ctx.jour });
    if (Object.keys(erreurs).length) {
      return page(ctx, 422, { titre: objet.nom, actif: 'objets', contenu: vues.ficheObjet({ ...ctx, d, objet, erreurs, valeurs }) });
    }
    d.emprunts.push({
      id: identifiantEmprunt(), objet: objet.id, voisin: ctx.moi.id, debut: valeurs.debut, fin: valeurs.fin, statut: 'actif', creeLe: ctx.jour,
    });
    ecrire(d);
    return rediriger(ctx.res, '/mes-emprunts?ok=reserve');
  }],

  ['GET', /^\/connexion$/, (ctx) => {
    if (ctx.moi) return rediriger(ctx.res, suiteSure(ctx.url.searchParams.get('suite')));
    return page(ctx, 200, {
      titre: 'Se connecter', actif: 'connexion', contenu: vues.connexion({ suite: suiteSure(ctx.url.searchParams.get('suite'), '') }),
    });
  }],

  ['POST', /^\/connexion$/, async (ctx) => {
    const form = await lireFormulaire(ctx.req);
    const email = (form.get('email') ?? '').trim();
    const suite = suiteSure(form.get('suite'), '');
    const voisin = ctx.d.voisins.find((v) => v.email && v.email.toLowerCase() === email.toLowerCase());
    if (!voisin || !motDePasseValide(voisin, form.get('motdepasse') ?? '')) {
      return page(ctx, 401, {
        titre: 'Se connecter',
        actif: 'connexion',
        contenu: vues.connexion({ erreur: 'Adresse e-mail ou mot de passe incorrect.', email, suite }),
      });
    }
    const jeton = randomBytes(24).toString('hex');
    sessions.set(jeton, voisin.id);
    const destination = suite || '/mes-emprunts';
    return rediriger(ctx.res, `${destination}${destination.includes('?') ? '&' : '?'}ok=connecte`, {
      'Set-Cookie': `${COOKIE}=${jeton}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 3600}`,
    });
  }],

  ['POST', /^\/deconnexion$/, (ctx) => {
    sessions.delete(lireCookies(ctx.req)[COOKIE]);
    rediriger(ctx.res, '/?ok=deconnecte', { 'Set-Cookie': `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0` });
  }],

  ['GET', /^\/mes-emprunts$/, (ctx) => {
    if (exigerConnexion(ctx, '/mes-emprunts')) return;
    page(ctx, 200, {
      titre: 'Mes emprunts', actif: 'mes-emprunts', contenu: vues.mesEmprunts(ctx), flash: vues.messageFlash(ctx.url.searchParams.get('ok')),
    });
  }],

  ['POST', /^\/emprunts\/([a-z0-9-]+)\/rendre$/, async (ctx, [id]) => {
    if (exigerConnexion(ctx, '/mes-emprunts')) return undefined;
    await lireFormulaire(ctx.req);
    const d = lire();
    const emprunt = d.emprunts.find((e) => e.id === id && e.voisin === ctx.moi.id);
    if (!emprunt) return introuvable(ctx);
    if (emprunt.statut !== 'actif') return rediriger(ctx.res, '/mes-emprunts');
    if (statutEmprunt(emprunt, ctx.jour) === 'a-venir') {
      Object.assign(emprunt, { statut: 'annule', annuleLe: ctx.jour });
      ecrire(d);
      return rediriger(ctx.res, '/mes-emprunts?ok=annule');
    }
    Object.assign(emprunt, { statut: 'rendu', renduLe: ctx.jour });
    ecrire(d);
    return rediriger(ctx.res, '/mes-emprunts?ok=rendu');
  }],

  ['GET', /^\/proposer$/, (ctx) => page(ctx, 200, {
    titre: 'Prêter un objet', actif: 'proposer', contenu: vues.proposer(ctx), flash: vues.messageFlash(ctx.url.searchParams.get('ok')),
  })],

  ['POST', /^\/proposer$/, async (ctx) => {
    if (exigerConnexion(ctx, '/proposer')) return undefined;
    const form = await lireFormulaire(ctx.req);
    const valeurs = {
      nom: form.get('nom') ?? '', categorie: form.get('categorie') ?? '', description: form.get('description') ?? '', etat: form.get('etat') ?? '',
    };
    const d = lire();
    const erreurs = validerProposition(valeurs, d.categories);
    if (Object.keys(erreurs).length) {
      return page(ctx, 422, { titre: 'Prêter un objet', actif: 'proposer', contenu: vues.proposer({ ...ctx, d, erreurs, valeurs }) });
    }
    const nom = valeurs.nom.trim().replace(/\s+/g, ' ');
    const objet = {
      id: identifiantObjet(nom, d.objets),
      nom: nom.charAt(0).toUpperCase() + nom.slice(1),
      categorie: valeurs.categorie,
      description: valeurs.description.trim(),
      etat: valeurs.etat,
      preteur: ctx.moi.id,
      dureeMax: DUREE_MAX_DEFAUT,
      consignes: '',
      ajouteLe: ctx.jour,
      propose: true,
    };
    d.objets.push(objet);
    ecrire(d);
    return rediriger(ctx.res, `/objets/${objet.id}?ok=propose`);
  }],

  ['GET', /^\/a-propos$/, (ctx) => page(ctx, 200, {
    titre: 'Comment ça marche', actif: 'a-propos', contenu: vues.aPropos(ctx),
  })],
];

function introuvable(ctx) {
  page(ctx, 404, { titre: 'Page introuvable', contenu: vues.introuvable() });
}

// ---------------------------------------------------------------- fichiers statiques

async function servirStatique(req, res, chemin) {
  const fichier = normalize(join(PUBLIC, chemin));
  if (!fichier.startsWith(PUBLIC + sep)) return false;
  const type = TYPES[extname(fichier)];
  if (!type) return false;
  try {
    const contenu = await readFile(fichier);
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache', ...SECURITE });
    res.end(req.method === 'HEAD' ? undefined : contenu);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- serveur

const serveur = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const chemin = url.pathname;
  const methode = req.method === 'HEAD' ? 'GET' : req.method;
  let ctx = null;
  try {
    if (chemin.length > 1 && chemin.endsWith('/')) return rediriger(res, chemin.replace(/\/+$/, '') + url.search);
    if (methode === 'GET' && extname(chemin) && await servirStatique(req, res, chemin)) return undefined;

    const d = lire();
    const idVoisin = sessions.get(lireCookies(req)[COOKIE]);
    const moi = d.voisins.find((v) => v.id === idVoisin) ?? null;
    ctx = { req, res, url, d, moi, jour: aujourdhui() };

    for (const [m, motif, traiter] of routes) {
      const correspondance = motif.exec(chemin);
      if (correspondance && m === methode) return await traiter(ctx, correspondance.slice(1));
    }
    if (routes.some(([, motif]) => motif.test(chemin))) {
      res.writeHead(405, { Allow: routes.filter(([, motif]) => motif.test(chemin)).map(([m]) => m).join(', ') });
      return res.end();
    }
    return introuvable(ctx);
  } catch (erreur) {
    if (erreur.statut === 413) {
      res.writeHead(413);
      return res.end();
    }
    console.error(erreur);
    if (res.headersSent) return res.end();
    return envoyerPage(req, res, 500, vues.miseEnPage({ moi: ctx?.moi, titre: 'Erreur', contenu: vues.erreurServeur() }));
  }
});

serveur.listen(PORT, () => {
  console.log(`Le Prêt écoute sur http://localhost:${PORT}`);
});

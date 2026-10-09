// Vérification rapide : `node verifier.mjs`.
// Démarre le serveur sur un port libre avec un fichier de données jetable,
// vérifie que chaque page répond, que la connexion marche, puis rejoue un
// emprunt, un retour et une proposition. Ne touche pas à data/donnees.json.

import { spawn } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ajouterJours, aujourdhui } from './lib/dates.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
const PORT = 4499;
const BASE = `http://localhost:${PORT}`;
const DONNEES = 'data/.verification.json';
const compte = JSON.parse(readFileSync(join(ICI, 'fixtures', 'compte.json'), 'utf8'));

let echecs = 0;
const verifier = (ok, libelle) => {
  console.log(`${ok ? 'ok  ' : 'ÉCHEC'} ${libelle}`);
  if (!ok) echecs += 1;
};

const serveur = spawn(process.execPath, ['server.mjs'], {
  cwd: ICI, env: { ...process.env, PORT: String(PORT), PRET_DONNEES: DONNEES }, stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resoudre, rejeter) => {
  serveur.stdout.on('data', (m) => { if (String(m).includes('écoute')) resoudre(); });
  serveur.on('exit', (code) => rejeter(new Error(`Le serveur s'est arrêté (code ${code})`)));
});

const requete = (chemin, options = {}) => fetch(BASE + chemin, { redirect: 'manual', ...options });
const formulaire = (champs, cookie) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(cookie ? { Cookie: cookie } : {}) },
  body: new URLSearchParams(champs).toString(),
});

try {
  // Pages publiques
  for (const chemin of ['/', '/objets', '/objets?categorie=cuisine', '/objets?q=echelle', '/objets?dispo=1',
    '/objets/perceuse-visseuse', '/connexion', '/proposer', '/a-propos', '/style.css', '/app.js', '/favicon.svg']) {
    const r = await requete(chemin);
    verifier(r.status === 200, `GET ${chemin} → ${r.status}`);
  }
  verifier((await requete('/mes-emprunts')).status === 303, 'GET /mes-emprunts sans session → redirection vers la connexion');
  verifier((await requete('/objet-qui-nexiste-pas')).status === 404, 'page inconnue → 404');
  verifier((await (await requete('/objets?q=raclette')).text()).includes('Appareil à raclette'), 'la recherche trouve la raclette');

  // Connexion
  const page = await (await requete('/connexion')).text();
  verifier(page.includes('>Adresse e-mail<') && page.includes('>Mot de passe<') && page.includes('>Se connecter</button>'),
    'formulaire de connexion : libellés et bouton « Se connecter »');
  const mauvais = await requete('/connexion', formulaire({ email: compte['Adresse e-mail'], motdepasse: 'faux' }));
  verifier(mauvais.status === 401, 'mauvais mot de passe refusé');
  const bon = await requete('/connexion', formulaire({ email: compte['Adresse e-mail'], motdepasse: compte['Mot de passe'] }));
  const cookie = (bon.headers.get('set-cookie') ?? '').split(';')[0];
  verifier(bon.status === 303 && cookie.startsWith('pret_session='), 'connexion avec fixtures/compte.json');

  const mes = await requete('/mes-emprunts', { headers: { Cookie: cookie } });
  const htmlMes = await mes.text();
  verifier(mes.status === 200 && htmlMes.includes('Appareil à raclette'), 'GET /mes-emprunts connecté → 200, emprunt en cours visible');

  // Emprunt, retour, proposition
  const jour = aujourdhui();
  const debut = ajouterJours(jour, 20);
  const emprunt = await requete('/objets/yaourtiere/emprunter', formulaire({ debut, fin: ajouterJours(debut, 2) }, cookie));
  verifier(emprunt.status === 303, 'réserver la yaourtière');
  const doublon = await requete('/objets/yaourtiere/emprunter', formulaire({ debut, fin: debut }, cookie));
  verifier(doublon.status === 422, 'réserver deux fois les mêmes dates est refusé');
  const tropLong = await requete('/objets/taille-haie/emprunter', formulaire({ debut: ajouterJours(jour, 30), fin: ajouterJours(jour, 40) }, cookie));
  verifier(tropLong.status === 422, 'dépasser la durée maximale est refusé');

  const rendu = await requete('/emprunts/e-0004/rendre', formulaire({}, cookie));
  verifier(rendu.headers.get('location') === '/mes-emprunts?ok=rendu', 'rendre l’appareil à raclette');
  const annule = await requete('/emprunts/e-0006/rendre', formulaire({}, cookie));
  verifier(annule.headers.get('location') === '/mes-emprunts?ok=annule', 'annuler la réservation à venir du taille-haie');

  const vide = await requete('/proposer', formulaire({ nom: '', categorie: '', description: '', etat: '' }, cookie));
  verifier(vide.status === 422, 'proposition vide refusée');
  const proposition = await requete('/proposer', formulaire({
    nom: 'Ponceuse vibrante', categorie: 'bricolage', description: 'Ponceuse vibrante avec une boîte de papiers de grains différents.', etat: 'bon',
  }, cookie));
  const lieu = proposition.headers.get('location') ?? '';
  verifier(proposition.status === 303 && lieu.startsWith('/objets/ponceuse-vibrante'), 'proposer une ponceuse');
  verifier((await requete('/objets/ponceuse-vibrante')).status === 200, 'la ponceuse a sa page');

  const deco = await requete('/deconnexion', formulaire({}, cookie));
  verifier(deco.status === 303, 'déconnexion');
} finally {
  serveur.kill();
  rmSync(join(ICI, DONNEES), { force: true });
}

console.log(echecs ? `\n${echecs} vérification(s) en échec.` : '\nTout est vert.');
process.exitCode = echecs ? 1 : 0;

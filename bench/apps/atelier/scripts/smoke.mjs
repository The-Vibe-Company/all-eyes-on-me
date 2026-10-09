// Vérification rapide : démarre le serveur sur une copie des données, parcourt les pages,
// réserve, s’inscrit en liste d’attente, annule, commande une carte cadeau.
// `node scripts/smoke.mjs` (ne touche pas à data/db.json).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SMOKE_PORT) || 4499;
const DATA_FILE = 'data/smoke-db.json';
const base = `http://localhost:${PORT}`;
fs.copyFileSync(path.join(ROOT, 'data', 'seed.json'), path.join(ROOT, DATA_FILE));

const server = spawn(process.execPath, ['server.mjs'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), DATA_FILE },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Le serveur ne démarre pas')), 5000);
  server.stdout.on('data', (chunk) => {
    if (String(chunk).includes('http://localhost')) { clearTimeout(timer); resolve(); }
  });
  server.on('exit', (code) => reject(new Error(`Serveur arrêté (code ${code})`)));
});

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? `  →  ${detail}` : ''}`);
  if (!ok) failures += 1;
};
const request = async (p, init = {}) => {
  const r = await fetch(base + p, { redirect: 'manual', ...init });
  return { status: r.status, location: r.headers.get('location'), text: await r.text() };
};
const get = (p) => request(p);
const post = (p, fields) => request(p, { method: 'POST', body: new URLSearchParams(fields) });
const seatsText = (html) => (html.match(/(\d+)\s*places? restantes? sur/) || [])[1];

try {
  for (const p of ['/', '/cours', '/cours?type=tour&niveau=debutant&dispo=1', '/cours/c01', '/cours/c08',
    '/reservation/TT-K7P4', '/mes-reservations', '/carte-cadeau', '/carte-cadeau/merci/CC-4HQW-T7NP',
    '/atelier', '/static/style.css', '/static/app.js', '/static/favicon.svg']) {
    const r = await get(p);
    check(`GET ${p} → 200`, r.status === 200, `reçu ${r.status}`);
  }
  check('GET /nexiste-pas → 404', (await get('/nexiste-pas')).status === 404);
  check('GET /cours/c99 → 404', (await get('/cours/c99')).status === 404);

  const modelage = await get('/cours?type=modelage');
  check('filtre discipline', modelage.text.includes('Bols au colombin') && !modelage.text.includes('Initiation au tour'));
  const full = await get('/cours/c08');
  check('cours complet : liste d’attente proposée', full.text.includes('Ce cours est complet') && full.text.includes('/cours/c08/attente'));

  // Réservation
  const before = seatsText((await get('/cours/c01')).text);
  const invalid = await post('/cours/c01/reserver', { name: '', email: 'pas-un-email', seats: '2' });
  check('réservation invalide → 422 avec erreurs', invalid.status === 422 && invalid.text.includes('field-error'));
  const tooMany = await post('/cours/c09/reserver', { name: 'Test Smoke', email: 'smoke.test@example.test', seats: '3' });
  check('plus de places que disponibles → 422', tooMany.status === 422 && tooMany.text.includes('Il ne reste que'));
  const booked = await post('/cours/c01/reserver', { name: 'Test Smoke', email: 'smoke.test@example.test', seats: '2' });
  const code = booked.location?.split('/').pop();
  check('réservation → 303 vers la confirmation', booked.status === 303 && /^TT-[A-Z0-9]{4}$/.test(code || ''), `${booked.status} ${booked.location}`);
  const confirmation = await get(booked.location);
  check('confirmation affiche le code', confirmation.status === 200 && confirmation.text.includes(code));
  const after = seatsText((await get('/cours/c01')).text);
  check(`places restantes ${before} → ${after}`, Number(before) - Number(after) === 2);

  // Cours complet : réservation refusée, liste d’attente acceptée
  const fullBooking = await post('/cours/c08/reserver', { name: 'Test Smoke', email: 'smoke.test@example.test', seats: '1' });
  check('réserver un cours complet → 409', fullBooking.status === 409);
  const wait = await post('/cours/c08/attente', { name: 'Test Smoke', email: 'smoke.test@example.test', seats: '1' });
  check('liste d’attente → 303', wait.status === 303 && wait.location.includes('attente=2'), wait.location);
  check('liste d’attente : position affichée', (await get(wait.location.split('#')[0])).text.includes('position 2'));

  // Mes réservations
  const wrong = await post('/mes-reservations', { email: 'lea.test@example.test', code: 'TT-ZZZZ' });
  check('mauvais code → 404', wrong.status === 404 && wrong.text.includes('Aucune réservation'));
  const mine = await post('/mes-reservations', { email: 'Lea.Test@example.test ', code: 'k7p4' });
  check('Léa voit ses deux réservations', mine.status === 200 && mine.text.includes('TT-K7P4') && mine.text.includes('TT-M3RX'));
  const ask = await post('/mes-reservations/annuler', { email: 'lea.test@example.test', code: 'TT-K7P4', target: 'TT-M3RX' });
  check('annulation : demande de confirmation', ask.status === 200 && ask.text.includes('Oui, annuler'));
  const c10Before = seatsText((await get('/cours/c10')).text);
  const cancel = await post('/mes-reservations/annuler', { email: 'lea.test@example.test', code: 'TT-K7P4', target: 'TT-M3RX', confirm: 'oui' });
  check('annulation confirmée', cancel.status === 200 && cancel.text.includes('est annulée'));
  const c10After = seatsText((await get('/cours/c10')).text);
  check(`place libérée ${c10Before} → ${c10After}`, Number(c10After) - Number(c10Before) === 1);
  const other = await post('/mes-reservations/annuler', { email: 'lea.test@example.test', code: 'TT-K7P4', target: 'TT-A9DE', confirm: 'oui' });
  check('impossible d’annuler la réservation de quelqu’un d’autre', other.status === 404);

  // Carte cadeau
  const badGift = await post('/carte-cadeau', { amount: 'autre', customAmount: '5000', recipientName: '', buyerName: 'P', buyerEmail: 'x' });
  check('carte cadeau invalide → 422', badGift.status === 422);
  const gift = await post('/carte-cadeau', { amount: 'autre', customAmount: '70', recipientName: 'Camille', message: 'Joyeux anniversaire !', buyerName: 'Paul Test', buyerEmail: 'paul.test@example.test' });
  check('carte cadeau → 303', gift.status === 303 && /\/carte-cadeau\/merci\/CC-/.test(gift.location || ''), `${gift.status}`);
  const thanks = await get(gift.location);
  check('carte cadeau : confirmation en toutes lettres', thanks.status === 200 && thanks.text.includes('70') && thanks.text.includes('Camille'));

  // Données écrites
  const db = JSON.parse(fs.readFileSync(path.join(ROOT, DATA_FILE), 'utf8'));
  check('fichier de données mis à jour', db.bookings.some((b) => b.code === code)
    && db.bookings.find((b) => b.code === 'TT-M3RX').status === 'annulee'
    && db.waitlist.length === 2 && db.giftCards.length === 2);
} catch (err) {
  check('exécution du script', false, err.message);
} finally {
  server.kill();
  fs.rmSync(path.join(ROOT, DATA_FILE), { force: true });
}

console.log(failures ? `\n${failures} vérification(s) en échec` : '\nTout est vert.');
process.exit(failures ? 1 : 0);

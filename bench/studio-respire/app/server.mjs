// Studio Respire : sert public/ et une petite API JSON sous /api/...
// Node 22, modules intégrés uniquement.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const SEED_FILE = path.join(DATA_DIR, 'seed.json');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PORT = Number(process.env.PORT) || 4410;

const DAY_NAMES = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ------------------------------------------------------------------ données */

// Les lectures et écritures sont synchrones : dans un seul processus Node,
// un « lire, modifier, écrire » ne peut donc pas être entrelacé avec un autre.
function readDb() {
  if (!fs.existsSync(DB_FILE)) fs.copyFileSync(SEED_FILE, DB_FILE);
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDb(db) {
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(db, null, 2)}\n`);
  fs.renameSync(tmp, DB_FILE);
}

function endTime(start, duration) {
  const [h, m] = start.split(':').map(Number);
  const total = h * 60 + m + duration;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
}

function teacherSummary(t) {
  return { id: t.id, name: t.name, role: t.role, tone: t.tone };
}

function classSummary(db, c) {
  const booked = db.bookings.filter((b) => b.classId === c.id).length;
  const spotsLeft = Math.max(0, c.capacity - c.othersBooked - booked);
  const teacher = db.teachers.find((t) => t.id === c.teacherId);
  return {
    id: c.id,
    title: c.title,
    day: c.day,
    dayName: DAY_NAMES[c.day],
    start: c.start,
    end: endTime(c.start, c.duration),
    duration: c.duration,
    level: c.level,
    room: c.room,
    summary: c.summary,
    capacity: c.capacity,
    spotsLeft,
    full: spotsLeft === 0,
    teacher: teacher ? teacherSummary(teacher) : null,
  };
}

function classDetail(db, c) {
  const teacher = db.teachers.find((t) => t.id === c.teacherId);
  return {
    ...classSummary(db, c),
    description: c.description,
    program: c.program,
    bring: c.bring,
    teacher: teacher || null,
  };
}

function bookingView(db, b) {
  const c = db.classes.find((x) => x.id === b.classId);
  return {
    id: b.id,
    classId: b.classId,
    name: b.name,
    email: b.email,
    createdAt: b.createdAt,
    class: c ? classSummary(db, c) : null,
  };
}

const byWeek = (a, b) => a.day - b.day || a.start.localeCompare(b.start);

/* ---------------------------------------------------------------- erreurs */

class HttpError extends Error {
  constructor(status, message, field) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

/* ------------------------------------------------------------ routes API */

function getStudio() {
  return [200, readDb().studio];
}

function listTeachers() {
  return [200, readDb().teachers];
}

function listClasses() {
  const db = readDb();
  return [200, db.classes.map((c) => classSummary(db, c)).sort(byWeek)];
}

function getClass({ params }) {
  const db = readDb();
  const c = db.classes.find((x) => x.id === params[0]);
  if (!c) throw new HttpError(404, 'Ce cours n’existe pas ou n’est plus au planning.');
  return [200, classDetail(db, c)];
}

function listBookings({ url }) {
  const email = (url.searchParams.get('email') || '').trim().toLowerCase();
  if (!email) throw new HttpError(422, 'Indiquez l’adresse e-mail utilisée pour réserver.', 'email');
  if (!EMAIL_RE.test(email)) throw new HttpError(422, 'Cette adresse e-mail ne semble pas valide.', 'email');
  const db = readDb();
  const mine = db.bookings
    .filter((b) => b.email === email)
    .map((b) => bookingView(db, b))
    .sort((a, b) => (a.class && b.class ? byWeek(a.class, b.class) : 0));
  return [200, mine];
}

async function createBooking({ readJson }) {
  const body = await readJson();
  const classId = String(body.classId ?? '');
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
  const email = String(body.email ?? '').trim().toLowerCase();

  if (name.length < 2) throw new HttpError(422, 'Indiquez votre nom (deux caractères au moins).', 'name');
  if (name.length > 80) throw new HttpError(422, 'Ce nom est trop long (80 caractères au plus).', 'name');
  if (!email) throw new HttpError(422, 'Indiquez votre adresse e-mail.', 'email');
  if (email.length > 120 || !EMAIL_RE.test(email)) {
    throw new HttpError(422, 'Cette adresse e-mail ne semble pas valide.', 'email');
  }

  const db = readDb();
  const c = db.classes.find((x) => x.id === classId);
  if (!c) throw new HttpError(404, 'Ce cours n’existe pas ou n’est plus au planning.');
  if (db.bookings.some((b) => b.classId === c.id && b.email === email)) {
    throw new HttpError(409, 'Vous avez déjà une place pour ce cours.');
  }
  if (classSummary(db, c).full) throw new HttpError(409, 'Ce cours est complet. Essayez un autre créneau.');

  const booking = {
    id: `b-${randomBytes(4).toString('hex')}`,
    classId: c.id,
    name,
    email,
    createdAt: new Date().toISOString(),
  };
  db.bookings.push(booking);
  writeDb(db);
  return [201, bookingView(db, booking)];
}

function cancelBooking({ params, url }) {
  const email = (url.searchParams.get('email') || '').trim().toLowerCase();
  if (!email) throw new HttpError(422, 'Indiquez l’adresse e-mail utilisée pour réserver.', 'email');
  const db = readDb();
  const index = db.bookings.findIndex((b) => b.id === params[0] && b.email === email);
  if (index === -1) throw new HttpError(404, 'Réservation introuvable pour cette adresse e-mail.');
  const [removed] = db.bookings.splice(index, 1);
  writeDb(db);
  const c = db.classes.find((x) => x.id === removed.classId);
  return [200, { ok: true, id: removed.id, class: c ? classSummary(db, c) : null }];
}

const ROUTES = [
  ['GET', /^\/api\/studio$/, getStudio],
  ['GET', /^\/api\/teachers$/, listTeachers],
  ['GET', /^\/api\/classes$/, listClasses],
  ['GET', /^\/api\/classes\/([^/]+)$/, getClass],
  ['GET', /^\/api\/bookings$/, listBookings],
  ['POST', /^\/api\/bookings$/, createBooking],
  ['DELETE', /^\/api\/bookings\/([^/]+)$/, cancelBooking],
];

function readBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= limit) chunks.push(chunk);
    });
    req.on('end', () => (size > limit ? reject(new HttpError(413, 'Requête trop volumineuse.')) : resolve(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', reject);
  });
}

async function handleApi(req, res, url) {
  const matching = ROUTES.filter(([, re]) => re.test(url.pathname));
  if (matching.length === 0) throw new HttpError(404, 'Route inconnue.');
  const route = matching.find(([method]) => method === req.method);
  if (!route) {
    res.setHeader('Allow', matching.map(([m]) => m).join(', '));
    throw new HttpError(405, 'Méthode non autorisée.');
  }
  const [, re, handler] = route;
  let params;
  try {
    params = url.pathname.match(re).slice(1).map(decodeURIComponent);
  } catch {
    throw new HttpError(400, 'Adresse mal formée.');
  }
  const readJson = async () => {
    const raw = await readBody(req);
    try {
      const parsed = JSON.parse(raw || '{}');
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('forme');
      return parsed;
    } catch {
      throw new HttpError(400, 'Le corps de la requête doit être un objet JSON.');
    }
  };
  const [status, data] = await handler({ req, url, params, readJson });
  sendJson(res, status, data);
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

/* -------------------------------------------------------------- statique */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function resolveStatic(pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (rel.includes('\0')) return null;
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return null;
  if (isFile(file)) return file;
  if (!path.extname(file) && isFile(`${file}.html`)) return `${file}.html`;
  return null;
}

function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    throw new HttpError(405, 'Méthode non autorisée.');
  }
  const file = resolveStatic(url.pathname);
  if (!file) {
    const page = resolveStatic('/404.html');
    const body = page ? fs.readFileSync(page) : Buffer.from('Page introuvable.');
    res.writeHead(404, {
      'Content-Type': page ? MIME['.html'] : MIME['.txt'],
      'Content-Length': body.length,
    });
    res.end(req.method === 'HEAD' ? undefined : body);
    return;
  }
  const ext = path.extname(file).toLowerCase();
  const body = fs.readFileSync(file);
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
  };
  if (ext === '.html') {
    headers['Content-Security-Policy'] =
      "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
  }
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

/* ---------------------------------------------------------------- serveur */

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else {
      serveStatic(req, res, url);
    }
  } catch (err) {
    const known = err instanceof HttpError;
    if (!known) console.error(err);
    if (res.headersSent) {
      res.end();
      return;
    }
    const wantsApi = (req.url || '').startsWith('/api');
    if (wantsApi || known) {
      sendJson(res, known ? err.status : 500, {
        error: known ? err.message : 'Une erreur est survenue de notre côté. Réessayez dans un instant.',
        ...(known && err.field ? { field: err.field } : {}),
      });
    } else {
      res.writeHead(500, { 'Content-Type': MIME['.txt'] });
      res.end('Erreur interne.');
    }
  }
});

readDb(); // crée data/db.json depuis le seed s’il n’existe pas encore

server.listen(PORT, () => {
  console.log(`Studio Respire : http://localhost:${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

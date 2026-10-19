import { createServer } from 'node:http';
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const publicDir = join(root, 'public');
const dataDir = join(root, 'data');
const seedFile = join(dataDir, 'seed.json');
const dbFile = join(dataDir, 'db.json');
const port = Number(process.env.PORT) || 4420;

// --- Données -----------------------------------------------------------------

mkdirSync(dataDir, { recursive: true });

// db.json est relu à chaque requête d'API : `node reset.mjs` agit sans redémarrer.
let db;
function load() {
  if (!existsSync(dbFile)) copyFileSync(seedFile, dbFile);
  db = JSON.parse(readFileSync(dbFile, 'utf8'));
}
load();

function save() {
  const tmp = dbFile + '.tmp';
  writeFileSync(tmp, JSON.stringify(db, null, 2) + '\n');
  renameSync(tmp, dbFile);
}

// --- Calculs -----------------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0');

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysBetween(from, to) {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
}

function addDays(date, days) {
  const d = new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

const round2 = (n) => Math.round(n * 100) / 100;
const totalOf = (lines) => round2(lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0));

// Une facture envoyée dont l'échéance est passée est en retard.
function present(invoice) {
  const now = today();
  let status = invoice.status;
  if (status === 'sent' && invoice.dueDate < now) status = 'late';
  const client = db.clients.find((c) => c.id === invoice.clientId);
  return {
    ...invoice,
    status,
    clientName: client ? client.name : 'Client inconnu',
    total: totalOf(invoice.lines),
    daysLate: status === 'late' ? Math.max(0, daysBetween(invoice.dueDate, now)) : 0,
  };
}

const byIssueDesc = (a, b) => (a.issueDate < b.issueDate ? 1 : a.issueDate > b.issueDate ? -1 : a.id < b.id ? 1 : -1);
const sum = (list) => round2(list.reduce((s, i) => s + i.total, 0));

function dashboard() {
  const now = today();
  const month = now.slice(0, 7);
  const all = db.invoices.map(present);
  const issued = all.filter((i) => i.status !== 'draft');

  const billed = issued.filter((i) => i.issueDate.startsWith(month));
  const waiting = all.filter((i) => i.status === 'sent');
  const late = all.filter((i) => i.status === 'late');
  const paidThisMonth = all.filter((i) => i.status === 'paid' && i.paidAt && i.paidAt.startsWith(month));

  const months = [];
  const [y, m] = [Number(month.slice(0, 4)), Number(month.slice(5, 7))];
  for (let k = 5; k >= 0; k--) {
    const d = new Date(Date.UTC(y, m - 1 - k, 1));
    const key = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
    months.push({ month: key, billed: sum(issued.filter((i) => i.issueDate.startsWith(key))) });
  }

  const toCollect = [...late, ...waiting].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));

  return {
    today: now,
    month,
    billed: { total: sum(billed), count: billed.length },
    waiting: { total: sum(waiting), count: waiting.length },
    late: { total: sum(late), count: late.length, oldestDays: late.reduce((d, i) => Math.max(d, i.daysLate), 0) },
    paid: { total: sum(paidThisMonth), count: paidThisMonth.length },
    months,
    toCollect: toCollect.slice(0, 8),
    drafts: all.filter((i) => i.status === 'draft').length,
  };
}

function clientsWithStats() {
  const all = db.invoices.map(present);
  return db.clients.map((client) => {
    const mine = all.filter((i) => i.clientId === client.id);
    const issued = mine.filter((i) => i.status !== 'draft');
    return {
      ...client,
      invoiceCount: mine.length,
      billed: sum(issued),
      paid: sum(mine.filter((i) => i.status === 'paid')),
      outstanding: sum(mine.filter((i) => i.status === 'sent' || i.status === 'late')),
      lateCount: mine.filter((i) => i.status === 'late').length,
      lastInvoiceDate: mine.length ? mine.map((i) => i.issueDate).sort().at(-1) : null,
    };
  });
}

// --- Validation --------------------------------------------------------------

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));

function parseNewInvoice(body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Requête invalide.');
  const client = db.clients.find((c) => c.id === body.clientId);
  if (!client) throw new HttpError(400, 'Choisissez un client.');

  const issueDate = body.issueDate || today();
  if (!isDate(issueDate)) throw new HttpError(400, "La date d'émission n'est pas valide.");
  const dueDate = body.dueDate || addDays(issueDate, 30);
  if (!isDate(dueDate)) throw new HttpError(400, "La date d'échéance n'est pas valide.");
  if (dueDate < issueDate) throw new HttpError(400, "L'échéance ne peut pas précéder la date d'émission.");

  const status = body.status === 'sent' ? 'sent' : 'draft';

  if (!Array.isArray(body.lines) || body.lines.length === 0) throw new HttpError(400, 'Ajoutez au moins une ligne.');
  if (body.lines.length > 50) throw new HttpError(400, 'Une facture est limitée à 50 lignes.');
  const lines = body.lines.map((l, index) => {
    const n = index + 1;
    const label = typeof l?.label === 'string' ? l.label.trim() : '';
    const quantity = Number(l?.quantity);
    const unitPrice = Number(l?.unitPrice);
    if (!label) throw new HttpError(400, `La ligne ${n} n'a pas de libellé.`);
    if (label.length > 200) throw new HttpError(400, `Le libellé de la ligne ${n} est trop long.`);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new HttpError(400, `La quantité de la ligne ${n} doit être supérieure à zéro.`);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new HttpError(400, `Le prix unitaire de la ligne ${n} n'est pas valide.`);
    return { label, quantity: round2(quantity), unitPrice: round2(unitPrice) };
  });

  return { clientId: client.id, issueDate, dueDate, status, lines };
}

function nextId(issueDate) {
  const year = issueDate.slice(0, 4);
  const prefix = `F-${year}-`;
  const max = db.invoices
    .filter((i) => i.id.startsWith(prefix))
    .reduce((n, i) => Math.max(n, Number(i.id.slice(prefix.length)) || 0), 0);
  return prefix + String(max + 1).padStart(3, '0');
}

// --- API ---------------------------------------------------------------------

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 200_000) throw new HttpError(413, 'Requête trop volumineuse.');
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'JSON invalide.');
  }
}

function findInvoice(id) {
  const invoice = db.invoices.find((i) => i.id === id);
  if (!invoice) throw new HttpError(404, 'Facture introuvable.');
  return invoice;
}

async function api(req, url) {
  load();
  const parts = url.pathname.split('/').filter(Boolean).slice(1).map(decodeURIComponent); // sans « api »
  const method = req.method;

  if (parts[0] === 'dashboard' && parts.length === 1) {
    if (method !== 'GET') throw new HttpError(405, 'Méthode non autorisée.');
    return [200, dashboard()];
  }

  if (parts[0] === 'clients') {
    if (method !== 'GET') throw new HttpError(405, 'Méthode non autorisée.');
    const clients = clientsWithStats();
    if (parts.length === 1) return [200, clients];
    const client = clients.find((c) => c.id === parts[1]);
    if (!client || parts.length > 2) throw new HttpError(404, 'Client introuvable.');
    return [200, client];
  }

  if (parts[0] === 'invoices') {
    if (parts.length === 1) {
      if (method === 'GET') {
        const status = url.searchParams.get('status');
        const clientId = url.searchParams.get('client');
        let list = db.invoices.map(present);
        if (status) list = list.filter((i) => i.status === status);
        if (clientId) list = list.filter((i) => i.clientId === clientId);
        return [200, list.sort(byIssueDesc)];
      }
      if (method === 'POST') {
        const data = parseNewInvoice(await readBody(req));
        const invoice = { id: nextId(data.issueDate), ...data, paidAt: null };
        db.invoices.push(invoice);
        save();
        return [201, present(invoice)];
      }
      throw new HttpError(405, 'Méthode non autorisée.');
    }

    const invoice = findInvoice(parts[1]);

    if (parts.length === 2) {
      if (method !== 'GET') throw new HttpError(405, 'Méthode non autorisée.');
      return [200, { ...present(invoice), freelancer: db.freelancer, client: db.clients.find((c) => c.id === invoice.clientId) }];
    }

    if (parts.length === 3 && parts[2] === 'pay') {
      if (method !== 'POST') throw new HttpError(405, 'Méthode non autorisée.');
      if (invoice.status === 'draft') throw new HttpError(409, "Cette facture n'a pas encore été envoyée.");
      if (invoice.status !== 'paid') {
        invoice.status = 'paid';
        invoice.paidAt = today();
        save();
      }
      return [200, present(invoice)];
    }

    if (parts.length === 3 && parts[2] === 'send') {
      if (method !== 'POST') throw new HttpError(405, 'Méthode non autorisée.');
      if (invoice.status !== 'draft') throw new HttpError(409, 'Cette facture a déjà été envoyée.');
      invoice.status = 'sent';
      save();
      return [200, present(invoice)];
    }
  }

  throw new HttpError(404, 'Route inconnue.');
}

// --- Pages et fichiers statiques ---------------------------------------------

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function pageFor(pathname) {
  if (pathname === '/') return 'index.html';
  if (pathname === '/clients') return 'clients.html';
  if (pathname === '/factures') return 'factures.html';
  if (pathname === '/factures/nouvelle') return 'nouvelle.html';
  if (/^\/factures\/[^/]+$/.test(pathname)) return 'facture.html';
  return null;
}

function serveFile(res, file) {
  const path = normalize(join(publicDir, file));
  if (path !== publicDir && !path.startsWith(publicDir + sep)) return false;
  let stat;
  try {
    stat = statSync(path);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  res.writeHead(200, {
    'Content-Type': types[extname(path)] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache',
  });
  res.end(readFileSync(path));
  return true;
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

const server = createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    return sendJson(res, 400, { error: 'URL invalide.' });
  }

  try {
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const [status, body] = await api(req, url);
      return sendJson(res, status, body);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Méthode non autorisée.');

    const page = pageFor(url.pathname);
    if (page && serveFile(res, page)) return;

    let rel;
    try {
      rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    } catch {
      throw new HttpError(400, 'URL invalide.');
    }
    if (rel && serveFile(res, rel)) return;

    if (url.pathname.startsWith('/api')) throw new HttpError(404, 'Route inconnue.');
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Page introuvable.');
  } catch (err) {
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
    console.error(err);
    sendJson(res, 500, { error: 'Erreur du serveur.' });
  }
});

server.listen(port, () => {
  console.log(`Factures sur http://localhost:${port}`);
});

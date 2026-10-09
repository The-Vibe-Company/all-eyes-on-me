// Terre & Tour : site de réservation de l’atelier.
// Node 22, aucune dépendance. `node server.mjs` puis http://localhost:4402
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4402;
const SEED_FILE = path.join(ROOT, 'data', 'seed.json');
const DB_FILE = path.resolve(ROOT, process.env.DATA_FILE || 'data/db.json');
const PUBLIC_DIR = path.join(ROOT, 'public');

const STUDIO = {
  address: '8 rue des Potiers',
  city: '69004 Lyon',
  where: 'Au fond de la cour, porte vitrée',
  access: 'Métro C, arrêt Croix-Paquet, puis cinq minutes à pied',
  hours: 'Du mardi au samedi, de 14 h à 19 h',
  email: 'bonjour@terre-et-tour.example',
  phone: '04 00 00 00 00',
};

const TYPES = {
  tour: {
    label: 'Tournage',
    link: 'Voir les cours de tournage',
    blurb: 'Le tour demande surtout de la patience : les premières séances servent à centrer la terre, et c’est normal. On repart avec des bols un peu épais et l’envie de recommencer.',
  },
  modelage: {
    label: 'Modelage',
    link: 'Voir les cours de modelage',
    blurb: 'Colombins, plaques, pots pincés : on façonne à la main, sans machine, à son rythme. Le meilleur point de départ si vous n’avez jamais touché d’argile.',
  },
  emaillage: {
    label: 'Émaillage',
    link: 'Voir les cours d’émaillage',
    blurb: 'L’émail donne sa couleur à la pièce et la rend étanche. On apprend à le poser, à le superposer, et à deviner ce que le four va en faire.',
  },
};

const LEVELS = {
  debutant: 'Débutant',
  intermediaire: 'Intermédiaire',
  confirme: 'Confirmé',
  tous: 'Tous niveaux',
};

const INCLUDED = {
  tour: [
    'La terre, le prêt d’un tour, des outils et d’un tablier',
    'La première cuisson de vos pièces',
    'Pour les émailler ensuite, un cours d’émaillage au choix',
  ],
  modelage: [
    'La terre, les outils et un tablier',
    'Deux cuissons : la première, puis une seconde avec un émail transparent ou blanc',
  ],
  emaillage: [
    'Les douze émaux de l’atelier',
    'Des pièces déjà cuites si vous n’en apportez pas',
    'La cuisson d’émail',
  ],
};

const GIFT_PRESETS = [
  { value: 45, label: 'Un cours de modelage ou d’émaillage' },
  { value: 55, label: 'Une initiation au tour' },
  { value: 110, label: 'Deux soirées au tour' },
];
const GIFT_MIN = 20;
const GIFT_MAX = 300;
const MAX_SEATS = 4;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// ---------------------------------------------------------------- données

function loadDb() {
  if (!fs.existsSync(DB_FILE)) fs.copyFileSync(SEED_FILE, DB_FILE);
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDb(db) {
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(db, null, 2)}\n`);
  fs.renameSync(tmp, DB_FILE);
}

const randomCode = (length) =>
  Array.from({ length }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

function newBookingCode(db) {
  let code;
  do code = `TT-${randomCode(4)}`;
  while (db.bookings.some((b) => b.code === code));
  return code;
}

function newGiftRef(db) {
  let ref;
  do ref = `CC-${randomCode(4)}-${randomCode(4)}`;
  while (db.giftCards.some((g) => g.ref === ref));
  return ref;
}

const classById = (db, id) => db.classes.find((c) => c.id === id);
const teacherOf = (db, cls) => db.teachers.find((t) => t.id === cls.teacherId);
const sortClasses = (list) =>
  [...list].sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));

function seatsLeft(db, cls) {
  const taken = db.bookings
    .filter((b) => b.classId === cls.id && b.status === 'confirmee')
    .reduce((sum, b) => sum + b.seats, 0);
  return Math.max(0, cls.capacity - taken);
}

function normalizeCode(value) {
  let s = String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.startsWith('TT') && s.length === 6) s = s.slice(2);
  return s.length === 4 ? `TT-${s}` : '';
}

const clean = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanEmail = (value) => clean(value, 120).toLowerCase();
const hasErrors = (errors) => Object.keys(errors).length > 0;

// ---------------------------------------------------------------- format

const NBSP = ' ';
const euro = (n) => `${n}${NBSP}€`;
const plural = (n, one, many) => `${n}${NBSP}${n > 1 ? many : one}`;
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const asDate = (iso) => new Date(`${iso}T12:00:00Z`);
const longDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const shortDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', timeZone: 'UTC' });
const dayLabel = (iso) => capitalize(longDay.format(asDate(iso)));
const shortDayLabel = (iso) => capitalize(shortDay.format(asDate(iso)));

function timeLabel(hhmm) {
  const [h, m] = hhmm.split(':');
  return m === '00' ? `${Number(h)}${NBSP}h` : `${Number(h)}${NBSP}h${NBSP}${m}`;
}
const toMinutes = (hhmm) => hhmm.split(':').map(Number).reduce((h, m) => h * 60 + m);
function durationLabel(cls) {
  const d = toMinutes(cls.end) - toMinutes(cls.start);
  const h = Math.floor(d / 60);
  const m = d % 60;
  return m ? `${h}${NBSP}h${NBSP}${String(m).padStart(2, '0')}` : `${h}${NBSP}h`;
}
const timeRange = (cls) => `${timeLabel(cls.start)}${NBSP}– ${timeLabel(cls.end)}`;

function weekLabel(db) {
  const dates = db.classes.map((c) => c.date).sort();
  if (!dates.length) return '';
  return `Du ${longDay.format(asDate(dates[0]))} au ${longDay.format(asDate(dates.at(-1)))}`;
}

// Espaces insécables de la typographie française, appliquées au texte (pas aux balises).
function frenchSpacing(page) {
  return page.replace(/>([^<]+)</g, (_, text) =>
    `>${text
      .replace(/ ([;!?])/g, ' $1')
      .replace(/ :/g, ' :')
      .replace(/« /g, '« ')
      .replace(/ »/g, ' »')}<`,
  );
}

// ---------------------------------------------------------------- gabarits

class Raw {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}
const raw = (value) => new Raw(String(value));
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

function renderValue(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.value;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  return escapeHtml(v);
}

function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += renderValue(v) + strings[i + 1]; });
  return new Raw(out);
}

const LOGO = raw(`<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M12 4.5h8M13 4.5c0 3.5-6 6-6 13 0 5.2 4 9 9 9s9-3.8 9-9c0-7-6-9.5-6-13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.5 28.5h25" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M10 17.5c3.5 1.6 8.5 1.6 12 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".55"/></svg>`);

const POTS = raw(`<svg viewBox="0 0 320 240" role="img" aria-label="Trois pièces de céramique posées sur une étagère : un vase, un bol et une tasse">
<path d="M52 208c-9-30-11-62 3-86 8-14 9-26 3-40h34c-6 14-5 26 3 40 14 24 12 56 3 86z" fill="#a64b2a"/>
<path d="M49 160c14 7 40 7 54 0" fill="none" stroke="#f6f0e7" stroke-width="3" opacity=".6"/>
<path d="M58 82h34" stroke="#87391d" stroke-width="5" stroke-linecap="round"/>
<path d="M120 152h104c-2 30-18 56-36 56h-32c-18 0-34-26-36-56z" fill="#2e6670"/>
<path d="M120 152h104" stroke="#1f4a51" stroke-width="5" stroke-linecap="round"/>
<path d="M131 172c10 4 72 4 82 0" fill="none" stroke="#d9e8e6" stroke-width="2.5" opacity=".7"/>
<path d="M244 136h44l-4 68c0 3-2 4-5 4h-26c-3 0-5-1-5-4z" fill="#b8862b"/>
<path d="M287 150c18 0 18 34-2 34" fill="none" stroke="#b8862b" stroke-width="8" stroke-linecap="round"/>
<path d="M244 136h44" stroke="#7a5512" stroke-width="5" stroke-linecap="round"/>
<rect x="18" y="208" width="290" height="9" rx="3" fill="#6b4a36"/>
<path d="M30 217v14M296 217v14" stroke="#6b4a36" stroke-width="6" stroke-linecap="round"/>
</svg>`);

const NAV = [
  { href: '/cours', label: 'Les cours', key: 'cours' },
  { href: '/carte-cadeau', label: 'Carte cadeau', key: 'cadeau' },
  { href: '/atelier', label: 'L’atelier', key: 'atelier' },
  { href: '/mes-reservations', label: 'Mes réservations', key: 'resa' },
];

const DEFAULT_DESCRIPTION = 'Terre & Tour, atelier de céramique à Lyon : cours de tournage, de modelage et d’émaillage en petits groupes. Réservez en ligne.';

function layout({ title, nav = '', body, description = DEFAULT_DESCRIPTION }) {
  const page = html`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title ? `${title} · Terre & Tour` : 'Terre & Tour · Atelier de céramique à Lyon'}</title>
<meta name="description" content="${description}">
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/static/style.css">
<script src="/static/app.js" defer></script>
</head>
<body>
<a class="skip" href="#contenu">Aller au contenu</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="/">${LOGO}<span>Terre <em>&amp;</em> Tour</span></a>
    <nav class="site-nav" aria-label="Navigation principale">
      <ul>${NAV.map((item) => html`<li><a href="${item.href}"${item.key === nav ? raw(' aria-current="page"') : ''}>${item.label}</a></li>`)}</ul>
    </nav>
  </div>
</header>
<main id="contenu">
${body}
</main>
<footer class="site-footer">
  <div class="wrap footer-inner">
    <div>
      <p class="footer-brand">Terre &amp; Tour</p>
      <p>Atelier de céramique<br>${STUDIO.address}, ${STUDIO.city}<br>${STUDIO.hours}</p>
    </div>
    <div>
      <p class="footer-title">Nous écrire</p>
      <p><a href="mailto:${STUDIO.email}">${STUDIO.email}</a><br>${STUDIO.phone}</p>
    </div>
    <nav aria-label="Pied de page">
      <ul>${NAV.map((item) => html`<li><a href="${item.href}">${item.label}</a></li>`)}</ul>
    </nav>
  </div>
</footer>
</body>
</html>`;
  return frenchSpacing(String(page));
}

function fieldParts({ name, id, hint, error }) {
  const ids = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ');
  return {
    aria: raw(`${error ? ' aria-invalid="true"' : ''}${ids ? ` aria-describedby="${ids}"` : ''}`),
    hint: hint ? html`<p class="hint" id="${id}-hint">${hint}</p>` : '',
    error: error ? html`<p class="field-error" id="${id}-err">${error}</p>` : '',
    cls: `field${error ? ' has-error' : ''}`,
    name,
  };
}

function inputField({ name, label, value = '', type = 'text', hint, error, required = true, attrs = '', id = `f-${name}` }) {
  const p = fieldParts({ name, id, hint, error });
  return html`<div class="${p.cls}">
  <label for="${id}">${label}${required ? '' : raw(' <span class="optional">(facultatif)</span>')}</label>
  ${p.hint}
  <input id="${id}" name="${name}" type="${type}" value="${value ?? ''}"${required ? raw(' required') : ''}${p.aria} ${raw(attrs)}>
  ${p.error}
</div>`;
}

function selectField({ name, label, value = '', options, empty, hint, error, id = `f-${name}` }) {
  const p = fieldParts({ name, id, hint, error });
  return html`<div class="${p.cls}">
  <label for="${id}">${label}</label>
  ${p.hint}
  <select id="${id}" name="${name}"${p.aria}>
    ${empty !== undefined ? html`<option value="">${empty}</option>` : ''}
    ${options.map(([v, l]) => html`<option value="${v}"${String(v) === String(value) ? raw(' selected') : ''}>${l}</option>`)}
  </select>
  ${p.error}
</div>`;
}

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const typeTag = (type) => html`<span class="tag tag-${type}">${TYPES[type].label}</span>`;
const formAlert = (text = 'Quelques informations manquent ou sont à corriger.') =>
  html`<p class="form-alert" role="alert">${text}</p>`;

function seatStatus(left) {
  if (left === 0) return html`<span class="status status-full">Complet, liste d’attente</span>`;
  if (left === 1) return html`<span class="status status-low">Dernière place</span>`;
  return html`<span class="status ${left <= 2 ? 'status-low' : 'status-ok'}">${plural(left, 'place restante', 'places restantes')}</span>`;
}

function seatDots(cls, left) {
  return html`<span class="dots" aria-hidden="true">${range(1, cls.capacity).map((i) =>
    html`<span class="dot${i <= left ? '' : ' dot-taken'}"></span>`)}</span>`;
}

function sessionRow(db, cls, { showDay = false } = {}) {
  const teacher = teacherOf(db, cls);
  return html`<li class="session${seatsLeft(db, cls) === 0 ? ' is-full' : ''}">
  <div class="session-time">
    ${showDay ? html`<span class="session-day">${shortDayLabel(cls.date)}</span>` : ''}
    <span class="session-hour">${timeLabel(cls.start)}</span>
    <span class="session-length">${durationLabel(cls)}</span>
  </div>
  <div class="session-main">
    <h3><a href="/cours/${cls.id}">${cls.title}</a></h3>
    <p class="session-meta">${typeTag(cls.type)}<span>${LEVELS[cls.level]}</span><span>avec ${teacher.name}</span></p>
  </div>
  <div class="session-price">${euro(cls.price)}</div>
  <div class="session-seats">${seatStatus(seatsLeft(db, cls))}</div>
</li>`;
}

// ---------------------------------------------------------------- pages

function homePage(db) {
  const open = sortClasses(db.classes).filter((c) => seatsLeft(db, c) > 0).slice(0, 5);
  const minPrice = (type) => Math.min(...db.classes.filter((c) => c.type === type).map((c) => c.price));
  const body = html`
<section class="hero">
  <div class="wrap hero-inner">
    <div>
      <p class="kicker">Atelier de céramique · Lyon, Croix-Rousse</p>
      <h1>Les mains dans la terre, une soirée par semaine.</h1>
      <p class="lede">Terre &amp; Tour est un petit atelier sur les pentes de la Croix-Rousse. On y apprend le tournage, le modelage et l’émaillage en petits groupes, sans rien savoir avant. Terre, outils et tablier sont fournis, et vos pièces sont cuites chez nous.</p>
      <p class="actions"><a class="btn" href="/cours">Voir les cours de la semaine</a><a class="btn btn-ghost" href="/carte-cadeau">Offrir une carte cadeau</a></p>
    </div>
    <div class="hero-art">${POTS}</div>
  </div>
</section>

<section class="wrap section">
  <div class="section-head">
    <h2>Il reste de la place cette semaine</h2>
    <a href="/cours">Tout le planning</a>
  </div>
  <ul class="sessions">${open.map((c) => sessionRow(db, c, { showDay: true }))}</ul>
</section>

<section class="wrap section">
  <h2>Trois façons de travailler la terre</h2>
  <div class="disciplines">
    ${Object.entries(TYPES).map(([key, t]) => html`<article class="discipline discipline-${key}">
      <h3>${t.label}</h3>
      <p>${t.blurb}</p>
      <p class="discipline-foot"><span>À partir de ${euro(minPrice(key))}</span><a href="/cours?type=${key}">${t.link}</a></p>
    </article>`)}
  </div>
</section>

<section class="wrap section steps">
  <h2>Comment ça se passe</h2>
  <ol>
    <li><h3>Choisissez un cours</h3><p>Tournage, modelage ou émaillage, du premier essai au projet personnel. Six personnes au plus autour des tours, huit à la grande table.</p></li>
    <li><h3>Réservez en une minute</h3><p>Votre nom, votre e-mail, le nombre de places. Vous obtenez aussitôt un code de réservation. Le règlement se fait sur place.</p></li>
    <li><h3>Revenez chercher vos pièces</h3><p>Elles sèchent, passent au four, et vous attendent sur l’étagère environ trois semaines plus tard.</p></li>
  </ol>
</section>

<section class="wrap section">
  <div class="band">
    <div class="card">
      <h2>Déjà réservé ?</h2>
      <p>Avec votre e-mail et votre code de réservation, retrouvez vos cours ou annulez-en un. Pas de compte, pas de mot de passe.</p>
      <a class="btn btn-ghost" href="/mes-reservations">Mes réservations</a>
    </div>
    <div class="card">
      <h2>Un cadeau qui salit les mains</h2>
      <p>La carte cadeau vaut pour n’importe quel cours de l’atelier pendant un an. Vous choisissez le montant, nous écrivons votre mot à la main.</p>
      <a class="btn btn-ghost" href="/carte-cadeau">Offrir une carte</a>
    </div>
  </div>
</section>`;
  return layout({ body });
}

function parseFilters(db, query) {
  const pick = (key, ok) => {
    const v = query.get(key) || '';
    return ok(v) ? v : '';
  };
  return {
    type: pick('type', (v) => Object.hasOwn(TYPES, v)),
    niveau: pick('niveau', (v) => ['debutant', 'intermediaire', 'confirme'].includes(v)),
    jour: pick('jour', (v) => db.classes.some((c) => c.date === v)),
    prof: pick('prof', (v) => db.teachers.some((t) => t.id === v)),
    dispo: query.get('dispo') === '1',
  };
}

function matchesFilters(db, cls, f) {
  return (!f.type || cls.type === f.type)
    && (!f.niveau || cls.level === f.niveau || cls.level === 'tous')
    && (!f.jour || cls.date === f.jour)
    && (!f.prof || cls.teacherId === f.prof)
    && (!f.dispo || seatsLeft(db, cls) > 0);
}

function schedulePage(db, query) {
  const f = parseFilters(db, query);
  const all = sortClasses(db.classes);
  const list = all.filter((c) => matchesFilters(db, c, f));
  const active = Boolean(f.type || f.niveau || f.jour || f.prof || f.dispo);
  const dates = [...new Set(all.map((c) => c.date))];
  const days = new Map();
  for (const c of list) {
    if (!days.has(c.date)) days.set(c.date, []);
    days.get(c.date).push(c);
  }
  const body = html`
<div class="wrap page">
  <p class="kicker">${weekLabel(db)}</p>
  <h1>Les cours de la semaine</h1>
  <p class="lede">Petits groupes, terre et outils fournis. Choisissez un cours pour voir le détail et réserver vos places.</p>

  <form class="filters" method="get" action="/cours" aria-label="Filtrer les cours">
    ${selectField({ name: 'type', label: 'Discipline', value: f.type, empty: 'Toutes', options: Object.entries(TYPES).map(([k, t]) => [k, t.label]) })}
    ${selectField({ name: 'niveau', label: 'Niveau', value: f.niveau, empty: 'Tous', options: [['debutant', 'Débutant'], ['intermediaire', 'Intermédiaire'], ['confirme', 'Confirmé']] })}
    ${selectField({ name: 'jour', label: 'Jour', value: f.jour, empty: 'Toute la semaine', options: dates.map((d) => [d, dayLabel(d)]) })}
    ${selectField({ name: 'prof', label: 'Avec', value: f.prof, empty: 'Toute l’équipe', options: db.teachers.map((t) => [t.id, t.name]) })}
    <label class="check"><input type="checkbox" name="dispo" value="1"${f.dispo ? raw(' checked') : ''}> Seulement les cours avec des places</label>
    <button class="btn" type="submit">Filtrer</button>
  </form>

  <div class="results-bar">
    <p>${active ? `${list.length} cours sur ${all.length}` : `${all.length} cours cette semaine`}</p>
    ${active ? html`<a href="/cours">Effacer les filtres</a>` : ''}
  </div>
  ${f.niveau ? html`<p class="hint">Les cours ouverts à tous les niveaux apparaissent quel que soit le niveau choisi.</p>` : ''}
  ${list.length === 0 ? html`<div class="card empty"><p>Aucun cours ne correspond à ces filtres cette semaine.</p><a class="btn btn-ghost" href="/cours">Voir tous les cours</a></div>` : ''}
  ${[...days].map(([date, items]) => html`<section class="day" aria-labelledby="jour-${date}">
    <h2 class="day-title" id="jour-${date}">${dayLabel(date)}</h2>
    <ul class="sessions">${items.map((c) => sessionRow(db, c))}</ul>
  </section>`)}
</div>`;
  return layout({ title: 'Les cours de la semaine', nav: 'cours', body });
}

function bookingPanel(db, cls, left, state) {
  const { values = {}, errors = {}, formError, waitPosition, waitValues = {}, waitErrors = {} } = state;
  const head = html`<p class="panel-price"><strong>${euro(cls.price)}</strong><span>par personne</span></p>
  ${seatDots(cls, left)}
  <p class="seats-line">${left === 0
    ? `Complet : les ${cls.capacity} places sont réservées.`
    : `${plural(left, 'place restante', 'places restantes')} sur ${cls.capacity}`}</p>`;

  if (waitPosition) {
    return html`${head}
  <div class="notice" role="status">
    <p><strong>C’est noté.</strong> Vous êtes en position ${waitPosition} sur la liste d’attente. Si une place se libère, nous écrivons aux personnes inscrites, dans l’ordre.</p>
  </div>
  <p><a href="/cours">Voir les autres cours de la semaine</a></p>`;
  }

  if (left === 0) {
    return html`${head}
  <div class="full-banner">
    <p class="full-title">Ce cours est complet.</p>
    <p>Laissez votre nom sur la liste d’attente : dès qu’une place se libère, nous écrivons aux personnes inscrites, dans l’ordre.</p>
  </div>
  <form class="form" method="post" action="/cours/${cls.id}/attente">
    <h2 class="panel-title">Liste d’attente</h2>
    ${formError ? formAlert(formError) : hasErrors(waitErrors) ? formAlert() : ''}
    ${inputField({ name: 'name', label: 'Nom et prénom', value: waitValues.name, error: waitErrors.name, attrs: 'autocomplete="name" maxlength="80"' })}
    ${inputField({ name: 'email', type: 'email', label: 'E-mail', value: waitValues.email, error: waitErrors.email, attrs: 'autocomplete="email" maxlength="120"' })}
    ${selectField({ name: 'seats', label: 'Places souhaitées', value: waitValues.seats || 1, options: range(1, MAX_SEATS).map((n) => [n, String(n)]), error: waitErrors.seats })}
    <button class="btn btn-block" type="submit">M’inscrire sur la liste d’attente</button>
  </form>`;
  }

  const max = Math.min(MAX_SEATS, left);
  const seats = Number(values.seats) >= 1 && Number(values.seats) <= max ? Number(values.seats) : 1;
  return html`${head}
  <form class="form" method="post" action="/cours/${cls.id}/reserver" data-price="${cls.price}">
    <h2 class="panel-title">Réserver</h2>
    ${hasErrors(errors) ? formAlert() : ''}
    ${inputField({ name: 'name', label: 'Nom et prénom', value: values.name, error: errors.name, attrs: 'autocomplete="name" maxlength="80"' })}
    ${inputField({ name: 'email', type: 'email', label: 'E-mail', value: values.email, error: errors.email, hint: 'Avec votre code de réservation, il vous permet de retrouver ou d’annuler vos places.', attrs: 'autocomplete="email" maxlength="120"' })}
    ${selectField({ name: 'seats', label: 'Nombre de places', value: seats, options: range(1, max).map((n) => [n, String(n)]), error: errors.seats, hint: left > MAX_SEATS ? `${MAX_SEATS} places au plus par réservation.` : undefined })}
    <p class="total"><span>Total</span><output data-total>${euro(cls.price * seats)}</output></p>
    <p class="hint">À régler sur place, le jour du cours (carte ou espèces).</p>
    <button class="btn btn-block" type="submit">Réserver</button>
  </form>`;
}

function classPage(db, cls, state = {}) {
  const teacher = teacherOf(db, cls);
  const left = seatsLeft(db, cls);
  const others = left === 0
    ? sortClasses(db.classes).filter((c) => c.id !== cls.id && c.type === cls.type && seatsLeft(db, c) > 0).slice(0, 3)
    : [];
  const body = html`
<div class="wrap page">
  <p class="crumb"><a href="/cours">← Tous les cours de la semaine</a></p>
  <div class="class-layout">
    <article class="class-main">
      <p class="class-tags">${typeTag(cls.type)}<span class="level">${LEVELS[cls.level]}</span></p>
      <h1>${cls.title}</h1>
      <dl class="facts">
        <div><dt>Quand</dt><dd>${dayLabel(cls.date)}<br>${timeRange(cls)}</dd></div>
        <div><dt>Durée</dt><dd>${durationLabel(cls)}</dd></div>
        <div><dt>Avec</dt><dd><a href="/atelier#${teacher.id}">${teacher.name}</a></dd></div>
        <div><dt>Groupe</dt><dd>${cls.capacity} personnes au plus</dd></div>
      </dl>
      <p class="class-desc">${cls.description}</p>
      <h2>Compris dans le prix</h2>
      <ul class="included">${INCLUDED[cls.type].map((item) => html`<li>${item}</li>`)}</ul>
      <h2>Bon à savoir</h2>
      <ul class="included">
        <li>Vos pièces sont prêtes environ trois semaines après le cours, le temps du séchage et des cuissons.</li>
        <li>Venez avec des vêtements qui ne craignent rien. Pour le tour, des ongles courts aident vraiment.</li>
        <li>L’atelier est au ${STUDIO.address}, ${STUDIO.city}. ${STUDIO.where}.</li>
      </ul>
      ${others.length ? html`<section class="others">
        <h2>Même discipline, d’autres jours</h2>
        <ul class="sessions">${others.map((c) => sessionRow(db, c, { showDay: true }))}</ul>
      </section>` : ''}
    </article>
    <aside class="panel" id="reserver" aria-label="Réservation">${bookingPanel(db, cls, left, state)}</aside>
  </div>
</div>`;
  return layout({ title: `${cls.title}, ${dayLabel(cls.date).toLowerCase()}`, nav: 'cours', body, description: cls.description });
}

function confirmationPage(db, booking) {
  const cls = classById(db, booking.classId);
  const teacher = teacherOf(db, cls);
  const cancelled = booking.status === 'annulee';
  const body = html`
<div class="wrap page narrow">
  <p class="kicker">${cancelled ? 'Réservation annulée' : 'Réservation confirmée'}</p>
  <h1>${cancelled ? 'Cette réservation a été annulée.' : 'C’est réservé. À bientôt à l’atelier !'}</h1>
  <div class="code-box">
    <span>Votre code de réservation</span>
    <strong class="code">${booking.code}</strong>
  </div>
  ${cancelled ? '' : html`<p>Gardez-le bien : avec votre e-mail, il vous permet de retrouver ou d’annuler cette réservation dans <a href="/mes-reservations">Mes réservations</a>.</p>`}
  <dl class="recap">
    <div><dt>Cours</dt><dd><a href="/cours/${cls.id}">${cls.title}</a></dd></div>
    <div><dt>Quand</dt><dd>${dayLabel(cls.date)}, ${timeRange(cls)}</dd></div>
    <div><dt>Avec</dt><dd>${teacher.name}</dd></div>
    <div><dt>Places</dt><dd>${booking.seats}</dd></div>
    <div><dt>Total</dt><dd>${euro(cls.price * booking.seats)}${cancelled ? '' : ', à régler sur place le jour du cours'}</dd></div>
  </dl>
  ${cancelled ? '' : html`<h2>Avant de venir</h2>
  <ul class="included">
    <li>Arrivez dix minutes avant le début : on vous installe et on vous prête un tablier.</li>
    <li>Portez des vêtements qui ne craignent rien. Pour le tour, des ongles courts aident vraiment.</li>
    <li>L’atelier est au ${STUDIO.address}, ${STUDIO.city}. ${STUDIO.where}.</li>
  </ul>`}
  <p class="actions"><a class="btn btn-ghost" href="/cours">Voir les autres cours</a><a class="btn btn-ghost" href="/mes-reservations">Mes réservations</a></p>
</div>`;
  return layout({ title: cancelled ? 'Réservation annulée' : 'Réservation confirmée', nav: 'cours', body });
}

function lookupPage({ email = '', code = '', error } = {}) {
  const body = html`
<div class="wrap page narrow">
  <h1>Mes réservations</h1>
  <p class="lede">Entrez l’e-mail utilisé pour réserver et l’un de vos codes de réservation : vous verrez tous les cours réservés avec cette adresse.</p>
  <form class="form card" method="post" action="/mes-reservations">
    ${error ? formAlert(error) : ''}
    ${inputField({ name: 'email', type: 'email', label: 'E-mail', value: email, attrs: 'autocomplete="email" maxlength="120"' })}
    ${inputField({ name: 'code', label: 'Code de réservation', value: code, hint: 'Il s’affiche sur l’écran de confirmation, sous la forme TT-XXXX.', attrs: 'autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" placeholder="TT-XXXX"' })}
    <button class="btn" type="submit">Voir mes réservations</button>
  </form>
  <p class="muted small">Code perdu ? Écrivez-nous à <a href="mailto:${STUDIO.email}">${STUDIO.email}</a> depuis l’adresse utilisée pour réserver.</p>
</div>`;
  return layout({ title: 'Mes réservations', nav: 'resa', body });
}

function bookingsPage(db, email, code, { flash } = {}) {
  const mine = db.bookings
    .filter((b) => b.email === email)
    .map((b) => ({ b, c: classById(db, b.classId) }))
    .filter((x) => x.c)
    .sort((x, y) => (x.b.status === y.b.status ? 0 : x.b.status === 'confirmee' ? -1 : 1)
      || `${x.c.date} ${x.c.start}`.localeCompare(`${y.c.date} ${y.c.start}`));
  const body = html`
<div class="wrap page narrow">
  <h1>Mes réservations</h1>
  <p class="lede">Réservations faites avec <strong>${email}</strong>. <a href="/mes-reservations">Ce n’est pas vous ?</a></p>
  ${flash ? html`<div class="${flash.kind === 'ok' ? 'notice' : 'form-alert'}" role="status"><p>${flash.text}</p></div>` : ''}
  <ul class="bookings">
    ${mine.map(({ b, c }) => html`<li class="booking${b.status === 'annulee' ? ' is-cancelled' : ''}">
      <div>
        <p class="booking-when">${dayLabel(c.date)} · ${timeRange(c)}</p>
        <h2><a href="/cours/${c.id}">${c.title}</a></h2>
        <p class="booking-meta">${plural(b.seats, 'place', 'places')} · ${euro(b.seats * c.price)} · code <span class="code-inline">${b.code}</span></p>
      </div>
      ${b.status === 'annulee'
        ? html`<span class="status status-cancelled">Annulée</span>`
        : html`<form method="post" action="/mes-reservations/annuler">
        <input type="hidden" name="email" value="${email}">
        <input type="hidden" name="code" value="${code}">
        <input type="hidden" name="target" value="${b.code}">
        <button class="btn btn-ghost btn-small" type="submit">Annuler<span class="visually-hidden"> la réservation ${b.code}</span></button>
      </form>`}
    </li>`)}
  </ul>
  <p><a href="/cours">Réserver un autre cours</a></p>
</div>`;
  return layout({ title: 'Mes réservations', nav: 'resa', body });
}

function cancelConfirmPage(db, email, code, booking) {
  const cls = classById(db, booking.classId);
  const body = html`
<div class="wrap page narrow">
  <p class="kicker">Mes réservations</p>
  <h1>Annuler cette réservation ?</h1>
  <div class="card">
    <p class="booking-when">${dayLabel(cls.date)} · ${timeRange(cls)}</p>
    <h2>${cls.title}</h2>
    <p class="booking-meta">${plural(booking.seats, 'place', 'places')} · code <span class="code-inline">${booking.code}</span></p>
  </div>
  <p>Vos places seront aussitôt proposées à d’autres élèves. Pour revenir ensuite, il faudra réserver à nouveau, s’il reste de la place.</p>
  <div class="actions">
    <form method="post" action="/mes-reservations/annuler">
      <input type="hidden" name="email" value="${email}">
      <input type="hidden" name="code" value="${code}">
      <input type="hidden" name="target" value="${booking.code}">
      <input type="hidden" name="confirm" value="oui">
      <button class="btn btn-danger" type="submit">Oui, annuler la réservation</button>
    </form>
    <form method="post" action="/mes-reservations">
      <input type="hidden" name="email" value="${email}">
      <input type="hidden" name="code" value="${code}">
      <button class="btn btn-ghost" type="submit">Non, la garder</button>
    </form>
  </div>
</div>`;
  return layout({ title: 'Annuler une réservation', nav: 'resa', body });
}

function giftPage({ values = { amount: '55' }, errors = {} } = {}) {
  const chosen = values.amount;
  const previewAmount = chosen === 'autre' ? (Number(values.customAmount) || null) : Number(chosen) || null;
  const amountIds = [errors.amount && 'amount-err'].filter(Boolean).join(' ');
  const body = html`
<div class="wrap page">
  <p class="kicker">Carte cadeau</p>
  <h1>Offrir un cours à l’atelier</h1>
  <p class="lede">La carte cadeau vaut pour n’importe quel cours de Terre &amp; Tour, pendant un an. La personne qui la reçoit choisit son cours, réserve ses places, et présente la carte le jour venu.</p>

  <div class="gift-layout">
    <form class="form gift-form" method="post" action="/carte-cadeau" data-gift>
      ${hasErrors(errors) ? formAlert() : ''}
      <fieldset class="${errors.amount ? 'has-error' : ''}"${amountIds ? raw(` aria-describedby="${amountIds}"`) : ''}>
        <legend>Le montant</legend>
        <div class="amounts">
          ${GIFT_PRESETS.map((p) => html`<label class="amount">
            <input type="radio" name="amount" value="${p.value}"${String(p.value) === String(chosen) ? raw(' checked') : ''}>
            <strong>${euro(p.value)}</strong>
            <span>${p.label}</span>
          </label>`)}
          <label class="amount">
            <input type="radio" name="amount" value="autre"${chosen === 'autre' ? raw(' checked') : ''}>
            <strong>Autre</strong>
            <span>De ${GIFT_MIN} à ${euro(GIFT_MAX)}</span>
          </label>
        </div>
        <div class="field custom-amount">
          <label for="f-customAmount">Autre montant, en euros</label>
          <input id="f-customAmount" name="customAmount" type="number" inputmode="numeric" min="${GIFT_MIN}" max="${GIFT_MAX}" step="1" value="${values.customAmount ?? ''}">
        </div>
        ${errors.amount ? html`<p class="field-error" id="amount-err">${errors.amount}</p>` : ''}
      </fieldset>

      <fieldset>
        <legend>Pour qui ?</legend>
        ${inputField({ name: 'recipientName', label: 'Prénom de la personne qui la reçoit', value: values.recipientName, error: errors.recipientName, attrs: 'maxlength="60"' })}
        <div class="field${errors.message ? ' has-error' : ''}">
          <label for="f-message">Un mot à écrire sur la carte <span class="optional">(facultatif)</span></label>
          <p class="hint" id="f-message-hint">300 caractères au plus. Nous l’écrivons à la main.</p>
          <textarea id="f-message" name="message" maxlength="300" rows="4" aria-describedby="f-message-hint">${values.message ?? ''}</textarea>
          ${errors.message ? html`<p class="field-error">${errors.message}</p>` : ''}
        </div>
      </fieldset>

      <fieldset>
        <legend>De la part de</legend>
        ${inputField({ name: 'buyerName', label: 'Votre nom et prénom', value: values.buyerName, error: errors.buyerName, attrs: 'autocomplete="name" maxlength="80"' })}
        ${inputField({ name: 'buyerEmail', type: 'email', label: 'Votre e-mail', value: values.buyerEmail, error: errors.buyerEmail, hint: 'Pour vous prévenir quand la carte est prête.', attrs: 'autocomplete="email" maxlength="120"' })}
      </fieldset>

      <p class="hint">Pas de paiement en ligne : vous réglez la carte à l’atelier, en venant la chercher.</p>
      <button class="btn" type="submit">Commander la carte</button>
    </form>

    <aside class="gift-preview" aria-hidden="true">
      <div class="gift-card">
        <p class="gift-card-brand">${LOGO}<span>Terre &amp; Tour</span></p>
        <p class="gift-card-label">Carte cadeau</p>
        <p class="gift-card-amount" data-preview-amount>${previewAmount ? euro(previewAmount) : `…${NBSP}€`}</p>
        <p class="gift-card-for">Pour <span data-preview-name>${values.recipientName || '…'}</span></p>
        <p class="gift-card-message" data-preview-message>${values.message || ''}</p>
        <p class="gift-card-foot">Valable un an sur tous les cours · ${STUDIO.address}, Lyon</p>
      </div>
    </aside>
  </div>
</div>`;
  return layout({ title: 'Carte cadeau', nav: 'cadeau', body });
}

function giftThanksPage(gift) {
  const firstName = gift.buyerName.split(' ')[0];
  const body = html`
<div class="wrap page narrow">
  <p class="kicker">Commande enregistrée</p>
  <h1>Merci ${firstName}, c’est noté.</h1>
  <p class="lede">Une carte cadeau de ${euro(gift.amount)} pour ${gift.recipientName}, valable un an sur tous les cours de l’atelier.</p>
  ${gift.message ? html`<p>Nous écrirons votre mot à la main sur la carte : « ${gift.message} »</p>` : ''}
  <div class="code-box">
    <span>Référence de la commande</span>
    <strong class="code">${gift.ref}</strong>
  </div>
  <h2>Et maintenant ?</h2>
  <p>Rien n’a été payé : il n’y a pas de paiement en ligne. Passez à l’atelier avec cette référence, ${STUDIO.hours.toLowerCase()}. Vous réglez sur place (carte ou espèces) et repartez avec la carte, imprimée et glissée dans son enveloppe.</p>
  <p>${STUDIO.address}, ${STUDIO.city}. ${STUDIO.where}.</p>
  <p class="actions"><a class="btn btn-ghost" href="/cours">Voir les cours de la semaine</a><a class="btn btn-ghost" href="/">Retour à l’accueil</a></p>
</div>`;
  return layout({ title: 'Carte cadeau commandée', nav: 'cadeau', body });
}

function studioPage(db) {
  const body = html`
<div class="wrap page">
  <p class="kicker">L’atelier</p>
  <h1>Un ancien atelier de canut, six tours et un four.</h1>
  <div class="about-grid">
    <div class="prose">
      <p class="lede">Terre &amp; Tour a ouvert en 2019 au rez-de-chaussée d’un immeuble de canuts, sur les pentes de la Croix-Rousse.</p>
      <p>Les hautes fenêtres ont été percées pour les métiers à tisser ; elles éclairent aujourd’hui six tours, une grande table de modelage et les étagères où sèchent les pièces des élèves.</p>
      <p>Nous enseignons en petits groupes, parce que la terre s’apprend en regardant de près les mains de quelqu’un. Les cours sont ouverts à partir de 16 ans, et dès 10 ans pour certains cours de modelage, avec un adulte.</p>
      <p>Toutes les pièces sont cuites sur place, dans un four électrique qui monte à 1 250 °C. Comptez environ trois semaines entre le cours et le moment où vous repartez avec vos pièces : le temps qu’elles sèchent, passent une première fois au four, puis une seconde si elles sont émaillées.</p>
    </div>
    <aside class="card info">
      <h2>Infos pratiques</h2>
      <dl>
        <dt>Adresse</dt><dd>${STUDIO.address}<br>${STUDIO.city}<br>${STUDIO.where}</dd>
        <dt>Accès</dt><dd>${STUDIO.access}</dd>
        <dt>Accueil</dt><dd>${STUDIO.hours}</dd>
        <dt>Contact</dt><dd><a href="mailto:${STUDIO.email}">${STUDIO.email}</a><br>${STUDIO.phone}</dd>
      </dl>
    </aside>
  </div>

  <section class="section" aria-labelledby="equipe">
    <h2 id="equipe">L’équipe</h2>
    <div class="teachers">
      ${db.teachers.map((t) => {
        const classes = sortClasses(db.classes.filter((c) => c.teacherId === t.id));
        return html`<article class="teacher" id="${t.id}">
        <div class="avatar avatar-${t.discipline}" aria-hidden="true">${t.name.split(' ').map((w) => w[0]).join('')}</div>
        <h3>${t.name}</h3>
        <p class="teacher-role">${t.role}</p>
        <p>${t.bio}</p>
        ${classes.length ? html`<p class="teacher-week">Cette semaine</p>
        <ul class="teacher-classes">${classes.map((c) => html`<li><a href="/cours/${c.id}">${c.title}</a><span>${shortDayLabel(c.date)}, ${timeLabel(c.start)}</span></li>`)}</ul>` : ''}
      </article>`;
      })}
    </div>
  </section>
</div>`;
  return layout({ title: 'L’atelier et l’équipe', nav: 'atelier', body });
}

function messagePage(status, title, text) {
  return layout({
    title,
    body: html`<div class="wrap page narrow">
  <p class="kicker">Erreur ${status}</p>
  <h1>${title}</h1>
  <p class="lede">${text}</p>
  <p class="actions"><a class="btn" href="/cours">Voir les cours</a><a class="btn btn-ghost" href="/">Retour à l’accueil</a></p>
</div>`,
  });
}

// ---------------------------------------------------------------- actions

function validatePerson(form) {
  const values = { name: clean(form.get('name'), 80), email: cleanEmail(form.get('email')) };
  const errors = {};
  if (values.name.length < 2) errors.name = 'Indiquez votre nom et votre prénom.';
  if (!EMAIL_RE.test(values.email)) errors.email = 'Cette adresse e-mail ne semble pas valide.';
  return { values, errors };
}

function handleBooking(res, db, cls, form) {
  const left = seatsLeft(db, cls);
  const { values, errors } = validatePerson(form);
  const seats = Number.parseInt(form.get('seats'), 10);
  values.seats = seats;

  if (left === 0) {
    return send(res, 409, classPage(db, cls, {
      formError: 'Désolé, ce cours vient d’être complet. Vous pouvez vous inscrire sur la liste d’attente.',
      waitValues: values,
    }));
  }
  if (!Number.isInteger(seats) || seats < 1) errors.seats = 'Choisissez un nombre de places.';
  else if (seats > left) errors.seats = `Il ne reste que ${plural(left, 'place', 'places')} sur ce cours.`;
  else if (seats > MAX_SEATS) errors.seats = `${MAX_SEATS} places au plus par réservation.`;
  if (hasErrors(errors)) return send(res, 422, classPage(db, cls, { values, errors }));

  const booking = {
    code: newBookingCode(db),
    classId: cls.id,
    name: values.name,
    email: values.email,
    seats,
    status: 'confirmee',
    createdAt: new Date().toISOString(),
  };
  db.bookings.push(booking);
  saveDb(db);
  return redirect(res, `/reservation/${booking.code}`);
}

function handleWaitlist(res, db, cls, form) {
  if (seatsLeft(db, cls) > 0) return redirect(res, `/cours/${cls.id}#reserver`);
  const { values, errors } = validatePerson(form);
  const seats = Number.parseInt(form.get('seats'), 10);
  values.seats = seats;
  if (!Number.isInteger(seats) || seats < 1 || seats > MAX_SEATS) errors.seats = `Entre 1 et ${MAX_SEATS} places.`;
  if (hasErrors(errors)) return send(res, 422, classPage(db, cls, { waitValues: values, waitErrors: errors }));

  const queue = db.waitlist.filter((w) => w.classId === cls.id);
  let position = queue.findIndex((w) => w.email === values.email) + 1;
  if (!position) {
    db.waitlist.push({ id: `W-${randomCode(6)}`, classId: cls.id, name: values.name, email: values.email, seats, createdAt: new Date().toISOString() });
    saveDb(db);
    position = queue.length + 1;
  }
  return redirect(res, `/cours/${cls.id}?attente=${position}#reserver`);
}

// Un e-mail et un code qui vont ensemble donnent accès aux réservations de cet e-mail.
function authenticate(db, form) {
  const email = cleanEmail(form.get('email'));
  const code = normalizeCode(form.get('code'));
  const ok = Boolean(email && code && db.bookings.some((b) => b.code === code && b.email === email));
  return { email, code, ok };
}

function handleLookup(res, db, form) {
  const { email, code, ok } = authenticate(db, form);
  if (!ok) {
    return send(res, 404, lookupPage({
      email,
      code: clean(form.get('code'), 12),
      error: 'Aucune réservation ne correspond à cet e-mail et à ce code. Vérifiez l’orthographe de l’adresse et le code (TT-XXXX).',
    }));
  }
  return send(res, 200, bookingsPage(db, email, code));
}

function handleCancel(res, db, form) {
  const { email, code, ok } = authenticate(db, form);
  if (!ok) return send(res, 403, lookupPage({ email, error: 'Votre session a expiré : entrez à nouveau votre e-mail et votre code.' }));
  const target = db.bookings.find((b) => b.code === normalizeCode(form.get('target')) && b.email === email);
  if (!target) {
    return send(res, 404, bookingsPage(db, email, code, { flash: { kind: 'error', text: 'Cette réservation est introuvable.' } }));
  }
  if (target.status !== 'confirmee') {
    return send(res, 200, bookingsPage(db, email, code, { flash: { kind: 'ok', text: `La réservation ${target.code} était déjà annulée.` } }));
  }
  if (form.get('confirm') !== 'oui') return send(res, 200, cancelConfirmPage(db, email, code, target));

  target.status = 'annulee';
  target.cancelledAt = new Date().toISOString();
  saveDb(db);
  const cls = classById(db, target.classId);
  return send(res, 200, bookingsPage(db, email, code, {
    flash: { kind: 'ok', text: `C’est fait : votre réservation ${target.code} pour « ${cls.title} » est annulée.` },
  }));
}

function handleGift(res, db, form) {
  const values = {
    amount: String(form.get('amount') || ''),
    customAmount: clean(form.get('customAmount'), 6),
    recipientName: clean(form.get('recipientName'), 60),
    message: String(form.get('message') || '').trim().slice(0, 300),
    buyerName: clean(form.get('buyerName'), 80),
    buyerEmail: cleanEmail(form.get('buyerEmail')),
  };
  const errors = {};
  let amount = null;
  if (values.amount === 'autre') {
    const n = Number(values.customAmount.replace(',', '.'));
    if (Number.isInteger(n) && n >= GIFT_MIN && n <= GIFT_MAX) amount = n;
    else errors.amount = `Indiquez un montant en euros, sans centimes, entre ${GIFT_MIN} et ${GIFT_MAX}.`;
  } else if (GIFT_PRESETS.some((p) => String(p.value) === values.amount)) {
    amount = Number(values.amount);
  } else {
    errors.amount = 'Choisissez un montant.';
  }
  if (values.recipientName.length < 2) errors.recipientName = 'Indiquez le prénom de la personne qui reçoit la carte.';
  if (values.buyerName.length < 2) errors.buyerName = 'Indiquez votre nom et votre prénom.';
  if (!EMAIL_RE.test(values.buyerEmail)) errors.buyerEmail = 'Cette adresse e-mail ne semble pas valide.';
  if (hasErrors(errors)) return send(res, 422, giftPage({ values, errors }));

  const gift = {
    ref: newGiftRef(db),
    amount,
    recipientName: values.recipientName,
    message: values.message,
    buyerName: values.buyerName,
    buyerEmail: values.buyerEmail,
    status: 'commandee',
    createdAt: new Date().toISOString(),
  };
  db.giftCards.push(gift);
  saveDb(db);
  return redirect(res, `/carte-cadeau/merci/${gift.ref}`);
}

// ---------------------------------------------------------------- HTTP

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};

function send(res, status, body, type = 'text/html; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
  });
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(303, { Location: location, ...SECURITY_HEADERS });
  res.end();
}

const notFound = (res) => send(res, 404, messagePage(404, 'Cette page n’existe pas.', 'Le lien est peut-être ancien, ou le cours n’est plus au planning.'));

async function readForm(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 20_000) throw Object.assign(new Error('Formulaire trop volumineux'), { status: 413 });
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function serveStatic(res, pathname) {
  const file = path.join(PUBLIC_DIR, pathname.slice('/static/'.length));
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !MIME[path.extname(file)]) return notFound(res);
  fs.readFile(file, (err, data) => {
    if (err) return notFound(res);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)], 'Cache-Control': 'no-cache', ...SECURITY_HEADERS });
    res.end(data);
  });
}

async function route(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : '/';
  const method = req.method === 'HEAD' ? 'GET' : req.method;
  const isGet = method === 'GET';
  const isPost = method === 'POST';
  let m;

  if (p.startsWith('/static/') && isGet) return serveStatic(res, p);
  if (!isGet && !isPost) return send(res, 405, messagePage(405, 'Action non prise en charge.', 'Cette adresse ne répond qu’à la navigation habituelle.'));

  if (p === '/' && isGet) return send(res, 200, homePage(loadDb()));
  if (p === '/cours' && isGet) return send(res, 200, schedulePage(loadDb(), url.searchParams));
  if (p === '/atelier' && isGet) return send(res, 200, studioPage(loadDb()));

  if ((m = p.match(/^\/cours\/([a-z0-9-]+)(?:\/(reserver|attente))?$/))) {
    const [, id, action] = m;
    if (!action && !isGet) return notFound(res);
    if (action && isGet) return redirect(res, `/cours/${id}`);
    const form = action ? await readForm(req) : null;
    const db = loadDb();
    const cls = classById(db, id);
    if (!cls) return notFound(res);
    if (action === 'reserver') return handleBooking(res, db, cls, form);
    if (action === 'attente') return handleWaitlist(res, db, cls, form);
    const position = Number(url.searchParams.get('attente'));
    return send(res, 200, classPage(db, cls, { waitPosition: Number.isInteger(position) && position > 0 && position < 1000 ? position : 0 }));
  }

  if ((m = p.match(/^\/reservation\/(TT-[A-Z0-9]{4})$/i)) && isGet) {
    const db = loadDb();
    const booking = db.bookings.find((b) => b.code === m[1].toUpperCase());
    return booking ? send(res, 200, confirmationPage(db, booking)) : notFound(res);
  }

  if (p === '/mes-reservations') {
    if (isGet) return send(res, 200, lookupPage());
    return handleLookup(res, loadDb(), await readForm(req));
  }
  if (p === '/mes-reservations/annuler') {
    if (isGet) return redirect(res, '/mes-reservations');
    return handleCancel(res, loadDb(), await readForm(req));
  }

  if (p === '/carte-cadeau') {
    if (isGet) return send(res, 200, giftPage());
    return handleGift(res, loadDb(), await readForm(req));
  }
  if ((m = p.match(/^\/carte-cadeau\/merci\/(CC-[A-Z0-9]{4}-[A-Z0-9]{4})$/)) && isGet) {
    const gift = loadDb().giftCards.find((g) => g.ref === m[1]);
    return gift ? send(res, 200, giftThanksPage(gift)) : notFound(res);
  }

  return notFound(res);
}

const server = http.createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (err) {
    if (err.status !== 413) console.error(err);
    if (res.headersSent) return res.end();
    const status = err.status || 500;
    send(res, status, messagePage(status, status === 413 ? 'Formulaire trop long.' : 'Quelque chose s’est mal passé.', 'Réessayez dans un instant. Si le problème continue, écrivez-nous.'));
  }
});

server.listen(PORT, () => {
  loadDb();
  console.log(`Terre & Tour tourne sur http://localhost:${PORT} (données : ${path.relative(ROOT, DB_FILE)})`);
});

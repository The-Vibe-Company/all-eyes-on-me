/* Aides communes à toutes les pages. */

const STATUS_LABELS = { draft: 'Brouillon', sent: 'Envoyée', paid: 'Payée', late: 'En retard' };

const eurFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const eurShortFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const eurCompactFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateLongFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const eur = (n) => eurFmt.format(n);
const eurShort = (n) => eurShortFmt.format(n);
const eurCompact = (n) => eurCompactFmt.format(n);
const isoToDate = (iso) => new Date(iso + 'T00:00:00Z');
const dateFr = (iso) => dateFmt.format(isoToDate(iso));
const dateLongFr = (iso) => dateLongFmt.format(isoToDate(iso));
const monthName = (key, style = 'long') =>
  new Intl.DateTimeFormat('fr-FR', { month: style, timeZone: 'UTC' }).format(isoToDate(key + '-01'));
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

function localToday() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function addDaysIso(iso, days) {
  const d = new Date(isoToDate(iso).getTime() + days * 86400000);
  return d.toISOString().slice(0, 10);
}

/* Construit un élément sans jamais passer par innerHTML. */
function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === false || value == null) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

function pill(status) {
  return el('span', { class: `pill pill-${status}`, text: STATUS_LABELS[status] || status });
}

async function api(path, options = {}) {
  const init = { method: options.method || 'GET', headers: {} };
  if (options.body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  let response;
  try {
    response = await fetch('/api' + path, init);
  } catch {
    throw new Error('Impossible de joindre le serveur.');
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    /* corps vide ou illisible */
  }
  if (!response.ok) throw new Error((data && data.error) || `Erreur ${response.status}`);
  return data;
}

let toastTimer;
function toast(message) {
  let node = document.getElementById('toast');
  if (!node) {
    node = el('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(node);
  }
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 3200);
}

/* Une ligne de tableau qui ouvre sa facture au clic, sans gêner le lien lui-même. */
function rowLink(tr, href) {
  tr.addEventListener('click', (event) => {
    if (event.target.closest('a, button')) return;
    location.href = href;
  });
}

function showLoadError(container, error) {
  container.replaceChildren(el('p', { class: 'empty', role: 'alert', text: `Chargement impossible. ${error.message}` }));
}

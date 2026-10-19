// Aides partagées par toutes les pages.

export const DAYS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const DAYS_SHORT = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* corps vide ou illisible */
  }
  if (!res.ok) {
    const err = new Error(data?.error || 'Le service ne répond pas. Réessayez dans un instant.');
    err.status = res.status;
    err.field = data?.field;
    throw err;
  }
  return data;
}

// Construit un nœud DOM. Les chaînes passées en enfants deviennent du texte : jamais de HTML.
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child != null && child !== false) node.append(child);
  }
  return node;
}

// Mémoire locale facultative (nom, e-mail) : la page marche sans.
export const memory = {
  get(key) {
    try {
      return localStorage.getItem(`respire.${key}`) || '';
    } catch {
      return '';
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`respire.${key}`, value);
    } catch {
      /* stockage indisponible */
    }
  },
};

export function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// Petit anneau qui se remplit à mesure que le cours se remplit.
function occupancyRing(taken, capacity) {
  const r = 9;
  const circumference = 2 * Math.PI * r;
  const fraction = capacity > 0 ? Math.min(1, taken / capacity) : 0;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'occ');
  svg.setAttribute('aria-hidden', 'true');
  for (const [cls, dash] of [['occ-track', null], ['occ-fill', `${circumference * fraction} ${circumference}`]]) {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('class', cls);
    c.setAttribute('cx', '12');
    c.setAttribute('cy', '12');
    c.setAttribute('r', String(r));
    if (dash) c.setAttribute('stroke-dasharray', dash);
    svg.append(c);
  }
  return svg;
}

export function spotsText(c, long = false) {
  if (c.full) return 'Complet';
  const places = `${c.spotsLeft} place${c.spotsLeft > 1 ? 's' : ''}`;
  if (long) return `${places} restante${c.spotsLeft > 1 ? 's' : ''} sur ${c.capacity}`;
  return c.spotsLeft <= 3 ? `Plus que ${places}` : places;
}

export function spotsBadge(c, long = false) {
  const state = c.full ? 'full' : c.spotsLeft <= 3 ? 'low' : '';
  return el(
    'span',
    { class: `spots ${state}`.trim() },
    occupancyRing(c.capacity - c.spotsLeft, c.capacity),
    spotsText(c, long),
  );
}

export function showError(container, message, retry) {
  container.removeAttribute('aria-busy');
  container.replaceChildren(
    el(
      'div',
      { class: 'notice', role: 'alert' },
      el('p', { text: message }),
      retry && el('button', { class: 'btn ghost small', type: 'button', onclick: retry, text: 'Réessayer' }),
    ),
  );
}

let toastTimer;
export function toast(message) {
  document.querySelector('.toast')?.remove();
  const node = el('div', { class: 'toast', role: 'status', text: message });
  document.body.append(node);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.remove(), 3500);
}

export const classUrl = (id) => `/cours.html?id=${encodeURIComponent(id)}`;

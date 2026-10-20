import { api, el, showError } from './common.js';

const box = document.getElementById('info');

async function boot() {
  try {
    const studio = await api('/api/studio');
    document.getElementById('baseline').textContent = studio.baseline;
    render(studio);
    box.removeAttribute('aria-busy');
  } catch (err) {
    showError(box, err.message, boot);
  }
}

function render(s) {
  const a = s.address;
  const tel = s.phone.replace(/\s+/g, '');
  box.replaceChildren(
    el(
      'section',
      { class: 'info' },
      el('h2', { text: 'Adresse' }),
      el('p', { class: 'big' }, a.street, el('br'), `${a.postalCode} ${a.city}`),
    ),
    el(
      'section',
      { class: 'info' },
      el('h2', { text: 'Téléphone' }),
      el('p', { class: 'big' }, el('a', { href: `tel:+33${tel.replace(/^0/, '')}`, text: s.phone })),
    ),
    el(
      'section',
      { class: 'info' },
      el('h2', { text: 'E-mail' }),
      el('p', { class: 'big' }, el('a', { href: `mailto:${s.email}`, text: s.email })),
    ),
    el(
      'section',
      { class: 'info' },
      el('h2', { text: 'Accueil du studio' }),
      el('dl', {}, s.hours.flatMap((h) => [el('dt', { text: h.days }), el('dd', { text: h.hours })])),
    ),
    el(
      'section',
      { class: 'info' },
      el('h2', { text: 'Venir au studio' }),
      el('ul', {}, s.access.map((x) => el('li', {}, el('span', { class: 'mode', text: `${x.mode} · ` }), x.text))),
    ),
    el(
      'section',
      { class: 'info' },
      el('h2', { text: 'Bon à savoir' }),
      el('ul', {}, s.notes.map((n) => el('li', { text: n }))),
    ),
  );
}

boot();

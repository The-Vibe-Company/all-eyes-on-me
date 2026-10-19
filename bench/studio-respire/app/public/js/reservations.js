import { api, el, memory, classUrl, toast } from './common.js';

const form = document.getElementById('lookup');
const input = document.getElementById('email');
const errorBox = document.getElementById('email-error');
const results = document.getElementById('results');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let currentEmail = '';
let bookings = [];

function setError(message) {
  errorBox.textContent = message || '';
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

async function load(email) {
  currentEmail = email;
  results.setAttribute('aria-busy', 'true');
  results.replaceChildren(el('p', { class: 'loading', text: 'Recherche de vos réservations…' }));
  try {
    bookings = await api(`/api/bookings?email=${encodeURIComponent(email)}`);
    memory.set('email', email);
    render();
  } catch (err) {
    if (err.field === 'email') {
      results.replaceChildren();
      setError(err.message);
      input.focus();
    } else {
      results.replaceChildren(
        el(
          'div',
          { class: 'notice', role: 'alert' },
          el('p', { text: err.message }),
          el('button', { class: 'btn ghost small', type: 'button', onclick: () => load(email), text: 'Réessayer' }),
        ),
      );
    }
  } finally {
    results.removeAttribute('aria-busy');
  }
}

function render() {
  if (bookings.length === 0) {
    results.replaceChildren(
      el(
        'div',
        { class: 'empty' },
        el('p', { text: `Aucune réservation pour ${currentEmail}.` }),
        el('a', { class: 'btn', href: '/#planning', text: 'Choisir un cours' }),
      ),
    );
    return;
  }
  results.replaceChildren(
    el('h2', { class: 'results-title', text: `${bookings.length} réservation${bookings.length > 1 ? 's' : ''} pour ${currentEmail}` }),
    el('ul', { class: 'bookings' }, bookings.map(card)),
  );
}

function card(booking) {
  const c = booking.class;
  const actions = el('div', { class: 'booking-actions' });
  const idle = () =>
    actions.replaceChildren(
      el('button', { class: 'btn ghost small', type: 'button', onclick: ask, text: 'Annuler la réservation' }),
    );
  const ask = () => {
    actions.replaceChildren(
      el('span', { class: 'ask', text: 'Annuler cette place ?' }),
      el('button', { class: 'btn warn small', type: 'button', onclick: () => cancel(booking, actions), text: 'Oui, annuler' }),
      el('button', { class: 'btn ghost small', type: 'button', onclick: idle, text: 'Garder' }),
    );
    actions.querySelector('.warn').focus();
  };
  idle();
  return el(
    'li',
    { class: 'booking', 'data-id': booking.id },
    el('div', { class: 'booking-when' }, c.dayName, el('small', { text: `${c.start} – ${c.end}` })),
    el(
      'div',
      {},
      el('h3', {}, el('a', { href: classUrl(c.id), text: c.title })),
      el('p', { text: `${c.room} · avec ${c.teacher.name}` }),
      el('p', { text: `Réservé au nom de ${booking.name}` }),
    ),
    actions,
  );
}

async function cancel(booking, actions) {
  for (const b of actions.querySelectorAll('button')) b.disabled = true;
  try {
    await api(`/api/bookings/${encodeURIComponent(booking.id)}?email=${encodeURIComponent(currentEmail)}`, { method: 'DELETE' });
    bookings = bookings.filter((b) => b.id !== booking.id);
    render();
    toast(`Réservation annulée : ${booking.class.title}, ${booking.class.dayName.toLowerCase()} ${booking.class.start}.`);
  } catch (err) {
    for (const b of actions.querySelectorAll('button')) b.disabled = false;
    actions.append(el('span', { class: 'ask', role: 'alert', text: err.message }));
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const email = input.value.trim().toLowerCase();
  if (!email) return setError('Indiquez l’adresse e-mail utilisée pour réserver.'), input.focus();
  if (!EMAIL_RE.test(email)) return setError('Cette adresse e-mail ne semble pas valide.'), input.focus();
  setError('');
  load(email);
});

document.getElementById('try-demo').addEventListener('click', () => {
  input.value = 'camille@example.com';
  setError('');
  load(input.value);
});

const saved = memory.get('email');
if (saved) {
  input.value = saved;
  load(saved.toLowerCase());
}

import { api, el, memory, spotsBadge, initials, showError } from './common.js';

const root = document.getElementById('course');
const classId = new URLSearchParams(location.search).get('id');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let course = null;
let bookBox = null;

async function boot() {
  if (!classId) return notFound();
  root.setAttribute('aria-busy', 'true');
  try {
    course = await api(`/api/classes/${encodeURIComponent(classId)}`);
  } catch (err) {
    if (err.status === 404) return notFound();
    return showError(root, err.message, boot);
  }
  document.title = `${course.title} · Studio Respire`;
  render();
  root.removeAttribute('aria-busy');
}

function notFound() {
  document.title = 'Cours introuvable · Studio Respire';
  root.removeAttribute('aria-busy');
  root.replaceChildren(
    el(
      'div',
      { class: 'empty' },
      el('p', { text: 'Ce cours n’existe pas ou n’est plus au planning.' }),
      el('a', { class: 'btn', href: '/', text: 'Retour au planning' }),
    ),
  );
}

function render() {
  const t = course.teacher;
  bookBox = el('aside', { class: 'book-card', 'aria-labelledby': 'book-title' });
  drawForm();

  root.replaceChildren(
    el('a', { class: 'back', href: '/#planning', text: '← Le planning de la semaine' }),
    el(
      'header',
      {},
      el('p', { class: 'eyebrow', text: `${course.dayName} · ${course.start} – ${course.end}` }),
      el('h1', { class: 'course-title', text: course.title }),
      el('p', { class: 'course-lead', text: course.summary }),
      el(
        'ul',
        { class: 'facts' },
        [course.level, `${course.duration} minutes`, course.room, `avec ${t.name}`].map((f) => el('li', { class: 'fact', text: f })),
      ),
    ),
    el(
      'div',
      { class: 'course-grid' },
      el(
        'div',
        { class: 'course-body' },
        el('h2', { text: 'Le cours' }),
        el('p', { text: course.description }),
        el('h2', { text: 'Au programme' }),
        el('ul', { class: 'program' }, course.program.map((item) => el('li', { text: item }))),
        el('h2', { text: 'À prévoir' }),
        el('p', { text: course.bring }),
        el('h2', { text: 'Votre professeur' }),
        el(
          'article',
          { class: 'teacher-card' },
          el('div', { class: `mono tone-${t.tone}`, 'aria-hidden': 'true', text: initials(t.name) }),
          el(
            'div',
            {},
            el('h3', { text: t.name }),
            el('p', { class: 'role', text: `${t.role} · ${t.since}` }),
            el('p', { text: t.bio }),
            el('div', { class: 'tags' }, t.specialties.map((s) => el('span', { class: 'pill', text: s }))),
          ),
        ),
      ),
      bookBox,
    ),
  );
}

function field(id, label, props, error) {
  return el(
    'div',
    { class: 'field' },
    el('label', { for: id, text: label }),
    el('input', { id, name: id, required: true, 'aria-describedby': `${id}-error`, ...props }),
    el('p', { class: 'field-error', id: `${id}-error`, text: error || '' }),
  );
}

function drawForm() {
  const heading = el('h2', { id: 'book-title', text: 'Réserver une place' });
  const spots = spotsBadge(course, true);

  if (course.full) {
    bookBox.replaceChildren(
      heading,
      spots,
      el('p', { text: 'Toutes les places sont prises pour ce cours. Un autre créneau vous attend peut-être.' }),
      el('div', { class: 'actions' }, el('a', { class: 'btn', href: '/#planning', text: 'Voir les autres cours' })),
    );
    return;
  }

  const formError = el('p', { class: 'form-error', role: 'alert' });
  const form = el(
    'form',
    { novalidate: true },
    field('name', 'Votre nom', { type: 'text', autocomplete: 'name', maxlength: '80', value: memory.get('name') }),
    field('email', 'Votre e-mail', { type: 'email', autocomplete: 'email', inputmode: 'email', maxlength: '120', value: memory.get('email') }),
    formError,
    el('button', { class: 'btn', type: 'submit', text: 'Réserver ma place' }),
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit(form, formError);
  });
  bookBox.replaceChildren(
    heading,
    spots,
    form,
    el('p', { class: 'fine', text: 'Annulation gratuite à tout moment depuis « Mes réservations ».' }),
  );
}

function setFieldError(form, name, message) {
  const input = form.elements[name];
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  document.getElementById(`${name}-error`).textContent = message || '';
}

async function submit(form, formError) {
  const name = form.elements.name.value.trim();
  const email = form.elements.email.value.trim();
  formError.textContent = '';
  setFieldError(form, 'name', name.length < 2 ? 'Indiquez votre nom.' : '');
  setFieldError(form, 'email', !email ? 'Indiquez votre adresse e-mail.' : !EMAIL_RE.test(email) ? 'Cette adresse e-mail ne semble pas valide.' : '');
  const firstInvalid = form.querySelector('[aria-invalid="true"]');
  if (firstInvalid) return firstInvalid.focus();

  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Réservation en cours…';
  try {
    const booking = await api('/api/bookings', { method: 'POST', body: { classId: course.id, name, email } });
    memory.set('name', name);
    memory.set('email', email);
    course = { ...course, spotsLeft: booking.class.spotsLeft, full: booking.class.full };
    drawDone(booking);
  } catch (err) {
    button.disabled = false;
    button.textContent = 'Réserver ma place';
    if (err.field) {
      setFieldError(form, err.field, err.message);
      form.elements[err.field].focus();
    } else {
      formError.textContent = err.message;
    }
    if (err.status === 409) refreshSpots();
  }
}

async function refreshSpots() {
  try {
    const fresh = await api(`/api/classes/${encodeURIComponent(course.id)}`);
    course = { ...course, spotsLeft: fresh.spotsLeft, full: fresh.full };
    const current = bookBox.querySelector('.spots');
    if (current) current.replaceWith(spotsBadge(course, true));
  } catch {
    /* le message d’erreur déjà affiché suffit */
  }
}

function drawDone(booking) {
  const mark = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  mark.setAttribute('viewBox', '0 0 32 32');
  mark.setAttribute('class', 'done-mark');
  mark.setAttribute('aria-hidden', 'true');
  mark.innerHTML = '<circle cx="16" cy="16" r="14.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 16.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  const title = el('h2', { id: 'book-title', tabindex: '-1', text: 'Votre place est réservée' });
  bookBox.replaceChildren(
    mark,
    title,
    el('p', { text: `${booking.name}, rendez-vous ${booking.class.dayName.toLowerCase()} à ${booking.class.start}, ${booking.class.room}, avec ${booking.class.teacher.name}.` }),
    el('p', { class: 'fine', text: `Réservation enregistrée au nom de ${booking.email}. Il reste ${booking.class.spotsLeft} place${booking.class.spotsLeft > 1 ? 's' : ''}.` }),
    el(
      'div',
      { class: 'actions' },
      el('a', { class: 'btn', href: '/reservations.html', text: 'Mes réservations' }),
      el('a', { class: 'btn ghost', href: '/#planning', text: 'Autres cours' }),
    ),
  );
  title.focus();
}

boot();

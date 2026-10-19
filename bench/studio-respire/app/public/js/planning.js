import { api, el, spotsBadge, showError, initials, classUrl, DAYS, DAYS_SHORT } from './common.js';

const list = document.getElementById('planning-list');
const chipsBox = document.getElementById('day-chips');
const teamBox = document.getElementById('team-list');

let classes = [];
let selectedDay = 0;

async function boot() {
  list.setAttribute('aria-busy', 'true');
  list.replaceChildren(el('p', { class: 'loading', text: 'Chargement du planning…' }));
  try {
    const [loadedClasses, teachers] = await Promise.all([api('/api/classes'), api('/api/teachers')]);
    classes = loadedClasses;
    renderChips();
    renderList();
    renderTeam(teachers);
    list.removeAttribute('aria-busy');
  } catch (err) {
    showError(list, err.message, boot);
  }
}

function renderChips() {
  const days = [...new Set(classes.map((c) => c.day))].sort((a, b) => a - b);
  const chip = (value, label, full) =>
    el('button', {
      class: 'chip',
      type: 'button',
      'aria-pressed': String(selectedDay === value),
      'aria-label': full,
      text: label,
      onclick: () => {
        selectedDay = value;
        renderChips();
        renderList();
      },
    });
  chipsBox.replaceChildren(
    chip(0, 'Toute la semaine', 'Toute la semaine'),
    ...days.map((d) => chip(d, DAYS_SHORT[d], DAYS[d])),
  );
}

function slot(c) {
  return el(
    'li',
    {},
    el(
      'a',
      { class: 'slot', href: classUrl(c.id) },
      el('div', { class: 'slot-time' }, c.start, el('small', { text: `jusqu’à ${c.end}` })),
      el(
        'div',
        {},
        el('h4', { class: 'slot-title', text: c.title }),
        el('p', { class: 'slot-teacher', text: `avec ${c.teacher.name}` }),
      ),
      el(
        'div',
        { class: 'slot-meta' },
        el('span', { class: 'pill', text: c.level }),
        el('span', { class: 'dur', text: `${c.duration} min` }),
        spotsBadge(c),
      ),
      el('span', { class: 'go', 'aria-hidden': 'true', text: '→' }),
    ),
  );
}

function renderList() {
  const shown = classes.filter((c) => selectedDay === 0 || c.day === selectedDay);
  const days = [...new Set(shown.map((c) => c.day))].sort((a, b) => a - b);
  if (days.length === 0) {
    list.replaceChildren(el('p', { class: 'loading', text: 'Aucun cours ce jour-là.' }));
    return;
  }
  list.replaceChildren(
    ...days.map((d) =>
      el(
        'section',
        { class: 'day' },
        el('h3', { class: 'day-name', text: DAYS[d] }),
        el('ul', { class: 'slots' }, shown.filter((c) => c.day === d).map(slot)),
      ),
    ),
  );
}

function renderTeam(teachers) {
  teamBox.replaceChildren(
    ...teachers.map((t) => {
      const count = classes.filter((c) => c.teacher.id === t.id).length;
      return el(
        'article',
        { class: 'person' },
        el('div', { class: `mono tone-${t.tone}`, 'aria-hidden': 'true', text: initials(t.name) }),
        el('h3', { text: t.name }),
        el('p', { text: t.role }),
        el('div', { class: 'tags' }, t.specialties.map((s) => el('span', { class: 'pill', text: s }))),
        el('p', { class: 'count', text: `${count} cours par semaine` }),
      );
    }),
  );
}

boot();

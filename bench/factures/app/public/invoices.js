(async function () {
  const list = document.getElementById('list');
  const tabs = document.getElementById('tabs');
  const clientFilter = document.getElementById('client-filter');

  const params = new URLSearchParams(location.search);
  const clientId = params.get('client');
  const FILTERS = [
    ['all', 'Toutes'],
    ['draft', 'Brouillons'],
    ['sent', 'Envoyées'],
    ['late', 'En retard'],
    ['paid', 'Payées'],
  ];
  let active = FILTERS.some(([key]) => key === params.get('status')) ? params.get('status') : 'all';
  let invoices = [];

  try {
    invoices = await api('/invoices' + (clientId ? '?client=' + encodeURIComponent(clientId) : ''));
    if (clientId) {
      const client = await api('/clients/' + encodeURIComponent(clientId)).catch(() => null);
      if (client) {
        document.getElementById('sub').textContent = 'Les factures de ' + client.name + '.';
        clientFilter.append(el('p', { class: 'filter-note' },
          el('span', { text: client.name }),
          el('a', { href: '/factures' + (active !== 'all' ? '?status=' + active : ''), 'aria-label': 'Retirer le filtre sur ' + client.name, title: 'Retirer le filtre', text: '×' }),
        ));
      }
    }
  } catch (error) {
    showLoadError(list, error);
    return;
  }

  render();

  function render() {
    // Onglets
    tabs.replaceChildren(...FILTERS.map(([key, label]) => {
      const count = key === 'all' ? invoices.length : invoices.filter((i) => i.status === key).length;
      return el('button', {
        class: 'tab', type: 'button', 'aria-pressed': String(key === active),
        onclick: () => { active = key; syncUrl(); render(); },
      }, label, el('span', { class: 'count', text: String(count) }));
    }));

    const rows = active === 'all' ? invoices : invoices.filter((i) => i.status === active);
    if (!rows.length) {
      list.replaceChildren(el('p', { class: 'empty', text: 'Aucune facture ici pour le moment.' }));
      return;
    }

    const body = el('tbody');
    for (const invoice of rows) {
      const href = '/factures/' + encodeURIComponent(invoice.id);
      let note = null;
      if (invoice.status === 'late') note = el('span', { class: 'sub-line late-text', text: plural(invoice.daysLate, 'jour', 'jours') + ' de retard' });
      if (invoice.status === 'paid' && invoice.paidAt) note = el('span', { class: 'sub-line', text: 'réglée le ' + dateFr(invoice.paidAt) });
      const tr = el('tr', {},
        el('td', { class: 's-main' }, el('a', { class: 'row-link', href, text: invoice.id })),
        el('td', { class: 's-sub', text: invoice.clientName }),
        el('td', { class: 'hide-sm num', text: dateFr(invoice.issueDate) }),
        el('td', { class: 'hide-sm num' }, dateFr(invoice.dueDate), note),
        el('td', { class: 'right num s-amount', text: eur(invoice.total) }),
        el('td', { class: 'right s-status' }, pill(invoice.status)),
      );
      rowLink(tr, href);
      body.append(tr);
    }

    list.replaceChildren(el('div', { class: 'table-wrap' },
      el('table', { class: 'table-link stack' },
        el('thead', {}, el('tr', {},
          el('th', { text: 'Numéro' }),
          el('th', { text: 'Client' }),
          el('th', { text: 'Émise le' }),
          el('th', { text: 'Échéance' }),
          el('th', { class: 'right', text: 'Montant' }),
          el('th', { class: 'right', text: 'Statut' }),
        )),
        body)));
  }

  function syncUrl() {
    const next = new URLSearchParams();
    if (clientId) next.set('client', clientId);
    if (active !== 'all') next.set('status', active);
    const query = next.toString();
    history.replaceState(null, '', location.pathname + (query ? '?' + query : ''));
  }
})();

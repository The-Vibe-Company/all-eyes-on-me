(async function () {
  const cards = document.getElementById('cards');

  let clients;
  try {
    clients = await api('/clients');
  } catch (error) {
    showLoadError(cards, error);
    return;
  }

  if (!clients.length) {
    cards.replaceChildren(el('p', { class: 'empty', text: 'Aucun client pour le moment.' }));
    return;
  }

  document.getElementById('sub').textContent =
    plural(clients.length, 'client', 'clients') + ', pour qui vous travaillez et ce qu\'ils vous doivent.';

  cards.replaceChildren(...clients.map((c) => {
    const listUrl = '/factures?client=' + encodeURIComponent(c.id);
    return el('article', { class: 'client-card' },
      el('div', {},
        el('h2', { text: c.name }),
        el('p', { class: 'who', text: c.contact }),
      ),
      el('address', {},
        ...c.address.flatMap((line) => [line, el('br')]),
        el('a', { href: 'mailto:' + c.email, text: c.email }), el('br'),
        el('a', { href: 'tel:' + c.phone.replace(/\s/g, ''), text: c.phone }),
      ),
      el('dl', { class: 'client-stats' },
        el('div', {}, el('dt', { text: 'Facturé' }), el('dd', { class: 'num', text: eurShort(c.billed) })),
        el('div', {}, el('dt', { text: 'Reste à payer' }), el('dd', { class: 'num' + (c.lateCount ? ' late-text' : ''), text: eurShort(c.outstanding) })),
      ),
      el('div', { class: 'client-foot' },
        c.lateCount
          ? el('span', { class: 'pill pill-late', text: plural(c.lateCount, 'facture en retard', 'factures en retard') })
          : el('span', { text: plural(c.invoiceCount, 'facture', 'factures') }),
        el('a', { href: listUrl, text: 'Voir les factures' }),
      ),
    );
  }));
})();

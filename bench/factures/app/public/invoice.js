(async function () {
  const view = document.getElementById('view');
  const id = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');

  async function load() {
    return api('/invoices/' + encodeURIComponent(id));
  }

  let invoice;
  try {
    invoice = await load();
  } catch (error) {
    document.title = 'Facture introuvable · Factures';
    view.replaceChildren(
      el('div', { class: 'page-head' }, el('div', {}, el('h1', { text: 'Facture introuvable' }), el('p', { class: 'sub', text: error.message }))),
      el('a', { class: 'btn', href: '/factures', text: 'Voir toutes les factures' }),
    );
    return;
  }

  render(invoice);

  function render(inv) {
    document.title = `Facture ${inv.id} · Factures`;
    const f = inv.freelancer;
    const c = inv.client;

    // Actions
    const actions = el('div', { class: 'invoice-actions' });
    if (inv.status === 'sent' || inv.status === 'late') {
      actions.append(el('button', { class: 'btn btn-paid', type: 'button', onclick: (e) => act(e.currentTarget, 'pay', `Facture ${inv.id} marquée comme payée.`), text: 'Marquer comme payée' }));
    }
    if (inv.status === 'draft') {
      actions.append(el('button', { class: 'btn btn-primary', type: 'button', onclick: (e) => act(e.currentTarget, 'send', `Facture ${inv.id} marquée comme envoyée.`), text: 'Marquer comme envoyée' }));
    }
    actions.append(el('button', { class: 'btn', type: 'button', onclick: () => window.print(), text: 'Imprimer' }));

    // Lignes
    const body = el('tbody', {}, inv.lines.map((l) =>
      el('tr', {},
        el('td', { text: l.label }),
        el('td', { class: 'right num', text: String(l.quantity).replace('.', ',') }),
        el('td', { class: 'right num', text: eur(l.unitPrice) }),
        el('td', { class: 'right num', text: eur(l.quantity * l.unitPrice) }),
      )));

    const meta = el('dl', { class: 'meta' },
      el('dt', { text: 'Émise le' }), el('dd', { text: dateLongFr(inv.issueDate) }),
      el('dt', { text: 'Échéance' }), el('dd', { text: dateLongFr(inv.dueDate) }),
    );
    if (inv.status === 'paid' && inv.paidAt) meta.append(el('dt', { text: 'Payée le' }), el('dd', { text: dateLongFr(inv.paidAt) }));
    if (inv.status === 'late') meta.append(el('dt', { class: 'late-text', text: 'Retard' }), el('dd', { class: 'late-text', text: plural(inv.daysLate, 'jour', 'jours') }));

    const paid = inv.status === 'paid';

    view.replaceChildren(
      el('div', { class: 'page-head' },
        el('div', {},
          el('p', { class: 'eyebrow', text: 'Facture' }),
          el('h1', { class: 'num', text: inv.id }),
          el('p', { class: 'sub' }, pill(inv.status), '  ', 'pour ', el('a', { href: '/factures?client=' + encodeURIComponent(inv.clientId), text: inv.clientName })),
        ),
        actions,
      ),
      el('article', { class: 'invoice', 'aria-label': 'Facture ' + inv.id },
        paid ? el('div', { class: 'stamp', 'aria-hidden': 'true' }, 'Payée', el('small', { text: 'le ' + dateFr(inv.paidAt) })) : null,
        el('div', { class: 'invoice-top' },
          el('div', {}, el('h2', { text: 'Facture' }), el('p', { class: 'num', style: 'margin:6px 0 0;color:var(--muted)', text: 'N° ' + inv.id })),
          meta,
        ),
        el('div', { class: 'parties' },
          el('div', { class: 'party' },
            el('p', { class: 'eyebrow', text: 'De' }),
            el('p', { class: 'name', text: f.name }),
            el('address', {}, f.title, el('br'), ...f.address.flatMap((line) => [line, el('br')]), f.email, el('br'), 'SIRET ' + f.siret),
          ),
          el('div', { class: 'party' },
            el('p', { class: 'eyebrow', text: 'Pour' }),
            el('p', { class: 'name', text: c.name }),
            el('address', {}, 'À l\'attention de ' + c.contact, el('br'), ...c.address.flatMap((line) => [line, el('br')]), c.email),
          ),
        ),
        el('div', { class: 'table-wrap' },
          el('table', { class: 'invoice-lines' },
            el('thead', {}, el('tr', {},
              el('th', { text: 'Désignation' }),
              el('th', { class: 'right', text: 'Qté' }),
              el('th', { class: 'right', text: 'Prix unitaire' }),
              el('th', { class: 'right', text: 'Montant' }),
            )),
            body)),
        el('div', { class: 'invoice-total' },
          el('dl', {}, el('dt', { text: paid ? 'Total réglé' : 'Total à payer' }), el('dd', { class: 'num', text: eur(inv.total) }))),
        el('div', { class: 'invoice-foot' },
          el('span', { text: f.vatNote + '.' }),
          paid
            ? el('span', {}, el('strong', { text: 'Réglée' }), ' le ' + dateLongFr(inv.paidAt) + '. Merci !')
            : el('span', {}, el('strong', { text: 'Règlement par virement' }), ' avant le ' + dateLongFr(inv.dueDate) + ' · IBAN ' + f.iban),
        ),
      ),
    );
  }

  async function act(button, action, message) {
    button.disabled = true;
    try {
      await api('/invoices/' + encodeURIComponent(id) + '/' + action, { method: 'POST' });
      invoice = await load();
      render(invoice);
      toast(message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      button.disabled = false;
      toast(error.message);
    }
  }
})();

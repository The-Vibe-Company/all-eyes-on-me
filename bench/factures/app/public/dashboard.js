(async function () {
  const ledger = document.getElementById('ledger');
  const collect = document.getElementById('collect');
  const months = document.getElementById('months');

  let data;
  try {
    data = await api('/dashboard');
  } catch (error) {
    showLoadError(ledger, error);
    collect.replaceChildren();
    months.replaceChildren();
    return;
  }

  document.getElementById('today').textContent = dateLongFr(data.today);
  const monthLabel = monthName(data.month);

  // Les trois chiffres
  const nextDue = data.toCollect.find((i) => i.status === 'sent');
  ledger.replaceChildren(
    figure('Facturé en ' + monthLabel, data.billed.total, data.billed.count
      ? plural(data.billed.count, 'facture émise', 'factures émises') + ' ce mois-ci'
      : 'Aucune facture émise ce mois-ci'),
    figure('En attente de paiement', data.waiting.total, data.waiting.count
      ? plural(data.waiting.count, 'facture envoyée', 'factures envoyées') + (nextDue ? ', prochaine échéance le ' + dateFr(nextDue.dueDate) : '')
      : 'Rien n\'attend d\'être payé'),
    figure('En retard', data.late.total, data.late.count
      ? plural(data.late.count, 'facture', 'factures') + ', la plus ancienne depuis ' + plural(data.late.oldestDays, 'jour', 'jours')
      : 'Rien en retard', 'figure-late'),
  );

  // À encaisser
  if (!data.toCollect.length) {
    collect.replaceChildren(el('p', { class: 'empty', text: 'Tout est réglé. Rien à relancer.' }));
  } else {
    const body = el('tbody');
    for (const invoice of data.toCollect) {
      const href = '/factures/' + encodeURIComponent(invoice.id);
      const when = invoice.status === 'late'
        ? el('span', { class: 'sub-line late-text', text: plural(invoice.daysLate, 'jour', 'jours') + ' de retard' })
        : el('span', { class: 'sub-line', text: dueIn(data.today, invoice.dueDate) });
      const tr = el('tr', {},
        el('td', { class: 's-main' }, el('a', { class: 'row-link', href, text: invoice.id }), el('span', { class: 'sub-line', text: invoice.clientName })),
        el('td', { class: 's-sub' }, dateFr(invoice.dueDate), when),
        el('td', { class: 'right num s-amount', text: eur(invoice.total) }),
        el('td', { class: 'right s-status' }, pill(invoice.status)),
      );
      rowLink(tr, href);
      body.append(tr);
    }
    collect.replaceChildren(el('div', { class: 'table-wrap' },
      el('table', { class: 'table-link stack' },
        el('thead', {}, el('tr', {},
          el('th', { text: 'Facture' }),
          el('th', { text: 'Échéance' }),
          el('th', { class: 'right', text: 'Montant' }),
          el('th', { class: 'right', text: 'Statut' }),
        )),
        body)));
  }

  // Graphique
  const max = Math.max(...data.months.map((m) => m.billed), 1);
  const bars = el('div', { class: 'bars', role: 'img', 'aria-label': 'Montants facturés sur les six derniers mois' });
  const labels = el('div', { class: 'bar-labels', 'aria-hidden': 'true' });
  for (const m of data.months) {
    const current = m.month === data.month;
    bars.append(el('div', { class: 'bar' + (current ? ' current' : '') },
      el('span', { class: 'bar-value', text: m.billed ? eurCompact(m.billed) : '–' }),
      el('div', { class: 'bar-fill', style: `height:${Math.round((m.billed / max) * 130)}px`, title: `${monthName(m.month)} : ${eur(m.billed)}` }),
    ));
    labels.append(el('span', { class: current ? 'current' : '', text: monthName(m.month, 'short') }));
  }
  months.replaceChildren(
    bars,
    labels,
    el('div', { class: 'aside-line' }, el('span', { text: 'Encaissé en ' + monthLabel }), el('strong', { class: 'num', text: eurShort(data.paid.total) })),
    data.drafts
      ? el('div', { class: 'aside-line' }, el('span', { text: plural(data.drafts, 'brouillon', 'brouillons') + ' à terminer' }), el('a', { href: '/factures?status=draft', text: 'Voir' }))
      : null,
  );

  function figure(title, amount, note, extra) {
    return el('div', { class: 'figure' + (extra ? ' ' + extra : '') },
      el('h2', { text: title }),
      el('p', { class: 'amount num', text: eurShort(amount) }),
      el('p', { class: 'note', text: note }),
    );
  }

  function dueIn(today, due) {
    const days = Math.round((Date.parse(due + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
    if (days === 0) return "à régler aujourd'hui";
    return 'dans ' + plural(days, 'jour', 'jours');
  }
})();

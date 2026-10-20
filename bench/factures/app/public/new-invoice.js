(async function () {
  const form = document.getElementById('form');
  const clientSelect = document.getElementById('client');
  const issue = document.getElementById('issue');
  const due = document.getElementById('due');
  const linesBox = document.getElementById('lines');
  const totalBox = document.getElementById('total');
  const errorBox = document.getElementById('error');

  issue.value = localToday();
  due.value = addDaysIso(issue.value, 30);
  let dueTouched = false;
  due.addEventListener('input', () => { dueTouched = true; });
  issue.addEventListener('input', () => {
    if (!dueTouched && issue.value) due.value = addDaysIso(issue.value, 30);
  });

  try {
    const clients = await api('/clients');
    for (const c of clients) clientSelect.append(el('option', { value: c.id, text: c.name }));
    const wanted = new URLSearchParams(location.search).get('client');
    if (wanted && clients.some((c) => c.id === wanted)) clientSelect.value = wanted;
  } catch (error) {
    showError(error.message);
  }

  addLine();
  document.getElementById('add-line').addEventListener('click', () => addLine(true));

  function addLine(focus) {
    const label = el('input', { type: 'text', 'aria-label': 'Libellé', placeholder: 'Ex. Maquettes du site', maxlength: '200', autocomplete: 'off' });
    const qty = el('input', { type: 'number', 'aria-label': 'Quantité', value: '1', min: '0', step: 'any', inputmode: 'decimal' });
    const price = el('input', { type: 'number', 'aria-label': 'Prix unitaire en euros', placeholder: '0,00', min: '0', step: '0.01', inputmode: 'decimal' });
    const amount = el('div', { class: 'line-total', text: eur(0) });
    const remove = el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Supprimer la ligne', title: 'Supprimer la ligne', text: '×' });
    const row = el('div', { class: 'line-row' },
      el('div', { class: 'l-label' }, label), qty, price, amount, remove);
    row.compute = () => {
      const value = (Number(qty.value) || 0) * (Number(price.value) || 0);
      amount.textContent = eur(value);
      return value;
    };
    row.read = () => ({ label: label.value.trim(), quantity: qty.value, unitPrice: price.value });
    row.addEventListener('input', updateTotal);
    remove.addEventListener('click', () => {
      if (linesBox.children.length === 1) {
        label.value = ''; qty.value = '1'; price.value = '';
        label.focus();
      } else {
        row.remove();
      }
      updateTotal();
    });
    linesBox.append(row);
    updateTotal();
    if (focus) label.focus();
  }

  function updateTotal() {
    let total = 0;
    for (const row of linesBox.children) total += row.compute();
    totalBox.textContent = eur(total);
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
    errorBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    const status = event.submitter && event.submitter.value === 'draft' ? 'draft' : 'sent';

    if (!clientSelect.value) { clientSelect.focus(); return showError('Choisissez un client.'); }
    if (!issue.value) { issue.focus(); return showError("Indiquez la date d'émission."); }
    if (!due.value) { due.focus(); return showError("Indiquez l'échéance."); }
    if (due.value < issue.value) { due.focus(); return showError("L'échéance ne peut pas précéder la date d'émission."); }

    const lines = [...linesBox.children].map((row) => row.read()).filter((l) => l.label || l.unitPrice);
    if (!lines.length) { linesBox.querySelector('input').focus(); return showError('Ajoutez au moins une ligne.'); }
    for (const [index, l] of lines.entries()) {
      if (!l.label) return showError(`La ligne ${index + 1} n'a pas de libellé.`);
      if (!(Number(l.quantity) > 0)) return showError(`La quantité de la ligne ${index + 1} doit être supérieure à zéro.`);
      if (l.unitPrice === '' || !(Number(l.unitPrice) >= 0)) return showError(`Indiquez le prix unitaire de la ligne ${index + 1}.`);
    }

    const buttons = form.querySelectorAll('button[type="submit"]');
    buttons.forEach((b) => { b.disabled = true; });
    try {
      const invoice = await api('/invoices', {
        method: 'POST',
        body: {
          clientId: clientSelect.value,
          issueDate: issue.value,
          dueDate: due.value,
          status,
          lines: lines.map((l) => ({ label: l.label, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
        },
      });
      location.href = '/factures/' + encodeURIComponent(invoice.id);
    } catch (error) {
      buttons.forEach((b) => { b.disabled = false; });
      showError(error.message);
    }
  });
})();

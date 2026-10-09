// Terre & Tour : petits compléments dans le navigateur. Le site fonctionne sans.
(() => {
  document.documentElement.classList.add('js');
  const euro = (n) => `${n} €`;

  // Total en direct dans le formulaire de réservation.
  for (const form of document.querySelectorAll('form[data-price]')) {
    const price = Number(form.dataset.price);
    const seats = form.querySelector('select[name="seats"]');
    const total = form.querySelector('[data-total]');
    if (!seats || !total) continue;
    const update = () => { total.textContent = euro(price * Number(seats.value || 1)); };
    seats.addEventListener('change', update);
    update();
  }

  // Carte cadeau : champ « autre montant » et aperçu de la carte.
  const gift = document.querySelector('form[data-gift]');
  if (gift) {
    const custom = gift.querySelector('input[name="customAmount"]');
    const customField = custom.closest('.custom-amount');
    const recipient = gift.querySelector('input[name="recipientName"]');
    const message = gift.querySelector('textarea[name="message"]');
    const preview = {
      amount: document.querySelector('[data-preview-amount]'),
      name: document.querySelector('[data-preview-name]'),
      message: document.querySelector('[data-preview-message]'),
    };

    const chosen = () => gift.querySelector('input[name="amount"]:checked');
    const update = () => {
      const radio = chosen();
      const isOther = radio && radio.value === 'autre';
      customField.classList.toggle('is-visible', Boolean(isOther));
      custom.required = Boolean(isOther);
      const amount = !radio ? 0 : isOther ? Number(custom.value) : Number(radio.value);
      preview.amount.textContent = amount > 0 ? euro(amount) : '… €';
      preview.name.textContent = recipient.value.trim() || '…';
      preview.message.textContent = message.value.trim();
    };

    gift.addEventListener('change', (event) => {
      if (event.target.name === 'amount' && event.target.value === 'autre') {
        update();
        custom.focus();
        return;
      }
      update();
    });
    gift.addEventListener('input', update);
    update();
  }
})();

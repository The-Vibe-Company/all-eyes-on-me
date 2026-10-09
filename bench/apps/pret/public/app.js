// Petit confort sur le formulaire de réservation : la date de retour suit la
// date de début, et on affiche la durée choisie. Le serveur revérifie tout.
(() => {
  // Après une erreur, on amène la lecture sur le résumé des erreurs.
  const erreurs = document.getElementById('erreurs');
  if (erreurs) erreurs.focus();

  const debut = document.getElementById('debut');
  const fin = document.getElementById('fin');
  const affichage = document.querySelector('[data-duree-affichee]');
  if (!debut || !fin) return;

  const jours = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;
  const ajouter = (iso, n) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const dureeMax = Number(fin.dataset.dureeMax) || 7;

  function mettreAJour() {
    if (!debut.value) return;
    fin.min = debut.value;
    fin.max = ajouter(debut.value, dureeMax - 1);
    if (fin.value && fin.value < debut.value) fin.value = debut.value;
    if (affichage) {
      const n = fin.value ? jours(debut.value, fin.value) : 0;
      affichage.textContent = n > 0 ? `Vous avez choisi ${n} jour${n > 1 ? 's' : ''}.` : '';
    }
  }

  debut.addEventListener('change', mettreAJour);
  fin.addEventListener('change', mettreAJour);
  mettreAJour();
})();

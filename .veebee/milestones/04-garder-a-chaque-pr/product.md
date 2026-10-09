# Garder, à chaque PR

Le deuxième niveau d'All Eyes On Me. Un front a son standard (`.aeom/standard.md`, écrit par le jalon 03) : sa DA, ses tokens, les composants de son kit, ses règles. Une PR arrive, écrite par un humain ou par un agent : AEOM dit si les écrans qu'elle touche respectent ce standard, s'ils ont l'air du même produit, et si les parcours qu'elle traverse vont toujours au bout.

Le mesurable bloque : un check GitHub, sans modèle, refuse une couleur ou une police hors des tokens, un composant refait à la main alors que le kit l'a, un en-tête différent, un contrôle en échec, un parcours qui casse. Le jugement conseille : trois juges disent, en mots et en commentaire sur la PR, si les nouveaux écrans ont l'air du même produit, sans jamais bloquer. Aucune capture ne quitte la machine.

Une PR a le droit d'apporter une feature : le garde-fou la signale sans la bloquer. Et une PR qui change le standard exprès (un nouveau token, un nouveau composant) le dit, au lieu d'être refusée pour un écart.

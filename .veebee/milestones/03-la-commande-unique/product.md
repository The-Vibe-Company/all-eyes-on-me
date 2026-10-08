# La commande unique d'All Eyes On Me

Ce qu'Antoine veut d'AEOM, dit simplement : prendre un front et en faire un mieux. Corriger les erreurs d'UI et d'UX, et aller sur une DA novatrice, en lien avec le propos du produit.

Ce jalon en fait une seule commande. On lance `/aeom` sans option : AEOM comprend le produit (la fiche produit, les parcours), mesure chaque écran et rejoue chaque parcours. Si rien n'échoue, il dit « rien à refaire » et s'arrête. Sinon, il part par défaut sur une DA nouvelle, tirée de la fiche produit (à quoi sert l'app, pour qui, sa boucle principale), refait les pages dessus, puis les parcours, et le cliquet ne garde que ce qui est meilleur. Garder le style existant est l'option, pour un client qui a une charte.

Quand il garde quelque chose, le run rend la branche `aeom/<run>` et une PR sans captures qui suit les règles du dépôt (sauf avec `--sans-pr`). Chaque run, « rien à refaire » compris, rend une page de résultat sur la machine, jamais publiée, sur le modèle de la visionneuse d'évaluation de skill-creator : avant/après de chaque écran et parcours, ce qui est gardé ou renvoyé avec la raison, et au plus trois features manquantes, seulement quand un parcours clé ne peut pas aboutir sans elles. AEOM ne les code jamais. Sur cette page, Antoine dit « d'accord » ou « pas d'accord » à chaque verdict ; ses retours restent chez lui et donnent le taux d'accord d'AEOM avec son œil.

Pour savoir si AEOM progresse sans regarder chaque run, un petit banc : l'app de démo et deux apps faites par un agent sans AEOM, dont les défauts sont notés à la main. Il mesure les défauts trouvés et corrigés, les régressions, les features en douce, la stabilité sur trois passages et le coût, à titre d'information. L'autopilot le lance à chaque jalon.

Hors de ce jalon : le plafond de dépense, ce que les « pas d'accord » apprennent au juge (plus tard, quand il y en aura assez), une deuxième vraie app, et le packaging pour d'autres (npm, Codex, check en CI).

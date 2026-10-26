---
id: 06
title: AEOM génère les images qui servent, dans le style de la direction
milestone: 05-construire
depends_on: [05]
design: null
tracker: { tool: github, id: 148, url: https://github.com/The-Vibe-Company/all-eyes-on-me/issues/148 }
---

## Ce que l'utilisateur fait
Il lance `/aeom directions`, `/aeom redo` ou `/aeom build` comme avant. Là où une image sert (le hero d'une landing, une section, un état vide, un onboarding, un en-tête), AEOM la génère dans le style de la direction au lieu de la dessiner en CSS.

## Ce qu'il voit
Des maquettes et des écrans plus riches, chaque image tirée du monde du produit et dans le même style (gravure, risographie, aquarelle…), jamais un visuel générique. Sans clé d'API d'images, rien ne change : AEOM dessine en CSS et le dit une fois.

## C'est fini quand
- [ ] `aeom image "<prompt>" --out <fichier>` génère une image avec l'API d'images d'OpenAI ou d'Azure (gpt-image), avec la clé, l'URL et le modèle donnés dans l'environnement ou dans `~/.aeom/.env`. Il n'affiche jamais la clé
- [ ] `aeom image --check` dit si une clé est configurée, sans rien appeler
- [ ] Les maquettes de `/aeom directions` ont leurs images là où elles servent, une à trois, dans un style propre à chaque direction ; `aeom direction keep` les garde
- [ ] Le redo et le build portent ces images dans l'app (son dossier d'assets), et peuvent en générer d'autres là où elles servent, toujours dans le style de la direction
- [ ] Une image générée ne contient ni texte, ni logo, ni personne réelle, ni donnée réelle ; elle a un texte alternatif
- [ ] `aeom pr` laisse passer les images qu'AEOM a générées pour le front (listées dans le run), et refuse toujours toute capture et toute autre image

## Les règles
- « Je suis chaud d'avoir de la géné d'image aussi, pour les landings ça a du sens » ; partout où ça sert (Antoine, 26 octobre).
- Le générateur est une commande d'AEOM, pas un skill personnel (Antoine, 26 octobre).

## Hors ticket
- Les contrôles inspirés d'Elaya (rayons imbriqués, mot orphelin, animations, finitions, mots creux) : ticket suivant.
- La vidéo et le motion.

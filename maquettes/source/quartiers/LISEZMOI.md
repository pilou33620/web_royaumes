Sources de la maquette `maquettes/quartiers.html` (vie des quartiers : météo, saisons, jour et nuit sur les logements).

- `quartiers.js` : le bourg (plateau, rues), les relevés des bâtiments (fenêtres, portes, toits, cheminées), le décor de saison et de météo, les fenêtres allumées, les volets, les fumées, l'eau, le ciel de nuit, les personnages et le panneau « En ce moment ».
- `page.html` : la page (textes, boutons) ; le script y est inséré à la place de `/*SCRIPT*/`.
- `gen.py` : assemble la page autonome avec `web/js/rendu/toon.js` et `web/js/rendu/modeles.js` du jeu. modeles.js est repris tel quel, avec quelques relevés `EXC?.…` ajoutés à la volée (fenêtres, portes, toits) ; hors maquette ils ne font rien.
  Usage depuis ce dossier : `python3 gen.py ../../quartiers.html` (ajouter `<!doctype html>` n'est pas nécessaire : page.html le contient).
- `capture.cjs` : captures avec Playwright (`window.MAQ.regler({...})`, `MAQ.avancer(s)`), en réécrivant three vers une copie locale ; chemins du scratchpad à adapter.

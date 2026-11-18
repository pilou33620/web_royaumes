// ===================================================================== Vie des quartiers (maquette)
// Les logements du jeu (modeles.js, collé plus haut) animés selon la météo, la saison, l'heure et l'époque.
// Même façon de faire que vie.js : petits modèles en boîtes (unités de web_power) regroupés en InstancedMesh par modèle,
// pièces fixes figées en lots fusionnés, points lumineux additifs. Chaque animation a sa condition « quand » et son libellé,
// et le panneau « En ce moment » liste les libellés dont la condition est vraie.

// ------------------------------------------------------------------ scène
const toile = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas: toile, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1b211a);
scene.fog = new THREE.Fog(0xb8c0c4, 1000, 2000); // toujours présent : l'ajouter plus tard recompilerait tous les matériaux
const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 220); scene.add(cam);
const hemi = new THREE.HemisphereLight(0xeef7ff, 0x7d8466, 1.5); scene.add(hemi);
const soleil = new THREE.DirectionalLight(0xfff0d4, 2.6);
soleil.castShadow = true; Object.assign(soleil.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 50 });
soleil.shadow.mapSize.set(2048, 2048); soleil.shadow.bias = -0.0008; soleil.shadow.normalBias = 0.02;
scene.add(soleil, soleil.target);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const AXE_Y = V(0, 1, 0), UN = V(1, 1, 1);
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = V(), _p = V(), _v = V(), _w = V(), _col = new THREE.Color(), _e = new THREE.Euler();
const tache = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), d = g.createRadialGradient(32, 32, 0, 32, 32, 32); d.addColorStop(0, 'rgba(255,255,255,1)'); d.addColorStop(0.35, 'rgba(255,255,255,.6)'); d.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = d; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const ECH = 0.04, ECH_BAT = 0.1, DALLE = 0.025, EP = 0.022;
const VITRE = 0x3a4652, BOIS = 0x5b3a1e, PIERRE = 0xbcb6a8;

// ------------------------------------------------------------------ le bourg : six cases de logements autour de la mairie, la taverne et la boulangerie
const CARTE = ['FFPLPFF', 'FPcmPPF', 'PFbHpPP', 'PPtiqPL', 'LPPPPFF', 'FFLPPFF'];
const LETTRES = { F: 'foret', P: 'prairie', L: 'plaine', c: 'cabane', m: 'maison', b: 'boulangerie', H: 'hotel', p: 'maison_pierre', t: 'taverne', i: 'immeuble', q: 'hotel_particulier' };
const TERR = { prairie: { col: 0x84c450, h: 0 }, plaine: { col: 0xc9c65c, h: 0 }, foret: { col: 0x5d9b3a, h: 0.02 } };
const CASES = [];
CARTE.forEach((ligne, r) => [...ligne].forEach((l, c) => { const t = LETTRES[l], bati = !TERR[t]; CASES.push({ c, r, t: bati ? 'prairie' : t, cle: bati ? t : null, x: SQ3 * (c + 0.5 * (r & 1)), z: 1.5 * r, top: bati ? 0 : TERR[t].h }); }));
const BATS = CASES.filter(k => k.cle), centre = CASES.find(k => k.cle === 'hotel'), parCle = cle => BATS.find(k => k.cle === cle);
for (const k of BATS) { k.rot = (hache(k.c, k.r, 2) * 6 | 0) * Math.PI / 3; k.M = new THREE.Matrix4().compose(V(k.x, k.top, k.z), new THREE.Quaternion().setFromAxisAngle(AXE_Y, k.rot), V(ECH_BAT, ECH_BAT, ECH_BAT)); }
// coordonnées locales d'un bâtiment (unités de web_power) → monde, comme vie.js
const posB = (k, lx, lz) => ({ x: k.x + (lx * Math.cos(k.rot) + lz * Math.sin(k.rot)) * ECH_BAT, z: k.z + (-lx * Math.sin(k.rot) + lz * Math.cos(k.rot)) * ECH_BAT });
const capB = (k, dx, dz) => k.rot - Math.atan2(dz, dx); // cap d'un modèle (face à +x) qui regarde la direction locale (dx, dz)
const monde = (k, x, y, z) => V(x, y, z).applyMatrix4(k.M);
// les rues : les joints entre les dalles (le tour de la place et les six rues qui en partent)
const coin = (i, r = 1) => ({ x: centre.x + Math.sin(i * Math.PI / 3) * r, z: centre.z + Math.cos(i * Math.PI / 3) * r });
const RUES = [...[0, 1, 2, 3, 4, 5].map(i => [coin(i), coin(i + 1)]), ...[0, 1, 2, 3, 4, 5].map(i => [coin(i), coin(i, 2)])];

// ------------------------------------------------------------------ l'état réglé par les boutons
let EPOQUE = 'ancien', SAISON = 2, MOIS = 6, METEO = 'beau', HEURE = 'cycle';
let horloge = 288, pFixe = 0, tMeteo = 99, VENT = 0.25, t = 0, FLAQUE = 0;
const JOUR_S = 300, CREP_S = 30, NUIT_S = 60, AUBE_S = 30, CYCLE = JOUR_S + CREP_S + NUIT_S + AUBE_S; // les durées de meteo.js
const H = { j: 1, a: 0, n: 0, phase: 'jour', p: 0 };
const PLUVIEUX = () => ['pluie', 'orage', 'tempete'].includes(METEO);
const NEIGE_TOMBE = () => METEO === 'neige' || (SAISON === 0 && PLUVIEUX()); // comme meteo.js : l'hiver, la pluie tombe en neige
const PLUIE = () => PLUVIEUX() && !NEIGE_TOMBE();
const NEIGE_SOL = () => SAISON === 0 || METEO === 'neige';
const SEC = () => !PLUVIEUX() && METEO !== 'neige';
const DOUX = () => ['beau', 'nuageux'].includes(METEO);
const CLAIR = () => ({ beau: 1, canicule: 1, nuageux: 0.45 })[METEO] || 0;
const JOUR = () => H.phase === 'jour', SOIR = () => H.phase === 'crepuscule', NUIT = () => H.phase === 'nuit', AUBE = () => H.phase === 'aube';
const DEHORS = () => JOUR() || (AUBE() && H.p > 12) || (SOIR() && H.p < 14); // les heures où l'on est dehors
const NOMS_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const SAISON_MOIS = m => [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 0][m];
// la phase de la lune suit le mois du tour (0 nouvelle, 0,5 pleine) : huit phases sur l'année, pleine lune en janvier et en septembre
const PHASE_LUNE = m => ((m + 4) % 8) / 8;
const NOM_PHASE = f => ['nouvelle lune', 'premier croissant', 'premier quartier', 'lune gibbeuse croissante', 'pleine lune', 'lune gibbeuse décroissante', 'dernier quartier', 'dernier croissant'][Math.round(f * 8) % 8];

function majHeure(dt) {
  if (HEURE === 'cycle') {
    // lecture accélérée : le jour dix fois plus vite, le soir, la nuit et l'aube trois fois (environ 70 s pour le cycle complet)
    horloge = (horloge + dt * (horloge < JOUR_S ? 10 : 3)) % CYCLE;
    const p = horloge;
    if (p < JOUR_S) Object.assign(H, { j: 1, a: 0, n: 0, phase: 'jour', p });
    else if (p < JOUR_S + CREP_S) { const u = (p - JOUR_S) / CREP_S; Object.assign(H, { j: Math.max(0, 1 - 2 * u), a: 1 - Math.abs(2 * u - 1), n: Math.max(0, 2 * u - 1), phase: 'crepuscule', p: p - JOUR_S }); }
    else if (p < JOUR_S + CREP_S + NUIT_S) Object.assign(H, { j: 0, a: 0, n: 1, phase: 'nuit', p: p - JOUR_S - CREP_S });
    else { const u = (p - JOUR_S - CREP_S - NUIT_S) / AUBE_S; Object.assign(H, { j: Math.max(0, 2 * u - 1), a: 1 - Math.abs(2 * u - 1), n: Math.max(0, 1 - 2 * u), phase: 'aube', p: p - JOUR_S - CREP_S - NUIT_S }); }
  } else {
    pFixe += dt;
    const w = { jour: [1, 0, 0], aube: [0, 1, 0], crepuscule: [0, 1, 0], nuit: [0, 0, 1] }[HEURE];
    Object.assign(H, { j: w[0], a: w[1], n: w[2], phase: HEURE, p: pFixe });
  }
}

// ------------------------------------------------------------------ lumière (couleurs de meteo.js, plus un crépuscule plus rosé que l'aube)
const LUMIERE = {
  jour: { sol: 0xfff0d4, sI: 2.6, hemi: 0xeef7ff, hI: 1.5, fond: 0x1b211a, el: 1 },
  aube: { sol: 0xff9f5a, sI: 1.9, hemi: 0xd8d4e8, hI: 1.15, fond: 0x3b2717, el: 0.25 },
  crep: { sol: 0xff7f6a, sI: 1.75, hemi: 0xcdbde0, hI: 1.1, fond: 0x2c1b2a, el: 0.22 },
  nuit: { sol: 0x8ea6ff, sI: 0.6, hemi: 0x7484b4, hI: 0.95, fond: 0x090d1a, el: 0.6 },
};
for (const L of Object.values(LUMIERE)) for (const c of ['sol', 'hemi', 'fond']) L[c] = new THREE.Color(L[c]);
const SOMBRE = { beau: 1, nuageux: 0.8, pluie: 0.55, orage: 0.42, brouillard: 0.6, tempete: 0.45, neige: 0.7, canicule: 1 };
const CIEL = { hI: 1.5, fond: new THREE.Color(), el: 1, eclair: 0, tEclair: 3 };
const GRIS = new THREE.Color(0x3a4248), BRUME = new THREE.Color(0x9aa2a6);
function majLumiere() {
  const J = LUMIERE.jour, A = SOIR() ? LUMIERE.crep : LUMIERE.aube, N = LUMIERE.nuit, { j, a, n } = H, s = SOMBRE[METEO];
  const mix = (c, cible) => cible.setRGB(J[c].r * j + A[c].r * a + N[c].r * n, J[c].g * j + A[c].g * a + N[c].g * n, J[c].b * j + A[c].b * a + N[c].b * n);
  soleil.intensity = (J.sI * j + A.sI * a + N.sI * n) * s;
  CIEL.hI = (J.hI * j + A.hI * a + N.hI * n) * (0.75 + 0.25 * s);
  mix('sol', soleil.color); mix('hemi', hemi.color); mix('fond', CIEL.fond);
  if (METEO === 'canicule') soleil.color.lerp(_col.setHex(0xffd9a0), 0.5 * j);
  const clarte = j + a * 0.7 + n * 0.25;
  if (s < 0.9) CIEL.fond.lerp(GRIS, (1 - s) * 0.6 * clarte);
  if (METEO === 'brouillard') CIEL.fond.lerp(_col.copy(BRUME).multiplyScalar(clarte), 0.85);
  CIEL.el = [0.35, 0.75, 1, 0.6][SAISON] * (J.el * j + A.el * a + N.el * n);
}

// ------------------------------------------------------------------ plateau d'hexagones (comme la maquette rendu-power), rues entre les dalles
let PLATEAU = null;
const TEINTES = [0xe2e9f2, 0xf0fbe8, 0xfff4d8, 0xffd8a8]; // hiver, printemps, été, automne
function ruban(a, b, larg, y) {
  const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz), px = -dz / l * larg, pz = dx / l * larg;
  const pos = [a.x + px, y, a.z + pz, b.x + px, y, b.z + pz, a.x - px, y, a.z - pz, a.x - px, y, a.z - pz, b.x + px, y, b.z + pz, b.x - px, y, b.z - pz];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3)); return g;
}
function construirePlateau() {
  jeter(PLATEAU); PLATEAU = new THREE.Group(); scene.add(PLATEAU);
  const T = lot(), D = lot(), teinte = new THREE.Color(TEINTES[SAISON]), blanc = NEIGE_SOL(), BL = new THREE.Color(0xf4f7fb);
  let gr = 1; const rnd = () => hache(gr++, 5, 17);
  for (const k of CASES) {
    const d = TERR[k.t], bas = -1, h = k.top - bas, g = cyl(0.965, 1, h, 6).toNonIndexed(); g.translate(k.x, bas + h / 2, k.z);
    const c = new THREE.Color(d.col).offsetHSL((hache(k.c, k.r, 1) - 0.5) * 0.015, 0, (hache(k.c, k.r, 2) - 0.5) * 0.05).multiply(teinte);
    if (blanc) c.lerp(BL, 0.55);
    const nn = g.attributes.normal, a = new Float32Array(nn.count * 3);
    for (let i = 0; i < nn.count; i++) { const f = nn.getY(i) > 0.5 ? 1 : 0.62; a.set([c.r * f, c.g * f, c.b * f], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); T.g.push(g);
    if (k.cle) continue;
    const y = k.top, rr = () => { const an = rnd() * Math.PI * 2, l = Math.sqrt(rnd()) * 0.62; return [k.x + Math.cos(an) * l, k.z + Math.sin(an) * l]; }, s0 = 0.11;
    if (k.t === 'foret') for (let i = 0, nb = 5 + (rnd() * 3 | 0); i < nb; i++) {
      const [x, z] = rr(), s = (0.8 + rnd() * 0.45) * s0;
      const vert = SAISON === 3 ? [0xd9822b, 0xc9a13a, 0xb5562a] : SAISON === 0 ? [0x8a8f7a, 0x9aa08a, 0x7f846f] : [0x5fae3e, 0x74b83f, 0x4f9a37];
      put(D, cyl(0.3 * s, 0.4 * s, 1.4 * s, 5), 0x7a5233, x, y + 0.7 * s, z, 0, EP);
      if (rnd() < 0.55) { put(D, cone(1.9 * s, 3 * s, 6), blanc ? 0x5f7f5a : 0x3e7f34, x, y + 2.6 * s, z, 0, EP); put(D, cone(1.4 * s, 2.4 * s, 6), blanc ? 0xf4f6f8 : 0x4c9440, x, y + 4 * s, z, 0, EP); }
      else put(D, sphere(1.9 * s, 0), vert[rnd() * 3 | 0], x, y + 2.9 * s, z, 0, EP);
    }
    if (k.t === 'plaine') {
      const an = (hache(k.c, k.r, 7) * 3 | 0) * Math.PI / 3, ca = Math.cos(an), sa = Math.sin(an);
      const C = blanc ? [0xeef2f6, 0xe4eaef] : SAISON === 0 ? [0xa08a5a, 0x8f7a4f] : SAISON === 1 ? [0x9fd35a, 0x86c24a, 0xb5d86a] : SAISON === 3 ? [0xc9a35a, 0xa8803f, 0x9b7d4a] : [0xe3c75b, 0xd6b24a, 0xa9c457, 0xc9b24a];
      for (let b = -1; b <= 1; b++) for (const cote of [-1, 1]) { const lx = cote * 0.25, lz = b * 0.28; put(D, boite(0.46, 0.03, 0.24), C[hache(k.c * 7 + b, k.r * 5 + cote, 9) * C.length | 0], k.x + lx * ca + lz * sa, y + 0.015, k.z - lx * sa + lz * ca, an, 0); }
    }
    if (k.t === 'prairie' && rnd() < 0.6) { const [x, z] = rr(); put(D, sphere(s0, 0), blanc ? 0xdfe6dc : 0x5fa83c, x, y + 0.7 * s0, z, 0, EP); }
  }
  // l'arbre du hibou, à la lisière du bois, près de la boulangerie
  const kb = parCle('boulangerie'), kf = CASES.find(k => k.c === kb.c - 1 && k.r === kb.r);
  ARBRE_HIBOU.set(kf.x + (kb.x - kf.x) * 0.36, 0, kf.z + 0.18);
  { const [x, z] = [ARBRE_HIBOU.x, ARBRE_HIBOU.z], y = kf.top; put(D, cyl(0.022, 0.03, 0.34, 6), 0x6a4a2e, x, y + 0.17, z, 0, EP); put(D, boite(0.13, 0.016, 0.016), 0x6a4a2e, x + 0.06, y + 0.2, z, 0, 0.008); put(D, sphere(0.12, 0), SAISON === 3 ? 0xc9a13a : blanc ? 0x9aa08a : 0x4f9a37, x - 0.02, y + 0.38, z, 0, EP); }
  // rues de l'époque : terre, puis pavés (Empire), puis chaussée empierrée (Industrie) ; blanchies l'hiver avant l'industrie
  const ROUTE = { ancien: 0xc9a874, lumieres: 0xc9a874, empire: 0xb9b2a2, industrie: 0x8a867e }[EPOQUE];
  for (const [a, b] of RUES) put(D, ruban(a, b, 0.075, 0.012), blanc && EPOQUE !== 'industrie' ? 0xe3e6e2 : ROUTE, 0, 0, 0, 0, 0);
  fige(T, PLATEAU); fige(D, PLATEAU);
}
const ARBRE_HIBOU = V();

// ------------------------------------------------------------------ bâtiments du jeu, relevés et décor de saison / de météo
// Les fenêtres, portes, toits et cheminées relevés dans modeles.js deviennent des « cadres » (Matrix4 local → monde) :
// origine au centre de la pièce, +z vers l'extérieur, unités de web_power.
let BATIS = null;
const DRAPS = [], FEN = [], PORTES = [], TOITS = [], CHEM = [], LAMPES = [], LANTERNES = [], RUISS = [], FLAQUES_POS = [], TABLES = [];
const cadre = (k, x, y, z, ry) => new THREE.Matrix4().multiplyMatrices(k.M, _m.compose(_p.set(x, y, z), _q.setFromAxisAngle(AXE_Y, ry), UN));
const dansCadre = (M, x, y, z) => V(x, y, z).applyMatrix4(M);
// un point d'une pièce relevée, dans les coordonnées locales du bâtiment (pour y poser du décor avec put)
const surPiece = (r, lx, ly, lz) => [r.x + lx * Math.cos(r.ry) + lz * Math.sin(r.ry), (r.y || 0) + ly, r.z - lx * Math.sin(r.ry) + lz * Math.cos(r.ry)];
function prisme(L, w, d, h, col, x, y, z, ry, ep) { const p = cyl(1, 1, d, 3); p.rotateX(Math.PI / 2); p.rotateZ(Math.PI); p.scale(w / SQ3, h / 1.5, 1); p.translate(0, h / 6, 0); put(L, p, col, x, y + h / 6, z, ry, ep); }
function versMonde(Ls, M, Ld) { for (const g of Ls.g) Ld.g.push(g.applyMatrix4(M)); for (const o of Ls.o) Ld.o.push(o.applyMatrix4(M)); }
const CHAUME = [0xc9a14f, 0xb8903f];
const ROND = (n, r = 6.2) => { const a = 0.4 + Math.PI / 4 + n * Math.PI / 2; return [Math.cos(a) * r, Math.sin(a) * r]; }; // places libres entre les chaumières

function construireBatiments() {
  jeter(BATIS); BATIS = new THREE.Group(); scene.add(BATIS);
  for (const l of [FEN, PORTES, TOITS, CHEM, LAMPES, LANTERNES, RUISS, FLAQUES_POS, TABLES, DRAPS]) l.length = 0;
  const TOUT = lot(), neige = NEIGE_SOL();
  let id = 0;
  for (const k of BATS) {
    const { L, ex, E } = MOD.construire(k.cle, EPOQUE, SAISON, neige);
    const Dl = lot(); // décor de la maquette, en coordonnées locales du bâtiment
    if (neige) for (const g of L.g) { g.computeBoundingBox(); if (g.boundingBox.max.y > 0.3) continue; const c = g.attributes.color; for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * 0.35 + 0.62, c.getY(i) * 0.35 + 0.635, c.getZ(i) * 0.35 + 0.65); } // la neige tient aussi sur les dalles
    // ---- la mairie : une porte, des fenêtres (le modèle du jeu n'en a pas), une guirlande l'hiver, les lanternes de la place selon l'époque
    if (k.cle === 'hotel') {
      const hm = 2.8 * E.h, rangs = E.h >= 1.5 ? 2 : 1;
      put(Dl, boite(0.9, 1.4, 0.08), BOIS, 0, 0.95, 1.64, 0, 0); ex.portes.push({ x: 0, z: 1.62, ry: 0, w: 0.9, h: 1.4 });
      for (const f of [1, -1]) for (let e = 0; e < rangs; e++) for (const x of f > 0 ? [-1.35, 1.35] : [-1.35, 0, 1.35]) {
        const y = 0.25 + hm * (e + 0.6) / rangs; put(Dl, boite(0.55, 0.7, 0.08), VITRE, x, y, f * 1.62, 0, 0);
        ex.fen.push({ x, y, z: f * 1.62, ry: f > 0 ? 0 : Math.PI, w: 0.55, h: 0.7, volet: E.volets ? 0x4a6a7a : 0 });
      }
      if (SAISON === 0) for (let i = 0; i <= 12; i++) { const u = i / 12, x = -2 + 4 * u, y = hm + 0.05 - Math.sin(u * Math.PI * 3 % Math.PI) * 0.35; put(Dl, sphere(0.16, 0), i % 3 ? 0x2f6a34 : 0xd9322a, x, y, 1.7, 0, 0); }
      const pl = [[-3.2, 2.4], [3.2, 2.2], [3.4, -2.4], [-3.4, -2.2]];
      pl.forEach(([x, z], i) => {
        let hy = 2.8;
        if (EPOQUE === 'ancien') { put(Dl, boite(0.15, 2.4, 0.15), BOIS, x, 1.2, z, 0, 0.06); put(Dl, boite(0.8, 0.1, 0.1), BOIS, x + 0.35, 2.35, z, 0, 0); put(Dl, boite(0.32, 0.42, 0.32), 0xffd08a, x + 0.65, 1.95, z, 0, 0.05); put(Dl, cone(0.28, 0.25, 4), 0x3a2a20, x + 0.65, 2.27, z, Math.PI / 4, 0); hy = 1.95; LAMPES.push({ p: monde(k, x + 0.65, hy, z), i }); return; }
        if (EPOQUE !== 'industrie') { put(Dl, boite(0.14, 2.7, 0.14), 0x2b2b30, x, 1.35, z, 0, 0.06); put(Dl, boite(0.75, 0.08, 0.08), 0x2b2b30, x + 0.33, 2.7, z, 0, 0); put(Dl, boite(0.4, 0.45, 0.4), 0xffe2a0, x + 0.62, 2.3, z, 0, 0.05); put(Dl, cone(0.34, 0.3, 4), 0x2b2b30, x + 0.62, 2.68, z, Math.PI / 4, 0); hy = 2.3; LAMPES.push({ p: monde(k, x + 0.62, hy, z), i }); return; }
        LAMPES.push({ p: monde(k, x, hy, z), i }); // les réverbères à gaz du modèle du jeu
      });
    }
    // ---- relevés → cadres
    for (const f of ex.fen) {
      const m = cadre(k, f.x, f.y, f.z, f.ry), i = id++;
      FEN.push({ k, m, w: f.w, h: f.h, volet: f.volet, chaume: CHAUME.includes(f.toitC), c: V().setFromMatrixPosition(m), n: V(m.elements[8], m.elements[9], m.elements[10]).normalize(), rang: hache(i, 1, 5), r2: hache(i, 2, 5), r3: hache(i, 3, 5), rideau: [0xb8453a, 0xd9a43a, 0x5c7a4a, 0xe8d8b0, 0x7a4a7a][i % 5], lum: 0, o: 1, i, rec: f });
    }
    for (const p of ex.portes) PORTES.push({ k, m: cadre(k, p.x, 0, p.z, p.ry), w: p.w, h: p.h, i: PORTES.length, rec: p });
    for (const r of ex.toits) if (r.w < 9) TOITS.push({ k, m: cadre(k, r.x, r.y, r.z, r.ry), ...r, petit: r.w < 3.4 && r.d < 3.4 });
    for (const a of ex.drap) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.13, 6, 1).translate(0.11, 0, 0), toon(0x2f5fa8, { side: THREE.DoubleSide })); f.position.copy(monde(k, a[0], a[1], a[2])); BATIS.add(f); DRAPS.push(f); }
    for (const a of ex.fum) CHEM.push({ k, pos: monde(k, a[0], a[1], a[2]), noire: a[3] === true, four: a[3] === 'fumee', rang: hache(CHEM.length, 7, 3), prochain: hache(CHEM.length, 8, 3) });
    // ---- décor de la saison et de la météo (figé avec le bâtiment ; tout est reconstruit quand la saison ou la météo change)
    for (const r of ex.toits) {
      if (r.w >= 9) continue;
      if (neige) prisme(Dl, r.w + 0.14, r.d - 0.06, r.h + 0.04, 0xf4f7fb, r.x, r.y + 0.07, r.z, r.ry, 0.12); // toits blanchis
      if (neige && r.w < 6) for (const sx of [-1, 1]) for (let n = 0; n < 4; n++) { const lz = (n / 3 - 0.5) * r.d * 0.8, lg = 0.22 + hache(r.x * 9, n, sx + 2) * 0.35, [x, y, z] = surPiece(r, sx * r.w / 2 * 0.98, -lg / 2, lz); put(Dl, cone(0.06, lg, 4).rotateX(Math.PI), 0xd8f0ff, x, y, z, 0, 0); } // stalactites
      if ((SAISON === 1 || SAISON === 2) && r.w < 3.4 && hache(r.x * 7, r.z * 3, 11) < 0.45) { const [x, y, z] = surPiece(r, r.w / 2 * 0.8, -0.12, r.d / 2 * 0.85); put(Dl, sphere(0.16, 0).scale(1, 0.8, 1), 0x7a5a3a, x, y, z, 0, 0.05); } // nid d'hirondelles
      if (PLUIE()) for (const sz of [1, -1]) { const [x, y, z] = surPiece(r, r.w / 2 * 0.95, 0, sz * r.d / 2 * 0.9); RUISS.push({ a: monde(k, x, y, z), b: monde(k, x, 0.25, z), ph: hache(RUISS.length, 3, 9) }); } // l'eau dégouline des avant-toits
      if (PLUIE() && CHAUME.includes(r.col) && r.w < 3.4) { const [x, , z] = surPiece(r, -r.w / 2 * 0.95, 0, r.d / 2 * 0.9); put(Dl, cyl(0.24, 0.18, 0.36, 8), 0x8a6a4a, x, 0.43, z, 0, 0.06); put(Dl, cyl(0.2, 0.2, 0.02, 8), 0x5fa8d8, x, 0.57, z, 0, 0); RUISS.push({ a: monde(k, x, r.y, z), b: monde(k, x, 0.6, z), ph: 0.3, seau: true }); } // seau sous la fuite de la chaumière
    }
    for (const f of ex.fen) {
      const fr = f;
      if ((SAISON === 1 || SAISON === 2) && hache(f.x * 13, f.z * 7, 21) < 0.6) { // jardinières
        const [x, y, z] = surPiece(fr, 0, -f.h / 2 - 0.1, 0.16); put(Dl, boite(f.w * 1.15, 0.14, 0.2), 0x8a5a34, x, y, z, f.ry, 0.04);
        const C = SAISON === 1 ? [0xff7ab8, 0xffd34d, 0xf6f2ea, 0xb57bff] : [0xd9322a, 0xe8463a, 0xff6a5a];
        for (let n = 0; n < 4; n++) { const [fx, fy, fz] = surPiece(fr, (n / 3 - 0.5) * f.w, -f.h / 2 + 0.02, 0.16); put(Dl, sphere(0.075, 0), C[(n + (f.x * 3 | 0)) % C.length], fx, fy, fz, 0, 0); put(Dl, sphere(0.06, 0), 0x3f8a34, fx + 0.03, fy - 0.04, fz, 0, 0); }
      }
      if (SAISON === 3 && hache(f.x * 5, f.z * 11, 22) < 0.3) { // pots de confiture sur le rebord
        const [x, y, z] = surPiece(fr, 0, -f.h / 2 - 0.02, 0.1); put(Dl, boite(f.w * 1.1, 0.04, 0.14), BOIS, x, y, z, f.ry, 0);
        for (let n = 0; n < 3; n++) { const [jx, jy, jz] = surPiece(fr, (n - 1) * f.w * 0.3, -f.h / 2 + 0.05, 0.1); put(Dl, cyl(0.045, 0.045, 0.09, 6), [0xa02a3a, 0x6a2a5a, 0xe07a2a][n], jx, jy, jz, 0, 0); }
      }
    }
    for (const p of ex.portes) {
      const pr = { ...p, y: 0.25 }, hp = hache(p.x * 7, p.z * 5, 23);
      if (k.cle === 'taverne' || k.cle === 'boulangerie' || hp < 0.45) { const [x, y, z] = surPiece(pr, p.w / 2 + 0.2, p.h + 0.05, 0.16); put(Dl, boite(0.06, 0.06, 0.25), 0x2b2b30, x, y + 0.2, z, p.ry, 0); put(Dl, boite(0.16, 0.22, 0.16), 0xffe0a0, x, y, z, p.ry, 0.03); LANTERNES.push({ p: monde(k, x, y, z), k, r: hp }); }
      if (SAISON === 0 && hp < 0.75) { const [x, y, z] = surPiece(pr, 0, p.h * 0.62, 0.06); put(Dl, new THREE.TorusGeometry(p.w * 0.28, 0.045, 4, 10), 0x2f6a34, x, y, z, p.ry, 0.02); put(Dl, boite(0.1, 0.12, 0.04), 0xd9322a, x, y - p.w * 0.26, z, p.ry, 0); } // couronne de houx
      if (SAISON === 3 && hp > 0.35) for (let n = 0; n < (hp > 0.7 ? 2 : 1); n++) { const [x, y, z] = surPiece(pr, p.w / 2 + 0.25 + n * 0.32, 0.12, 0.3 + n * 0.1); put(Dl, sphere(0.17 - n * 0.04, 1).scale(1, 0.72, 1), 0xe07a1a, x, y, z, 0, 0.04); put(Dl, boite(0.03, 0.08, 0.03), 0x4a6a2a, x, y + 0.13, z, 0, 0); } // citrouilles
      if (hp < 0.6) FLAQUES_POS.push(dansCadre(cadre(k, p.x, 0.26, p.z, p.ry), 0.3, 0, 0.9 + hp));
    }
    // ---- les places libres de chaque case (coordonnées locales de web_power)
    if (k.cle === 'cabane') {
      const [px, pz] = ROND(0), a0 = 0.4 + Math.PI / 4;
      if (SAISON !== 0 && !neige) { // potager : terre, puis pousses, puis légumes mûrs, puis citrouilles
        put(Dl, boite(2.6, 0.12, 1.5), 0x6a4a2e, px, 0.3, pz, -a0 + Math.PI / 2, 0.05);
        for (let rg = 0; rg < 3; rg++) for (let n = 0; n < 4; n++) { const lx = (n / 3 - 0.5) * 2.1, lz = (rg - 1) * 0.45, x = px + lx * Math.cos(-a0 + Math.PI / 2) + lz * Math.sin(-a0 + Math.PI / 2), z = pz - lx * Math.sin(-a0 + Math.PI / 2) + lz * Math.cos(-a0 + Math.PI / 2);
          if (SAISON === 1) put(Dl, cone(0.1, 0.22, 4), 0x9fd35a, x, 0.47, z, 0, 0);
          else if (SAISON === 2) { put(Dl, sphere(0.22, 0), rg === 1 ? 0x7fbf5a : 0x3f8a34, x, 0.52, z, 0, 0.04); if (rg !== 1) put(Dl, sphere(0.08, 0), 0xd9322a, x + 0.12, 0.6, z, 0, 0); }
          else if (n % 2 === 0) put(Dl, sphere(0.2, 1).scale(1, 0.7, 1), 0xe07a1a, x, 0.48, z, 0, 0.04);
        }
      }
      const [bx, bz] = ROND(1); // bois de chauffage : grand tas à l'automne, entamé l'hiver
      const nb = SAISON === 3 ? 7 : SAISON === 0 ? 3 : 4;
      for (let i = 0; i < nb; i++) { const b = cyl(0.19, 0.19, 1.3, 7); b.rotateZ(Math.PI / 2); put(Dl, b, i % 2 ? 0xa0703f : 0xb07a45, bx, 0.44 + Math.floor(i / 3) * 0.36, bz + ((i % 3) - 1) * 0.4 + (Math.floor(i / 3) % 2) * 0.2, 0, 0.07); }
      put(Dl, cyl(0.45, 0.5, 0.5, 8), 0xb98a55, bx + 1.4, 0.5, bz + 0.6, 0, 0.06); // billot
      const [tx, tz] = ROND(2);
      if (SAISON === 2) TABLES.push({ k, x: tx, z: tz, ry: -(a0 + Math.PI) });
      if (neige) { put(Dl, sphere(0.5, 1), 0xf6f8fb, tx, 0.7, tz, 0, 0.04); put(Dl, sphere(0.36, 1), 0xf6f8fb, tx, 1.35, tz, 0, 0.04); put(Dl, sphere(0.26, 1), 0xf6f8fb, tx, 1.82, tz, 0, 0.04); put(Dl, cyl(0.18, 0.2, 0.3, 8), 0x1f1f1f, tx, 2.2, tz, 0, 0.03); put(Dl, cone(0.05, 0.25, 5).rotateZ(-Math.PI / 2), 0xf08a30, tx + 0.3, 1.85, tz, 0, 0); }
      const [lx, lz] = ROND(3), ta = 0.4 + Math.PI / 4 + 3 * Math.PI / 2 + Math.PI / 2; // corde à linge, posée en travers
      for (const o of [-1.4, 1.4]) put(Dl, boite(0.12, 2.2, 0.12), BOIS, lx + Math.cos(ta) * o, 1.35, lz + Math.sin(ta) * o, 0, 0.05);
      put(Dl, boite(2.8, 0.03, 0.03), 0xe9e2d0, lx, 2.35, lz, -ta, 0);
      LINGE.k = k; LINGE.x = lx; LINGE.z = lz; LINGE.cap = -ta;
    }
    if (k.cle === 'hotel_particulier' && SAISON === 2) TABLES.push({ k, x: 0, z: 0.3, ry: 0 });
    if (k.cle === 'maison_pierre' && SAISON === 3) put(Dl, sphere(0.9, 1).scale(1, 0.45, 1), 0xd9822b, 2.6, 0.3, 1.0, 0, 0.05); // le tas de feuilles ratissées
    for (const T of TABLES.filter(x => x.k === k)) { // table dressée dehors l'été
      const tb = { x: T.x, y: 0.25, z: T.z, ry: T.ry }, at = (lx, ly, lz) => surPiece(tb, lx, ly, lz);
      let [x, y, z] = at(0, 0.95, 0); put(Dl, boite(2, 0.12, 1.0), 0xf6f2ea, x, y, z, T.ry, 0.05);
      for (const [a, b] of [[-0.85, -0.4], [0.85, -0.4], [-0.85, 0.4], [0.85, 0.4]]) { [x, y, z] = at(a, 0.45, b); put(Dl, boite(0.1, 0.9, 0.1), BOIS, x, y, z, T.ry, 0); }
      for (const b of [-0.95, 0.95]) { [x, y, z] = at(0, 0.45, b); put(Dl, boite(1.8, 0.1, 0.32), BOIS, x, y, z, T.ry, 0.04); }
      [x, y, z] = at(0.4, 1.17, 0); put(Dl, boite(0.18, 0.3, 0.18), 0xffe0a0, x, y, z, 0, 0.03); T.lampe = monde(k, x, y + 0.05, z);
      for (const n of [-0.5, 0.2]) { [x, y, z] = at(n, 1.05, 0.2); put(Dl, cyl(0.12, 0.12, 0.05, 8), 0xe8e2d0, x, y, z, 0, 0); }
    }
    versMonde(L, k.M, TOUT); versMonde(Dl, k.M, TOUT);
  }
  fige(TOUT, BATIS);
  // flaques des rues : au milieu des rues et devant certaines portes
  for (const [a, b] of RUES) FLAQUES_POS.push(V(a.x + (b.x - a.x) * (0.3 + hache(a.x * 9, b.z * 7, 1) * 0.4), 0.013, a.z + (b.z - a.z) * (0.3 + hache(a.z * 9, b.x * 7, 2) * 0.4)));
  majInstancesFenetres();
}
const LINGE = { k: null, x: 0, z: 0, cap: 0 };

// ------------------------------------------------------------------ pièces dynamiques en InstancedMesh (une seule passe de dessin par sorte)
const BOITE1 = new THREE.BoxGeometry(1, 1, 1);
function mkInst(geo, mat, n, couleurs = false) { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false; if (couleurs) { m.setColorAt(0, _col.set(0xffffff)); for (let i = 1; i < n; i++) m.setColorAt(i, _col); } scene.add(m); return m; }
const NF = 700;
const VITRES = mkInst(BOITE1, new THREE.MeshBasicMaterial({ color: 0xffffff }), NF, true); // la vitre, posée juste devant celle du modèle : éteinte, allumée, rideau, ouverte
const VOLETS = mkInst(BOITE1, toon(0xffffff), NF * 2, true);
const VOILES = mkInst(BOITE1, toon(0xf6f2ea, { side: THREE.DoubleSide }), NF);
const SILS = mkInst(BOITE1, new THREE.MeshBasicMaterial({ color: 0x2a1a10 }), 120);
let SILWIN = [];
function majInstancesFenetres() {
  FEN.forEach((f, i) => { _m.copy(f.m).multiply(_m2.compose(_p.set(0, 0, 0.045), _q.identity(), _s.set(f.w, f.h, 0.012))); VITRES.setMatrixAt(i, _m); });
  VITRES.count = FEN.length; VITRES.instanceMatrix.needsUpdate = true;
  // ombres chinoises : toutes les fenêtres de la taverne et une fenêtre sur sept ailleurs
  SILWIN = FEN.filter(f => f.k.cle === 'taverne' || f.r3 > 0.86).slice(0, 55);
}
// la lumière des fenêtres selon l'époque : chandelle, lampe à huile, lampe plus claire (quinquet), bec de gaz ; et son vacillement
const LAMPE = { ancien: [0xffa24a, 0.3], lumieres: [0xffb85a, 0.14], empire: [0xffc870, 0.08], industrie: [0xfff2cc, 0.015] };
const RUE = { ancien: 0xffa850, lumieres: 0xffc060, empire: 0xffcc70, industrie: 0xfff4d0 };
function cibleLum(f) {
  const ph = H.phase, p = H.p, ind = EPOQUE === 'industrie', cle = f.k.cle;
  if (cle === 'taverne' && ((ph === 'crepuscule' && p > 3) || (ph === 'nuit' && p < 50))) return 1.25; // la taverne s'anime le soir
  if (cle === 'boulangerie' && ((ph === 'nuit' && p > 35) || ph === 'aube')) return 1; // le boulanger se lève avant l'aube
  if (ph === 'crepuscule') return p > 2 + f.rang * 24 ? 1 : 0; // une à une
  if (ph === 'nuit') return f.r2 < (ind ? 0.5 : 0.35) || p < 12 + f.r2 * 42 ? 1 : 0; // elles s'éteignent tard, une à une ; les veilleurs gardent la leur
  if (ph === 'aube') return f.r3 < 0.3 && p < 5 + f.r3 * 60 ? 1 : 0; // quelques lève-tôt
  return (METEO === 'brouillard' && f.r3 < 0.4) || (METEO === 'orage' && f.r3 < 0.25) ? 0.75 : 0;
}
function cibleVolet(f) {
  if (METEO === 'tempete') return f.r2 < 0.55 ? -1 : 0; // la moitié battent, les autres ont été fermés
  if (PLUVIEUX() || METEO === 'neige' && !DEHORS()) return tMeteo > 0.6 + f.rang * 7 ? 0 : 1; // on les ferme un à un
  if (NUIT()) return f.cible > 0 ? 1 : 0;
  if (AUBE()) return H.p > 2 + f.rang * 24 ? 1 : 0; // on les ouvre un à un
  return 1;
}
// les volets du jeu (vert sous le chaume, bleu-gris ailleurs), un peu ravivés pour qu'on les distingue de la vitre une fois fermés
const VOLET_VIF = { [0x5c7a4a]: 0x6f9a52, [0x4a6a7a]: 0x5a8fb4 };
const VITRE_C = new THREE.Color(VITRE), INTERIEUR = new THREE.Color(0x1c130d), FLASH = new THREE.Color(0xf4f8ff), C_LAMPE = new THREE.Color(), C_ON = new THREE.Color(), C_RID = new THREE.Color();
function majFenetres(dt) {
  const [lc, fl] = LAMPE[EPOQUE], clarte = 0.3 + 0.7 * Math.min(1, H.j + H.a * 0.6), ouvertes = METEO === 'canicule' && JOUR();
  C_LAMPE.setHex(lc);
  let nv = 0, nvo = 0;
  for (const f of FEN) {
    f.cible = cibleLum(f);
    f.lum += Math.sign(f.cible - f.lum) * Math.min(Math.abs(f.cible - f.lum), dt * 2.5);
    const vac = 1 - fl * (0.5 + 0.5 * Math.sin(t * 17 + f.i * 3.1) * Math.sin(t * 7.3 + f.i));
    const rideau = METEO === 'orage' || (f.lum > 0.3 && (NUIT() || SOIR()) && f.r3 > 0.6);
    C_RID.setHex(f.rideau);
    _col.copy(ouvertes ? INTERIEUR : rideau ? C_RID : VITRE_C).multiplyScalar(ouvertes ? 1 : clarte * (rideau ? 0.75 : 1));
    if (f.lum > 0) { C_ON.copy(C_LAMPE); if (rideau) C_ON.lerp(C_RID, 0.45).multiplyScalar(1.15); _col.lerp(C_ON.multiplyScalar(vac), Math.min(1, f.lum)); }
    if (CIEL.eclair > 0) _col.lerp(FLASH, CIEL.eclair * 0.85);
    VITRES.setColorAt(f.i, _col);
    // volets : charnière au bord de la fenêtre, 0 fermé, 1 rabattu contre le mur
    if (f.volet) {
      const c = cibleVolet(f);
      if (c < 0) f.o = THREE.MathUtils.clamp(0.5 + 0.8 * Math.sin(t * (1.7 + f.r3 * 2.2) + f.i) * Math.sin(t * 0.63 + f.i * 3), 0, 1);
      else f.o += Math.sign(c - f.o) * Math.min(Math.abs(c - f.o), dt * 1.4);
      const ww = f.w, ph = Math.PI * f.o;
      for (const v of [-1, 1]) {
        const cx = v * ww / 2 - v * ww / 4 * Math.cos(v * ph), cz = 0.07 + v * ww / 4 * Math.sin(v * ph);
        _m.copy(f.m).multiply(_m2.compose(_p.set(cx, 0, cz), _q.setFromAxisAngle(AXE_Y, v * ph), _s.set(ww / 2 * 0.93, f.h * 1.05, 0.03)));
        VOLETS.setMatrixAt(nv, _m); VOLETS.setColorAt(nv++, _col.setHex(VOLET_VIF[f.volet] || f.volet));
      }
    } else f.o = 1;
    // lueur de la fenêtre (affaiblie derrière un volet clos)
    if (f.lum > 0.04) HALO.mettre(_p.copy(f.c).addScaledVector(f.n, 0.006), C_ON.copy(C_LAMPE), Math.min(1, f.lum) * vac * (f.volet ? 0.25 + 0.75 * f.o : 1) * (JOUR() ? 0.45 : 0.9));
    // canicule : fenêtres grandes ouvertes, voilage qui ondule dehors
    if (ouvertes) {
      const a = 0.25 + 0.22 * Math.sin(t * 1.3 + f.i * 1.7);
      _m.copy(f.m).multiply(_m2.compose(_p.set(0, f.h / 2, 0.06), _q.setFromAxisAngle(_v.set(1, 0, 0), -a), UN)).multiply(_m2.compose(_p.set(0, -f.h * 0.45, 0), _q.identity(), _s.set(f.w * 0.8, f.h * 0.9, 0.01)));
      VOILES.setMatrixAt(nvo++, _m);
    }
  }
  VITRES.instanceColor.needsUpdate = true;
  VOLETS.count = nv; VOLETS.instanceMatrix.needsUpdate = true; if (VOLETS.instanceColor) VOLETS.instanceColor.needsUpdate = true;
  VOILES.count = nvo; VOILES.instanceMatrix.needsUpdate = true;
  // ombres chinoises : on passe derrière le rideau ; on danse derrière ceux de la taverne
  let ns = 0;
  if (NUIT() || SOIR()) for (const f of SILWIN) {
    const tav = f.k.cle === 'taverne';
    if (f.lum < 0.6 || f.o < 0.6 || (!tav && Math.sin(t * 0.21 + f.i * 2.3) < -0.1)) continue;
    const x = Math.sin(t * (tav ? 1.6 : 0.45) + f.i) * (f.w / 2 - f.w * 0.17) * 0.92, saut = tav ? Math.abs(Math.sin(t * 6 + f.i)) * f.h * 0.07 : 0;
    _m.copy(f.m).multiply(_m2.compose(_p.set(x, -f.h * 0.14 + saut, 0.052), _q.identity(), _s.set(f.w * 0.3, f.h * 0.56, 0.004))); SILS.setMatrixAt(ns++, _m);
    _m.copy(f.m).multiply(_m2.compose(_p.set(x, f.h * 0.25 + saut, 0.052), _q.identity(), _s.set(f.w * 0.19, f.h * 0.19, 0.004))); SILS.setMatrixAt(ns++, _m);
  }
  SILS.count = ns; SILS.instanceMatrix.needsUpdate = true;
}

// ------------------------------------------------------------------ points lumineux (additifs) : fenêtres et lanternes, réverbères et four, yeux
// un point lumineux a une seule profondeur : on l'avance vers la caméra pour que le mur qui le porte ne le coupe pas en biais
function lueurs(n, taille, avance) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setDrawRange(0, 0);
  const o = new THREE.Points(g, new THREE.PointsMaterial({ map: tache, size: taille, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  o.frustumCulled = false; scene.add(o); o.nb = 0;
  o.mettre = (p, c, k = 1) => { if (o.nb >= n) return; _w.copy(cam.position).sub(p).setLength(avance).add(p); g.attributes.position.setXYZ(o.nb, _w.x, _w.y, _w.z); g.attributes.color.setXYZ(o.nb++, c.r * k, c.g * k, c.b * k); };
  o.fin = () => { g.setDrawRange(0, o.nb); g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = true; o.nb = 0; };
  return o;
}
const HALO = lueurs(900, 0.13, 0.07), GRAND = lueurs(80, 0.36, 0.14), PETIT = lueurs(60, 0.03, 0.01);

// ------------------------------------------------------------------ particules : boules de neige, poussière, copeaux, tuiles, gouttes, ondes sonores, ronds dans l'eau
const P = {
  boule: mkInst(new THREE.IcosahedronGeometry(1, 0), toon(0xffffff), 700, true),
  plaque: mkInst(BOITE1, toon(0xffffff), 400, true),
  son: mkInst(new THREE.RingGeometry(0.82, 1, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }), 60, true),
  ride: mkInst(new THREE.RingGeometry(0.7, 1, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false }), 160, true),
};
const parts = [];
function particule(o) { if (parts.length < 1300) parts.push({ age: 0, vie: 1, g: 0, vx: 0, vy: 0, vz: 0, s: 0.01, genre: 'boule', col: 0xffffff, spin: 0, ...o }); }
const C_FLAQUE = new THREE.Color(0x7f9db3), NOIR = new THREE.Color(0);
function majParticules(dt) {
  const n = { boule: 0, plaque: 0, son: 0, ride: 0 };
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.age += dt;
    if (p.age > p.vie) { parts.splice(i, 1); if (p.fin) p.fin(p); continue; }
    p.vy -= p.g * dt; p.x += (p.vx + (p.vent ? VENT_X * p.vent : 0)) * dt; p.y += p.vy * dt; p.z += (p.vz + (p.vent ? VENT_Z * p.vent : 0)) * dt;
    if (p.sol != null && p.y < p.sol) { p.y = p.sol; p.vx *= 0.2; p.vz *= 0.2; p.vy = 0; p.spin = 0; p.vent = 0; }
  }
  for (const p of parts) {
    const m = P[p.genre], k = n[p.genre]; if (k >= m.instanceMatrix.count) continue;
    const u = p.age / p.vie;
    if (p.genre === 'son') { const s = p.s * (0.35 + u * 1.8); _m.compose(_p.set(p.x, p.y, p.z), cam.quaternion, _s.set(s, s, s)); m.setColorAt(k, _col.setHex(p.col).lerp(NOIR, u)); }
    else if (p.genre === 'ride') { const s = p.s * (0.25 + u); _m.compose(_p.set(p.x, p.y, p.z), _q.identity(), _s.set(s, s, s)); m.setColorAt(k, _col.setHex(0xe6f2fa).lerp(C_FLAQUE, u)); }
    else { const s = p.s * (p.grandit ? 1 + u * p.grandit : 1); _q.setFromEuler(_e.set(p.age * p.spin, p.age * p.spin * 0.7, p.rz || 0)); _m.compose(_p.set(p.x, p.y, p.z), _q, p.forme ? _s.set(p.forme[0] * s, p.forme[1] * s, p.forme[2] * s) : _s.set(s, s, s)); m.setColorAt(k, _col.setHex(p.col)); }
    m.setMatrixAt(k, _m); n[p.genre]++;
  }
  for (const g in P) { P[g].count = n[g]; P[g].instanceMatrix.needsUpdate = true; P[g].instanceColor.needsUpdate = true; }
}

// ------------------------------------------------------------------ fumées des cheminées (comme vie.js), poussées par le vent
const NFUM = 500;
const FUM = mkInst(new THREE.IcosahedronGeometry(0.05, 0), toon(0xffffff, { transparent: true, opacity: 0.82, depthWrite: false }), NFUM, true);
const bouffees = [];
const TEINTE = { blanche: new THREE.Color(0xf6f4ee), grise: new THREE.Color(0x8d8880), noire: new THREE.Color(0x55504a) };
let VENT_X = 0.03, VENT_Z = 0;
function bouffee(x, y, z, genre = 'blanche', k = 1) { if (bouffees.length >= NFUM) bouffees.shift(); bouffees.push({ x, y, z, age: 0, c: TEINTE[genre], k, vie: 3 }); }
function majFumees(dt) {
  let n = 0;
  for (let i = bouffees.length - 1; i >= 0; i--) { const b = bouffees[i]; b.age += dt; if (b.age > b.vie) { bouffees.splice(i, 1); continue; } b.y += dt * 0.18 / (1 + VENT * 1.5); b.x += (VENT_X + 0.02) * dt; b.z += VENT_Z * dt; }
  for (const b of bouffees) { const u = b.age / b.vie, s = (0.5 + b.age * 0.55) * b.k * (u > 0.75 ? (1 - u) / 0.25 : 1); _m.compose(_p.set(b.x, b.y, b.z), _q.identity(), _s.set(s, s, s)); FUM.setMatrixAt(n, _m); FUM.setColorAt(n++, b.c); }
  FUM.count = n; FUM.instanceMatrix.needsUpdate = true; FUM.instanceColor.needsUpdate = true;
}
// le rythme du foyer : toutes au matin, la moitié le jour, plus le soir, peu la nuit ; épaisses l'hiver, rares l'été, presque aucune en canicule
function partFoyers() {
  const hiver = SAISON === 0 || METEO === 'neige';
  let part = AUBE() ? 1 : SOIR() ? 0.75 : NUIT() ? 0.3 : 0.45;
  if (hiver) part = Math.max(part, NUIT() ? 0.7 : 1); else if (SAISON === 3) part += 0.15; else if (SAISON === 2) part *= 0.5;
  if (METEO === 'canicule') part = 0.06;
  return { part, pas: hiver ? 0.55 : 0.85, k: hiver ? 1.15 : 0.9 };
}
function majCheminees(dt) {
  const { part, pas, k } = partFoyers();
  for (const c of CHEM) {
    const actif = c.four ? (NUIT() && H.p > 35) || AUBE() || (JOUR() && H.p < 90) : c.rang < part;
    if (!actif) continue;
    c.prochain -= dt;
    if (c.prochain <= 0) { c.prochain = pas * (0.8 + Math.random() * 0.5); bouffee(c.pos.x, c.pos.y, c.pos.z, c.noire ? 'noire' : EPOQUE === 'industrie' && c.k.cle === 'immeuble' ? 'grise' : 'blanche', c.four ? 1.2 : k); }
  }
}

// ------------------------------------------------------------------ eau : gouttières qui ruissellent, flaques qui grandissent puis sèchent
const RUISS_L = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(400 * 3 * 6), 3)), new THREE.LineBasicMaterial({ color: 0xcfe6f8, transparent: true, opacity: 0.9 }));
RUISS_L.frustumCulled = false; scene.add(RUISS_L);
const FLAQUES = mkInst(new THREE.CylinderGeometry(1, 1, 0.002, 14), toon(0x7f9db3), 120);
function majEau(dt) {
  const pl = PLUIE();
  FLAQUE = THREE.MathUtils.clamp(FLAQUE + (pl ? dt * 0.12 : -dt * 0.035), 0, 1); // elles grandissent sous la pluie et sèchent ensuite
  let n = 0;
  if (FLAQUE > 0.01) FLAQUES_POS.forEach((p, i) => { const r = (0.028 + hache(i, 4, 4) * 0.03) * FLAQUE; _m.compose(p, _q.identity(), _s.set(r, 1, r * (0.7 + hache(i, 5, 4) * 0.5))); FLAQUES.setMatrixAt(n++, _m); });
  FLAQUES.count = n; FLAQUES.instanceMatrix.needsUpdate = true;
  if (pl && FLAQUE > 0.2 && FLAQUES_POS.length) for (let i = 0; i < 2; i++) if (Math.random() < dt * 9) { const j = Math.random() * FLAQUES_POS.length | 0, p = FLAQUES_POS[j], r = (0.028 + hache(j, 4, 4) * 0.03) * FLAQUE; particule({ genre: 'ride', x: p.x + (Math.random() - 0.5) * r, y: p.y + 0.002, z: p.z + (Math.random() - 0.5) * r * 0.6, s: r * 0.55, vie: 0.7 }); }
  // filets d'eau qui tombent des avant-toits, et goutte à goutte dans les seaux
  const a = RUISS_L.geometry.attributes.position; let k = 0;
  RUISS_L.visible = pl && RUISS.length > 0;
  if (RUISS_L.visible) for (const r of RUISS) for (let j = 0; j < (r.seau ? 2 : 3); j++) {
    if (k >= 400 * 3) break;
    const u = (t * (r.seau ? 1.1 : 1.8) + r.ph + j / 3) % 1, y = r.a.y + (r.b.y - r.a.y) * u * u;
    a.setXYZ(k * 2, r.a.x, y, r.a.z); a.setXYZ(k * 2 + 1, r.a.x, y - (r.seau ? 0.006 : 0.016), r.a.z); k++;
    if (r.seau && u > 0.95 && Math.random() < 0.3) particule({ genre: 'ride', x: r.b.x, y: r.b.y * 1, z: r.b.z, s: 0.014, vie: 0.5 });
  }
  RUISS_L.geometry.setDrawRange(0, k * 2); a.needsUpdate = true;
}

// ------------------------------------------------------------------ météo : pluie, neige, nuages et leur ombre, éclairs (comme la maquette rendu-power)
const NG = 1200, GOUT = Float32Array.from({ length: NG * 3 }, Math.random);
const PLUIE_L = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(NG * 6), 3)), new THREE.LineBasicMaterial({ color: 0xd8e6f2, transparent: true, opacity: 0.5, depthWrite: false }));
const NEIGE_P = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(NG * 3), 3)), new THREE.PointsMaterial({ map: tache, size: 0.045, transparent: true, depthWrite: false }));
for (const o of [PLUIE_L, NEIGE_P]) { o.frustumCulled = false; o.visible = false; scene.add(o); }
const M_NUAGE = toon(0xffffff, { transparent: true, opacity: 0.85, depthWrite: false });
const NUAGES = Array.from({ length: 10 }, (_, i) => {
  const g = new THREE.Group();
  for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 + hache(i, k, 71) * 0.45, 1).scale(1, 0.55, 1), M_NUAGE); m.position.set((k - 1.5) * 0.6, hache(i, k, 73) * 0.2, (hache(i, k, 74) - 0.5) * 0.7); m.castShadow = true; g.add(m); }
  g.userData = { x: (hache(i, 0, 75) - 0.5) * 16, z: (hache(i, 0, 77) - 0.5) * 14, y: 3.4 + hache(i, 0, 76) * 0.8 };
  scene.add(g); return g;
});
const VENTS = { beau: 0.25, nuageux: 0.4, pluie: 0.5, orage: 0.8, brouillard: 0.05, tempete: 1.4, neige: 0.4, canicule: 0.08 };
function majMeteo(dt) {
  const c = vue.cible, neige = NEIGE_TOMBE(), pluie = PLUIE();
  VENT = VENTS[METEO]; VENT_X = Math.cos(0.5) * VENT * 0.22; VENT_Z = Math.sin(0.5) * VENT * 0.1;
  PLUIE_L.visible = pluie; NEIGE_P.visible = neige;
  if (pluie) {
    const p = PLUIE_L.geometry.attributes.position.array, vx = VENT * 0.6;
    for (let i = 0; i < NG; i++) { const o = i * 3; GOUT[o + 1] -= dt * 1.6 * (0.8 + GOUT[o + 2] * 0.4); if (GOUT[o + 1] < 0) GOUT[o + 1] += 1; const x = c.x + (GOUT[o] - 0.5) * 7, y = GOUT[o + 1] * 3, z = c.z + (GOUT[o + 2] - 0.5) * 7; p.set([x, y, z, x - vx * 0.06, y + 0.09, z], i * 6); }
    PLUIE_L.geometry.attributes.position.needsUpdate = true;
  }
  if (neige) {
    const p = NEIGE_P.geometry.attributes.position.array;
    for (let i = 0; i < NG; i++) { const o = i * 3; GOUT[o + 1] -= dt * 0.1; if (GOUT[o + 1] < 0) GOUT[o + 1] += 1; p[o] = c.x + (GOUT[o] - 0.5) * 7 + Math.sin(t + i) * 0.04 + VENT * 0.1; p[o + 1] = GOUT[o + 1] * 3; p[o + 2] = c.z + (GOUT[o + 2] - 0.5) * 7; }
    NEIGE_P.geometry.attributes.position.needsUpdate = true;
  }
  if ((METEO === 'orage' || METEO === 'tempete') && (CIEL.tEclair -= dt) < 0) { CIEL.eclair = 1; CIEL.tEclair = 3 + Math.random() * 5; }
  CIEL.eclair = Math.max(0, CIEL.eclair - dt * 5);
  hemi.intensity = CIEL.hI + CIEL.eclair * 1.6; scene.background.copy(CIEL.fond).lerp(_col.setHex(0xdfe8ff), CIEL.eclair * 0.35);
  const brume = METEO === 'brouillard' ? 1 : METEO === 'tempete' ? 0.4 : neige ? 0.3 : 0;
  scene.fog.near = brume ? vue.d * (1.3 - brume * 0.75) : 1000; scene.fog.far = brume ? vue.d * (3.2 - brume * 1.6) : 2000;
  scene.fog.color.setHex(0xb8c0c4).multiplyScalar(0.18 + 0.82 * (H.j + H.a * 0.7));
  const nVis = { beau: 3, nuageux: 8, pluie: 10, orage: 10, brouillard: 0, tempete: 10, neige: 9, canicule: 1 }[METEO];
  M_NUAGE.color.setHex(pluie ? 0x8d939c : 0xffffff);
  M_NUAGE.opacity = Math.min(1, Math.max(0, (vue.d - 9) / 6)) * 0.85; M_NUAGE.colorWrite = M_NUAGE.opacity > 0.02; // de près, il ne reste que leur ombre
  NUAGES.forEach((g, i) => { g.visible = i < nVis; const u = g.userData; u.x += dt * (0.15 + VENT * 0.5); if (u.x - c.x > 8) u.x -= 16; if (u.x - c.x < -8) u.x += 16; if (u.z - c.z > 7) u.z -= 14; if (u.z - c.z < -7) u.z += 14; g.position.set(u.x, u.y, u.z); });
}

// ------------------------------------------------------------------ ciel de nuit : étoiles autour du plateau, lune dont la phase suit le mois, étoiles filantes l'été
const ETOILES = (() => {
  const n = 700, a = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const u = hache(i, 1, 91) * 2 - 1, th = hache(i, 2, 91) * Math.PI * 2, r = Math.sqrt(1 - u * u); a.set([Math.cos(th) * r * 70, u * 70, Math.sin(th) * r * 70], i * 3); const k = 0.45 + hache(i, 3, 91) * 0.55; col.set([k, k, k * (0.9 + hache(i, 4, 91) * 0.2)], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const o = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  o.frustumCulled = false; scene.add(o); return o;
})();
const TEX_LUNE = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; return new THREE.CanvasTexture(c); })();
let phaseDessinee = -1;
function dessinerLune(f) {
  if (f === phaseDessinee) return; phaseDessinee = f;
  const c = TEX_LUNE.image, g = c.getContext('2d'), R = 54, img = g.createImageData(128, 128), k = Math.cos(2 * Math.PI * f);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const dx = x - 63.5, dy = y - 63.5, d = Math.hypot(dx, dy); if (d > R + 1) continue;
    const hw = Math.sqrt(Math.max(0, R * R - dy * dy)), lit = f < 0.5 ? dx > hw * k : dx < -hw * k, a = Math.min(1, R + 1 - d), o = (y * 128 + x) * 4;
    const mer = hache(x >> 3, y >> 3, 5) < 0.18 ? 0.86 : 1; // quelques mers lunaires
    if (lit) img.data.set([246 * mer, 241 * mer, 214 * mer, 255 * a], o); else img.data.set([40, 48, 76, 120 * a], o);
  }
  g.putImageData(img, 0, 0); TEX_LUNE.needsUpdate = true;
}
// la lune reste dans le coin du ciel, par-dessus le plateau (la caméra regarde vers le sol : il n'y a presque pas de ciel dans le cadre)
const LUNE = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX_LUNE, transparent: true, fog: false, depthWrite: false, depthTest: false }));
LUNE.renderOrder = 10;
const HALO_LUNE = new THREE.Sprite(new THREE.SpriteMaterial({ map: tache, color: 0x9fb4ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, fog: false, depthWrite: false, depthTest: false }));
HALO_LUNE.renderOrder = 9;
cam.add(HALO_LUNE, LUNE);
const FILANTE = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, fog: false, depthWrite: false }));
FILANTE.frustumCulled = false; cam.add(FILANTE);
const fil = { t: 2, x: 0, y: 0, vx: 0, vy: 0 };
function majCiel(dt) {
  const nuit = Math.min(1, H.n + H.a * 0.35) * CLAIR();
  ETOILES.material.opacity = nuit * 0.95; ETOILES.visible = nuit > 0.02; ETOILES.position.set(centre.x, 0, centre.z);
  const f = PHASE_LUNE(MOIS); dessinerLune(f);
  const D = 100, hh = D * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), hw = hh * cam.aspect;
  LUNE.visible = HALO_LUNE.visible = nuit > 0.02 && Math.abs(f) > 0.01 && f !== 0;
  LUNE.position.set(hw - hh * 0.24, hh * 0.76, -D); LUNE.scale.setScalar(hh * 0.16); LUNE.material.opacity = Math.min(1, nuit * 1.3);
  HALO_LUNE.position.set(hw - hh * 0.24, hh * 0.76, -D - 1); HALO_LUNE.scale.setScalar(hh * 0.55 * (0.4 + Math.sin(f * Math.PI))); HALO_LUNE.material.opacity = 0.25 * nuit;
  // étoile filante : une traînée qui traverse le haut du ciel, toutes les quelques secondes, les nuits claires d'été
  fil.t -= dt;
  const actif = NUIT() && SAISON === 2 && CLAIR() >= 1;
  if (actif && fil.t <= 0 && fil.t > -0.7) {
    if (!fil.vx) { fil.x = (Math.random() * 1.2 - 0.6) * hw; fil.y = hh * (0.45 + Math.random() * 0.35); const a = -0.35 - Math.random() * 0.5; fil.vx = Math.cos(a) * hw * 1.6 * (Math.random() < 0.5 ? 1 : -1); fil.vy = Math.sin(a) * hw * 1.6; }
    const u = -fil.t, x = fil.x + fil.vx * u, y = fil.y + fil.vy * u, p = FILANTE.geometry.attributes.position;
    p.setXYZ(0, x, y, -D + 2); p.setXYZ(1, x - fil.vx * 0.12, y - fil.vy * 0.12, -D + 2); p.needsUpdate = true;
    FILANTE.material.opacity = Math.sin(u / 0.7 * Math.PI); FILANTE.visible = true;
  } else { FILANTE.visible = false; if (fil.t <= -0.7) { fil.t = 3 + Math.random() * 4; fil.vx = 0; } if (!actif && fil.t < 0) fil.t = 1; }
}

// ------------------------------------------------------------------ personnages et bêtes (unités de web_power, face à +x), regroupés en InstancedMesh par modèle (comme vie.js)
const PATTES = (dx, dz, h, w, c) => [[-dx, -dz], [-dx, dz], [dx, -dz], [dx, dz]].map(([x, z]) => [boite(w, h, w), x, h / 2, z, c]);
const PAYSAN = (chemise, chapeau = 0xd9b45a) => [[boite(0.3, 0.9, 0.24), 0, 0.45, 0.16, 0x5a4632], [boite(0.3, 0.9, 0.24), 0, 0.45, -0.16, 0x5a4632], [boite(0.5, 0.95, 0.75), 0, 1.35, 0, chemise], [sphere(0.28, 1), 0.02, 2.1, 0, 0xf0c9a0], [cyl(0.55, 0.55, 0.08, 10), 0, 2.36, 0, chapeau], [cyl(0.25, 0.3, 0.25, 8), 0, 2.5, 0, chapeau]];
const TETE_NUE = c => PAYSAN(c).slice(0, 4);
const FEMME = (jupe, haut = 0xe9e2d0) => [[boite(0.7, 0.9, 0.7), 0, 0.45, 0, jupe], [boite(0.5, 0.6, 0.6), 0, 1.2, 0, haut], [sphere(0.28, 1), 0.02, 1.75, 0, 0xf0c9a0], [boite(0.4, 0.16, 0.45), 0, 2.02, 0, 0xf6f2ea]];
const ENFANT = (c, bonnet) => [...TETE_NUE(c), ...(bonnet ? [[cone(0.3, 0.42, 6), 0.02, 2.48, 0, bonnet], [boite(0.55, 0.14, 0.8), 0, 1.78, 0, bonnet]] : [])];
const PARAPLUIE = (c, toile) => [...PAYSAN(c, 0x2b2b30), [boite(0.06, 1.2, 0.06), 0.28, 2.15, 0.2, 0x3a2a20], [cone(1.05, 0.42, 8), 0.28, 2.95, 0.2, toile], [boite(0.08, 0.08, 0.08), 0.28, 3.2, 0.2, 0x3a2a20]];
const CHAT = c => [[boite(0.75, 0.32, 0.28), 0, 0.4, 0, c], [boite(0.3, 0.3, 0.3), 0.46, 0.62, 0, c], [boite(0.07, 0.13, 0.08), 0.46, 0.83, 0.09, c], [boite(0.07, 0.13, 0.08), 0.46, 0.83, -0.09, c], [boite(0.07, 0.55, 0.07).rotateZ(0.55), -0.5, 0.64, 0, c], ...PATTES(0.28, 0.09, 0.26, 0.08, c)];
const ASSIS = (c, femme) => femme
  ? [[boite(0.7, 0.3, 0.7), 0.15, 0.8, 0, c], [boite(0.3, 0.68, 0.6), 0.4, 0.34, 0, c], [boite(0.5, 0.6, 0.6), -0.05, 1.25, 0, 0xe9e2d0], [sphere(0.28, 1), -0.03, 1.8, 0, 0xf0c9a0], [boite(0.4, 0.16, 0.45), -0.03, 2.07, 0, 0xf6f2ea]]
  : [[boite(0.6, 0.22, 0.5), 0.2, 0.78, 0, 0x5a4632], [boite(0.22, 0.68, 0.45), 0.45, 0.34, 0, 0x5a4632], [boite(0.5, 0.85, 0.72), -0.05, 1.28, 0, c], [sphere(0.28, 1), -0.03, 1.96, 0, 0xf0c9a0]];
const MODELES = {
  passant0: PAYSAN(0x6a8aa4), passant1: PAYSAN(0xc0504a, 0x5a4632), passante0: FEMME(0x8a4a7a, 0xf2e6c8), passante1: FEMME(0x5a7a4a),
  commere0: FEMME(0x4a6a9a), commere1: FEMME(0xb8603f, 0xf6f2ea),
  enfant0: ENFANT(0xd9533a), enfant1: ENFANT(0x3a8ad9), enfant2: ENFANT(0xe0c040),
  enfantH0: ENFANT(0xd9533a, 0xf6f2ea), enfantH1: ENFANT(0x3a8ad9, 0xd9322a), enfantH2: ENFANT(0x5a8a3a, 0xe0c040), enfantH3: ENFANT(0x8a4a7a, 0x3a6ad9),
  sac: [...TETE_NUE(0xc9b28a), [boite(0.95, 0.3, 0.95), 0, 2.42, 0, 0x9a7a4a], [boite(0.25, 0.85, 0.95), -0.38, 1.95, 0, 0x9a7a4a]], // un sac sur la tête sous la pluie, en 1700
  parapluieVert: PARAPLUIE(0x6a8aa4, 0x3f7a4a), parapluieRouge: PARAPLUIE(0x8a4a7a, 0xc0403a), parapluieNoir: PARAPLUIE(0x3a3a46, 0x1f1f24), parapluieNoir2: PARAPLUIE(0x6a5a4a, 0x2a2a30),
  pelleteur: [...PAYSAN(0x7a3a3a, 0x3a3046), [boite(0.07, 1.5, 0.07).rotateZ(0.9), 0.55, 1.05, 0.3, 0x5b3a1e], [boite(0.5, 0.06, 0.45), 1.15, 0.5, 0.3, 0x8a8f96]],
  veilleur: [[boite(0.3, 0.9, 0.24), 0, 0.45, 0.16, 0x3a3030], [boite(0.3, 0.9, 0.24), 0, 0.45, -0.16, 0x3a3030], [boite(0.62, 1.15, 0.85), 0, 1.4, 0, 0x3a3446], [sphere(0.28, 1), 0.02, 2.1, 0, 0xf0c9a0], [cone(0.55, 0.32, 3), 0, 2.42, 0, 0x1f1f1f], [boite(0.06, 0.5, 0.06), 0.45, 1.45, 0.38, 0x2b2b30], [boite(0.26, 0.32, 0.26), 0.45, 1.1, 0.38, 0xffd36a], [boite(0.07, 2.9, 0.07), 0.1, 1.45, -0.42, 0x5b3a1e], [cone(0.12, 0.42, 5), 0.1, 3.0, -0.42, 0xd9d9d9]],
  cloche: [[cone(0.2, 0.3, 8), 0, -0.15, 0, 0xb08d57], [boite(0.05, 0.25, 0.05), 0, 0.1, 0, 0x5b3a1e]],
  allumeur: [...PAYSAN(0x3a3a4a, 0x2b2b30), [boite(0.06, 2.2, 0.06), 0.35, 2, 0.2, 0x5b3a1e], [boite(0.14, 0.14, 0.14), 0.35, 3.1, 0.2, 0xffd36a]],
  porteLanterne: [...PAYSAN(0x5a5a6a, 0x3a3046), [boite(0.06, 0.55, 0.06), 0.55, 1.7, 0.3, 0x2b2b30], [boite(0.26, 0.32, 0.26), 0.55, 1.3, 0.3, 0xffd36a]],
  chat0: CHAT(0x2a2628), chat1: CHAT(0xd98a3a), chat2: CHAT(0x8a8a90),
  hibou: [[boite(0.5, 0.7, 0.5), 0, 0.35, 0, 0x8a6a4a], [boite(0.42, 0.5, 0.42), 0.04, 0.35, 0, 0xd9c8a0], [boite(0.55, 0.42, 0.5), 0.02, 0.9, 0, 0x9a7a5a], [boite(0.05, 0.14, 0.14), 0.3, 0.95, 0.12, 0xffd34d], [boite(0.05, 0.14, 0.14), 0.3, 0.95, -0.12, 0xffd34d], [boite(0.1, 0.1, 0.06), 0.32, 0.82, 0, 0xd9a43a], [boite(0.1, 0.2, 0.08), 0.05, 1.18, 0.18, 0x7a5a3a], [boite(0.1, 0.2, 0.08), 0.05, 1.18, -0.18, 0x7a5a3a]],
  chauvesouris: [[boite(0.35, 0.2, 0.2), 0, 0, 0, 0x2a2228], [boite(0.5, 0.04, 0.6), -0.05, 0, 0.38, 0x3a3038], [boite(0.5, 0.04, 0.6), -0.05, 0, -0.38, 0x3a3038], [boite(0.08, 0.14, 0.06), 0.18, 0.13, 0.06, 0x2a2228], [boite(0.08, 0.14, 0.06), 0.18, 0.13, -0.06, 0x2a2228]],
  hirondelle: [[boite(0.6, 0.16, 0.18), 0, 0, 0, 0x1f2a4a], [boite(0.42, 0.08, 0.15), 0.04, -0.08, 0, 0xf4f1ea], [boite(0.14, 0.12, 0.14), 0.36, 0.03, 0, 0xb8322a], [boite(0.38, 0.04, 0.06), -0.45, 0, 0.07, 0x1f2a4a], [boite(0.38, 0.04, 0.06), -0.45, 0, -0.07, 0x1f2a4a], [boite(0.32, 0.04, 1.4), 0.02, 0.02, 0, 0x1f2a4a]],
  coq: [[boite(0.6, 0.45, 0.35), 0, 0.55, 0, 0xb8502a], [boite(0.25, 0.38, 0.2), 0.3, 0.9, 0, 0xd9a43a], [boite(0.12, 0.16, 0.06), 0.33, 1.15, 0, 0xd9322a], [boite(0.13, 0.06, 0.06), 0.47, 0.92, 0, 0xf2b33d], [boite(0.08, 0.14, 0.05), 0.35, 0.77, 0, 0xd9322a], [boite(0.25, 0.62, 0.12).rotateZ(0.4), -0.38, 0.86, 0, 0x1f4a3a], [boite(0.06, 0.32, 0.06), 0, 0.16, 0.08, 0xf2b33d], [boite(0.06, 0.32, 0.06), 0, 0.16, -0.08, 0xf2b33d]],
  rateleur: [...PAYSAN(0x5a6a3a), [boite(0.06, 2.0, 0.06).rotateZ(-0.75), 0.75, 1.1, 0.3, 0x8b5a2b], [boite(0.1, 0.12, 0.75), 1.45, 0.38, 0.3, 0x6b6f75]],
  fendeur: [...PAYSAN(0x8a3a2a), [boite(0.08, 1.3, 0.08).rotateZ(-0.5), 0.6, 1.6, 0.28, 0x5b3a1e], [boite(0.08, 0.3, 0.32), 0.95, 2.1, 0.28, 0xb8b8b8]],
  porteurBois: [...PAYSAN(0x6a4a3a, 0x5a4632), [cyl(0.22, 0.22, 0.95, 6).rotateX(Math.PI / 2), 0.42, 1.3, 0, 0xa0703f], [cyl(0.22, 0.22, 0.95, 6).rotateX(Math.PI / 2), 0.42, 1.68, 0, 0xa0703f]],
  boulanger: [...TETE_NUE(0xf6f2ea), [cyl(0.3, 0.26, 0.5, 8), 0.02, 2.55, 0, 0xffffff], [boite(0.7, 0.3, 0.62), 0.48, 1.38, 0, 0xb08040], [sphere(0.18, 0).scale(1.6, 0.7, 1), 0.48, 1.58, 0.12, 0xd9a45a], [sphere(0.18, 0).scale(1.6, 0.7, 1), 0.48, 1.58, -0.16, 0xd9a45a]],
  jardinier: [...PAYSAN(0x7a8a4a), [boite(0.45, 0.38, 0.28), 0.48, 1.0, 0.3, 0x6b8a9a], [boite(0.45, 0.06, 0.06).rotateZ(-0.6), 0.82, 1.12, 0.3, 0x6b8a9a]],
  assis0: ASSIS(0x6a8aa4), assis1: ASSIS(0x8a4a7a, true), assis2: ASSIS(0xc0504a), assis3: ASSIS(0x5a7a4a, true),
  buveur0: [...PAYSAN(0x8a5a3a, 0x5a4632), [cyl(0.14, 0.14, 0.3, 8), 0.42, 1.5, 0.3, 0xd9c08a]], buveur1: [...PAYSAN(0x4a6a5a), [cyl(0.14, 0.14, 0.3, 8), 0.42, 1.5, 0.3, 0xd9c08a]], buveur2: PAYSAN(0x7a3a6a, 0x2b2b30),
  tapis0: [[boite(0.95, 1.15, 0.04), 0, -0.58, 0, 0xb8322a], [boite(0.72, 0.9, 0.045), 0, -0.58, 0, 0xe0b040], [boite(0.5, 0.65, 0.05), 0, -0.58, 0, 0x3a5a8a]],
  tapis1: [[boite(0.95, 1.15, 0.04), 0, -0.58, 0, 0x3a6a4a], [boite(0.72, 0.9, 0.045), 0, -0.58, 0, 0xe8dcc0], [boite(0.5, 0.65, 0.05), 0, -0.58, 0, 0x8a3a2a]],
};
const POOLS = new Map();
function acteur(nom, s = ECH) {
  let p = POOLS.get(nom);
  if (!p) { const L = lot(); for (const [g, x, y, z, c] of MODELES[nom]) put(L, g, c, x, y, z, 0, 0.09); p = { g: fusion(L.g), o: L.o.length ? fusion(L.o) : null, list: [], mi: null, mo: null }; POOLS.set(nom, p); }
  const o = new THREE.Object3D(); o.scale.setScalar(s); p.list.push(o); return o;
}
function installerPools() {
  for (const p of POOLS.values()) {
    const n = p.list.length;
    if (p.mi && p.mi.instanceMatrix.count >= n) continue;
    for (const m of [p.mi, p.mo]) if (m) { scene.remove(m); m.dispose(); }
    p.mi = p.mo = null; if (!n) continue;
    const cap = Math.ceil(n * 1.3) + 4;
    p.mi = new THREE.InstancedMesh(p.g, MAT, cap); p.mi.castShadow = p.mi.receiveShadow = true;
    if (p.o) p.mo = new THREE.InstancedMesh(p.o, CONT, cap);
    for (const m of [p.mi, p.mo]) if (m) { m.count = 0; m.frustumCulled = false; scene.add(m); }
  }
}
function dessinerActeurs() {
  for (const p of POOLS.values()) {
    if (!p.mi) continue; let n = 0;
    for (const o of p.list) if (o.visible) { o.updateMatrix(); p.mi.setMatrixAt(n, o.matrix); if (p.mo) p.mo.setMatrixAt(n, o.matrix); n++; }
    p.mi.count = n; p.mi.instanceMatrix.needsUpdate = true; if (p.mo) { p.mo.count = n; p.mo.instanceMatrix.needsUpdate = true; }
  }
}
// une pièce accrochée à un cadre (fenêtre, porte, toit) : le cadre est en unités de web_power, le modèle aussi (échelle 1 = 0,1 dans le monde)
function surCadre(o, M, x, y, z, ry = 0, rx = 0, rz = 0, s = 1) { _m.copy(M).multiply(_m2.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(s, s, s))); _m.decompose(o.position, o.quaternion, o.scale); }

// ------------------------------------------------------------------ les animations et leurs libellés
let ACT = [];
const ETIQ = new Map();
/** Un libellé du panneau « En ce moment » : cat = meteo, saison, heure ou epoque ; affiché tant qu'une de ses conditions est vraie. */
function etiq(cat, txt, quand) { const e = ETIQ.get(txt); if (e) e.quand.push(quand); else ETIQ.set(txt, { cat, txt, quand: [quand] }); }
/** o : l'acteur ; f(t, dt, o) : son mouvement ; quand() : visible ou non ; libellé facultatif. */
function ajoute(o, f, quand, cat, txt) { ACT.push({ o, f, quand }); if (txt) etiq(cat, txt, quand); return o; }
// une fenêtre tournée vers la caméra de départ, sans jardinière, la plus haute possible (tapis, chat sur le rebord)
const fenetreLibre = (cle, rang = 0) => FEN.filter(f => f.k.cle === cle && f.n.z > 0.3 && hache(f.rec.x * 13, f.rec.z * 7, 21) >= 0.6).sort((a, b) => b.c.y - a.c.y || a.i - b.i)[rang];
const pres = (k, lx, lz) => { const p = posB(k, lx, lz); return { x: p.x, z: p.z, y: k.top + DALLE }; };
// marche le long d'une ligne brisée (points du monde), en boucle ou en va-et-vient
function longer(o, pts, d, boucle, y = DALLE, saut = 0.004) {
  const segs = []; let L = 0;
  const n = boucle ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], l = Math.hypot(b.x - a.x, b.z - a.z); segs.push([a, b, l, L]); L += l; }
  let u = boucle ? ((d % L) + L) % L : L - Math.abs(((d % (2 * L)) + 2 * L) % (2 * L) - L);
  const sens = boucle || ((d % (2 * L)) + 2 * L) % (2 * L) < L ? 1 : -1;
  const s = segs.find(x => u <= x[3] + x[2]) || segs[segs.length - 1], f = (u - s[3]) / s[2];
  o.position.set(s[0].x + (s[1].x - s[0].x) * f, y + Math.abs(Math.sin(d * 60)) * saut, s[0].z + (s[1].z - s[0].z) * f);
  o.rotation.set(0, -Math.atan2((s[1].z - s[0].z) * sens, (s[1].x - s[0].x) * sens), 0);
}

// ------------------------------------------------------------------ toute la vie du bourg (reconstruite avec les bâtiments)
let VIE = null;
const lampeAllumee = j => (SOIR() && H.p > 1.5 + j * 5) || NUIT() || (AUBE() && H.p < 1.5 + j * 5) || (METEO === 'brouillard' && !NUIT()); // l'allumeur passe toutes les 5 s
function construireVie() {
  for (const p of POOLS.values()) p.list.length = 0;
  ACT = []; ETIQ.clear(); jeter(VIE); VIE = new THREE.Group(); scene.add(VIE);
  const A = (nom, s = ECH) => acteur(nom, s);
  const kc = parCle('cabane'), km = parCle('maison'), kp = parCle('maison_pierre'), kt = parCle('taverne'), kb = parCle('boulangerie'), kh = centre;
  const S = 0.4; // échelle d'un personnage dans un cadre (unités de web_power)
  const tourPlace = [0, 1, 2, 3, 4, 5].map(i => coin(i, 0.98)), portesDe = k => PORTES.filter(p => p.k === k);
  const volets = EPOQUE === 'lumieres' || EPOQUE === 'empire';

  // ---- la vie ordinaire par beau temps
  const routes = [tourPlace, [coin(1, 2), coin(1), coin(2), coin(2, 2)], [coin(4, 2), coin(4), coin(5), coin(5, 2)], [coin(3, 2), coin(3), coin(2), coin(1), coin(0), coin(0, 2)]];
  ['passant0', 'passante0', 'passant1', 'passante1'].forEach((nom, i) => { const v = 0.045 + i * 0.006, ph = i * 1.7; ajoute(A(nom), (t, dt, o) => longer(o, routes[i], t * v + ph, i === 0), () => DEHORS() && SEC() && METEO !== 'canicule', 'meteo', 'Passants dans les rues'); });
  { const d = portesDe(km)[1] || portesDe(km)[0]; [['commere0', -0.5, 0], ['commere1', 0.5, Math.PI]].forEach(([nom, x, ry], i) => ajoute(A(nom), (t, dt, o) => surCadre(o, d.m, x, 0.25, 1.1, ry, 0, Math.sin(t * 2.2 + i * 2) * 0.06, S), () => DEHORS() && DOUX(), 'meteo', 'Des voisines bavardent sur le pas de la porte')); }
  ['enfant0', 'enfant1', 'enfant2'].forEach((nom, i) => ajoute(A(nom, ECH * 0.75), (t, dt, o) => { const a = i * 2.1 + t * 1.1, p = pres(kh, 1.8 + Math.cos(a) * 1.15, 2.6 + Math.sin(a) * 1.15); o.position.set(p.x, p.y + Math.abs(Math.sin(t * 9 + i)) * 0.01, p.z); o.rotation.y = capB(kh, -Math.sin(a), Math.cos(a)); }, () => DEHORS() && DOUX() && !NEIGE_SOL(), 'meteo', 'Enfants qui jouent autour de la fontaine'));
  ['enfant1', 'enfant2'].forEach((nom, i) => { const fo = pres(kh, 1.8, 2.6); ajoute(A(nom, ECH * 0.75), (t, dt, o) => { const a = i * Math.PI + Math.sin(t * 0.7) * 0.6, p = pres(kh, 1.8 + Math.cos(a) * 0.95, 2.6 + Math.sin(a) * 0.95), saut = Math.max(0, Math.sin(t * 5 + i * 2)); o.position.set(p.x, p.y + saut * 0.02, p.z); o.rotation.y = capB(kh, -Math.cos(a), -Math.sin(a)); if (saut > 0.97 && Math.random() < 0.5) for (let n = 0; n < 3; n++) particule({ x: fo.x + (Math.random() - 0.5) * 0.04, y: 0.08, z: fo.z + (Math.random() - 0.5) * 0.04, vx: (p.x - fo.x) * 2 + (Math.random() - 0.5) * 0.1, vy: 0.35 + Math.random() * 0.2, vz: (p.z - fo.z) * 2 + (Math.random() - 0.5) * 0.1, g: 1.4, s: 0.004, col: 0x9fd4f2, vie: 0.6 }); }, () => DEHORS() && METEO === 'canicule', 'meteo', 'Canicule : les enfants s\'aspergent à la fontaine'); });
  { const d = portesDe(kc)[0]; ajoute(A('chat1', ECH * 1.3), (t, dt, o) => surCadre(o, d.m, 0.62, 0.25, 0.4, -Math.PI / 2 + Math.sin(t * 0.4) * 0.5, 0, 0, S * 1.3), () => JOUR() && DOUX(), 'meteo', 'Un chat somnole devant une porte'); }
  { const f = fenetreLibre('maison', 1) || FEN[0]; ajoute(A('chat0', ECH * 1.3), (t, dt, o) => { surCadre(o, f.m, 0, -f.h / 2 - 0.01, 0.2, 0, 0, 0, S * 1.3); o.scale.y *= 0.7; }, () => JOUR() && METEO === 'canicule', 'meteo', 'Canicule : un chat s\'étire sur le rebord d\'une fenêtre'); }
  // ---- le linge sur sa corde (cabane) : il sèche, claque dans la tempête, on le décroche quand le ciel se couvre
  {
    const g = new THREE.Group(), p = pres(kc, LINGE.x, LINGE.z); g.position.set(p.x, kc.top, p.z); g.rotation.y = kc.rot + LINGE.cap; g.scale.setScalar(ECH_BAT); VIE.add(g);
    const draps = [0xf6f2ea, 0x9fc4e8, 0xf2d6d6, 0xe8dcc0].map((c, j) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.6).translate(0, -0.3, 0), toon(c, { side: THREE.DoubleSide })); m.position.set(-1.0 + j * 0.66, 2.34, 0); m.castShadow = true; g.add(m); return m; });
    const nb = () => METEO === 'nuageux' ? 4 - Math.min(4, Math.floor((t % 20) / 3)) : 4;
    ajoute(g, (t) => draps.forEach((m, j) => { m.visible = j < nb(); const a = Math.sin(t * (2 + VENT * 4) + j * 1.3) * (0.15 + VENT * 0.5); m.rotation.x = METEO === 'tempete' ? -1.2 + Math.sin(t * 9 + j) * 0.35 : a; }), () => (DEHORS() && SEC()) || (METEO === 'tempete' && !NUIT()), 'meteo', 'Le linge sèche sur la corde');
    etiq('meteo', 'Tempête : le linge claque à l\'horizontale', () => METEO === 'tempete' && !NUIT());
    const a = posB(kc, LINGE.x + Math.cos(-LINGE.cap) * 0, LINGE.z + 0.7);
    ajoute(A('commere1'), (t, dt, o) => { const u = Math.min(4, Math.floor((t % 20) / 3)), q = posB(kc, LINGE.x + Math.cos(LINGE.cap) * (-1 + Math.min(u, 3) * 0.66) + Math.sin(LINGE.cap) * 0.6, LINGE.z - Math.sin(LINGE.cap) * (-1 + Math.min(u, 3) * 0.66) + Math.cos(LINGE.cap) * 0.6); o.position.set(q.x, kc.top + DALLE, q.z); o.rotation.y = kc.rot + LINGE.cap + Math.PI / 2; void a; }, () => DEHORS() && METEO === 'nuageux', 'meteo', 'Nuageux : on décroche le linge, au cas où');
  }

  // ---- la pluie : on court ou on s'abrite selon l'époque
  const modelesPluie = { ancien: ['sac', 'sac', 'sac'], lumieres: ['sac', 'parapluieVert', 'parapluieRouge'], empire: ['parapluieVert', 'parapluieRouge', 'parapluieNoir2'], industrie: ['parapluieNoir', 'parapluieNoir2', 'parapluieNoir'] }[EPOQUE];
  modelesPluie.forEach((nom, i) => { const v = nom === 'sac' ? 0.13 : 0.06, ph = i * 2.3; ajoute(A(nom), (t, dt, o) => longer(o, routes[(i + 1) % 4], t * v + ph, (i + 1) % 4 === 0, DALLE, nom === 'sac' ? 0.012 : 0.004), () => DEHORS() && PLUIE(), 'meteo', EPOQUE === 'ancien' ? 'Pluie : on court, un sac sur la tête' : 'Pluie : on court ou on passe sous son parapluie'); });
  etiq('epoque', { ancien: '1700 : pas encore de parapluie, un sac sur la tête', lumieres: 'Lumières : premiers parapluies (verts, rouges)', empire: 'Empire : parapluies de couleur', industrie: 'Industrie : parapluies noirs' }[EPOQUE], () => DEHORS() && PLUIE());
  if (volets) etiq('meteo', 'Les volets se ferment un à un', () => PLUVIEUX() || (METEO === 'neige' && !DEHORS()));
  etiq('meteo', 'L\'eau ruisselle des avant-toits', () => PLUIE());
  etiq('meteo', 'Les flaques grandissent, la pluie y fait des ronds', () => PLUIE());
  etiq('meteo', 'Les flaques sèchent au soleil revenu', () => !PLUIE() && FLAQUE > 0.03);
  if (EPOQUE === 'ancien') etiq('meteo', 'Seaux sous les fuites des chaumières', () => PLUIE());
  etiq('meteo', 'Orage : rideaux tirés, les vitres flashent à chaque éclair', () => METEO === 'orage');
  etiq('meteo', 'Personne dehors par ce temps', () => (METEO === 'orage' || METEO === 'tempete') && DEHORS());
  if (volets) etiq('meteo', 'Tempête : les volets mal attachés battent', () => METEO === 'tempete');
  etiq('meteo', 'Tempête : fumées couchées par le vent', () => METEO === 'tempete');
  // tuiles qui s'envolent
  { let pro = 0; const toits = TOITS.filter(r => r.petit); ajoute(new THREE.Object3D(), (t, dt) => { if ((pro -= dt) > 0 || !toits.length) return; pro = 0.5 + Math.random() * 0.8; const r = toits[Math.random() * toits.length | 0], p = dansCadre(r.m, (Math.random() - 0.5) * r.w * 0.4, r.h * 0.75, (Math.random() - 0.5) * r.d * 0.7); particule({ genre: 'plaque', x: p.x, y: p.y, z: p.z, vx: 0.25 + Math.random() * 0.2, vy: 0.3 + Math.random() * 0.25, vz: 0.1 + Math.random() * 0.1, g: 0.55, spin: 7 + Math.random() * 6, s: 0.03, forme: [1, 0.15, 0.7], col: r.col, vie: 2.6, sol: 0.004, vent: 0.6 }); }, () => METEO === 'tempete', 'meteo', 'Tempête : des tuiles s\'envolent des toits'); }

  // ---- la neige
  etiq('meteo', 'Toits blanchis, stalactites de glace sous les avant-toits', () => NEIGE_SOL());
  etiq('meteo', 'Bonhomme de neige près des chaumières', () => NEIGE_SOL());
  etiq('meteo', 'Cheminées qui fument plus fort et plus épais', () => METEO === 'neige');
  { const d = portesDe(km)[0]; ajoute(A('pelleteur'), (t, dt, o) => { const u = t * 0.45, x = Math.sin(u) * 0.7, sens = Math.cos(u) > 0 ? 0 : Math.PI, pelle = Math.max(0, Math.sin(t * 3.5)); surCadre(o, d.m, x, 0.25, 1.35, sens, 0, -pelle * 0.5, S); if (pelle > 0.98 && Math.random() < 0.35) { const p = dansCadre(d.m, x, 0.4, 1.9); for (let n = 0; n < 4; n++) particule({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 0.15, vy: 0.2 + Math.random() * 0.15, vz: (Math.random() - 0.5) * 0.15, g: 0.9, s: 0.005, col: 0xf6f8fb, vie: 0.8, sol: 0.026 }); } }, () => NEIGE_SOL() && DEHORS() && METEO !== 'tempete', 'meteo', 'On déneige devant sa porte, à la pelle'); }
  {
    const equipes = [[-2.6, 0.9, 0], [-2.3, -1.0, 0], [2.6, 1.3, Math.PI], [2.9, -0.1, Math.PI]], gamins = [];
    equipes.forEach(([x, z, ry], i) => gamins.push(ajoute(A(`enfantH${i}`, ECH * 0.75), (t, dt, o) => { const p = pres(kp, x + Math.sin(t * 0.8 + i) * 0.4, z + Math.cos(t * 0.6 + i) * 0.3); o.position.set(p.x, p.y + Math.max(0, Math.sin(t * 4 + i * 1.7)) * 0.008, p.z); o.rotation.y = kp.rot + ry; }, () => NEIGE_SOL() && DEHORS() && ['beau', 'nuageux', 'neige'].includes(METEO), 'meteo', 'Bataille de boules de neige')));
    let pro = 0;
    ajoute(new THREE.Object3D(), (t, dt) => { if ((pro -= dt) > 0) return; pro = 0.45 + Math.random() * 0.4; const a = Math.random() * 4 | 0, b = a < 2 ? 2 + (Math.random() * 2 | 0) : Math.random() * 2 | 0, A_ = gamins[a].position, B = gamins[b].position, T = 0.75, g = 0.7; particule({ x: A_.x, y: A_.y + 0.07, z: A_.z, vx: (B.x - A_.x) / T, vz: (B.z - A_.z) / T, vy: (0.5 * g * T * T) / T, g, s: 0.0055, col: 0xffffff, vie: T, fin: p => { for (let n = 0; n < 4; n++) particule({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 0.2, vy: 0.1 + Math.random() * 0.1, vz: (Math.random() - 0.5) * 0.2, g: 0.8, s: 0.0028, col: 0xffffff, vie: 0.4 }); } }); }, () => NEIGE_SOL() && DEHORS() && ['beau', 'nuageux', 'neige'].includes(METEO));
  }

  // ---- brouillard et canicule
  ajoute(A('porteLanterne'), (t, dt, o) => { longer(o, tourPlace, t * 0.04 + 2, true); o.updateMatrix(); GRAND.mettre(_v.set(0.55, 1.3, 0.3).applyMatrix4(o.matrix), _col.setHex(RUE[EPOQUE]), 0.55); }, () => METEO === 'brouillard' && !NUIT(), 'meteo', 'Brouillard : un passant éclaire son chemin à la lanterne');
  etiq('meteo', 'Brouillard : lanternes des portes et réverbères allumés en plein jour', () => METEO === 'brouillard' && JOUR());
  etiq('meteo', 'Canicule : fenêtres grandes ouvertes, voilages qui ondulent', () => METEO === 'canicule' && JOUR());
  etiq('meteo', 'Canicule : presque plus de fumée', () => METEO === 'canicule');
  etiq('meteo', 'Les ombres des nuages glissent sur les toits', () => ['nuageux', 'pluie', 'orage', 'tempete', 'neige'].includes(METEO) && JOUR());
  [['assis0', 0.4, 4.0, -0.4], ['assis1', 2.7, 3.7, Math.PI + 0.5]].forEach(([nom, x, z, ry], i) => ajoute(A(nom), (t, dt, o) => { const p = pres(kc, x, z); o.position.set(p.x, p.y, p.z); o.rotation.set(0, kc.rot + ry, Math.sin(t * 7 + i) * 0.05); }, () => METEO === 'canicule' && JOUR(), 'meteo', 'Canicule : deux voisins s\'éventent à l\'ombre de l\'arbre'));

  // ---- les saisons
  etiq('saison', 'Jardinières fleuries sous les fenêtres', () => SAISON === 1);
  etiq('saison', 'Géraniums rouges aux fenêtres', () => SAISON === 2);
  etiq('saison', 'Nids d\'hirondelles sous les avant-toits', () => SAISON === 1 || SAISON === 2);
  etiq('saison', 'Potager : pousses au printemps, tomates et choux l\'été, citrouilles l\'automne', () => SAISON !== 0 && !NEIGE_SOL());
  etiq('saison', 'Citrouilles devant les portes, confitures sur les rebords', () => SAISON === 3);
  etiq('saison', 'Couronnes de houx aux portes, guirlande sur la mairie', () => SAISON === 0);
  etiq('saison', 'Bois de chauffage empilé : grand tas à l\'automne, entamé l\'hiver', () => SAISON === 3 || SAISON === 0);
  etiq('saison', 'Hiver : toutes les cheminées fument épais', () => SAISON === 0);
  etiq('saison', 'Été : peu de feux, seulement pour la cuisine', () => SAISON === 2 && METEO !== 'canicule' && !NEIGE_SOL());
  // ménage de printemps : tapis battus aux fenêtres
  ['maison', 'maison_pierre', 'immeuble'].map(fenetreLibre).filter(Boolean).forEach((f, i) => ajoute(A(`tapis${i % 2}`), (t, dt, o) => { const cy = (t + i * 1.1) % 3, bat = cy < 1.2 ? Math.max(0, Math.sin(cy * 13)) : 0; surCadre(o, f.m, 0, -f.h / 2 + 0.02, 0.09, 0, -bat * 0.35, 0, 0.7); if (bat > 0.95 && Math.random() < 0.5) { const p = dansCadre(f.m, 0, -f.h / 2 - 0.35, 0.3); for (let n = 0; n < 3; n++) particule({ x: p.x + (Math.random() - 0.5) * 0.03, y: p.y, z: p.z, vx: f.n.x * 0.05 + (Math.random() - 0.5) * 0.04, vy: 0.03, vz: f.n.z * 0.05 + (Math.random() - 0.5) * 0.04, s: 0.008, grandit: 2.5, col: 0xd9c9a0, vie: 1.3 }); } }, () => SAISON === 1 && DEHORS() && SEC(), 'saison', 'Ménage de printemps : tapis battus aux fenêtres'));
  // hirondelles
  { const c = { x: (km.x + kc.x) / 2, z: (km.z + kc.z) / 2 }; for (let i = 0; i < 5; i++) ajoute(A('hirondelle', 0.02), (t, dt, o) => { const a = t * (1.3 + i * 0.12) + i * 1.3, r = 0.35 + 0.2 * Math.sin(t * 0.7 + i); o.position.set(c.x + Math.cos(a) * r, 0.25 + Math.sin(t * 2.1 + i) * 0.07, c.z + Math.sin(a) * r * 0.8); o.rotation.set(0, -a - Math.PI / 2, Math.sin(t * 2.1 + i) * 0.3); o.scale.set(0.02, 0.02, 0.02 * (0.25 + Math.abs(Math.sin(t * 15 + i)))); }, () => (SAISON === 1 || SAISON === 2) && JOUR() && SEC(), 'saison', 'Hirondelles qui virevoltent autour des toits'); }
  // jardinier qui arrose le potager
  { const [px, pz] = ROND(0), a0 = 0.4 + Math.PI / 4, tg = [Math.cos(a0 - Math.PI / 2 + Math.PI), Math.sin(a0 - Math.PI / 2 + Math.PI)]; let pro = 0;
    ajoute(A('jardinier'), (t, dt, o) => { const u = Math.sin(t * 0.25) * 1.1, p = pres(kc, px + Math.cos(a0) * 1.15 + tg[0] * u, pz + Math.sin(a0) * 1.15 + tg[1] * u); o.position.set(p.x, p.y, p.z); o.rotation.y = capB(kc, -Math.cos(a0), -Math.sin(a0)); o.updateMatrix(); if ((pro -= dt) <= 0) { pro = 0.12; const b = _v.set(1.05, 0.95, 0.3).applyMatrix4(o.matrix); particule({ x: b.x, y: b.y, z: b.z, vx: (Math.random() - 0.5) * 0.02 - Math.cos(o.rotation.y) * -0.05, vy: 0, vz: (Math.random() - 0.5) * 0.02, g: 0.6, s: 0.003, col: 0x9fd4f2, vie: 0.35 }); } }, () => SAISON === 2 && JOUR() && SEC() && METEO !== 'brouillard', 'saison', 'Le jardinier arrose le potager'); }
  // on dîne dehors les soirs d'été
  TABLES.forEach((T, n) => {
    const M = cadre(T.k, T.x, 0.25, T.z, T.ry);
    [[-0.5, 0.95, Math.PI / 2], [0.5, 0.95, Math.PI / 2], [-0.5, -0.95, -Math.PI / 2], [0.5, -0.95, -Math.PI / 2]].forEach(([x, z, ry], i) => ajoute(A(`assis${(i + n) % 4}`), (t, dt, o) => surCadre(o, M, x, 0, z, ry, 0, Math.sin(t * 1.7 + i * 2 + n) * 0.07, S), () => SAISON === 2 && SEC() && (SOIR() || (NUIT() && H.p < 35)), 'saison', 'Les soirs d\'été, on dîne dehors à la lanterne'));
  });
  // râteau et feuilles mortes
  { const arbre = monde(kp, 1.8, 1.6, -1.6);
    ajoute(A('rateleur'), (t, dt, o) => { const u = (Math.sin(t * 0.3) + 1) / 2, p = pres(kp, -0.6 + 2.4 * u, 2.5 - 0.4 * u); o.position.set(p.x, p.y, p.z); o.rotation.set(0, capB(kp, 0.3, 1), Math.sin(t * 3.2) * 0.12); if (Math.random() < dt * 3) particule({ genre: 'plaque', x: arbre.x + (Math.random() - 0.5) * 0.1, y: arbre.y + 0.02, z: arbre.z + (Math.random() - 0.5) * 0.1, vx: 0.02 + (Math.random() - 0.5) * 0.04, vy: -0.03, vz: (Math.random() - 0.5) * 0.04, g: 0.02, spin: 3, s: 0.012, forme: [1, 0.2, 0.7], col: [0xd9822b, 0xc9a13a, 0xb5562a, 0xe0b040][Math.random() * 4 | 0], vie: 4, sol: 0.026 }); }, () => SAISON === 3 && DEHORS() && SEC(), 'saison', 'On ratisse les feuilles mortes en tas');
  }
  // on fend du bois à l'automne, on le rentre l'hiver
  { const [bx, bz] = ROND(1), bil = monde(kc, bx + 1.4, 0.8, bz + 0.6);
    ajoute(A('fendeur'), (t, dt, o) => { const p = pres(kc, bx + 0.55, bz + 0.6), s = Math.sin(t * 4); o.position.set(p.x, p.y, p.z); o.rotation.set(0, capB(kc, 1, 0), -Math.max(0, s) * 0.6); if (s < -0.97 && Math.random() < 0.4) for (let n = 0; n < 3; n++) particule({ genre: 'plaque', x: bil.x, y: bil.y, z: bil.z, vx: (Math.random() - 0.5) * 0.25, vy: 0.2 + Math.random() * 0.2, vz: (Math.random() - 0.5) * 0.25, g: 1.2, spin: 10, s: 0.006, forme: [1, 0.4, 0.6], col: 0xd9b07a, vie: 0.7, sol: 0.026 }); }, () => SAISON === 3 && DEHORS() && SEC(), 'saison', 'On fend des bûches, les copeaux volent');
    const tas = pres(kc, bx, bz + 1.4), porte = portesDe(kc).map(d => dansCadre(d.m, 0, 0, 1.0)).sort((a, b) => Math.hypot(a.x - tas.x, a.z - tas.z) - Math.hypot(b.x - tas.x, b.z - tas.z))[0];
    ajoute(A('porteurBois'), (t, dt, o) => longer(o, [tas, porte], t * 0.04, false), () => SAISON === 0 && DEHORS() && METEO !== 'tempete' && METEO !== 'orage', 'saison', 'L\'hiver, on rentre le bois du tas à la maison');
  }

  // ---- l'heure : fenêtres, volets, fumées, allumeur, veilleur, bêtes de la nuit, boulanger, coq, taverne
  etiq('heure', 'Les fenêtres s\'allument une à une', () => SOIR());
  etiq('heure', 'Les fenêtres s\'éteignent tard, une à une' + (volets ? ', et leurs volets se ferment' : ''), () => NUIT() && H.p < 56);
  etiq('heure', 'Quelques veilleurs gardent leur lampe toute la nuit', () => NUIT() && H.p >= 56);
  etiq('heure', 'Ombres chinoises derrière les rideaux, on danse à la taverne', () => (NUIT() || SOIR()) && H.p > 4);
  etiq('heure', 'Quelques lève-tôt ont allumé leur lampe', () => AUBE() && H.p < 20);
  if (volets) etiq('heure', 'Les volets s\'ouvrent un à un', () => AUBE() && !PLUVIEUX());
  etiq('heure', 'Fumée du matin : on rallume tous les feux', () => AUBE() && METEO !== 'canicule');
  etiq('heure', 'Une cheminée sur deux fume', () => JOUR() && SAISON !== 0 && SAISON !== 2 && METEO !== 'canicule' && METEO !== 'neige');
  etiq('heure', 'On allume le feu pour le souper', () => SOIR() && METEO !== 'canicule');
  etiq('heure', 'Les lanternes des portes s\'allument', () => SOIR() || NUIT());
  etiq('heure', () => `Ciel étoilé, ${NOM_PHASE(PHASE_LUNE(MOIS))} (${NOMS_MOIS[MOIS]})`, () => (NUIT() || (AUBE() && H.p < 15)) && CLAIR() > 0);
  etiq('heure', 'Étoiles filantes des nuits d\'été', () => NUIT() && SAISON === 2 && CLAIR() >= 1);
  etiq('heure', 'Ciel couvert : ni lune ni étoiles', () => NUIT() && !CLAIR());
  // l'allumeur de réverbères, à toutes les époques
  if (LAMPES.length) {
    const pts = LAMPES.map(l => ({ x: l.p.x - 0.03, z: l.p.z }));
    ajoute(A('allumeur'), (t, dt, o) => {
      const q = Math.max(0, H.p - 1), j = Math.min(LAMPES.length - 1, Math.floor(q / 5)), tau = q - j * 5;
      const a = pts[j], b = pts[Math.min(LAMPES.length - 1, j + 1)], f = tau < 1 ? 0 : Math.min(1, (tau - 1) / 4);
      o.position.set(a.x + (b.x - a.x) * f, kh.top + DALLE + (f > 0 && f < 1 ? Math.abs(Math.sin(t * 9)) * 0.004 : 0), a.z + (b.z - a.z) * f);
      o.rotation.set(0, f > 0 ? -Math.atan2(b.z - a.z, b.x - a.x) : o.rotation.y, tau < 1 ? 0.35 : 0);
    }, () => (SOIR() || AUBE()) && H.p < 5 * LAMPES.length + 1, 'heure', 'L\'allumeur passe de réverbère en réverbère');
    etiq('epoque', { ancien: 'Lanternes à chandelle sur la place', lumieres: 'Réverbères à huile sur potence', empire: 'Réverbères à huile sur potence', industrie: 'Réverbères à gaz, lumière blanche et fixe' }[EPOQUE], () => LAMPES.some((l, j) => lampeAllumee(j)));
  }
  etiq('epoque', { ancien: 'Chandelles orangées qui vacillent aux fenêtres', lumieres: 'Lampes à huile aux fenêtres', empire: 'Lampes à huile plus claires aux fenêtres', industrie: 'Becs de gaz aux fenêtres : plus de lumières, et plus tard' }[EPOQUE], () => FEN.some(f => f.lum > 0.3));
  etiq('epoque', { ancien: 'Colombages, pas de volets', lumieres: 'Volets peints, ouverts le jour, fermés la nuit', empire: 'Volets, ouverts le jour, fermés la nuit', industrie: 'Brique et ardoise, pas de volets' }[EPOQUE], () => true);
  if (EPOQUE === 'industrie') etiq('epoque', 'Fumée de charbon grise aux cheminées des immeubles', () => partFoyers().part > 0.2);
  // le veilleur de nuit, sa lanterne et sa cloche
  { const ronde = [0, 1, 2, 3, 4, 5].map(i => coin(-i, 0.95)), cloche = A('cloche', ECH * 1.4); let avant = 0;
    const v = ajoute(A('veilleur'), (t, dt, o) => {
      longer(o, ronde, t * 0.035, true, DALLE, 0.003); o.updateMatrix();
      HALO.mettre(_v.set(0.45, 1.1, 0.38).applyMatrix4(o.matrix), _col.setHex(RUE[EPOQUE]), 1); GRAND.mettre(_v, _col, 0.35);
      const cy = t % 6, ag = cy < 1.6 ? Math.sin(cy * 12) * 0.7 : 0;
      _v.set(0.1, 3.1, -0.42).applyMatrix4(o.matrix); cloche.position.copy(_v); cloche.rotation.set(0, o.rotation.y, ag);
      if (cy < 1.6 && Math.floor(cy * 12 / Math.PI) !== avant) { avant = Math.floor(cy * 12 / Math.PI); if (avant % 2 === 0) particule({ genre: 'son', x: _v.x, y: _v.y + 0.01, z: _v.z, s: 0.035, col: 0xfff0c0, vie: 0.6 }); }
    }, () => NUIT() || (SOIR() && H.p > 18), 'heure', 'Le veilleur de nuit fait sa ronde, lanterne et cloche');
    ajoute(cloche, null, () => v.visible);
  }
  // chat sur un faîtage
  { const r = TOITS.find(x => x.k === km && x.petit) || TOITS[0];
    ajoute(A('chat0', ECH * 1.3), (t, dt, o) => { const u = t * 0.22, z = Math.sin(u) * r.d * 0.36, sens = Math.cos(u) >= 0; surCadre(o, r.m, 0, r.h - 0.05, z, sens ? -Math.PI / 2 : Math.PI / 2, 0, 0, S * 1.3); o.updateMatrix(); if (NUIT()) for (const e of [0.07, -0.07]) PETIT.mettre(_v.set(0.62, 0.66, e).applyMatrix4(o.matrix), _col.setHex(0xd8ff6a), 1); }, () => (SOIR() || NUIT()) && SEC(), 'heure', 'Un chat se promène sur un faîtage, les yeux brillants');
  }
  // hibou de la lisière
  ajoute(A('hibou', ECH * 1.5), (t, dt, o) => { o.position.set(ARBRE_HIBOU.x + 0.115, 0.02 + 0.205, ARBRE_HIBOU.z); const vif = Math.sin(t * 0.37) > 0.6 ? 1.6 : 0; o.rotation.y = Math.atan2(cam.position.x - o.position.x, cam.position.z - o.position.z) - Math.PI / 2 + Math.sin(t * 0.5) * 1.1 + vif; o.updateMatrix(); for (const e of [0.12, -0.12]) PETIT.mettre(_v.set(0.33, 0.95, e).applyMatrix4(o.matrix), _col.setHex(0xffd34d), NUIT() ? 1 : 0.4); }, () => (NUIT() || (SOIR() && H.p > 15)) && !PLUVIEUX(), 'heure', 'Un hibou tourne la tête dans l\'arbre de la lisière');
  // chauves-souris
  for (let i = 0; i < 4; i++) ajoute(A('chauvesouris', 0.022), (t, dt, o) => { const a = t * (0.9 + i * 0.25) + i * 1.6, r = 0.55 + 0.3 * Math.sin(t * 0.8 + i * 2); o.position.set(centre.x + Math.cos(a) * r + Math.sin(t * 3.1 + i) * 0.08, 0.36 + Math.sin(t * 2.3 + i) * 0.1, centre.z + Math.sin(a) * r + Math.cos(t * 2.7 + i) * 0.08); o.rotation.set(0, -a - Math.PI / 2, Math.sin(t * 3 + i) * 0.4); o.scale.set(0.022, 0.022, 0.022 * (0.2 + Math.abs(Math.sin(t * 18 + i)))); }, () => (SOIR() || NUIT()) && SAISON !== 0 && SEC() && METEO !== 'brouillard', 'heure', 'Chauves-souris autour des toits');
  // le coq sur la meule de la chaumière
  { const p = pres(kc, 0, 0); let avant = 0;
    ajoute(A('coq', ECH * 1.4), (t, dt, o) => { const cy = t % 2.6, chante = cy < 0.9; o.position.set(p.x, p.y + 0.108, p.z); o.rotation.set(0, Math.atan2(cam.position.x - p.x, cam.position.z - p.z) - Math.PI / 2 + 0.7, chante ? 0.45 : Math.sin(t * 3) * 0.05); if (chante && avant >= 0.9) { o.updateMatrix(); const b = _v.set(0.5, 1.0, 0).applyMatrix4(o.matrix); for (let n = 0; n < 3; n++) particule({ genre: 'son', x: b.x, y: b.y + 0.004, z: b.z, s: 0.018 + n * 0.008, col: 0xfff6d0, vie: 0.5 + n * 0.25 }); } avant = cy; }, () => AUBE() || (JOUR() && H.p < 25 && HEURE === 'cycle'), 'heure', 'Le coq chante sur la meule'); }
  // le boulanger : il allume son four avant l'aube, puis sort ses pains
  { const four = monde(kb, 3.2, 0.55, 0.4);
    ajoute(A('boulanger'), (t, dt, o) => { const p = pres(kb, 3.2, 1.35); o.position.set(p.x, p.y, p.z); o.rotation.set(0, capB(kb, 0, -1), -Math.max(0, Math.sin(t * 1.4)) * 0.45); }, () => NUIT() && H.p > 35, 'heure', 'Le boulanger allume son four avant l\'aube');
    ajoute(A('boulanger'), (t, dt, o) => longer(o, [pres(kb, 3.2, 1.35), pres(kb, 1.2, 1.9)], t * 0.03, false), () => AUBE() || (JOUR() && H.p < 60 && HEURE === 'cycle'), 'heure', 'Le boulanger sort ses pains du four');
    ajoute(new THREE.Object3D(), (t) => GRAND.mettre(four, _col.setHex(0xff7a1c), 0.75 + Math.sin(t * 11) * 0.12 + Math.sin(t * 23) * 0.08), () => (NUIT() && H.p > 32) || AUBE() || (JOUR() && H.p < 90));
  }
  // la taverne s'anime le soir
  { const d = portesDe(kt)[0], quand = () => ((SOIR() && H.p > 3) || (NUIT() && H.p < 50)) && METEO !== 'orage' && METEO !== 'tempete';
    if (d) {
      const a = dansCadre(d.m, 0, 0, 0.35), b = dansCadre(d.m, 2.2, 0, 3.4), c2 = dansCadre(d.m, -1.8, 0, 3.0);
      ajoute(A('buveur0'), (t, dt, o) => longer(o, [{ x: a.x, z: a.z }, { x: b.x, z: b.z }], t * 0.03, false, DALLE + kt.top), quand, 'heure', 'La taverne s\'anime : on entre, on sort');
      ajoute(A('buveur1'), (t, dt, o) => longer(o, [{ x: a.x, z: a.z }, { x: c2.x, z: c2.z }], t * 0.026 + 0.1, false, DALLE + kt.top), quand);
      ajoute(A('buveur2'), (t, dt, o) => { surCadre(o, d.m, 0.9 + Math.sin(t * 0.5) * 0.35, 0.25, 1.4 + Math.sin(t * 0.37) * 0.2, Math.sin(t * 0.8) * 1.2, 0, Math.sin(t * 2.1) * 0.3, S); }, quand, 'heure', 'Un buveur titube devant la taverne');
    }
  }
  installerPools();
}

// ------------------------------------------------------------------ réverbères, lanternes des portes, lanternes des tables
function majLampes() {
  const vac = EPOQUE === 'ancien' ? 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 29) * 0.05 : 1, c = _col.setHex(RUE[EPOQUE]);
  LAMPES.forEach((l, j) => { if (lampeAllumee(j)) GRAND.mettre(l.p, c, (JOUR() ? 0.55 : 1) * vac); });
  for (const L of LANTERNES) {
    const tav = L.k.cle === 'taverne' || L.k.cle === 'boulangerie';
    if (METEO === 'brouillard' || (SOIR() && H.p > 4 + L.r * 18) || (NUIT() && (tav || H.p < 30 + L.r * 50))) HALO.mettre(L.p, c, (JOUR() ? 0.7 : 0.95) * vac);
  }
  if (SAISON === 2 && SEC() && (SOIR() || (NUIT() && H.p < 35))) for (const T of TABLES) if (T.lampe) { HALO.mettre(T.lampe, c, vac); GRAND.mettre(T.lampe, c, 0.3 * vac); }
}

// ------------------------------------------------------------------ panneau « En ce moment » et bandeau de l'heure
const NOM_HEURE = { jour: 'Jour', aube: 'Aube', crepuscule: 'Crépuscule', nuit: 'Nuit' };
let signature = '';
function panneau() {
  const par = { meteo: [], saison: [], heure: [], epoque: [] };
  for (const e of ETIQ.values()) if (e.quand.some(q => q())) par[e.cat].push(typeof e.txt === 'function' ? e.txt() : e.txt);
  const sig = JSON.stringify(par);
  if (sig !== signature) {
    signature = sig;
    for (const c in par) {
      const ul = document.getElementById('l-' + c); if (!ul) continue;
      const voulu = par[c].length ? par[c] : ['Rien de particulier'];
      for (const li of [...ul.children]) if (!voulu.includes(li.textContent)) li.remove();
      const deja = new Set([...ul.children].map(li => li.textContent));
      for (const x of voulu) if (!deja.has(x)) { const li = document.createElement('li'); li.textContent = x; ul.append(li); }
    }
  }
  const fr = HEURE === 'cycle' ? horloge / CYCLE : { jour: 0.36, crepuscule: 0.75, nuit: 0.86, aube: 0.96 }[HEURE];
  document.getElementById('h-curseur').style.left = `calc(${(fr * 100).toFixed(1)}% - 2px)`;
  document.getElementById('h-texte').textContent = `${NOM_HEURE[H.phase]}${HEURE === 'cycle' ? ' · cycle accéléré' : ''} · ${Math.floor(H.p)} s`;
  document.getElementById('h-lune').textContent = `${NOMS_MOIS[MOIS][0].toUpperCase() + NOMS_MOIS[MOIS].slice(1)} · ${NOM_PHASE(PHASE_LUNE(MOIS))}`;
}

// ------------------------------------------------------------------ caméra : glisser pour tourner, molette ou pincer pour zoomer
const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
const vue = { lacet: 0.55, tangage: 0.7, d: 7, cible: V(centre.x + 0.1, 0, centre.z + 0.3), auto: !reduit };
const pointeurs = new Map(); let pince = 0;
toile.addEventListener('pointerdown', e => { pointeurs.set(e.pointerId, [e.clientX, e.clientY]); toile.setPointerCapture(e.pointerId); vue.auto = false; });
toile.addEventListener('pointermove', e => {
  if (!pointeurs.has(e.pointerId)) return;
  const [x0, y0] = pointeurs.get(e.pointerId); pointeurs.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointeurs.size === 2) { const [a, b] = [...pointeurs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pince) vue.d = THREE.MathUtils.clamp(vue.d * pince / d, 2.2, 14); pince = d; return; }
  vue.lacet -= (e.clientX - x0) * 0.008; vue.tangage = THREE.MathUtils.clamp(vue.tangage + (e.clientY - y0) * 0.005, 0.3, 1.35);
});
const lacher = e => { pointeurs.delete(e.pointerId); pince = 0; };
toile.addEventListener('pointerup', lacher); toile.addEventListener('pointercancel', lacher);
toile.addEventListener('wheel', e => { e.preventDefault(); vue.d = THREE.MathUtils.clamp(vue.d * (1 + Math.sign(e.deltaY) * 0.1), 2.2, 14); vue.auto = false; }, { passive: false });

// ------------------------------------------------------------------ boucle
function maj(dt) {
  t += dt; tMeteo += dt;
  majHeure(dt); majLumiere(); majMeteo(dt); majCiel(dt);
  majFenetres(dt); majLampes(); majCheminees(dt);
  for (const a of ACT) { if (a.quand) { a.o.visible = a.quand(); if (!a.o.visible) continue; } if (a.f) a.f(t, dt, a.o); }
  for (const f of DRAPS) { const p = f.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(t * (4 + VENT * 8) - x * 30) * x * 0.25); } p.needsUpdate = true; }
  majEau(dt); majParticules(dt); majFumees(dt); dessinerActeurs();
  HALO.fin(); GRAND.fin(); PETIT.fin();
}
let avantT = performance.now(), prochainPanneau = 0;
function image(now) {
  const dt = Math.min(0.05, (now - avantT) / 1000); avantT = now;
  const w = toile.clientWidth, h = toile.clientHeight;
  if (toile.width !== Math.round(w * renderer.getPixelRatio()) || toile.height !== Math.round(h * renderer.getPixelRatio())) { renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  if (vue.auto) vue.lacet += dt * 0.05;
  cam.position.set(vue.cible.x + Math.sin(vue.lacet) * Math.cos(vue.tangage) * vue.d, Math.sin(vue.tangage) * vue.d, vue.cible.z + Math.cos(vue.lacet) * Math.cos(vue.tangage) * vue.d);
  cam.lookAt(vue.cible); cam.updateMatrixWorld();
  soleil.target.position.copy(vue.cible); soleil.position.set(vue.cible.x - 8 - (1 - CIEL.el) * 6, 2 + 12 * CIEL.el, vue.cible.z + 7);
  maj(dt);
  if (now > prochainPanneau) { prochainPanneau = now + 400; panneau(); }
  renderer.render(scene, cam);
  requestAnimationFrame(image);
}

// ------------------------------------------------------------------ réglages
function construireTout() { construirePlateau(); construireBatiments(); construireVie(); signature = ''; }
const MOIS_SAISON = { 0: 0, 1: 3, 2: 6, 3: 9 };
function boutons() {
  const marque = (attr, v) => document.querySelectorAll(`[${attr}]`).forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(v))));
  marque('data-epoque', EPOQUE); marque('data-saison', SAISON); marque('data-meteo', METEO); marque('data-heure', HEURE);
}
function choisir(attr, fn) { document.querySelectorAll(`[${attr}]`).forEach(b => b.addEventListener('click', () => { fn(b.getAttribute(attr)); boutons(); })); }
choisir('data-epoque', v => { EPOQUE = v; construireTout(); });
choisir('data-saison', v => { SAISON = +v; MOIS = MOIS_SAISON[SAISON]; construireTout(); });
choisir('data-meteo', v => { METEO = v; tMeteo = 0; construireTout(); });
choisir('data-heure', v => { HEURE = v; pFixe = 0; if (v === 'cycle') horloge = 285; });
document.querySelector('[data-mois]').addEventListener('click', () => { MOIS = (MOIS + 1) % 12; const s = SAISON_MOIS(MOIS); if (s !== SAISON) { SAISON = s; construireTout(); boutons(); } panneau(); });
// pour les captures : régler d'un coup, avancer la simulation sans dessiner
window.MAQ = {
  regler(o) {
    if (o.epoque) EPOQUE = o.epoque;
    if (o.saison != null) { SAISON = o.saison; MOIS = o.mois ?? MOIS_SAISON[SAISON]; }
    if (o.meteo) { METEO = o.meteo; tMeteo = o.tMeteo ?? 0; }
    if (o.flaque != null) FLAQUE = o.flaque;
    if (o.eclair) { CIEL.eclair = o.eclair; CIEL.tEclair = 9; }
    if (o.heure) HEURE = o.heure;
    if (o.p != null) { if (HEURE === 'cycle') horloge = o.p; else pFixe = o.p; }
    if (o.d) vue.d = o.d; if (o.lacet != null) vue.lacet = o.lacet; if (o.tangage) vue.tangage = o.tangage; if (o.cible) vue.cible.set(o.cible[0], 0, o.cible[1]);
    vue.auto = false; construireTout(); boutons(); for (const f of FEN) { f.lum = cibleLum(f); }
  },
  avancer(s) { const e = CIEL.eclair; for (let i = 0; i < s / 0.05; i++) maj(0.05); if (e) CIEL.eclair = e; panneau(); },
  etat: () => ({ EPOQUE, SAISON, METEO, HEURE, H: { ...H }, fen: FEN.length, allumees: FEN.filter(f => f.lum > 0.5).length, parts: parts.length, visibles: ACT.filter(a => a.o.visible).length, lampes: LAMPES.length, centre: [centre.x, centre.z] }),
  panneau: () => [...document.querySelectorAll('.direct li')].map(li => li.textContent),
  tapis: () => ['maison', 'maison_pierre', 'immeuble'].map(fenetreLibre).filter(Boolean).map(f => [+f.c.x.toFixed(2), +f.c.z.toFixed(2), +Math.atan2(f.n.x, f.n.z).toFixed(2)]),
};
construireTout(); boutons();
requestAnimationFrame(image);

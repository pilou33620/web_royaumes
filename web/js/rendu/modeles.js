// Les modèles des bâtiments et des armées, dans le vocabulaire de web_power (maquette maquettes/rendu-power.html) :
// dalle hexagonale, maisons à toit en prisme, arbres boule, quartiers en couronne, fermes ; ombrage toon et contours bruns.
// Unités de web_power (une case = 10) : le groupe rendu est ramené à l'échelle du plateau par ECH_BAT.
// Chaque variante est assemblée une fois et ses deux géométries fusionnées (pièces, contours) gardées en cache ;
// chaque bâtiment posé reçoit son propre groupe qui les partage (un groupe ne se pose pas à deux endroits).
// Les coordonnées locales des modèles repris de la maquette ne doivent pas bouger : vie.js y place ses personnages.
import { THREE, SQ3, hache } from './scene.js';
import { MAT, CONT, lot, put, fusion, boite, cyl, cone, sphere } from './toon.js';

export const RW = 10, ECH_BAT = 0.1;
const EPOQUES = {
  ancien: { murs: [0xf1e4c4, 0xead7b0, 0xf6eedb], toits: [0xc9a14f, 0xb8903f, 0xa8553a, 0xc9a14f], h: 1, colomb: true, sol: 0xcdbb8e, pave: 0xd8c9a0 },
  lumieres: { murs: [0xf6eedb, 0xf1e2c2, 0xfaf6ee], toits: [0xd9573b, 0xe07a3a, 0xc4493a], h: 1.15, volets: true, sol: 0xd6c69c, pave: 0xe0d3b0 },
  empire: { murs: [0xe9e0ca, 0xddd3bc, 0xefe7d6], toits: [0x5d6f80, 0x58606c, 0xc4493a], h: 1.5, volets: true, sol: 0xd9d0b8, pave: 0xcfc6b0 },
  industrie: { murs: [0xb7634a, 0xa8553c, 0xc07a5a], toits: [0x58606c, 0x5d6f80, 0x6b6470], h: 1.7, sol: 0xc9c2b2, pave: 0xb5b0a4 },
};
const BOIS = 0x5b3a1e, PIERRE = 0xbcb6a8, ARDOISE = 0x5d6f80, VITRE = 0x3a4652, HERBE = 0xa9c66e, BUIS = 0x3e7d2c, EAU = 0x5fc0ee;
// l'assemblage en cours : les fonctions de la maquette lisent ces variables
let rnd = Math.random, SAISON = 2, NEIGE = false, EPOQUE = 'ancien', ROYAUME = '#2f5fa8', CLE = '', NIVEAU = 1;
const entre = (a, b) => a + rnd() * (b - a);
const pick = l => l[rnd() * l.length | 0];
function toit(L, w, d, h, col, x, y, z, ry = 0) {
  // prisme triangulaire : base w en x, faîte de hauteur h, long de d en z
  const p = cyl(1, 1, d, 3); p.rotateX(Math.PI / 2); p.rotateZ(Math.PI); p.scale(w / SQ3, h / 1.5, 1); p.translate(0, h / 2 - h / 3, 0);
  put(L, p, col, x, y + h / 6, z, ry, 0.26);
}
const solQ = (L, col) => put(L, cyl(RW * 0.9, RW * 0.9, 0.25, 6), col, 0, 0.12, 0, 0, 0);
function arbre(L, x, z, s = 1) { put(L, cyl(0.25, 0.3, 1.2 * s, 5), 0x7a5233, x, 0.6 * s, z, 0, 0.2); put(L, sphere(1.3 * s, 0), SAISON === 3 ? pick([0xd9822b, 0xc9a13a]) : SAISON === 0 ? 0x9aa08a : 0x5fae3e, x, 2 * s, z, 0, 0.2); }
// une maison de l'époque : murs, toit en prisme, porte ; colombages en 1700, volets ensuite, cheminée qui fume parfois
function maison(L, ex, x, z, ry, s, E, mur = pick(E.murs), toitC = pick(E.toits)) {
  const h = 1.7 * s * E.h, w = 2.2 * s, d = 2 * s, c = Math.cos(ry), sn = Math.sin(ry);
  const loc = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
  put(L, boite(w, h, d), mur, x, h / 2, z, ry);
  toit(L, w + 0.3 * s, d + 0.2 * s, 1.3 * s, toitC, x, h, z, ry);
  const [px, pz] = loc(-w * 0.22, d / 2 + 0.02); put(L, boite(0.45 * s, 0.8 * s, 0.08), BOIS, px, 0.4 * s, pz, ry, 0);
  for (const f of [1, -1]) for (const k of [-0.25, 0.25]) {
    if (f === 1 && k < 0) continue;
    const [wx, wz] = loc(k * w, f * (d / 2 + 0.02)); put(L, boite(0.4 * s, 0.4 * s, 0.08), VITRE, wx, h * 0.55, wz, ry, 0);
    if (E.volets) for (const v of [-1, 1]) { const [vx, vz] = loc(k * w + v * 0.3 * s, f * (d / 2 + 0.04)); put(L, boite(0.14 * s, 0.42 * s, 0.06), toitC === 0xc9a14f ? 0x5c7a4a : 0x4a6a7a, vx, h * 0.55, vz, ry, 0); }
  }
  if (E.colomb) for (const f of [1, -1]) { const [bx, bz] = loc(0, f * (d / 2 + 0.03)); put(L, boite(w, 0.12, 0.06), BOIS, bx, h * 0.5, bz, ry, 0); for (const k of [-0.48, 0.48]) { const [cx, cz] = loc(k * w, f * (d / 2 + 0.03)); put(L, boite(0.12, h, 0.06), BOIS, cx, h / 2, cz, ry, 0); } }
  if (rnd() < 0.55) { const [cx, cz] = loc(w * 0.28, -d * 0.15); put(L, boite(0.35 * s, 1 * s, 0.35 * s), EPOQUE === 'industrie' ? 0x8a3f2c : PIERRE, cx, h + 0.7 * s, cz, ry, 0.15); ex.fum.push([cx, h + 1.3 * s, cz, false]); }
}
const meule = (L, x, z) => put(L, new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.9, 1.1, 0.9), 0xe3c75b, x, 0, z, 0, 0.15);
function cloture(L, r, n = 14, dz = 0) { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; put(L, boite(0.25, 0.9, 0.25), 0x8a6a4a, Math.cos(a) * r, 0.45, Math.sin(a) * r + dz, 0, 0); } put(L, new THREE.TorusGeometry(r, 0.1, 3, 28).rotateX(Math.PI / 2), 0x8a6a4a, 0, 0.75, dz, 0, 0); }
function eglise(L, ex, E, x = 0, z = 0, g = 1) {
  const m = EPOQUE === 'industrie' ? 0xcfc6b0 : 0xefe3c6;
  put(L, boite(2.6 * g, 3.2 * g, 4.4 * g), m, x, 1.6 * g, z + 0.3 * g); toit(L, 3 * g, 4.6 * g, 1.5 * g, 0x8a5a44, x, 3.2 * g, z + 0.3 * g);
  put(L, boite(1.5 * g, 5.4 * g, 1.5 * g), m, x, 2.7 * g, z - 2.4 * g); put(L, cone(1.2 * g, 3.2 * g, 4), ARDOISE, x, 7 * g, z - 2.4 * g, Math.PI / 4);
  put(L, boite(0.12, 0.8 * g, 0.12), 0xf2c23a, x, 9 * g, z - 2.4 * g, 0, 0);
  for (const k of [-1, 0, 1]) put(L, boite(0.08, 0.9 * g, 0.5 * g), 0x6ab0e8, x + 1.32 * g, 1.8 * g, z + 0.3 * g + k * 1.2 * g, 0, 0);
}
const DRAP = (ex, x, y, z) => ex.drap.push([x, y, z]);
function mat(L, ex, x, z, h) { put(L, boite(0.25, h, 0.25), 0x4a3420, x, h / 2, z, 0, 0.1); DRAP(ex, x, h - 0.8, z); }

// ---- petites pièces ajoutées pour les bâtiments que la maquette ne dessinait pas
const tonneau = (L, x, z) => put(L, cyl(0.5, 0.5, 1.1, 10), 0x8a5a2b, x, 0.55, z, 0, 0.12);
const caisse = (L, x, z, s = 0.8) => put(L, boite(s, s, s), 0xb07a45, x, s / 2, z, rnd() * 1.5, 0.1);
const sac = (L, x, z) => put(L, sphere(0.45, 1).scale(1, 0.8, 1), 0xe9e2d0, x, 0.36, z, 0, 0.1);
function sapin(L, x, z, s = 1) { put(L, cyl(0.3 * s, 0.4 * s, 1.4 * s, 5), 0x7a5233, x, 0.7 * s, z); put(L, cone(1.6 * s, 2.6 * s, 6), SAISON === 0 ? 0x5f7f5a : 0x3e7f34, x, 2.4 * s, z); put(L, cone(1.2 * s, 2 * s, 6), NEIGE ? 0xf4f6f8 : 0x4c9440, x, 3.6 * s, z); }
function rondins(L, x, z, n = 5, ry = 0.3) { for (let i = 0; i < n; i++) { const b = cyl(0.45, 0.45, 3.4, 8); b.rotateZ(Math.PI / 2); put(L, b, 0xa0703f, x + (i % 2) * 0.2, 0.45 + (i >> 1) * 0.8, z + (i % 2) * 0.9, ry, 0.12); } }
function puits(L, x, z, toitC = 0xa8553a) {
  put(L, cyl(0.75, 0.75, 0.8, 10), PIERRE, x, 0.4, z, 0, 0.12); put(L, cyl(0.58, 0.58, 0.08, 10), 0x2f6fa8, x, 0.8, z, 0, 0);
  for (const dx of [-0.6, 0.6]) put(L, boite(0.15, 1.7, 0.15), BOIS, x + dx, 0.85, z, 0, 0);
  put(L, boite(1.5, 0.14, 0.14), BOIS, x, 1.6, z, 0, 0); toit(L, 1.1, 1.8, 0.55, toitC, x, 1.7, z, Math.PI / 2);
}
function reverbere(L, x, z) { put(L, boite(0.15, 2.6, 0.15), 0x2b2b30, x, 1.3, z, 0, 0.06); put(L, boite(0.42, 0.42, 0.42), 0xffe9a0, x, 2.8, z, 0, 0.06); put(L, cone(0.35, 0.3, 4), 0x2b2b30, x, 3.15, z, Math.PI / 4, 0.05); }
function colonnade(L, n, x0, pas, z, h, col = 0xfbf6ec) { for (let i = 0; i < n; i++) put(L, cyl(0.22, 0.22, h, 8), col, x0 + i * pas, h / 2, z, 0, 0.1); }
// fronton triangulaire posé sur une colonnade, faîte le long de x
function fronton(L, w, h, col, x, y, z, prof = 1.4) { toit(L, prof, w, h, col, x, y, z, Math.PI / 2); }
const dome = (L, r, col, x, y, z) => put(L, new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), col, x, y, z);
/** Un grand bâtiment : murs, toit en prisme dont le faîte suit le grand côté, fenêtres sur les deux façades, porte devant (+z). */
function edifice(L, E, w, h, d, x, z, o = {}) {
  const mur = o.mur ?? pick(E.murs), toitC = o.toit ?? pick(E.toits), ry = o.ry || 0, hT = o.hToit ?? Math.min(w, d) * 0.42;
  const c = Math.cos(ry), sn = Math.sin(ry), loc = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
  put(L, boite(w, h, d), mur, x, h / 2, z, ry);
  if (o.plat) put(L, boite(w + 0.3, 0.35, d + 0.3), toitC, x, h + 0.17, z, ry, 0.15);
  else if (w >= d) toit(L, d + 0.3, w + 0.3, hT, toitC, x, h, z, ry + Math.PI / 2);
  else toit(L, w + 0.3, d + 0.3, hT, toitC, x, h, z, ry);
  const n = Math.max(1, Math.round(w / 1.3)), etages = Math.max(1, Math.round(h / 1.8)), ip = n >> 1;
  for (const f of [1, -1]) for (let e = 0; e < etages; e++) for (let i = 0; i < n; i++) {
    if (o.porte !== false && f === 1 && e === 0 && i === ip) continue;
    const lx = -w / 2 + (i + 0.5) * w / n, y = h * (e + 0.55) / etages, [fx, fz] = loc(lx, f * (d / 2 + 0.02));
    put(L, boite(0.45, 0.6, 0.08), o.vitre ?? VITRE, fx, y, fz, ry, 0);
    if (E.volets && !o.vitre) for (const v of [-1, 1]) { const [vx, vz] = loc(lx + v * 0.32, f * (d / 2 + 0.04)); put(L, boite(0.15, 0.62, 0.06), 0x4a6a7a, vx, y, vz, ry, 0); }
  }
  if (o.porte !== false) { const [px, pz] = loc(-w / 2 + (ip + 0.5) * w / n, d / 2 + 0.03); put(L, boite(0.8, 1.3, 0.08), BOIS, px, 0.65, pz, ry, 0); }
}
// une enceinte de n côtés (un sommet vers +z) : bastions de Vauban, ou tours rondes au temps des colombages
function murs(L, r, h, col, n = 6, bastions = true, toitC = 0xa8553a) {
  const pts = [...Array(n)].map((_, i) => { const a = Math.PI / 2 + i * Math.PI * 2 / n; return [Math.cos(a) * r, Math.sin(a) * r, a]; });
  pts.forEach(([x, z, a], i) => {
    const [x2, z2] = pts[(i + 1) % n];
    put(L, boite(Math.hypot(x2 - x, z2 - z), h, 0.8), col, (x + x2) / 2, h / 2, (z + z2) / 2, -Math.atan2(z2 - z, x2 - x));
    if (bastions) put(L, cyl(1.3, 1.7, h * 1.1, 4), col, x, h * 0.55, z, -a);
    else { put(L, cyl(0.7, 0.8, h * 1.4, 10), col, x, h * 0.7, z); put(L, cone(0.95, 1.1, 10), toitC, x, h * 1.4 + 0.55, z); }
  });
}
const MINERAI = { mine_fer: 0xa5532a, mine_charbon: 0x2b2b2b, mine_or: 0xf2c23a };
// couleurs des cultures selon la saison (la neige blanchit l'hiver)
const CULTURES = () => SAISON === 0 ? (NEIGE ? [0xeef2f6, 0xe4eaef] : [0x8a6e4a, 0x7a6040]) : SAISON === 1 ? [0x9fd35a, 0x86c24a, 0xa9c457] : SAISON === 3 ? [0xc9a35a, 0xa8803f, 0x9b7d4a] : [0xe3c75b, 0xd6b24a, 0xa9c457, 0x9fbf4f];

const BATR = {
  // ---- habitat : les quartiers de web_power
  maison(L, ex, E) { solQ(L, 0x9fc46a); for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + rnd() * 0.3, l = i % 3 === 0 ? 2 : 5.6; maison(L, ex, Math.cos(a) * l, Math.sin(a) * l, a + Math.PI / 2, entre(0.95, 1.15), E); } arbre(L, 3, 1.2); arbre(L, -2.5, -1.8, 0.9); },
  cabane(L, ex, E) { solQ(L, HERBE); for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4; maison(L, ex, Math.cos(a) * 4.4, Math.sin(a) * 4.4, a + Math.PI / 2, 0.9, E); } meule(L, 0, 0); arbre(L, 1.5, 3, 0.9); },
  // maisons de pierre à étage, en couronne
  maison_pierre(L, ex, E) {
    solQ(L, 0x9fc46a);
    const Ep = { ...E, colomb: false, h: E.h * 1.4, murs: EPOQUE === 'industrie' ? E.murs : [0xd8d2c4, 0xcfc8b8, 0xe2dccd], toits: EPOQUE === 'ancien' ? [0xa8553a, 0x9a5a40, 0xb8603f] : E.toits };
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + 0.2; maison(L, ex, Math.cos(a) * 5.2, Math.sin(a) * 5.2, a + Math.PI / 2, 1.05, Ep); }
    puits(L, 0, 0, pick(E.toits)); arbre(L, 1.8, -1.6, 0.8);
  },
  // corps de logis entre cour et jardin
  hotel_particulier(L, ex, E) {
    solQ(L, E.pave);
    const m = EPOQUE === 'industrie' ? 0xd9c9a8 : 0xf3ead6, t = EPOQUE === 'ancien' ? ARDOISE : pick(E.toits);
    edifice(L, E, 7.2, 3 * E.h, 3, 0, -3, { mur: m, toit: t });
    for (const x of [-4.4, 4.4]) edifice(L, E, 2.4, 2.4 * E.h, 4.6, x, 0.2, { mur: m, toit: t, porte: false });
    for (const x of [-3.2, -1.1, 1.1, 3.2]) put(L, boite(1.6, 0.6, 1.2), BUIS, x, 0.3, 5, 0, 0.12);
    for (const x of [-2.2, 2.2]) put(L, cone(0.5, 1.6, 6), BUIS, x, 0.8, 3.4, 0, 0.1);
    put(L, cyl(0.9, 0.9, 0.4, 12), PIERRE, 0, 0.2, 2.6, 0, 0.12); put(L, cyl(0.7, 0.7, 0.08, 12), EAU, 0, 0.42, 2.6, 0, 0);
  },
  // immeubles ouvriers : hauts blocs de brique, fenêtres serrées
  immeuble(L, ex, E) {
    solQ(L, E.pave);
    const mur = EPOQUE === 'industrie' ? pick(E.murs) : 0xd8ccb4;
    for (const [x, z, w] of [[-3, -2.6, 4.6], [3.2, -2.2, 3.6], [-0.6, 3.2, 5.6]]) {
      const h = 3.4 * Math.min(E.h, 1.5);
      edifice(L, E, w, h, 2.8, x, z, { mur, toit: ARDOISE, hToit: 1 });
      put(L, boite(0.5, 1.2, 0.5), 0x8a3f2c, x + w * 0.3, h + 0.9, z - 0.4, 0, 0.12); ex.fum.push([x + w * 0.3, h + 1.6, z - 0.4, false]);
    }
    for (const [x, z] of [[5, 2.6], [-5.6, 0.8]]) put(L, boite(0.12, 2.4, 0.12), BOIS, x, 1.2, z, 0, 0);
    put(L, boite(10.6, 0.05, 0.05), 0x8a6a4a, -0.3, 2.3, 1.7, -Math.atan2(1.8, 10.6), 0); // corde à linge
    for (let i = 0; i < 4; i++) put(L, boite(0.7, 0.8, 0.05), [0xf2efe6, 0x6a8fc0, 0xd94f4f, 0xf2efe6][i], -3.6 + i * 2.4, 1.9, 1.45 - i * 0.04 + 0.45, -0.17, 0);
  },
  // la mairie au centre de la ville : beffroi en 1700, horloge aux Lumières, coupole dorée sous l'Empire (comme le centre de web_power), campanile ensuite
  // le niveau de la ville ajoute des maisons autour (2 par niveau), un puits, une enceinte (niveau 3), une tour de guet (4), des réverbères (5)
  hotel(L, ex, E) {
    solQ(L, E.pave);
    const m = EPOQUE === 'industrie' ? 0xd9c9a8 : 0xf3e6c8;
    put(L, boite(4.2, 2.8 * E.h, 3.2), m, 0, 1.4 * E.h, 0); toit(L, 4.6, 3.6, 1.4, pick(E.toits), 0, 2.8 * E.h, 0);
    if (EPOQUE === 'ancien') { put(L, boite(1.5, 6, 1.5), PIERRE, 2.6, 3, -1); put(L, cone(1.25, 2.6, 4), E.toits[2], 2.6, 7.3, -1, Math.PI / 4); }
    else if (EPOQUE === 'lumieres') { put(L, boite(1.4, 1.6, 1.4), m, 0, 3.2 * E.h + 1.6, 0); put(L, cyl(0.45, 0.45, 0.1, 12).rotateX(Math.PI / 2), 0xf7f3e6, 0, 3.2 * E.h + 1.8, 0.72, 0, 0); put(L, new THREE.SphereGeometry(0.9, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), ARDOISE, 0, 3.2 * E.h + 2.4, 0); }
    else if (EPOQUE === 'empire') { put(L, cyl(1.2, 1.2, 1.2, 10), m, 0, 3.4 * E.h, 0); put(L, new THREE.SphereGeometry(1.3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xffc94d, 0, 4 * E.h, 0); for (let i = 0; i < 4; i++) put(L, cyl(0.2, 0.2, 2.4, 8), 0xfbf6ec, -1.5 + i, 1.2, 1.8, 0, 0.1); }
    else { put(L, boite(1.6, 8, 1.6), m, 0, 4, -1); put(L, cone(1.3, 2.4, 4), ARDOISE, 0, 9.2, -1, Math.PI / 4); for (const [x, z] of [[-3.2, 2.4], [3.2, 2.2], [-3.4, -2.2], [3.4, -2.4]]) reverbere(L, x, z); } // réverbères
    const lieux = [[-5, -3], [-1.5, -5.6], [3.2, -4.6], [5.5, -0.5], [4, 4], [-0.5, 5.5], [-4.7, 3.6], [-6, 0.5]];
    for (const [x, z] of lieux.slice(0, Math.min(8, NIVEAU * 2))) maison(L, ex, x, z, Math.atan2(x, z), 0.85, E);
    put(L, cyl(0.7, 0.7, 0.6, 10), PIERRE, 1.8, 0.3, 2.6, 0, 0.12); put(L, cyl(0.55, 0.55, 0.1, 10), EAU, 1.8, 0.62, 2.6, 0, 0);
    mat(L, ex, -2.4, 1.8, 6);
    if (NIVEAU >= 2) puits(L, -3.3, -1.1, pick(E.toits));
    // plus de mur autour de la mairie : les remparts suivent maintenant les fortifications de la ville (remparts.js)
    if (NIVEAU >= 4) { put(L, cyl(0.8, 0.9, 5, 10), PIERRE, 5.6, 2.5, -3.2); put(L, cone(1.1, 1.6, 10), pick(E.toits), 5.6, 5.8, -3.2); }
    if (NIVEAU >= 5 && EPOQUE !== 'industrie') for (const [x, z] of [[-3.2, 2.4], [3.4, 1.2]]) reverbere(L, x, z);
  },
  eglise(L, ex, E) { solQ(L, HERBE); eglise(L, ex, E, 0, 0.6, 1.25); arbre(L, -4, 2.5, 1); arbre(L, 4, -3, 0.9); for (let i = 0; i < 5; i++) put(L, boite(0.5, 0.7, 0.2), PIERRE, 3.5 + (i % 2) * 1.2, 0.35, 1 + i * 0.8, 0, 0); },
  // nef en croix, façade à deux tours (vers +z), abside, flèche à la croisée
  cathedrale(L, ex, E) {
    solQ(L, E.pave);
    const m = EPOQUE === 'industrie' ? 0xcfc6b0 : 0xe6dcc4, t = 0x8a5a44;
    put(L, boite(3.6, 5, 9), m, 0, 2.5, 0); toit(L, 4, 9.2, 2.2, t, 0, 5, 0);
    put(L, boite(8, 4.4, 2.8), m, 0, 2.2, -1.2); toit(L, 3.2, 8.2, 2, t, 0, 4.4, -1.2, Math.PI / 2);
    put(L, cyl(1.8, 1.8, 4.4, 10, 1), m, 0, 2.2, -4.4); put(L, cone(2, 1.8, 10), t, 0, 5.3, -4.4);
    for (const x of [-1.5, 1.5]) { put(L, boite(1.8, 8.4, 1.8), m, x, 4.2, 4.4); put(L, cone(1.4, 3.2, 4), ARDOISE, x, 10, 4.4, Math.PI / 4); }
    put(L, cyl(0.15, 0.15, 3.6, 6), ARDOISE, 0, 8.2, -1.2, 0, 0); put(L, cone(0.6, 3, 6), ARDOISE, 0, 7.6, -1.2, 0, 0.1);
    put(L, cyl(0.8, 0.8, 0.1, 12).rotateX(Math.PI / 2), 0x6ab0e8, 0, 5.6, 5.32, 0, 0); put(L, boite(1, 1.8, 0.08), BOIS, 0, 0.9, 5.32, 0, 0);
    for (const s of [-1, 1]) for (const z of [-2.6, 0.4, 2.8]) { put(L, boite(0.5, 3.4, 0.6), m, s * 2.05, 1.7, z, 0, 0.1); put(L, boite(0.08, 1.8, 0.7), 0x6ab0e8, s * 1.82, 2.8, z + 1.2, 0, 0); }
    arbre(L, -5.2, 3.4, 0.9); arbre(L, 5.2, -4, 0.9);
  },
  // ---- fermes de web_power ; pas de silo avant l'ère industrielle : des meules
  ferme(L, ex, E) {
    put(L, boite(3.2, 2, 2.6), pick(E.murs), -3.4, 1, -3); toit(L, 3.6, 2.9, 1.4, pick(E.toits), -3.4, 2, -3);
    put(L, boite(3.6, 2.8, 4), 0xb8453a, 1.2, 1.4, -3.2); toit(L, 4, 4.4, 1.8, 0x6b3a2e, 1.2, 2.8, -3.2); put(L, boite(1.3, 1.8, 0.2), 0xf3ead6, 1.2, 0.9, -1.15, 0, 0);
    if (EPOQUE === 'industrie') { put(L, cyl(1, 1, 4.8, 10), 0xd9d5c9, 4.3, 2.4, -1.4); put(L, new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x8a9aa4, 4.3, 4.8, -1.4); }
    else { meule(L, 4.3, -1.4); meule(L, 5, 0.6); }
    const C = CULTURES();
    for (const [x, z, w, d] of [[-3.6, 2.6, 5, 3.4], [2.2, 3.4, 5.2, 2.8], [-0.4, 0.3, 4, 1.6]]) { put(L, boite(w, 0.45, d), pick(C), x, 0.22, z, 0, 0.12); for (let k = -1; k <= 1; k++) put(L, boite(w * 0.9, 0.12, 0.18), 0x8f7a3a, x, 0.5, z + k * d / 3.2, 0, 0); }
    arbre(L, 5.8, 1.6, 0.8);
  },
  // champs de pommes de terre : rangs de touffes vertes (terre nue en hiver), petite maison, sacs
  champ_patates(L, ex, E) {
    put(L, cyl(RW * 0.86, RW * 0.9, 0.3, 6), SAISON === 0 && NEIGE ? 0xeef2f6 : 0x8a6e4a, 0, 0.15, 0, 0, 0);
    const touffe = SAISON === 0 ? null : SAISON === 3 ? 0x9b8a4a : SAISON === 1 ? 0x86c24a : 0x5e9a3c;
    for (let r = 0; r < 6; r++) {
      const z = -3.6 + r * 1.5; put(L, boite(10, 0.3, 0.7), NEIGE ? 0xe4eaef : 0x7a6040, 0.6, 0.4, z, 0, 0);
      if (touffe) for (let c = -4; c <= 5; c++) { const x = c * 1.05; if (Math.hypot(x, z) > 6.6 || (x < -1 && z < -2)) continue; put(L, sphere(0.42, 0), touffe, x, 0.7, z, 0, 0); }
    }
    maison(L, ex, -4.2, -3.8, 0.4, 0.85, E);
    for (const [x, z] of [[-1.6, -4.6], [-0.9, -5.1], [-1.2, -4]]) sac(L, x, z);
    put(L, boite(1.6, 0.6, 1), 0x9b6a3c, 4.4, 0.7, -4.6, 0.3, 0.1);
  },
  bergerie(L, ex, E) {
    put(L, boite(6, 2.2, 2.8), 0xb8453a, -1.5, 1.1, -3.4); toit(L, 3.2, 6.4, 1.3, 0x6b3a2e, -1.5, 2.2, -3.4, Math.PI / 2);
    put(L, boite(2.6, 1.8, 2.2), pick(E.murs), 4, 0.9, -3.6); toit(L, 2.9, 2.5, 1.1, pick(E.toits), 4, 1.8, -3.6);
    cloture(L, 7.4, 14, 1); meule(L, 2.5, 3.2);
  },
  vignoble(L, ex, E) {
    put(L, cyl(RW * 0.86, RW * 0.9, 0.3, 6), 0xa99a6a, 0, 0.15, 0, 0, 0);
    const feuille = SAISON === 0 ? 0x8b7d6b : SAISON === 3 ? 0xb8502c : SAISON === 1 ? 0x9fd35a : 0x5e9a3c;
    for (let r = -3; r <= 3; r++) for (let c = -3; c <= 3; c++) { const x = c * 1.9, z = r * 1.7; if (Math.hypot(x, z) > 6.8 || (x > 2 && z > 2)) continue; put(L, boite(0.15, 1.2, 0.15), 0x6b4a2a, x, 0.6, z, 0, 0); put(L, sphere(0.6, 0), feuille, x, 1.3, z, 0, 0.1); }
    maison(L, ex, 4.6, 4, 0.6, 0.8, E);
  },
  moulin(L, ex, E) {
    solQ(L, 0xb3c27a);
    const tour = new THREE.LatheGeometry([[1.9, 0], [1.7, 3], [1.4, 5.6]].map(([x, y]) => new THREE.Vector2(x, y)), 12);
    put(L, tour, EPOQUE === 'industrie' ? 0xd9c9a8 : 0xf1e4c4, 0, 0, 0, 0, 0.26); put(L, cone(1.9, 2, 10), pick(E.toits), 0, 6.6, 0);
    put(L, boite(0.7, 1.3, 0.2), BOIS, 0, 0.65, 1.85, 0, 0); ex.ailes.push([0, 5, 2.1]);
    for (let i = 0; i < 3; i++) put(L, sphere(0.45, 1), 0xe9e2d0, -1.5 + i * 0.8, 0.4, 3.2, 0, 0.1);
    maison(L, ex, -4.6, -2.6, 0.6, 0.75, E); meule(L, 4, 3);
  },
  caserne(L, ex, E) {
    solQ(L, E.pave);
    const m = EPOQUE === 'industrie' ? 0xb7634a : PIERRE;
    put(L, boite(7.4, 2.8 * E.h, 3), m, 0, 1.4 * E.h, -2.6); toit(L, 3.4, 7.8, 1.3, pick(E.toits), 0, 2.8 * E.h, -2.6, Math.PI / 2);
    for (let i = 0; i < 5; i++) put(L, boite(0.6, 0.7, 0.08), VITRE, -2.8 + i * 1.4, 1.6 * E.h, -1.05, 0, 0);
    for (const x of [-4.5, 4.5]) { put(L, boite(1, 1.8, 1), 0xe9e2d0, x, 0.9, 3.6); put(L, cone(0.8, 0.8, 4), ROYAUME, x, 2.2, 3.6, Math.PI / 4, 0.12); }
    for (let i = 0; i < 4; i++) { put(L, boite(0.18, 1.6, 0.18), 0x8b5a2b, -2 + i * 1.3, 0.8, 1.5, 0, 0); put(L, boite(0.8, 0.3, 0.18), 0xc9b27a, -2 + i * 1.3, 1.3, 1.5, 0, 0); }
    mat(L, ex, 3, 0.5, 7);
  },
  forge(L, ex, E) { solQ(L, 0xb3ad9e); maison(L, ex, -1, -1.6, 0, 1.25, E); put(L, boite(0.8, 3.6, 0.8), PIERRE, 1.4, 3.4, -2.4); ex.fum.push([1.4, 5.4, -2.4, true]); put(L, boite(1.2, 0.5, 0.6), 0x444444, 2.4, 0.9, 2.2); put(L, boite(0.5, 0.7, 0.4), 0x555555, 2.4, 0.35, 2.2, 0, 0); put(L, boite(2.4, 1.2, 1.6), 0x8a6a4a, -2.6, 0.6, 3, 0.3); },
  taverne(L, ex, E) { solQ(L, 0xc9b98e); maison(L, ex, -0.6, -1, 0, 1.45, E); put(L, boite(0.18, 2.4, 0.18), 0x8b5a2b, 3, 1.2, 2.4, 0, 0); put(L, boite(1.4, 0.18, 0.18), 0x8b5a2b, 3.6, 2.4, 2.4, 0, 0); put(L, boite(1, 0.7, 0.1), 0xd9a43a, 3.9, 1.85, 2.4, 0, 0.08); for (const [x, z] of [[-3.4, 3], [-2.4, 3.6], [-3, 4.4]]) put(L, cyl(0.5, 0.5, 1.1, 10), 0x8a5a2b, x, 0.55, z, 0, 0.12); },
  marche(L, ex, E) {
    solQ(L, E.pave);
    const cs = [0xd94f4f, 0x4f9fd9, 0xe0b040, 0x5fbf5f];
    [[-3.2, -2.6], [3, -2.8], [-3, 3], [3.2, 2.8]].forEach(([x, z], i) => { put(L, boite(3, 1, 2.2), 0x8b5a2b, x, 0.5, z); for (const dx of [-1.3, 1.3]) put(L, boite(0.18, 2.2, 0.18), 0x8b5a2b, x + dx, 1.1, z + 0.9, 0, 0); toit(L, 3.6, 2.8, 0.9, cs[i], x, 2.2, z); put(L, boite(0.8, 0.8, 0.8), 0xb07a45, x + 1, 0.4, z + 1.8, 0.4, 0.1); });
    put(L, cyl(0.9, 1, 0.8, 10), PIERRE, 0, 0.4, 0, 0, 0.12); put(L, cyl(0.7, 0.7, 0.1, 10), EAU, 0, 0.82, 0, 0, 0);
  },
  tour(L, ex, E) { solQ(L, 0xb3c27a); put(L, cyl(1.5, 1.7, 8, 10), PIERRE, 0, 4, 0); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; put(L, boite(0.5, 0.6, 0.5), PIERRE, Math.cos(a) * 1.45, 8.3, Math.sin(a) * 1.45, -a, 0.1); } put(L, cone(1.9, 2.6, 10), pick(E.toits), 0, 9.6, 0); mat(L, ex, 0, 0, 13.5); arbre(L, 4, 3, 0.9); },
  // une mine pour le fer, le charbon et l'or : seul le tas de minerai change de couleur
  mine(L, ex, E) {
    solQ(L, 0xa9a394);
    const butte = sphere(5.4, 1); butte.scale(1, 0.55, 0.8); put(L, butte, 0x8a7f6a, -1.5, 0, -2.6, 0, 0.2);
    put(L, boite(1.9, 2.1, 0.4), 0x1a1a1a, -1.5, 1.05, 1.1, 0, 0); for (const x of [-2.6, -0.4]) put(L, boite(0.3, 2.5, 0.3), 0x6b4a2a, x, 1.25, 1.35, 0, 0.08); put(L, boite(2.8, 0.35, 0.45), 0x6b4a2a, -1.5, 2.55, 1.35, 0, 0.08);
    for (const o of [-0.35, 0.35]) put(L, boite(0.08, 0.06, 5.6), 0x8a8f96, -1.5 + o, 0.3, 4, 0, 0); for (let z = 1.6; z < 6.8; z += 0.6) put(L, boite(1, 0.06, 0.2), 0x5b3a1e, -1.5, 0.26, z, 0, 0);
    put(L, cone(1.6, 1.4, 7), MINERAI[CLE] ?? 0x6a5a4a, 3, 0.7, 3, 0, 0.12); maison(L, ex, 3.6, -2.6, 0.4, 0.85, E);
  },
  pecheur(L, ex, E) { solQ(L, 0xd9cfa0); maison(L, ex, -2.6, -1.5, 0.3, 1, E); for (const [x, z] of [[-3.6, 3], [-2.6, 3.6]]) put(L, cyl(0.5, 0.5, 1.1, 10), 0x8a5a2b, x, 0.55, z, 0, 0.12); put(L, boite(5.6, 0.3, 1.4), 0x8b5a2b, 3.6, 0.3, 0.4, 0, 0.1); for (const x of [1.4, 3.6, 5.8]) put(L, boite(0.25, 1.4, 0.25), 0x5b3a1e, x, -0.2, 1.2, 0, 0); for (const x of [0.4, 2.4]) put(L, boite(0.12, 1.8, 0.12), 0x8b5a2b, x, 0.9, -3, 0, 0); put(L, boite(2.2, 1.2, 0.05), 0xd9d2bc, 1.4, 1.2, -3, 0, 0); },
  bucheron(L, ex, E) {
    solQ(L, 0xb3c27a); maison(L, ex, -2.4, -2.4, 0.3, 1, E);
    for (let i = 0; i < 5; i++) { const b = cyl(0.45, 0.45, 3.4, 8); b.rotateZ(Math.PI / 2); put(L, b, 0xa0703f, 3 + (i % 2) * 0.2, 0.45 + (i >> 1) * 0.8, 1.6 + (i % 2) * 0.9, 0.3, 0.12); }
    for (const [x, z] of [[-1, 3.6], [1, 4.6], [-4.6, 2]]) put(L, cyl(0.5, 0.6, 0.6, 7), 0xb98a55, x, 0.3, z, 0, 0.1);
    for (const [x, z] of [[4.6, -3], [6, -1], [3, -4.8]]) { put(L, cyl(0.3, 0.4, 1.4, 5), 0x7a5233, x, 0.7, z); put(L, cone(1.6, 2.6, 6), 0x3e7f34, x, 2.4, z); put(L, cone(1.2, 2, 6), 0x4c9440, x, 3.6, z); }
  },
  // garde forestier : maisonnette et pépinière de jeunes sapins en rangs
  forestier(L, ex, E) {
    solQ(L, 0xa3c070); maison(L, ex, -3, -2.6, 0.2, 0.95, E);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) sapin(L, 0.4 + c * 1.7, 0.6 + r * 1.8, 0.42 + (r + c) % 2 * 0.08);
    for (const [x, z] of [[4.4, -3.4], [-5, 2.4]]) sapin(L, x, z, 1.05);
    put(L, cyl(0.5, 0.6, 0.6, 7), 0xb98a55, -1, -0.6, 0, 0.1);
  },
  // pavillon de chasse au milieu des bois, gibier pendu, tas de bois
  chasseur(L, ex, E) {
    solQ(L, 0x8fb35e); maison(L, ex, -0.6, -0.8, 0.2, 1.2, E);
    for (const [x, z, s] of [[4.6, -2.6, 1], [5.2, 1.2, 0.9], [-4.8, -3, 1.1], [-5, 1.6, 0.85]]) sapin(L, x, z, s);
    for (const [x, z] of [[3, 4.4], [-3, 4.6], [1.2, -5]]) arbre(L, x, z, 0.9);
    for (const x of [1.4, 3.4]) put(L, boite(0.15, 2, 0.15), BOIS, x, 1, 2.4, 0, 0);
    put(L, boite(2.2, 0.15, 0.15), BOIS, 2.4, 2, 2.4, 0, 0); put(L, boite(0.5, 0.9, 0.3), 0x8b5a2b, 2.4, 1.3, 2.4, 0, 0.08);
    rondins(L, -3.4, 2, 3, 1.2);
  },
  // carrière : front de taille en gradins, blocs taillés, chèvre de levage
  carriere(L, ex, E) {
    solQ(L, 0xb3ad9e);
    const roc = sphere(5, 1); roc.scale(1.1, 0.8, 0.55); put(L, roc, 0x9a9488, -0.6, 0, -4.6, 0, 0.2);
    for (let i = 0; i < 3; i++) put(L, boite(6 - i * 1.2, 0.9 * (i + 1), 1.1), 0xcfc8b8, -0.6, 0.45 * (i + 1), 0.2 - i * 1.05, 0, 0.12);
    for (let i = 0; i < 6; i++) put(L, boite(1, 0.7, 0.7), 0xd8d2c4, 1.6 + (i % 3) * 1.1, 0.35 + (i > 2 ? 0.7 : 0), 2.6, 0, 0.08);
    const pied = boite(0.2, 4.4, 0.2); for (const r of [-0.3, 0.3]) { const p = pied.clone(); p.rotateZ(r); put(L, p, BOIS, -3.4 + r * 2, 2.1, 2.2, 0, 0); }
    put(L, boite(0.12, 2.4, 0.12), 0x8a8f96, -3.4, 2.6, 2.2, 0, 0); put(L, boite(0.7, 0.5, 0.5), 0xd8d2c4, -3.4, 1.2, 2.2, 0, 0.08);
    maison(L, ex, -4.6, 4.4, 2.6, 0.75, E);
  },
  // scierie : hangar ouvert, grande lame, planches et grumes ; cheminée de la machine à vapeur à l'ère industrielle
  scierie(L, ex, E) {
    solQ(L, 0xb3c27a);
    for (const x of [-3.2, 0, 3.2]) for (const z of [-3.8, -1]) put(L, boite(0.25, 2.4, 0.25), BOIS, x, 1.2, z, 0, 0);
    toit(L, 3.6, 7.4, 1.4, pick(E.toits), 0, 2.4, -2.4, Math.PI / 2);
    put(L, boite(6, 0.8, 1), 0x8a6a4a, 0, 0.4, -2.4, 0, 0.1);
    const lame = cyl(1, 1, 0.1, 16); lame.rotateX(Math.PI / 2); put(L, lame, 0xd9d9d9, 0.6, 1.2, -2.4, 0, 0);
    rondins(L, -3.6, 2, 5, 0);
    for (let i = 0; i < 4; i++) put(L, boite(3, 0.22, 1.6), 0xd9b77a, 2.8, 0.11 + i * 0.22, 2.4 + (i % 2) * 0.1, 0, i ? 0 : 0.08);
    if (EPOQUE === 'industrie') { put(L, cyl(0.45, 0.6, 6, 8), 0xb0644c, 4.6, 3, -4); ex.fum.push([4.6, 6.4, -4, true]); }
  },
  // boulangerie : maison, four à pain en coupole qui fume, sacs de farine
  boulangerie(L, ex, E) {
    solQ(L, E.pave); maison(L, ex, -1.2, -1.4, 0, 1.3, E);
    dome(L, 1.6, 0xc78a54, 3.2, 0, -1.4); put(L, boite(0.8, 0.6, 0.1), 0x3a2418, 3.2, 0.45, 0.2, 0, 0);
    put(L, boite(0.6, 1.6, 0.6), PIERRE, 3.2, 2.1, -2.2, 0, 0.12); ex.fum.push([3.2, 3.1, -2.2, 'fumee']);
    for (const [x, z] of [[-3.6, 2.6], [-2.8, 3.1], [-3.2, 3.8]]) sac(L, x, z);
    put(L, boite(2, 0.9, 1), 0x8b5a2b, 1.2, 0.45, 2.6, 0, 0.1); for (let i = 0; i < 3; i++) put(L, sphere(0.25, 0).scale(1.4, 0.7, 1), 0xd9a45a, 0.6 + i * 0.6, 1.05, 2.6, 0, 0);
  },
  // brasserie : bâtisse, cuve de cuivre, tonneaux empilés
  brasserie(L, ex, E) {
    solQ(L, 0xc9b98e); edifice(L, E, 5.2, 2.6 * E.h, 3, -1, -2.4);
    put(L, cyl(1.2, 1.2, 2.2, 12), 0xc77a3a, 3.6, 1.1, -2.6); dome(L, 1.2, 0xc77a3a, 3.6, 2.2, -2.6); put(L, cyl(0.2, 0.2, 1.4, 6), 0xc77a3a, 3.6, 3.6, -2.6, 0, 0); ex.fum.push([3.6, 4.3, -2.6, 'fumee']);
    for (const [x, z] of [[-3.6, 2.4], [-2.5, 2.4], [-1.4, 2.4], [-3, 3.5], [-1.9, 3.5]]) tonneau(L, x, z);
    for (const [x, z] of [[-3.05, 2.4], [-1.95, 2.4]]) put(L, cyl(0.5, 0.5, 1.1, 10), 0x8a5a2b, x, 1.65, z, 0, 0.12);
    put(L, boite(2.4, 1, 1.4), 0x9b6a3c, 2.6, 0.9, 2.6, 0.2, 0.1);
  },
  // fonderie : halle de pierre, gueule rougeoyante, haute cheminée qui fume noir, tas de scories
  fonderie(L, ex, E) {
    solQ(L, 0xb3ad9e); edifice(L, E, 6, 2.8 * E.h, 3.6, -0.6, -1.8, { mur: EPOQUE === 'industrie' ? 0xb7634a : PIERRE, toit: ARDOISE, porte: false });
    put(L, boite(1.6, 1.2, 0.1), 0xff8a1c, -0.6, 0.7, 0.05, 0, 0);
    put(L, cyl(0.6, 0.8, 8, 8), EPOQUE === 'industrie' ? 0xb0644c : PIERRE, 3.6, 4, -3); ex.fum.push([3.6, 8.4, -3, true]);
    put(L, cone(1.6, 1.4, 7), 0x2f2c2a, -3.6, 0.7, 3); for (let i = 0; i < 3; i++) put(L, boite(1, 0.4, 0.5), 0x7a7f86, 1.6 + i * 1.2, 0.2, 2.8, 0, 0.08);
  },
  // manufacture d'armes : bâtiment de pierre, canons et boulets devant, mât
  armurerie(L, ex, E) {
    solQ(L, E.pave); edifice(L, E, 6.4, 2.8 * E.h, 3.2, 0, -2.6, { mur: EPOQUE === 'industrie' ? 0xb7634a : PIERRE });
    for (const x of [-2.6, 0.4]) canon(L, PALIERS[EPOQUE === 'ancien' ? 0 : 2], x, 2.4);
    for (const [x, y, z] of [[3.4, 0.2, 2.4], [3.8, 0.2, 2.4], [3.6, 0.2, 2.8], [3.6, 0.5, 2.55]]) put(L, sphere(0.2, 0), 0x2b2b2b, x, y, z, 0, 0);
    mat(L, ex, 4.6, 0.4, 6);
  },
  // atelier de tissage : maison, étoffes qui sèchent sur des perches
  tisserand(L, ex, E) {
    solQ(L, HERBE); maison(L, ex, -1.6, -2.2, 0.1, 1.25, E);
    for (const x of [0.4, 5.2]) put(L, boite(0.15, 2.4, 0.15), BOIS, x, 1.2, 2.6, 0, 0);
    put(L, boite(4.8, 0.12, 0.12), BOIS, 2.8, 2.4, 2.6, 0, 0);
    [0xd94f4f, 0x4f7fd9, 0xe0c040, 0x5fbf5f].forEach((c, i) => put(L, boite(0.9, 1.4, 0.06), c, 1.2 + i * 1.1, 1.65, 2.6, 0, 0));
    for (const [x, z] of [[-3.8, 2.6], [-3, 3.2]]) put(L, cyl(0.5, 0.5, 0.8, 10), 0xe9e2d0, x, 0.4, z, 0, 0.1);
  },
  // manufacture royale : grand bâtiment en U autour d'une cour, mât
  manufacture(L, ex, E) {
    solQ(L, E.pave);
    const m = EPOQUE === 'industrie' ? 0xd9c9a8 : 0xf1e6cc, t = EPOQUE === 'ancien' ? ARDOISE : pick(E.toits);
    edifice(L, E, 9, 2.8 * E.h, 2.8, 0, -3.2, { mur: m, toit: t });
    for (const x of [-3.8, 3.8]) edifice(L, E, 2.4, 2.6 * E.h, 4.8, x, 0.6, { mur: m, toit: t, porte: false });
    for (let i = 0; i < 3; i++) caisse(L, -1 + i * 1, 1.6);
    mat(L, ex, 0, 3, 6);
  },
  // ---- ère industrielle : les usines de web_power (hall de brique, sheds en dents de scie, grandes cheminées qui fument noir)
  usine(L, ex, E) {
    solQ(L, 0xb3ad9e);
    for (const [x, z] of [[-3.4, -2.8], [2.6, -3.2], [-2.4, 3]]) {
      put(L, boite(4.4, 2.2, 3.4), 0xb7634a, x, 1.1, z);
      for (let k = 0; k < 3; k++) { const sh = cyl(0.9, 0.9, 3.6, 3); sh.rotateX(Math.PI / 2); sh.rotateZ(Math.PI / 2 + 0.5); put(L, sh, ARDOISE, x - 1.45 + k * 1.45, 2.6, z, 0, 0.12); }
      for (let k = 0; k < 3; k++) put(L, boite(0.7, 0.8, 0.08), 0xf2d27a, x - 1.45 + k * 1.45, 1, z + 1.72, 0, 0);
    }
    put(L, cyl(0.6, 0.8, 9, 8), 0xb0644c, 4.4, 4.5, 2.6); put(L, cyl(0.7, 0.7, 0.5, 8), 0x5a2f24, 4.4, 9, 2.6); ex.fum.push([4.4, 9.5, 2.6, true]);
    put(L, cyl(1.5, 1.5, 3, 12), 0xe8e4da, 1.6, 1.5, 4.6); put(L, cone(1.8, 1.6, 7), 0x2f2c2a, -5.6, 0.8, -0.4);
  },
  filature(L, ex, E) {
    solQ(L, 0xa9a394);
    put(L, boite(6.4, 3.4 * 1.3, 3.6), 0xa8553c, -0.8, 1.7 * 1.3, 0.4); toit(L, 4, 6.8, 1.6, 0x5a4741, -0.8, 3.4 * 1.3, 0.4, Math.PI / 2);
    for (let e = 0; e < 2; e++) for (let k = 0; k < 4; k++) put(L, boite(0.8, 0.9, 0.1), 0xf2d27a, -3.2 + k * 1.6, 1.2 + e * 1.8, 2.25, 0, 0);
    put(L, boite(1.6, 2.2, 0.1), 0x4a3420, -0.8, 1.1, 2.26, 0, 0);
    put(L, cyl(0.55, 0.8, 10, 8), 0x8a3f2c, 3.6, 5, 2.6); put(L, cyl(0.7, 0.7, 0.5, 8), 0x5a2f24, 3.6, 10, 2.6); ex.fum.push([3.6, 10.6, 2.6, true]);
    for (let i = 0; i < 4; i++) put(L, boite(1, 1, 1), 0xe9e2d0, -4.6 + (i % 2) * 1.1, 0.5 + (i >> 1), 4.4, 0, 0.1);
    put(L, cone(1.8, 1.6, 7), 0x2f2c2a, 3.6, 0.8, -3.4);
  },
  haut_fourneau(L, ex, E) {
    solQ(L, 0x9c968a);
    const four = new THREE.LatheGeometry([[2.4, 0], [2.6, 2.4], [1.8, 6.4], [1.4, 7.4]].map(([x, y]) => new THREE.Vector2(x, y)), 12);
    put(L, four, 0x8a4a36, -1.6, 0, -1, 0, 0.26); put(L, cyl(1.5, 1.5, 0.8, 12), 0x5a4741, -1.6, 7.8, -1); ex.fum.push([-1.6, 8.6, -1, true]);
    put(L, boite(1.4, 1, 0.2), 0xff8a1c, -1.6, 0.9, 1.5, 0, 0);
    const pont = boite(0.6, 0.5, 6.4); pont.rotateX(0.75); put(L, pont, 0x6b6f75, 2, 4, -1.2, 0, 0.1);
    put(L, boite(4.6, 2.6, 3), 0xb7634a, 2.6, 1.3, 3.2); toit(L, 3.4, 5, 1.2, ARDOISE, 2.6, 2.6, 3.2, Math.PI / 2);
    put(L, cyl(0.6, 0.8, 11, 8), 0xb0644c, 5.4, 5.5, -2.6); ex.fum.push([5.4, 11.2, -2.6, true]);
    put(L, cone(2.4, 2, 7), 0x2f2c2a, -4.8, 1, 3.6); put(L, cone(1.6, 1.4, 7), 0xa5532a, 0.4, 0.7, -5);
  },
  // ---- commerce
  entrepot(L, ex, E) {
    solQ(L, 0xc9b98e); edifice(L, E, 7, 2.8 * E.h, 3.6, 0, -2.4, { porte: false });
    put(L, boite(1.8, 2, 0.1), BOIS, 0, 1, -0.55, 0, 0);
    for (let i = 0; i < 4; i++) caisse(L, -3 + i * 1.1, 1.4);
    for (const [x, z] of [[2.6, 1.6], [3.7, 1.6], [3.1, 2.7]]) tonneau(L, x, z);
    put(L, boite(2.6, 0.5, 1.4), 0x9b6a3c, -1, 0.75, 3.8, 0, 0.1); for (const dz of [-0.78, 0.78]) { const r = cyl(0.5, 0.5, 0.15, 12); r.rotateX(Math.PI / 2); put(L, r, 0x4a3420, -1, 0.5, 3.8 + dz, 0, 0.05); }
  },
  // grenier à grain : grande grange sur piliers de pierre, sacs
  grenier(L, ex, E) {
    solQ(L, HERBE);
    for (const x of [-2.6, 0, 2.6]) for (const z of [-3.4, -0.8]) put(L, cyl(0.3, 0.35, 0.9, 8), PIERRE, x, 0.45, z, 0, 0.1);
    put(L, boite(6.4, 2.8, 3.2), 0x9b6a3c, 0, 2.3, -2.1); toit(L, 3.6, 6.8, 2, pick(E.toits), 0, 3.7, -2.1, Math.PI / 2);
    for (const x of [-2, 0, 2]) put(L, boite(0.9, 1, 0.08), 0x4a3420, x, 2.4, -0.48, 0, 0);
    for (const [x, z] of [[-2.6, 1.6], [-1.8, 1.9], [-2.2, 2.6], [1.8, 2], [2.6, 1.7]]) sac(L, x, z);
    meule(L, 4.6, 3); arbre(L, -4.8, 3, 0.85);
  },
  comptoir(L, ex, E) {
    solQ(L, E.pave); maison(L, ex, -1.2, -1.8, 0, 1.45, E);
    for (const [x, z] of [[2.6, 1.8], [3.5, 2.2], [3, 1.2]]) caisse(L, x, z, 0.85);
    for (const [x, z] of [[-3.4, 2.6], [-2.4, 3]]) tonneau(L, x, z);
    put(L, boite(2.4, 1, 1), 0x8b5a2b, 0, 0.5, 2.8, 0, 0.1); put(L, boite(0.1, 1, 0.1), 0x8a8f96, 0, 1.5, 2.8, 0, 0); put(L, boite(1.4, 0.08, 0.08), 0x8a8f96, 0, 2, 2.8, 0, 0); // balance
    mat(L, ex, 4.6, -2.4, 6.5);
  },
  // port : capitainerie, quai de bois vers l'eau (+x), grue, navire à quai
  port(L, ex, E) {
    solQ(L, 0xd9cfa0); edifice(L, E, 3.6, 2.6 * E.h, 3, -3.6, -2);
    put(L, boite(7.2, 0.4, 2.4), 0x8b5a2b, 4.6, 0.3, 0.4, 0, 0.1); for (const x of [1.6, 4.4, 7.2]) for (const z of [-0.7, 1.5]) put(L, boite(0.3, 1.6, 0.3), BOIS, x, -0.4, z, 0, 0);
    put(L, boite(0.3, 4.6, 0.3), BOIS, 2.4, 2.3, -0.4, 0, 0.08); const fl = boite(0.2, 0.2, 3.4); fl.rotateX(-0.5); put(L, fl, BOIS, 2.4, 4.4, 0.9, 0, 0);
    // le navire
    put(L, boite(2, 1.1, 6), 0x7a4a24, 6.6, 0.2, 4.2, 0, 0.12); put(L, cone(1, 1.6, 4).rotateX(Math.PI / 2), 0x7a4a24, 6.6, 0.2, 7.8, Math.PI / 4, 0.1);
    put(L, boite(0.2, 6, 0.2), BOIS, 6.6, 3.4, 4.4, 0, 0.06); put(L, boite(0.1, 2.6, 3.2), 0xf7f7f2, 6.6, 3.6, 4.4, 0, 0);
    DRAP(ex, 6.6, 6.2, 4.4);
    for (const [x, z] of [[-1, 1.6], [0, 2], [-0.5, 2.9]]) caisse(L, x, z); tonneau(L, 1, 3.2);
  },
  // banque : temple de pierre claire, colonnade et fronton
  banque(L, ex, E) {
    solQ(L, E.pave);
    const m = 0xe8e2d4;
    put(L, boite(7, 0.6, 5), PIERRE, 0, 0.3, -0.6, 0, 0.12); put(L, boite(6.2, 3.4, 3.6), m, 0, 2.3, -1.2);
    colonnade(L, 6, -2.75, 1.1, 1.2, 3.4); put(L, boite(6.6, 0.4, 1.2), m, 0, 4.2, 1.2, 0, 0.1);
    fronton(L, 6.8, 1.3, m, 0, 4.4, -0.2, 4.8); put(L, boite(1.2, 2, 0.1), BOIS, 0, 1.6, 0.62, 0, 0);
    for (const x of [-3.6, 3.6]) reverbere(L, x, 3.2);
  },
  // gare : bâtiment de brique et horloge, quai couvert ; les voies suivent l'axe x local en z = +3
  gare(L, ex, E) {
    solQ(L, 0xc9c2b2);
    edifice(L, E, 7, 2.6 * E.h, 2.6, 0, -2.2, { mur: 0xb7634a, toit: ARDOISE, vitre: 0xf2d27a });
    put(L, boite(1.6, 2.4, 1.6), 0xb7634a, 0, 2.6 * E.h + 1.2, -2.2); put(L, cone(1.3, 1.4, 4), ARDOISE, 0, 2.6 * E.h + 3.1, -2.2, Math.PI / 4);
    put(L, cyl(0.5, 0.5, 0.1, 12).rotateX(Math.PI / 2), 0xf7f3e6, 0, 2.6 * E.h + 1.4, -1.38, 0, 0);
    put(L, boite(12, 0.5, 2), 0xd8d2c4, 0, 0.25, 0.9, 0, 0.12);
    for (const x of [-4.5, -1.5, 1.5, 4.5]) put(L, boite(0.18, 1.9, 0.18), 0x2b2b30, x, 1.45, 1.4, 0, 0);
    put(L, boite(11, 0.2, 2), ARDOISE, 0, 2.5, 1.0, 0, 0.12);
    for (let x = -8.6; x <= 8.6; x += 0.8) put(L, boite(0.3, 0.12, 1.6), 0x5b3a1e, x, 0.3, 3, 0, 0);
    for (const o of [-0.5, 0.5]) put(L, boite(17.6, 0.12, 0.12), 0x8a8f96, 0, 0.42, 3 + o, 0, 0);
  },
  // ---- vie de la cité
  puits(L, ex, E) { solQ(L, HERBE); puits(L, 0, 0.6, pick(E.toits)); maison(L, ex, 3.6, -3, 0.6, 0.8, E); arbre(L, -3.6, -2, 1); put(L, cyl(0.25, 0.2, 0.4, 8), 0x8a6a4a, 1.1, 0.2, 1.6, 0, 0); },
  // jardin à la française : parterres de buis, allées, topiaires, bassin ; fleurs selon la saison
  jardin(L, ex, E) {
    solQ(L, 0xd8cfa8);
    const fleurs = SAISON === 0 ? (NEIGE ? [0xf4f6f8] : [0x8b7d6b]) : SAISON === 3 ? [0xd9822b, 0xc9a13a, 0xb5562a] : [0xff6b9a, 0xffd34d, 0xb57bff, 0xff8a3d];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * 2.8, z = sz * 2.6;
      put(L, boite(3.6, 0.5, 3), NEIGE ? 0xe8eef2 : 0x5e9a3c, x, 0.3, z, 0, 0.12);
      put(L, boite(3.2, 0.2, 0.3), BUIS, x, 0.6, z, 0, 0); put(L, boite(0.3, 0.2, 2.6), BUIS, x, 0.6, z, 0, 0);
      for (let i = 0; i < 4; i++) put(L, sphere(0.3, 0), fleurs[i % fleurs.length], x + (i % 2 ? 0.9 : -0.9), 0.75, z + (i < 2 ? 0.75 : -0.75), 0, 0);
      put(L, cone(0.45, 1.8, 6), BUIS, x + sx * 1.9, 0.9, z + sz * 1.6, 0, 0.1);
    }
    put(L, cyl(1.1, 1.1, 0.4, 12), PIERRE, 0, 0.3, 0, 0, 0.12); put(L, cyl(0.9, 0.9, 0.08, 12), NEIGE ? 0xdfeaf2 : EAU, 0, 0.52, 0, 0, 0);
    arbre(L, 0, -6.4, 0.8); arbre(L, 0, 6.4, 0.8);
  },
  // petite école : maison, clocheton, cour plantée
  ecole(L, ex, E) {
    solQ(L, HERBE); edifice(L, E, 5.2, 2.4 * E.h, 3, 0, -2);
    put(L, boite(0.9, 1.2, 0.9), pick(E.murs), 1.4, 2.4 * E.h + 1.4, -2, 0, 0.12); put(L, cone(0.8, 1.2, 4), ARDOISE, 1.4, 2.4 * E.h + 2.6, -2, Math.PI / 4, 0.1);
    put(L, boite(6, 0.3, 3.4), 0xd8cfa8, 0, 0.3, 2.4, 0, 0); arbre(L, -2.6, 2.6, 0.9); arbre(L, 2.8, 2.4, 0.8);
    put(L, boite(1.6, 1.1, 0.1), 0x2f3a2f, -4.4, 1.1, 0.4, 0.6, 0); // tableau
  },
  fontaine(L, ex, E) {
    solQ(L, E.pave);
    put(L, cyl(3, 3.2, 0.8, 16), PIERRE, 0, 0.4, 0, 0, 0.15); put(L, cyl(2.7, 2.7, 0.1, 16), NEIGE ? 0xdfeaf2 : EAU, 0, 0.8, 0, 0, 0);
    put(L, cyl(0.4, 0.5, 2.4, 10), PIERRE, 0, 1.2, 0, 0, 0.1); put(L, cyl(1.3, 0.6, 0.5, 12), PIERRE, 0, 2.5, 0, 0, 0.1); put(L, sphere(0.4, 1), PIERRE, 0, 3, 0, 0, 0.08);
    for (const [x, z] of [[-5, 3], [5, -3]]) arbre(L, x, z, 0.9);
    for (const a of [0.6, 2.6, 4.4]) put(L, boite(1.6, 0.4, 0.5), BOIS, Math.cos(a) * 4.6, 0.5, Math.sin(a) * 4.6, -a + Math.PI / 2, 0.08);
  },
  // statue équestre de bronze sur son socle
  statue(L, ex, E) {
    solQ(L, E.pave);
    put(L, boite(2.6, 2.4, 3.6), PIERRE, 0, 1.2, 0); put(L, boite(3, 0.3, 4), 0xcfc8b8, 0, 2.5, 0, 0, 0.1);
    const B = 0x5f8a74, Ls = lot();
    cheval(Ls, 0, -0.3, B); put(Ls, boite(0.6, 0.9, 0.45), B, 0, 2.2, -0.4, 0, 0.06); put(Ls, sphere(0.28, 1), B, 0, 2.9, -0.4, 0, 0.05); put(Ls, boite(0.08, 1, 0.08), B, 0.4, 3.1, 0.1, 0, 0);
    for (const g of [...Ls.g, ...Ls.o]) g.scale(1.6, 1.6, 1.6).translate(0, 2.65, 0);
    L.g.push(...Ls.g); L.o.push(...Ls.o);
    for (const [x, z] of [[-4.6, 3], [4.6, 3], [-4.6, -3], [4.6, -3]]) arbre(L, x, z, 0.8);
  },
  // académie des sciences : bâtiment de pierre, observatoire à coupole et lunette
  academie(L, ex, E) {
    solQ(L, E.pave); edifice(L, E, 7, 3 * E.h, 3.4, -0.6, -2.2, { mur: 0xece6d8, toit: ARDOISE });
    put(L, cyl(1.6, 1.6, 2.4, 12), 0xece6d8, 3.8, 1.2, 2); dome(L, 1.7, 0xd8dde4, 3.8, 2.4, 2);
    const lunette = cyl(0.25, 0.3, 2.4, 8); lunette.rotateZ(0.8); put(L, lunette, 0x444444, 3.2, 3.6, 2, 0, 0.06);
    arbre(L, -3.6, 2.6, 0.9); put(L, boite(1.4, 1.4, 0.2), 0xf2c23a, -0.6, 0.15, 2.6, 0, 0); // cadran solaire
  },
  // théâtre : façade à colonnade et fronton, toit en coupole
  theatre(L, ex, E) {
    solQ(L, E.pave);
    const m = 0xf0e6d0;
    put(L, boite(6.4, 4 * Math.min(E.h, 1.3), 5.4), m, 0, 2 * Math.min(E.h, 1.3), -1.4); dome(L, 1.9, EPOQUE === 'empire' ? 0xffc94d : ARDOISE, 0, 4 * Math.min(E.h, 1.3), -2.2);
    colonnade(L, 5, -2.4, 1.2, 1.9, 3.4); put(L, boite(6, 0.4, 1.2), m, 0, 3.6, 1.9, 0, 0.1); fronton(L, 6.2, 1.2, m, 0, 3.8, 1.9, 1.6);
    put(L, boite(1.2, 2, 0.1), 0x8a2a2a, 0, 1, 1.32, 0, 0);
    for (const x of [-4, 4]) reverbere(L, x, 3);
  },
  // hôtel-Dieu : long bâtiment en croix, chapelle, croix rouge
  hopital(L, ex, E) {
    solQ(L, E.pave);
    edifice(L, E, 8.4, 2.8 * E.h, 2.8, 0, -2.6, { mur: 0xf3ecdc });
    edifice(L, E, 2.8, 2.6 * E.h, 4.6, 0, 1.2, { mur: 0xf3ecdc, porte: false });
    put(L, boite(1.4, 0.4, 0.08), 0xd03030, 0, 2 * E.h, 3.54, 0, 0); put(L, boite(0.4, 1.4, 0.08), 0xd03030, 0, 2 * E.h, 3.55, 0, 0);
    arbre(L, -4, 2.6, 0.9); arbre(L, 4, 2.6, 0.9);
  },
  // palais royal : corps central à coupole dorée, deux ailes, parterres et bassin, drapeau
  palais(L, ex, E) {
    solQ(L, E.pave);
    const m = 0xefe7d6, h = 3.2 * E.h;
    edifice(L, E, 9.4, h, 3, 0, -3.4, { mur: m, toit: ARDOISE });
    for (const x of [-4.2, 4.2]) edifice(L, E, 2.4, h * 0.85, 4.4, x, 0.2, { mur: m, toit: ARDOISE, porte: false });
    put(L, cyl(1.3, 1.3, 1.4, 12), m, 0, h + 1.5, -3.4); dome(L, 1.4, 0xffc94d, 0, h + 2.2, -3.4);
    colonnade(L, 4, -1.5, 1, -1.6, h * 0.8);
    for (const x of [-2.2, 2.2]) put(L, boite(2.6, 0.5, 1.6), BUIS, x, 0.25, 4.6, 0, 0.12);
    put(L, cyl(1.1, 1.1, 0.4, 12), PIERRE, 0, 0.2, 2.4, 0, 0.12); put(L, cyl(0.9, 0.9, 0.08, 12), NEIGE ? 0xdfeaf2 : EAU, 0, 0.42, 2.4, 0, 0);
    mat(L, ex, 0, -3.4, h + 6);
  },
  // ---- armée
  haras(L, ex, E) {
    solQ(L, HERBE);
    put(L, boite(7, 2.2, 2.6), 0x9b5a34, 0, 1.1, -4.4); toit(L, 3, 7.4, 1.4, pick(E.toits), 0, 2.2, -4.4, Math.PI / 2);
    for (let i = 0; i < 4; i++) put(L, boite(0.9, 1, 0.08), 0x4a3420, -2.4 + i * 1.6, 0.9, -3.08, 0, 0);
    cloture(L, 4.8, 16, 1.4);
    cheval(L, -1.6, 1.4); cheval(L, 1.4, 0.4, 0x8a5a32); cheval(L, 0.4, 3.2, 0xe9e2d0);
    meule(L, 5.6, -1);
  },
  arsenal(L, ex, E) {
    solQ(L, E.pave); edifice(L, E, 7.4, 3 * E.h, 3.4, 0, -2.6, { mur: EPOQUE === 'industrie' ? 0xb7634a : PIERRE, toit: ARDOISE, porte: false });
    for (const x of [-2, 2]) put(L, boite(1.6, 2.2, 0.1), BOIS, x, 1.1, -0.85, 0, 0);
    const P = PALIERS[EPOQUE === 'ancien' ? 0 : 2];
    for (const x of [-4, -1.4, 1.2]) canon(L, P, x, 3.2);
    for (const [x, y, z] of [[3.6, 0.2, 2.6], [4, 0.2, 2.6], [3.8, 0.2, 3], [3.8, 0.5, 2.75]]) put(L, sphere(0.2, 0), 0x2b2b2b, x, y, z, 0, 0);
    mat(L, ex, 4.4, -0.2, 7);
  },
  // bastions de Vauban : enceinte étoilée, porte, guérites
  remparts(L, ex, E) {
    solQ(L, 0x9fc46a);
    murs(L, 7.4, 1.8, PIERRE, 6, true);
    put(L, boite(1.6, 1.6, 1.2), 0x3a2a1a, 3.2, 0.8, 5.6, -Math.PI / 6, 0); toit(L, 2.2, 1.6, 0.9, pick(E.toits), 3.2, 2, 5.6, -Math.PI / 6);
    for (let i = 0; i < 6; i++) { const a = Math.PI / 2 + i * Math.PI / 3; put(L, cyl(0.45, 0.45, 0.9, 8), PIERRE, Math.cos(a) * 7.4, 2.4, Math.sin(a) * 7.4, 0, 0.08); put(L, cone(0.55, 0.6, 8), ARDOISE, Math.cos(a) * 7.4, 3.15, Math.sin(a) * 7.4, 0, 0.06); }
    arbre(L, -1.6, 1, 0.9); arbre(L, 1.8, -2, 0.8);
  },
  // citadelle étoilée : deux enceintes, donjon, drapeau
  citadelle(L, ex, E) {
    solQ(L, 0x9fc46a);
    murs(L, 7.8, 1.6, PIERRE, 5, true); murs(L, 4.6, 2.2, 0xcfc8b8, 5, true);
    put(L, boite(2.6, 4 * E.h, 2.6), PIERRE, 0, 2 * E.h, 0); toit(L, 3, 3, 1.4, ARDOISE, 0, 4 * E.h, 0);
    mat(L, ex, 0.8, 0.8, 4 * E.h + 4);
  },
  // colonie : cabanes, palissade de pieux, défrichement, drapeau
  colonie(L, ex, E) {
    solQ(L, 0xc9c08a);
    maison(L, ex, -2.4, -2, 0.3, 0.9, EPOQUES.ancien); maison(L, ex, 2.4, -3, -0.4, 0.8, EPOQUES.ancien);
    for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2; if (Math.abs(a - Math.PI / 2) < 0.25) continue; put(L, cyl(0.18, 0.18, 1.6, 5), 0x8a6a4a, Math.cos(a) * 6.6, 0.8, Math.sin(a) * 6.6, 0, 0); }
    put(L, boite(3, 0.4, 2), CULTURES()[0], 2.4, 0.2, 2.4, 0, 0.1);
    for (const [x, z] of [[-2.4, 2.6], [-1.4, 3.2]]) put(L, cyl(0.5, 0.6, 0.6, 7), 0xb98a55, x, 0.3, z, 0, 0.1);
    caisse(L, 0.2, 0.6); mat(L, ex, -0.6, 1, 6);
  },
};
BATR.mine_fer = BATR.mine_charbon = BATR.mine_or = BATR.mine;

// ------------------------------------------------------------------ cache et maillages
const graine = s => { let h = 7; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h; };
/** Assemble une variante en deux géométries fusionnées (pièces, contours) et la liste des pièces animées. */
function assembler(cle, fn) {
  const L = lot(), ex = { fum: [], ailes: [], drap: [] };
  let i = 0; const g = graine(cle); rnd = () => hache(g, i++, 77); // même tirage pour une même variante
  fn(L, ex);
  // l'emprise au sol de chaque pièce qui dépasse du sol de la case : où une armée ne peut pas se tenir (monde.js : garnisons)
  const boites = [];
  for (const p of L.g) { p.computeBoundingBox(); const b = p.boundingBox; if (b.max.y > 0.32) boites.push([b.min.x, b.max.x, b.min.z, b.max.z]); }
  const anim = [
    ...ex.fum.map(a => (a[3] === true ? { type: 'fumee', noire: true, pos: a.slice(0, 3) } : a[3] === 'fumee' ? { type: 'fumee', noire: false, pos: a.slice(0, 3) } : { type: 'cheminee', pos: a.slice(0, 3) })),
    ...ex.ailes.map(pos => ({ type: 'ailes', pos })),
    ...ex.drap.map(pos => ({ type: 'drapeau', pos, couleur: ROYAUME })),
  ];
  return { g: fusion(L.g), o: L.o.length ? fusion(L.o) : null, anim, boites };
}
/** Un groupe neuf (pièces + contours) sur les géométries partagées d'une variante, à l'échelle du plateau. */
function groupe(r) {
  const grp = new THREE.Group();
  const m = new THREE.Mesh(r.g, MAT); m.castShadow = m.receiveShadow = true; grp.add(m);
  if (r.o) grp.add(new THREE.Mesh(r.o, CONT));
  grp.scale.setScalar(ECH_BAT);
  return grp;
}
const cache = new Map();
function enCache(cle, fn) {
  let r = cache.get(cle);
  if (!r) {
    r = assembler(cle, fn); cache.set(cle, r);
    if (cache.size > 600) cache.delete(cache.keys().next().value); // shortcut: la géométrie évincée n'est pas libérée (le GPU la garde tant qu'un groupe s'en sert)
  }
  return r;
}

// un bâtiment incendié (faubourg pillé, sabotage) : toutes ses pièces hautes virent au charbon (le sol de la case reste)
function noircir(L) {
  for (const g of L.g) {
    g.computeBoundingBox(); if (g.boundingBox.max.y < 0.3) continue;
    const c = g.attributes.color; for (let i = 0; i < c.count; i++) { const l = c.getX(i) * 0.3 + c.getY(i) * 0.59 + c.getZ(i) * 0.11; c.setXYZ(i, 0.07 + l * 0.12, 0.06 + l * 0.1, 0.055 + l * 0.09); }
  }
}
/** Le bâtiment posé au centre de sa case : { mesh: THREE.Group à l'échelle 0,1, anim: [{ type, pos (coordonnées locales), noire?, couleur? }],
 *  boites: emprises au sol des pièces [x0, x1, z0, z1] (coordonnées locales) }.
 *  ruine : la version incendiée, plus basse et noircie, sans drapeau ni fumée. */
export function maillageBatiment({ cle, couleur = '#2f5fa8', epoque = 'ancien', saison = 2, neige = 0, niveau = 1, ruine = false }) {
  const n = neige > 0.3, ep = EPOQUES[epoque] ? epoque : 'ancien';
  const k = `${cle}|${couleur}|${ep}|${saison}|${n ? 1 : 0}|${cle === 'hotel' ? niveau || 1 : 0}${ruine ? '|ruine' : ''}`;
  const r = enCache(k, (L, ex) => {
    SAISON = saison; NEIGE = n; EPOQUE = ep; ROYAUME = couleur; CLE = cle; NIVEAU = Math.max(1, Math.min(5, niveau || 1));
    const E = EPOQUES[ep];
    (BATR[cle] || BATR.maison)(L, ex, ruine ? { ...E, h: E.h * 0.62, volets: false, colomb: false } : E);
    if (ruine) { noircir(L); ex.fum.length = 0; ex.drap.length = 0; ex.ailes.length = 0; }
  });
  return { mesh: groupe(r), anim: r.anim.map(a => ({ ...a, pos: [...a.pos] })), boites: r.boites };
}
/** Une variante quelconque assemblée une fois (fn(L) en unités de web_power) : THREE.Group neuf sur les géométries partagées, à l'échelle 0,1. */
export function maillageCache(cle, fn) { return groupe(enCache('#' + cle, (L, ex) => fn(L, ex))); }

// ------------------------------------------------------------------ chantier : échafaudage de bois façon web_power
const CHANTIER = assembler('chantier', L => {
  const B = 0xa0703f, P = 0xc9a06a;
  for (const x of [-3.4, 3.4]) for (const z of [-2.8, 2.8]) put(L, boite(0.25, 6, 0.25), B, x, 3, z, 0, 0.1);
  for (const y of [2, 4.2]) {
    for (const z of [-2.8, 2.8]) { put(L, boite(7.1, 0.2, 0.22), B, 0, y, z, 0, 0.08); put(L, boite(6.8, 0.12, 1), P, 0, y + 0.16, z + Math.sign(z) * 0.6, 0, 0); }
    for (const x of [-3.4, 3.4]) put(L, boite(0.22, 0.2, 5.8), B, x, y, 0, 0, 0.08);
  }
  for (const z of [-2.9, 2.9]) { const d = boite(0.15, 7.6, 0.15); d.rotateZ(Math.sign(z) * 1.05); put(L, d, B, 0, 2.2, z, 0, 0); }
  const echelle = boite(0.7, 4.6, 0.12); echelle.rotateX(-0.25); put(L, echelle, B, 2.2, 2.2, 3.9, 0, 0);
  for (let i = 0; i < 4; i++) put(L, boite(3.2, 0.25, 0.9), P, -4.6 + (i % 2) * 0.2, 0.13 + i * 0.25, 4.6, 0.4, i ? 0 : 0.08);
  for (const [x, z] of [[4.8, 3.6], [5.6, 3], [5.2, 4.3], [5.2, 3.6]]) put(L, boite(0.8, 0.6, 0.6), PIERRE, x, x === 5.2 && z === 3.6 ? 0.9 : 0.3, z, 0.2, 0.08);
  put(L, boite(0.25, 8, 0.25), B, -4.6, 4, -3.8, 0, 0.1); put(L, boite(4.6, 0.25, 0.25), B, -2.6, 7.8, -3.8, 0, 0.1); put(L, boite(0.05, 2.4, 0.05), 0x8a8f96, -0.6, 6.6, -3.8, 0, 0); put(L, boite(0.6, 0.5, 0.6), PIERRE, -0.6, 5.2, -3.8, 0, 0.08); // grue
});
/** L'échafaudage posé sur un bâtiment en construction (THREE.Group à l'échelle 0,1). */
export function maillageChantier() { return groupe(CHANTIER); }

// ------------------------------------------------------------------ armées : une icône fixe dont l'allure suit le palier technologique (maquettes/armees.html)
const PEAU = 0xf0c9a0, BLANC = 0xf2efe6, NOIR = 0x1f1f1f, ACIER = 0xd9d9d9, BRONZE = 0xb08d57, FER = 0x2b2b2b, GARANCE = 0xb8322a, CHEVAL = 0x6b4226;
export const PALIERS = [
  { date: '1700 · au départ', nom: 'Mousquets et piques', tete: 'tricorne', habit: 'long', piques: true, baionnette: false, cav: 'dragon', art: 'ancienne' },
  { date: '1703 · Fusil à silex et baïonnette', nom: 'Fini les piques', tete: 'tricorne', habit: 'long', piques: false, baionnette: true, grenadiers: true, cav: 'dragon', art: 'ancienne' },
  { date: '1765 · Système Gribeauval', nom: 'Artillerie moderne', tete: 'tricorne', habit: 'long', piques: false, baionnette: true, grenadiers: true, cav: 'dragon', art: 'gribeauval' },
  { date: '1793 · Levée en masse', nom: 'Les armées de la nation', tete: 'bicorne', habit: 'court', piques: false, baionnette: true, grenadiers: true, cav: 'cuirassier', hussard: true, art: 'gribeauval' },
  { date: '1825 · Fusil à percussion', nom: 'Capotes et pantalons garance', tete: 'shako', habit: 'capote', pantalon: GARANCE, piques: false, baionnette: true, chasseurs: true, cav: 'cuirassier', lanciers: true, art: 'gribeauval' },
  { date: '1832 · Chemin de fer', nom: 'Le train des équipages', tete: 'kepi', habit: 'capote', pantalon: GARANCE, piques: false, baionnette: true, chasseurs: true, cav: 'cuirassier', lanciers: true, art: 'gribeauval', fourgon: true },
];
/** Les technologies qui font passer d'un palier au suivant (palier = indice de la plus avancée possédée, 0 sans aucune). */
export const TECHS_PALIER = [null, 'silex', 'gribeauval', 'levee_masse', 'percussion', 'chemin_fer'];
export function palierDe(techs = []) { let p = 0; TECHS_PALIER.forEach((t, i) => { if (t && techs.includes(t)) p = i; }); return p; }

export function tete(L, P, x, y, z, couleurRoy) {
  if (P.tete === 'bicorne') put(L, boite(0.95, 0.35, 0.3), NOIR, x, y + 0.1, z, 0, 0.05);
  else if (P.tete === 'shako') { put(L, cyl(0.3, 0.26, 0.5, 8), NOIR, x, y + 0.2, z, 0, 0.05); put(L, boite(0.1, 0.2, 0.1), couleurRoy, x, y + 0.52, z + 0.18, 0, 0); }
  else if (P.tete === 'kepi') { put(L, cyl(0.24, 0.28, 0.32, 8), couleurRoy, x, y + 0.12, z, 0, 0.05); put(L, boite(0.4, 0.04, 0.2), NOIR, x, y, z + 0.2, 0, 0); }
  else put(L, cone(0.55, 0.3, 3), NOIR, x, y + 0.1, z, Math.PI, 0.05); // tricorne
}
export function fantassin(L, P, x, z, roy, genre = 'ligne') {
  const habit = genre === 'chasseur' ? 0x2f4a32 : roy, pant = P.pantalon || BLANC;
  for (const dx of [-0.16, 0.16]) put(L, boite(0.24, 0.9, 0.3), pant, x + dx, 0.45, z, 0, 0.05);
  const long = P.habit === 'long' || P.habit === 'capote';
  put(L, boite(0.75, long ? 1.25 : 0.95, 0.5), P.habit === 'capote' && genre !== 'chasseur' ? 0x5a6a86 : habit, x, long ? 1.2 : 1.35, z, 0, 0.07);
  if (P.habit === 'capote' && genre !== 'chasseur') put(L, boite(0.78, 0.25, 0.52), roy, x, 1.75, z, 0, 0); // col et épaulettes à la couleur du royaume
  put(L, boite(0.8, 0.1, 0.55), BLANC, x, 1.15, z, 0, 0);
  put(L, sphere(0.28, 1), PEAU, x, 2.1, z, 0, 0.05);
  if (genre === 'grenadier') { put(L, cone(0.3, 0.8, 4), roy, x, 2.65, z, Math.PI / 4, 0.05); put(L, boite(0.4, 0.5, 0.06), BRONZE, x, 2.55, z + 0.2, 0, 0); }
  else if (genre === 'piquier') { tete(L, P, x, 2.32, z, roy); put(L, boite(0.08, 4.6, 0.08), BOIS, x + 0.4, 2.3, z + 0.15, 0, 0); put(L, cone(0.1, 0.4, 4), ACIER, x + 0.4, 4.8, z + 0.15, 0, 0); return; }
  else tete(L, P, x, 2.32, z, roy);
  put(L, boite(0.09, 2.2, 0.09), BOIS, x + 0.42, 1.5, z + 0.18, 0, 0);
  if (P.baionnette) put(L, boite(0.04, 0.45, 0.04), ACIER, x + 0.42, 2.82, z + 0.18, 0, 0);
}
function cheval(L, x, z, robe = CHEVAL) {
  put(L, boite(0.7, 0.85, 1.9), robe, x, 1.35, z, 0, 0.07); put(L, boite(0.4, 0.9, 0.45), robe, x, 1.95, z + 0.95, 0, 0.05); put(L, boite(0.35, 0.35, 0.7), robe, x, 2.3, z + 1.25, 0, 0.05);
  for (const [dx, dz] of [[-0.22, -0.7], [0.22, -0.7], [-0.22, 0.7], [0.22, 0.7]]) put(L, boite(0.16, 0.95, 0.16), 0x4a2c18, x + dx, 0.47, z + dz, 0, 0);
  put(L, boite(0.12, 0.6, 0.12), 0x2a1d14, x, 1.5, z - 1.05, 0, 0);
}
function cavalier(L, P, x, z, roy, genre) {
  cheval(L, x, z, genre === 'hussard' ? 0x8a5a32 : CHEVAL);
  const habit = genre === 'hussard' ? 0x3f6f9a : roy;
  put(L, boite(0.6, 0.8, 0.45), habit, x, 2.15, z - 0.1, 0, 0.06);
  put(L, sphere(0.25, 1), PEAU, x, 2.8, z - 0.1, 0, 0.05);
  if (genre === 'cuirassier') { put(L, boite(0.64, 0.55, 0.5), ACIER, x, 2.25, z - 0.1, 0, 0.05); put(L, new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), ACIER, x, 2.95, z - 0.1, 0, 0.04); put(L, boite(0.08, 0.3, 0.55), NOIR, x, 3.2, z - 0.2, 0, 0); }
  else if (genre === 'hussard') { put(L, cyl(0.28, 0.3, 0.5, 8), NOIR, x, 3.15, z - 0.1, 0, 0.05); put(L, boite(0.3, 0.6, 0.5), GARANCE, x - 0.42, 2.2, z - 0.1, 0, 0.04); }
  else if (genre === 'lancier') { tete(L, P, x, 3, z - 0.1, roy); put(L, boite(0.07, 4, 0.07), BOIS, x + 0.42, 3, z + 0.1, 0, 0); put(L, boite(0.04, 0.35, 0.6), roy, x + 0.42, 4.6, z + 0.45, 0, 0); put(L, boite(0.04, 0.17, 0.6), BLANC, x + 0.42, 4.37, z + 0.45, 0, 0); }
  else tete(L, P, x, 3, z - 0.1, roy);
  if (genre !== 'lancier') put(L, boite(0.06, 0.06, 1.1), ACIER, x + 0.4, 2.3, z + 0.35, 0, 0);
}
export function canon(L, P, x, z) {
  const gri = P.art === 'gribeauval';
  const fut = cyl(gri ? 0.2 : 0.24, gri ? 0.3 : 0.36, gri ? 2 : 2.9, 10); fut.rotateX(Math.PI / 2 - 0.12); put(L, fut, BRONZE, x, 1, z + (gri ? 0.3 : 0.5), 0, 0.06);
  const affut = gri ? 0x6b7a4a : 0x8a3a2a;
  put(L, boite(0.6, 0.35, 1.9), affut, x, 0.6, z - 0.35, 0, 0.05);
  for (const dx of [-0.58, 0.58]) { const r = cyl(gri ? 0.55 : 0.68, gri ? 0.55 : 0.68, 0.14, 12); r.rotateZ(Math.PI / 2); put(L, r, gri ? affut : 0x4a3420, x + dx, gri ? 0.55 : 0.68, z, 0, 0.05); }
  if (gri) { // avant-train attelé
    put(L, boite(1.1, 0.5, 0.8), affut, x, 0.75, z - 2.1, 0, 0.05);
    for (const dx of [-0.6, 0.6]) { const r = cyl(0.45, 0.45, 0.12, 12); r.rotateZ(Math.PI / 2); put(L, r, affut, x + dx, 0.45, z - 2.1, 0, 0.05); }
    put(L, boite(0.08, 0.08, 1.4), BOIS, x, 0.7, z - 2.9, 0, 0);
    for (const dx of [-0.45, 0.45]) cheval(L, x + dx, z - 4.3);
  } else for (let i = 0; i < 3; i++) put(L, sphere(0.16, 0), FER, x - 0.3 + i * 0.3, 0.16, z - 1.7, 0, 0);
}
function fourgon(L, x, z) {
  put(L, boite(1.5, 0.5, 2.6), 0x8a6a4a, x, 0.9, z, 0, 0.05);
  put(L, new THREE.CylinderGeometry(0.78, 0.78, 2.6, 12, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), 0xe9e2d0, x, 1.15, z, 0, 0.05);
  for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) { const r = cyl(0.42, 0.42, 0.12, 12); r.rotateZ(Math.PI / 2); put(L, r, 0x4a3420, x + dx, 0.42, z + dz, 0, 0.05); }
  cheval(L, x, z + 2.7);
}
/** La ligne (piquiers au centre au départ, grenadiers au bout ensuite), le drapeau et son porteur : le cœur de l'armée et de la garde. */
function ligne(L, P, roy) {
  for (let i = 0; i < 6; i++) fantassin(L, P, -3.4 + i * 1.15, 2.4, roy, P.piques && (i === 2 || i === 3) ? 'piquier' : P.grenadiers && i === 5 ? 'grenadier' : 'ligne');
  put(L, boite(0.14, 4.6, 0.14), 0x4a3420, -0.2, 2.3, 0.4, 0, 0.05);
  put(L, boite(0.05, 1.1, 1.6), roy, -0.2, 3.95, 1.25, 0, 0.04); put(L, boite(0.06, 0.25, 1.6), BLANC, -0.2, 3.95, 1.25, 0, 0); put(L, boite(0.06, 1.1, 0.25), BLANC, -0.2, 3.95, 1.25, 0, 0);
  fantassin(L, P, 0.2, 0.4, roy);
}
function armee(L, P, roy) {
  ligne(L, P, roy); // devant
  if (P.chasseurs) { fantassin(L, P, -2.6, 4.6, roy, 'chasseur'); fantassin(L, P, 1.4, 5.0, roy, 'chasseur'); } // tirailleurs en avant
  // la cavalerie, derrière
  const cav = [P.cav, P.hussard ? 'hussard' : P.lanciers ? 'lancier' : P.cav, P.cav];
  cav.forEach((g, i) => cavalier(L, P, -2.6 + i * 2, -2.8, roy, g));
  // l'artillerie, sur le flanc
  canon(L, P, 5.4, 1.8); canon(L, P, 7.2, 1.2);
  fantassin(L, P, 4.4, 0.4, roy); fantassin(L, P, 6.4, 0, roy);
  // l'officier
  cavalier(L, P, -1.6, 0, roy, P.cav === 'cuirassier' ? 'officier' : P.cav);
  if (P.fourgon) fourgon(L, -5.8, -3); // sur le flanc gauche, à l'écart des attelages
}
/** L'armée d'un royaume (icône fixe, face à +z local) : THREE.Group à l'échelle 0,1. */
export function maillageArmee(couleur, palier = 0) {
  const p = Math.max(0, Math.min(5, palier | 0));
  return groupe(enCache(`armee|${couleur}|${p}`, L => armee(L, PALIERS[p], couleur)));
}
/** La garde d'une petite place (la garnison d'une enceinte trop étroite pour l'armée entière) : la ligne et le drapeau, sans cavalerie
 *  ni canons ni fourgon (même repère que l'armée : la vie y fait tirer la même salve). */
export function maillageGarde(couleur, palier = 0) {
  const p = Math.max(0, Math.min(5, palier | 0));
  return groupe(enCache(`garde|${couleur}|${p}`, L => ligne(L, PALIERS[p], couleur)));
}

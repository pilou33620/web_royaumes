// Les sièges (maquette validée : maquettes/guerre.html, source maquettes/source/guerre/guerre.js) : le siège en règle d'une ville
// ou d'un fort — parallèles et boyaux en zigzag qui avancent de mois en mois, gabions, deux batteries qui tirent, canons de la place
// qui répondent, brèche qui s'ouvre dans la courtine qui fait face au camp (avec ses gravats), défenseurs sur les bastions,
// drapeau blanc quand la place a faim, camp de tentes ; l'assaut et la capitulation joués pendant le mois ; le pillage des faubourgs
// (nos soldats sortent du camp, le faubourg flambe, ils rentrent chargés de butin ; il reste noirci, quelques braises).
// Tout est en unités du plateau. Les ouvrages d'un siège sont figés une fois par clé (place, époque, armée, camp) ; ce qui change
// de mois en mois (tranchées creusées, brèche, drapeau) ne fait que montrer, cacher ou étirer des groupes déjà faits.
// L'armée assiégeante (sur la case de la place pour le moteur) est dessinée au camp, au bout des tranchées (monde.js : campArmee).
import { THREE, scene, posCase, caseA, voisin, hache, chaqueImage } from './scene.js';
import { lot, put, fige, toon, boite, cyl, cone, sphere } from './toon.js';
import { carte, dessus, solEn } from './plateau.js';
import { maillageCache, fantassin, canon, PALIERS } from './modeles.js';
import { bouffee } from './vie.js';
import { infoRemparts, STYLE_REMP, BRONZE, lisse, putR, ryDe } from './remparts.js';
import { couleurDe, palierRoyaume } from './monde.js';

const SQ3 = Math.sqrt(3), ECH_GENS = 0.045;
const DIRS = [[1, 0], [0.5, 0.866], [-0.5, 0.866], [-1, 0], [-0.5, -0.866], [0.5, -0.866]]; // les six directions de voisin(i, d), en (x, z)
export const capVers = (dx, dz) => Math.atan2(dx, dz); // pour un modèle qui regarde +z
const groupe = new THREE.Group();
scene.add(groupe);
let horloge = 0;

// ---------------------------------------------------------------- petites choses communes : copies de modèles, flammes, drapeaux, éclairs
/** Un groupe neuf qui partage les maillages d'un modèle figé (un groupe ne se pose pas à deux endroits). */
export function copie(m) { const g = new THREE.Group(); m.traverse(o => { if (o.isMesh) { const c = new THREE.Mesh(o.geometry, o.material); c.castShadow = o.castShadow; g.add(c); } }); return g; }
/** Un soldat à pied de l'armée d'un royaume (face à +z), à l'échelle ech ; objet : 'pelle', 'sac', 'caisse'. */
export function soldat(parent, couleur, palier, ech = ECH_GENS, objet = '') {
  const p = Math.max(0, Math.min(5, palier | 0));
  const g = maillageCache(`soldat|${couleur}|${p}|${objet}`, L => {
    fantassin(L, objet === 'pelle' ? { ...PALIERS[p], baionnette: false } : PALIERS[p], 0, 0, couleur);
    if (objet === 'pelle') { const m = boite(0.09, 1.7, 0.09); m.rotateX(0.7); put(L, m, 0x5b3a1e, -0.45, 1.1, 0.75, 0, 0.04); put(L, boite(0.42, 0.5, 0.07), 0x9a9a9a, -0.45, 0.42, 1.38, 0, 0.04); }
    if (objet === 'caisse') put(L, boite(1.5, 1.2, 1.5), 0xb07a3a, 0, 3.6, -0.3, 0.3, 0.14);
    if (objet === 'sac') put(L, sphere(1, 1), 0xd9c08a, 0, 3.6, -0.35, 0, 0.14);
  });
  partage(g); g.scale.setScalar(ech); g.rotation.order = 'YXZ'; parent.add(g); return g;
}
const M_FLAMME = new THREE.MeshBasicMaterial({ color: 0xff9a2a }), M_FLAMME2 = new THREE.MeshBasicMaterial({ color: 0xffd34d });
const GEO_FLAMMES = [0.5, 0.34, 0.38].map(h => { const g = new THREE.ConeGeometry(0.12, h, 5).translate(0, h / 2, 0); g.userData.partage = true; return g; });
/** Trois langues de feu (cachées au départ), animées par animFeu. */
export function feu(parent, x, y, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s);
  [[0, 0, M_FLAMME], [0.18, 0.1, M_FLAMME2], [-0.15, -0.12, M_FLAMME]].forEach(([dx, dz, m], i) => { const c = new THREE.Mesh(GEO_FLAMMES[i], m); c.position.set(dx, 0, dz); g.add(c); });
  parent.add(g); g.visible = false; return g;
}
export const animFeu = (g, t) => g.children.forEach((c, i) => c.scale.set(1 + Math.sin(t * 13 + i) * 0.2, 1 + Math.sin(t * 17 + i * 2) * 0.3, 1 + Math.cos(t * 11 + i) * 0.2));
const pavillons = new Set(), MATS_PAV = new Map();
const matPav = col => { let m = MATS_PAV.get(col); if (!m) { m = toon(new THREE.Color(col), { side: THREE.DoubleSide }); MATS_PAV.set(col, m); } return m; };
/** Un drapeau qui flotte (propre : son matériau à lui, pour en changer la couleur) ; jeterDrapeau quand il disparaît. */
export function drapeau(parent, col, x, y, z, w = 0.12, h = 0.075, propre = false) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 6, 1).translate(w / 2, 0, 0), propre ? toon(new THREE.Color(col), { side: THREE.DoubleSide }) : matPav(col));
  m.position.set(x, y, z); m.userData.w = w; m.userData.ph = Math.random() * 6; m.castShadow = true; parent.add(m); pavillons.add(m); return m;
}
const _p = new THREE.Vector3();
/** Marque les géométries d'un modèle en cache : oter() ne les libère pas. */
export function partage(g) { g.traverse(o => { if (o.geometry) o.geometry.userData.partage = true; }); return g; }
/** Retire un objet de la scène et libère ce qui n'appartient qu'à lui (géométries hors cache, drapeaux). */
export function oter(obj) {
  if (!obj) return;
  obj.parent?.remove(obj);
  const communs = new Set(MATS_PAV.values());
  obj.traverse(o => {
    if (pavillons.delete(o) && !communs.has(o.material)) o.material.dispose();
    if ((o.isMesh || o.isPoints) && !o.geometry.userData.partage) o.geometry.dispose();
  });
}
// éclairs des canons : points additifs qui s'éteignent en 0,18 s
const tache = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), d = g.createRadialGradient(32, 32, 0, 32, 32, 32); d.addColorStop(0, 'rgba(255,255,255,1)'); d.addColorStop(0.35, 'rgba(255,255,255,.6)'); d.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = d; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const NECL = 64, ECLATS = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ map: tache, size: 0.26, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
ECLATS.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NECL * 3), 3));
ECLATS.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NECL * 3), 3));
ECLATS.frustumCulled = false; scene.add(ECLATS);
const eclats = [];
export function eclat(p, fort = 1) { if (eclats.length < NECL - 2) { eclats.push({ x: p.x, y: p.y, z: p.z, vie: 0.18 }); if (fort > 1) eclats.push({ x: p.x, y: p.y + 0.01, z: p.z, vie: 0.12 }); } }
const versMonde = (o, x, y, z) => { o.updateMatrixWorld(true); return _p.set(x, y, z).applyMatrix4(o.matrixWorld).clone(); };

// ---------------------------------------------------------------- le camp : de quel côté de la place, et le repère du siège
const camps = new Map(); // case de la place → { cible: [x, z] (point vers lequel la brèche s'ouvre), u: [ux, uz], R0 }
/** Choisit le côté de chaque siège : la direction la plus dégagée (terre, sans bâtiment), du côté de l'assiégeant. À appeler avant majRemparts. */
export function preparerSieges(etat) {
  camps.clear();
  const C = carte(); if (!C) return;
  const bati = new Set(etat.batiments.map(b => b.case)), foret = etat.cases?.foret || [], arbres = etat.cases?.arbres || [];
  for (const s of etat.sieges || []) {
    const ville = !s.fort && etat.villes.find(v => v.id === s.ville), R0 = ville && ville.fortif >= 3 ? 1 : 0, p0 = posCase(s.case);
    const chez = etat.villes.filter(v => v.proprio === s.assiegeant).map(v => posCase(v.case)).sort((a, b) => Math.hypot(a.x - p0.x, a.z - p0.z) - Math.hypot(b.x - p0.x, b.z - p0.z))[0];
    const vers = chez ? [chez.x - p0.x, chez.z - p0.z] : [0, 0], lv = Math.hypot(...vers) || 1;
    let best = null;
    for (let d = 0; d < 6; d++) {
      let c = s.case; for (let k = 0; k <= R0 && c >= 0; k++) c = voisin(c, d);
      const c2 = c >= 0 ? voisin(c, d) : -1;
      let score = (DIRS[d][0] * vers[0] + DIRS[d][1] * vers[1]) / lv * 1.5 + hache(s.case, d, 91) * 0.1;
      for (const [cc, w] of [[c, 1], [c2, 0.6]]) { if (cc < 0) { score -= 10 * w; continue; } const t = C.terrain[cc]; if (t < 3) score -= 6 * w; else if (t === 6) score -= 2 * w; if (bati.has(cc)) score -= 3 * w; if (foret[cc] || arbres[cc] > 2) score -= 1.5 * w; }
      if (!best || score > best.score) best = { score, d, c };
    }
    const [ux, uz] = DIRS[best.d], ext = SQ3 * (R0 + 1);
    camps.set(s.case, { cible: [p0.x + ux * ext, p0.z + uz * ext], u: [ux, uz], R0 });
  }
}
/** Le camp du siège de la place posée sur cette case (null sans siège). */
export const campDe = c => camps.get(c) || null;
/** Où se tient l'armée assiégeante (au camp, face à la place) : { x, z, ry } ou null. */
export function campArmee(c) {
  const S = sieges.get(c); if (S) { const p = S.pt(2.75, 1.05); return { x: p.x, z: p.z, ry: capVers(-S.ux, -S.uz) }; }
  const k = camps.get(c); if (!k) return null;
  const p0 = posCase(c); return { x: p0.x + k.u[0] * (SQ3 * (k.R0 + 1) + 0.4), z: p0.z + k.u[1] * (SQ3 * (k.R0 + 1) + 0.4), ry: capVers(-k.u[0], -k.u[1]) };
}

// ---------------------------------------------------------------- les ouvrages d'un siège
// S.pt(d, v) : point à la distance d (le pied du mur assiégé vers d = 0,58) et au décalage latéral v ; (S.ux, S.uz) va de la place vers le camp.
const ETAPES_SIEGE = [ // parallèles de Vauban et boyaux en zigzag, avec le mois où chacun est creusé
  { m: 1, pts: [[3.0, 0.05], [2.7, 0.24], [2.4, -0.18], [2.12, 0.16], [1.88, -0.04]] }, { m: 1, pts: [[1.88, -0.78], [1.86, 0.78]] },
  { m: 2, pts: [[1.88, -0.04], [1.72, 0.2], [1.57, -0.17], [1.42, 0.04]] }, { m: 2.6, pts: [[1.42, -0.62], [1.42, 0.62]] },
  { m: 4, pts: [[1.42, 0.04], [1.3, -0.17], [1.17, 0.14], [1.04, -0.02]] }, { m: 5, pts: [[1.04, -0.42], [1.04, 0.42]] },
];
const K = 0.62, E = 1.25; // K : le siège de la maquette ramené aux cases du jeu ; E : ouvrages un peu grossis pour la vue de loin
function travauxSiege(S, g, ep, P, roy, bati) {
  const solT = (x, z) => solEn(x, z) + (bati.has(caseA(x, z)) ? 0.032 : 0); // sur une case bâtie (un faubourg), par-dessus le bâtiment
  S.tranchees = ETAPES_SIEGE.map(({ m, pts }) => {
    const Lt = lot();
    for (let i = 0; i < pts.length - 1; i++) {
      const a = S.pt(...pts[i]), b = S.pt(...pts[i + 1]), l = Math.hypot(b.x - a.x, b.z - a.z), cap = -Math.atan2(b.z - a.z, b.x - a.x), nb = Math.ceil(l / 0.1);
      let nx = -(b.z - a.z) / l, nz = (b.x - a.x) / l; if (nx * -S.ux + nz * -S.uz < 0) { nx = -nx; nz = -nz; } // parapet côté place
      for (let s = 0; s < nb; s++) { // par tronçons, chacun posé sur le sol de sa case
        const f = (s + 0.5) / nb, mx = a.x + (b.x - a.x) * f, mz = a.z + (b.z - a.z) * f, y = solT(mx, mz);
        put(Lt, boite(l / nb + 0.05 * E, 0.003 * E, 0.062 * E), 0xb59c68, mx + nx * 0.008 * E, y + 0.0015 * E, mz + nz * 0.008 * E, cap, 0); // terre rejetée
        put(Lt, boite(l / nb + 0.026 * E, 0.004 * E, 0.026 * E), 0x4a3522, mx - nx * 0.004 * E, y + 0.0025 * E, mz - nz * 0.004 * E, cap, 0); // le fossé
      }
    }
    const t = fige(Lt, g); t.userData.m = m; return t;
  });
  { const Lg = lot(); for (const s of [-1, 1]) for (let i = 0; i < 6; i++) { const p = S.pt(1.35, s * (0.24 + i * 0.065 * E / K)), y = solT(p.x, p.z); put(Lg, cyl(0.014 * E, 0.014 * E, 0.034 * E, 8), 0x9a7a4a, p.x, y + 0.017 * E, p.z, 0, 0.003); put(Lg, cyl(0.015 * E, 0.015 * E, 0.006 * E, 8), 0x6a5030, p.x, y + 0.036 * E, p.z, 0, 0); } S.gabions = fige(Lg, g); }
  const pal = Math.max(0, Math.min(5, P | 0));
  S.batteries = [-1, 1].map(s => {
    const b = maillageCache(`batterie|${ep}|${pal}|${roy}`, Lb => {
      for (const x of [-1.25, 1.25]) {
        if (ep === 'industrie') { // canon rayé de fer sur affût de fer
          const f = cyl(0.17, 0.27, 3.1, 10); f.rotateX(Math.PI / 2 - 0.1); put(Lb, f, 0x3a3d42, x, 1.05, 0.55, 0, 0.06); put(Lb, boite(0.6, 0.45, 2.1), 0x5a5f66, x, 0.62, -0.25, 0, 0.05);
          for (const dx of [-0.55, 0.55]) { const r = cyl(0.6, 0.6, 0.14, 12); r.rotateZ(Math.PI / 2); put(Lb, r, 0x2b2b30, x + dx, 0.6, 0, 0, 0.05); }
        } else canon(Lb, PALIERS[pal], x, 0);
        fantassin(Lb, PALIERS[pal], x - 0.9, -1.4, roy);
      }
      for (const x of [-0.2, 0.25]) put(Lb, cyl(0.38, 0.38, 0.8, 8), 0x6b4a2a, x, 0.4, -2.2, 0, 0.05);
    });
    partage(b); const p = S.pt(1.5, s * 0.42); b.scale.setScalar(0.05 * E); b.position.set(p.x, solT(p.x, p.z), p.z); b.rotation.y = capVers(-S.ux, -S.uz); g.add(b);
    return { g: b, canonsL: [[-1.25, 1.12, 2.05], [1.25, 1.12, 2.05]], ph: s > 0 ? 0 : 1.3 };
  });
}
function gravatsSiege(S, g, pierre, x, y, z, ry, ech) {
  const r = maillageCache(`gravats|${pierre}`, Lr => {
    const b = sphere(1.5, 1); b.scale(1.3, 0.62, 1.9); put(Lr, b, pierre, -0.3, 0, 0, 0, 0.12);
    for (const [gx, gz, s] of [[1.2, 1.1, 0.7], [-0.6, -1.6, 0.6], [1.6, -0.8, 0.55], [0.4, 1.9, 0.5], [-1.4, 0.9, 0.6]]) put(Lr, boite(s, s * 0.7, s * 0.8), pierre, gx, s * 0.3, gz, gx * 2, 0.06);
  });
  partage(r); r.position.set(x, y, z); r.rotation.y = ry; g.add(r); S.gravats = r; S.echG = ech;
}
function campSiege(S, g, roy, P) {
  const c = maillageCache(`camp|${roy}|${P}`, Lc => {
    let i = 0;
    for (const [lx, lz] of [[-5, -3], [-1.5, -4.5], [2.5, -4], [-5, 3.2], [-1.5, 4.6], [2.5, 4]]) { put(Lc, cone(1.5, 2, 4), i++ % 2 ? 0xe9e2d0 : new THREE.Color(roy).getHex(), lx, 1, lz, Math.PI / 4, 0.09); put(Lc, boite(0.5, 0.9, 0.1), 0x2a2420, lx + 1.05, 0.45, lz, Math.PI / 2, 0); }
    put(Lc, boite(0.16, 5.4, 0.16), 0x4a3420, 0, 2.7, 0, 0, 0.06);
    for (const a of [0, 1.2, 2.4]) put(Lc, boite(1.4, 0.18, 0.18), 0x6b4a2a, -1 + Math.cos(a) * 0.1, 0.12, 0, a, 0.06);
    for (const [x, z] of [[1.5, -1.6], [1.5, 1.6]]) fantassin(Lc, PALIERS[P], x, z, roy);
  });
  partage(c); const p = S.pt(3.35, -0.3);
  c.scale.setScalar(0.07); c.position.set(p.x, solEn(p.x, p.z), p.z); c.rotation.y = capVers(-S.ux, -S.uz) - Math.PI / 2; g.add(c);
  drapeau(c, roy, 0, 4.7, 0, 2.4, 1.5);
  S.feuCamp = versMonde(c, -1, 0.9, 0); S.campFumee = 0;
  const f = feu(c, -1, 0.1, 0, 2.6); f.visible = true; S.flammeCamp = f;
}

// ---------------------------------------------------------------- les sièges du plateau
const sieges = new Map(); // case de la place → S
let tourVu = null;

/** Met les sièges d'accord avec l'état : à appeler après majRemparts (la brèche est un morceau des remparts). */
export function majSieges(etat) {
  const ep = etat.epoque?.cle || 'ancien', vus = new Set(), nouveauMois = tourVu !== null && etat.tour !== tourVu;
  tourVu = etat.tour;
  for (const s of etat.sieges || []) {
    const k = camps.get(s.case); if (!k) continue;
    vus.add(s.case);
    const ville = !s.fort && etat.villes.find(v => v.id === s.ville), info = ville ? infoRemparts(ville.id) : null, ib = info?.infoBreche;
    const roy = couleurDe(s.assiegeant), P = palierRoyaume(s.assiegeant), p0 = posCase(s.case), y0 = dessus(s.case);
    // le pied du mur : le milieu de la courtine percée, ou le bord de la place du côté du camp
    const O = ib ? ib.O : [p0.x + k.u[0] * (s.fort ? 0.42 : SQ3 * k.R0 + 0.77), p0.z + k.u[1] * (s.fort ? 0.42 : SQ3 * k.R0 + 0.77)], n = ib ? ib.n : k.u;
    const cle = [ep, roy, P, O.map(v => v.toFixed(3)).join(','), info ? info.g.uuid : 'f', s.fort ? 1 : 0].join('|');
    let S = sieges.get(s.case);
    if (S && S.cle !== cle) { oter(S.g); S = null; }
    if (!S) {
      const g = new THREE.Group(); groupe.add(g);
      S = { cle, g, ux: n[0], uz: n[1], case: s.case, info };
      S.pt = (d, v) => ({ x: O[0] + S.ux * (d - 0.58) * K - S.uz * v * K, z: O[1] + S.uz * (d - 0.58) * K + S.ux * v * K });
      S.H = (ib ? ib.y + ib.H : y0 + 0.13);
      travauxSiege(S, g, ep, P, roy, new Set(etat.batiments.map(b => b.case)));
      const pierre = (STYLE_REMP[ep] || STYLE_REMP.ancien).pierre, gp = S.pt(0.66, 0);
      gravatsSiege(S, g, pierre, gp.x, ib ? ib.y : y0, gp.z, -Math.atan2(S.uz, S.ux), 0.1);
      campSiege(S, g, roy, P);
      // défenseurs et canons de la place : sur les bastions (ou les angles du mur) qui regardent le camp
      const cible = S.pt(3, 0), dist = p => Math.hypot(p.x - cible.x, p.z - cible.z);
      let postes = info ? info.pointes.filter(p => !p.demi && !p.rentrant).sort((a, b) => dist(a) - dist(b)) : [];
      if (!postes.length) postes = [-0.3, 0.3, 0, -0.15, 0.15].map(v => { const q = S.pt(0.5, v); return { x: q.x, z: q.z, y: S.H, nx: S.ux, nz: S.uz }; });
      const defen = couleurDe(s.proprio ?? (ville ? ville.proprio : -1)), Pd = palierRoyaume(s.proprio);
      S.defenseurs = postes.slice(0, 5).map(p => { const d = soldat(g, defen, Pd, ECH_GENS * 0.9); d.position.set(p.x, p.y, p.z); d.rotation.y = capVers(p.nx, p.nz); return d; });
      S.canons = postes.slice(0, 3).map(p => new THREE.Vector3(p.x + p.nx * 0.07, p.y + 0.03, p.z + p.nz * 0.07));
      if (ep === 'ancien' && info) { const Lc = lot(); for (const p of postes.slice(0, 3)) { const b = cyl(0.009, 0.013, 0.075, 6); b.rotateZ(-Math.PI / 2); putR(Lc, b, BRONZE, p.x + p.nx * 0.035 - p.nz * 0.03, p.y + 0.024, p.z + p.nz * 0.035 + p.nx * 0.03, ryDe(p.nx, p.nz), 0.003); putR(Lc, boite(0.04, 0.016, 0.03), 0x8a3a2a, p.x - p.nz * 0.03, p.y + 0.01, p.z + p.nx * 0.03, ryDe(p.nx, p.nz), 0.003); } fige(Lc, g); } // on pose une pièce en 1700 (les autres époques en ont déjà)
      // l'assaut : huit soldats et un porte-drapeau ; le drapeau blanc de la place
      S.assaut = Array.from({ length: 8 }, () => { const a = soldat(g, roy, P, ECH_GENS * 1.15); a.visible = false; return a; });
      S.drapBreche = new THREE.Group(); { const L2 = lot(); put(L2, boite(0.14, 4.6, 0.14), 0x4a3420, 0, 2.3, 0, 0, 0.05); fige(L2, S.drapBreche); drapeau(S.drapBreche, roy, 0, 3.9, 0, 1.6, 1.05); }
      S.drapBreche.scale.setScalar(ECH_GENS * 1.15); S.drapBreche.visible = false; g.add(S.drapBreche);
      S.blanc = new THREE.Group(); { const L2 = lot(); put(L2, boite(0.012, 0.3, 0.012), 0x4a3420, 0, 0.15, 0, 0, 0.004); fige(L2, S.blanc); drapeau(S.blanc, '#f6f4ee', 0.006, 0.26, 0, 0.13, 0.085); }
      { const q = S.pt(0.45, 0.12); S.blanc.position.set(q.x, S.H, q.z); } S.blanc.visible = false; g.add(S.blanc);
      // les pillards : quatre de nos soldats, un sac ou une caisse de butin au retour
      S.pillards = [0, 1, 2, 3].map(i => { const v = soldat(g, roy, P, ECH_GENS * 1.15), b = soldat(g, roy, P, ECH_GENS * 1.15, i % 2 ? 'caisse' : 'sac'); v.visible = b.visible = false; return [v, b]; });
      S.feux = [0, 1, 2].map(() => feu(g, 0, 0, 0, 0.32));
      sieges.set(s.case, S);
    }
    S.mort = false;
    S.mois = s.mois + 1; S.br = s.murs_max > 0 ? 1 - s.murs / s.murs_max : 0; S.faim = s.faim > 0; S.mursPct = s.murs_pct ?? 100;
    if (S.br0 === undefined) S.br0 = S.br;
    // un faubourg pillé ce mois-ci : la sortie des pillards, l'incendie
    if (nouveauMois && s.pillage && s.pillage.case != null) {
      const f = posCase(s.pillage.case), yf = dessus(s.pillage.case), dep = S.pt(3.1, 0), dx = f.x - dep.x, dz = f.z - dep.z, l = Math.hypot(dx, dz) || 1;
      S.pillage = { debut: horloge, de: dep, a: { x: f.x - dx / l * 0.45, z: f.z - dz / l * 0.45 }, f: { x: f.x, y: yf, z: f.z } };
      [[0.32, 0.1], [-0.28, 0.2], [0.02, -0.34]].forEach(([ox, oz], i) => S.feux[i].position.set(f.x + ox, yf + 0.1, f.z + oz));
    }
  }
  for (const [c, S] of sieges) if (!vus.has(c)) { if (S.assautT && horloge < S.assautT.debut + DUREE_ASSAUT) S.mort = true; else { oter(S.g); sieges.delete(c); } }
}

// ---------------------------------------------------------------- le mois joué : assaut, capitulation
const DUREE_ASSAUT = 7.5;
/** Joue sous les yeux du joueur ce que le rapport du mois dit des sièges en cours (appelé par jouerMois, avant le nouvel état). */
export function jouerSieges(rapport) {
  for (const S of sieges.values()) {
    const c = (rapport.combats || []).find(x => x.case === S.case && !x.etape);
    if (c) S.assautT = { debut: horloge, victoire: c.vainqueur === c.attaquant };
    if ((rapport.evenements || []).some(e => e.case === S.case && /capitule/.test(e.texte))) S.capitule = horloge;
  }
}

// ---------------------------------------------------------------- à chaque image
const FL = (a, b, f) => a + (b - a) * f;
chaqueImage((dt, t) => {
  horloge = t;
  for (const [c, S] of sieges) {
    if (S.mort && !(S.assautT && t < S.assautT.debut + DUREE_ASSAUT)) { oter(S.g); sieges.delete(c); continue; }
    const m = S.mois, rendue = S.capitule !== undefined && t - S.capitule < 6, ua = S.assautT ? t - S.assautT.debut : -1, assaut = ua >= 0 && ua < DUREE_ASSAUT;
    for (const g of S.tranchees) g.visible = m >= g.userData.m;
    S.gabions.visible = m >= 2.6;
    for (const b of S.batteries) b.g.visible = m >= 2.6;
    S.br0 += (S.br - S.br0) * Math.min(1, dt * 1.5);
    const br = S.br0;
    if (S.info?.breche) S.info.breche.scale.y = 1 - 0.78 * br;
    S.gravats.scale.setScalar(Math.max(0.001, br) * S.echG);
    // les batteries tirent (pas pendant l'assaut ni la reddition), éclair, fumée, poussière à l'impact
    if (m >= 3 && !rendue && !assaut) for (const b of S.batteries) b.canonsL.forEach(([x, y, z], i) => {
      const per = 2.6, ph = b.ph + i * 1.1;
      if (Math.floor((t - dt - ph) / per) === Math.floor((t - ph) / per)) return;
      const p = versMonde(b.g, x, y, z); eclat(p, 1.6); bouffee(p.x, p.y, p.z, 'poudre', 1.5);
      const cible = S.pt(0.6, (Math.random() - 0.5) * 0.2); setTimeout(() => bouffee(cible.x, S.H * 0.6 + solEn(cible.x, cible.z) * 0.4, cible.z, 'poussiere', 1.1), 380);
    });
    // la place répond tant que ses murs tiennent
    if (m >= 2.6 && S.mursPct > 25 && !rendue && !assaut) S.canons.forEach((p, i) => {
      const per = 3.4, ph = i * 0.9; if (Math.floor((t - dt - ph) / per) === Math.floor((t - ph) / per)) return;
      eclat(p, 1.2); bouffee(p.x, p.y, p.z, 'poudre', 0.9);
      const q = S.pt(1.6 + Math.random() * 0.2, (Math.random() - 0.5) * 1.2); setTimeout(() => bouffee(q.x, solEn(q.x, q.z) + 0.02, q.z, 'poussiere', 0.8), 420);
    });
    // camp : feu et fumée
    animFeu(S.flammeCamp, t); if ((S.campFumee -= dt) <= 0) { S.campFumee = 1.1; bouffee(S.feuCamp.x, S.feuCamp.y, S.feuCamp.z, 'blanche', 0.45); }
    // drapeau blanc : la place a faim, ou elle capitule ce mois-ci
    S.blanc.visible = S.faim || rendue;
    S.defenseurs.forEach(d => { d.visible = !rendue && !(S.assautT?.victoire && ua > DUREE_ASSAUT * 0.62); });
    // l'assaut : la course jusqu'à la brèche, l'escalade des gravats, l'entrée (ou le repli si la place tient)
    const yb = S.info?.infoBreche ? S.info.infoBreche.y : S.H - 0.13, hB = yb + (S.H - yb) * (1 - 0.78 * br), k = 0.55; // k : l'assaut joué en moins de temps que dans la maquette
    S.assaut.forEach((s, i) => {
      s.visible = assaut; if (!s.visible) return;
      const v = (i - 3.5) * 0.07, d0 = S.pt(1.04, v), d1 = S.pt(0.72, v * 0.5), d2 = S.pt(0.53, v * 0.3), d3 = S.pt(0.32, v * 0.8), w = ua / k - i * 0.22;
      let x, z, y; const f1 = lisse(0, 3.2, w), f2 = lisse(3.2, 5, w), f3 = lisse(5.2, 7, w);
      if (!S.assautT.victoire && w > 3.4) { const r = lisse(4.2, 8, w); x = FL(d1.x, d0.x, r); z = FL(d1.z, d0.z, r); y = solEn(x, z); s.visible = w < 8; }
      else if (w < 3.2) { x = FL(d0.x, d1.x, f1); z = FL(d0.z, d1.z, f1); y = solEn(x, z); }
      else if (w < 5.2) { x = FL(d1.x, d2.x, f2); z = FL(d1.z, d2.z, f2); y = FL(solEn(d1.x, d1.z), hB, f2); }
      else { x = FL(d2.x, d3.x, f3); z = FL(d2.z, d3.z, f3); y = hB * (1 - f3) + solEn(x, z) * f3; }
      s.position.set(x, y + (w < 7 ? Math.abs(Math.sin(t * 10 + i)) * 0.006 : 0), z); s.rotation.y = capVers(-S.ux, -S.uz) + (!S.assautT.victoire && w > 3.4 ? Math.PI : 0);
      if (w > 0.5 && w < 3 && Math.random() < dt * 0.9) { const p = versMonde(s, 0.42, 2.8, 0.5); bouffee(p.x, p.y, p.z, 'poudre', 0.5); eclat(p); }
    });
    if (assaut) for (const d of S.defenseurs) if (d.visible && Math.random() < dt * 1.2) { const p = versMonde(d, 0.42, 2.8, 0.5); eclat(p); bouffee(p.x, p.y, p.z, 'poudre', 0.5); }
    S.drapBreche.visible = assaut && S.assautT.victoire && ua > 6.2 * k; if (S.drapBreche.visible) { const p = S.pt(0.54, 0); S.drapBreche.position.set(p.x, hB, p.z); }
    // le pillage d'un faubourg : sortie, fouille, retour chargés ; le faubourg flambe
    const pl = S.pillage, w = pl ? t - pl.debut : 99, brule = w > 0.6 && w < 5.6;
    S.feux.forEach(f => { f.visible = brule; if (brule) animFeu(f, t); });
    if (brule && Math.random() < dt * 9) { const f = S.feux[Math.random() * 3 | 0].position; bouffee(f.x, f.y + 0.12, f.z, 'noire', 1.1); }
    S.pillards.forEach(([v, b], i) => {
      const wi = w - i * 0.2, dehors = wi > 0 && wi < 5.9, retour = wi >= 3.9;
      v.visible = dehors && !retour; b.visible = dehors && retour; if (!dehors) return;
      const s = retour ? b : v, sd = wi < 2.2 ? lisse(0, 2.2, wi) : wi < 3.9 ? 1 : 1 - lisse(3.9, 5.9, wi), cap = Math.atan2(pl.a.x - pl.de.x, pl.a.z - pl.de.z);
      const lat = (i - 1.5) * 0.06; let x = FL(pl.de.x, pl.a.x, sd) + Math.cos(cap) * lat, z = FL(pl.de.z, pl.a.z, sd) - Math.sin(cap) * lat, ry = cap + (retour ? Math.PI : 0);
      if (wi >= 2.2 && wi < 3.9) { const a = t * 1.3 + i * 1.6; x += Math.cos(a) * 0.05; z += Math.sin(a) * 0.05; ry = capVers(-Math.sin(a), Math.cos(a)); } // ils fouillent
      s.position.set(x, solEn(x, z) + Math.abs(Math.sin(t * 9 + i)) * 0.006, z); s.rotation.y = ry;
    });
    if (S.pillards[0][0].visible && Math.random() < dt * 1.6) { const d = S.defenseurs[Math.random() * S.defenseurs.length | 0]; if (d?.visible) { const p = versMonde(d, 0.42, 2.8, 0.5); eclat(p); bouffee(p.x, p.y, p.z, 'poudre', 0.5); } }
  }
  // éclairs
  const pa = ECLATS.geometry.attributes.position, ca = ECLATS.geometry.attributes.color; let n = 0;
  for (let i = eclats.length - 1; i >= 0; i--) { const e = eclats[i]; e.vie -= dt; if (e.vie <= 0) eclats.splice(i, 1); }
  for (const e of eclats) { const f = Math.min(1, e.vie / 0.1); pa.setXYZ(n, e.x, e.y, e.z); ca.setXYZ(n++, f, 0.82 * f, 0.38 * f); }
  ECLATS.geometry.setDrawRange(0, n); pa.needsUpdate = ca.needsUpdate = true;
  // les drapeaux des sièges et des forts
  for (const f of pavillons) { const p = f.geometry.attributes.position, wd = f.userData.w; for (let i = 0; i < p.count; i++) { const u = p.getX(i) / wd; p.setZ(i, Math.sin(t * 6 - u * 5 + f.userData.ph) * u * 0.16 * wd); } p.needsUpdate = true; }
});

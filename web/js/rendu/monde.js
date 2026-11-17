// Ce qui vit sur le plateau et suit l'état de la partie : bâtiments (et chantiers), armées, bannières.
// Joue aussi le mois sous les yeux du joueur : marches des armées et batailles.
import { THREE, scene, posCase, chaqueImage, lerp, hache } from './scene.js';
import { maillageBatiment, maillageChantier, maillageArmee, palierDe } from './modeles.js';
import { dessus, solEn } from './plateau.js';
import { toon, lot, put, fige } from './toon.js';
import { etiquette, balayer, banniere, effet, deplacer } from './etiquettes.js';
import { bouffee } from './vie.js';

const groupe = new THREE.Group();
scene.add(groupe);
const batis = new Map();     // id → { cle, mesh, chantier, parts }
let casesBaties = new Set(); // cases portant un bâtiment : l'armée s'y range au bord
const armees = new Map();    // id → { mesh (THREE.Group), x, z, anim, cle, proprio, marche }
export const parts = { ailes: [], drapeaux: [], cheminees: [], fumees: [] };
let R = null;                // règles
let couleurs = {};
let paliers = {};            // id du royaume → palier de son armée (0 à 5)
let selArmee = null;

export function initMonde(regles) { R = regles; }
export const couleurDe = id => couleurs[id] || '#888';

function viderParts(p) {
  for (const k of ['ailes', 'drapeaux', 'cheminees', 'fumees']) parts[k] = parts[k].filter(x => x.batiment !== p);
}

// les ailes du moulin (unités du plateau, comme la maquette) : quatre bras de bois et leurs toiles
const lotAiles = (() => {
  const La = lot();
  for (let j = 0; j < 4; j++) { put(La, new THREE.BoxGeometry(0.05, 0.44, 0.014).translate(0, 0.22, 0).rotateZ(j * Math.PI / 2), 0x8b5a2b, 0, 0, 0, 0, 0.008); put(La, new THREE.BoxGeometry(0.16, 0.012, 0.006).translate(0, 0.3, 0.01).rotateZ(j * Math.PI / 2), 0xe9dcc0, 0, 0, 0, 0, 0); }
  return La;
})();
const geoAiles = fige(lotAiles).children.map(m => [m.geometry, m.material]);
const geoDrapeau = new THREE.PlaneGeometry(0.22, 0.13, 6, 1).translate(0.11, 0, 0);

function creerParts(b, mesh, anim, couleur) {
  for (const a of anim) {
    const p = new THREE.Vector3(...a.pos).applyMatrix4(mesh.matrixWorld);
    if (a.type === 'ailes') {
      const grp = new THREE.Group();
      for (const [g, m] of geoAiles) grp.add(new THREE.Mesh(g, m));
      grp.position.copy(p);
      grp.rotation.order = 'YXZ';
      grp.rotation.y = mesh.rotation.y;
      grp.children[0].castShadow = true;
      const pivot = new THREE.Group(); pivot.add(grp); groupe.add(pivot);
      parts.ailes.push({ batiment: b.id, obj: grp, pivot });
    } else if (a.type === 'drapeau') {
      const m = new THREE.Mesh(geoDrapeau.clone(), toon(new THREE.Color(a.couleur || couleur), { side: THREE.DoubleSide }));
      m.position.copy(p);
      groupe.add(m);
      parts.drapeaux.push({ batiment: b.id, obj: m, phase: hache(b.id) * 6 });
    } else if (a.type === 'cheminee') parts.cheminees.push({ batiment: b.id, pos: p, prochain: hache(b.id) * 3 });
    else if (a.type === 'fumee') parts.fumees.push({ batiment: b.id, pos: p, noire: !!a.noire, prochain: hache(b.id, 2) * 2 });
  }
}

/** Met les bâtiments, les armées et les bannières d'accord avec l'état. */
export function synchroniser(etat) {
  casesBaties = new Set(etat.batiments.map(b => b.case));
  couleurs = {};
  for (const r of etat.royaumes) couleurs[r.id] = r.couleur;
  couleurs[99] = '#4b4b4b';
  // palier de l'armée : la technologie militaire la plus avancée du royaume (brigands : 0)
  paliers = {};
  for (const r of etat.royaumes) paliers[r.id] = palierDe(r.joueur ? etat.joueur?.techs : r.techs_liste);
  paliers[99] = 0;
  const villes = new Map(etat.villes.map(v => [v.id, v]));
  const vus = new Set();
  for (const b of etat.batiments) {
    vus.add(b.id);
    const def = R.batiments.find(x => x.cle === b.cle);
    const niveau = b.cle === 'hotel' ? (villes.get(b.ville)?.niveau || 1) : 0;
    const cle = `${b.cle}|${couleurs[b.proprio]}|${etat.epoque.cle}|${etat.saison}|${etat.meteo.neige_sol > 0.3 ? 1 : 0}|${niveau}|${b.reste > 0 ? b.reste : 0}|${b.proprio}`;
    const ex = batis.get(b.id);
    if (ex && ex.cle === cle) continue;
    if (ex) { groupe.remove(ex.mesh); if (ex.chantier) groupe.remove(ex.chantier); viderParts(b.id); }
    const { mesh, anim } = maillageBatiment({ cle: b.cle, couleur: couleurs[b.proprio], epoque: etat.epoque.cle, saison: etat.saison, neige: etat.meteo.neige_sol, niveau });
    const { x, z } = posCase(b.case), y = dessus(b.case);
    mesh.position.set(x, y, z);
    mesh.rotation.y = b.face || 0;
    let chantier = null;
    if (b.reste > 0) {
      const duree = Math.max(1, def?.duree || 1), fait = 1 - b.reste / duree;
      mesh.scale.y *= Math.max(0.12, fait * 0.85);
      chantier = maillageChantier();
      chantier.position.set(x, y, z);
      chantier.rotation.y = b.face || 0;
      groupe.add(chantier);
    }
    groupe.add(mesh);
    mesh.updateMatrixWorld();
    if (b.reste === 0) creerParts(b, mesh, anim, couleurs[b.proprio]);
    batis.set(b.id, { cle, mesh, chantier });
  }
  for (const [id, ex] of batis) {
    if (vus.has(id)) continue;
    groupe.remove(ex.mesh); if (ex.chantier) groupe.remove(ex.chantier);
    viderParts(id);
    batis.delete(id);
  }
  // bannières des villes
  for (const v of etat.villes) {
    const { x, z } = posCase(v.case);
    etiquette('v' + v.id, banniere(v, couleurs[v.proprio]), x, dessus(v.case) + 1.05, z);
  }
  balayer('v');
  // armées
  const ids = new Set();
  for (const a of etat.armees) {
    ids.add(a.id);
    majArmee(a, false);
  }
  for (const [id, a] of armees) if (!ids.has(id) && !a.anim) { groupe.remove(a.mesh); armees.delete(id); }
  for (const [id] of armees) if (!ids.has(id)) continue;
  balayerArmees(ids);
}

function balayerArmees(ids) {
  for (const [id, a] of armees) if (!ids.has(id) && !a.anim) { groupe.remove(a.mesh); armees.delete(id); }
  balayer('a');
}

function majArmee(a, fantome) {
  const cle = `${couleurs[a.proprio]}|${paliers[a.proprio] || 0}`;
  let v = armees.get(a.id);
  const { x, z } = posCase(a.case);
  if (!v || v.cle !== cle) {
    if (v) groupe.remove(v.mesh);
    const mesh = maillageArmee(couleurs[a.proprio], paliers[a.proprio] || 0);
    const old = v;
    mesh.rotation.y = old ? old.mesh.rotation.y : 0.5;
    v = { mesh, x: old ? old.x : x, z: old ? old.z : z, cle, anim: old?.anim || null, proprio: a.proprio };
    groupe.add(mesh);
    armees.set(a.id, v);
  }
  // sur une case bâtie, l'armée se range au bord de la case, un peu plus petite, pour ne pas recouvrir le bâtiment
  const bati = casesBaties.has(a.case);
  if (!v.anim) { v.x = x; v.z = z + (bati ? 0.52 : 0); }
  v.mesh.scale.setScalar(bati && !v.anim ? 0.075 : 0.1);
  v.n = a.effectif ?? Object.values(a.unites || {}).reduce((s, n) => s + n, 0);
  v.marche = (a.chemin || []).length > 0;
  v.fantome = fantome;
  etiquetteArmee(a.id, v);
  return v;
}
function etiquetteArmee(id, v) {
  const html = `<div class="arm ${selArmee === id ? 'sel' : ''} ${v.marche ? 'marche' : ''}" style="--c:${couleurs[v.proprio]}">🛡 ${v.n}</div>`;
  etiquette('a' + id, html, v.x, 0.95, v.z, { dy: -6, loin: 75 });
}
export function selectionnerArmee(id) {
  selArmee = id;
  for (const [aid, v] of armees) etiquetteArmee(aid, v);
}

// ------------------------------------------------------------------ le mois joué sous les yeux du joueur
/** Anime les marches et batailles du rapport ; `apres` : l'état du mois suivant (armées créées en route). */
export function jouerMois(rapport, apres, duree = 2800) {
  const etapes = Math.max(1, ...rapport.mouvements.map(m => m.trajet.length - 1), ...rapport.combats.map(c => c.etape || 1));
  const t0 = performance.now();
  for (const m of rapport.mouvements) {
    let v = armees.get(m.armee);
    if (!v) {
      const a = apres.armees.find(x => x.id === m.armee) || { id: m.armee, proprio: m.proprio, case: m.trajet[0], unites: { milice: 6 }, chemin: [] };
      v = majArmee({ ...a, case: m.trajet[0] }, true);
    }
    v.anim = { trajet: m.trajet, t0, duree: duree * (m.trajet.length - 1) / etapes };
    v.marche = true;
  }
  const combats = rapport.combats.map(c => ({ ...c, t: t0 + duree * (c.etape || 1) / etapes - 150, fait: false }));
  return new Promise(res => {
    const fin = () => {
      for (const [, v] of armees) v.anim = null;
      res();
    };
    setTimeout(fin, (rapport.mouvements.length || combats.length ? duree : 0) + 400);
    attente = combats;
  });
}
let attente = [];

chaqueImage((dt, t) => {
  const now = performance.now();
  for (const c of attente) {
    if (c.fait || now < c.t) continue;
    c.fait = true;
    const { x, z } = posCase(c.case), y = dessus(c.case);
    effet(x, y + 0.9, z, '⚔️');
    for (let k = 0; k < 7; k++) setTimeout(() => bouffee(x + (Math.random() - 0.5) * 0.7, y + 0.15, z + (Math.random() - 0.5) * 0.7, 'poudre'), k * 90);
    setTimeout(() => effet(x, y + 1.3, z, c.vainqueur === 0 ? '🏆' : (c.attaquant === 0 || c.defenseur === 0) ? '💀' : '🏳️'), 700);
  }
  for (const [id, v] of armees) {
    if (v.anim) {
      const a = v.anim, k = Math.min(1, (now - a.t0) / Math.max(1, a.duree));
      const f = k * (a.trajet.length - 1), i = Math.min(a.trajet.length - 2, Math.floor(f)), r = f - i;
      const p = posCase(a.trajet[i]), q = posCase(a.trajet[Math.min(i + 1, a.trajet.length - 1)]);
      v.x = lerp(p.x, q.x, r); v.z = lerp(p.z, q.z, r);
      v.mesh.rotation.y = -Math.atan2(q.z - p.z, q.x - p.x) + Math.PI / 2;
      v.pas = (v.pas || 0) + dt * 14;
    }
    const bob = v.anim ? Math.abs(Math.sin(v.pas || 0)) * 0.04 : 0;
    v.mesh.position.set(v.x, solEn(v.x, v.z) + 0.02 + bob, v.z);
    deplacer('a' + id, v.x, 0.95, v.z);
  }
  for (const a of parts.ailes) a.obj.rotation.z += dt * (1.2 + vent.v * 3);
  for (const d of parts.drapeaux) {
    const pos = d.obj.geometry.attributes.position;
    for (let k = 0; k < pos.count; k++) { const x = pos.getX(k); pos.setZ(k, Math.sin(t * (4 + vent.v * 6) + x * 18 + d.phase) * 0.025 * (x / 0.22) * (0.4 + vent.v)); }
    pos.needsUpdate = true;
    d.obj.rotation.y = vent.dir;
  }
});
export const vent = { v: 0.3, dir: 0 };

/** Les armées posées sur le plateau, pour la vie (exercice, marche au tambour, bivouac) : groupe = leur THREE.Group dans la scène. */
export function listeArmees() {
  return [...armees].map(([id, v]) => ({ id, proprio: v.proprio, groupe: v.mesh, enMarche: !!(v.marche || v.anim) }));
}

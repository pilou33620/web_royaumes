// La vie de la carte : fumées des cheminées et des ateliers, nuages et leurs ombres, oiseaux, barques et voiliers,
// villageois et charrettes, moutons. Tout est décor : rien ici ne touche aux règles.
import { THREE, scene, posCase, chaqueImage, hache, cam, voisins, lerp } from './scene.js';
import { dessus, carte, TERRE, solEn, U } from './plateau.js';
import { parts, couleurDe } from './monde.js';

export const climat = { froid: true, vent: 0.3, dir: 0, nuages: 6, gris: 0, oiseaux: true };
const groupe = new THREE.Group();
scene.add(groupe);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ fumées
function pool(couleur, opacite, n) {
  const m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.1, 1), new THREE.MeshLambertMaterial({ color: couleur, transparent: true, opacity: opacite, depthWrite: false }), n);
  m.count = 0;
  m.frustumCulled = false;
  groupe.add(m);
  return { m, p: [] };
}
const fumees = { blanche: pool(0xf4f4f4, 0.38, 600), noire: pool(0x5a5853, 0.42, 400), poudre: pool(0xf4f1ea, 0.75, 200), poussiere: pool(0xcbb48a, 0.5, 120) };
export function bouffee(x, y, z, genre = 'blanche') {
  const f = fumees[genre];
  if (f.p.length >= f.m.instanceMatrix.count) f.p.shift();
  const vie = genre === 'poudre' ? 2.2 : genre === 'poussiere' ? 1.2 : 3.6 + Math.random() * 1.2;
  f.p.push({ x, y, z, age: 0, vie, t0: genre === 'poudre' ? 1.6 : genre === 'poussiere' ? 0.22 : 0.45, monte: genre === 'poudre' ? 0.25 : genre === 'poussiere' ? 0.12 : 0.32, s: Math.random() * 6 });
}
function majFumees(dt) {
  const vx = Math.cos(climat.dir) * climat.vent * 0.45, vz = Math.sin(climat.dir) * climat.vent * 0.45;
  for (const f of Object.values(fumees)) {
    let n = 0;
    for (let i = f.p.length - 1; i >= 0; i--) {
      const q = f.p[i];
      q.age += dt;
      if (q.age > q.vie) { f.p.splice(i, 1); continue; }
      q.y += q.monte * dt;
      q.x += (vx + Math.sin(q.s + q.age) * 0.03) * dt;
      q.z += vz * dt;
    }
    for (const q of f.p) {
      const k = q.age / q.vie, taille = q.t0 * (0.6 + k * 1.6) * (k > 0.75 ? (1 - k) / 0.25 : 1);
      _m.compose(_p.set(q.x, q.y, q.z), _q.identity(), _s.set(taille, taille, taille));
      f.m.setMatrixAt(n++, _m);
    }
    f.m.count = n;
    f.m.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ nuages (et leurs ombres)
const matNuage = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false, flatShading: true });
const geoNuage = (() => {
  const s = new THREE.IcosahedronGeometry(1, 1);
  const P = [];
  for (const [x, y, z, k] of [[0, 0, 0, 1.3], [1.3, -0.2, 0.3, 1], [-1.2, -0.25, -0.2, 0.95], [0.5, 0.45, -0.4, 0.9], [-0.4, 0.3, 0.6, 0.8]]) {
    const g = s.clone(); g.scale(k * 1.2, k * 0.7, k); g.translate(x * 1.1, y, z); P.push(g.toNonIndexed());
  }
  let n = 0; for (const p of P) n += p.attributes.position.count;
  const A = new Float32Array(n * 3), B = new Float32Array(n * 3); let o = 0;
  for (const p of P) { A.set(p.attributes.position.array, o * 3); B.set(p.attributes.normal.array, o * 3); o += p.attributes.position.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(A, 3)); g.setAttribute('normal', new THREE.BufferAttribute(B, 3));
  return g;
})();
const nuages = [];
for (let i = 0; i < 16; i++) {
  const m = new THREE.Mesh(geoNuage, matNuage);
  m.castShadow = true;
  m.visible = false;
  const s = 1.2 + hache(i, 3) * 1.4;
  m.scale.set(s, s, s);
  groupe.add(m);
  nuages.push({ m, x: hache(i, 1) * 80, z: hache(i, 2) * 60, y: 9 + hache(i, 4) * 3 });
}
function majNuages(dt) {
  const vx = Math.cos(climat.dir) * (0.3 + climat.vent * 1.6), vz = Math.sin(climat.dir) * (0.3 + climat.vent * 1.6);
  const R = Math.max(30, cam.d * 1.6);
  // visibles de loin seulement : de près, seule leur ombre passe sur la campagne
  const op = Math.min(1, Math.max(0, (cam.d - 30) / 25)) * (0.75 + climat.gris * 0.2);
  matNuage.opacity = op;
  matNuage.colorWrite = op > 0.02;
  matNuage.color.setRGB(1 - climat.gris * 0.45, 1 - climat.gris * 0.43, 1 - climat.gris * 0.38);
  nuages.forEach((n, i) => {
    n.m.visible = i < climat.nuages;
    n.x += vx * dt; n.z += vz * dt;
    if (n.x - cam.x > R) n.x -= 2 * R; if (n.x - cam.x < -R) n.x += 2 * R;
    if (n.z - cam.z > R) n.z -= 2 * R; if (n.z - cam.z < -R) n.z += 2 * R;
    n.m.position.set(n.x, n.y, n.z);
  });
}

// ------------------------------------------------------------------ oiseaux
const geoOiseau = (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.12, 0.03, -0.06, -0.02, 0, 0.02, 0, 0, 0, 0.12, 0.03, -0.06, 0.02, 0, 0.02], 3)); g.computeVertexNormals(); return g; })();
const matOiseau = new THREE.MeshBasicMaterial({ color: 0x2a2a2a, side: THREE.DoubleSide });
const vols = [];
for (let i = 0; i < 3; i++) {
  const grp = new THREE.Group();
  for (let k = 0; k < 5; k++) { const o = new THREE.Mesh(geoOiseau, matOiseau); const c = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2); o.position.set(c * 0.3, 0, -Math.abs(c) * 0.25); grp.add(o); }
  groupe.add(grp);
  vols.push({ grp, a: hache(i, 5) * 6.28, x: 0, z: 0, t: 99 });
}
function majOiseaux(dt, t) {
  for (const v of vols) {
    v.t += dt;
    if (v.t > 26) { v.t = 0; v.a = Math.random() * 6.28; v.x = cam.x - Math.cos(v.a) * 25; v.z = cam.z - Math.sin(v.a) * 25; }
    v.x += Math.cos(v.a) * 2.2 * dt; v.z += Math.sin(v.a) * 2.2 * dt;
    v.grp.visible = climat.oiseaux;
    v.grp.position.set(v.x, 3.2 + Math.sin(t * 0.5) * 0.3, v.z);
    v.grp.rotation.y = -v.a + Math.PI / 2;
    v.grp.children.forEach((o, k) => { o.scale.y = Math.sin(t * 9 + k) * 1.4; });
  }
}

// ------------------------------------------------------------------ barques, voiliers, villageois, charrettes, moutons
const matCoque = new THREE.MeshLambertMaterial({ color: 0x7a4a24 }), matVoile = new THREE.MeshLambertMaterial({ color: 0xf7f4ea, side: THREE.DoubleSide });
function barque(voile) {
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.BoxGeometry(voile ? 0.5 : 0.26, 0.07, voile ? 0.16 : 0.1).translate(0, 0.035, 0), matCoque); c.castShadow = true; g.add(c);
  if (voile) { const mat = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.45, 0.02).translate(0, 0.25, 0), matCoque); g.add(mat); const v = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.32).translate(0, 0.27, 0), matVoile); v.rotation.y = Math.PI / 2; v.castShadow = true; g.add(v); g.userData.voile = v; }
  return g;
}
const geoVillageois = new THREE.CylinderGeometry(0.03, 0.04, 0.12, 6).translate(0, 0.06, 0);
const geoTete = new THREE.SphereGeometry(0.03, 6, 4).translate(0, 0.15, 0);
const matPeau = new THREE.MeshLambertMaterial({ color: 0xf0c9a0 });
const HABITS = [0x8b3a2a, 0x3b5998, 0x6b8e23, 0x8b6914, 0x5a4a7a, 0xcfc6b0].map(c => new THREE.MeshLambertMaterial({ color: c }));
const matMouton = new THREE.MeshLambertMaterial({ color: 0xf4f2ea }), matTeteM = new THREE.MeshLambertMaterial({ color: 0x2b2b2b });
let acteurs = [], papillons = [], eaux = [], saison = 2;
const matCerf = new THREE.MeshLambertMaterial({ color: 0x8a5a32 }), matBois = new THREE.MeshLambertMaterial({ color: 0xd9c7a0 });
function cerf() {
  const g = new THREE.Group();
  const corps = new THREE.Mesh(new THREE.SphereGeometry(0.06, 7, 5).scale(1.6, 0.8, 0.8), matCerf); corps.position.y = 0.12; corps.castShadow = true; g.add(corps);
  for (const [px, pz] of [[0.06, 0.03], [0.06, -0.03], [-0.06, 0.03], [-0.06, -0.03]]) g.add(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.09, 0.012).translate(px, 0.045, pz), matCerf));
  const tete = new THREE.Group(); tete.position.set(0.09, 0.15, 0);
  tete.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.02).translate(0, 0.03, 0), matCerf));
  tete.add(new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4).scale(1.4, 1, 1).translate(0.015, 0.07, 0), matCerf));
  for (const s of [1, -1]) tete.add(new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.05, 0.006).translate(0, 0.1, s * 0.015).rotateX(s * 0.4), matBois));
  g.add(tete); g.userData.tete = tete;
  return g;
}
const geoAile = new THREE.PlaneGeometry(0.035, 0.03).translate(0.0175, 0, 0).rotateX(-Math.PI / 2);
const MATS_PAP = [0xfff3a0, 0xffffff, 0xf2a03d, 0x9fc4ff].map(c => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
const groupeActeurs = new THREE.Group();
groupe.add(groupeActeurs);

let liensRoutes = new Map();
/** Le trajet par la route d'une case à l'autre (à défaut : tout droit). */
function trajet(de, vers) {
  const vu = new Map([[de, -1]]), file = [de];
  while (file.length) {
    const c = file.shift();
    if (c === vers) { const p = []; for (let x = vers; x !== -1; x = vu.get(x)) p.unshift(x); return p; }
    for (const n of liensRoutes.get(c) || []) if (!vu.has(n)) { vu.set(n, c); file.push(n); }
  }
  return [de, vers];
}

/** Replace barques, passants et moutons d'après l'état (villes et bâtiments). */
export function majVie(etat) {
  liensRoutes = new Map();
  for (const [a, b] of etat.routes || []) { for (const [x, y] of [[a, b], [b, a]]) { if (!liensRoutes.has(x)) liensRoutes.set(x, []); liensRoutes.get(x).push(y); } }
  papillons = [];
  while (groupeActeurs.children.length) groupeActeurs.remove(groupeActeurs.children[0]);
  acteurs = [];
  saison = etat.saison;
  const C = carte();
  if (!C) return;
  eaux = [];
  for (let i = 0; i < C.terrain.length; i++) if (!TERRE(C.terrain[i])) eaux.push(i);
  // cerfs : un pour une quinzaine de cases de forêt, au plus huit
  const forets = [];
  const F = etat.cases?.foret || C.foret;
  for (let i = 0; i < F.length; i++) if (F[i] && TERRE(C.terrain[i])) forets.push(i);
  for (let k = 0; k < Math.min(8, Math.floor(forets.length / 15)); k++) {
    const i = forets[Math.floor(hache(k, 71) * forets.length)], { x, z } = posCase(i);
    const g = cerf();
    groupeActeurs.add(g);
    acteurs.push({ g, type: 'cerf', cx: x, cz: z, ph: hache(k, 72) * 6, v: 0.05 + hache(k, 73) * 0.05 });
  }
  const parVille = new Map();
  for (const b of etat.batiments) {
    if (b.reste > 0) {
      // un ouvrier qui martèle sur le chantier
      const { x, z } = posCase(b.case), g = new THREE.Group();
      const corps = new THREE.Mesh(geoVillageois, HABITS[5]); corps.castShadow = true; g.add(corps);
      g.add(new THREE.Mesh(geoTete, matPeau));
      const bras = new THREE.Group(); bras.position.set(0, 0.11, 0.035);
      bras.add(new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, 0.09).translate(0, 0, 0.045), matCoque));
      bras.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.025, 0.025).translate(0, 0, 0.09), matTeteM));
      g.add(bras);
      groupeActeurs.add(g);
      acteurs.push({ g, bras, type: 'ouvrier', x: x + 0.3, z: z + 0.15, y: dessus(b.case), ph: hache(b.id, 8) * 6, prochain: hache(b.id, 9) * 2 });
      continue;
    }
    if (b.ville != null) { if (!parVille.has(b.ville)) parVille.set(b.ville, []); parVille.get(b.ville).push(b); }
    if (b.cle === 'pecheur' || b.cle === 'port') {
      const eau = voisins(b.case).filter(v => !TERRE(C.terrain[v]));
      if (eau.length) {
        const g = barque(b.cle === 'port');
        groupeActeurs.add(g);
        const p = posCase(eau[0]), q = posCase(b.case);
        acteurs.push({ g, type: 'barque', cx: lerp(q.x, p.x, 0.8), cz: lerp(q.z, p.z, 0.8), r: 0.35 + hache(b.id) * 0.25, ph: hache(b.id, 2) * 6, v: 0.25 + hache(b.id, 3) * 0.2 });
      }
    }
    if ((b.cle === 'ferme' || b.cle === 'vignoble' || b.cle === 'champ_patates' || b.cle === 'jardin') && papillons.length < 24) {
      const { x, z } = posCase(b.case);
      for (let k = 0; k < 3; k++) {
        const g = new THREE.Group(), m = MATS_PAP[Math.floor(hache(b.id, k, 11) * MATS_PAP.length)];
        const ag = new THREE.Mesh(geoAile, m), ad = new THREE.Mesh(geoAile, m); ad.scale.x = -1;
        g.add(ag, ad);
        groupeActeurs.add(g);
        const a = { g, ag, ad, type: 'papillon', cx: x, cz: z, y: dessus(b.case), ph: hache(b.id, k, 12) * 6 };
        acteurs.push(a); papillons.push(a);
      }
    }
    if (b.cle === 'bergerie') {
      const { x, z } = posCase(b.case);
      for (let k = 0; k < 4; k++) {
        const g = new THREE.Group();
        const corps = new THREE.Mesh(new THREE.SphereGeometry(0.06, 7, 5).scale(1.3, 0.9, 1), matMouton); corps.position.y = 0.07; corps.castShadow = true; g.add(corps);
        const tete = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), matTeteM); tete.position.set(0.08, 0.09, 0); g.add(tete);
        groupeActeurs.add(g);
        acteurs.push({ g, type: 'mouton', cx: x + 0.12, cz: z + 0.12, ph: hache(b.id, k) * 6, y: dessus(b.case) });
        void solEn;
      }
    }
  }
  // passants entre l'hôtel de ville et les bâtiments
  for (const v of etat.villes) {
    const liste = (parVille.get(v.id) || []).filter(b => b.case !== v.case);
    if (!liste.length) continue;
    const n = Math.min(2 + v.niveau, 6);
    for (let k = 0; k < n; k++) {
      const b = liste[Math.floor(hache(v.id, k, 4) * liste.length)];
      const g = new THREE.Group();
      const corps = new THREE.Mesh(geoVillageois, HABITS[Math.floor(hache(v.id, k, 5) * HABITS.length)]); corps.castShadow = true; g.add(corps);
      g.add(new THREE.Mesh(geoTete, matPeau));
      if (k === 0 && v.niveau >= 2) {
        const ch = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.1).translate(0.14, 0.08, 0), matCoque); ch.castShadow = true; g.add(ch);
      }
      groupeActeurs.add(g);
      acteurs.push({ g, type: 'passant', a: v.case, b: b.case, chemin: trajet(v.case, b.case), ph: hache(v.id, k, 6), v: 0.06 + hache(v.id, k, 7) * 0.05 });
    }
  }
  // quelques voiliers au large
  const larges = [];
  for (let i = 0; i < C.terrain.length; i++) if (C.terrain[i] === 0 && voisins(i).every(v => C.terrain[v] === 0)) larges.push(i);
  for (let k = 0; k < Math.min(4, larges.length); k++) {
    const i = larges[Math.floor(hache(k, 99) * larges.length)], g = barque(true);
    groupeActeurs.add(g);
    const p = posCase(i);
    acteurs.push({ g, type: 'barque', cx: p.x, cz: p.z, r: 1.4 + hache(k, 98), ph: hache(k, 97) * 6, v: 0.08 });
  }
  void couleurDe;
}
function majActeurs(dt, t) {
  for (const a of acteurs) {
    if (a.type === 'barque') {
      const ang = a.ph + t * a.v;
      a.g.position.set(a.cx + Math.cos(ang) * a.r, 0.0 + Math.sin(t * 2 + a.ph) * 0.01, a.cz + Math.sin(ang) * a.r);
      a.g.rotation.y = -ang;
      a.g.rotation.z = Math.sin(t * 1.6 + a.ph) * 0.06 * (0.5 + climat.vent);
    } else if (a.type === 'passant') {
      // les passants suivent la route, case après case
      const u = (Math.sin(t * a.v * 2 / Math.max(1, a.chemin.length - 1) * 1.6 + a.ph * 6.28) + 1) / 2, f = u * (a.chemin.length - 1), n0 = Math.min(a.chemin.length - 2, Math.floor(f));
      const p = posCase(a.chemin[n0]), q = posCase(a.chemin[n0 + 1]);
      const x = lerp(p.x, q.x, f - n0), z = lerp(p.z, q.z, f - n0);
      a.g.position.set(x, solEn(x, z) + 0.02 + Math.abs(Math.sin(t * 9 + a.ph * 9)) * 0.012, z);
      const dir = Math.cos(t * a.v * 2 / Math.max(1, a.chemin.length - 1) * 1.6 + a.ph * 6.28) > 0 ? 1 : -1;
      a.g.rotation.y = -Math.atan2((q.z - p.z) * dir, (q.x - p.x) * dir);
    } else if (a.type === 'cerf') {
      // il broute, relève la tête, fait quelques pas
      const ang = a.ph + Math.sin(t * a.v + a.ph) * 2.5, x = a.cx + Math.cos(ang) * 0.4, z = a.cz + Math.sin(ang * 0.7) * 0.35;
      a.g.position.set(x, solEn(x, z), z);
      a.g.rotation.y = -ang - Math.PI / 2;
      a.g.userData.tete.rotation.z = Math.sin(t * 0.4 + a.ph) > 0.3 ? -1.1 : 0;
    } else if (a.type === 'ouvrier') {
      a.g.position.set(a.x, a.y, a.z);
      a.g.rotation.y = a.ph;
      const coup = (t * 2.2 + a.ph) % 1;
      a.bras.rotation.x = coup < 0.7 ? -1.2 * (coup / 0.7) : -1.2 + 1.2 * ((coup - 0.7) / 0.3);
      a.prochain -= dt;
      if (a.prochain <= 0) { a.prochain = 1.2 + Math.random() * 1.5; bouffee(a.x - 0.15, a.y + 0.05, a.z - 0.1, 'poussiere'); }
    } else if (a.type === 'papillon') {
      // printemps et été, par beau temps
      a.g.visible = (saison === 1 || saison === 2) && climat.oiseaux;
      if (!a.g.visible) continue;
      const u = t * 0.6 + a.ph;
      a.g.position.set(a.cx + Math.sin(u) * 0.35 + Math.sin(u * 2.3) * 0.08, a.y + 0.18 + Math.sin(u * 3.1) * 0.06, a.cz + Math.cos(u * 0.8) * 0.3);
      a.g.rotation.y = -u;
      const b = Math.sin(t * 22 + a.ph * 5) * 1.1;
      a.ag.rotation.z = b; a.ad.rotation.z = -b;
    } else if (a.type === 'mouton') {
      const ang = a.ph + Math.sin(t * 0.15 + a.ph) * 2;
      a.g.position.set(a.cx + Math.cos(ang) * 0.28, a.y, a.cz + Math.sin(ang) * 0.22);
      a.g.rotation.y = -ang - Math.PI / 2;
    }
  }
}

// ------------------------------------------------------------------ poissons qui sautent (pas sur l'eau gelée)
const matPoisson = new THREE.MeshLambertMaterial({ color: 0xb8c4cc }), matRond = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide });
const geoRond = new THREE.RingGeometry(0.05, 0.07, 16).rotateX(-Math.PI / 2);
const sauts = [];
for (let k = 0; k < 4; k++) {
  const p = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 5).rotateZ(-Math.PI / 2), matPoisson);
  const r1 = new THREE.Mesh(geoRond, matRond.clone()), r2 = new THREE.Mesh(geoRond, matRond.clone());
  p.visible = r1.visible = r2.visible = false;
  groupe.add(p, r1, r2);
  sauts.push({ p, r1, r2, t: 9, dx: 0, dz: 0, x: 0, z: 0 });
}
let prochainSaut = 1;
function majPoissons(dt) {
  prochainSaut -= dt;
  if (prochainSaut <= 0 && eaux.length && U.gel.value < 0.4) {
    prochainSaut = 0.6 + Math.random() * 1.6;
    const s = sauts.find(s => s.t > 1.6);
    for (let essai = 0; s && essai < 12; essai++) {
      const q = posCase(eaux[Math.floor(Math.random() * eaux.length)]);
      if (Math.hypot(q.x - cam.x, q.z - cam.z) > cam.d * 0.6) continue;
      const a = Math.random() * 6.28;
      Object.assign(s, { t: 0, x: q.x + (Math.random() - 0.5) * 0.8, z: q.z + (Math.random() - 0.5) * 0.8, dx: Math.cos(a), dz: Math.sin(a) });
      break;
    }
  }
  for (const s of sauts) {
    s.t += dt;
    const u = s.t / 0.7;
    s.p.visible = u < 1;
    if (u < 1) {
      s.p.position.set(s.x + s.dx * 0.3 * u, Math.sin(Math.PI * u) * 0.22, s.z + s.dz * 0.3 * u);
      s.p.rotation.set(0, -Math.atan2(s.dz, s.dx), Math.cos(Math.PI * u) * 1.1);
    }
    // deux ronds dans l'eau : au départ et à l'arrivée
    for (const [r, t0, k] of [[s.r1, 0, 0], [s.r2, 0.7, 1]]) {
      const v = (s.t - t0) / 0.9;
      r.visible = v > 0 && v < 1;
      if (!r.visible) continue;
      r.position.set(s.x + s.dx * 0.3 * k, 0.01, s.z + s.dz * 0.3 * k);
      r.scale.setScalar(1 + v * 3);
      r.material.opacity = 0.7 * (1 - v);
    }
  }
}

// ------------------------------------------------------------------ boucle
chaqueImage((dt, t) => {
  for (const c of parts.cheminees) {
    if (!climat.froid) continue;
    c.prochain -= dt;
    if (c.prochain <= 0) { c.prochain = 0.9 + Math.random() * 0.8; bouffee(c.pos.x, c.pos.y, c.pos.z, 'blanche'); }
  }
  for (const f of parts.fumees) {
    f.prochain -= dt;
    if (f.prochain <= 0) { f.prochain = 0.55 + Math.random() * 0.5; bouffee(f.pos.x, f.pos.y, f.pos.z, f.noire ? 'noire' : 'blanche'); }
  }
  majFumees(dt);
  majNuages(dt);
  majOiseaux(dt, t);
  majActeurs(dt, t);
  majPoissons(dt);
});

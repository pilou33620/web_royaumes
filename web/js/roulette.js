// La roulette de commandes, portée de web_cao (commun/tactile.js) : un disque à secteurs autour de la pointe, un bouton
// central qui la ferme, des groupes qui s'ouvrent en éventail de pastilles. On la remplit selon la case visée (main.js) :
// cible = { titre, ctx, entrees: [{ ico, nom, fn, danger } | { ico, nom, items: [{ ico, nom, info, fn, off, danger }] }] }.
// Toucher une icône la lance ; sans lever la pointe après l'appui long, glisser jusqu'à elle et lever (stylet.js).

const R_BOUTON = 50, R_INT = 60, R_EXT = 146, R_ICO = 104, R_FAN = R_EXT + 34, MAX = 8;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = v => v.toFixed(1);
const pol = (r, a) => [r * Math.sin(a), -r * Math.cos(a)];
function arc(a0, a1, ri, re) {
  const g = a1 - a0 > Math.PI ? 1 : 0, [x0, y0] = pol(re, a0), [x1, y1] = pol(re, a1), [x2, y2] = pol(ri, a1), [x3, y3] = pol(ri, a0);
  return `M${f1(x0)} ${f1(y0)}A${re} ${re} 0 ${g} 1 ${f1(x1)} ${f1(y1)}L${f1(x2)} ${f1(y2)}A${ri} ${ri} 0 ${g} 0 ${f1(x3)} ${f1(y3)}Z`;
}

let el = null, roue = null, ptrRoue = null;

function creer() {
  el = document.createElement('div');
  el.id = 'trRoue';
  el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); ptrRoue = e.pointerId; try { el.setPointerCapture(e.pointerId); } catch (_) { /* déjà relâché */ } survol(e.clientX, e.clientY); });
  el.addEventListener('pointermove', e => { if (ptrRoue === e.pointerId || e.buttons === 0) survol(e.clientX, e.clientY); });
  el.addEventListener('pointerup', e => { e.stopPropagation(); if (ptrRoue !== e.pointerId || !roue) return; ptrRoue = null; choisir(e.clientX, e.clientY, false); });
  el.addEventListener('pointercancel', () => { ptrRoue = null; });
  el.addEventListener('contextmenu', e => e.preventDefault());
  document.body.appendChild(el);
  // Échap la ferme (un toucher hors d'elle aussi : stylet.js)
  addEventListener('keydown', e => { if (roue && e.key === 'Escape') { fermer(); e.stopImmediatePropagation(); } }, true);
}

export const estOuverte = () => !!roue;
export const contient = n => !!(el && n && el.contains(n));

export function ouvrir(x, y, cible) {
  if (!el) creer();
  fermer();
  const entrees = cible.entrees.filter(en => !en.items || en.items.length).slice(0, MAX), n = entrees.length, pas = 2 * Math.PI / n;
  if (!n) return;
  const m = R_EXT + 14;
  x = Math.min(innerWidth - m, Math.max(m, x)); y = Math.min(innerHeight - m, Math.max(m, y));
  roue = { cible, entrees, cx: x, cy: y, chaud: -1, grp: -1, past: null };
  let h = `<svg class="tr-svg" width="2" height="2"><defs>
    <pattern id="trHachure" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#353941"/><line x1="0" y1="0" x2="0" y2="7" stroke="#474c56" stroke-width="2.5"/></pattern>
    <radialGradient id="trBouton" cx="40%" cy="32%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset=".65" stop-color="#e3e5e9"/><stop offset="1" stop-color="#b7bbc3"/></radialGradient>
    <linearGradient id="trBord" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1f2f4"/><stop offset="1" stop-color="#9ea3ac"/></linearGradient>
    <filter id="trFlou" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
    </defs><circle class="tr-guide" r="${R_FAN - 6}"/><path class="tr-lien" d=""/>
    <g class="tr-anneau"><g class="tr-ombre"><circle class="tr-disque" r="${R_EXT}"/></g>`;
  entrees.forEach((en, i) => {
    const a = i * pas, [ix, iy] = pol(R_ICO, a), gy = iy - 7;
    h += `<g class="tr-seg${en.danger ? ' danger' : ''}" data-i="${i}"><path class="tr-coin" d="${arc(a - pas / 2 + 0.012, a + pas / 2 - 0.012, R_INT + 2, R_EXT - 2)}"/>
      <circle class="tr-bulle" cx="${f1(ix)}" cy="${f1(gy)}" r="22"/><g class="tr-ico"><text x="${f1(ix)}" y="${f1(gy)}">${esc(en.ico)}</text></g>
      <text class="tr-nomseg" x="${f1(ix)}" y="${f1(iy + 18)}">${esc(en.nom.slice(0, 14))}</text>`;
    if (en.items) { const [mx, my] = pol(R_EXT - 11, a); h += `<circle class="tr-marque" cx="${f1(mx)}" cy="${f1(my)}" r="3"/>`; }
    h += '</g>';
  });
  h += `<circle class="tr-creux" r="${R_INT}"/><circle class="tr-lueur" r="${R_BOUTON + 1}" filter="url(#trFlou)"/><circle class="tr-bord" r="${R_BOUTON}"/><g class="tr-stries">`;
  for (let k = 0; k < 72; k++) { const a = k * Math.PI / 36, [x0, y0] = pol(R_BOUTON - 1, a), [x1, y1] = pol(R_BOUTON - 5, a); h += `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}"/>`; }
  h += `</g><circle class="tr-face" r="${R_BOUTON - 7}"/><text class="tr-t1" y="-7"></text><text class="tr-t2" y="11"></text></g></svg><div class="tr-eventail"></div>`;
  el.innerHTML = h;
  el.style.left = x + 'px'; el.style.top = y + 'px';
  el.className = 'ouvert ctx-' + (cible.ctx || 'vide');
  majBouton();
}

export function fermer() {
  roue = null; ptrRoue = null;
  if (el) { el.className = ''; el.innerHTML = ''; }
}

function majBouton() {
  if (!roue) return;
  const it = roue.past ? roue.entrees[roue.grp].items[roue.past] : roue.chaud >= 0 ? roue.entrees[roue.chaud] : null;
  el.querySelector('.tr-t1').textContent = String(roue.cible.titre || '').slice(0, 10);
  el.querySelector('.tr-t2').textContent = it ? it.nom.slice(0, 16) : roue.chaud === -2 ? 'fermer' : (roue.cible.ctx || '');
}
function indexSous(x, y) {
  const dx = x - roue.cx, dy = y - roue.cy, d = Math.hypot(dx, dy);
  if (d < R_INT) return -2;
  if (d > R_EXT + 10) return -1;
  const pas = 2 * Math.PI / roue.entrees.length;
  const a = ((Math.atan2(dx, -dy) + pas / 2) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  return Math.floor(a / pas);
}
const pastilleSous = (x, y) => document.elementFromPoint(x, y)?.closest?.('.tr-pastille') || null;
function marquerSeg(i) {
  roue.chaud = i;
  el.querySelectorAll('.tr-seg').forEach(g => { const k = +g.dataset.i; g.classList.toggle('chaud', k === i); g.classList.toggle('ouvert', k === roue.grp); });
}
function marquerPastille(k) {
  roue.past = k;
  el.querySelectorAll('.tr-pastille').forEach(p => p.classList.toggle('chaud', k != null && p.dataset.k === String(k)));
  lien();
}

/** La pointe passe en (x, y) : la commande sous elle s'allume, un groupe ouvre son éventail. */
export function survol(x, y) {
  if (!roue) return;
  const p = pastilleSous(x, y);
  if (p) { marquerPastille(+p.dataset.k); marquerSeg(-1); majBouton(); return; }
  if (roue.past != null) marquerPastille(null);
  const i = indexSous(x, y);
  if (i >= 0) { if (roue.entrees[i].items) { if (roue.grp !== i) eventail(i); } else if (roue.grp >= 0) eventailFermer(); }
  marquerSeg(i); majBouton();
}

// éventail : les pastilles se posent sur un cercle autour de la roue, du côté du groupe, et restent horizontales
function eventail(i) {
  roue.grp = i; roue.past = null;
  const ev = el.querySelector('.tr-eventail'), items = roue.entrees[i].items;
  ev.innerHTML = items.map((it, k) => `<button type="button" class="tr-pastille${it.danger ? ' danger' : ''}${it.off ? ' off' : ''}" data-k="${k}"><span class="tr-gl">${esc(it.ico)}</span><span>${esc(it.nom)}</span>${it.info ? `<small>${esc(it.info)}</small>` : ''}</button>`).join('');
  el.classList.add('eventail');
  const els = [...ev.children], n = els.length, H = 44, G = 8, mid = (n - 1) / 2;
  const a = i * 2 * Math.PI / roue.entrees.length, s = Math.sin(a), c = -Math.cos(a);
  const pos = els.map((e, k) => {
    const w = e.offsetWidth;
    if (Math.abs(s) > 0.35) { const yy = R_FAN * c + (k - mid) * (H + G), dx = Math.sqrt(Math.max(0, R_FAN * R_FAN - yy * yy)); return { e, x: s > 0 ? Math.max(dx, 24) : -Math.max(dx, 24) - w, y: yy - H / 2, w }; }
    const yy = c < 0 ? -R_FAN - H - k * (H + G) : R_FAN + k * (H + G);
    return { e, x: R_FAN * s - w / 2, y: yy, w };
  });
  // l'éventail reste dans l'écran : on le décale d'un bloc
  let dx = 0, dy = 0;
  const minX = Math.min(...pos.map(p => roue.cx + p.x)), maxX = Math.max(...pos.map(p => roue.cx + p.x + p.w));
  const minY = Math.min(...pos.map(p => roue.cy + p.y)), maxY = Math.max(...pos.map(p => roue.cy + p.y + H));
  if (minX < 8) dx = 8 - minX; else if (maxX > innerWidth - 8) dx = innerWidth - 8 - maxX;
  if (minY < 8) dy = 8 - minY; else if (maxY > innerHeight - 8) dy = innerHeight - 8 - maxY;
  pos.forEach((p, k) => { p.e.style.left = (p.x + dx) + 'px'; p.e.style.top = (p.y + dy) + 'px'; p.e.style.animationDelay = (k * 25) + 'ms'; });
  marquerSeg(roue.chaud); lien();
}
function eventailFermer() {
  roue.grp = -1; roue.past = null;
  el.querySelector('.tr-eventail').innerHTML = '';
  el.classList.remove('eventail');
  lien();
}
function lien() {
  const l = el?.querySelector('.tr-lien'); if (!l || !roue) return;
  const cible = roue.grp < 0 ? null : (el.querySelector('.tr-pastille.chaud') || el.querySelector('.tr-pastille'));
  if (!cible) return void l.setAttribute('d', '');
  const a = roue.grp * 2 * Math.PI / roue.entrees.length, [x0, y0] = pol(R_EXT, a), [x1, y1] = pol(R_EXT + 14, a);
  const x = parseFloat(cible.style.left), y = parseFloat(cible.style.top), w = cible.offsetWidth;
  let bx, by;
  if (Math.abs(Math.sin(a)) > 0.35) { bx = x + w / 2 < 0 ? x + w : x; by = y + 22; } else { bx = x + w / 2; by = y + 22 < 0 ? y + 44 : y; }
  l.setAttribute('d', `M${f1(x0)} ${f1(y0)}L${f1(x1)} ${f1(y1)}L${f1(bx)} ${f1(by)}`);
}

/** Lever la pointe en (x, y) : une pastille ou une commande se lance, un groupe s'ouvre, le centre ferme.
 *  `glisse` : la pointe arrive de l'appui long sans avoir été levée (le centre vaut alors renoncement). */
export function choisir(x, y, glisse) {
  if (!roue) return;
  const p = pastilleSous(x, y);
  if (p) { const it = roue.entrees[roue.grp].items[+p.dataset.k]; fermer(); if (!it.off) it.fn(); return; }
  const i = indexSous(x, y);
  if (i === -2) return fermer();
  if (i < 0) return; // levée hors de la roulette : elle reste ouverte
  const en = roue.entrees[i];
  if (en.items) { if (roue.grp !== i) eventail(i); marquerSeg(i); majBouton(); return; }
  fermer(); en.fn();
}

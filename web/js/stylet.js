// Le stylet et le doigt sur la carte, comme dans web_cao (commun/tactile.js) : rejet de la paume, appui long, bouton latéral.
// La bibliothèque (scene.js) garde ses gestes ; on passe avant elle (écoute en capture sur window) pour lui retirer ce qui
// n'est pas pour elle : les points de la paume, et le geste qu'un appui long a pris (pointercancel, qu'elle sait traiter).
// - Paume : tant que le stylet est posé, et 0,4 s après, un doigt sur la carte est ignoré ; posée avant lui, elle est annulée.
// - Appui long (0,45 s, tolérance 10 px au stylet, 14 px au doigt) : un anneau se remplit sous la pointe, puis l'action du
//   clic droit (main.js : l'armée sélectionnée marche vers la case ; sans armée sélectionnée, la case est inspectée).
// - Bouton latéral d'un stylet qui en a un : la même action, tout de suite.
// - Sélection de texte bloquée au stylet, hors des champs de saisie.
import { canvas, solA, caseA } from '../graphismes/rendu/scene.js';

const APPUI_MS = 450, PAUME_MS = 400, SEUIL = { pen: 10, touch: 14 };
const ptr = new Map();      // points posés sur la carte (stylet, doigt) : id → { x, y, x0, y0, type }
const rejetes = new Set();  // points retirés à la bibliothèque : on avale leur suite
let styletPose = false, dernierStylet = 0, appui = null, action = () => {}, dernierType = '';

const surCarte = e => e.target === canvas;
const paume = e => e.pointerType === 'touch' && (styletPose || performance.now() - dernierStylet < PAUME_MS);
function rejeter(e) { rejetes.add(e.pointerId); e.stopImmediatePropagation(); if (e.cancelable) e.preventDefault(); }
// retire un point à la bibliothèque : elle l'oublie comme un geste interrompu
function annuler(id, p) { try { canvas.dispatchEvent(new PointerEvent('pointercancel', { pointerId: id, pointerType: p.type, bubbles: true, clientX: p.x, clientY: p.y })); } catch (_) { /* navigateur sans PointerEvent */ } }
function lancer(x, y) {
  const s = solA(x, y), i = s ? caseA(s.x, s.z) : -1;
  if (i >= 0) action(i);
}

function appuiDebut(e) {
  const anneau = document.createElement('div');
  anneau.className = 'appui-long';
  anneau.style.left = e.clientX + 'px'; anneau.style.top = e.clientY + 'px';
  anneau.style.animationDuration = (APPUI_MS - 120) + 'ms';
  document.body.appendChild(anneau);
  const id = e.pointerId;
  appui = { id, anneau, minuterie: setTimeout(() => appuiFin(id), APPUI_MS) };
}
function appuiAnnuler() {
  if (!appui) return;
  clearTimeout(appui.minuterie); appui.anneau.remove(); appui = null;
}
function appuiFin(id) {
  const p = ptr.get(id);
  appuiAnnuler();
  if (!p) return;
  ptr.delete(id); rejetes.add(id); annuler(id, p);
  try { navigator.vibrate?.(12); } catch (_) { /* pas de vibreur */ }
  lancer(p.x, p.y);
}

addEventListener('pointerdown', e => {
  dernierType = e.pointerType;
  if (e.pointerType === 'pen') { styletPose = true; dernierStylet = performance.now(); }
  if (!surCarte(e)) return;
  if (paume(e)) return rejeter(e);
  if (e.pointerType === 'pen') {
    // la paume était là avant le stylet : la bibliothèque y croirait à un pincement
    for (const [id, p] of ptr) if (p.type === 'touch') { ptr.delete(id); rejetes.add(id); if (appui?.id === id) appuiAnnuler(); annuler(id, p); }
    if (e.buttons & 2) { rejeter(e); lancer(e.clientX, e.clientY); return; } // bouton latéral
  }
  if (e.pointerType !== 'pen' && e.pointerType !== 'touch') return;
  ptr.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, type: e.pointerType });
  appuiAnnuler();
  if (ptr.size === 1) appuiDebut(e); // deux points posés : c'est un pincement
}, true);

addEventListener('pointermove', e => {
  if (rejetes.has(e.pointerId)) return void e.stopImmediatePropagation();
  const p = ptr.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX; p.y = e.clientY;
  if (appui?.id === e.pointerId && Math.hypot(p.x - p.x0, p.y - p.y0) >= SEUIL[p.type]) appuiAnnuler();
}, true);

function fin(e) {
  // seul le vrai lever du stylet compte (le pointercancel envoyé par appuiFin le laisse posé)
  if (e.pointerType === 'pen' && e.isTrusted) { styletPose = false; dernierStylet = performance.now(); }
  if (rejetes.has(e.pointerId)) {
    // notre propre pointercancel doit atteindre la bibliothèque ; la vraie fin du point, non
    if (e.isTrusted) { rejetes.delete(e.pointerId); e.stopImmediatePropagation(); }
    return;
  }
  if (appui?.id === e.pointerId) appuiAnnuler();
  ptr.delete(e.pointerId);
}
addEventListener('pointerup', fin, true);
addEventListener('pointercancel', fin, true);

// pas de sélection de texte au stylet, hors des champs de saisie
const saisissable = n => !!(n?.nodeType === 1 ? n : n?.parentElement)?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
addEventListener('selectstart', e => { if (dernierType === 'pen' && !saisissable(e.target)) e.preventDefault(); }, true);

/** L'action de l'appui long et du bouton latéral sur la case `i` (main.js). */
export function installerStylet(f) { action = f; }

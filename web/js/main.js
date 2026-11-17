// Royaumes des Rives : démarrage, écran d'accueil (réglage de la carte avec aperçu 3D), boucle des tours.
import { api } from './api.js';
import { renderer, cam, viser, surTap, posCase, chaqueImage, scene } from './rendu/scene.js';
import * as plateau from './rendu/plateau.js';
import { initMonde, synchroniser, jouerMois, selectionnerArmee } from './rendu/monde.js';
import { majVie } from './rendu/vie.js';
import { appliquerMeteo } from './rendu/meteo.js';
import { majRoutes, effacerRoutes } from './rendu/routes.js';
import { toutEffacer, effet } from './rendu/etiquettes.js';
import * as ui from './ui.js';

const $ = s => document.querySelector(s);
const J = { R: null, carte: null, etat: null, info: null, mode: null, ombres: true, occupe: false, versionCarte: -1 };
window.__jeu = J; // pour les bancs d'essai

chaqueImage(plateau.animer);

// ------------------------------------------------------------------ accueil
const CHAMPS = ['taille', 'graine', 'oceans', 'forets', 'lacs', 'rivieres', 'montagnes', 'mines', 'rivaux', 'attitude', 'difficulte', 'brigands', 'capitale'];
function lireOptions() {
  const v = id => $('#o_' + id).value;
  const o = {
    taille: v('taille'), graine: parseInt(v('graine')) || 1, oceans: +v('oceans'), forets: +v('forets'), lacs: +v('lacs'), rivieres: +v('rivieres'),
    montagnes: +v('montagnes'), mines: +v('mines'), rivaux: +v('rivaux'), attitude: v('attitude'), difficulte: +v('difficulte'), brigands: v('brigands') === '1', capitale: v('capitale').trim() || 'Valdor',
  };
  $('#v_oceans').textContent = o.oceans + ' %'; $('#v_forets').textContent = o.forets + ' %'; $('#v_lacs').textContent = o.lacs; $('#v_rivieres').textContent = o.rivieres;
  $('#v_montagnes').textContent = o.montagnes + ' %'; $('#v_mines').textContent = ['', 'Pauvre', 'Normale', 'Riche'][o.mines]; $('#v_rivaux').textContent = o.rivaux;
  try { localStorage.setItem('royaumes-options', JSON.stringify(o)); } catch { /* stockage indisponible */ }
  return o;
}
let minuterie = null, demande = 0;
async function apercu() {
  const n = ++demande, c = await api.apercu(lireOptions());
  if (n !== demande || !c || c.ok === false) return;
  J.carte = c;
  plateau.construire(c);
  effacerRoutes();
  toutEffacer();
  const ex = { cases: { proprio: new Array(c.l * c.h).fill(-1), arbres: c.arbres, foret: c.foret, bois: [] }, batiments: [], royaumes: [], saison: 2, meteo: { neige_sol: 0 } };
  plateau.majEtat(ex);
  plateau.majSaison(2, 0);
  cadrer(c);
  cam.auto = true;
}
function cadrer(c) {
  cam.l = Math.sqrt(3) * c.l; cam.h = 1.5 * c.h;
  cam.x = cam.l / 2; cam.z = cam.h / 2;
  cam.cible = Math.max(cam.l, cam.h) * 0.72;
}
function accueil(montrer) {
  $('#accueil').hidden = !montrer;
  for (const id of ['#haut', '#bas', '#fin-tour']) $(id).hidden = montrer;
}

// ------------------------------------------------------------------ partie
async function chargerCarte() {
  const c = await api.carte();
  J.carte = c;
  J.versionCarte = c.version;
  plateau.construire(c);
  effacerRoutes();
  cadrer(c);
}
function appliquer(etat) {
  J.etat = etat;
  plateau.majEtat(etat);
  plateau.majSaison(etat.saison, etat.meteo.neige_sol);
  synchroniser(etat);
  majRoutes(etat.routes);
  majVie(etat);
  appliquerMeteo(etat.meteo, etat.saison);
  ui.majHUD();
}
async function lancer() {
  $('#chargement').classList.remove('cache');
  $('#chargement-texte').textContent = 'Le royaume s\'éveille…';
  toutEffacer();
  await chargerCarte();
  const etat = await api.etat();
  if (!etat || etat.ok === false) { ui.annonce('Aucune partie en cours', 'guerre'); return; }
  accueil(false);
  appliquer(etat);
  const cap = etat.villes.find(v => v.proprio === 0 && v.capitale) || etat.villes.find(v => v.proprio === 0);
  if (cap) { const p = posCase(cap.case); viser(p.x, p.z, 24); cam.lacet = 0; }
  $('#chargement').classList.add('cache');
  if (etat.tour === 3 && !etat.batiments.some(b => b.proprio === 0 && !['hotel', 'cabane'].includes(b.cle))) {
    await ui.modale(`👑 Avril 1700 — ${cap ? cap.nom : ''}`, `<p>Votre hameau s'éveille au printemps. Chaque <b>tour dure un mois</b> : donnez vos ordres, puis touchez <b>« Fin du mois »</b>.</p>
      <p>🏗️ <b>Construisez</b> bûcherons, pêcheurs, carrières, et des fermes sans tarder : le blé se récolte l'été et l'automne, rien ne pousse l'hiver, et le froid demande du bois de chauffage.</p>
      <p>🌦️ <b>Le temps compte</b> : neige et boue ralentissent les armées, la pluie mouille la poudre, la canicule brûle les récoltes. Touchez la météo pour les prévisions.</p>
      <p>🤝 Commercez, alliez-vous… ou faites la guerre. De 1700 à 1850, les découvertes changent vos bâtiments et vos armées.</p>
      <p class="mini">Glisser = déplacer · pincer = zoom · deux doigts = tourner · toucher une case pour l'inspecter.</p>`, [{ l: 'C\'est parti !', v: true }]);
  }
  propositions();
  finDePartie();
}

async function cmd(c) {
  const r = await api.cmd(c);
  if (r && r.etat) appliquer(r.etat);
  return r || { ok: false, msg: 'Serveur injoignable' };
}

async function finTour() {
  if (J.occupe || !J.etat || J.etat.fin && !J.etat.sans_victoire) return;
  J.occupe = true;
  annulerMode();
  ui.fermerFeuille();
  const bouton = $('#fin-tour');
  bouton.disabled = true; bouton.classList.add('anime');
  try {
    const r = await api.finTour();
    if (!r || !r.ok) { ui.annonce('❌ ' + (r?.msg || 'Erreur du serveur'), 'guerre'); return; }
    await jouerMois(r.rapport, r.etat);
    if (r.etat.version_carte !== J.versionCarte) await chargerCarte();
    appliquer(r.etat);
    for (const c of r.rapport.termines || []) { const p = posCase(c); effet(p.x, plateau.dessus(c) + 0.8, p.z, '🔨', 1400); }
    for (const ev of r.rapport.evenements.slice(0, 3)) ui.annonce(ev.texte, ev.genre);
    ui.recap(r.rapport, r.etat);
    propositions();
    finDePartie();
  } finally {
    J.occupe = false;
    bouton.disabled = false; bouton.classList.remove('anime');
  }
}

async function propositions() {
  if (J.etat.fin && !J.etat.sans_victoire) return;
  for (const p of (J.etat.propositions || []).slice()) {
    const qui = p.de > 0 ? J.etat.royaumes.find(r => r.id === p.de) : null;
    const titre = { echange: '⚖️ Proposition commerciale', alliance: '🤝 Proposition d\'alliance', paix: '🕊️ Proposition de paix', tribut: '💰 Ultimatum', marchand: '🧳 Un colporteur' }[p.genre] || 'Proposition';
    const oui = await ui.modale(titre, `<p>${qui ? `<span class="pastille" style="--c:${qui.couleur}"></span>` : ''}${p.texte.replace(/[<>]/g, '')}</p>`, [
      { l: p.genre === 'tribut' ? 'Payer' : 'Accepter', c: 'vert', v: true },
      { l: p.genre === 'tribut' ? 'Refuser' : 'Décliner', c: p.genre === 'tribut' ? 'rouge' : 'b2', v: false },
    ]);
    const r = await cmd({ action: 'repondre', proposition: p.id, accepte: oui });
    if (r.msg) ui.annonce(r.msg, r.ok ? 'bon' : 'guerre');
  }
}
async function finDePartie() {
  const f = J.etat.fin;
  if (!f || J.etat.sans_victoire) return;
  const suite = await ui.modale(f.victoire ? `🏆 ${f.titre}` : `💀 ${f.titre}`, `<p>${f.texte}</p><p class="mini">${J.etat.date} · ${J.etat.joueur.pop} habitants</p>`,
    f.victoire ? [{ l: 'Continuer à jouer', c: 'b2', v: 'continuer' }, { l: 'Nouvelle partie', v: 'nouvelle' }] : [{ l: 'Nouvelle partie', v: 'nouvelle' }]);
  if (suite === 'continuer') await cmd({ action: 'continuer' });
  else retourAccueil();
}

// ------------------------------------------------------------------ modes (construire, déplacer)
async function modeConstruire(cle) {
  const b = J.R.batiments.find(x => x.cle === cle), j = J.etat.joueur;
  if (b.niveau > j.niveau_capitale) return ui.annonce(`🔒 Il faut une capitale au rang ${J.R.niveaux.find(n => n.niveau === b.niveau).nom}`, 'guerre');
  if (b.tech && !j.techs.includes(b.tech)) return ui.annonce(`🔒 Il faut découvrir « ${J.R.techs.find(t => t.cle === b.tech).nom} »`, 'guerre');
  const r = await api.cmd({ action: 'cases_valides', cle });
  if (!r.ok || !r.cases.length) return ui.annonce(`Aucun emplacement possible pour ${b.nom}`, 'guerre');
  ui.fermerFeuille();
  J.mode = { genre: 'construire', cle, cases: new Set(r.cases) };
  plateau.surbrillance(r.cases);
  $('#texte-mode').textContent = `${b.icone} ${b.nom} — touchez une case en surbrillance`;
  $('#bandeau-mode').style.display = 'flex';
  document.body.classList.add('mode');
}
function modeDeplacer(id) {
  ui.fermerFeuille();
  const a = J.etat.armees.find(x => x.id === id);
  if (!a) return;
  J.mode = { genre: 'deplacer', armee: id };
  plateau.selection(a.case, 0xffd34d);
  $('#texte-mode').textContent = `🚩 Touchez la destination (${a.effectif} soldats)`;
  $('#bandeau-mode').style.display = 'flex';
  document.body.classList.add('mode');
}
function annulerMode() {
  J.mode = null;
  plateau.surbrillance([]);
  $('#bandeau-mode').style.display = 'none';
  document.body.classList.remove('mode');
}
function choisirArmee(id) {
  const a = J.etat.armees.find(x => x.id === id);
  if (!a) return;
  selectionnerArmee(id);
  plateau.selection(a.case, 0xffd34d);
  plateau.trace(a.chemin);
  ui.ouvrirFeuille('⚔️ Armée', () => ui.vueArmee(id));
}

surTap(async i => {
  if (!J.etat || J.occupe) return;
  if (J.mode?.genre === 'construire') {
    if (!J.mode.cases.has(i)) return ui.annonce('❌ Impossible ici', 'guerre');
    const cle = J.mode.cle;
    const r = await cmd({ action: 'construire', cle, case: i });
    if (r.ok) { const p = posCase(i); effet(p.x, plateau.dessus(i) + 0.7, p.z, '🔨'); ui.annonce(r.msg, 'bon'); annulerMode(); }
    else ui.annonce('❌ ' + r.msg, 'guerre');
    return;
  }
  if (J.mode?.genre === 'deplacer') {
    const id = J.mode.armee;
    let r = await cmd({ action: 'deplacer', armee: id, case: i });
    if (!r.ok && r.confirmer) {
      const oui = await ui.modale('⚔️ Déclarer la guerre ?', `<p>${r.confirmer}</p>`, [{ l: 'Attaquer', c: 'rouge', v: true }, { l: 'Annuler', c: 'b2', v: false }]);
      if (!oui) { annulerMode(); return; }
      r = await cmd({ action: 'deplacer', armee: id, case: i, confirme: true });
    }
    if (r.ok) { ui.annonce(r.msg, 'bon'); annulerMode(); plateau.trace(r.chemin); plateau.selection(i, 0xffd34d); }
    else ui.annonce('❌ ' + r.msg, 'guerre');
    return;
  }
  selectionnerArmee(null);
  plateau.trace([]);
  plateau.selection(i);
  const mienne = J.etat.armees.find(a => a.case === i && a.proprio === 0);
  if (mienne && !J.etat.batiments.some(b => b.case === i)) return choisirArmee(mienne.id);
  ui.ouvrirFeuille(ui.titreCase(i), () => ui.vueCase(i));
});

// ------------------------------------------------------------------ menu
async function menu(v) {
  if (v === 'diplomatie') return ui.panneau('diplomatie');
  if (v === 'sauver') {
    const nom = `partie-${J.etat.annee}-${String(J.etat.mois + 1).padStart(2, '0')}`;
    const r = await api.sauver(nom);
    ui.annonce(r.ok ? `💾 ${r.msg}` : '❌ ' + r.msg, r.ok ? 'bon' : 'guerre');
  }
  if (v === 'charger') {
    const l = (await api.sauvegardes()).liste || [];
    if (!l.length) return ui.annonce('Aucune sauvegarde', 'guerre');
    const nom = await ui.modale('📂 Charger une partie', '<p>Choisissez une sauvegarde :</p>', [...l.slice(-8).map(s => ({ l: `${s.nom} (${s.date})`, c: 'b2', v: s.nom })), { l: 'Annuler', v: null }]);
    if (!nom) return;
    const r = await api.charger(nom);
    if (r.ok) { ui.fermerFeuille(); await lancer(); } else ui.annonce('❌ ' + r.msg, 'guerre');
  }
  if (v === 'nouvelle') retourAccueil();
  if (v === 'ombres') { J.ombres = !J.ombres; renderer.shadowMap.enabled = J.ombres; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); ui.rafraichir(); }
  if (v === 'aide') ui.modale('❓ Comment jouer', `<p><b>Tour par tour</b> — un tour = un mois. Ordres pendant le mois, puis « Fin du mois » : chantiers, récoltes, marches et batailles se jouent.</p>
    <p><b>Saisons</b> — le blé pousse au printemps et se récolte l'été et l'automne ; rien l'hiver. Greniers et pêche aident à passer l'hiver ; le froid consomme du bois.</p>
    <p><b>Météo</b> — neige : armées ralenties de moitié ; pluie : boue et poudre mouillée ; canicule et sécheresse : mauvaises récoltes et incendies ; tempête : pas de pêche.</p>
    <p><b>Routes</b> — elles se tracent toutes seules entre vos bâtiments et vos villes. Dans 📊 Royaume, pavez-les puis faites-en des routes royales : production et marches plus rapides.</p>
    <p><b>Chaînes</b> — bois → planches ; blé → farine → pain ; minerai + bois (puis charbon) → fer → outils / fusils ; laine → drap.</p>
    <p><b>Époques</b> — 1700 Ancien Régime, 1750 Lumières, 1789 Révolution et Empire, 1816 Révolution industrielle : les technologies changent bâtiments et armées.</p>
    <p><b>Guerre</b> — recrutez à la caserne, au haras, à l'arsenal ; touchez une armée puis « Donner une destination ». Tours, bastions et citadelles défendent vos villes.</p>`, [{ l: 'Compris', v: true }]);
  if (v === 'reseau') {
    const i = await api.info();
    ui.modale('📱 Jouer depuis un autre appareil', i.reseau?.length ? `<p>Sur le même Wi-Fi, ouvrez :</p>${i.reseau.map(a => `<p><b>${a}</b></p>`).join('')}<p class="mini">Le serveur affiche un code d'appairage à saisir la première fois.</p>` : '<p>Le jeu n\'est ouvert qu\'à cet ordinateur. Lancez <b>lancer-reseau.bat</b> (Windows) ou <b>./lancer.sh --lan</b> pour y jouer depuis l\'iPad.</p>', [{ l: 'OK', v: true }]);
  }
}
function retourAccueil() {
  ui.fermerFeuille();
  annulerMode();
  J.etat = null;
  toutEffacer();
  accueil(true);
  $('#reprendre').hidden = true;
  apercu();
}

// ------------------------------------------------------------------ démarrage
async function demarrer() {
  try {
    [J.R, J.info] = await Promise.all([api.regles(), api.info()]);
  } catch (err) {
    $('#chargement-texte').textContent = 'Le serveur du jeu ne répond pas. Lancez-le avec lancer.sh ou lancer.bat.';
    return;
  }
  initMonde(J.R);
  ui.installerUI(J, { cmd, finTour, modeConstruire, modeDeplacer, annulerMode, choisirArmee, menu, centrer: id => { const a = J.etat.armees.find(x => x.id === id); if (a) { const p = posCase(a.case); viser(p.x, p.z); } }, surFermeture: () => { if (!J.mode) plateau.selection(null); } });
  try { const o = JSON.parse(localStorage.getItem('royaumes-options') || 'null'); if (o) for (const k of CHAMPS) if (o[k] !== undefined && k !== 'graine') $('#o_' + k).value = typeof o[k] === 'boolean' ? (o[k] ? '1' : '0') : o[k]; } catch { /* rien */ }
  $('#o_graine').value = Math.floor(Math.random() * 99999);
  document.querySelectorAll('#accueil-panneau input, #accueil-panneau select').forEach(el => el.addEventListener('input', () => {
    lireOptions();
    if (!['o_rivaux', 'o_attitude', 'o_difficulte', 'o_brigands', 'o_capitale'].includes(el.id)) { clearTimeout(minuterie); minuterie = setTimeout(apercu, 250); }
  }));
  $('#de').onclick = () => { $('#o_graine').value = Math.floor(Math.random() * 99999); apercu(); };
  $('#btn-fonder').onclick = async () => {
    $('#btn-fonder').disabled = true;
    const r = await api.nouvelle(lireOptions());
    $('#btn-fonder').disabled = false;
    if (r.ok) lancer(); else ui.annonce('❌ ' + r.msg, 'guerre');
  };
  $('#btn-reprendre').onclick = () => lancer();
  $('#accueil-info').textContent = `Version ${J.info.version}. ${J.info.maj || ''}`;
  if (J.info.partie && !J.info.fin) $('#reprendre').hidden = false;
  accueil(true);
  await apercu();
  $('#chargement').classList.add('cache');
}
demarrer();

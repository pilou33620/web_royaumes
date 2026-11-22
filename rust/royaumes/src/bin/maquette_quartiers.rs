//! Outil de développement : assemble la maquette « Vie des quartiers » en une page autonome : toon.js et modeles.js
//! du jeu (web/graphismes/rendu ; modeles.js tel quel, avec quelques relevés : fenêtres, portes, toits), puis
//! maquettes/source/quartiers/quartiers.js, dans page.html.
//!
//!     cargo run -p royaumes --features outils --bin maquette_quartiers [-- sortie.html]
//!
//! (par défaut maquettes/quartiers.html). Les relevés s'accrochent à des lignes précises de modeles.js : si le jeu les
//! a changées, l'outil s'arrête en nommant la ligne introuvable.
use std::fs;
use std::path::{Path, PathBuf};

fn lire(d: &Path, f: &str) -> String {
    fs::read_to_string(d.join(f)).unwrap_or_else(|e| panic!("{} : {e}", d.join(f).display()))
}

/// Le module sans ses import ni export, pour être collé dans la page.
fn sans_modules(s: &str) -> String {
    let s: String = s.split_inclusive('\n').filter(|l| !(l.starts_with("import ") && l.ends_with('\n'))).collect();
    s.replace("export function", "function").replace("export const", "const").replace("export { degrade };", "")
}

fn remplace(m: &mut String, a: &str, b: &str) {
    assert_eq!(m.matches(a).count(), 1, "ligne de modeles.js introuvable ou en double : {a}");
    *m = m.replace(a, b);
}

const NOMS_TOON: &str = "degrade, MAT, CONT, toon, boite, cyl, cone, sphere, couleur, contour, fusion, lot, put, fige, jeter";

fn main() {
    let racine = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let d = racine.join("maquettes/source/quartiers");
    let jeu = racine.join("web/graphismes/rendu");
    let toon = format!("const {{ {NOMS_TOON} }} = (() => {{\n{}\n  return {{ {NOMS_TOON} }};\n}})();\n", sans_modules(&lire(&jeu, "toon.js")));
    let mut m = sans_modules(&lire(&jeu, "modeles.js"));
    // relevés pour la maquette (EXC = l'assemblage en cours) ; hors maquette, EXC reste null et rien ne change
    remplace(&mut m, "function toit(L, w, d, h, col, x, y, z, ry = 0) {\n", "function toit(L, w, d, h, col, x, y, z, ry = 0) {\n  EXC?.toits.push({ w, d, h, col, x, y, z, ry });\n");
    remplace(&mut m, "put(L, boite(0.45 * s, 0.8 * s, 0.08), BOIS, px, 0.4 * s, pz, ry, 0);",
             "put(L, boite(0.45 * s, 0.8 * s, 0.08), BOIS, px, 0.4 * s, pz, ry, 0); EXC?.portes.push({ x: px, z: pz, ry, w: 0.45 * s, h: 0.8 * s });");
    remplace(&mut m, "put(L, boite(0.4 * s, 0.4 * s, 0.08), VITRE, wx, h * 0.55, wz, ry, 0);\n    if (E.volets) for",
             "put(L, boite(0.4 * s, 0.4 * s, 0.08), VITRE, wx, h * 0.55, wz, ry, 0);\n    EXC?.fen.push({ x: wx, y: h * 0.55, z: wz, ry: ry + (f < 0 ? Math.PI : 0), w: 0.4 * s, h: 0.4 * s, volet: E.volets ? (toitC === 0xc9a14f ? 0x5c7a4a : 0x4a6a7a) : 0, toitC });\n    if (E.volets && !EXC) for");
    remplace(&mut m, "put(L, boite(0.45, 0.6, 0.08), o.vitre ?? VITRE, fx, y, fz, ry, 0);\n    if (E.volets && !o.vitre) for",
             "put(L, boite(0.45, 0.6, 0.08), o.vitre ?? VITRE, fx, y, fz, ry, 0);\n    if (!o.vitre) EXC?.fen.push({ x: fx, y, z: fz, ry: ry + (f < 0 ? Math.PI : 0), w: 0.45, h: 0.6, volet: E.volets ? 0x4a6a7a : 0 });\n    if (E.volets && !o.vitre && !EXC) for");
    remplace(&mut m, "put(L, boite(0.8, 1.3, 0.08), BOIS, px, 0.65, pz, ry, 0); }",
             "put(L, boite(0.8, 1.3, 0.08), BOIS, px, 0.65, pz, ry, 0); EXC?.portes.push({ x: px, z: pz, ry, w: 0.8, h: 1.3 }); }");
    let module = format!("// ================= modeles.js du jeu (tel quel, plus les relevés EXC?.…)
const MOD = (() => {{
  let EXC = null;
{m}
  /** Assemble un bâtiment du jeu et relève ses fenêtres, portes, toits et cheminées (coordonnées locales de web_power). */
  function construire(cle, epoque, saison, neige, niveau = 3) {{
    SAISON = saison; NEIGE = neige; EPOQUE = epoque; ROYAUME = '#2f5fa8'; CLE = cle; NIVEAU = niveau;
    const L = lot(), ex = {{ fum: [], ailes: [], drap: [], fen: [], portes: [], toits: [] }};
    let i = 0; const g = graine(cle); rnd = () => hache(g, i++, 77);
    EXC = ex; BATR[cle](L, ex, EPOQUES[epoque]); EXC = null;
    return {{ L, ex, E: EPOQUES[epoque] }};
  }}
  return {{ construire, EPOQUES, toit, rondins: (L, x, z, n, ry) => rondins(L, x, z, n, ry), reverbere }};
}})();
");
    // la fonction hache de scene.js, du « export function hache( » jusqu'à la première accolade fermante en début de ligne
    let scene = lire(&jeu, "scene.js");
    let debut = scene.find("export function hache(").expect("scene.js : export function hache introuvable");
    let apres = debut + "export function hache(".len();
    let fin = apres + scene[apres..].find("\n}\n").expect("scene.js : fin de hache introuvable") + 3;
    let hache = scene[debut..fin].replace("export ", "");
    let js = format!("import * as THREE from 'three';\nconst SQ3 = Math.sqrt(3);\n{hache}{toon}{module}{}", lire(&d, "quartiers.js"));
    let page = lire(&d, "page.html").replace("/*SCRIPT*/", &js);
    let sortie = std::env::args().nth(1).map(PathBuf::from).unwrap_or_else(|| racine.join("maquettes/quartiers.html"));
    fs::write(&sortie, &page).unwrap_or_else(|e| panic!("{} : {e}", sortie.display()));
    println!("{} {}", sortie.display(), page.chars().count());
}

#[cfg(test)]
mod essais {
    #[test]
    fn sans_modules_retire_import_et_export() {
        assert_eq!(super::sans_modules("import { A } from './a.js';\nexport const B = 1;\nexport function f() {}\nexport { degrade };\n"), "const B = 1;\nfunction f() {}\n\n");
    }
}

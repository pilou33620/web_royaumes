//! Outil de développement : assemble la maquette « Guerre et diplomatie » (maquettes/guerre.html) à partir de
//! maquettes/source/guerre : scene.js + batiments.js + vie2.js + guerre.js + remparts.js + forts.js dans page.html.
//!
//!     cargo run -p royaumes --features outils --bin maquette_guerre
use std::fs;
use std::path::{Path, PathBuf};

const FIN: &str = "construirePlateau(); construireBatiments();\nrequestAnimationFrame(image);\n";
const FIN2: &str = "construirePlateau(); construireBatiments(); construireAmbiance(); construireVie2(); construireGuerre(); majFenetres(); appliquerCiel();\nrequestAnimationFrame(image);\n";
const CAM: &str = "// ---------------------------------------------------------------- caméra";
const BAT: &str = "// ---------------------------------------------------------------- bâtiments, armée et pièces animées";
const HACHE: &str = "function hache(a, b = 0, c = 0) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
";
// la première ligne de la maquette publiée, avant page.html
const ENTETE: &str = "<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n";

fn racine() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn lire(d: &Path, f: &str) -> String {
    fs::read_to_string(d.join(f)).unwrap_or_else(|e| panic!("{} : {e}", d.join(f).display()))
}

/// La page assemblée, telle que maquettes/guerre.html.
fn assembler() -> String {
    let d = racine().join("maquettes/source/guerre");
    let scene = lire(&d, "scene.js").replace("fusionner(", "fusionCouleurs(");
    let mut scene = scene.strip_suffix(FIN).expect("scene.js ne finit plus par construirePlateau…").to_string();
    assert_eq!(scene.matches(CAM).count(), 1, "repère « caméra » de scene.js");
    let ajout = ["vie2.js", "guerre.js", "remparts.js", "forts.js"].map(|f| lire(&d, f) + "\n").concat();
    scene = scene.replace(CAM, &(ajout + CAM));
    assert_eq!(scene.matches(BAT).count(), 1, "repère « bâtiments » de scene.js");
    scene = scene.replace(BAT, &(lire(&d, "batiments.js") + "\n" + BAT));
    let js = format!("import * as THREE from 'three';\n{HACHE}{scene}{FIN2}");
    format!("{ENTETE}{}", lire(&d, "page.html").replace("/*SCRIPT*/", &js))
}

fn main() {
    let page = assembler();
    let sortie = racine().join("maquettes/guerre.html");
    fs::write(&sortie, &page).unwrap_or_else(|e| panic!("{} : {e}", sortie.display()));
    println!("{} {}", sortie.display(), page.chars().count());
}

#[cfg(test)]
mod essais {
    #[test]
    fn maquette_identique() {
        let actuelle = std::fs::read_to_string(super::racine().join("maquettes/guerre.html")).unwrap();
        assert!(super::assembler() == actuelle, "maquettes/guerre.html n'est plus celle que donnent ses sources");
    }
}

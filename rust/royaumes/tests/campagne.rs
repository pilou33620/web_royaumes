//! Banc d'une campagne : un robot joue le joueur (constructions raisonnables, recrutement),
//! on vérifie que l'économie tient l'hiver, que la population grandit et que les rivaux vivent.
//! `cargo test --test campagne -- --nocapture` affiche le bilan année par année.

use royaumes::carte::Options;
use royaumes::commandes::executer;
use royaumes::partie::Partie;
use serde_json::json;

fn construire(p: &mut Partie, cle: &str) -> bool {
    let cap = p.villes[p.capitale(0).unwrap()].case;
    let mut cases: Vec<usize> = (0..p.carte.cases.len()).filter(|&c| p.peut_construire(cle, c, 0).is_ok()).collect();
    cases.sort_by_key(|&c| p.carte.dist(c, cap));
    match cases.first() {
        Some(&c) => executer(p, &json!({"action": "construire", "cle": cle, "case": c})).is_ok(),
        None => false,
    }
}

fn robot(p: &mut Partie) {
    let s = p.stats(0);
    let j = p.joueur().clone();
    let nb = |p: &Partie, cle: &str| p.batiments.iter().filter(|b| b.proprio == 0 && b.cle == cle).count();
    // rang de la capitale d'abord : on économise pour l'Hôtel de ville
    let vid = p.villes[p.capitale(0).unwrap()].id;
    let _ = executer(p, &json!({"action": "ameliorer", "ville": vid}));
    let econome = p.niveau_capitale(0) == 1 && j.pop >= 40;
    if econome {
        if nb(p, "bucheron") < 3 {
            construire(p, "bucheron");
        }
        return;
    }
    // la ville : logements quand on approche du plafond
    if j.pop + 6 >= s.logement {
        let cle = if p.niveau_capitale(0) >= 2 { "maison" } else { "cabane" };
        construire(p, cle);
    }
    let voulus: &[(&str, usize)] = &[
        ("bucheron", 2), ("pecheur", 2), ("ferme", 2), ("carriere", 1), ("scierie", 1), ("grenier", 1), ("puits", 1), ("forestier", 1),
        ("caserne", 1), ("moulin", 1), ("boulangerie", 1), ("taverne", 1), ("brasserie", 1), ("eglise", 1), ("entrepot", 1), ("comptoir", 1),
        ("bergerie", 1), ("tisserand", 1), ("mine_fer", 1), ("fonderie", 1), ("forge", 1), ("marche", 1), ("ecole", 1), ("fontaine", 1),
    ];
    for &(cle, n) in voulus {
        if nb(p, cle) < n && construire(p, cle) {
            break;
        }
    }
    // rang de la capitale
    let vid = p.villes[p.capitale(0).unwrap()].id;
    let _ = executer(p, &json!({"action": "ameliorer", "ville": vid}));
    // recherche
    if p.joueur().recherche.is_none() {
        for t in ["assolement", "vauban", "silex", "routes", "manufactures", "cartographie", "lumieres", "parmentier"] {
            if executer(p, &json!({"action": "rechercher", "tech": t})).is_ok() {
                break;
            }
        }
    }
    // une petite armée
    if s.soldats < 6 + j.pop / 8 {
        if let Some(b) = p.batiments.iter().find(|b| b.proprio == 0 && b.cle == "caserne" && b.fini()).map(|b| b.id) {
            let _ = executer(p, &json!({"action": "recruter", "batiment": b, "unite": "mousquetaire"}));
            let _ = executer(p, &json!({"action": "recruter", "batiment": b, "unite": "milice"}));
        }
    }
    // répondre aux propositions : on paie les tributs, on accepte paix et alliances, on refuse le reste
    let props = p.propositions.clone();
    for pr in props {
        let oui = matches!(pr.genre.as_str(), "paix" | "alliance" | "tribut");
        let _ = executer(p, &json!({"action": "repondre", "proposition": pr.id, "accepte": oui}));
    }
}

#[test]
fn dix_ans_de_campagne() {
    let mut p = Partie::nouvelle(Options { graine: 1789, ..Options::default() });
    let mut famines = 0;
    for mois in 0..120 {
        robot(&mut p);
        let r = p.fin_du_mois();
        if p.joueur().famine {
            famines += 1;
        }
        if mois % 12 == 11 {
            let j = p.joueur();
            println!(
                "{} · pop {} · bonheur {:.0} · or {:.0} · bois {:.0} · pain {:.0} · poisson {:.0} · blé {:.0} · bât. {} · techs {} · rang {} · rivaux {} bât.",
                r.date,
                j.pop,
                j.bonheur,
                j.stock["or"],
                j.stock["bois"],
                j.stock["pain"],
                j.stock["poisson"],
                j.stock["ble"],
                p.batiments.iter().filter(|b| b.proprio == 0).count(),
                j.techs.len(),
                p.niveau_capitale(0),
                p.batiments.iter().filter(|b| b.proprio != 0).count()
            );
        }
        if p.fin.is_some() {
            break;
        }
    }
    let j = p.joueur();
    assert!(p.villes.iter().any(|v| v.proprio == 0), "le joueur a survécu");
    assert!(j.pop > 40, "la population a grandi : {}", j.pop);
    assert!(famines < 24, "{famines} mois de famine en 10 ans");
    assert!(p.niveau_capitale(0) >= 2);
    assert!(j.techs.len() >= 3);
}

#[test]
fn sauvegarde_relue() {
    let mut p = Partie::nouvelle(Options { graine: 3, ..Options::default() });
    for _ in 0..14 {
        p.fin_du_mois();
    }
    let t = serde_json::to_string(&p).unwrap();
    let mut q: Partie = serde_json::from_str(&t).unwrap();
    assert_eq!(q.tour, p.tour);
    let a = p.fin_du_mois();
    let b = q.fin_du_mois();
    assert_eq!(a.date, b.date);
    assert_eq!(p.joueur().pop, q.joueur().pop, "même partie, même suite");
}

#[test]
fn routes_tracees_et_ameliorees() {
    let mut p = Partie::nouvelle(Options { graine: 77, ..Options::default() });
    // dès le départ, les chaumières sont reliées à l'hôtel de ville
    assert!(p.segments_routes(0) >= 1, "routes de départ");
    assert!(p.routes.iter().all(|r| p.carte.dist(r[0], r[1]) == 1), "une route relie deux cases voisines");
    assert!(construire(&mut p, "bucheron"));
    p.fin_du_mois();
    p.fin_du_mois();
    let b = p.batiments.iter().find(|b| b.proprio == 0 && b.cle == "bucheron").unwrap().case;
    assert!(p.carte.cases[b].route == 1, "le bûcheron achevé est relié");
    // amélioration : refusée au rang Hameau, acceptée ensuite
    assert!(executer(&mut p, &json!({"action": "ameliorer_routes"})).is_err());
    let ci = p.capitale(0).unwrap();
    p.villes[ci].niveau = 2;
    p.royaumes[0].stock.insert("pierre".into(), 500.0);
    p.royaumes[0].stock.insert("or".into(), 500.0);
    assert!(executer(&mut p, &json!({"action": "ameliorer_routes"})).is_ok());
    assert_eq!(p.carte.cases[b].route, 2);
    let avant = p.cout_case(b);
    p.royaumes[0].niveau_routes = 1;
    p.recalculer_routes();
    assert!(avant < p.cout_case(b), "une meilleure route est plus rapide");
}

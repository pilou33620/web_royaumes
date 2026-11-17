//! Les ordres du joueur pendant le mois (POST /api/cmd) : construire, recruter, déplacer,
//! commercer, négocier, rechercher… Chaque ordre est vérifié ici : le navigateur ne décide de rien.

use std::collections::BTreeMap;

use serde_json::{json, Value};

use crate::ia;
use crate::partie::{Partie, Rapport, BRIGANDS};
use crate::regles::{regles, Panier};

fn txt<'a>(c: &'a Value, k: &str) -> Result<&'a str, String> {
    c.get(k).and_then(Value::as_str).ok_or_else(|| format!("paramètre « {k} » manquant"))
}
fn num(c: &Value, k: &str) -> Result<i64, String> {
    c.get(k).and_then(Value::as_i64).ok_or_else(|| format!("paramètre « {k} » manquant"))
}
fn case(p: &Partie, c: &Value) -> Result<usize, String> {
    let i = num(c, "case")?;
    if i < 0 || i as usize >= p.carte.cases.len() {
        return Err("case hors de la carte".into());
    }
    Ok(i as usize)
}
fn royaume(p: &Partie, c: &Value) -> Result<usize, String> {
    let k = num(c, "royaume")?;
    if k <= 0 || k as usize >= p.royaumes.len() {
        return Err("royaume inconnu".into());
    }
    if !p.royaumes[k as usize].vivant {
        return Err("ce royaume n'existe plus".into());
    }
    Ok(k as usize)
}

fn ok(msg: impl Into<String>) -> Result<Value, String> {
    Ok(json!({"ok": true, "msg": msg.into()}))
}

pub fn executer(p: &mut Partie, c: &Value) -> Result<Value, String> {
    // lecture seule : les cases où l'on peut poser un bâtiment (surbrillance du mode construction)
    if c.get("action").and_then(Value::as_str) == Some("cases_valides") {
        let cle = txt(c, "cle")?;
        let v: Vec<usize> = (0..p.carte.cases.len()).filter(|&i| p.peut_construire(cle, i, 0).is_ok()).collect();
        return Ok(json!({"ok": true, "cases": v}));
    }
    if p.fin.is_some() && !p.sans_victoire {
        if txt(c, "action")? == "continuer" && p.fin.as_ref().is_some_and(|f| f.victoire) {
            p.sans_victoire = true;
            return ok("La partie continue.");
        }
        return Err("La partie est terminée".into());
    }
    let rg = regles();
    match txt(c, "action")? {
        "construire" => {
            let cle = txt(c, "cle")?;
            let i = case(p, c)?;
            let d = rg.bat(cle).ok_or("bâtiment inconnu")?;
            if d.cat == "aucune" {
                return Err("ce bâtiment ne se construit pas".into());
            }
            if d.niveau > p.niveau_capitale(0) {
                return Err(format!("Il faut une capitale au rang {}", rg.nom_niveau(d.niveau)));
            }
            if let Some(t) = &d.tech {
                if !p.a_tech(0, t) {
                    return Err(format!("Il faut la technologie « {} »", rg.tech(t).map(|x| x.nom.as_str()).unwrap_or(t)));
                }
            }
            p.peut_construire(cle, i, 0)?;
            if !p.peut_payer(&d.cout, 1.0) {
                return Err("Ressources insuffisantes".into());
            }
            let s = p.stats(0);
            if d.colons > 0 && p.joueur().pop - s.soldats < d.colons as i64 + 6 {
                return Err("Pas assez d'habitants disponibles pour partir coloniser".into());
            }
            p.payer(&d.cout, 1.0);
            p.royaumes[0].pop -= d.colons as i64;
            let id = p.poser(cle, i, 0, false);
            Ok(json!({"ok": true, "msg": format!("{} {} : travaux lancés ({} mois)", d.icone, d.nom, d.duree.max(1)), "id": id}))
        }
        "demolir" => {
            let i = case(p, c)?;
            let bid = p.carte.cases[i].bat.ok_or("Rien à démolir")?;
            if p.bat(bid).map(|b| b.proprio) != Some(0) {
                return Err("Ce bâtiment ne vous appartient pas".into());
            }
            p.demolir(i)?;
            p.recalculer_routes();
            ok("Démoli (la moitié des matériaux est récupérée)")
        }
        "pause" => {
            let id = num(c, "batiment")? as u32;
            let b = p.batiments.iter_mut().find(|b| b.id == id && b.proprio == 0).ok_or("bâtiment inconnu")?;
            b.pause = !b.pause;
            ok(if b.pause { "En pause" } else { "Reprise" })
        }
        "recruter" => {
            let id = num(c, "batiment")? as u32;
            let u = txt(c, "unite")?.to_string();
            let b = p.batiments.iter().find(|b| b.id == id && b.proprio == 0 && b.fini()).ok_or("bâtiment inconnu")?.clone();
            if !p.unites_dispo(0, &b.cle).contains(&u) {
                return Err("Unité indisponible ici".into());
            }
            let du = rg.unite(&u).unwrap();
            let mult = if p.a_tech(0, "levee_masse") { 0.75 } else { 1.0 };
            let mut cout = du.cout.clone();
            if let Some(o) = cout.get_mut("or") {
                *o = (*o * mult).round();
            }
            if !p.peut_payer(&cout, 1.0) {
                return Err("Ressources insuffisantes".into());
            }
            let s = p.stats(0);
            let en_file: usize = p.batiments.iter().filter(|b| b.proprio == 0).map(|b| b.file.len()).sum();
            if p.joueur().pop - s.soldats - (en_file as i64) < 6 {
                return Err("Pas assez d'habitants disponibles".into());
            }
            p.payer(&cout, 1.0);
            p.batiments.iter_mut().find(|x| x.id == id).unwrap().file.push(u.clone());
            ok(format!("{} {} : en formation", du.icone, du.nom))
        }
        "ameliorer" => {
            let vid = num(c, "ville")? as u32;
            let vi = p.villes.iter().position(|v| v.id == vid && v.proprio == 0).ok_or("ville inconnue")?;
            let n = p.villes[vi].niveau + 1;
            let def = rg.niveau(n).ok_or("Rang maximal atteint")?.clone();
            if !p.villes[vi].capitale && n > p.niveau_capitale(0) {
                return Err("Une ville ne peut dépasser le rang de la capitale".into());
            }
            if p.joueur().pop < def.pop {
                return Err(format!("Il faut {} habitants", def.pop));
            }
            if !p.peut_payer(&def.cout, 1.0) {
                return Err("Ressources insuffisantes".into());
            }
            p.payer(&def.cout, 1.0);
            p.villes[vi].niveau = n;
            p.recalculer_territoire();
            ok(format!("🎉 {} devient un(e) {} !", p.villes[vi].nom, def.nom))
        }
        "deplacer" => {
            let id = num(c, "armee")? as u32;
            let vers = case(p, c)?;
            let ai = p.armee(id).filter(|&i| p.armees[i].proprio == 0).ok_or("armée inconnue")?;
            if let Some(vi) = p.ville_a(vers) {
                let pr = p.villes[vi].proprio;
                if pr != 0 && pr != BRIGANDS && p.royaumes[pr as usize].statut != "guerre" {
                    if c.get("confirme").and_then(Value::as_bool) != Some(true) {
                        return Ok(json!({"ok": false, "confirmer": format!("Attaquer {} revient à déclarer la guerre à {}. Continuer ?", p.villes[vi].nom, p.royaumes[pr as usize].nom)}));
                    }
                    let mut r = Rapport::default();
                    ia::declarer_guerre(p, pr as usize, true, &mut r);
                }
            }
            let depart = p.armees[ai].case;
            if depart == vers {
                p.armees[ai].chemin.clear();
                return ok("L'armée reste sur place");
            }
            let ch = p.chemin(depart, vers, 0).ok_or_else(|| {
                if p.carte.cases[vers].terre() { "Destination inaccessible".to_string() } else { "Il faut un Port pour traverser la mer".to_string() }
            })?;
            let mois = p.mois_trajet(&p.armees[ai], &ch);
            p.armees[ai].chemin = ch.clone();
            Ok(json!({"ok": true, "msg": format!("🚩 En route : {} cases, environ {} mois", ch.len(), mois), "chemin": ch, "mois": mois}))
        }
        "halte" => {
            let id = num(c, "armee")? as u32;
            let ai = p.armee(id).filter(|&i| p.armees[i].proprio == 0).ok_or("armée inconnue")?;
            p.armees[ai].chemin.clear();
            ok("Halte !")
        }
        "diviser" => {
            let id = num(c, "armee")? as u32;
            let ai = p.armee(id).filter(|&i| p.armees[i].proprio == 0).ok_or("armée inconnue")?;
            let demande = c.get("unites").and_then(Value::as_object).ok_or("paramètre « unites » manquant")?;
            let mut part = BTreeMap::new();
            for (u, n) in demande {
                let n = n.as_u64().unwrap_or(0) as u32;
                let dispo = p.armees[ai].unites.get(u).copied().unwrap_or(0);
                if n > 0 {
                    part.insert(u.clone(), n.min(dispo));
                }
            }
            let total: u32 = part.values().sum();
            if total == 0 || total >= p.armees[ai].effectif() {
                return Err("Choisissez une partie de l'armée".into());
            }
            for (u, n) in &part {
                let x = p.armees[ai].unites.get_mut(u).unwrap();
                *x -= n;
            }
            p.armees[ai].unites.retain(|_, n| *n > 0);
            let case = p.armees[ai].case;
            let nid = p.creer_armee(0, case, part);
            Ok(json!({"ok": true, "msg": "Nouvelle armée formée", "armee": nid}))
        }
        "ameliorer_routes" => {
            let n = p.niveau_routes(0);
            if n >= 3 {
                return Err("Vos routes sont déjà des routes royales".into());
            }
            let cible = n + 1;
            if cible == 2 && p.niveau_capitale(0) < 2 {
                return Err("Il faut une capitale au rang Village".into());
            }
            if cible == 3 && !p.a_tech(0, "routes") {
                return Err("Il faut la technologie « Routes royales et canaux »".into());
            }
            let cout = p.cout_routes(cible);
            if !p.peut_payer(&cout, 1.0) {
                return Err("Ressources insuffisantes".into());
            }
            p.payer(&cout, 1.0);
            p.royaumes[0].niveau_routes = cible as u32;
            p.recalculer_routes();
            ok(if cible == 2 { "🛤️ Vos chemins sont pavés !" } else { "🛤️ Routes royales : larges, empierrées, bordées d'arbres !" })
        }
        "impots" => {
            let n = txt(c, "niveau")?;
            if !["bas", "normal", "eleve"].contains(&n) {
                return Err("niveau inconnu".into());
            }
            p.royaumes[0].impots = n.into();
            ok("Taux d'imposition modifié")
        }
        "rechercher" => {
            let t = txt(c, "tech")?;
            let d = rg.tech(t).ok_or("technologie inconnue")?;
            if p.a_tech(0, t) {
                return Err("Déjà découverte".into());
            }
            if p.annee() < d.annee {
                return Err(format!("Pas avant {}", d.annee));
            }
            p.royaumes[0].recherche = Some(t.into());
            ok(format!("💡 Recherche : {}", d.nom))
        }
        "diplo" => {
            let k = royaume(p, c)?;
            diplomatie(p, k, txt(c, "acte")?)
        }
        "echanger" => {
            let k = royaume(p, c)?;
            let r = txt(c, "ressource")?;
            let achat = c.get("achat").and_then(Value::as_bool).unwrap_or(true);
            echanger(p, k, r, achat)
        }
        "repondre" => {
            let id = num(c, "proposition")? as u32;
            let oui = c.get("accepte").and_then(Value::as_bool).unwrap_or(false);
            repondre(p, id, oui)
        }
        autre => Err(format!("ordre inconnu : {autre}")),
    }
}

pub fn prix(p: &Partie, k: usize, r: &str, achat: bool) -> f64 {
    let f = &p.royaumes[k];
    let base = regles().prix.get(r).copied().unwrap_or(1.0);
    let m = if f.surplus.iter().any(|x| x == r) {
        0.6
    } else if f.demande.iter().any(|x| x == r) {
        1.7
    } else {
        1.0
    };
    let rel = 1.0 - f.relation.clamp(-50.0, 100.0) / 500.0;
    if achat {
        (base * 10.0 * m * 1.3 * rel).ceil()
    } else {
        (base * 10.0 * m * 0.75 / rel).floor().max(1.0)
    }
}

fn echanger(p: &mut Partie, k: usize, r: &str, achat: bool) -> Result<Value, String> {
    if !regles().prix.contains_key(r) {
        return Err("marchandise inconnue".into());
    }
    let s = p.stats(0);
    if !s.comptoir && !s.port {
        return Err("Il faut un Comptoir de commerce ou un Port".into());
    }
    if p.royaumes[k].statut == "guerre" {
        return Err("On ne commerce pas avec l'ennemi".into());
    }
    let px = prix(p, k, r, achat);
    let cap = p.capacite(&s, r);
    let or_ia = p.royaumes[k].or;
    let nom_ia = p.royaumes[k].nom.clone();
    let st = &mut p.royaumes[0].stock;
    if achat {
        if st["or"] < px {
            return Err("Pas assez d'or".into());
        }
        if st.get(r).copied().unwrap_or(0.0) + 10.0 > cap {
            return Err("Stock plein".into());
        }
        *st.get_mut("or").unwrap() -= px;
        *st.entry(r.into()).or_insert(0.0) += 10.0;
        p.royaumes[k].or += px;
    } else {
        if st.get(r).copied().unwrap_or(0.0) < 10.0 {
            return Err(format!("Pas assez de {}", regles().res_nom(r)));
        }
        if or_ia < px {
            return Err(format!("{nom_ia} n'a pas assez d'or"));
        }
        *st.get_mut(r).unwrap() -= 10.0;
        *st.get_mut("or").unwrap() += px;
        p.royaumes[k].or -= px;
    }
    p.royaumes[k].relation = (p.royaumes[k].relation + 0.5).min(100.0);
    ok(if achat { format!("Acheté 10 {} pour {px} 🪙", regles().res_nom(r)) } else { format!("Vendu 10 {} pour {px} 🪙", regles().res_nom(r)) })
}

fn diplomatie(p: &mut Partie, k: usize, acte: &str) -> Result<Value, String> {
    let nom = p.royaumes[k].nom.clone();
    let mut r = Rapport::default();
    let res = match acte {
        "cadeau" => {
            if p.royaumes[0].stock["or"] < 100.0 {
                return Err("Il faut 100 🪙".into());
            }
            *p.royaumes[0].stock.get_mut("or").unwrap() -= 100.0;
            let f = &mut p.royaumes[k];
            let g = (14.0 - f.cadeaux as f64 * 2.0).max(3.0);
            f.cadeaux += 1;
            f.relation += g;
            format!("🎁 {nom} apprécie votre présent (+{g:.0})")
        }
        "guerre" => {
            if p.royaumes[k].statut == "guerre" {
                return Err("Déjà en guerre".into());
            }
            ia::declarer_guerre(p, k, true, &mut r);
            format!("⚔️ Guerre déclarée à {nom}")
        }
        "paix" => {
            if p.royaumes[k].statut != "guerre" {
                return Err("Vous n'êtes pas en guerre".into());
            }
            if p.royaumes[k].relation > -45.0 || p.puissance(k as i32) < p.puissance(0) * 0.7 {
                faire_la_paix(p, k);
                format!("🕊️ Paix signée avec {nom}")
            } else {
                p.royaumes[k].relation -= 3.0;
                return Err(format!("{nom} refuse la paix"));
            }
        }
        "alliance" => {
            let f = &mut p.royaumes[k];
            if f.statut == "guerre" {
                return Err("Faites d'abord la paix".into());
            }
            if f.relation < 50.0 {
                return Err(format!("{nom} ne vous fait pas assez confiance (relation ≥ 50)"));
            }
            f.statut = "alliance".into();
            format!("🤝 Alliance conclue avec {nom}")
        }
        "route" => {
            let s = p.stats(0);
            if !s.comptoir && !s.port {
                return Err("Il faut un Comptoir de commerce ou un Port".into());
            }
            let f = &p.royaumes[k];
            if f.statut == "guerre" || f.commerce {
                return Err("Route impossible".into());
            }
            if f.relation < 0.0 {
                return Err(format!("{nom} refuse : relation insuffisante (≥ 0)"));
            }
            if p.royaumes[0].stock["or"] < 150.0 {
                return Err("Il faut 150 🪙".into());
            }
            *p.royaumes[0].stock.get_mut("or").unwrap() -= 150.0;
            p.royaumes[k].commerce = true;
            p.royaumes[k].relation += 5.0;
            format!("🛤️ Route commerciale ouverte avec {nom}")
        }
        "tribut" => {
            if p.puissance(0) > p.puissance(k as i32) * 1.5 {
                let g = (p.royaumes[k].or * 0.3).floor().max(80.0);
                p.royaumes[k].or -= g;
                p.royaumes[k].relation -= 25.0;
                *p.royaumes[0].stock.get_mut("or").unwrap() += g;
                format!("💰 {nom} paie un tribut de {g} 🪙")
            } else {
                p.royaumes[k].relation -= 10.0;
                return Err(format!("{nom} se moque de vos exigences"));
            }
        }
        _ => return Err("acte inconnu".into()),
    };
    p.royaumes[k].relation = p.royaumes[k].relation.clamp(-100.0, 100.0);
    for e in r.evenements {
        p.noter(e.texte);
    }
    ok(res)
}

pub fn faire_la_paix(p: &mut Partie, k: usize) {
    let tour = p.tour;
    let f = &mut p.royaumes[k];
    f.statut = "paix".into();
    f.treve = tour + 24;
    f.relation = f.relation.max(-15.0);
    let id = k as i32;
    for a in p.armees.iter_mut().filter(|a| a.proprio == id) {
        a.chemin.clear();
    }
}

fn repondre(p: &mut Partie, id: u32, oui: bool) -> Result<Value, String> {
    let i = p.propositions.iter().position(|x| x.id == id).ok_or("proposition inconnue")?;
    let pr = p.propositions.remove(i);
    let k = pr.de;
    let nom = if k > 0 { p.royaumes[k].nom.clone() } else { "Le colporteur".into() };
    let s = p.stats(0);
    let payer = |p: &mut Partie, panier: &Panier| -> Result<(), String> {
        if !p.peut_payer(panier, 1.0) {
            return Err("Vous n'avez pas de quoi payer".into());
        }
        p.payer(panier, 1.0);
        Ok(())
    };
    let msg = match (pr.genre.as_str(), oui) {
        ("echange" | "marchand", true) => {
            if let Err(e) = payer(p, &pr.demande) {
                p.propositions.insert(i, pr);
                return Err(e);
            }
            for (r, v) in &pr.donne {
                let cap = p.capacite(&s, r);
                let x = p.royaumes[0].stock.entry(r.clone()).or_insert(0.0);
                *x = (*x + v).min(cap);
            }
            if k > 0 {
                p.royaumes[k].relation += 5.0;
            }
            "Marché conclu".to_string()
        }
        ("alliance", true) => {
            p.royaumes[k].statut = "alliance".into();
            format!("🤝 Alliance avec {nom}")
        }
        ("paix", true) => {
            faire_la_paix(p, k);
            format!("🕊️ Paix signée avec {nom}")
        }
        ("tribut", true) => {
            if let Err(e) = payer(p, &pr.demande) {
                p.propositions.insert(i, pr);
                return Err(e);
            }
            p.royaumes[k].relation += 12.0;
            format!("Tribut payé à {nom}")
        }
        ("tribut", false) => {
            p.royaumes[k].relation -= 15.0;
            if p.hasard.p(0.55) {
                let mut r = Rapport::default();
                ia::declarer_guerre(p, k, false, &mut r);
                format!("{nom} vous déclare la guerre !")
            } else {
                format!("{nom} ravale sa menace… pour l'instant")
            }
        }
        (_, false) => {
            if k > 0 {
                p.royaumes[k].relation -= 3.0;
            }
            "Proposition refusée".to_string()
        }
        _ => "…".to_string(),
    };
    ok(msg)
}

#[cfg(test)]
mod essais {
    use super::*;
    use crate::carte::Options;

    #[test]
    fn ordres_verifies() {
        let mut p = Partie::nouvelle(Options { graine: 11, ..Options::default() });
        assert!(executer(&mut p, &json!({"action": "voler"})).is_err());
        assert!(executer(&mut p, &json!({"action": "construire", "cle": "palais", "case": 0})).is_err());
        let c = (0..p.carte.cases.len()).find(|&c| p.peut_construire("cabane", c, 0).is_ok()).unwrap();
        let bois = p.joueur().stock["bois"] + p.carte.cases[c].arbres as f64 * 3.0;
        assert!(executer(&mut p, &json!({"action": "construire", "cle": "cabane", "case": c})).is_ok());
        assert_eq!(p.joueur().stock["bois"], bois - 15.0);
        assert!(executer(&mut p, &json!({"action": "construire", "cle": "cabane", "case": c})).is_err());
        // déplacer l'armée d'une case
        let a = p.armees.iter().find(|a| a.proprio == 0).unwrap().clone();
        let v = p.carte.voisins(a.case).into_iter().find(|&x| p.praticable(x, 0)).unwrap();
        let r = executer(&mut p, &json!({"action": "deplacer", "armee": a.id, "case": v})).unwrap();
        assert_eq!(r["ok"], true);
        assert!(executer(&mut p, &json!({"action": "rechercher", "tech": "chemin_fer"})).is_err());
        assert!(executer(&mut p, &json!({"action": "rechercher", "tech": "assolement"})).is_ok());
        assert!(executer(&mut p, &json!({"action": "diplo", "royaume": 1, "acte": "cadeau"})).is_ok());
        assert!(executer(&mut p, &json!({"action": "impots", "niveau": "eleve"})).is_ok());
    }
}

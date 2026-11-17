//! Les royaumes de l'ordinateur : une économie résumée (un trésor), des constructions visibles
//! sur la carte, des villes qui grandissent, une armée, des humeurs et des propositions.

use std::collections::BTreeMap;

use crate::meteo;
use crate::partie::{Partie, Proposition, Rapport};
use crate::regles::{regles, Panier};

const TYPES: [&str; 40] = [
    "cabane", "cabane", "maison", "maison", "maison_pierre", "ferme", "ferme", "bucheron", "carriere", "pecheur", "scierie", "moulin", "boulangerie", "caserne",
    "tour", "marche", "eglise", "entrepot", "taverne", "bergerie", "forge", "grenier", "haras", "fontaine", "jardin", "statue", "citadelle", "port", "comptoir",
    "hotel_particulier", "cathedrale", "mine_fer", "fonderie", "remparts", "vignoble", "ecole", "arsenal", "manufacture", "immeuble", "usine",
];

pub fn mois(p: &mut Partie, k: usize, rapport: &mut Rapport) {
    let id = k as i32;
    let mes_villes: Vec<usize> = (0..p.villes.len()).filter(|&i| p.villes[i].proprio == id).collect();
    if mes_villes.is_empty() {
        if p.royaumes[k].vivant {
            p.royaumes[k].vivant = false;
            p.armees.retain(|a| a.proprio != id);
        }
        return;
    }
    let diff = p.options.difficulte;
    let an = p.annee();
    // technologies : elles arrivent avec les années (selon le caractère)
    let retard = p.royaumes[k].retard_techs + if p.royaumes[k].caractere == "guerrier" { 3 } else { 0 };
    for t in &regles().techs {
        if an >= t.annee + retard && !p.royaumes[k].a(&t.cle) {
            p.royaumes[k].techs.push(t.cle.clone());
        }
    }
    let nb_bat = p.batiments.iter().filter(|b| b.proprio == id).count() as f64;
    let r = &mut p.royaumes[k];
    r.niveau_routes = if an >= 1785 { 3 } else if an >= 1735 { 2 } else { 1 };
    r.or += (15.0 + mes_villes.len() as f64 * 12.0 + nb_bat * 0.8 + if r.commerce && r.statut != "guerre" { 25.0 } else { 0.0 }) * diff;
    // constructions
    let chance = 0.35 * diff * if r.caractere == "batisseur" { 1.4 } else { 1.0 };
    if p.hasard.p(chance.min(0.95)) {
        construire(p, id, &mes_villes);
    }
    // les villes grandissent avec leurs bâtiments
    for &vi in &mes_villes {
        let vid = p.villes[vi].id;
        let n = p.batiments.iter().filter(|b| b.proprio == id && b.ville == Some(vid)).count();
        let seuil = [0, 0, 5, 12, 22, 34][(p.villes[vi].niveau as usize + 1).min(5)];
        if p.villes[vi].niveau < 5 && n >= seuil {
            p.villes[vi].niveau += 1;
            p.recalculer_territoire();
        }
    }
    // nouvelle ville
    if p.tour >= p.royaumes[k].prochaine_ville && mes_villes.len() < 4 {
        p.royaumes[k].prochaine_ville = p.tour + p.hasard.entre(36, 72) as u32;
        fonder(p, id, &mes_villes, rapport);
    }
    // recrutement
    let capi = p.capitale(id).unwrap();
    let cap_case = p.villes[capi].case;
    let niv = p.villes[capi].niveau;
    let plafond = ((5.0 + niv as f64 * 5.0) * if p.royaumes[k].caractere == "guerrier" { 1.4 } else { 1.0 } * diff).round() as u32;
    let garnison = p.armees.iter().position(|a| a.proprio == id && a.case == cap_case && a.chemin.is_empty());
    let effectif = garnison.map(|g| p.armees[g].effectif()).unwrap_or(0);
    let mut recrues = 0;
    while recrues < 2 && p.royaumes[k].or >= 25.0 && effectif + recrues < plafond {
        let u = meilleure_unite(p, id);
        p.recruter_dans(id, &u, cap_case);
        p.royaumes[k].or -= 25.0;
        recrues += 1;
    }
    // humeur envers le joueur
    let r = &mut p.royaumes[k];
    let base = match r.caractere.as_str() {
        "guerrier" => -20.0,
        "marchand" => 15.0,
        _ => 0.0,
    } + r.attitude;
    if r.statut == "alliance" {
        r.relation += 0.3;
    }
    if r.commerce && r.statut != "guerre" {
        r.relation += 0.4;
    }
    r.relation += (base - r.relation) * 0.03;
    if r.statut == "guerre" {
        r.relation = r.relation.min(-20.0);
    }
    r.relation = r.relation.clamp(-100.0, 100.0);
    // guerre et paix
    if r.statut != "guerre" && r.statut != "alliance" && p.tour > r.treve && r.relation <= -50.0 && p.tour > 18 && p.hasard.p(0.15) {
        declarer_guerre(p, k, false, rapport);
    }
    let r = &p.royaumes[k];
    if r.statut == "guerre" {
        if p.tour >= r.prochaine_attaque {
            if let Some(g) = p.armees.iter().position(|a| a.proprio == id && a.case == cap_case && a.chemin.is_empty()) {
                if p.armees[g].effectif() >= 7 {
                    attaquer(p, k, g, rapport);
                    p.royaumes[k].prochaine_attaque = p.tour + p.hasard.entre(3, 6) as u32;
                }
            }
        }
        let r = &p.royaumes[k];
        if p.tour > r.debut_guerre + 12 && p.tour >= r.prochaine_offre && (r.relation > -25.0 || p.puissance(id) < 0.5 * p.puissance(0)) && p.hasard.p(0.25) {
            p.royaumes[k].prochaine_offre = p.tour + 6;
            proposer(p, k, "paix", format!("{}, las de la guerre, vous propose la paix.", p.royaumes[k].nom), Panier::new(), Panier::new());
        }
    } else if p.tour > 12 && p.tour >= r.prochaine_offre {
        let caractere = r.caractere.clone();
        let relation = r.relation;
        let statut = r.statut.clone();
        let nom = r.nom.clone();
        let mut offre = false;
        if caractere == "marchand" && p.hasard.p(0.25) {
            let donne = p.royaumes[k].surplus[p.hasard.indice(3)].clone();
            let veut = p.royaumes[k].demande[p.hasard.indice(3)].clone();
            let rg = regles();
            let texte = format!("{nom} propose 30 {} {} contre 18 {} {}.", rg.res_icone(&donne), rg.res_nom(&donne), rg.res_icone(&veut), rg.res_nom(&veut));
            proposer(p, k, "echange", texte, Panier::from([(donne, 30.0)]), Panier::from([(veut, 18.0)]));
            offre = true;
        } else if relation >= 65.0 && statut != "alliance" && p.hasard.p(0.2) {
            proposer(p, k, "alliance", format!("{nom} vous propose une alliance durable."), Panier::new(), Panier::new());
            offre = true;
        } else if caractere == "guerrier" && relation < -15.0 && p.tour > 36 && p.puissance(id) > 1.4 * p.puissance(0) && p.hasard.p(0.2) {
            proposer(p, k, "tribut", format!("{nom} exige un tribut de 150 🪙, sinon c'est la guerre."), Panier::new(), Panier::from([("or".to_string(), 150.0)]));
            offre = true;
        }
        if offre {
            p.royaumes[k].prochaine_offre = p.tour + p.hasard.entre(4, 9) as u32;
        }
    }
}

fn proposer(p: &mut Partie, k: usize, genre: &str, texte: String, donne: Panier, demande: Panier) {
    let id = p.id();
    p.propositions.push(Proposition { id, de: k, genre: genre.into(), texte, donne, demande });
}

pub fn meilleure_unite(p: &mut Partie, id: i32) -> String {
    let mut dispo: Vec<String> = Vec::new();
    for b in ["caserne", "haras", "arsenal"] {
        dispo.extend(p.unites_dispo(id, b));
    }
    if dispo.is_empty() {
        return "milice".into();
    }
    // le plus souvent la meilleure infanterie, parfois de la cavalerie ou un canon
    let inf: Vec<&String> = dispo.iter().filter(|u| regles().unite(u).unwrap().genre == "infanterie").collect();
    let x = p.hasard.f();
    let choix = if x < 0.65 || inf.len() == dispo.len() {
        inf.iter().max_by(|a, b| regles().unite(a).unwrap().att.total_cmp(&regles().unite(b).unwrap().att)).map(|s| (*s).clone())
    } else {
        Some(dispo[p.hasard.indice(dispo.len())].clone())
    };
    choix.unwrap_or_else(|| "milice".into())
}

fn construire(p: &mut Partie, id: i32, villes: &[usize]) {
    for _ in 0..25 {
        let vi = villes[p.hasard.indice(villes.len())];
        let cle = TYPES[p.hasard.indice(TYPES.len())];
        let d = regles().bat(cle).unwrap();
        if d.niveau > p.villes[vi].niveau + 1 || d.tech.as_ref().is_some_and(|t| !p.a_tech(id, t)) {
            continue;
        }
        let zone = p.carte.rayon(p.villes[vi].case, p.villes[vi].niveau as i32 + 2);
        let c = zone[p.hasard.indice(zone.len())];
        if p.peut_construire(cle, c, id).is_ok() {
            let bid = p.poser(cle, c, id, false);
            if let Some(b) = p.batiments.iter_mut().find(|b| b.id == bid) {
                b.reste = ((b.reste as f64) / p.options.difficulte).ceil().max(1.0) as u32;
            }
            if d.territoire > 0 {
                p.recalculer_territoire();
            }
            return;
        }
    }
}

fn fonder(p: &mut Partie, id: i32, villes: &[usize], rapport: &mut Rapport) {
    let cand: Vec<usize> = (0..p.carte.cases.len())
        .filter(|&c| {
            let k = &p.carte.cases[c];
            k.t == crate::carte::Terrain::Plaine
                && k.proprio == -1
                && k.bat.is_none()
                && p.villes.iter().all(|v| p.carte.dist(v.case, c) >= 5)
                && villes.iter().any(|&vi| p.carte.dist(p.villes[vi].case, c) <= 9)
        })
        .collect();
    let Some(&c) = p.hasard.choix(&cand) else { return };
    let k = id as usize;
    let nom = if p.royaumes[k].noms_villes.is_empty() { format!("Bourg-{}", p.prochain_id) } else { p.royaumes[k].noms_villes.remove(0) };
    p.fonder_ville(id, c, nom.clone(), 1, false);
    p.recalculer_territoire();
    let qui = p.royaumes[k].nom.clone();
    p.evt(rapport, format!("{qui} fonde la ville de {nom}"), "info", Some(c));
}

pub fn declarer_guerre(p: &mut Partie, k: usize, par_joueur: bool, rapport: &mut Rapport) {
    let tour = p.tour;
    let attente = p.hasard.entre(2, 4) as u32;
    let r = &mut p.royaumes[k];
    if r.statut == "guerre" {
        return;
    }
    r.statut = "guerre".into();
    r.debut_guerre = tour;
    r.relation = (r.relation - 30.0).min(-30.0);
    r.commerce = false;
    r.prochaine_attaque = tour + attente;
    let nom = r.nom.clone();
    if par_joueur {
        for (i, o) in p.royaumes.iter_mut().enumerate() {
            if i != k && !o.joueur && o.vivant {
                o.relation -= 8.0;
            }
        }
        p.evt(rapport, format!("⚔️ Vous déclarez la guerre à {nom} !"), "guerre", None);
    } else {
        p.evt(rapport, format!("⚔️ {nom} vous déclare la guerre !"), "guerre", None);
    }
}

fn attaquer(p: &mut Partie, k: usize, g: usize, rapport: &mut Rapport) {
    let id = k as i32;
    let depart = p.armees[g].case;
    let Some(vi) = p.ville_proche(depart, 0) else { return };
    let cible = p.villes[vi].case;
    let Some(ch) = p.chemin(depart, cible, id) else { return };
    let mut u = BTreeMap::new();
    for (cle, n) in p.armees[g].unites.iter_mut() {
        let pris = (*n as f64 * 0.65).floor() as u32;
        if pris > 0 {
            u.insert(cle.clone(), pris);
            *n -= pris;
        }
    }
    p.armees[g].unites.retain(|_, n| *n > 0);
    if u.is_empty() {
        return;
    }
    let total: u32 = u.values().sum();
    let aid = p.creer_armee(id, depart, u);
    let i = p.armee(aid).unwrap();
    p.armees[i].chemin = ch;
    let (qui, ville) = (p.royaumes[k].nom.clone(), p.villes[vi].nom.clone());
    p.evt(rapport, format!("⚠️ Une armée de {qui} ({total} soldats) marche sur {ville} !"), "guerre", Some(depart));
    let _ = meteo::date_texte(p.tour);
}

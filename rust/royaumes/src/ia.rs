//! Les royaumes de l'ordinateur : une économie résumée (un trésor), des constructions visibles
//! sur la carte, des villes qui grandissent, une armée, des humeurs et des propositions.

use std::collections::{BTreeMap, VecDeque};

use crate::partie::{Partie, Proposition, Rapport};
use crate::regles::{regles, Panier};

const TYPES: [&str; 38] = [
    "cabane", "cabane", "maison", "maison", "maison_pierre", "ferme", "ferme", "bucheron", "carriere", "pecheur", "scierie", "moulin", "boulangerie", "caserne",
    "tour", "marche", "eglise", "entrepot", "taverne", "bergerie", "forge", "grenier", "haras", "fontaine", "jardin", "statue", "port", "comptoir",
    "hotel_particulier", "cathedrale", "mine_fer", "fonderie", "vignoble", "ecole", "arsenal", "manufacture", "immeuble", "usine",
];

pub fn mois(p: &mut Partie, k: usize, rapport: &mut Rapport) {
    let id = k as i32;
    let mes_villes: Vec<usize> = (0..p.villes.len()).filter(|&i| p.villes[i].proprio == id).collect();
    if mes_villes.is_empty() {
        if p.royaumes[k].vivant {
            p.royaumes[k].vivant = false;
            p.armees.retain(|a| a.proprio != id);
            p.flottes.retain(|a| a.proprio != id);
            p.espions.retain(|a| a.proprio != id);
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
    fortifier(p, k, &mes_villes);
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
    let cm = p.commerce_maritime(id);
    p.royaumes[k].or += cm;
    p.royaumes[k].commerce_mer = cm;
    marine(p, k, cap_case);
    espionnage(p, k, cap_case);
    // exploration : de temps en temps (souvent en guerre si l'on ne sait où frapper), un éclaireur
    // quitte la garnison vers la terre inconnue la plus proche
    let perdu = p.royaumes[k].statut == "guerre" && cible_connue(p, id, cap_case).is_none();
    // les éclaireurs arrivés poursuivent vers la prochaine terre inconnue
    for i in 0..p.armees.len() {
        let a = &p.armees[i];
        if a.proprio == id && a.effectif() <= 1 && a.chemin.is_empty() && a.case != cap_case {
            if let Some(ch) = inconnue_proche(p, id, a.case).and_then(|c| p.chemin(p.armees[i].case, c)) {
                p.armees[i].chemin = ch;
            }
        }
    }
    if p.hasard.p(if perdu { 0.5 } else { 0.15 }) && !p.armees.iter().any(|a| a.proprio == id && a.effectif() <= 1 && !a.chemin.is_empty()) {
        if let Some(g) = p.armees.iter().position(|a| a.proprio == id && a.case == cap_case && a.chemin.is_empty() && a.effectif() >= 4) {
            if let Some(ch) = inconnue_proche(p, id, cap_case).and_then(|c| p.chemin(cap_case, c)) {
                let u = p.armees[g].unites.keys().find(|u| regles().unite(u).is_some_and(|d| d.genre == "cavalerie")).or_else(|| p.armees[g].unites.keys().next()).cloned().unwrap();
                *p.armees[g].unites.get_mut(&u).unwrap() -= 1;
                p.armees[g].unites.retain(|_, n| *n > 0);
                let e = p.creer_armee(id, cap_case, BTreeMap::from([(u, 1)]));
                let i = p.armee(e).unwrap();
                p.armees[i].chemin = ch;
            }
        }
    }
    // sièges : l'assaut quand les murs sont tombés ou que la garnison est bien plus faible
    for si in 0..p.sieges.len() {
        let s = &p.sieges[si];
        if s.assiegeant == id {
            let (at, de) = p.forces_assaut(s, 1.0);
            let murs = if s.murs_max > 0.0 { s.murs / s.murs_max } else { 0.0 };
            if murs < 0.3 || (s.mois >= 3 && at > 1.4 * de) || at > 2.5 * de {
                p.sieges[si].assaut = true;
            }
        }
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

/// Les fortifications : de temps en temps (bien plus souvent en guerre), la ville la plus exposée
/// — la capitale, puis les villes frontalières ou côtières ; à égalité la moins fortifiée — passe au niveau suivant.
fn fortifier(p: &mut Partie, k: usize, villes: &[usize]) {
    let id = k as i32;
    if !p.hasard.p(if p.royaumes[k].statut == "guerre" { 0.25 } else { 0.06 }) {
        return;
    }
    let exposee = |vi: usize| {
        let v = &p.villes[vi];
        let cotiere = p.carte.rayon(v.case, 2).iter().any(|&c| p.carte.cases[c].mer());
        let frontaliere = p.villes.iter().any(|o| o.proprio != id && p.carte.dist(o.case, v.case) <= 10);
        (2 * v.capitale as u32 + cotiere as u32 + frontaliere as u32, 4u32.saturating_sub(v.fortif))
    };
    let Some(vi) = villes.iter().copied().filter(|&vi| p.peut_fortifier(vi).is_ok()).max_by_key(|&vi| exposee(vi)) else { return };
    let f = p.peut_fortifier(vi).unwrap();
    let cout = regles().valeur(&f.cout) * regles().siege.fortif_ia;
    if p.royaumes[k].or < cout + 100.0 {
        return;
    }
    p.royaumes[k].or -= cout;
    p.villes[vi].travaux_fortif = ((f.duree as f64) / p.options.difficulte).ceil().max(1.0) as u32;
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

/// La ville du joueur la plus proche de `depuis` que `id` a explorée (on ne frappe pas à l'aveugle).
fn cible_connue(p: &Partie, id: i32, depuis: usize) -> Option<usize> {
    (0..p.villes.len()).filter(|&i| p.villes[i].proprio == 0 && p.connait(id, p.villes[i].case)).min_by_key(|&i| p.carte.dist(p.villes[i].case, depuis))
}

/// La case de terre inexplorée la plus proche, à pied depuis `de`.
fn inconnue_proche(p: &Partie, id: i32, de: usize) -> Option<usize> {
    let mut vu = vec![false; p.carte.cases.len()];
    let mut file = VecDeque::from([de]);
    vu[de] = true;
    while let Some(c) = file.pop_front() {
        if !p.connait(id, c) {
            return Some(c);
        }
        for v in p.carte.voisins(c) {
            if !vu[v] && p.praticable(v) {
                vu[v] = true;
                file.push_back(v);
            }
        }
    }
    None
}

/// Une flotte de transport à quai au port de la ville `depart`, et sa route vers la côte la plus proche de `cible`.
fn convoi(p: &Partie, id: i32, depart: usize, cible: usize) -> Option<(usize, Vec<usize>)> {
    let vid = p.villes[p.ville_a(depart)?].id;
    let fi = p.flottes.iter().position(|f| {
        f.proprio == id && f.armee.is_none() && f.chemin.is_empty() && p.capacite_transport(f) >= 5
            && p.batiments.iter().any(|b| b.cle == "port" && b.proprio == id && b.fini() && b.ville == Some(vid) && p.carte.dist(b.case, f.case) <= 1)
    })?;
    let mut eaux: Vec<usize> = p.carte.rayon(cible, 4).into_iter().filter(|&c| !p.carte.cases[c].terre() && p.carte.voisins(c).iter().any(|&v| p.praticable(v))).collect();
    eaux.sort_by_key(|&c| p.carte.dist(c, cible));
    eaux.into_iter().take(6).find_map(|e| p.chemin_mer(p.flottes[fi].case, e).map(|ch| (fi, ch)))
}

/// La marine de l'ordinateur : convois qui débarquent, flottes de guerre qui bloquent les ports du joueur
/// en guerre, flûtes au commerce, et de temps en temps un navire neuf.
fn marine(p: &mut Partie, k: usize, cap_case: usize) {
    let id = k as i32;
    let guerre = p.royaumes[k].statut == "guerre";
    let ports: Vec<usize> = p.batiments.iter().filter(|b| b.proprio == id && b.cle == "port" && b.fini()).map(|b| b.case).collect();
    for fi in 0..p.flottes.len() {
        let f = &p.flottes[fi];
        if f.proprio != id || !f.chemin.is_empty() {
            continue;
        }
        if f.armee.is_some() {
            // convoi arrivé : débarquer (vers la cible en guerre, sinon chez soi)
            let vers = if guerre { f.cible } else { None };
            let chez_soi = ports.iter().any(|&c| p.carte.dist(c, f.case) <= 1) || p.carte.voisins(f.case).iter().any(|&c| p.carte.cases[c].proprio == id);
            if vers.is_some() || chez_soi {
                let but = vers.unwrap_or(cap_case);
                if let Some(t) = p.carte.voisins(f.case).into_iter().filter(|&c| p.peut_debarquer(fi, c).is_ok()).min_by_key(|&c| p.carte.dist(c, but)) {
                    let aid = p.debarquer(fi, t);
                    p.flottes[fi].cible = None;
                    if let (Some(ai), Some(suite)) = (p.armee(aid), p.chemin(t, but)) {
                        p.armees[ai].chemin.extend(suite);
                    }
                }
            } else if let Some(ch) = ports.first().and_then(|&c| p.eau_du_port(c)).and_then(|e| p.chemin_mer(f.case, e)) {
                p.flottes[fi].cible = None;
                p.flottes[fi].chemin = ch;
            }
            continue;
        }
        // en guerre, les navires de guerre vont bloquer la ville côtière du joueur la plus proche qu'on connaît
        if guerre && p.de_guerre(f) && !p.blocus.iter().any(|b| b.par == id) {
            let mut eaux: Vec<usize> = p.villes.iter().filter(|v| v.proprio == 0 && p.connait(id, v.case)).flat_map(|v| p.carte.voisins(v.case)).filter(|&c| !p.carte.cases[c].terre()).collect();
            eaux.sort_by_key(|&c| p.carte.dist(c, f.case));
            if let Some((_, ch)) = eaux.into_iter().take(4).find_map(|e| p.chemin_mer(f.case, e).map(|ch| (e, ch))) {
                if !ch.is_empty() {
                    p.flottes[fi].commerce = false;
                    p.flottes[fi].chemin = ch;
                    continue;
                }
            }
        }
        let a_quai = p.port_voisin(f).is_some();
        if !a_quai && !(guerre && p.blocus.iter().any(|b| b.par == id && p.carte.dist(b.case, f.case) <= 2)) {
            if let Some(ch) = ports.first().and_then(|&c| p.eau_du_port(c)).and_then(|e| p.chemin_mer(f.case, e)) {
                p.flottes[fi].chemin = ch;
            }
        } else if a_quai && p.flutes(f) > 0 {
            p.flottes[fi].commerce = true;
        }
    }
    // un navire neuf de temps en temps
    let navires: u32 = p.flottes.iter().filter(|f| f.proprio == id).map(|f| f.navires.values().sum::<u32>()).sum();
    let Some(&port) = ports.first() else { return };
    if navires < 6 && p.hasard.p(0.2) {
        let dispo = p.unites_dispo(id, "port");
        let flutes = p.flottes.iter().filter(|f| f.proprio == id).map(|f| p.flutes(f)).sum::<u32>();
        let u = if flutes < 2 { dispo.iter().find(|u| regles().unite(u).is_some_and(|d| d.commerce)) } else { dispo.iter().filter(|u| regles().unite(u).is_some_and(|d| d.guerre())).max_by(|a, b| regles().unite(a).unwrap().att.total_cmp(&regles().unite(b).unwrap().att)) };
        if let Some(u) = u.cloned() {
            let cout = regles().unite(&u).map_or(0.0, |d| d.cout.get("or").copied().unwrap_or(0.0));
            if p.royaumes[k].or >= cout + 150.0 {
                p.royaumes[k].or -= cout;
                p.recruter_dans(id, &u, port);
            }
        }
    }
}

/// L'espionnage de l'ordinateur : un espion chez le joueur quand on le hait ou qu'on est en guerre.
fn espionnage(p: &mut Partie, k: usize, cap_case: usize) {
    let id = k as i32;
    for ei in 0..p.espions.len() {
        let e = &p.espions[ei];
        if e.proprio != id || e.mission.is_some() || !e.chemin.is_empty() || !p.hasard.p(0.5) {
            continue;
        }
        if let Some(vi) = p.villes_a_portee(e).into_iter().find(|&vi| p.villes[vi].proprio == 0) {
            let genre = ["renseignement", "vol", "sabotage"][p.hasard.indice(3)];
            p.lancer_mission(ei, genre, vi);
        }
    }
    let r = &p.royaumes[k];
    let cout = regles().unite("espion").map_or(120.0, |d| d.cout.get("or").copied().unwrap_or(120.0));
    if p.espions.iter().any(|e| e.proprio == id) || !p.a_batiment(id, "taverne") || r.or < cout + 100.0 || (r.relation >= 10.0 && r.statut != "guerre") || !p.hasard.p(0.08) {
        return;
    }
    if let Some(ch) = cible_connue(p, id, cap_case).and_then(|vi| p.chemin(cap_case, p.villes[vi].case)) {
        p.royaumes[k].or -= cout;
        p.recruter_dans(id, "espion", cap_case);
        if let Some(e) = p.espions.last_mut() {
            e.chemin = ch;
        }
    }
}

fn attaquer(p: &mut Partie, k: usize, g: usize, rapport: &mut Rapport) {
    let id = k as i32;
    let depart = p.armees[g].case;
    // secourir d'abord une de ses villes assiégée, sinon marcher sur la ville du joueur la plus proche qu'on connaît
    let secours = p.sieges.iter().find(|s| s.assiegeant == 0 && p.villes.iter().any(|v| v.id == s.ville && v.proprio == id)).map(|s| s.case);
    let Some(cible) = secours.or_else(|| cible_connue(p, id, depart).map(|vi| p.villes[vi].case)) else { return };
    let Some(vi) = p.ville_a(cible) else { return };
    let par_terre = p.chemin(depart, cible);
    let convoi = if par_terre.is_none() { convoi(p, id, depart, cible) } else { None };
    if par_terre.is_none() && convoi.is_none() {
        return;
    }
    // un convoi n'emporte que ce que ses navires peuvent porter
    let part = match &convoi {
        Some((fi, _)) => (p.capacite_transport(&p.flottes[*fi]) as f64 / p.armees[g].effectif().max(1) as f64).min(0.65),
        None => 0.65,
    };
    let mut u = BTreeMap::new();
    for (cle, n) in p.armees[g].unites.iter_mut() {
        let pris = (*n as f64 * part).floor() as u32;
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
    let (qui, ville) = (p.royaumes[k].nom.clone(), p.villes[vi].nom.clone());
    // le joueur n'apprend d'où elle part que s'il connaît l'endroit
    let lieu = p.connait(0, depart).then_some(depart);
    if let Some(ch) = par_terre {
        p.armees[i].chemin = ch;
        if secours.is_some() {
            p.evt(rapport, format!("⚠️ {qui} envoie une armée de secours ({total} soldats) vers {ville} !"), "guerre", lieu);
        } else {
            p.evt(rapport, format!("⚠️ Une armée de {qui} ({total} soldats) marche sur {ville} !"), "guerre", lieu);
        }
    } else if let Some((fi, ch)) = convoi {
        p.embarquer(fi, i);
        p.flottes[fi].chemin = ch;
        p.flottes[fi].cible = Some(cible);
        p.evt(rapport, format!("⚠️ Une armée de {qui} ({total} soldats) s'embarque contre {ville} !"), "guerre", lieu);
    }
}

#[cfg(test)]
mod essais {
    use super::*;
    use crate::carte::Options;

    #[test]
    fn l_ordinateur_ne_frappe_que_ce_qu_il_connait() {
        let mut p = Partie::nouvelle(Options { graine: 42, ..Options::default() });
        p.royaumes[1].statut = "guerre".into();
        let cap = p.villes[p.capitale(1).unwrap()].case;
        let g = p.armees.iter().position(|a| a.proprio == 1 && a.case == cap).unwrap();
        p.armees[g].unites.insert("milice".into(), 20);
        let mut r = Rapport::default();
        attaquer(&mut p, 1, g, &mut r);
        assert!(!p.armees.iter().any(|a| a.proprio == 1 && !a.chemin.is_empty()), "le joueur est inconnu : pas d'attaque");
        let c0 = p.villes[0].case;
        p.decouvrir(1, c0, 1);
        attaquer(&mut p, 1, g, &mut r);
        let a = p.armees.iter().find(|a| a.proprio == 1 && !a.chemin.is_empty());
        let convoi = p.flottes.iter().any(|f| f.proprio == 1 && f.armee.is_some());
        assert!(a.is_some_and(|a| *a.chemin.last().unwrap() == c0) || convoi || p.chemin(cap, c0).is_none());
    }

    #[test]
    fn les_rivaux_fortifient_leur_capitale_en_guerre() {
        let mut p = Partie::nouvelle(Options { graine: 42, ..Options::default() });
        p.royaumes[1].statut = "guerre".into();
        p.royaumes[1].or = 5000.0;
        let villes: Vec<usize> = (0..p.villes.len()).filter(|&i| p.villes[i].proprio == 1).collect();
        let cap = p.capitale(1).unwrap();
        for _ in 0..80 {
            fortifier(&mut p, 1, &villes);
            if p.villes[cap].travaux_fortif > 0 {
                break;
            }
        }
        assert!(p.villes[cap].travaux_fortif > 0, "la capitale passe en travaux");
        assert!(p.royaumes[1].or < 5000.0, "les travaux sont payés");
        // les travaux s'achèvent
        p.villes[cap].travaux_fortif = 1;
        p.fin_du_mois();
        assert!(p.villes[cap].fortif >= 1);
    }

    #[test]
    fn convoi_vers_une_autre_ile() {
        // une carte où la capitale d'un rival n'est pas sur la terre du joueur
        for g in 1..40u64 {
            let mut p = Partie::nouvelle(Options { graine: g, oceans: 60, ..Options::default() });
            let c0 = p.villes[0].case;
            let Some(k) = (1..p.royaumes.len()).find(|&k| p.chemin(p.villes[k].case, c0).is_none()) else { continue };
            let id = k as i32;
            let cap = p.villes[k].case;
            let vid = p.villes[k].id;
            let Some(port) = p.carte.rayon(cap, 3).into_iter().find(|&c| p.carte.cases[c].bat.is_none() && p.praticable(c) && p.carte.voisins(c).iter().any(|&v| p.carte.cases[v].mer())) else { continue };
            let b = p.poser("port", port, id, true);
            p.batiments.iter_mut().find(|x| x.id == b).unwrap().ville = Some(vid);
            p.recruter_dans(id, "flute", port);
            p.recruter_dans(id, "flute", port);
            p.decouvrir(id, c0, 1);
            p.royaumes[k].statut = "guerre".into();
            let gi = p.armees.iter().position(|a| a.proprio == id && a.case == cap).unwrap();
            p.armees[gi].unites.insert("milice".into(), 20);
            let mut r = Rapport::default();
            attaquer(&mut p, k, gi, &mut r);
            let Some(f) = p.flottes.iter().find(|f| f.proprio == id && f.armee.is_some()) else { continue };
            assert!(!f.chemin.is_empty() && f.cible == Some(c0), "le convoi part vers la ville du joueur");
            assert!(f.armee.as_ref().unwrap().effectif() <= p.capacite_transport(f));
            assert!(r.evenements.iter().any(|e| e.texte.contains("s'embarque")));
            // il navigue, débarque et marche
            for _ in 0..24 {
                p.royaumes[k].statut = "guerre".into();
                p.fin_du_mois();
                if p.armees.iter().any(|a| a.proprio == id && p.carte.cases[a.case].comp == p.carte.cases[c0].comp) || p.flottes.iter().all(|f| f.proprio != id || f.armee.is_none()) {
                    break;
                }
            }
            assert!(p.flottes.iter().all(|f| f.proprio != id || f.armee.is_none()), "l'armée a débarqué (ou le convoi a sombré)");
            return;
        }
        panic!("aucune carte avec un rival outre-mer");
    }
}

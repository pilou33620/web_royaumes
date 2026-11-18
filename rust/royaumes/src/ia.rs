//! Les royaumes de l'ordinateur : une économie résumée (un trésor), des constructions visibles
//! sur la carte, des villes qui grandissent, une armée, des humeurs et des propositions.

use crate::ia_militaire;
use crate::partie::{Partie, Rapport};
use crate::regles::regles;

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
            p.forts.retain(|a| a.proprio != id);
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
    // la vie des villes (marchés, écoles, chauffage, éclairage), résumée en or (cite.rs)
    p.vie_ia(k);
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
    let cm = p.commerce_maritime(id);
    p.royaumes[k].or += cm;
    p.royaumes[k].commerce_mer = cm;
    // diplomatie : humeurs, traités, guerres, paix et propositions, envers le joueur et les rivaux (ia_diplomatie.rs)
    crate::ia_diplomatie::mois(p, k, rapport);
    // le militaire : défense, campagnes, sièges, recrutement, marine, espions, forts, exploration (ia_militaire.rs)
    ia_militaire::mois(p, k, rapport);
}

/// `id` est-il en guerre contre quelqu'un (le joueur ou un rival) ?
fn en_guerre(p: &Partie, id: i32) -> bool {
    !crate::ia_diplomatie::ennemis(p, id).is_empty()
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
    if !p.hasard.p(if en_guerre(p, id) { 0.25 } else { 0.06 }) {
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
                && p.fort_a(c).is_none()
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
    let (a, b) = if par_joueur { (0, k) } else { (k, 0) };
    crate::ia_diplomatie::declarer_guerre(p, a, b, rapport);
}

#[cfg(test)]
mod essais {
    use super::*;
    use crate::carte::Options;

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
}

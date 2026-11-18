//! La diplomatie de l'ordinateur, telle qu'avant la refonte (phase 3 : relations des rivaux entre eux,
//! coalitions, personnalités marquées) : l'humeur envers le joueur, la guerre et la paix, les propositions.
//! Les échanges proposés partent désormais de ses vrais surplus et de ses vrais besoins (economie.rs).

use crate::partie::{Partie, Proposition, Rapport};
use crate::regles::{regles, Panier};

/// Le mois diplomatique du rival `k`.
pub fn mois(p: &mut Partie, k: usize, rapport: &mut Rapport) {
    let id = k as i32;
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
        // un marchand propose 30 de ce qu'il a en trop contre 18 de ce qui lui manque
        let (surplus, demande) = (r.surplus.clone(), r.demande.clone());
        let donne = p.hasard.choix(&surplus).cloned().filter(|x| p.royaumes[k].stock.get(x).copied().unwrap_or(0.0) >= 30.0 + super::economie::reserve(p, k, x));
        let veut = p.hasard.choix(&demande).cloned();
        if let (true, Some(donne), Some(veut)) = (caractere == "marchand" && p.hasard.p(0.25), donne, veut) {
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

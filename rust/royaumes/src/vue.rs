//! Ce que l'interface reçoit : la carte (terrain, presque fixe) et l'état du mois.

use serde_json::{json, Value};

use crate::carte::{Carte, Terrain};
use crate::commandes::prix;
use crate::meteo::{self, Meteo};
use crate::partie::{nom_caractere, Partie};
use crate::regles::regles;
use crate::tour::QUETES;

fn code(t: Terrain) -> u8 {
    match t {
        Terrain::Profond => 0,
        Terrain::Hautfond => 1,
        Terrain::Lac => 2,
        Terrain::Sable => 3,
        Terrain::Plaine => 4,
        Terrain::Colline => 5,
        Terrain::Montagne => 6,
    }
}

/// Le terrain : envoyé à l'ouverture et quand `version` change.
pub fn carte(m: &Carte, version: u32) -> Value {
    json!({
        "l": m.l,
        "h": m.h,
        "version": version,
        "terrain": m.cases.iter().map(|k| code(k.t)).collect::<Vec<_>>(),
        "riviere": m.cases.iter().map(|k| k.riviere as u8).collect::<Vec<_>>(),
        "fertile": m.cases.iter().map(|k| k.fertile as u8).collect::<Vec<_>>(),
        "poissons": m.cases.iter().map(|k| k.poissons as u8).collect::<Vec<_>>(),
        "gisement": m.cases.iter().map(|k| k.gisement.clone()).collect::<Vec<_>>(),
        "arbres": m.cases.iter().map(|k| k.arbres).collect::<Vec<_>>(),
        "foret": m.cases.iter().map(|k| k.foret as u8).collect::<Vec<_>>(),
        "rivieres": m.rivieres,
    })
}

pub fn meteo_json(m: &Meteo, tour: u32) -> Value {
    let e = m.effets(tour);
    json!({
        "genre": m.genre, "titre": m.titre, "icone": m.icone, "temperature": m.temperature,
        "vent": m.vent, "direction": m.direction, "pluie": m.pluie, "neige_sol": m.neige_sol,
        "secheresse": m.secheresse, "historique": m.historique, "effets": e.resume,
        "cultures": e.cultures, "mouvement": e.mouvement,
    })
}

pub fn etat(p: &Partie) -> Value {
    let rg = regles();
    let j = p.joueur();
    let s = p.stats(0);
    let an = p.annee();
    let m = meteo::mois(p.tour);
    let ep = rg.epoque(an);
    let caps: serde_json::Map<String, Value> = rg.ressources.iter().map(|r| (r.cle.clone(), json!(p.capacite(&s, &r.cle).min(1e9)))).collect();
    let mut savoir_mois = j.pop as f64 * 0.04 + s.savoir;
    if j.a("lumieres") {
        savoir_mois *= 1.25;
    }
    let previsions: Vec<Value> = Meteo::previsions(p.tour + 1, &p.meteo)
        .into_iter()
        .map(|(g, pc)| json!({"genre": g, "pourcent": pc}))
        .collect();
    let quete = QUETES.get(j.quete).map(|q| json!({"n": j.quete + 1, "texte": q.texte, "prime": q.prime}));
    let mut dispo = serde_json::Map::new();
    for b in ["caserne", "haras", "arsenal"] {
        dispo.insert(b.into(), json!(p.unites_dispo(0, b)));
    }
    json!({
        "tour": p.tour,
        "date": meteo::date_texte(p.tour),
        "annee": an,
        "mois": m,
        "mois_nom": meteo::MOIS[m],
        "saison": meteo::saison(m),
        "saison_nom": meteo::SAISONS[meteo::saison(m)],
        "epoque": {"cle": ep.cle, "nom": ep.nom},
        "meteo": meteo_json(&p.meteo, p.tour),
        "previsions": previsions,
        "version_carte": p.version_carte,
        "joueur": {
            "stock": j.stock,
            "capacite": caps,
            "pop": j.pop,
            "logement": s.logement,
            "soldats": s.soldats,
            "ouvriers_libres": j.ouvriers_libres,
            "bonheur": j.bonheur,
            "detail_bonheur": j.detail_bonheur,
            "impots": j.impots,
            "revenus": j.revenus,
            "bilan": j.bilan,
            "techs": j.techs,
            "recherche": j.recherche,
            "savoir": j.savoir,
            "savoir_mois": savoir_mois,
            "famine": j.famine,
            "variete": j.variete,
            "comptoir": s.comptoir,
            "port": s.port,
            "niveau_capitale": p.niveau_capitale(0),
            "quete": quete,
            "unites_dispo": dispo,
            "remise_recrues": if j.a("levee_masse") { 0.75 } else { 1.0 },
        },
        "royaumes": p.royaumes.iter().map(|r| {
            let prix_: serde_json::Map<String, Value> = if r.joueur { serde_json::Map::new() } else {
                rg.prix.keys().map(|k| (k.clone(), json!([prix(p, r.id, k, true), prix(p, r.id, k, false)]))).collect()
            };
            json!({
                "id": r.id, "nom": r.nom, "couleur": r.couleur, "joueur": r.joueur,
                "caractere": nom_caractere(&r.caractere), "vivant": r.vivant, "statut": r.statut,
                "relation": r.relation, "commerce": r.commerce, "puissance": p.puissance(r.id as i32),
                "surplus": r.surplus, "demande": r.demande, "tresor": r.or.floor(), "prix": prix_,
                "techs": r.techs.len(),
            })
        }).collect::<Vec<_>>(),
        "villes": p.villes.iter().enumerate().map(|(i, v)| json!({
            "id": v.id, "nom": v.nom, "proprio": v.proprio, "case": v.case, "niveau": v.niveau,
            "capitale": v.capitale, "defense": p.defense_ville(i), "rang": rg.nom_niveau(v.niveau),
        })).collect::<Vec<_>>(),
        "batiments": p.batiments.iter().map(|b| json!({
            "id": b.id, "cle": b.cle, "proprio": b.proprio, "case": b.case, "reste": b.reste,
            "ouvriers": b.ouvriers, "etat": b.etat, "pause": b.pause, "file": b.file, "face": b.face,
            "ville": b.ville, "produit": b.produit,
        })).collect::<Vec<_>>(),
        "armees": p.armees.iter().map(|a| json!({
            "id": a.id, "proprio": a.proprio, "case": a.case, "unites": a.unites, "chemin": a.chemin,
            "effectif": a.effectif(), "att": p.attaque(a, false, 1.0), "def": p.defense(a),
            "mois": if a.chemin.is_empty() { 0 } else { p.mois_trajet(a, &a.chemin) },
        })).collect::<Vec<_>>(),
        "cases": {
            "proprio": p.carte.cases.iter().map(|k| k.proprio).collect::<Vec<_>>(),
            "arbres": p.carte.cases.iter().map(|k| k.arbres).collect::<Vec<_>>(),
            "foret": p.carte.cases.iter().map(|k| k.foret as u8).collect::<Vec<_>>(),
            "bois": p.carte.cases.iter().map(|k| k.bois.round() as i32).collect::<Vec<_>>(),
        },
        "propositions": p.propositions,
        "journal": p.journal.iter().take(40).collect::<Vec<_>>(),
        "rapport": p.rapport,
        "fin": p.fin,
        "sans_victoire": p.sans_victoire,
        "couleurs": {"99": "#4b4b4b"},
    })
}

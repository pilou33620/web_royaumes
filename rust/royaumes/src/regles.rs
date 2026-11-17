//! Les règles du jeu : bâtiments, unités, technologies, époques et prix, lues dans `data/regles.json`.
//! Le même fichier part tel quel vers l'interface (/api/regles) : une seule source de vérité.

use std::collections::BTreeMap;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

pub const REGLES_JSON: &str = include_str!("../data/regles.json");

pub type Panier = BTreeMap<String, f64>;

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DefBat {
    pub cle: String,
    pub nom: String,
    pub icone: String,
    pub cat: String,
    pub niveau: u32,
    pub tech: Option<String>,
    pub cout: Panier,
    pub duree: u32,
    pub ouvriers: u32,
    pub logement: u32,
    pub prod: Panier,
    pub conso: Panier,
    pub besoin: Option<String>,
    pub saison: Option<String>,
    pub stockage: f64,
    pub stock_vivres: f64,
    pub hygiene: f64,
    pub foi: f64,
    pub taverne: f64,
    pub decor: f64,
    pub taxe: f64,
    pub savoir: f64,
    pub territoire: i32,
    pub defense: f64,
    pub rempart: bool,
    pub unites: Vec<String>,
    pub colons: u32,
    pub desc: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DefUnite {
    pub cle: String,
    pub nom: String,
    pub icone: String,
    pub genre: String,
    pub att: f64,
    pub def: f64,
    pub siege: f64,
    pub vitesse: f64,
    pub cout: Panier,
    pub niveau: u32,
    pub tech: Option<String>,
    pub obsolete: Option<String>,
    pub desc: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DefTech {
    pub cle: String,
    pub nom: String,
    pub annee: i32,
    pub cout: f64,
    pub desc: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DefNiveau {
    pub niveau: u32,
    pub nom: String,
    pub pop: i64,
    pub cout: Panier,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DefEpoque {
    pub cle: String,
    pub nom: String,
    pub debut: i32,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DefRes {
    pub cle: String,
    pub nom: String,
    pub icone: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Regles {
    pub ressources: Vec<DefRes>,
    pub nourriture: Vec<String>,
    pub boissons: Vec<String>,
    pub vivres: Vec<String>,
    pub prix: BTreeMap<String, f64>,
    pub niveaux: Vec<DefNiveau>,
    pub epoques: Vec<DefEpoque>,
    pub batiments: Vec<DefBat>,
    pub unites: Vec<DefUnite>,
    pub techs: Vec<DefTech>,
}

pub fn regles() -> &'static Regles {
    static R: OnceLock<Regles> = OnceLock::new();
    R.get_or_init(|| serde_json::from_str(REGLES_JSON).expect("data/regles.json illisible"))
}

impl Regles {
    pub fn bat(&self, cle: &str) -> Option<&DefBat> {
        self.batiments.iter().find(|b| b.cle == cle)
    }
    pub fn unite(&self, cle: &str) -> Option<&DefUnite> {
        self.unites.iter().find(|u| u.cle == cle)
    }
    pub fn tech(&self, cle: &str) -> Option<&DefTech> {
        self.techs.iter().find(|t| t.cle == cle)
    }
    pub fn niveau(&self, n: u32) -> Option<&DefNiveau> {
        self.niveaux.iter().find(|x| x.niveau == n)
    }
    pub fn nom_niveau(&self, n: u32) -> String {
        self.niveau(n).map(|x| x.nom.clone()).unwrap_or_default()
    }
    pub fn res_nom(&self, cle: &str) -> String {
        self.ressources.iter().find(|r| r.cle == cle).map(|r| r.nom.clone()).unwrap_or_else(|| cle.into())
    }
    pub fn res_icone(&self, cle: &str) -> String {
        self.ressources.iter().find(|r| r.cle == cle).map(|r| r.icone.clone()).unwrap_or_default()
    }
    pub fn epoque(&self, annee: i32) -> &DefEpoque {
        self.epoques.iter().rev().find(|e| annee >= e.debut).unwrap_or(&self.epoques[0])
    }
    pub fn est_vivre(&self, r: &str) -> bool {
        self.vivres.iter().any(|v| v == r)
    }
}

#[cfg(test)]
mod essais {
    use super::*;

    #[test]
    fn regles_coherentes() {
        let r = regles();
        assert!(r.batiments.len() >= 40, "{} bâtiments", r.batiments.len());
        let res: Vec<&str> = r.ressources.iter().map(|x| x.cle.as_str()).collect();
        for b in &r.batiments {
            for k in b.cout.keys().chain(b.prod.keys()).chain(b.conso.keys()) {
                assert!(res.contains(&k.as_str()), "{} : ressource inconnue {k}", b.cle);
            }
            if let Some(t) = &b.tech {
                assert!(r.tech(t).is_some(), "{} : tech inconnue {t}", b.cle);
            }
            for u in &b.unites {
                assert!(r.unite(u).is_some(), "{} : unité inconnue {u}", b.cle);
            }
        }
        for u in &r.unites {
            for t in u.tech.iter().chain(u.obsolete.iter()) {
                assert!(r.tech(t).is_some(), "{} : tech inconnue {t}", u.cle);
            }
        }
        assert_eq!(r.epoque(1700).cle, "ancien");
        assert_eq!(r.epoque(1790).cle, "empire");
        assert_eq!(r.epoque(1850).cle, "industrie");
    }
}

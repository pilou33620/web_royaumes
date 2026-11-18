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
    /// navires : soldats transportés (flûtes, vapeurs)
    pub transport: u32,
    /// navires : peut commercer depuis un port (flûte)
    pub commerce: bool,
    /// or par mois (navires et espions ; les soldats coûtent 0,5)
    pub entretien: f64,
    pub desc: String,
}

impl DefUnite {
    /// Un navire de guerre (assez armé pour combattre et bloquer un port) ; les flûtes n'en sont pas.
    pub fn guerre(&self) -> bool {
        self.genre == "marine" && self.att >= 3.0
    }
}

/// Rayons de vue (brouillard de guerre).
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DefVision {
    pub ville: i32,
    pub capitale: i32,
    pub tour: i32,
    pub armee: i32,
    pub cavalerie: i32,
    pub flotte: i32,
    pub espion: i32,
    pub depart: i32,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DefMarine {
    /// or par flûte au commerce et par mois, plus par royaume partenaire (et selon la distance)
    pub commerce_base: f64,
    pub commerce_partenaire: f64,
    pub commerce_distance: f64,
    pub commerce_max: f64,
    /// or perdu chaque mois par un royaume de l'ordinateur pour chaque ville bloquée
    pub blocus_ia: f64,
    /// part des navires perdus par le vaincu d'une bataille navale
    pub pertes_vaincu: f64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DefMission {
    pub cle: String,
    pub nom: String,
    pub icone: String,
    pub duree: u32,
    pub chance: f64,
    pub rayon: i32,
    pub mois: u32,
    pub savoir: f64,
    pub incendie: f64,
    pub desc: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DefEspionnage {
    /// chance en plus avec une Académie des sciences
    pub academie: f64,
    /// chance en moins par point de défense de la ville visée
    pub defense: f64,
    /// risque de capture en cas d'échec
    pub capture: f64,
    /// relation perdue quand un espion est démasqué
    pub relation: f64,
    pub missions: Vec<DefMission>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DefSiege {
    /// usure des murs par mois : tranchées et sape, plus l'artillerie (× la valeur de siège des canons)
    pub tranchees: f64,
    pub artillerie: f64,
    pub vauban_attaque: f64,
    pub vauban_defense: f64,
    pub gribeauval: f64,
    /// part du coût des fortifications payée par l'ordinateur (en or, son économie est résumée)
    pub fortif_ia: f64,
    /// pillage d'un faubourg : or, part du coût du bâtiment emportée, mois d'arrêt
    pub pillage_or: f64,
    pub pillage_part: f64,
    pub pillage_mois: u32,
    /// mois de vivres d'une ville assiégée : base, + par grenier, + rang de la ville
    pub vivres_base: f64,
    pub vivres_grenier: f64,
    pub usure_garnison: f64,
    pub usure_assiegeant: f64,
    /// pertes de la garnison et défense perdue par mois de faim
    pub faim: f64,
    /// mois de faim avant la reddition
    pub reddition_faim: u32,
}

/// Un niveau de fortification de ville (1 Palissade … 4 Citadelle).
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DefFortif {
    pub niveau: u32,
    pub nom: String,
    pub icone: String,
    /// rang de la ville requis
    pub rang: u32,
    pub tech: Option<String>,
    pub cout: Panier,
    pub murs: f64,
    /// multiplicateur de la défense de la ville
    pub defense: f64,
    /// mois de travaux
    pub duree: u32,
    /// rayon de l'enceinte autour de la mairie (0 : la mairie seule)
    pub enceinte: i32,
    /// cases de territoire en plus autour de la ville
    pub territoire: i32,
    pub desc: String,
}

/// L'ordre « Se retrancher » : mois de travaux, multiplicateur de la défense de l'armée retranchée.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DefRetranchement {
    pub duree: u32,
    pub defense: f64,
    pub desc: String,
}

/// Un niveau de fort (1 Redoute, 2 Fort bastionné, 3 Fort à batteries), bâti par une armée hors des villes.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DefFort {
    pub niveau: u32,
    pub nom: String,
    pub icone: String,
    /// rang de la capitale requis
    pub rang: u32,
    pub tech: Option<String>,
    pub cout: Panier,
    pub murs: f64,
    /// multiplicateur de la défense de la garnison
    pub defense: f64,
    /// rayon de vue en plus de celui d'une armée
    pub vision: i32,
    /// or par mois
    pub entretien: f64,
    /// mois de travaux (une armée du propriétaire doit rester sur la case)
    pub duree: u32,
    pub desc: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DefForts {
    /// distance minimale entre deux forts d'un même royaume
    pub distance: i32,
    pub niveaux: Vec<DefFort>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DefOption {
    pub texte: String,
    /// payé d'avance (ressources)
    pub cout: Panier,
    /// ressources, ou bonheur, savoir, pop, relation, tech, gisement
    pub effets: Panier,
    pub unites: BTreeMap<String, u32>,
    /// risque d'échec : on paie le coût, et `echec` remplace `effets`
    pub risque: f64,
    pub echec: Panier,
    pub echec_texte: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DefChoix {
    pub cle: String,
    pub titre: String,
    pub icone: String,
    /// {ville} : la capitale, {royaume} : un rival tiré au sort
    pub texte: String,
    /// époques et saisons possibles (vide : toutes)
    pub epoques: Vec<String>,
    pub saisons: Vec<usize>,
    /// situation requise : vivres_bas, guerre, paix, port, eglise
    pub si: String,
    pub royaume: bool,
    /// la dernière option est appliquée si l'on ne répond pas
    pub options: Vec<DefOption>,
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
    pub vision: DefVision,
    pub marine: DefMarine,
    pub espionnage: DefEspionnage,
    pub fortifications: Vec<DefFortif>,
    pub retranchement: DefRetranchement,
    pub forts: DefForts,
    pub siege: DefSiege,
    pub evenements_choix: Vec<DefChoix>,
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
    pub fn fortif(&self, n: u32) -> Option<&DefFortif> {
        self.fortifications.iter().find(|f| f.niveau == n)
    }
    pub fn fort(&self, n: u32) -> Option<&DefFort> {
        self.forts.niveaux.iter().find(|f| f.niveau == n)
    }
    pub fn mission(&self, cle: &str) -> Option<&DefMission> {
        self.espionnage.missions.iter().find(|m| m.cle == cle)
    }
    /// Ce que vaut un panier en or (au prix de base des marchandises).
    pub fn valeur(&self, p: &Panier) -> f64 {
        p.iter().map(|(r, q)| if r == "or" { *q } else { self.prix.get(r).copied().unwrap_or(1.0) * q }).sum()
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
        let effets = ["bonheur", "savoir", "pop", "relation", "tech", "gisement"];
        for e in &r.evenements_choix {
            assert!(e.options.len() >= 2, "{} : au moins deux options", e.cle);
            for o in &e.options {
                for k in o.cout.keys() {
                    assert!(res.contains(&k.as_str()), "{} : coût inconnu {k}", e.cle);
                }
                for k in o.effets.keys().chain(o.echec.keys()) {
                    assert!(res.contains(&k.as_str()) || effets.contains(&k.as_str()), "{} : effet inconnu {k}", e.cle);
                }
                for u in o.unites.keys() {
                    assert!(r.unite(u).is_some(), "{} : unité inconnue {u}", e.cle);
                }
            }
            // la dernière option (appliquée sans réponse) ne coûte rien
            assert!(e.options.last().unwrap().cout.is_empty(), "{}", e.cle);
        }
        assert!(r.evenements_choix.len() >= 20);
        assert_eq!(r.unites.iter().filter(|u| u.genre == "marine").count(), 5);
        assert!(r.unite("vaisseau").unwrap().guerre() && !r.unite("flute").unwrap().guerre());
        assert_eq!(r.espionnage.missions.len(), 3);
        assert!(r.siege.tranchees > 0.0 && r.vision.capitale > 0);
        assert_eq!(r.fortifications.len(), 4);
        for (i, f) in r.fortifications.iter().enumerate() {
            assert_eq!(f.niveau, i as u32 + 1);
            assert!(f.murs > 0.0 && f.defense > 1.0 && f.duree > 0 && r.niveau(f.rang).is_some(), "{}", f.nom);
            assert!(f.tech.as_ref().map_or(true, |t| r.tech(t).is_some()) && f.cout.keys().all(|k| res.contains(&k.as_str())), "{}", f.nom);
        }
        // forts : 3 niveaux de plus en plus solides, moins chers qu'une enceinte de ville mais entretenus
        assert!(r.retranchement.duree >= 1 && r.retranchement.defense > 1.0);
        assert_eq!(r.forts.niveaux.len(), 3);
        assert!(r.forts.distance >= 2);
        for (i, f) in r.forts.niveaux.iter().enumerate() {
            assert_eq!(f.niveau, i as u32 + 1);
            assert!(f.murs > 0.0 && f.defense > r.retranchement.defense && f.duree > 0 && f.vision > 0 && f.entretien > 0.0 && r.niveau(f.rang).is_some(), "{}", f.nom);
            assert!(f.tech.as_ref().map_or(true, |t| r.tech(t).is_some()) && !f.cout.is_empty() && f.cout.keys().all(|k| res.contains(&k.as_str())), "{}", f.nom);
            let ville = r.fortif(f.niveau).unwrap();
            assert!(f.murs <= ville.murs && r.valeur(&f.cout) < r.valeur(&ville.cout), "{} : moins qu'une enceinte de ville", f.nom);
            if i > 0 {
                let p = &r.forts.niveaux[i - 1];
                assert!(f.murs > p.murs && f.defense > p.defense && f.vision >= p.vision && f.entretien > p.entretien, "{}", f.nom);
            }
        }
        assert!(r.bat("remparts").unwrap().cat == "aucune" && r.bat("citadelle").unwrap().cat == "aucune", "ils ne se construisent plus");
        assert_eq!(r.epoque(1700).cle, "ancien");
        assert_eq!(r.epoque(1790).cle, "empire");
        assert_eq!(r.epoque(1850).cle, "industrie");
    }
}

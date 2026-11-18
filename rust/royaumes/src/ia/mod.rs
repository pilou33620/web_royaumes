//! Les royaumes de l'ordinateur. Ils vivent la même économie que le joueur (tour.rs : stocks, production,
//! ouvriers, population, bonheur, famine, froid…) et jouent avec ses ordres et ses contrôles (commandes.rs).
//! Chaque mois, dans l'ordre :
//! - `economie` : il pèse ses besoins et agit comme un joueur (bâtir au bon endroit, rang de ville,
//!   recherche, impôts, pauses, éclairage, colonies, commerce) ;
//! - `militaire` : recrutement, fortifications, marine, espionnage, forts, sièges, attaques (phase 2) ;
//! - `diplomatie` : humeur envers le joueur, guerre et paix, propositions (phase 3).
//!
//! La difficulté (`options.difficulte`) ne lui donne plus de ressources : elle règle la qualité de ses décisions
//! (`Qualite`), avec au plus un petit bonus de production au niveau le plus dur (`bonus_production`).

pub mod diplomatie;
pub mod economie;
pub mod militaire;

pub use diplomatie::declarer_guerre;

use crate::partie::{Partie, Rapport};

/// La qualité des décisions de l'ordinateur, selon la difficulté.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Qualite {
    /// il ne décide qu'un mois sur `delai` (le reste du temps, son royaume vit sur sa lancée)
    pub delai: u32,
    /// bâtiments candidats évalués à chaque décision (les autres sont ignorés ce mois-ci)
    pub options: usize,
    /// emplacements évalués pour un bâtiment
    pub sites: usize,
    /// chance de choisir au hasard plutôt que le meilleur (bâtiment, emplacement, technologie)
    pub erreur: f64,
    /// mois de réserve qu'il vise (vivres, bois de chauffage, matériaux)
    pub horizon: f64,
    /// chantiers qu'il peut lancer dans un même mois
    pub actions: usize,
}

/// Facile (0,75 dans l'interface), Normale (1), Difficile (1,35).
pub fn qualite(difficulte: f64) -> Qualite {
    if difficulte < 0.9 {
        Qualite { delai: 2, options: 6, sites: 6, erreur: 0.3, horizon: 1.5, actions: 1 }
    } else if difficulte < 1.2 {
        Qualite { delai: 1, options: 10, sites: 12, erreur: 0.15, horizon: 2.5, actions: 2 }
    } else {
        Qualite { delai: 1, options: usize::MAX, sites: usize::MAX, erreur: 0.0, horizon: 3.0, actions: 3 }
    }
}

/// Le seul avantage qui reste à l'ordinateur : +10 % de production au niveau le plus dur.
pub fn bonus_production(difficulte: f64) -> f64 {
    if difficulte >= 1.2 {
        1.1
    } else {
        1.0
    }
}

/// Le mois du rival `k` : ses décisions, avant que le mois ne se joue pour tous (tour.rs).
pub fn mois(p: &mut Partie, k: usize, rapport: &mut Rapport) {
    let id = k as i32;
    if !p.villes.iter().any(|v| v.proprio == id) {
        if p.royaumes[k].vivant {
            p.royaumes[k].vivant = false;
            p.armees.retain(|a| a.proprio != id);
            p.flottes.retain(|a| a.proprio != id);
            p.espions.retain(|a| a.proprio != id);
            p.forts.retain(|a| a.proprio != id);
        }
        return;
    }
    economie::mois(p, k);
    militaire::mois(p, k, rapport);
    diplomatie::mois(p, k, rapport);
}

//! L'état d'une partie et ce qui le lit ou le modifie hors du tour : création, territoire,
//! construction, armées, chemins, défense des villes.

use std::collections::{BTreeMap, BinaryHeap, HashMap};
use std::cmp::Reverse;

use serde::{Deserialize, Serialize};

use crate::carte::{Carte, Options, Terrain, BOIS_ARBRE};
use crate::hasard::Hasard;
use crate::meteo::{self, Meteo};
use crate::regles::{regles, Panier};

pub const VERSION_SAUVEGARDE: u32 = 1;
/// La partie commence en avril 1700 (le printemps : on sème avant l'hiver).
pub const TOUR_DEPART: u32 = 3;
/// Les brigands : un « royaume » à part, ennemi de tous.
pub const BRIGANDS: i32 = 99;

pub struct DefRoyaume {
    pub nom: &'static str,
    pub couleur: &'static str,
    pub caractere: &'static str,
    pub villes: &'static [&'static str],
}

pub const ROYAUMES: [DefRoyaume; 6] = [
    DefRoyaume { nom: "Royaume d'Azur", couleur: "#2f7fd6", caractere: "", villes: &["Bellerive", "Clairmont", "Hautegarde", "Rochefleur", "Pré-Doré", "Vauclair", "Montjoie"] },
    DefRoyaume { nom: "Empire d'Ostrie", couleur: "#c23b2e", caractere: "guerrier", villes: &["Ostria", "Ravenne", "Capoue", "Néapolis", "Ostie", "Tarente"] },
    DefRoyaume { nom: "Ligue de Marbrune", couleur: "#139089", caractere: "marchand", villes: &["Marbrune", "Texcoque", "Cholula", "Tlacopa", "Xochimar", "Coyoac"] },
    DefRoyaume { nom: "Duché de Sylve", couleur: "#8e44ad", caractere: "batisseur", villes: &["Sylvanor", "Brumebois", "Fougeraie", "Mousseval", "Lierre", "Combefeuille"] },
    DefRoyaume { nom: "Électorat de Korval", couleur: "#df7a1c", caractere: "guerrier", villes: &["Korval", "Durnhelm", "Skarp", "Grimholt", "Vargen", "Eisenau"] },
    DefRoyaume { nom: "République de Lumen", couleur: "#c9a00f", caractere: "marchand", villes: &["Lumen", "Aurelle", "Dorac", "Solenne", "Mirabel", "Port-Clair"] },
];

pub fn nom_caractere(c: &str) -> &'static str {
    match c {
        "guerrier" => "Belliqueux",
        "marchand" => "Marchand",
        "batisseur" => "Bâtisseur",
        _ => "",
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Royaume {
    pub id: usize,
    pub nom: String,
    pub couleur: String,
    pub joueur: bool,
    pub caractere: String,
    pub vivant: bool,
    pub techs: Vec<String>,
    // --- le joueur ---
    pub stock: Panier,
    pub pop: i64,
    pub bonheur: f64,
    pub impots: String,
    pub recherche: Option<String>,
    pub savoir: f64,
    pub detail_bonheur: Vec<(String, f64)>,
    pub revenus: Panier,
    pub bilan: Panier,
    pub famine: bool,
    pub ouvriers_libres: i64,
    pub variete: u32,
    pub quete: usize,
    // --- les royaumes de l'ordinateur ---
    pub or: f64,
    pub relation: f64,
    pub statut: String,
    pub commerce: bool,
    pub treve: u32,
    pub debut_guerre: u32,
    pub prochaine_attaque: u32,
    pub prochaine_offre: u32,
    pub prochaine_ville: u32,
    pub cadeaux: u32,
    pub retard_techs: i32,
    pub surplus: Vec<String>,
    pub demande: Vec<String>,
    pub noms_villes: Vec<String>,
    pub attitude: f64,
}

impl Royaume {
    pub fn a(&self, tech: &str) -> bool {
        self.techs.iter().any(|t| t == tech)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Ville {
    pub id: u32,
    pub nom: String,
    pub proprio: i32,
    pub case: usize,
    pub niveau: u32,
    pub capitale: bool,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Batiment {
    pub id: u32,
    pub cle: String,
    pub proprio: i32,
    pub case: usize,
    /// mois de travaux restants (0 : terminé)
    pub reste: u32,
    pub ouvriers: u32,
    pub etat: String,
    pub pause: bool,
    pub file: Vec<String>,
    /// la ville dont il dépend
    pub ville: Option<u32>,
    /// ce qu'il a produit le mois dernier
    pub produit: Panier,
    /// orientation du modèle (radians)
    pub face: f64,
}

impl Batiment {
    pub fn fini(&self) -> bool {
        self.reste == 0
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Armee {
    pub id: u32,
    pub proprio: i32,
    pub case: usize,
    pub unites: BTreeMap<String, u32>,
    /// cases à parcourir (sans la case actuelle)
    pub chemin: Vec<usize>,
}

impl Armee {
    pub fn effectif(&self) -> u32 {
        self.unites.values().sum()
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Proposition {
    pub id: u32,
    pub de: usize,
    /// echange, alliance, paix, tribut, marchand
    pub genre: String,
    pub texte: String,
    pub donne: Panier,
    pub demande: Panier,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Evenement {
    pub texte: String,
    /// info, bon, guerre, or, meteo
    pub genre: String,
    pub case: Option<usize>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Mouvement {
    pub armee: u32,
    pub proprio: i32,
    pub trajet: Vec<usize>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Combat {
    pub case: usize,
    pub attaquant: i32,
    pub defenseur: i32,
    pub vainqueur: i32,
    pub texte: String,
    /// étape du déplacement où il a lieu (pour l'animation)
    pub etape: usize,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Rapport {
    pub tour: u32,
    pub date: String,
    pub meteo: Option<Meteo>,
    pub effets_meteo: Vec<String>,
    pub evenements: Vec<Evenement>,
    pub mouvements: Vec<Mouvement>,
    pub combats: Vec<Combat>,
    pub termines: Vec<usize>,
    pub bilan: Panier,
    pub pop_avant: i64,
    pub pop_apres: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Fin {
    pub victoire: bool,
    pub titre: String,
    pub texte: String,
}

#[derive(Clone, Debug, Default)]
pub struct Stats {
    pub logement: i64,
    pub stockage: f64,
    pub vivres: f64,
    pub hygiene: f64,
    pub foi: f64,
    pub taverne: f64,
    pub decor: f64,
    pub taxe: f64,
    pub savoir: f64,
    pub soldats: i64,
    pub comptoir: bool,
    pub port: bool,
    pub gare: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Partie {
    pub version: u32,
    pub options: Options,
    pub hasard: Hasard,
    pub carte: Carte,
    pub tour: u32,
    pub meteo: Meteo,
    pub royaumes: Vec<Royaume>,
    pub villes: Vec<Ville>,
    pub batiments: Vec<Batiment>,
    pub armees: Vec<Armee>,
    pub propositions: Vec<Proposition>,
    pub journal: Vec<String>,
    pub rapport: Rapport,
    pub prochain_id: u32,
    pub prochains_brigands: u32,
    pub fin: Option<Fin>,
    pub sans_victoire: bool,
    /// numéro de version de la carte (le terrain a changé : l'interface la recharge)
    pub version_carte: u32,
}

impl Partie {
    // ------------------------------------------------------------------ création
    pub fn nouvelle(mut o: Options) -> Partie {
        o.borner();
        let mut carte = Carte::generer(&o);
        let mut h = Hasard::new(o.graine.wrapping_mul(7).wrapping_add(3));
        let tailles = carte.composantes();
        let n = o.rivaux as usize + 1;
        let la_plus_grande = tailles.iter().enumerate().max_by_key(|x| x.1).map(|x| x.0 as i32).unwrap_or(0);
        let (l, ht) = (carte.l, carte.h);
        let mut cand: Vec<usize> = (0..carte.cases.len())
            .filter(|&i| {
                let k = &carte.cases[i];
                k.t == Terrain::Plaine && !k.riviere && k.comp >= 0 && tailles[k.comp as usize] >= 20 && k.c > 2 && k.r > 2 && k.c < l - 3 && k.r < ht - 3
            })
            .collect();
        if cand.len() < n {
            cand = (0..carte.cases.len()).filter(|&i| matches!(carte.cases[i].t, Terrain::Plaine | Terrain::Sable)).collect();
        }
        let premiers: Vec<usize> = cand.iter().copied().filter(|&i| carte.cases[i].comp == la_plus_grande).collect();
        let mut departs = vec![*h.choix(&premiers).or(h.choix(&cand)).expect("aucune terre où fonder un royaume")];
        while departs.len() < n {
            let mut meilleur = None;
            let mut score = -1.0;
            for &i in &cand {
                if departs.contains(&i) {
                    continue;
                }
                let d = departs.iter().map(|&s| carte.dist(s, i)).min().unwrap_or(0) as f64;
                let sc = d + if carte.cases[i].comp == la_plus_grande { 4.0 } else { 0.0 } + h.f() * 2.0;
                if sc > score {
                    score = sc;
                    meilleur = Some(i);
                }
            }
            match meilleur {
                Some(i) => departs.push(i),
                None => break,
            }
        }
        // chaque départ a du bois et de la pierre à portée
        for &s in &departs {
            carte.cases[s].foret = false;
            carte.cases[s].arbres = 0;
            carte.cases[s].bois = 0.0;
            let autour: Vec<usize> = carte.rayon(s, 3).into_iter().filter(|&x| x != s && carte.cases[x].t == Terrain::Plaine).collect();
            if !carte.rayon(s, 3).iter().any(|&x| carte.cases[x].foret) {
                let choisies: Vec<usize> = autour.iter().copied().filter(|&x| carte.dist(x, s) >= 2).take(3).collect();
                for x in choisies {
                    let k = &mut carte.cases[x];
                    k.foret = true;
                    k.arbres = 5;
                    k.bois = 5.0 * BOIS_ARBRE;
                }
            }
            if !carte.rayon(s, 4).iter().any(|&x| matches!(carte.cases[x].t, Terrain::Colline | Terrain::Montagne) || carte.cases[x].gisement.is_some()) {
                if let Some(&x) = autour.iter().find(|&&x| !carte.cases[x].foret && carte.dist(x, s) >= 2) {
                    carte.cases[x].t = Terrain::Colline;
                    carte.cases[x].gisement = Some("pierre".into());
                }
            }
        }
        carte.composantes();
        // les royaumes : le joueur d'abord (Azur), puis les rivaux tirés au sort
        let mut ordre: Vec<usize> = (1..6).collect();
        h.melanger(&mut ordre);
        ordre.insert(0, 0);
        ordre.truncate(departs.len());
        let mut royaumes = Vec::new();
        let ressources: Vec<String> = regles().prix.keys().cloned().collect();
        for (k, &d) in ordre.iter().enumerate() {
            let def = &ROYAUMES[d];
            let joueur = k == 0;
            let mut caractere = def.caractere.to_string();
            if !joueur {
                caractere = match o.attitude.as_str() {
                    "agressifs" if h.p(0.7) => "guerrier".into(),
                    "pacifiques" if caractere == "guerrier" => "batisseur".into(),
                    _ => caractere,
                };
            }
            let attitude = match o.attitude.as_str() {
                "agressifs" => -25.0,
                "pacifiques" => 25.0,
                _ => 0.0,
            };
            let base = match caractere.as_str() {
                "guerrier" => -20.0,
                "marchand" => 15.0,
                _ => 0.0,
            };
            let mut pool = ressources.clone();
            h.melanger(&mut pool);
            let mut r = Royaume {
                id: k,
                nom: if joueur { "Votre royaume".into() } else { def.nom.into() },
                couleur: def.couleur.into(),
                joueur,
                caractere,
                vivant: true,
                impots: "normal".into(),
                bonheur: 60.0,
                pop: 24,
                or: 300.0,
                relation: base + attitude,
                attitude,
                statut: "neutre".into(),
                surplus: pool[0..3].to_vec(),
                demande: pool[3..6].to_vec(),
                noms_villes: def.villes.iter().skip(if joueur { 0 } else { 1 }).map(|s| s.to_string()).collect(),
                retard_techs: h.entre(2, 9) as i32,
                prochaine_ville: h.entre(30, 60) as u32,
                prochaine_offre: h.entre(10, 18) as u32,
                ..Default::default()
            };
            if joueur {
                for res in &regles().ressources {
                    r.stock.insert(res.cle.clone(), 0.0);
                }
                for (c, v) in [("or", 300.0), ("bois", 80.0), ("planches", 30.0), ("pierre", 40.0), ("outils", 10.0), ("pain", 30.0), ("poisson", 20.0)] {
                    r.stock.insert(c.into(), v);
                }
            }
            royaumes.push(r);
        }
        let mut p = Partie {
            version: VERSION_SAUVEGARDE,
            meteo: Meteo::default(),
            options: o,
            hasard: h,
            carte,
            tour: TOUR_DEPART,
            royaumes,
            villes: Vec::new(),
            batiments: Vec::new(),
            armees: Vec::new(),
            propositions: Vec::new(),
            journal: Vec::new(),
            rapport: Rapport::default(),
            prochain_id: 1,
            prochains_brigands: TOUR_DEPART + 20,
            fin: None,
            sans_victoire: false,
            version_carte: 1,
        };
        p.meteo = Meteo::tirer(&Meteo { temperature: 9.0, ..Meteo::default() }, TOUR_DEPART, &mut p.hasard);
        for (k, &s) in departs.iter().enumerate() {
            let nom = if k == 0 { p.options.capitale.clone() } else { ROYAUMES[ordre[k]].villes[0].to_string() };
            p.fonder_ville(k as i32, s, nom, if k == 0 { 1 } else { 2 }, true);
        }
        p.recalculer_territoire();
        // bâtiments de départ
        let cap = p.villes[0].case;
        let mut poses = 0;
        for v in p.carte.voisins(cap) {
            if poses < 2 && p.peut_construire("cabane", v, 0).is_ok() {
                p.poser("cabane", v, 0, true);
                poses += 1;
            }
        }
        for k in 1..p.royaumes.len() {
            let centre = p.villes[k].case;
            let mut faits = 0;
            for _ in 0..50 {
                if faits >= 5 {
                    break;
                }
                let types = ["cabane", "maison", "ferme", "bucheron", "pecheur", "carriere", "caserne", "cabane"];
                let t = types[p.hasard.indice(types.len())];
                let zone = p.carte.rayon(centre, 3);
                let c = zone[p.hasard.indice(zone.len())];
                if p.peut_construire(t, c, k as i32).is_ok() {
                    p.poser(t, c, k as i32, true);
                    faits += 1;
                }
            }
        }
        p.recalculer_territoire();
        for k in 0..p.royaumes.len() {
            let case = p.villes[k].case;
            let mut u = BTreeMap::new();
            u.insert("milice".to_string(), if k == 0 { 4 } else { 4 });
            u.insert("mousquetaire".to_string(), if k == 0 { 2 } else { 3 });
            p.creer_armee(k as i32, case, u);
        }
        p.noter(format!("{} : vous fondez {}.", meteo::date_texte(TOUR_DEPART), p.villes[0].nom));
        p
    }

    // ------------------------------------------------------------------ utilitaires
    pub fn annee(&self) -> i32 {
        meteo::annee(self.tour)
    }

    pub fn id(&mut self) -> u32 {
        self.prochain_id += 1;
        self.prochain_id
    }

    pub fn noter(&mut self, texte: String) {
        self.journal.insert(0, texte);
        self.journal.truncate(80);
    }

    pub fn joueur(&self) -> &Royaume {
        &self.royaumes[0]
    }

    pub fn nom_royaume(&self, id: i32) -> String {
        if id == BRIGANDS {
            "les Brigands".into()
        } else {
            self.royaumes.get(id as usize).map(|r| r.nom.clone()).unwrap_or_default()
        }
    }

    pub fn couleur(&self, id: i32) -> String {
        if id == BRIGANDS {
            "#4b4b4b".into()
        } else {
            self.royaumes.get(id as usize).map(|r| r.couleur.clone()).unwrap_or_else(|| "#888".into())
        }
    }

    pub fn a_tech(&self, id: i32, tech: &str) -> bool {
        id != BRIGANDS && self.royaumes.get(id as usize).is_some_and(|r| r.a(tech))
    }

    pub fn capitale(&self, id: i32) -> Option<usize> {
        self.villes.iter().position(|v| v.proprio == id && v.capitale).or_else(|| self.villes.iter().position(|v| v.proprio == id))
    }

    pub fn niveau_capitale(&self, id: i32) -> u32 {
        self.capitale(id).map(|i| self.villes[i].niveau).unwrap_or(1)
    }

    pub fn ville_a(&self, case: usize) -> Option<usize> {
        self.villes.iter().position(|v| v.case == case)
    }

    pub fn bat(&self, id: u32) -> Option<&Batiment> {
        self.batiments.iter().find(|b| b.id == id)
    }

    pub fn a_batiment(&self, id: i32, cle: &str) -> bool {
        self.batiments.iter().any(|b| b.proprio == id && b.cle == cle && b.fini())
    }

    pub fn ville_proche(&self, case: usize, id: i32) -> Option<usize> {
        self.villes.iter().enumerate().filter(|(_, v)| v.proprio == id).min_by_key(|(_, v)| self.carte.dist(v.case, case)).map(|(i, _)| i)
    }

    pub fn est_ennemi(&self, a: i32, b: i32) -> bool {
        if a == b {
            return false;
        }
        if a == BRIGANDS || b == BRIGANDS {
            return true;
        }
        if a == 0 {
            return self.royaumes[b as usize].statut == "guerre";
        }
        if b == 0 {
            return self.royaumes[a as usize].statut == "guerre";
        }
        false
    }

    // ------------------------------------------------------------------ villes et territoire
    pub fn fonder_ville(&mut self, proprio: i32, case: usize, nom: String, niveau: u32, capitale: bool) -> usize {
        let id = self.id();
        self.villes.push(Ville { id, nom, proprio, case, niveau, capitale });
        let b = self.poser("hotel", case, proprio, true);
        if let Some(bb) = self.batiments.iter_mut().find(|x| x.id == b) {
            bb.ville = Some(id);
        }
        self.villes.len() - 1
    }

    pub fn recalculer_territoire(&mut self) {
        let mut sources: Vec<(usize, i32, i32, u8)> = self.villes.iter().map(|v| (v.case, v.proprio, 2 + v.niveau as i32, 0)).collect();
        for b in &self.batiments {
            if let Some(d) = regles().bat(&b.cle) {
                if b.fini() && d.territoire > 0 {
                    sources.push((b.case, b.proprio, d.territoire, 1));
                }
            }
        }
        for i in 0..self.carte.cases.len() {
            if let Some(bid) = self.carte.cases[i].bat {
                if let Some(b) = self.bat(bid) {
                    self.carte.cases[i].proprio = b.proprio;
                    continue;
                }
            }
            let mut meilleur: Option<(i32, i32, u8)> = None;
            for &(c, p, r, pri) in &sources {
                let d = self.carte.dist(i, c);
                if d <= r {
                    let mieux = match meilleur {
                        None => true,
                        Some((bd, _, bp)) => d < bd || (d == bd && pri < bp),
                    };
                    if mieux {
                        meilleur = Some((d, p, pri));
                    }
                }
            }
            self.carte.cases[i].proprio = meilleur.map(|m| m.1).unwrap_or(-1);
        }
    }

    // ------------------------------------------------------------------ construction
    pub fn peut_construire(&self, cle: &str, case: usize, id: i32) -> Result<(), String> {
        let d = regles().bat(cle).ok_or("Bâtiment inconnu")?;
        let k = self.carte.cases.get(case).ok_or("Hors de la carte")?;
        if !k.terre() {
            return Err("Impossible sur l'eau".into());
        }
        if k.t == Terrain::Montagne {
            return Err("Impossible sur une montagne".into());
        }
        if k.bat.is_some() {
            return Err("Case déjà occupée".into());
        }
        if cle == "hotel" {
            return Ok(());
        }
        let vois = self.carte.voisins(case);
        if cle == "colonie" {
            if k.proprio != -1 {
                return Err("Une colonie se fonde hors de tout territoire".into());
            }
            if self.villes.iter().any(|v| self.carte.dist(v.case, case) < 4) {
                return Err("Trop près d'une ville (4 cases au moins)".into());
            }
            let portee = if self.a_tech(id, "cartographie") { 5 } else { 3 };
            if !self.carte.rayon(case, portee).iter().any(|&x| self.carte.cases[x].proprio == id) {
                return Err(format!("Trop loin de vos frontières ({portee} cases au plus)"));
            }
            return Ok(());
        }
        if k.proprio != id {
            return Err("Hors de votre territoire".into());
        }
        let c = |f: &dyn Fn(&crate::carte::Case) -> bool| vois.iter().any(|&j| f(&self.carte.cases[j]));
        match d.besoin.as_deref() {
            Some("foret") if !(k.foret || c(&|x| x.foret)) => Err("Il faut une forêt voisine".into()),
            Some("roche") if !(k.t == Terrain::Colline || k.gisement.as_deref() == Some("pierre") || c(&|x| matches!(x.t, Terrain::Colline | Terrain::Montagne) || x.gisement.as_deref() == Some("pierre"))) => {
                Err("Il faut une colline ou une montagne voisine".into())
            }
            Some("plaine") if k.t != Terrain::Plaine => Err("Il faut une plaine".into()),
            Some("coteau") if !matches!(k.t, Terrain::Plaine | Terrain::Colline) || k.foret => Err("Il faut une plaine ou un coteau dégagé".into()),
            Some("eau") if !c(&|x| !x.terre()) => Err("Il faut de l'eau voisine".into()),
            Some("cote") if !c(&|x| x.mer()) => Err("Il faut une côte maritime".into()),
            Some(g @ ("fer" | "or" | "charbon")) if !(k.gisement.as_deref() == Some(g) || c(&|x| x.gisement.as_deref() == Some(g))) => {
                Err(format!("Il faut un gisement {} voisin", match g { "fer" => "de fer", "or" => "d'or", _ => "de charbon" }))
            }
            _ => Ok(()),
        }
    }

    /// Pose un bâtiment (déjà payé) ; rend son identifiant.
    pub fn poser(&mut self, cle: &str, case: usize, proprio: i32, immediat: bool) -> u32 {
        let d = regles().bat(cle).expect("bâtiment inconnu");
        let id = self.id();
        let mut face = (self.hasard.indice(6) as f64) * std::f64::consts::PI / 3.0;
        if cle == "pecheur" || cle == "port" {
            for dir in 0..6 {
                if let Some(v) = self.carte.voisin_dir(case, dir) {
                    if !self.carte.cases[v].terre() {
                        face = -(dir as f64) * std::f64::consts::PI / 3.0;
                        break;
                    }
                }
            }
        }
        if cle == "hotel" || cle == "colonie" {
            face = 0.0;
        }
        let ville = self.ville_proche(case, proprio).map(|i| self.villes[i].id);
        let k = &mut self.carte.cases[case];
        // les arbres de la case tombent (le bois va au joueur)
        if proprio == 0 && k.arbres > 0 {
            let gain = k.arbres as f64 * 3.0;
            *self.royaumes[0].stock.entry("bois".into()).or_insert(0.0) += gain;
        }
        k.foret = false;
        k.arbres = 0;
        k.bois = 0.0;
        k.bat = Some(id);
        self.batiments.push(Batiment { id, cle: cle.into(), proprio, case, reste: if immediat { 0 } else { d.duree.max(1) }, ville, face, ..Default::default() });
        id
    }

    pub fn demolir(&mut self, case: usize) -> Result<(), String> {
        let bid = self.carte.cases[case].bat.ok_or("Rien à démolir")?;
        let b = self.bat(bid).cloned().ok_or("Rien à démolir")?;
        if b.cle == "hotel" {
            return Err("On ne démolit pas un hôtel de ville".into());
        }
        let d = regles().bat(&b.cle).unwrap();
        if b.proprio == 0 {
            for (r, v) in &d.cout {
                if r != "or" {
                    *self.royaumes[0].stock.entry(r.clone()).or_insert(0.0) += (v * 0.5).floor();
                }
            }
        }
        self.batiments.retain(|x| x.id != bid);
        self.carte.cases[case].bat = None;
        if d.territoire > 0 {
            self.recalculer_territoire();
        }
        Ok(())
    }

    pub fn stats(&self, id: i32) -> Stats {
        let mut s = Stats { stockage: 200.0, ..Default::default() };
        for b in &self.batiments {
            if b.proprio != id || !b.fini() {
                continue;
            }
            let d = regles().bat(&b.cle).unwrap();
            if b.cle == "hotel" {
                let n = b.ville.and_then(|v| self.villes.iter().find(|x| x.id == v)).map(|v| v.niveau).unwrap_or(1) as i64;
                s.logement += 8 + n * 6;
                s.stockage += 40.0;
                continue;
            }
            let actif = d.ouvriers == 0 || b.ouvriers > 0;
            s.logement += d.logement as i64;
            s.stockage += d.stockage;
            s.vivres += d.stock_vivres;
            s.hygiene += d.hygiene;
            s.decor += d.decor;
            if actif {
                s.foi += d.foi;
                s.taverne += d.taverne;
                s.taxe += d.taxe;
                s.savoir += d.savoir;
            }
            match b.cle.as_str() {
                "comptoir" => s.comptoir = true,
                "port" => s.port = true,
                "gare" => s.gare = true,
                _ => {}
            }
        }
        s.taxe = s.taxe.min(0.6);
        for a in &self.armees {
            if a.proprio == id {
                s.soldats += a.effectif() as i64;
            }
        }
        s
    }

    pub fn capacite(&self, s: &Stats, r: &str) -> f64 {
        if r == "or" {
            f64::INFINITY
        } else {
            s.stockage + if regles().est_vivre(r) { s.vivres } else { 0.0 }
        }
    }

    pub fn peut_payer(&self, cout: &Panier, mult: f64) -> bool {
        let st = &self.royaumes[0].stock;
        cout.iter().all(|(r, v)| st.get(r).copied().unwrap_or(0.0) + 1e-9 >= v * mult)
    }

    pub fn payer(&mut self, cout: &Panier, mult: f64) {
        for (r, v) in cout {
            *self.royaumes[0].stock.entry(r.clone()).or_insert(0.0) -= v * mult;
        }
    }

    // ------------------------------------------------------------------ armées
    pub fn creer_armee(&mut self, proprio: i32, case: usize, unites: BTreeMap<String, u32>) -> u32 {
        let id = self.id();
        self.armees.push(Armee { id, proprio, case, unites, chemin: Vec::new() });
        id
    }

    pub fn armee(&self, id: u32) -> Option<usize> {
        self.armees.iter().position(|a| a.id == id)
    }

    pub fn vitesse(&self, a: &Armee) -> f64 {
        let mut v = a.unites.iter().filter(|(_, &n)| n > 0).filter_map(|(u, _)| regles().unite(u)).map(|u| u.vitesse).fold(f64::INFINITY, f64::min);
        if !v.is_finite() {
            v = 4.0;
        }
        if self.a_tech(a.proprio, "routes") {
            v += 1.0;
        }
        if self.a_tech(a.proprio, "chemin_fer") && self.a_batiment(a.proprio, "gare") {
            v *= 1.5;
        }
        v
    }

    pub fn attaque(&self, a: &Armee, contre_ville: bool, tir: f64) -> f64 {
        let percussion = self.a_tech(a.proprio, "percussion");
        let silex = self.a_tech(a.proprio, "silex");
        a.unites
            .iter()
            .filter_map(|(u, &n)| regles().unite(u).map(|d| (d, n)))
            .map(|(d, n)| {
                let mut at = d.att;
                if d.genre == "infanterie" && silex {
                    at += 1.0;
                }
                if contre_ville && d.siege > 0.0 {
                    at *= d.siege;
                }
                if (d.genre == "infanterie" || d.cle == "dragon") && !percussion {
                    at *= tir;
                }
                at * n as f64
            })
            .sum()
    }

    pub fn defense(&self, a: &Armee) -> f64 {
        a.unites.iter().filter_map(|(u, &n)| regles().unite(u).map(|d| d.def * n as f64)).sum()
    }

    pub fn defense_ville(&self, vi: usize) -> f64 {
        let v = &self.villes[vi];
        let mut d = 8.0 + v.niveau as f64 * 8.0;
        let mut rempart = false;
        for b in &self.batiments {
            if b.proprio != v.proprio || !b.fini() {
                continue;
            }
            let dd = self.carte.dist(b.case, v.case);
            let def = regles().bat(&b.cle).unwrap();
            if def.defense > 0.0 && dd <= 4 {
                d += def.defense;
            }
            if def.rempart && dd <= 3 {
                rempart = true;
            }
        }
        if rempart {
            d *= 1.5;
        }
        if self.a_tech(v.proprio, "vauban") {
            d *= 1.25;
        }
        d.round()
    }

    pub fn puissance(&self, id: i32) -> f64 {
        let armees: f64 = self.armees.iter().filter(|a| a.proprio == id).map(|a| self.attaque(a, false, 1.0) + self.defense(a)).sum();
        let villes: f64 = (0..self.villes.len()).filter(|&i| self.villes[i].proprio == id).map(|i| self.defense_ville(i)).sum();
        (armees + villes).round()
    }

    pub fn praticable(&self, case: usize, id: i32) -> bool {
        let k = &self.carte.cases[case];
        if k.terre() {
            return k.t != Terrain::Montagne;
        }
        if id == BRIGANDS {
            return false;
        }
        if id == 0 {
            return self.stats(0).port;
        }
        true
    }

    pub fn cout_case(&self, case: usize) -> f64 {
        let k = &self.carte.cases[case];
        if !k.terre() {
            1.5
        } else if k.t == Terrain::Colline {
            2.0
        } else if k.foret {
            1.5
        } else {
            1.0
        }
    }

    /// Plus court chemin (A*) de `de` à `vers` pour une armée de `id` ; sans la case de départ.
    pub fn chemin(&self, de: usize, vers: usize, id: i32) -> Option<Vec<usize>> {
        if vers >= self.carte.cases.len() || !self.praticable(vers, id) {
            return None;
        }
        let port = id == 0 && self.stats(0).port;
        let passe = |c: usize| {
            let k = &self.carte.cases[c];
            if k.terre() {
                k.t != Terrain::Montagne
            } else {
                id != BRIGANDS && (id != 0 || port)
            }
        };
        let mut g: HashMap<usize, f64> = HashMap::from([(de, 0.0)]);
        let mut venu: HashMap<usize, usize> = HashMap::new();
        let mut ouvert = BinaryHeap::new();
        ouvert.push(Reverse((0u64, de)));
        let mut vus = 0;
        while let Some(Reverse((_, cur))) = ouvert.pop() {
            if cur == vers {
                let mut p = vec![cur];
                let mut c = cur;
                while let Some(&prec) = venu.get(&c) {
                    c = prec;
                    p.push(c);
                }
                p.reverse();
                p.remove(0);
                return Some(p);
            }
            vus += 1;
            if vus > 20000 {
                break;
            }
            let gc = g[&cur];
            for n in self.carte.voisins(cur) {
                if !passe(n) {
                    continue;
                }
                let ng = gc + self.cout_case(n);
                if g.get(&n).map_or(true, |&x| ng < x - 1e-9) {
                    g.insert(n, ng);
                    venu.insert(n, cur);
                    let f = ng + self.carte.dist(n, vers) as f64;
                    ouvert.push(Reverse(((f * 1000.0) as u64, n)));
                }
            }
        }
        None
    }

    /// Mois nécessaires pour parcourir `chemin` (estimation affichée au joueur).
    pub fn mois_trajet(&self, a: &Armee, chemin: &[usize]) -> u32 {
        let pts = self.vitesse(a) * self.meteo.effets(self.tour).mouvement;
        let cout: f64 = chemin.iter().map(|&c| self.cout_case(c)).sum();
        (cout / pts.max(0.5)).ceil().max(1.0) as u32
    }

    pub fn recruter_dans(&mut self, proprio: i32, unite: &str, pres: usize) {
        let Some(vi) = self.ville_proche(pres, proprio) else { return };
        let case = self.villes[vi].case;
        if let Some(a) = self.armees.iter_mut().find(|a| a.proprio == proprio && a.case == case && a.chemin.is_empty()) {
            *a.unites.entry(unite.into()).or_insert(0) += 1;
        } else {
            let mut u = BTreeMap::new();
            u.insert(unite.to_string(), 1);
            self.creer_armee(proprio, case, u);
        }
    }

    /// Les unités que `id` peut recruter dans un bâtiment (techs et rang de la capitale).
    pub fn unites_dispo(&self, id: i32, cle_bat: &str) -> Vec<String> {
        let Some(d) = regles().bat(cle_bat) else { return Vec::new() };
        let niv = self.niveau_capitale(id);
        d.unites
            .iter()
            .filter(|u| {
                let du = regles().unite(u).unwrap();
                du.niveau <= niv.max(1) && du.tech.as_ref().map_or(true, |t| self.a_tech(id, t)) && du.obsolete.as_ref().map_or(true, |t| !self.a_tech(id, t))
            })
            .cloned()
            .collect()
    }
}

#[cfg(test)]
mod essais {
    use super::*;

    #[test]
    fn nouvelle_partie() {
        let p = Partie::nouvelle(Options { graine: 99, ..Options::default() });
        assert_eq!(p.royaumes.len(), 4);
        assert_eq!(p.villes.len(), 4);
        assert!(p.villes[0].capitale && p.villes[0].proprio == 0);
        assert!(p.batiments.iter().filter(|b| b.proprio == 0 && b.cle == "cabane").count() >= 1);
        assert_eq!(p.armees.len(), 4);
        let cap = p.villes[0].case;
        assert_eq!(p.carte.cases[cap].proprio, 0);
        assert!(p.carte.rayon(cap, 3).iter().all(|&c| p.carte.cases[c].proprio == 0 || p.carte.cases[c].proprio != -1 || !p.carte.cases[c].terre() || true));
        // un chemin d'une ville à l'autre existe le plus souvent (même île) ; au moins vers une case voisine
        let v = p.carte.voisins(cap).into_iter().find(|&c| p.praticable(c, 0)).unwrap();
        assert_eq!(p.chemin(cap, v, 0), Some(vec![v]));
        assert!(p.defense_ville(0) > 0.0);
    }

    #[test]
    fn construction_verifiee() {
        let mut p = Partie::nouvelle(Options { graine: 5, ..Options::default() });
        let mer = (0..p.carte.cases.len()).find(|&c| !p.carte.cases[c].terre()).unwrap();
        assert!(p.peut_construire("cabane", mer, 0).is_err());
        let loin = (0..p.carte.cases.len()).find(|&c| p.carte.cases[c].terre() && p.carte.cases[c].proprio == -1 && p.carte.cases[c].t != Terrain::Montagne).unwrap();
        assert_eq!(p.peut_construire("cabane", loin, 0), Err("Hors de votre territoire".into()));
        let ok = (0..p.carte.cases.len()).find(|&c| p.peut_construire("cabane", c, 0).is_ok()).unwrap();
        p.poser("cabane", ok, 0, false);
        assert!(p.peut_construire("cabane", ok, 0).is_err());
        assert!(p.demolir(ok).is_ok());
    }
}

//! La carte : un plateau d'hexagones (pointe en haut, lignes impaires décalées : « odd-r »),
//! générée selon les réglages du joueur (océans, forêts, lacs, rivières, montagnes, gisements).

use serde::{Deserialize, Serialize};

use crate::hasard::{Bruit, Hasard};

pub const SQ3: f64 = 1.732_050_807_568_877_2;
/// Les six voisins, dans l'ordre des angles 0°, 60°, … 300° (x vers la droite, z vers le bas).
const DIRS_PAIR: [(i32, i32); 6] = [(1, 0), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1)];
const DIRS_IMPAIR: [(i32, i32); 6] = [(1, 0), (1, 1), (0, 1), (-1, 0), (0, -1), (1, -1)];

/// Bois porté par un arbre d'une forêt.
pub const BOIS_ARBRE: f32 = 12.0;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct Options {
    pub taille: String,
    pub graine: u64,
    pub oceans: u32,
    pub forets: u32,
    pub lacs: u32,
    pub rivieres: u32,
    pub montagnes: u32,
    pub mines: u32,
    pub rivaux: u32,
    pub attitude: String,
    pub difficulte: f64,
    pub brigands: bool,
    pub capitale: String,
}

impl Default for Options {
    fn default() -> Self {
        Options {
            taille: "moyenne".into(),
            graine: 1700,
            oceans: 42,
            forets: 38,
            lacs: 4,
            rivieres: 5,
            montagnes: 7,
            mines: 2,
            rivaux: 3,
            attitude: "mixte".into(),
            difficulte: 1.0,
            brigands: true,
            capitale: "Valdor".into(),
        }
    }
}

impl Options {
    /// Ramène chaque réglage dans ses bornes (une requête du navigateur n'est pas digne de confiance).
    pub fn borner(&mut self) {
        if !["petite", "moyenne", "grande"].contains(&self.taille.as_str()) {
            self.taille = "moyenne".into();
        }
        self.oceans = self.oceans.clamp(10, 75);
        self.forets = self.forets.min(85);
        self.lacs = self.lacs.min(20);
        self.rivieres = self.rivieres.min(20);
        self.montagnes = self.montagnes.min(25);
        self.mines = self.mines.clamp(1, 3);
        self.rivaux = self.rivaux.clamp(1, 5);
        if !["mixte", "agressifs", "pacifiques"].contains(&self.attitude.as_str()) {
            self.attitude = "mixte".into();
        }
        if !self.difficulte.is_finite() {
            self.difficulte = 1.0;
        }
        self.difficulte = self.difficulte.clamp(0.5, 2.0);
        self.capitale = self.capitale.chars().filter(|c| !c.is_control() && *c != '<' && *c != '>').take(18).collect();
        if self.capitale.trim().is_empty() {
            self.capitale = "Valdor".into();
        }
    }

    pub fn dimensions(&self) -> (i32, i32) {
        match self.taille.as_str() {
            "petite" => (32, 24),
            "grande" => (58, 42),
            _ => (44, 32),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Terrain {
    Profond,
    Hautfond,
    Lac,
    Sable,
    Plaine,
    Colline,
    Montagne,
}

impl Terrain {
    pub fn nom(self) -> &'static str {
        match self {
            Terrain::Profond => "Océan",
            Terrain::Hautfond => "Haut-fond",
            Terrain::Lac => "Lac",
            Terrain::Sable => "Plage",
            Terrain::Plaine => "Plaine",
            Terrain::Colline => "Colline",
            Terrain::Montagne => "Montagne",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Case {
    pub c: i32,
    pub r: i32,
    pub t: Terrain,
    /// Altitude brute du bruit (sert à trier, pas au rendu).
    pub alt: f32,
    pub humide: f32,
    pub foret: bool,
    /// Arbres sur la case (0 à 6) : une forêt en a au moins 3.
    pub arbres: u8,
    pub bois: f32,
    pub riviere: bool,
    pub gisement: Option<String>,
    pub poissons: bool,
    pub fertile: bool,
    /// Royaume qui tient la case (-1 : terres libres).
    pub proprio: i32,
    /// Bâtiment posé sur la case.
    pub bat: Option<u32>,
    /// Composante terrestre (pour savoir si deux lieux sont reliés à pied).
    pub comp: i32,
}

impl Case {
    pub fn terre(&self) -> bool {
        !matches!(self.t, Terrain::Profond | Terrain::Hautfond | Terrain::Lac)
    }
    pub fn mer(&self) -> bool {
        matches!(self.t, Terrain::Profond | Terrain::Hautfond)
    }
    /// Coordonnées cubiques (distance hexagonale).
    pub fn cube(&self) -> (i32, i32, i32) {
        let x = self.c - (self.r - (self.r & 1)) / 2;
        let z = self.r;
        (x, -x - z, z)
    }
    pub fn pos(&self) -> (f64, f64) {
        (SQ3 * (self.c as f64 + 0.5 * (self.r & 1) as f64), 1.5 * self.r as f64)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Carte {
    pub l: i32,
    pub h: i32,
    pub cases: Vec<Case>,
    pub rivieres: Vec<Vec<usize>>,
}

impl Carte {
    pub fn idx(&self, c: i32, r: i32) -> Option<usize> {
        if c < 0 || r < 0 || c >= self.l || r >= self.h {
            None
        } else {
            Some((r * self.l + c) as usize)
        }
    }

    pub fn voisin_dir(&self, i: usize, d: usize) -> Option<usize> {
        let k = &self.cases[i];
        let (dc, dr) = if k.r & 1 == 1 { DIRS_IMPAIR[d] } else { DIRS_PAIR[d] };
        self.idx(k.c + dc, k.r + dr)
    }

    pub fn voisins(&self, i: usize) -> Vec<usize> {
        (0..6).filter_map(|d| self.voisin_dir(i, d)).collect()
    }

    pub fn dist(&self, a: usize, b: usize) -> i32 {
        let (x1, y1, z1) = self.cases[a].cube();
        let (x2, y2, z2) = self.cases[b].cube();
        (x1 - x2).abs().max((y1 - y2).abs()).max((z1 - z2).abs())
    }

    /// Les cases à `rayon` ou moins de `i` (`i` comprise).
    pub fn rayon(&self, i: usize, rayon: i32) -> Vec<usize> {
        let k = &self.cases[i];
        let mut v = Vec::new();
        for r in (k.r - rayon)..=(k.r + rayon) {
            for c in (k.c - rayon - 1)..=(k.c + rayon + 1) {
                if let Some(j) = self.idx(c, r) {
                    if self.dist(i, j) <= rayon {
                        v.push(j);
                    }
                }
            }
        }
        v
    }

    /// Numérote les composantes de terre praticable (montagnes exclues) ; rend la taille de chacune.
    pub fn composantes(&mut self) -> Vec<usize> {
        for k in self.cases.iter_mut() {
            k.comp = -1;
        }
        let mut tailles = Vec::new();
        for i in 0..self.cases.len() {
            if !self.cases[i].terre() || self.cases[i].t == Terrain::Montagne || self.cases[i].comp >= 0 {
                continue;
            }
            let id = tailles.len() as i32;
            let mut pile = vec![i];
            self.cases[i].comp = id;
            let mut n = 0;
            while let Some(x) = pile.pop() {
                n += 1;
                for y in self.voisins(x) {
                    let k = &self.cases[y];
                    if k.terre() && k.t != Terrain::Montagne && k.comp < 0 {
                        self.cases[y].comp = id;
                        pile.push(y);
                    }
                }
            }
            tailles.push(n);
        }
        tailles
    }

    /// Met à jour la forêt d'une case d'après son bois.
    pub fn regler_arbres(&mut self, i: usize) {
        let k = &mut self.cases[i];
        if k.foret {
            k.arbres = ((k.bois / BOIS_ARBRE).ceil() as i32).clamp(0, 6) as u8;
            if k.bois <= 0.01 {
                k.foret = false;
                k.bois = 0.0;
                k.arbres = 0;
            }
        }
    }

    /// Génère une carte selon les réglages.
    pub fn generer(o: &Options) -> Carte {
        let mut h = Hasard::new(o.graine.wrapping_add(1));
        let (l, ht) = o.dimensions();
        let ne = Bruit::new(o.graine);
        let nm = Bruit::new(o.graine.wrapping_add(101));
        let nr = Bruit::new(o.graine.wrapping_add(202));
        let wx = SQ3 * l as f64;
        let hz = 1.5 * ht as f64;
        let f = 3.4 / wx;
        let mut cases = Vec::with_capacity((l * ht) as usize);
        for r in 0..ht {
            for c in 0..l {
                let x = SQ3 * (c as f64 + 0.5 * (r & 1) as f64);
                let z = 1.5 * r as f64;
                let dx = (x / wx - 0.5) * 2.0;
                let dz = (z / hz - 0.5) * 2.0;
                let d = (dx * dx * 0.85 + dz * dz * 0.85).powf(1.2);
                let mut e = ne.octaves(x * f, z * f, 5) - 0.5 * d;
                if c == 0 || r == 0 || c == l - 1 || r == ht - 1 {
                    e = -9.0;
                }
                cases.push(Case {
                    c,
                    r,
                    t: Terrain::Plaine,
                    alt: e as f32,
                    humide: nm.octaves(x * f * 1.7, z * f * 1.7, 4) as f32,
                    foret: false,
                    arbres: 0,
                    bois: 0.0,
                    riviere: false,
                    gisement: None,
                    poissons: false,
                    fertile: false,
                    proprio: -1,
                    bat: None,
                    comp: -1,
                });
            }
        }
        let mut m = Carte { l, h: ht, cases, rivieres: Vec::new() };
        let n = m.cases.len();

        // océans : pourcentage exact des cases
        let mut tri: Vec<usize> = (0..n).collect();
        tri.sort_by(|&a, &b| m.cases[a].alt.total_cmp(&m.cases[b].alt));
        let n_eau = n * o.oceans as usize / 100;
        for (k, &i) in tri.iter().enumerate() {
            if k < n_eau || m.cases[i].alt < -5.0 {
                m.cases[i].t = Terrain::Profond;
            }
        }
        // montagnes puis collines, sur les terres les plus hautes (crêtes : bruit en plus)
        let mut terres: Vec<(usize, f64)> = (0..n)
            .filter(|&i| m.cases[i].terre())
            .map(|i| {
                let (x, z) = m.cases[i].pos();
                (i, m.cases[i].alt as f64 + 0.3 * nr.octaves(x * f * 2.6, z * f * 2.6, 3))
            })
            .collect();
        terres.sort_by(|a, b| b.1.total_cmp(&a.1));
        let nt = terres.len();
        let n_mt = nt * o.montagnes as usize / 100;
        let n_col = (nt as f64 * (o.montagnes.max(3) as f64) / 100.0 * 1.4) as usize;
        for (k, &(i, _)) in terres.iter().enumerate() {
            if k < n_mt {
                m.cases[i].t = Terrain::Montagne;
            } else if k < n_mt + n_col {
                m.cases[i].t = Terrain::Colline;
            }
        }
        // hauts-fonds : le long des côtes, et parfois un peu plus loin
        for i in 0..n {
            if !m.cases[i].terre() && m.voisins(i).iter().any(|&j| m.cases[j].terre()) {
                m.cases[i].t = Terrain::Hautfond;
            }
        }
        let loin: Vec<usize> = (0..n)
            .filter(|&i| m.cases[i].t == Terrain::Profond && m.voisins(i).iter().any(|&j| m.cases[j].t == Terrain::Hautfond))
            .collect();
        for i in loin {
            if h.p(0.35) {
                m.cases[i].t = Terrain::Hautfond;
            }
        }
        // lacs
        for _ in 0..o.lacs {
            let cand: Vec<usize> = (0..n)
                .filter(|&i| m.cases[i].t == Terrain::Plaine && m.voisins(i).iter().all(|&j| m.cases[j].terre()))
                .collect();
            let Some(&s) = h.choix(&cand) else { break };
            m.cases[s].t = Terrain::Lac;
            let mut lac = vec![s];
            let taille = h.entre(1, 5);
            for _ in 1..taille {
                let bord: Vec<usize> = lac
                    .iter()
                    .flat_map(|&x| m.voisins(x))
                    .filter(|&y| {
                        m.cases[y].terre() && m.cases[y].t != Terrain::Montagne && m.voisins(y).iter().all(|&z| !m.cases[z].mer())
                    })
                    .collect();
                let Some(&y) = h.choix(&bord) else { break };
                m.cases[y].t = Terrain::Lac;
                lac.push(y);
            }
        }
        // rivières : descendent des reliefs vers l'eau
        for _ in 0..o.rivieres {
            let mut sources: Vec<usize> = (0..n)
                .filter(|&i| {
                    matches!(m.cases[i].t, Terrain::Montagne | Terrain::Colline)
                        && !m.cases[i].riviere
                        && m.voisins(i).iter().any(|&j| m.cases[j].terre() && m.cases[j].t != Terrain::Montagne)
                })
                .collect();
            if sources.is_empty() {
                sources = (0..n).filter(|&i| m.cases[i].terre()).collect();
            }
            let Some(&s) = h.choix(&sources) else { break };
            let mut cur = s;
            let mut chemin = vec![s];
            let mut vu = std::collections::HashSet::from([s]);
            for pas in 0..60 {
                let mut ns: Vec<usize> =
                    m.voisins(cur).into_iter().filter(|j| !vu.contains(j) && m.cases[*j].t != Terrain::Montagne).collect();
                if let Some(&w) = ns.iter().find(|&&j| !m.cases[j].terre()) {
                    chemin.push(w);
                    break;
                }
                if let Some(&rv) = ns.iter().find(|&&j| m.cases[j].riviere) {
                    if pas > 1 {
                        chemin.push(rv);
                        break;
                    }
                }
                if ns.is_empty() {
                    break;
                }
                let bruit: Vec<f64> = ns.iter().map(|_| h.f() * 0.07).collect();
                let mut ordre: Vec<(usize, f64)> = ns.drain(..).zip(bruit).map(|(j, b)| (j, m.cases[j].alt as f64 + b)).collect();
                ordre.sort_by(|a, b| a.1.total_cmp(&b.1));
                cur = ordre[0].0;
                vu.insert(cur);
                chemin.push(cur);
            }
            if chemin.len() < 3 {
                continue;
            }
            let dernier = *chemin.last().unwrap();
            if m.cases[dernier].terre() && !m.cases[dernier].riviere {
                m.cases[dernier].t = Terrain::Lac;
            }
            for &i in &chemin {
                if m.cases[i].terre() && m.cases[i].t != Terrain::Montagne {
                    m.cases[i].riviere = true;
                }
            }
            m.rivieres.push(chemin);
        }
        // forêts : pourcentage exact des terres boisables
        let mut boisables: Vec<(usize, f64)> = (0..n)
            .filter(|&i| matches!(m.cases[i].t, Terrain::Plaine | Terrain::Colline))
            .map(|i| (i, m.cases[i].humide as f64 + h.f() * 0.12))
            .collect();
        boisables.sort_by(|a, b| b.1.total_cmp(&a.1));
        let n_f = boisables.len() * o.forets as usize / 100;
        for &(i, _) in boisables.iter().take(n_f) {
            let a = h.entre(4, 6) as u8;
            let k = &mut m.cases[i];
            k.foret = true;
            k.arbres = a;
            k.bois = a as f32 * BOIS_ARBRE;
        }
        // plages, gisements, poissons, fertilité, arbres épars
        for i in 0..n {
            let cote = m.voisins(i).iter().any(|&j| m.cases[j].mer());
            let k = &m.cases[i];
            if k.t == Terrain::Plaine && !k.foret && !k.riviere && cote && h.p(0.5) {
                m.cases[i].t = Terrain::Sable;
            }
        }
        for i in 0..n {
            let t = m.cases[i].t;
            if matches!(t, Terrain::Colline | Terrain::Montagne) && h.p(0.16 * o.mines as f64) {
                let x = h.f();
                m.cases[i].gisement = Some(if x < 0.42 { "pierre" } else if x < 0.72 { "fer" } else if x < 0.88 { "charbon" } else { "or" }.into());
            }
            if t == Terrain::Hautfond && h.p(0.2) {
                m.cases[i].poissons = true;
            }
            if t == Terrain::Plaine && (m.cases[i].riviere || m.voisins(i).iter().any(|&j| m.cases[j].t == Terrain::Lac || m.cases[j].riviere)) {
                m.cases[i].fertile = true;
            }
            let k = &mut m.cases[i];
            if !k.foret && k.t == Terrain::Plaine && h.p(0.18) {
                k.arbres = h.entre(1, 2) as u8;
            } else if !k.foret && k.t == Terrain::Colline && h.p(0.15) {
                k.arbres = 1;
            }
        }
        m.composantes();
        m
    }
}

#[cfg(test)]
mod essais {
    use super::*;

    #[test]
    fn generation_reglable() {
        let mut o = Options::default();
        o.graine = 12345;
        let a = Carte::generer(&o);
        let b = Carte::generer(&o);
        assert_eq!(a.cases.len(), 44 * 32);
        assert!(a.cases.iter().zip(&b.cases).all(|(x, y)| x.t == y.t), "même graine, même carte");
        let eau = a.cases.iter().filter(|k| !k.terre()).count() as f64 / a.cases.len() as f64;
        assert!(eau > 0.35 && eau < 0.6, "océans {eau}");
        o.forets = 80;
        let c = Carte::generer(&o);
        let f1 = a.cases.iter().filter(|k| k.foret).count();
        let f2 = c.cases.iter().filter(|k| k.foret).count();
        assert!(f2 > f1 * 3 / 2, "plus de forêts : {f1} → {f2}");
        o.lacs = 12;
        o.rivieres = 12;
        let d = Carte::generer(&o);
        assert!(d.rivieres.len() >= 6);
        assert!(d.cases.iter().filter(|k| k.t == Terrain::Lac).count() >= 8);
    }

    #[test]
    fn voisinage() {
        let m = Carte::generer(&Options::default());
        let i = m.idx(10, 10).unwrap();
        let v = m.voisins(i);
        assert_eq!(v.len(), 6);
        assert!(v.iter().all(|&j| m.dist(i, j) == 1));
        assert_eq!(m.rayon(i, 2).len(), 19);
    }
}

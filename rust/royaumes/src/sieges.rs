//! Les sièges : une ville ennemie fortifiée ne tombe pas d'un coup. Les murs s'usent sous le canon
//! et la sape, les vivres s'épuisent, la garnison fond ; la ville se rend, à moins qu'un assaut
//! ne l'emporte ou qu'une armée de secours ne chasse les assiégeants.

use crate::meteo::Effets;
use crate::partie::{Combat, Partie, Rapport, Siege};
use crate::regles::regles;

impl Partie {
    /// Les murs d'une ville : tours et citadelles proches (leur défense) et bastions Vauban.
    /// Zéro : la ville n'est pas fortifiée, elle se prend d'une bataille.
    pub fn murs_ville(&self, vi: usize) -> f64 {
        let v = &self.villes[vi];
        let rs = &regles().siege;
        let mut m = 0.0;
        for b in self.batiments.iter().filter(|b| b.proprio == v.proprio && b.fini()) {
            let d = regles().bat(&b.cle).unwrap();
            let dd = self.carte.dist(b.case, v.case);
            if d.defense > 0.0 && dd <= 4 {
                m += d.defense;
            }
            if d.rempart && dd <= 3 {
                m += rs.rempart;
            }
        }
        if self.a_tech(v.proprio, "vauban") {
            m *= rs.vauban_defense;
        }
        m.round()
    }

    pub fn siege_de(&self, ville: u32) -> Option<usize> {
        self.sieges.iter().position(|s| s.ville == ville)
    }

    /// Une armée qui assiège : elle ne rentre pas à la maison.
    pub fn assiege(&self, proprio: i32, case: usize) -> bool {
        self.sieges.iter().any(|s| s.assiegeant == proprio && s.case == case)
    }

    /// L'armée `id` arrive devant la ville fortifiée `vi` : le siège commence (ou elle s'y joint).
    pub fn commencer_siege(&mut self, id: u32, vi: usize, rapport: &mut Rapport) {
        let Some(i) = self.armee(id) else { return };
        self.armees[i].chemin.clear();
        let pr = self.armees[i].proprio;
        let v = self.villes[vi].clone();
        if self.siege_de(v.id).is_some() {
            return;
        }
        let rs = &regles().siege;
        let murs = self.murs_ville(vi);
        let greniers = self.batiments.iter().filter(|b| b.proprio == v.proprio && b.cle == "grenier" && b.fini() && b.ville == Some(v.id)).count() as f64;
        let vivres = rs.vivres_base + rs.vivres_grenier * greniers + v.niveau as f64;
        self.sieges.push(Siege { ville: v.id, case: v.case, assiegeant: pr, murs, murs_max: murs, vivres, ..Default::default() });
        if pr == 0 || v.proprio == 0 {
            let qui = self.nom_royaume(pr);
            self.evt(rapport, format!("🏰 Siège de {} : {qui} investit la place (murs {murs}, {vivres} mois de vivres)", v.nom), if pr == 0 { "info" } else { "guerre" }, Some(v.case));
        }
    }

    /// Forces d'un assaut : les assiégeants contre la garnison et la ville, selon l'état des murs et la faim.
    pub fn forces_assaut(&self, s: &Siege, tir: f64) -> (f64, f64) {
        let Some(vi) = self.villes.iter().position(|v| v.id == s.ville) else { return (1.0, 1.0) };
        let pr = self.villes[vi].proprio;
        let at: f64 = self.armees.iter().filter(|a| a.proprio == s.assiegeant && a.case == s.case).map(|a| self.attaque(a, true, tir)).sum();
        let garnison: f64 = self.armees.iter().filter(|a| a.proprio == pr && a.case == s.case).map(|a| self.defense(a)).sum();
        let murs = if s.murs_max > 0.0 { s.murs / s.murs_max } else { 0.0 };
        let faim = (1.0 - s.faim as f64 * regles().siege.faim).max(0.3);
        let de = (garnison + self.defense_ville(vi)) * (0.4 + 0.6 * murs) * faim;
        (at.max(1.0), de.max(1.0))
    }

    /// Le mois des sièges : assauts ordonnés, usure des murs, vivres, garnison ; reddition.
    pub fn sieges_mois(&mut self, eff: &Effets, rapport: &mut Rapport) {
        let rs = &regles().siege;
        let villes: Vec<u32> = self.sieges.iter().map(|s| s.ville).collect();
        for vid in villes {
            let Some(si) = self.siege_de(vid) else { continue };
            let s = self.sieges[si].clone();
            let Some(vi) = self.villes.iter().position(|v| v.id == vid) else {
                self.sieges.remove(si);
                continue;
            };
            let v = self.villes[vi].clone();
            let implique = v.proprio == 0 || s.assiegeant == 0;
            let assiegeants: Vec<u32> = self.armees.iter().filter(|a| a.proprio == s.assiegeant && a.case == s.case).map(|a| a.id).collect();
            if assiegeants.is_empty() || !self.est_ennemi(s.assiegeant, v.proprio) {
                self.sieges.remove(si);
                if implique {
                    self.evt(rapport, format!("🏳️ Le siège de {} est levé.", v.nom), if v.proprio == 0 { "bon" } else { "info" }, Some(v.case));
                }
                continue;
            }
            if s.assaut {
                self.sieges[si].assaut = false;
                if self.assaut(vid, eff, rapport) {
                    continue;
                }
            }
            let Some(si) = self.siege_de(vid) else { continue };
            // des assiégeants bien trop faibles (un éclaireur, une troupe décimée) sont dispersés par une sortie
            let (at, de) = self.forces_assaut(&self.sieges[si], eff.tir);
            if de > 3.0 * at {
                for a in &assiegeants {
                    self.detruire_armee(*a);
                }
                self.sieges.remove(si);
                if implique {
                    self.evt(rapport, format!("🛡️ La garnison de {} fait une sortie et disperse les assiégeants !", v.nom), if v.proprio == 0 { "bon" } else { "guerre" }, Some(v.case));
                }
                continue;
            }
            // les murs s'usent : sape et tranchées (Vauban), artillerie (Gribeauval)
            let artillerie: f64 = self.armees.iter().filter(|a| a.proprio == s.assiegeant && a.case == s.case).flat_map(|a| a.unites.iter()).filter_map(|(u, &n)| regles().unite(u).map(|d| d.siege * n as f64)).sum();
            let mut usure = rs.tranchees * if self.a_tech(s.assiegeant, "vauban") { rs.vauban_attaque } else { 1.0 }
                + artillerie * rs.artillerie * if self.a_tech(s.assiegeant, "gribeauval") { rs.gribeauval } else { 1.0 };
            if self.a_tech(v.proprio, "vauban") {
                usure /= rs.vauban_defense;
            }
            let s = &mut self.sieges[si];
            s.murs = (s.murs - usure).max(0.0).round();
            s.mois += 1;
            s.vivres -= 1.0;
            if s.vivres < 0.0 {
                s.vivres = 0.0;
                s.faim += 1;
            }
            let s = s.clone();
            // la garnison fond (et plus vite affamée), les assiégeants souffrent du camp
            let garnison: Vec<u32> = self.armees.iter().filter(|a| a.proprio == v.proprio && a.case == s.case).map(|a| a.id).collect();
            for g in &garnison {
                self.pertes(*g, rs.usure_garnison + if s.faim > 0 { rs.faim } else { 0.0 });
            }
            for a in &assiegeants {
                self.pertes(*a, rs.usure_assiegeant);
            }
            if s.faim > 0 && v.proprio == 0 {
                let j = &mut self.royaumes[0];
                j.bonheur = (j.bonheur - 3.0).max(0.0);
                j.pop = (j.pop - (j.pop as f64 * 0.02).ceil() as i64).max(1);
            }
            let reste_garnison: u32 = self.armees.iter().filter(|a| a.proprio == v.proprio && a.case == s.case).map(|a| a.effectif()).sum();
            if s.faim >= rs.reddition_faim || (s.murs <= 0.0 && (s.faim > 0 || reste_garnison == 0)) {
                for g in garnison {
                    self.detruire_armee(g);
                }
                if implique {
                    self.evt(rapport, format!("🏳️ {} capitule après {} mois de siège !", v.nom, s.mois), if s.assiegeant == 0 { "bon" } else { "guerre" }, Some(v.case));
                }
                if self.armees.iter().any(|a| a.proprio == s.assiegeant && a.case == s.case) {
                    self.prise(vi, s.assiegeant, rapport);
                }
            } else if implique {
                let pct = if s.murs_max > 0.0 { (s.murs / s.murs_max * 100.0).round() } else { 0.0 };
                let faim = if s.faim > 0 { format!(", la ville a faim depuis {} mois", s.faim) } else { format!(", {} mois de vivres", s.vivres) };
                self.evt(rapport, format!("🏰 Siège de {} ({} mois) : murs à {pct} %{faim}", v.nom, s.mois), "info", Some(v.case));
            }
        }
    }

    /// L'assaut sur la ville assiégée `vid` ; rend vrai si la ville est prise.
    fn assaut(&mut self, vid: u32, eff: &Effets, rapport: &mut Rapport) -> bool {
        let Some(si) = self.siege_de(vid) else { return false };
        let s = self.sieges[si].clone();
        let Some(vi) = self.villes.iter().position(|v| v.id == vid) else { return false };
        let v = self.villes[vi].clone();
        let (at, de) = self.forces_assaut(&s, eff.tir);
        let r = at / (at + de) * (0.85 + self.hasard.f() * 0.3);
        let assiegeants: Vec<u32> = self.armees.iter().filter(|a| a.proprio == s.assiegeant && a.case == s.case).map(|a| a.id).collect();
        let garnison: Vec<u32> = self.armees.iter().filter(|a| a.proprio == v.proprio && a.case == s.case).map(|a| a.id).collect();
        let (na, nd) = (self.nom_royaume(s.assiegeant), self.nom_royaume(v.proprio));
        let implique = v.proprio == 0 || s.assiegeant == 0;
        if r > 0.5 {
            for a in &assiegeants {
                self.pertes(*a, (de / at * 0.6).clamp(0.1, 0.85));
            }
            for g in garnison {
                self.detruire_armee(g);
            }
            let texte = format!("⚔️ Assaut victorieux de {na} sur {}", v.nom);
            rapport.combats.push(Combat { case: v.case, attaquant: s.assiegeant, defenseur: v.proprio, vainqueur: s.assiegeant, texte: texte.clone(), etape: 0 });
            if implique {
                self.evt(rapport, texte, if s.assiegeant == 0 { "bon" } else { "guerre" }, Some(v.case));
            }
            if self.armees.iter().any(|a| a.proprio == s.assiegeant && a.case == s.case) {
                self.prise(vi, s.assiegeant, rapport);
                return true;
            }
            false
        } else {
            for a in &assiegeants {
                self.pertes(*a, (de / at * 0.5).clamp(0.25, 0.9));
            }
            for g in &garnison {
                self.pertes(*g, (at / de * 0.3).clamp(0.05, 0.5));
            }
            let texte = format!("🛡️ {nd} repousse l'assaut de {na} sur {}", v.nom);
            rapport.combats.push(Combat { case: v.case, attaquant: s.assiegeant, defenseur: v.proprio, vainqueur: v.proprio, texte: texte.clone(), etape: 0 });
            if implique {
                self.evt(rapport, texte, if v.proprio == 0 { "bon" } else { "guerre" }, Some(v.case));
            }
            false
        }
    }
}

#[cfg(test)]
mod essais {
    use super::*;
    use crate::carte::Options;
    use std::collections::BTreeMap;

    /// Le joueur en guerre contre le royaume 1, une armée sur une case voisine de sa capitale.
    fn devant_la_ville(murs: bool) -> (Partie, usize, u32) {
        let mut p = Partie::nouvelle(Options { graine: 31, ..Options::default() });
        p.royaumes[1].statut = "guerre".into();
        let vi = p.villes.iter().position(|v| v.proprio == 1).unwrap();
        let cv = p.villes[vi].case;
        if murs {
            let c = p.carte.rayon(cv, 2).into_iter().find(|&c| p.carte.cases[c].bat.is_none() && p.praticable(c)).unwrap();
            p.poser("remparts", c, 1, true);
        }
        let pres = p.carte.voisins(cv).into_iter().find(|&c| p.praticable(c) && p.carte.cases[c].bat.is_none()).unwrap();
        let mut u = BTreeMap::new();
        u.insert("grenadier".to_string(), 30);
        u.insert("canon".to_string(), 4);
        let id = p.creer_armee(0, pres, u);
        let i = p.armee(id).unwrap();
        p.armees[i].chemin = vec![cv];
        (p, vi, id)
    }

    #[test]
    fn ville_fortifiee_assiegee_puis_prise() {
        let (mut p, vi, _) = devant_la_ville(true);
        assert!(p.murs_ville(vi) >= 40.0);
        let vid = p.villes[vi].id;
        let r = p.fin_du_mois();
        assert_eq!(p.villes[vi].proprio, 1, "la ville ne tombe pas d'un coup");
        let s = &p.sieges[p.siege_de(vid).expect("siège")];
        assert!(s.murs < s.murs_max, "les canons ont entamé les murs");
        assert!(r.evenements.iter().any(|e| e.texte.contains("Siège")));
        // assaut : refusé sans siège, ordonné ici
        assert!(crate::commandes::executer(&mut p, &serde_json::json!({"action": "assaut", "ville": 12345})).is_err());
        assert!(crate::commandes::executer(&mut p, &serde_json::json!({"action": "assaut", "ville": vid})).is_ok());
        for _ in 0..12 {
            p.fin_du_mois();
            if p.villes[vi].proprio == 0 {
                break;
            }
        }
        assert_eq!(p.villes[vi].proprio, 0, "assaut ou reddition : la ville est prise");
        assert!(p.siege_de(vid).is_none());
    }

    #[test]
    fn ville_sans_murs_prise_d_un_coup() {
        let (mut p, vi, _) = devant_la_ville(false);
        p.batiments.retain(|b| !(b.proprio == 1 && matches!(b.cle.as_str(), "tour" | "remparts" | "citadelle")));
        assert_eq!(p.murs_ville(vi), 0.0);
        p.fin_du_mois();
        assert_eq!(p.villes[vi].proprio, 0);
        assert!(p.sieges.is_empty());
    }

    #[test]
    fn un_eclaireur_ne_prend_pas_une_place_forte() {
        let (mut p, vi, id) = devant_la_ville(true);
        let i = p.armee(id).unwrap();
        p.armees[i].unites = BTreeMap::from([("milice".to_string(), 1)]);
        let r = p.fin_du_mois();
        assert!(p.armee(id).is_none() && p.sieges.is_empty(), "une sortie disperse l'éclaireur");
        assert!(r.evenements.iter().any(|e| e.texte.contains("sortie")));
        assert_eq!(p.villes[vi].proprio, 1);
    }

    #[test]
    fn secours_leve_le_siege() {
        let (mut p, vi, id) = devant_la_ville(true);
        let vid = p.villes[vi].id;
        p.fin_du_mois();
        assert!(p.siege_de(vid).is_some());
        // une forte armée de secours arrive et bat les assiégeants
        let i = p.armee(id).unwrap();
        p.armees[i].unites = BTreeMap::from([("milice".to_string(), 2)]);
        let cv = p.villes[vi].case;
        let pres = p.carte.voisins(cv).into_iter().find(|&c| p.praticable(c)).unwrap();
        let sid = p.creer_armee(1, pres, BTreeMap::from([("grenadier".to_string(), 40)]));
        let j = p.armee(sid).unwrap();
        p.armees[j].chemin = vec![cv];
        p.fin_du_mois();
        assert!(p.armee(id).is_none(), "les assiégeants sont battus");
        assert!(p.siege_de(vid).is_none(), "le siège est levé");
        assert_eq!(p.villes[vi].proprio, 1);
    }
}

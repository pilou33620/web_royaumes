//! Banc d'essai de l'interface dans Chromium (format téléphone) : accueil, nouvelle partie, construction,
//! pose d'un bâtiment, plusieurs fins de mois, saisons et météo forcées, vie des quartiers la nuit.
//! Piloté par le protocole DevTools. Le serveur doit tourner (./target/debug/royaumes --no-browser --no-update --local).
//! Captures dans /tmp/royaumes-*.png. Outil de développement : ni dans les archives publiées, ni dans bin/.
//!
//!   cargo run -p navigateur -- [url]      (CHROME=/chemin/vers/chrome pour un navigateur existant)
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread::sleep;
use std::time::Duration;

use anyhow::{bail, Context, Result};
use headless_chrome::browser::tab::point::Point;
use headless_chrome::protocol::cdp::types::Event;
use headless_chrome::protocol::cdp::Emulation;
use headless_chrome::protocol::cdp::Page::CaptureScreenshotFormatOption;
use headless_chrome::{Browser, LaunchOptions, Tab};
use serde_json::Value;

const URL: &str = "http://127.0.0.1:8800/";
const JS_ECRAN: &str = r"(i)=>{const J=window.__jeu;const l=J.carte.l;const c=i%l,r=(i/l)|0;const x=Math.sqrt(3)*(c+0.5*(r&1)),z=1.5*r;
 return [x,z]}";

/// Chromium de Playwright, s'il est là : /opt/pw-browsers/chromium, ou chromium-<révision>/chrome-linux*/chrome.
fn chromium_playwright() -> Option<PathBuf> {
    let base = Path::new("/opt/pw-browsers");
    if base.join("chromium").is_file() {
        return Some(base.join("chromium"));
    }
    let mut dossiers: Vec<PathBuf> = std::fs::read_dir(base)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.starts_with("chromium") && !n.contains("headless")))
        .collect();
    dossiers.sort();
    dossiers
        .iter()
        .rev()
        .flat_map(|d| [d.join("chrome"), d.join("chrome-linux/chrome"), d.join("chrome-linux64/chrome")])
        .find(|p| p.is_file())
}

/// Évalue une expression JavaScript (promesse attendue) et rend sa valeur, transportée en texte JSON.
fn js(tab: &Tab, expr: &str) -> Result<Value> {
    let r = tab.evaluate(&format!("(async()=>JSON.stringify(await ({expr})))()"), true)?;
    match r.value {
        Some(Value::String(t)) => Ok(serde_json::from_str(&t)?),
        None if r.description.is_none() => Ok(Value::Null), // undefined
        _ => bail!("erreur JavaScript : {}\n  dans : {expr}", r.description.unwrap_or_default()),
    }
}

/// Clique au milieu du premier élément visible qui répond au sélecteur et contient le texte, une fois
/// découvert (écran de chargement) et immobile (panneaux qui glissent) ; l'attend jusqu'à 30 s.
fn cliquer(tab: &Tab, css: &str, texte: &str) -> Result<()> {
    let expr = format!(
        "(()=>{{const e=[...document.querySelectorAll({})].find(e=>{{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&e.textContent.includes({})}});\
         if(!e)return null;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return e.contains(document.elementFromPoint(x,y))?[x,y]:null}})()",
        Value::from(css),
        Value::from(texte)
    );
    let mut avant = None;
    for _ in 0..150 {
        let v = js(tab, &expr)?;
        let ici = v[0].as_f64().zip(v[1].as_f64());
        if let (Some((x, y)), true) = (ici, ici == avant) {
            tab.click_point(Point { x, y })?;
            return Ok(());
        }
        avant = ici;
        sleep(Duration::from_millis(200));
    }
    bail!("élément introuvable : {css} « {texte} »")
}

fn capture(tab: &Tab, nom: &str) -> Result<()> {
    let png = tab.capture_screenshot(CaptureScreenshotFormatOption::Png, None, None, true)?;
    std::fs::write(std::env::temp_dir().join(format!("royaumes-{nom}.png")), png)?;
    Ok(())
}

/// Attend la page chargée. Pas wait_until_navigated : une page se charge parfois si vite que
/// l'événement qu'il attend passe avant lui, et il attend alors pour rien.
fn attendre_chargement(tab: &Tab) -> Result<()> {
    for _ in 0..300 {
        let r = tab.evaluate("location.href !== 'about:blank' && document.readyState === 'complete'", false);
        if r.ok().and_then(|o| o.value) == Some(Value::Bool(true)) {
            return Ok(());
        }
        sleep(Duration::from_millis(100));
    }
    bail!("la page ne s'est pas chargée en 30 s")
}

fn attendre(ms: u64) {
    sleep(Duration::from_millis(ms));
}

fn main() -> Result<()> {
    let url = std::env::args().nth(1).unwrap_or_else(|| URL.into());
    // sans CHROME ni Chromium de Playwright : headless_chrome cherche chrome / chromium dans le PATH
    let browser = Browser::new(LaunchOptions {
        path: std::env::var_os("CHROME").map(PathBuf::from).or_else(chromium_playwright),
        sandbox: false,
        enable_gpu: true, // sans --disable-gpu : WebGL par SwiftShader
        args: vec![
            OsStr::new("--use-angle=swiftshader"),
            OsStr::new("--enable-unsafe-swiftshader"),
            OsStr::new("--ignore-gpu-blocklist"),
            // les polices Google ne sont pas chargées : rien à attendre du réseau
            OsStr::new("--host-resolver-rules=MAP fonts.googleapis.com ~NOTFOUND, MAP fonts.gstatic.com ~NOTFOUND"),
        ],
        idle_browser_timeout: Duration::from_secs(600),
        ..LaunchOptions::default()
    })?;
    let tab = browser.wait_for_initial_tab()?;
    // format téléphone : la fenêtre seule ne descend pas sous 500 px de large en mode sans affichage
    tab.call_method(Emulation::SetDeviceMetricsOverride {
        width: 402,
        height: 874,
        device_scale_factor: 1.0,
        mobile: false,
        scale: None,
        screen_width: None,
        screen_height: None,
        position_x: None,
        position_y: None,
        dont_set_visible_size: None,
        screen_orientation: None,
        viewport: None,
        display_feature: None,
        device_posture: None,
    })?;
    let erreurs = Arc::new(Mutex::new(Vec::<String>::new()));
    let e = Arc::clone(&erreurs);
    tab.add_event_listener(Arc::new(move |ev: &Event| {
        let texte = match ev {
            Event::RuntimeExceptionThrown(ev) => {
                let v = serde_json::to_value(&ev.params).unwrap_or_default();
                let d = &v["exceptionDetails"];
                let t = d["exception"]["description"].as_str().or(d["text"].as_str()).unwrap_or("?");
                t.lines().next().unwrap_or("").to_string()
            }
            Event::RuntimeConsoleAPICalled(ev) => {
                let v = serde_json::to_value(&ev.params).unwrap_or_default();
                if v["type"] != "error" {
                    return;
                }
                let args = v["args"].as_array().cloned().unwrap_or_default();
                let t: Vec<String> = args
                    .iter()
                    .map(|a| match &a["value"] {
                        Value::String(s) => s.clone(),
                        Value::Null => a["description"].as_str().unwrap_or("").to_string(),
                        autre => autre.to_string(),
                    })
                    .collect();
                let t = t.join(" ");
                if t.contains("fonts") {
                    return;
                }
                t
            }
            _ => return,
        };
        e.lock().unwrap().push(texte);
    }))?;
    tab.enable_runtime()?;

    tab.navigate_to(&url)
        .with_context(|| format!("{url} ne répond pas : serveur lancé ? (./target/debug/royaumes --no-browser --no-update --local)"))?;
    attendre_chargement(&tab)?;
    attendre(4000);
    capture(&tab, "1-accueil")?;
    cliquer(&tab, "#btn-fonder", "")?;
    attendre(3500);
    capture(&tab, "2-bienvenue")?;
    cliquer(&tab, "#modale-boite button", "")?;
    attendre(1500);
    capture(&tab, "3-depart")?;

    // construire un bûcheron par l'interface
    cliquer(&tab, "#bas .nb", "")?;
    attendre(400);
    cliquer(&tab, ".onglet", "Ressources")?;
    attendre(300);
    capture(&tab, "4-construire")?;
    cliquer(&tab, ".fiche", "Bûcheron")?;
    attendre(1200);
    println!("mode : {}", js(&tab, "window.__jeu.mode && window.__jeu.mode.genre")?);
    let i = js(&tab, "(()=>{const J=window.__jeu;const cap=J.etat.villes.find(v=>v.proprio===0).case;const l=J.carte.l;const d=(a,b)=>{const q=i=>{const c=i%l,r=(i/l)|0;const x=c-(r-(r&1))/2;return[x,-x-r,r]};const A=q(a),B=q(b);return Math.max(...A.map((v,k)=>Math.abs(v-B[k])))};return [...J.mode.cases].sort((a,b)=>d(a,cap)-d(b,cap))[0]})()")?;
    let xz = js(&tab, &format!("({JS_ECRAN})({i})"))?;
    // projection écran via la caméra du module (exposée par un import dynamique)
    let s = js(
        &tab,
        &format!(
            "(async ([x,z,i])=>{{const m=await import('/graphismes/rendu/scene.js');const p=await import('/graphismes/rendu/plateau.js');
       const v=new m.THREE.Vector3(x,p.dessus(i),z).project(m.camera);return [(v.x+1)/2*innerWidth,(1-v.y)/2*innerHeight]}})([{},{},{i}])",
            xz[0], xz[1]
        ),
    )?;
    let (Some(x), Some(y)) = (s[0].as_f64(), s[1].as_f64()) else {
        bail!("projection écran impossible : {s}");
    };
    tab.click_point(Point { x, y })?;
    attendre(1200);
    println!(
        "bâtiments du joueur : {}",
        js(&tab, "window.__jeu.etat.batiments.filter(b=>b.proprio===0).map(b=>b.cle+(b.reste?'*':'')).join(',')")?
    );
    capture(&tab, "5-pose")?;

    // quelques constructions directes puis des mois
    js(&tab, "(async()=>{const api=(await import('/js/api.js')).api;for(const k of ['pecheur','ferme','carriere','scierie','caserne','cabane']){const r=await api.cmd({action:'cases_valides',cle:k});if(r.cases&&r.cases.length)await api.cmd({action:'construire',cle:k,case:r.cases[0]});}})()")?;
    let fermer_modale = "document.querySelector('#modale').classList.contains('ouverte') && document.querySelector('#modale-boite button').click()";
    for _ in 0..3 {
        js(&tab, fermer_modale)?;
        cliquer(&tab, "#fin-tour", "")?;
        attendre(4200);
    }
    capture(&tab, "6-recap")?;
    js(&tab, "document.querySelector('#feuille-fermer').click()")?;

    // avancer vers l'été via l'API puis recharger l'état
    js(&tab, "(async()=>{const api=(await import('/js/api.js')).api;for(let k=0;k<4;k++){const r=await api.finTour();for(const pr of r.etat.propositions)await api.cmd({action:'repondre',proposition:pr.id,accepte:false});}})()")?;
    tab.reload(false, None)?;
    attendre(3500);
    cliquer(&tab, "#btn-reprendre", "")?;
    attendre(3500);
    js(&tab, fermer_modale)?;
    attendre(800);
    capture(&tab, "7-ete")?;

    // météo forcée côté rendu : neige puis orage
    for (g, t) in [("neige", -3), ("orage", 22), ("brouillard", 9)] {
        let (s, sol) = if g == "neige" { (0, 1) } else { (2, 0) };
        js(&tab, &format!("(async()=>{{const m=await import('/graphismes/rendu/meteo.js');const pl=await import('/graphismes/rendu/plateau.js');const s={s};m.appliquerMeteo({{genre:'{g}',temperature:{t},vent:0.7,direction:0.4,pluie:0.8,neige_sol:{sol}}},s);pl.majSaison(s,{sol});}})()"))?;
        attendre(3500);
        capture(&tab, &format!("8-{g}"))?;
    }

    // vie des quartiers : de près sur la capitale, la nuit, les vraies vitres s'allument et le veilleur fait sa ronde
    js(&tab, "(async()=>{const s=await import('/graphismes/rendu/scene.js'),m=await import('/graphismes/rendu/meteo.js');const J=window.__jeu,p=s.posCase(J.etat.villes.find(v=>v.proprio===0).case);s.viser(p.x,p.z,7);m.forcerHeure('nuit');})()")?;
    attendre(3000);
    let q = js(&tab, "(async()=>(await import('/graphismes/rendu/quartiers.js')).etatQuartiers())()")?;
    println!("quartiers : {q}");
    capture(&tab, "8-quartiers-nuit")?;
    if !(q["proches"].as_f64().unwrap_or(0.0) > 0.0 && q["fenetres"].as_f64().unwrap_or(0.0) > 0.0) {
        bail!("la vie des quartiers ne s'est pas installée près de la capitale");
    }
    js(&tab, "(async()=>{const m=await import('/graphismes/rendu/meteo.js');m.forcerHeure(null);})()")?;
    js(&tab, "(async()=>{const m=await import('/graphismes/rendu/scene.js');m.cam.cible=50;})()")?;
    attendre(2500);
    capture(&tab, "9-loin")?;
    let erreurs = erreurs.lock().unwrap();
    println!("erreurs : {:?}", &erreurs[..erreurs.len().min(10)]);
    Ok(())
}

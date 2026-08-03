#!/usr/bin/env node
/**
 * tools/new-entry.mjs — legt eine neue Kopie von werkbank-leer/ als neuen Pool-Einstieg an
 * ("Neues Projekt starten"-Auftrag, @dpa-Plan, s. ARCHITEKTUR.md "Einstiegspunkte (Pool)").
 *
 * Warum ein Node-Skript und kein Panel-Knopf, der das selbst tut: die Werkbank läuft komplett
 * STATISCH (kein Server, kein Backend — s. CLAUDE.md "Starten/Testen", nur
 * `python3 -m http.server` + `tools/build_pages.sh` für GitHub Pages). Ein Klick im Browser
 * kann keinen Ordner auf der Festplatte anlegen. Der Panel-Knopf ("+ Neu" in
 * lib/mainSettings.js, verdrahtet in overcord/werkbank.js + werkbank-leer/werkbank-leer.js)
 * bereitet nur vor (Name abfragen, Kollision prüfen, fertigen Befehl anzeigen + in die
 * Zwischenablage kopieren) — DIESES Skript führt die Kopie tatsächlich aus.
 *
 * Quelle ist AUSSCHLIESSLICH werkbank-leer/ (das neutrale Basis-Scaffold), NIE overcord/ (der
 * volle Baukasten mit Poly-Synth/Stepsequenzer) — s. werkbank-leer/index.html-Kopf: "Aus
 * diesem Ordner heraus kopiert @dpa künftig neue Projekte".
 *
 * Aufruf:
 *   node tools/new-entry.mjs "<Name>" [--publish]
 *
 * <Name> wird über lib/slugify.js (GETEILT mit dem Panel-Trigger, damit beide Seiten
 * garantiert denselben Ordnernamen berechnen) zu einem Ordner-Slug normalisiert.
 *
 * --publish (Opt-in, @dpa 20260803): trägt den neuen Einstieg zusätzlich in die Landing-Page
 * (index.html) + die "Einstiegspunkte (Pool)"-Tabelle in ARCHITEKTUR.md ein. OHNE --publish
 * bleibt der neue Einstieg unsichtbar (nur per direkter URL /<slug>/ erreichbar) — neue
 * Projekte landen also NICHT automatisch auf der Landing-Page, bis das ausdrücklich gewünscht
 * ist.
 *
 * Staged die neuen/geänderten Dateien automatisch per `git add` (@dpa ddw.md 20260803-Rebuild:
 * die alte Fassung verlangte "danach git add/commit nicht vergessen" von der/dem Bedienenden —
 * "das kann man keinem User anbieten". `git add` lässt sich automatisieren, OHNE die
 * Commit-Entscheidung wegzunehmen: NUR staging, NIEMALS ein `git commit` — das bleibt bewusst
 * @dpas eigener Schritt (Commit-Message, Zeitpunkt). tools/build_pages.sh baut die
 * GitHub-Pages-Seite per `git archive` aus dem COMMITTETEN Stand; ein nicht committeter Ordner
 * deployt also weiterhin nicht mit, aber "git add vergessen" als Fehlerquelle ist raus.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { slugify, isReservedSlug } from '../lib/slugify.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC_DIR = path.join(ROOT, 'werkbank-leer');
const SRC_HTML = 'index.html';
const SRC_JS = 'werkbank-leer.js';

// project-root.txt selbst aktuell halten (self-healing, @dpa ddw.md 20260803-Bugfix "relativer
// Pfad im kopierten Terminalbefehl"): der Panel-Trigger (lib/newEntryFlow.js) liest daraus den
// ABSOLUTEN Projekt-Pfad, um einen cwd-UNABHÄNGIGEN Befehl zu bauen (`node "<root>/tools/
// new-entry.mjs" "<Name>"` — funktioniert egal, in welchem Ordner das Terminal gerade steht,
// weil ROOT oben bereits unabhängig vom cwd über import.meta.url aufgelöst wird). EINE Quelle
// statt eines von Hand gepflegten Werts: bei jedem Lauf hier neu geschrieben — verschiebt/klont
// @dpa den Projektordner, korrigiert sich die Datei beim nächsten new-entry.mjs-Lauf von selbst.
try { fs.writeFileSync(path.join(ROOT, 'project-root.txt'), ROOT + '\n'); } catch { /* nicht kritisch — Panel-Trigger fällt auf Fehlertext zurück */ }

function fail(msg) {
    console.error(`new-entry: ${msg}`);
    process.exit(1);
}

const rawName = process.argv[2];
const publish = process.argv.includes('--publish');

if (!rawName || rawName.startsWith('--')) {
    fail('Name fehlt. Aufruf: node tools/new-entry.mjs "<Name>" [--publish]');
}

// Verschachtelte Slugs sind verboten (s. lib/slugify.js-Kopf): die Kopie unterstützt nur EINE
// Verzeichnistiefe wie werkbank-leer/ (../css/, ../lib/ als relative Pfade) — ein Unterordner
// im Namen würde diese Pfade stillschweigend falsch machen. Diese Prüfung läuft VOR dem
// Normalisieren, weil slugify() jeden Trenner klaglos zu '-' machen würde (das würde den
// Fehler verstecken statt ihn zu melden).
if (rawName.includes('/') || rawName.includes('\\')) {
    fail(`Name darf keinen Pfadtrenner enthalten (verschachtelte Einstiege werden nicht unterstützt): "${rawName}"`);
}

const slug = slugify(rawName);
if (!slug) fail(`Name ergibt keinen gültigen Ordnernamen: "${rawName}"`);

// Sperrliste GEGEN bestehende Root-Strukturen (lib/, css/, …) — eine reine HTTP-Kollisionsprobe
// (wie sie der Panel-Trigger macht) träfe nur /<slug>/index.html, nicht Ordner ohne eigenes
// index.html. Hier, wo tatsächlich Dateien angelegt werden, muss die Sperrliste zuverlässig
// zuschlagen, nicht nur der Kollisionscheck.
if (isReservedSlug(slug)) {
    fail(`"${slug}" ist ein reservierter Name (bestehende Root-Struktur) — anderen Namen wählen.`);
}

const destDir = path.join(ROOT, slug);
// Case-insensitives Dateisystem (macOS/APFS, s. Risiko-Liste im Plan): existsSync() mit dem
// bereits erzwungenen lowercase-Slug fängt auch eine vorhandene GROSS/Kleinschreibungs-Variante
// ab — der Slug selbst wird nie in Originalgroßschreibung als Ordnername verwendet.
if (fs.existsSync(destDir)) {
    fail(`Ordner "${slug}/" existiert bereits.`);
}

fs.mkdirSync(destDir);

// ── index.html kopieren + gezielt umschreiben ──────────────────────────────────────────
// Relative Pfade (../css/…, ../lib/…) bleiben UNVERÄNDERT — die Kopie liegt in derselben
// Verzeichnistiefe wie werkbank-leer/. <h1>Werkbank</h1> bleibt ebenfalls unverändert
// (globaler Marken-Header, wie bei overcord/werkbank-leer auch).
let html = fs.readFileSync(path.join(SRC_DIR, SRC_HTML), 'utf8');
html = html.replace('data-app="werkbank-leer"', `data-app="${slug}"`);
html = html.replace('<title>Werkbank – leer</title>', `<title>Werkbank – ${rawName}</title>`);
html = html.replace('src="werkbank-leer.js"', `src="${slug}.js"`);
fs.writeFileSync(path.join(destDir, SRC_HTML), html);

// ── werkbank-leer.js → <slug>.js ───────────────────────────────────────────────────────
// Dateiname = Ordnername (Konvention, wie overcord/werkbank.js und werkbank-leer/
// werkbank-leer.js). Import-Pfade bleiben unverändert (gleiche Tiefe). Kopf-/Prosa-Kommentare,
// die wörtlich "werkbank-leer" nennen, werden auf den neuen Slug umgeschrieben — rein
// kosmetisch für lesbare Kommentare, FUNKTIONAL nicht zwingend: `APP` kommt zur Laufzeit aus
// dem DOM (`data-app`, s. lib/appId.js), nicht aus dem Dateinamen oder Kommentartext.
let js = fs.readFileSync(path.join(SRC_DIR, SRC_JS), 'utf8');
js = js.split('werkbank-leer').join(slug);
fs.writeFileSync(path.join(destDir, `${slug}.js`), js);

// ── Demo-/Erstbesuch-Datei mitkopieren ─────────────────────────────────────────────────
// presets/werkbank-leer-config.json → presets/<slug>-config.json, Keys darin von
// 'werkbank-leer_' auf '<slug>_' umgeschrieben — nur Lesbarkeit: lib/defaultConfig.js biegt
// fremde Präfixe zur Laufzeit ohnehin über toOwnKey() um (s. lib/appId.js), ohne diesen
// Schritt bliebe der Demo-Stand also trotzdem gültig, nur mit "falsch beschrifteten" Keys
// in der Datei selbst.
const presetsDir = path.join(ROOT, 'presets');
const srcPreset = path.join(presetsDir, 'werkbank-leer-config.json');
// Alle neu angelegten/geänderten Pfade sammeln — Grundlage für den automatischen `git add`
// weiter unten (EINE Stelle statt an jeder Schreibstelle einzeln zu staged).
const touchedPaths = [destDir];
if (fs.existsSync(srcPreset)) {
    let preset = fs.readFileSync(srcPreset, 'utf8');
    preset = preset.split('werkbank-leer_').join(`${slug}_`);
    const destPreset = path.join(presetsDir, `${slug}-config.json`);
    fs.writeFileSync(destPreset, preset);
    touchedPaths.push(destPreset);
} else {
    console.warn('new-entry: presets/werkbank-leer-config.json fehlt — keine Demo-Datei für die Kopie angelegt (Seite startet mit leeren Defaults, kein Fehler).');
}

console.log(`new-entry: "${slug}/" angelegt aus werkbank-leer/ (data-app="${slug}").`);

/**
 * Landing-Page-Karte (index.html, Muster: bestehende Overcord-/Leer-Karten) + Tabellenzeile
 * in ARCHITEKTUR.md ergänzen. Nur bei --publish aufgerufen — ohne Flag bleiben beide Dateien
 * UNANGETASTET (Opt-in-Sichtbarkeit, @dpa 20260803).
 * @returns {string[]} tatsächlich geänderte Pfade (für den automatischen `git add`).
 */
function publishEntry(slugName, displayName) {
    const touched = [];
    // Landing-Page: neue Karte direkt VOR dem schließenden </div> des .lp-grid einfügen.
    // Ohne eigenen Screenshot (den gibt es für eine frische Kopie noch nicht) bleibt die
    // <img class="lp-shot"> bewusst weg statt auf eine nicht existierende Datei zu zeigen —
    // einzige Abweichung vom 1:1-Muster der bestehenden Karten, sonst identischer Aufbau.
    const idxPath = path.join(ROOT, 'index.html');
    let idx = fs.readFileSync(idxPath, 'utf8');
    const card = `    <a class="lp-card" href="${slugName}/">\n`
        + `      <div class="lp-body">\n`
        + `        <h2 class="wb-instr-name">${displayName}</h2>\n`
        + `        <p>Kopie von "Leer" (Takt/Metronom, Rec, Meter, Signal-Scopes) — neuer Pool-Einstieg.</p>\n`
        + `        <span class="lp-go">→ öffnen</span>\n`
        + `      </div>\n`
        + `    </a>\n`;
    const gridClose = '  </div>\n\n  <div class="lp-tips">';
    if (idx.includes(gridClose)) {
        idx = idx.replace(gridClose, `${card}  </div>\n\n  <div class="lp-tips">`);
        fs.writeFileSync(idxPath, idx);
        touched.push(idxPath);
        console.log('new-entry: Karte in index.html ergänzt (--publish).');
    } else {
        console.warn('new-entry: .lp-grid-Struktur in index.html nicht wie erwartet gefunden — Karte NICHT automatisch ergänzt, bitte von Hand eintragen.');
    }

    // ARCHITEKTUR.md: neue Zeile direkt NACH der werkbank-leer-Zeile der "Einstiegspunkte
    // (Pool)"-Tabelle einfügen (gleiches Tabellenformat).
    const archPath = path.join(ROOT, 'ARCHITEKTUR.md');
    let arch = fs.readFileSync(archPath, 'utf8');
    const row = `| \`/${slugName}\` | \`${slugName}/index.html\` + \`${slugName}/${slugName}.js\` | \`${slugName}\` | \`${slugName}_*\` · \`presets/${slugName}-config.json\` | Kopie von werkbank-leer/ (${displayName}). |\n`;
    const anchorLine = /\| `\/werkbank-leer` \|[^\n]*\n/;
    if (anchorLine.test(arch)) {
        arch = arch.replace(anchorLine, (m) => m + row);
        fs.writeFileSync(archPath, arch);
        touched.push(archPath);
        console.log('new-entry: Zeile in ARCHITEKTUR.md ergänzt (--publish).');
    } else {
        console.warn('new-entry: Einstiegspunkte-Tabelle in ARCHITEKTUR.md nicht wie erwartet gefunden — Zeile NICHT automatisch ergänzt, bitte von Hand eintragen.');
    }
    return touched;
}

if (publish) {
    touchedPaths.push(...publishEntry(slug, rawName));
} else {
    console.log('new-entry: --publish nicht gesetzt — Landing-Page/ARCHITEKTUR.md bleiben UNVERÄNDERT (Einstieg ist unsichtbar, nur per URL /' + slug + '/ erreichbar).');
}

// ── `git add` automatisch, NIEMALS `git commit` (@dpa ddw.md 20260803-Rebuild) ────────────
// Nimmt genau den Schritt weg, den @dpa als "das kann man keinem User anbieten" kritisiert hat
// ("git add/commit nicht vergessen"), statt ihn nur netter zu erklären. Committen bleibt
// @dpas eigene, bewusste Entscheidung (Message, Zeitpunkt) — hier ausdrücklich NICHT automatisiert.
try {
    execFileSync('git', ['add', '--', ...touchedPaths], { cwd: ROOT, stdio: 'ignore' });
    console.log(`new-entry: zu Git hinzugefügt (git add, noch NICHT committet): ${touchedPaths.map((p) => path.relative(ROOT, p)).join(', ')}`);
} catch (e) {
    console.warn(`new-entry: "git add" fehlgeschlagen (${e.message.split('\n')[0]}) — bitte von Hand nachholen: git add ${touchedPaths.map((p) => `"${path.relative(ROOT, p)}"`).join(' ')}`);
}

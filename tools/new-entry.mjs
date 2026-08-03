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
 * Quelle ist standardmäßig werkbank-leer/ (das neutrale Basis-Scaffold), NIE overcord/ (der
 * volle Baukasten mit Poly-Synth/Stepsequenzer) — s. werkbank-leer/index.html-Kopf: "Aus
 * diesem Ordner heraus kopiert @dpa künftig neue Projekte".
 *
 * --source <ordner> (@dpa ddw.md 20260803_122138 Punkt 3, "Auslagern"): kopiert stattdessen
 * aus einem BEREITS GEKLONTEN, gewachsenen Einstieg statt aus der leeren Vorlage — für den
 * Fall, dass @dpa den bisherigen Stand eines Klons (nicht werkbank-leer) als eigenständiges
 * neues Projekt abspalten will ("Teilung/Auslagerung", nicht "neu"). Der Panel-Trigger
 * (lib/newEntryFlow.js) setzt dieses Flag automatisch, wenn er selbst NICHT im Original
 * werkbank-leer läuft (erkannt über `data-app`/APP, s. lib/appId.js) — <ordner> ist dann
 * genau der eigene Slug/Ordnername dieses Einstiegs. Das Kopierziel bleibt in JEDEM Fall ein
 * NEUER, leerer Ordner — nur die Quelle wechselt, der aktuelle Einstieg bleibt unangetastet.
 *
 * Aufruf:
 *   node tools/new-entry.mjs "<Name>" [--source <ordner>] [--publish]
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
const SRC_HTML = 'index.html';

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

// Positionsargument (Name) + zwei optionale Flags. `--source` nimmt IMMER das direkt
// folgende Argument als Wert — kein `--source=x`-Gleichheitszeichen-Stil, um mit dem Rest
// des Skripts (einfaches argv-Scannen, kein arg-parser-Paket) konsistent zu bleiben.
const argv = process.argv.slice(2);
const rawName = argv[0];
const publish = argv.includes('--publish');
const sourceFlagAt = argv.indexOf('--source');
const sourceSlug = sourceFlagAt >= 0 ? argv[sourceFlagAt + 1] : 'werkbank-leer';

if (!rawName || rawName.startsWith('--')) {
    fail('Name fehlt. Aufruf: node tools/new-entry.mjs "<Name>" [--source <ordner>] [--publish]');
}
if (sourceFlagAt >= 0 && (!sourceSlug || sourceSlug.startsWith('--'))) {
    fail('--source braucht einen Ordnernamen dahinter, z.B. --source pitch-osz');
}
if (sourceSlug.includes('/') || sourceSlug.includes('\\') || sourceSlug.includes('..')) {
    fail(`--source darf nur einen direkten Ordnernamen unter dem Projekt-Root enthalten, kein Pfad: "${sourceSlug}"`);
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

// Quelle auflösen (default 'werkbank-leer', s. Datei-Kopf "--source"): muss ein echter
// Pool-Einstieg unter ROOT sein (index.html + <sourceSlug>.js), egal ob Original oder
// bereits ein gewachsener Klon ("Auslagern"-Fall) — sonst gäbe es nichts zum Kopieren.
const SRC_DIR = path.join(ROOT, sourceSlug);
const SRC_JS = `${sourceSlug}.js`;
if (!fs.existsSync(path.join(SRC_DIR, SRC_HTML)) || !fs.existsSync(path.join(SRC_DIR, SRC_JS))) {
    fail(`Quelle "${sourceSlug}/" nicht gefunden — erwartet ${sourceSlug}/index.html + ${sourceSlug}/${SRC_JS}.`);
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
// Verzeichnistiefe wie die Quelle. <h1>Werkbank</h1> bleibt ebenfalls unverändert
// (globaler Marken-Header, wie bei overcord/werkbank-leer auch). data-app/script-src werden
// GENERISCH gegen `sourceSlug` ersetzt (nicht mehr hart "werkbank-leer") — im Auslagern-Fall
// trägt die Quelle bereits ihren EIGENEN Slug in beiden Stellen. Der <title> wird per Regex
// ersetzt statt eines exakten String-Vergleichs, weil eine Auslagern-Quelle einen beliebigen,
// schon selbst vergebenen Titel tragen kann (nicht mehr zwingend "Werkbank – leer").
let html = fs.readFileSync(path.join(SRC_DIR, SRC_HTML), 'utf8');
html = html.replace(`data-app="${sourceSlug}"`, `data-app="${slug}"`);
html = html.replace(/<title>.*?<\/title>/, `<title>Werkbank – ${rawName}</title>`);
html = html.replace(`src="${sourceSlug}.js"`, `src="${slug}.js"`);
fs.writeFileSync(path.join(destDir, SRC_HTML), html);

// ── <sourceSlug>.js → <slug>.js ────────────────────────────────────────────────────────
// Dateiname = Ordnername (Konvention, wie overcord/werkbank.js und werkbank-leer/
// werkbank-leer.js). Import-Pfade bleiben unverändert (gleiche Tiefe). Kopf-/Prosa-Kommentare,
// die wörtlich den Quell-Slug nennen, werden auf den neuen Slug umgeschrieben — rein
// kosmetisch für lesbare Kommentare, FUNKTIONAL nicht zwingend: `APP` kommt zur Laufzeit aus
// dem DOM (`data-app`, s. lib/appId.js), nicht aus dem Dateinamen oder Kommentartext.
let js = fs.readFileSync(path.join(SRC_DIR, SRC_JS), 'utf8');
js = js.split(sourceSlug).join(slug);
fs.writeFileSync(path.join(destDir, `${slug}.js`), js);

// ── Demo-/Erstbesuch-Datei mitkopieren (falls die Quelle eine hat) ─────────────────────
// presets/<sourceSlug>-config.json → presets/<slug>-config.json, Keys darin von
// '<sourceSlug>_' auf '<slug>_' umgeschrieben — nur Lesbarkeit: lib/defaultConfig.js biegt
// fremde Präfixe zur Laufzeit ohnehin über toOwnKey() um (s. lib/appId.js), ohne diesen
// Schritt bliebe der Demo-Stand also trotzdem gültig, nur mit "falsch beschrifteten" Keys
// in der Datei selbst. Ein Auslagern-Klon hat i.d.R. GAR KEINE presets-Datei (nur
// werkbank-leer/ bringt die mitgelieferte Demo mit) — der gewachsene Stand des Klons steckt
// ohnehin im Browser-localStorage, nicht in einer presets-Datei; das ist hier bewusst nicht
// Teil des Kopiervorgangs (s. Datei-Kopf "--source": es geht nur um die CODE-Quelle).
/**
 * Doppelklick-Start-Skripte für diesen Einstieg (@dpa ddw.md 20260803_135251 Punkt 5: "im
 * Ordner vielleicht ein Script welches cd .. && python3 -m http.server .. && open http.. easy
 * ausführen kann?"). DREI Varianten nebeneinander (@dpa 20260803: "das ist alles Mac
 * spezifisch.. richtig? Das muss man klar dazusagen.. bzw. muss es für Windows und Linux auch
 * anbieten") — ein `.command` allein läuft nur auf macOS (Terminal.app-Doppelklick-Konvention).
 * Alle drei rufen dieselbe Logik in derselben Reihenfolge auf (Port-Suche, Server, Browser-
 * Öffnen) — bewusst DREI kleine eigenständige Skripte statt eines "portablen" Universalskripts,
 * weil Shell/CMD/Batch keine gemeinsame Syntax teilen und ein Erkennungs-Wrapper selbst schon
 * plattformspezifischen Code bräuchte, um überhaupt zu erkennen WAS er ausführen soll.
 *
 * macOS: `.command` (Terminal.app führt sie per Doppelklick aus, s. `chmod +x` unten).
 * Linux: `.sh` — Doppelklick-Verhalten ist NICHT garantiert (abhängig von Dateimanager/
 * Desktop-Umgebung, viele fragen erst nach "Im Terminal ausführen" oder öffnen im Editor
 * statt es auszuführen) — README weist deshalb zusätzlich auf `./start.sh` im Terminal hin.
 * Windows: `.bat` (Explorer führt sie per Doppelklick über cmd.exe aus) — nutzt `python` statt
 * `python3` (unter Windows üblicher Name/Launcher-Alias) und `start` statt `open`/`xdg-open`.
 *
 * Port-Kollision (@dpa: "Port hochzählen ... nicht überengineeren"): startet den Server auf
 * einem Port, prüft kurz danach, ob der Prozess noch lebt (ein Fehlschlag wegen "Address
 * already in use" beendet ihn sofort wieder) — falls nicht, nächster Port, bis zu 20 Versuche.
 * Kein Vorab-Lock-Check (TOCTOU), das reicht für diesen Zweck.
 * @param {string} slugName
 * @returns {string} Skriptinhalt (macOS/Linux, identische Bash-Logik)
 */
function buildStartScript(slugName, fileName, opener) {
    return `#!/bin/bash
# ${fileName} — Doppelklick-Start für den Werkbank-Einstieg "${slugName}" (von
# tools/new-entry.mjs erzeugt, @dpa ddw.md 20260803_135251 Punkt 5). Liegt IM
# Einstiegs-Ordner — "$(dirname "$0")/.." ist darum das Projekt-Root, unabhängig davon,
# wohin der Ordner verschoben/kopiert wird.
cd "$(dirname "$0")/.." || { echo "Projekt-Root nicht gefunden."; read -p "Enter zum Schließen..."; exit 1; }

SLUG="${slugName}"
PORT=8002
for i in $(seq 0 20); do
  TRY=$((PORT + i))
  python3 -m http.server "$TRY" >/tmp/werkbank-start-$$.log 2>&1 &
  SERVER_PID=$!
  sleep 0.5
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    PORT=$TRY
    break
  fi
  wait "$SERVER_PID" 2>/dev/null
  if [ "$i" -eq 20 ]; then
    echo "Konnte auf keinem Port zwischen 8002 und $TRY starten (Log: /tmp/werkbank-start-$$.log)."
    read -p "Enter zum Schließen..."
    exit 1
  fi
done

sleep 1
${opener} "http://localhost:$PORT/$SLUG/"
echo "Server läuft auf Port $PORT (PID $SERVER_PID) — dieses Fenster kann geschlossen werden,"
echo "der Server läuft im Hintergrund weiter (beenden: kill $SERVER_PID)."
read -p "Enter zum Schließen dieses Fensters..."
`;
}

/** Windows-Äquivalent (`start.bat`, Explorer-Doppelklick über cmd.exe) — eigene Syntax,
 *  keine Ableitung aus der Bash-Fassung möglich. `python` statt `python3` (Windows-üblicher
 *  Name/py-Launcher-Alias), `start` statt `open`/`xdg-open`. */
function buildStartScriptWin(slugName) {
    return `@echo off
rem start.bat - Doppelklick-Start fuer den Werkbank-Einstieg "${slugName}" (von
rem tools/new-entry.mjs erzeugt, @dpa 20260803). Liegt IM Einstiegs-Ordner - %~dp0..
rem ist darum das Projekt-Root, unabhaengig davon, wohin der Ordner verschoben wird.
rem Port-Check per PowerShell-TCP-Probe (verlaesslicher als tasklist-Grepping) - braucht
rem Windows PowerShell, die auf jedem Windows seit Vista mitkommt.
cd /d "%~dp0.."
set SLUG=${slugName}
set PORT=8002

:tryport
start /b "" python -m http.server %PORT% >nul 2>nul
timeout /t 1 /nobreak >nul
powershell -NoProfile -Command "try { (New-Object Net.Sockets.TcpClient).Connect('localhost', %PORT%); exit 0 } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
  set /a PORT+=1
  if %PORT% lss 8022 goto tryport
  echo Konnte auf keinem Port zwischen 8002 und 8021 starten.
  echo Laeuft "python" ueberhaupt? Ggf. "py" statt "python" versuchen.
  pause
  exit /b 1
)

start "" "http://localhost:%PORT%/%SLUG%/"
echo Server laeuft auf Port %PORT% - dieses Fenster kann geschlossen werden,
echo der Server laeuft im Hintergrund weiter.
pause
`;
}

/** Start-Skripte (macOS/Linux/Windows) in den Zielordner schreiben + ausführbar machen (wo
 *  nötig). Gibt die tatsächlich geschriebenen Pfade zurück (für touchedPaths) — einzelne
 *  Fehlschläge sind nicht kritisch (@dpa kann den Server weiterhin von Hand starten, s.
 *  CLAUDE.md "Starten/Testen"), darum pro Datei einzeln versucht statt alles-oder-nichts. */
function writeStartScripts(dir, slugName) {
    const variants = [
        { file: 'start.command', content: buildStartScript(slugName, 'start.command', 'open'), exec: true },
        { file: 'start.sh', content: buildStartScript(slugName, 'start.sh', 'xdg-open'), exec: true },
        { file: 'start.bat', content: buildStartScriptWin(slugName), exec: false },
    ];
    const written = [];
    for (const v of variants) {
        const p = path.join(dir, v.file);
        try {
            fs.writeFileSync(p, v.content);
            if (v.exec) fs.chmodSync(p, 0o755);
            written.push(p);
        } catch (e) {
            console.warn(`new-entry: "${v.file}" konnte nicht angelegt werden (${e.message}) — nicht kritisch.`);
        }
    }
    return written;
}

/**
 * Doppelklick-Lösch-Skripte (@dpa 20260803: „davon eine Kopie oder Alias in die Ordner! ...
 * einfach zu finden, einfach doppelzuklicken" — und, wie bei den Start-Skripten: „das ist
 * alles Mac spezifisch.. muss es für Windows und Linux auch anbieten"). Alle drei Varianten
 * liegen IM Einstiegs-Ordner, rufen von dort aus NUR `tools/remove-entry.mjs <slug>` auf
 * (dasselbe Skript, dieselbe Sperrliste/Aufräumlogik — KEINE eigene Löschimplementierung pro
 * Plattform). Anders als die Start-Skripte bewusst NICHT einfach loslegend: löscht den
 * eigenen Ordner, also erst eine Rückfrage (y/N), sonst würde ein versehentlicher Doppelklick
 * sofort unwiderruflich Daten wegräumen.
 * @param {string} slugName
 * @param {string} fileName
 * @returns {string} Skriptinhalt (macOS/Linux, identische Bash-Logik)
 */
function buildRemoveScript(slugName, fileName) {
    return `#!/bin/bash
# ${fileName} — Doppelklick-Löschung für den Werkbank-Einstieg "${slugName}" (von
# tools/new-entry.mjs erzeugt, @dpa 20260803). Ruft nur tools/remove-entry.mjs auf, keine
# eigene Löschlogik. Fragt vorher nach, weil ein Doppelklick sonst ohne Warnung löscht.
cd "$(dirname "$0")/.." || { echo "Projekt-Root nicht gefunden."; read -p "Enter zum Schließen..."; exit 1; }

echo "Das löscht den kompletten Ordner \\"${slugName}/\\" (samt presets/${slugName}-config.json"
echo "und ggf. seiner Landing-Page-Karte) unwiderruflich vom Datenträger."
read -p "Wirklich löschen? [y/N] " ANTWORT
if [ "$ANTWORT" != "y" ] && [ "$ANTWORT" != "Y" ]; then
  echo "Abgebrochen."
  read -p "Enter zum Schließen..."
  exit 0
fi

node tools/remove-entry.mjs "${slugName}"
read -p "Enter zum Schließen dieses Fensters..."
`;
}

/** Windows-Äquivalent (`remove.bat`) — eigene Syntax, `set /p` statt `read -p`. */
function buildRemoveScriptWin(slugName) {
    return `@echo off
rem remove.bat - Doppelklick-Loeschung fuer den Werkbank-Einstieg "${slugName}" (von
rem tools/new-entry.mjs erzeugt, @dpa 20260803). Ruft nur tools/remove-entry.mjs auf.
cd /d "%~dp0.."

echo Das loescht den kompletten Ordner "${slugName}\\" (samt presets\\${slugName}-config.json
echo und ggf. seiner Landing-Page-Karte) unwiderruflich vom Datentraeger.
set /p ANTWORT=Wirklich loeschen? [j/N]
if /i not "%ANTWORT%"=="j" (
  echo Abgebrochen.
  pause
  exit /b 0
)

node tools\\remove-entry.mjs "${slugName}"
pause
`;
}

/** Lösch-Skripte (macOS/Linux/Windows) in den Zielordner schreiben + ausführbar machen (wo
 *  nötig). Gibt die tatsächlich geschriebenen Pfade zurück (für touchedPaths) — einzelne
 *  Fehlschläge sind nicht kritisch (@dpa kann weiterhin `node tools/remove-entry.mjs <slug>`
 *  von Hand aufrufen), darum pro Datei einzeln versucht statt alles-oder-nichts. */
function writeRemoveScripts(dir, slugName) {
    const variants = [
        { file: 'remove.command', content: buildRemoveScript(slugName, 'remove.command'), exec: true },
        { file: 'remove.sh', content: buildRemoveScript(slugName, 'remove.sh'), exec: true },
        { file: 'remove.bat', content: buildRemoveScriptWin(slugName), exec: false },
    ];
    const written = [];
    for (const v of variants) {
        const p = path.join(dir, v.file);
        try {
            fs.writeFileSync(p, v.content);
            if (v.exec) fs.chmodSync(p, 0o755);
            written.push(p);
        } catch (e) {
            console.warn(`new-entry: "${v.file}" konnte nicht angelegt werden (${e.message}) — nicht kritisch.`);
        }
    }
    return written;
}

/**
 * README im neuen Ordner (@dpa: "klarer Hinweis, dass einfach Ordnerlöschen unvollständig
 * ist" — UND: "das ist alles Mac spezifisch.. muss man klar dazusagen"). Kurz halten
 * (@dpa-Prinzip: keine Romane) — nur die drei Dinge, die ein Doppelklick im Dateimanager
 * NICHT von selbst nahelegt: welche der drei Start-/Lösch-Dateien zur eigenen Plattform
 * gehört, dass Linux' Doppelklick-Verhalten für `.sh` nicht garantiert ist, und dass ein
 * simples "Ordner in den Papierkorb ziehen" Reste hinterlässt (Preset-Datei, ggf.
 * Landing-Page-Karte).
 * @param {string} slugName
 * @returns {string}
 */
function buildReadme(slugName) {
    return `# ${slugName}

Ein Werkbank-Pool-Einstieg (aus \`werkbank-leer/\` kopiert, s. \`../ARCHITEKTUR.md\`).

## Starten
Je nach Betriebssystem doppelklicken:
- **macOS:** \`start.command\`
- **Windows:** \`start.bat\`
- **Linux:** \`start.sh\` — Doppelklick startet je nach Dateimanager evtl. nur im Editor statt
  auszuführen; notfalls im Terminal \`./start.sh\`.

(Oder von Hand: \`python3 -m http.server\` im Projekt-Root, dann \`/${slugName}/\` öffnen.)

## Löschen
**NICHT** einfach diesen Ordner in den Papierkorb ziehen — das lässt
\`presets/${slugName}-config.json\` und (falls veröffentlicht) die Landing-Page-Karte zurück.
Stattdessen \`remove.command\` (macOS) / \`remove.bat\` (Windows) / \`remove.sh\` (Linux)
doppelklicken — räumt alles sauber mit auf.
`;
}

/** README in den Zielordner schreiben. Gibt den Pfad zurück oder null bei Fehler (nicht
 *  kritisch — reine Doku, kein Funktionsverlust). */
function writeReadme(dir, slugName) {
    const p = path.join(dir, 'README.md');
    try {
        fs.writeFileSync(p, buildReadme(slugName));
        return p;
    } catch (e) {
        console.warn(`new-entry: README konnte nicht angelegt werden (${e.message}) — nicht kritisch.`);
        return null;
    }
}

const presetsDir = path.join(ROOT, 'presets');
const srcPreset = path.join(presetsDir, `${sourceSlug}-config.json`);
// Alle neu angelegten/geänderten Pfade sammeln — Grundlage für den automatischen `git add`
// weiter unten (EINE Stelle statt an jeder Schreibstelle einzeln zu staged).
const touchedPaths = [destDir];
if (fs.existsSync(srcPreset)) {
    let preset = fs.readFileSync(srcPreset, 'utf8');
    preset = preset.split(`${sourceSlug}_`).join(`${slug}_`);
    const destPreset = path.join(presetsDir, `${slug}-config.json`);
    fs.writeFileSync(destPreset, preset);
    touchedPaths.push(destPreset);
} else {
    console.warn(`new-entry: presets/${sourceSlug}-config.json fehlt — keine Demo-Datei für die Kopie angelegt (Seite startet mit leeren Defaults, kein Fehler).`);
}

// Start-/Lösch-Skripte (macOS+Windows+Linux, @dpa 20260803: "das ist alles Mac spezifisch..
// muss es für Windows und Linux auch anbieten") + README IN den neuen Ordner — nach der
// Demo-Datei, damit sie in der Konsolen-Ausgabe zuletzt und damit gut sichtbar erscheinen.
const startScriptPaths = writeStartScripts(destDir, slug);
touchedPaths.push(...startScriptPaths);
const removeScriptPaths = writeRemoveScripts(destDir, slug);
touchedPaths.push(...removeScriptPaths);
const readmePath = writeReadme(destDir, slug);
if (readmePath) touchedPaths.push(readmePath);

console.log(`new-entry: "${slug}/" angelegt aus ${sourceSlug}/ (data-app="${slug}").`);
if (startScriptPaths.length) console.log(`new-entry: Start-Skripte angelegt (${startScriptPaths.map((p) => path.basename(p)).join(', ')}) — je nach Betriebssystem doppelklicken.`);
if (removeScriptPaths.length) console.log(`new-entry: Lösch-Skripte angelegt (${removeScriptPaths.map((p) => path.basename(p)).join(', ')}) — fragen vorher nach, löschen dann vollständig.`);
if (readmePath) console.log(`new-entry: "${slug}/README.md" angelegt (Start/Löschen-Hinweis, plattformübergreifend).`);

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
    // Beschreibung nennt die TATSÄCHLICHE Quelle (sourceSlug, aus dem äußeren Scope) statt
    // hart "Leer" — im Auslagern-Fall ist die Quelle ein anderer, gewachsener Klon.
    const idxPath = path.join(ROOT, 'index.html');
    let idx = fs.readFileSync(idxPath, 'utf8');
    const card = `    <a class="lp-card" href="${slugName}/">\n`
        + `      <div class="lp-body">\n`
        + `        <h2 class="wb-instr-name">${displayName}</h2>\n`
        + `        <p>Kopie von "${sourceSlug}/" — neuer Pool-Einstieg.</p>\n`
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
    const row = `| \`/${slugName}\` | \`${slugName}/index.html\` + \`${slugName}/${slugName}.js\` | \`${slugName}\` | \`${slugName}_*\` · \`presets/${slugName}-config.json\` | Kopie von ${sourceSlug}/ (${displayName}). |\n`;
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

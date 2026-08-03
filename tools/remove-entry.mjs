#!/usr/bin/env node
/**
 * tools/remove-entry.mjs — entfernt einen per tools/new-entry.mjs erzeugten Pool-Einstieg
 * wieder vollständig (@dpa ddw.md 20260803_135251 Punkt 6: "kann man die Ordner ...
 * einfach löschen? wenn nicht - bitte auch dafür ein Script bereitstellen.").
 *
 * Warum nicht einfach `rm -rf <slug>`: das ließe zwei Reste zurück, die man leicht vergisst —
 * `presets/<slug>-config.json` (Erstbesuch-Demo-Datei, s. new-entry.mjs) UND, falls der
 * Einstieg mit `--publish` veröffentlicht wurde, seine Karte in der Landing-Page (index.html)
 * sowie seine Zeile in der "Einstiegspunkte (Pool)"-Tabelle (ARCHITEKTUR.md) — beide würden
 * sonst auf einen nicht mehr existierenden Ordner verweisen. Dieses Skript räumt alle vier
 * Stellen zusammen ab, in genau der Form, in der new-entry.mjs sie angelegt hat
 * (s. dortige `publishEntry()` — dieselben Textbausteine, hier per Regex wieder entfernt).
 *
 * Sperrliste: dieselbe RESERVED_SLUGS-Liste wie new-entry.mjs/lib/slugify.js (EINE Quelle,
 * keine zweite Kopie, s. @dpa-Auftrag) — overcord/werkbank-leer/lib/css/… lassen sich also
 * NIE über dieses Skript löschen, ganz gleich, was am Slug hängt.
 *
 * Wie new-entry.mjs: nur `git add -A` (staged auch Löschungen als solche), NIEMALS
 * `git commit` — das bleibt @dpas eigener, bewusster Schritt.
 *
 * Aufruf:
 *   node tools/remove-entry.mjs <slug>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { isReservedSlug } from '../lib/slugify.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function fail(msg) {
    console.error(`remove-entry: ${msg}`);
    process.exit(1);
}

const slug = process.argv[2];
if (!slug || slug.startsWith('--')) {
    fail('Ordnername (Slug) fehlt. Aufruf: node tools/remove-entry.mjs <slug>');
}
if (slug.includes('/') || slug.includes('\\') || slug.includes('..')) {
    fail(`Ungültiger Slug (kein Pfad erlaubt, keine "..".): "${slug}"`);
}
// Sperrliste ZUERST prüfen, noch vor dem Existenz-Check — ein reservierter Name darf auch
// dann nicht "versucht" werden, wenn zufällig (noch) kein gleichnamiger Ordner existiert.
if (isReservedSlug(slug)) {
    fail(`"${slug}" ist ein reservierter/geschützter Einstieg (s. lib/slugify.js RESERVED_SLUGS) — wird NIE automatisch gelöscht.`);
}

const destDir = path.join(ROOT, slug);
if (!fs.existsSync(destDir)) {
    fail(`"${slug}/" existiert nicht — nichts zu tun.`);
}

// Alle tatsächlich angefassten Pfade sammeln — Grundlage für den automatischen `git add -A`
// weiter unten (EINE Stelle statt an jeder Löschstelle einzeln zu staged).
const touchedPaths = [];

// ── Ordner selbst ───────────────────────────────────────────────────────────────────────
fs.rmSync(destDir, { recursive: true, force: true });
touchedPaths.push(destDir);
console.log(`remove-entry: "${slug}/" gelöscht.`);

// ── Demo-/Erstbesuch-Datei (presets/<slug>-config.json, s. new-entry.mjs) ─────────────────
const presetPath = path.join(ROOT, 'presets', `${slug}-config.json`);
if (fs.existsSync(presetPath)) {
    fs.rmSync(presetPath);
    touchedPaths.push(presetPath);
    console.log(`remove-entry: presets/${slug}-config.json gelöscht.`);
}

// ── Landing-Page-Karte (nur vorhanden, falls new-entry.mjs mit --publish lief, s. dortige
// publishEntry()) — nicht-gierige Übereinstimmung von genau der Karte mit href="<slug>/" bis
// zum schließenden </a>, EXAKT das Format, das publishEntry() dort einfügt. ─────────────────
const idxPath = path.join(ROOT, 'index.html');
let idx = fs.readFileSync(idxPath, 'utf8');
const cardRe = new RegExp(`    <a class="lp-card" href="${slug}/">[\\s\\S]*?</a>\\n`);
if (cardRe.test(idx)) {
    idx = idx.replace(cardRe, '');
    fs.writeFileSync(idxPath, idx);
    touchedPaths.push(idxPath);
    console.log('remove-entry: Karte aus index.html entfernt.');
} else {
    console.log('remove-entry: keine Karte in index.html gefunden (Einstieg war nicht veröffentlicht — ok, nichts zu tun).');
}

// ── ARCHITEKTUR.md-Tabellenzeile (ebenfalls nur bei --publish vorhanden) ──────────────────
const archPath = path.join(ROOT, 'ARCHITEKTUR.md');
let arch = fs.readFileSync(archPath, 'utf8');
const rowRe = new RegExp(`\\| \`/${slug}\` \\|[^\\n]*\\n`);
if (rowRe.test(arch)) {
    arch = arch.replace(rowRe, '');
    fs.writeFileSync(archPath, arch);
    touchedPaths.push(archPath);
    console.log('remove-entry: Zeile aus ARCHITEKTUR.md entfernt.');
} else {
    console.log('remove-entry: keine Zeile in ARCHITEKTUR.md gefunden (Einstieg war nicht veröffentlicht — ok, nichts zu tun).');
}

// ── `git add -A`, NIEMALS `git commit` (1:1-Muster aus new-entry.mjs) ────────────────────
// `-A` statt `--` mit den einzelnen Pfaden (wie new-entry.mjs es beim ANLEGEN tut): hier geht
// es um LÖSCHUNGEN — ein einfaches `git add <pfad>` kennt einen bereits verschwundenen Pfad
// nicht und würde mit "no such path" scheitern, `-A` (mit denselben Pfaden dahinter) erkennt
// und staged Löschungen korrekt.
try {
    execFileSync('git', ['add', '-A', '--', ...touchedPaths], { cwd: ROOT, stdio: 'ignore' });
    console.log(`remove-entry: Löschung zu Git vorgemerkt (git add -A, noch NICHT committet): ${touchedPaths.map((p) => path.relative(ROOT, p)).join(', ')}`);
} catch (e) {
    console.warn(`remove-entry: "git add" fehlgeschlagen (${e.message.split('\n')[0]}) — bitte von Hand nachholen: git add -A -- ${touchedPaths.map((p) => `"${path.relative(ROOT, p)}"`).join(' ')}`);
}

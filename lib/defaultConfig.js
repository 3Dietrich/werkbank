/**
 * defaultConfig.js — Erstbesuch-Befüllung (@dpa 20260725: „man muss die config hinzu
 * speichern.. sonst klingt alles nichts"). Die öffentliche Seite (GitHub Pages) startet
 * sonst mit leerem localStorage — kein Demo-Klang, keine Snapshots. Darum liegt je
 * Einstieg ein gepflegter Beispiel-Stand im Repo: `presets/<data-app>-config.json`
 * (also presets/werkbank-config.json, presets/werkbank-leer-config.json, …).
 *
 * PRO EINSTIEG, nicht global (@dpa dd.md 20260801_2): bis dahin gab es genau eine
 * geteilte `default-config.json` für alle HTML-Einstiege — wer aus werkbank-leer.html
 * exportierte, bestimmte damit auch den Erstbesuch-Stand von index.html mit. Welche
 * Datei/welche Keys gelten, entscheidet `lib/appId.js` am `data-app` des <html>-Tags.
 *
 * Disziplin (Recall-Disziplin-Analogie, s. PresetManager): NIEMALS bestehende Daten
 * überschreiben. Nur Keys, die im localStorage GAR NICHT existieren, werden gesetzt —
 * wer die Seite schon einmal benutzt hat, behält seinen Stand; wer Reset gedrückt hat
 * (Keys WEG), bekommt die Demo wieder. Der Import läuft VOR werkbank.js (die baut
 * ihre MiniStates beim Laden aus dem localStorage), darum als eigenes Modul davor
 * eingebunden — kein Eingriff in die Boot-Reihenfolge der App.
 *
 * Enthält die Datei KEINE passenden Keys (oder fetch scheitert — z.B. file://), passiert
 * einfach nichts: die App startet mit ihren normalen Defaults, wie bisher.
 *
 * Technik: ES-Module laufen unabhängig/async — damit die MiniStates der App den
 * Demo-Stand GARANTIERT erst nach dem Befüllen lesen, exportiert dieses Modul ein
 * Promise (`window.__defaultConfigReady`), auf das werkbank.js vor dem ersten
 * MiniState-Zugriff wartet (await am Datei-Anfang — Module evaluieren sequentiell
 * in Import-Reihenfolge, ein await dort blockiert nur diese App, nichts anderes).
 */
import { APP, configPath, toOwnKey } from './appId.js';

window.__defaultConfigReady = (async () => {
    try {
        // Jeder Pool-Einstieg hat seine EIGENE Demo-Datei (@dpa dd.md 20260801_2, s.
        // lib/appId.js): presets/werkbank-config.json, presets/werkbank-leer-config.json, …
        // Vorher gab es genau eine geteilte `default-config.json` für alle Einstiege —
        // ein Export aus einer Seite bestimmte damit auch den Erstbesuch der anderen.
        const res = await fetch(configPath());
        if (!res.ok) return;
        const cfg = await res.json();
        const ls = (cfg && cfg.ls) || {};
        let n = 0;
        for (const [key, value] of Object.entries(ls)) {
            // Keys der Datei aufs eigene Präfix umbiegen: eine Demo-Datei entsteht als
            // ganz normaler Export auf ihrer Seite und trägt daher deren Keys — beim
            // Umbenennen einer Kopie (data-app) soll sie trotzdem weiter greifen, statt
            // still nichts mehr zu tun.
            const own = toOwnKey(key);
            if (localStorage.getItem(own) == null) {
                localStorage.setItem(own, JSON.stringify(value));
                n++;
            }
        }
        if (n) console.info(`[${APP}] Demo-Stand geladen (${n} Bereiche) — eigene Daten wurden nicht überschrieben.`);
    } catch { /* offline/file:// — App startet mit Defaults */ }
})();

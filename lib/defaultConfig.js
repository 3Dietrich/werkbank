/**
 * defaultConfig.js — Erstbesuch-Befüllung (@dpa 20260725: „man muss die config hinzu
 * speichern.. sonst klingt alles nichts"). Die öffentliche Seite (GitHub Pages) startet
 * sonst mit leerem localStorage — kein Demo-Klang, keine Snapshots. Darum liegt ein
 * gepflegter Beispiel-Stand unter `presets/default-config.json` im Repo.
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
window.__defaultConfigReady = (async () => {
    try {
        const res = await fetch('presets/default-config.json');
        if (!res.ok) return;
        const cfg = await res.json();
        const ls = (cfg && cfg.ls) || {};
        let n = 0;
        for (const [key, value] of Object.entries(ls)) {
            if (!key.startsWith('werkbank_')) continue;   // fremde Keys nie anfassen
            if (localStorage.getItem(key) == null) {
                localStorage.setItem(key, JSON.stringify(value));
                n++;
            }
        }
        if (n) console.info(`[werkbank] Demo-Stand geladen (${n} Bereiche) — eigene Daten wurden nicht überschrieben.`);
    } catch { /* offline/file:// — App startet mit Defaults */ }
})();

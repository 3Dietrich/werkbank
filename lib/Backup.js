/**
 * Backup.js — Gestaffelte automatische Sicherungen (Port aus teslacoils
 * `js/data/Backup.js`, @dpa ddw.md 20260802 Punkt 4: „Daten-Export: den gleichen,
 * gestaffelten wie in teslacoil bauen"). Nur GELESEN aus teslacoil (fremdes, eigenes
 * öffentliches Repo) — diese Datei ist ein Werkbank-eigener Nachbau, keine Kopie.
 *
 * Zeitfenster + Obergrenzen der gestaffelten Aufbewahrung (unverändert aus teslacoil):
 *   < 1 min: max 2 · < 1 h: max 5 (die Minuten-Backups zählen mit) ·
 *   1 h – 1 Woche: höchstens 1 pro Kalender-Tag · ab 1 Woche: höchstens 1 pro Woche.
 *
 * ── Unterschied zum Original (bewusste Anpassung an Werkbanks Architektur) ──────────────
 * teslacoil hat EINEN globalen State (js/core/State.js) und hängt sich mit einem einzigen
 * `state.subscribe(scheduleBackup)` an jede Änderung. Werkbank hat pro Instrument einen
 * EIGENEN MiniState (ARCHITEKTUR.md: „Jedes Instrument bringt seinen eigenen State mit") —
 * an ALLE einzeln anzuhängen wäre eng an die Konstruktions-Reihenfolge in werkbank.js
 * gekoppelt und bei jedem neuen ISM eine weitere Fundstelle zum Vergessen (derselbe
 * Fehler-Typ wie im keyBtn/midiBtn-Kommentar dort: „stepSeq.keyMidi fehlte hier"). Diese
 * Datei bleibt darum STORAGE-basiert: `captureFn()` liefert den kompletten Zustand als
 * EIN Objekt (in werkbank: `buildConfig()`, das ohnehin schon alle LS_KEYS ausliest), und
 * `watchAutoBackup()` prüft ihn periodisch statt bei jedem einzelnen Change-Event —
 * inhaltlich dieselbe gestaffelte Aufbewahrung, nur an der Werkbank-Bauart angepasst
 * ausgelöst. Reine Funktionen, Storage wird als Parameter gereicht → headless testbar.
 */

/** Zeitfenster + Obergrenzen der gestaffelten Aufbewahrung. */
export const WINDOWS = {
    minute: 60e3,          // < 1 min: max 2
    hour: 3600e3,          // < 1 h:  max 5 (inkl. der Minuten-Backups)
    day: 86400e3,          // 1 h–1 Woche: 1 pro Tag
    week: 7 * 86400e3,     // ab 1 Woche: 1 pro Woche
    maxMinute: 2,
    maxHour: 5,
};

/**
 * Backup-Liste gestaffelt ausdünnen (1:1 aus teslacoil). Erwartet Einträge {ts, ...};
 * gibt die zu behaltenden zurück (neueste zuerst).
 */
export function thinBackups(list, now, W = WINDOWS) {
    const sorted = [...list].sort((a, b) => b.ts - a.ts);   // neueste zuerst
    const keep = [];
    let minC = 0, hourC = 0, lastDay = null, lastWeek = null;
    for (const b of sorted) {
        const age = now - b.ts;
        if (age < W.minute) {
            if (minC < W.maxMinute && hourC < W.maxHour) { keep.push(b); minC++; hourC++; }
        } else if (age < W.hour) {
            if (hourC < W.maxHour) { keep.push(b); hourC++; }
        } else if (age < W.week) {
            const d = Math.floor(b.ts / W.day);
            if (d !== lastDay) { keep.push(b); lastDay = d; }
        } else {
            const w = Math.floor(b.ts / W.week);
            if (w !== lastWeek) { keep.push(b); lastWeek = w; }
        }
    }
    return keep;
}

/** Backup-Liste lesen (defensiv – korrupte Daten → leere Liste). */
export function readBackups(storage, backupKey) {
    try { return JSON.parse(storage.getItem(backupKey)) || []; } catch { return []; }
}
/** Backup-Liste schreiben. */
export function writeBackups(storage, backupKey, list) {
    storage.setItem(backupKey, JSON.stringify(list));
}

/**
 * Neues Backup anlegen, ausdünnen und speichern. Bei Quota-Fehlern werden die ältesten
 * Backups so lange verworfen, bis es passt (der neue bleibt erhalten). `captureFn()`
 * liefert den zu sichernden Zustand (in werkbank: `buildConfig()`).
 * Gibt die gespeicherte (gedünnte) Liste zurück.
 */
export function pushBackup(storage, backupKey, now, captureFn, label = '') {
    const list = readBackups(storage, backupKey);
    list.push({ ts: now, label, data: captureFn() });
    let arr = thinBackups(list, now);
    for (;;) {
        try { writeBackups(storage, backupKey, arr); break; }
        catch (e) { if (arr.length <= 1) throw e; arr = arr.slice(0, -1); }   // ältesten weglassen
    }
    return arr;
}

/**
 * Periodischer Auto-Backup-Wächter (Ersatz für teslacoils `state.subscribe()`, s. Kopf-
 * Kommentar): prüft alle `intervalMs`, ob sich `captureFn()` seit dem letzten Backup
 * ÄNDERTE (reiner JSON-Vergleich — ein paar KB alle paar Sekunden ist billig genug), und
 * legt nur DANN ein neues Backup an, kein Backup-Grab bei Stillstand.
 * @returns {()=>void} stop-Funktion (clearInterval)
 */
export function watchAutoBackup(storage, backupKey, captureFn, opts = {}) {
    const intervalMs = opts.intervalMs || 20000;
    const label = opts.label || 'auto';
    let lastJson = null;
    const list = readBackups(storage, backupKey).slice().sort((a, b) => b.ts - a.ts);
    if (list.length) { try { lastJson = JSON.stringify(list[0].data); } catch { /* skip */ } }
    const timer = setInterval(() => {
        let json;
        try { json = JSON.stringify(captureFn()); } catch { return; }
        if (json === lastJson) return;   // nichts geändert seit dem letzten Backup
        lastJson = json;
        try { pushBackup(storage, backupKey, Date.now(), () => JSON.parse(json), label); }
        catch { /* Quota o.ä. — nicht fatal, nächster Versuch beim nächsten Intervall */ }
    }, intervalMs);
    return () => clearInterval(timer);
}

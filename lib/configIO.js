/**
 * configIO.js — State-Datei(en) sichern/laden + gestaffelte Auto-Backups (@dpa 20260720).
 *
 * Vorher (bis auf Kommentare/Dateiname-Präfix) byte-identisch dreifach dupliziert in
 * overcord/werkbank.js, werkbank-leer/werkbank-leer.js und pitchosc/pitchosc.js (@dpa
 * 20260804, gleicher Fund wie bei ADSR/Scope/mountBenchHelp/headerBtn — s.
 * lib/adsrPanel.js-Kommentar).
 *
 * WICHTIG (@dpa 20260804, Nachfrage vor dem Umbau): das ist NICHT dieselbe Ebene wie die
 * Gruppen-Rechtsklick-Settings (Combos/Snapshots, `groupCombos`/`groupSnaps` — s.
 * lib/group/GroupHost.js). configIO kopiert GANZE localStorage-Buckets 1:1 (roher
 * JSON.parse/stringify pro Key in `LS_KEYS`), ohne je in einzelne Controls/Gruppen/
 * Instanzen reinzuschauen — Multi-ADSR/Multi-Scope/Combo-Pools sitzen als GEWÖHNLICHE Keys
 * IM jeweiligen Bucket und werden darum automatisch mit erfasst, egal wie viele Instanzen
 * gerade existieren.
 *
 * DER Stolperstein ist `LS_KEYS` selbst: die Liste der Buckets UNTERSCHEIDET SICH PRO
 * EINSTIEGSPUNKT (overcord hat z.B. `polysynth`/`stepseq`, werkbank-leer/pitchosc nicht,
 * pitchosc hat zusätzlich `adsrosc`) — genau das ist laut Code-Historie SCHON DREIMAL
 * schiefgegangen (ein neues ISM wurde gebaut, aber die Liste nicht ergänzt → jeder Export/
 * Reset ließ dessen Stand stillschweigend aus). `LS_KEYS` bleibt darum zwingend ein
 * PARAMETER, den jeder Aufrufer selbst und vollständig pflegt — NIE eine gemeinsame,
 * „universelle" Liste in dieser Datei.
 *
 * Verwendung (1:1 wie die alten lokalen Funktionen, nur als Objekt zurückgegeben):
 *   const { buildConfig, applyConfig, exportConfig, doReset, backups } =
 *       makeConfigIO(LS_KEYS, 'overcord');   // zweiter Param = sichtbarer Datei-Präfix
 */
import { toOwnKey, lsKey } from './appId.js';
import { readBackups, pushBackup, watchAutoBackup } from './Backup.js';

export function makeConfigIO(LS_KEYS, filenamePrefix) {
    function buildConfig() {
        const ls = {};
        for (const k of LS_KEYS) { const v = localStorage.getItem(k); if (v != null) { try { ls[k] = JSON.parse(v); } catch { /* skip */ } } }
        return { _werkbank: 1, saved: new Date().toISOString(), ls };
    }
    function applyConfig(obj) {
        const ls = (obj && obj.ls) || obj || {};   // toleriert nacktes { key: data }
        // Fremde Präfixe umbiegen (@dpa dd.md 20260801_2): eine Export-Datei trägt die Keys
        // DER SEITE, auf der sie entstand (und jede Datei von vor der Einstiegs-Trennung
        // durchweg 'werkbank_…'). Ohne das Umbiegen ließe sich ein Export nur dort wieder
        // einlesen, wo er gemacht wurde. Erst auf die eigenen Keys normalisieren, dann wie
        // gehabt nur die BEKANNTEN Bereiche übernehmen (nichts Fremdes in den localStorage).
        const own = {};
        for (const [k, v] of Object.entries(ls)) own[toOwnKey(k)] = v;
        let n = 0;
        for (const k of LS_KEYS) if (own[k] != null) { localStorage.setItem(k, JSON.stringify(own[k])); n++; }
        return n;
    }
    function exportConfig() {
        const blob = new Blob([JSON.stringify(buildConfig(), null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);   // YYYYMMDDHHMMSS, ohne Millisekunden-Punkt
        a.href = url; a.download = filenamePrefix + '-config-' + ts + '.json'; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // Gestaffelte Auto-Backups (@dpa ddw.md 20260802 Punkt 4, lib/Backup.js-Kopf): buildConfig()
    // liefert denselben vollständigen Zustand wie der Datei-Export oben — hier nur zusätzlich
    // AUTOMATISCH und GESTAFFELT im eigenen Datentopf (lsKey) abgelegt.
    const BACKUP_LS = lsKey('backups');
    const stopAutoBackup = watchAutoBackup(localStorage, BACKUP_LS, buildConfig, { intervalMs: 20000 });
    window.addEventListener('beforeunload', stopAutoBackup);
    const backups = {
        list: () => readBackups(localStorage, BACKUP_LS).slice().sort((a, b) => b.ts - a.ts),
        load: (ts) => {
            const b = readBackups(localStorage, BACKUP_LS).find((x) => x.ts === ts);
            if (!b) return;
            if (!confirm('Backup vom ' + new Date(ts).toLocaleString('de-DE') + ' laden?\n\nDer AKTUELLE Zustand wird ersetzt.')) return;
            const n = applyConfig(b.data);
            if (n) location.reload(); else alert('Backup enthielt keine passenden Daten.');
        },
        saveNow: () => { try { pushBackup(localStorage, BACKUP_LS, Date.now(), buildConfig, 'manuell'); } catch { alert('Backup fehlgeschlagen (Speicher voll?).'); } },
    };

    // Reset-Logik EINMAL (PLAN_OPERA.md 1.3): Sicherheitsnetz wie in teslacoil — ein Backup
    // VOR dem Zurücksetzen bleibt im eigenen Datentopf erhalten (BACKUP_LS gehört nicht zu
    // LS_KEYS, überlebt den Reset), falls man sich doch vertan hat.
    function doReset() {
        if (confirm('Wirklich ALLES zurücksetzen? Umbenennungen, Anordnung, Belegungen gehen verloren.')) {
            try { pushBackup(localStorage, BACKUP_LS, Date.now(), buildConfig, 'vor Reset'); } catch { /* Quota o.ä. */ }
            LS_KEYS.forEach((k) => localStorage.removeItem(k)); location.reload();
        }
    }

    return { buildConfig, applyConfig, exportConfig, doReset, backups };
}

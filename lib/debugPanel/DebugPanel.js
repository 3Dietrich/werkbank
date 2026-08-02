/**
 * DebugPanel.js — "Debug"-Werkzeug (KEIN Sound-Parameter), Port aus
 * teslacoil/js/ui/DebugPanel.js (@dpa ddw.md 20260802: „die debug Gruppe .. die will ich
 * auch in beiden, werkbank-leer und overcord"). Bündelt auf einen Klick Audio (WAV, zwei
 * unabhängige Slots a/b für Vorher/Nachher-Vergleich) + Screenshot (alle sichtbaren
 * Canvas-Elemente zu einem PNG gestapelt) + Zustand (voller Config-Dump) + einen frei
 * eingegebenen Begleit-Prompt zu Dateien `<app>_debug_<name>.*` — zum Hochladen an die KI
 * ("hörst du das Zwitschern bei Step 3?").
 *
 * NUR LOGIK, kein DOM — wie im teslacoil-Original. Die Bedienelemente entstehen aus
 * denselben generischen Control-Fabriken (BUTTONS/NOTES, s. lib/debugPanel/defs.js) wie
 * jeder andere werkbank-Control. EIN Unterschied bewusst zu teslacoil: dort sind
 * debugName/debugPrompt ganz normale TEXTS-Controls, deren Optik-Zugehörigkeit über eine
 * zentrale LAYOUT_KEYS-Allowlist (PresetManager.js) hergestellt wird. Werkbanks
 * Gruppen-/ISM-Snapshot (lib/group/GroupHost.js, `_snapValuesOf`/`allSoundValues`) sammelt
 * dagegen JEDEN `data-ctrl`-Wert einer Gruppe ohne Filterung ein (@dpa 20260724 bewusst so
 * entschieden: „alles dabei .. KEINE Filterung nach Control-Typ") — ein debugName/-Prompt
 * über die normale TEXTS-Fabrik würde also bei jedem Snapshot-Recall der Debug-Gruppe
 * mit überschrieben, genau der Recall-Zwang, den teslacoil bewusst vermeidet. Darum hängen
 * die zwei Textfelder hier NICHT an `data-ctrl`-Werten, sondern an einem eigenen
 * top-level Optik-Key `debugMeta` — genau dasselbe Muster wie `ctrlStyles`/`knobMeta`/
 * `groupPos` (nie vom Snapshot-Scan erfasst, weil der nur `[data-ctrl]`-IDs abklappert),
 * s. lib/debugPanel/mount.js. Kein neuer Persistenz-Mechanismus, nur ein neuer Key
 * desselben Musters.
 *
 * Tap-Punkt (@dpa ddw.md 20260802, abgewogen statt übernommen): teslacoil zapft
 * `engine.master.volume` NACH dem Fader ab. lib/audioBus.js bietet zwei Punkte: `master`
 * (roher Summenbus VOR Limiter/WaveShaper — das nutzt Rec bewusst, unabhängig vom
 * Abhörpegel) und `getAnalyser()` (NACH der ganzen aktiven Monitor-Kette, derselbe Punkt
 * wie der LevelMeter — zeigt den TATSÄCHLICHEN Ausgangspegel in allen Limiter/WaveShaper-
 * Kombinationen). Debug ist ein "hörst du das, was ICH höre"-Werkzeug für den realen
 * Höreindruck, nicht für einen abhörpegel-unabhängigen Rohmitschnitt wie Rec — darum hier
 * bewusst der ANALYSER-Tap, nicht `master`.
 */
import { DebugRecorder } from './DebugRecorder.js';
import { encodeWav } from '../wavEncoder.js';
import { downloadBlob, downloadJSON } from '../fileIO.js';
import { getContext, getAnalyser } from '../audioBus.js';

export class DebugPanel {
    /**
     * @param {import('../MiniState.js').MiniState} state  eigener Debug-State (trägt debugMeta)
     * @param {{ appPrefix?: string, getFullState?: () => object }} [opts]
     *   appPrefix     — Dateipräfix (Default 'werkbank'; Aufrufer gibt lsKey-APP mit).
     *   getFullState  — liefert den vollen Ensemble-Zustand fürs "Zustand"-JSON (Default:
     *                   nur der eigene, fast leere Debug-State — Aufrufer sollte i.d.R.
     *                   den fertigen Config-Export der Seite durchreichen, s. werkbank.js).
     */
    constructor(state, opts = {}) {
        this.state = state;
        this.appPrefix = opts.appPrefix || 'werkbank';
        this.getFullState = opts.getFullState || (() => state.toJSON());
        // Pro Slot ein eigener Recorder + die letzte gestoppte Aufnahme.
        this.slots = {
            a: { rec: new DebugRecorder(getAnalyser), last: null },
            b: { rec: new DebugRecorder(getAnalyser), last: null },
        };
        this._onChange = () => {};
    }

    /** UI-Refresh-Hook (Rec/Rec2-Knöpfe nach jedem Toggle neu anmalen — s. mount.js). */
    onChange(fn) { this._onChange = fn || (() => {}); }

    /** @param {'a'|'b'} slot */
    recording(slot) { return this.slots[slot].rec.recording; }

    /**
     * Aufnahme dieses Slots starten/stoppen (1:1 aus teslacoil, @dpa 20260716_031100).
     * Zwei feste Regeln, bewusst HIER und nicht in der UI:
     *   • **Nie zwei gleichzeitig.** Startet man den einen, während der andere läuft, wird
     *     der andere sauber gestoppt (seine Aufnahme bleibt erhalten und vergleichbar).
     *   • **Ein neuer Start verwirft die vorherige Aufnahme DIESES Recorders** — der Slot
     *     hält immer genau einen Take, nie einen halb überschriebenen Zustand.
     * @returns {number|null} Sekunden nach dem Stopp, null beim Start.
     */
    toggle(slot) {
        const s = this.slots[slot];
        let result;
        if (s.rec.recording) {
            s.last = s.rec.stop();
            result = s.last.length / s.rec.sampleRate;
        } else {
            for (const [k, o] of Object.entries(this.slots)) {
                if (k !== slot && o.rec.recording) o.last = o.rec.stop();
            }
            s.last = null;
            s.rec.start();
            result = null;
        }
        this._onChange();
        return result;
    }

    /** Beide Slots leeren (1:1 aus teslacoil, @dpa 20260716_132014). Läuft gerade eine
     *  Aufnahme, wird sie abgebrochen — „zurücksetzen" heißt: hinterher ist nichts mehr da. */
    resetAll() {
        for (const s of Object.values(this.slots)) {
            if (s.rec.recording) s.rec.stop();
            s.last = null;
        }
        this._onChange();
    }

    /** Länge der letzten Aufnahme dieses Slots in s (0 = noch keine). */
    lastSeconds(slot) {
        const s = this.slots[slot];
        return s.last && s.last.length ? s.last.length / s.rec.sampleRate : 0;
    }

    /** Dieselbe onAction(id)-Signatur wie die anderen ISMs (s. ARCHITEKTUR.md „Buttons → Audio"). */
    onAction(id) {
        if (id === 'debugRec') this.toggle('a');
        else if (id === 'debugRec2') this.toggle('b');
        else if (id === 'debugRecReset') this.resetAll();
        else if (id === 'debugSave') this.saveBundle();
    }

    /** Alle sichtbaren Canvas-Elemente (Scopes/Meter/Seq-Gitter/…) zu EINEM Canvas gestapelt.
     *  Pragmatisch statt Voll-DOM-Screenshot (kein html2canvas o.ä. → keine externe Lib). */
    _captureCanvasesPng() {
        const canvases = [...document.querySelectorAll('canvas')]
            .filter((c) => c.offsetParent !== null && c.width > 0 && c.height > 0);
        if (!canvases.length) return null;
        const w = Math.max(...canvases.map((c) => c.width));
        const h = canvases.reduce((sum, c) => sum + c.height + 4, 0);
        const out = document.createElement('canvas'); out.width = w; out.height = h;
        const cx = out.getContext('2d');
        cx.fillStyle = '#0e1116'; cx.fillRect(0, 0, w, h);
        let y = 0;
        for (const c of canvases) { cx.drawImage(c, 0, y); y += c.height + 4; }
        return out;
    }

    saveBundle() {
        const meta = this.state.get('debugMeta') || {};
        const name = (meta.name || 'debug').trim().replace(/[^a-z0-9_-]+/gi, '_') || 'debug';
        const prefix = `${this.appPrefix}_debug_${name}`;

        // Zustand: voller Config-Dump — für die KI direkt lesbar (wertvollster Teil).
        downloadJSON(this.getFullState(), `${prefix}.json`);

        // Begleit-Prompt (@dpas Notiz/Frage an die KI).
        const prompt = meta.prompt || '';
        if (prompt.trim()) downloadBlob(new Blob([prompt], { type: 'text/plain' }), `${prefix}.txt`);

        // Screenshot: alle sichtbaren Canvas-Elemente gestapelt.
        const canvas = this._captureCanvasesPng();
        if (canvas) canvas.toBlob((blob) => { if (blob) downloadBlob(blob, `${prefix}.png`); });

        // Audio: beide Slots einzeln (a = vorher, b = nachher) — getrennte Dateien, damit
        // sich der Vergleich in der KI nicht erst aus einer Datei schneiden lässt.
        for (const slot of ['a', 'b']) {
            const s = this.slots[slot];
            if (!s.last || !s.last.length) continue;
            const blob = encodeWav({ left: s.last, sampleRateIn: s.rec.sampleRate });
            downloadBlob(blob, `${prefix}_${slot}.wav`);
        }
    }
}

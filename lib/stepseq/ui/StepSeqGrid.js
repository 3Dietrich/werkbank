/**
 * StepSeqGrid.js — editierbares Step-Muster fürs Stepsequenzer-ISM (@dpa 20260722_203201,
 * ddw.md: „neues ISM Stepsequenzer … Erstmal aus teslacoil 'rüberkopieren'").
 *
 * Port aus teslacoils js/ui/StepSeqUI.js (DSP dort js/dsp/stepSeq.js, hier bereits als
 * lib/stepSeq.js im Repo — unverändert 1:1 übernommen, s. dortiger Kopfkommentar). Zwei
 * Unterschiede zum teslacoil-Original bzw. zum alten `#bench-seq`-Bausteinschaukasten:
 *  • NUR EINE Sequenz (kein filter/amp-Paar) — State-Keys fest `seqLen`/`seqSteps`.
 *  • Optik NICHT über ein eigenes MiniSettings-Popover, sondern über die normale Werkbank-
 *    Rechtsklick-Kette (GroupHost.registerCtrlStyle → ElementSettings Typ 'stepseq'):
 *    `applyStyle(s)` wird von GroupHost aufgerufen, kein eigener contextmenu-Handler nötig.
 *  • `engine` ist der reale Trigger-Takt (StepSeqEngine.js), nicht mehr die Demo-Attrappe.
 *
 * Bedienung (Punkt 1, ddw.md, @dpa-Vorgabe zum „off"-Feld der Data-Sektion — s.
 * ElementSettings.js Typ 'stepseq'): zwei Modi, je nach Sq-Ziel/Override:
 *  • off AN (Default, bisheriges Verhalten): Klick = Gate an/aus (null = off = kein
 *    Trigger, die Höhe wird beim Ausschalten gemerkt). Ziehen (> DRAG_THRESH) = Wert setzen.
 *  • off AUS (@dpa: „dann ist die Bedienung flüssiger ohne den 4px Ausschluss, sondern
 *    jeder Klick und Drag-Position geht direkt weiter"): KEIN Toggle, kein DRAG_THRESH —
 *    jeder Klick/jede Bewegung setzt SOFORT den Wert an der Cursor-Y-Position, `0` ist dort
 *    ein ganz normaler Wert (kein Off-Sentinel mehr).
 * Die Werte-Skala (min/max/stepSize) kommt vom gewählten Sq-Ziel (setTargetDefaults(),
 * von multiSq.js aus routing.inputTargets() gespeist), per ctrlStyles-Override (seqMin/
 * seqMax/seqStep/seqOff) übersteuerbar — NICHT mehr fix 0..1.
 */
import { fillSeq, SEQ_MAX } from '../seqCore.js';
import { hint } from '../../i18n.js';

const DRAG_THRESH = 4;
const DEFAULT_STYLE = { boxSize: 270, boxH: 64, bg: '#0e1116', fg: '#ff9f5a' };
// Fallback, solange kein Ziel bekannt ist (setTargetDefaults() nie gerufen) — exakt das
// alte, feste 0..1-Verhalten, damit ohne Wiring nichts bricht.
const DEFAULT_TARGET = { min: 0, max: 1, stepSize: 0, offAllowed: true };

export class StepSeqGrid {
    /**
     * @param {import('../../MiniState.js').MiniState} state
     * @param {import('../StepSeqEngine.js').StepSeqEngine} engine
     */
    constructor(state, engine) {
        this.state = state;
        this.engine = engine;
        this._style = { ...DEFAULT_STYLE };
        this._target = { ...DEFAULT_TARGET };
        this._lastH = new Array(SEQ_MAX).fill(null);   // gemerkte Höhe je Step (Gate-Toggle), null = „noch nie gesetzt"
        this._lastPos = -2;
        this.element = this._build();
    }

    _steps() { return (this.state.get('seqSteps') || []).slice(); }
    _len() { return Math.max(1, Math.min(SEQ_MAX, this.state.get('seqLen') | 0)); }
    // Sofort neu zeichnen (@dpa ddw.md 20260723_210324: „gestoppt kann man Seq daten
    // ändern, aber nur während des Spiels dated die Sichtbarkeit ab, soll: jederzeit") —
    // tick() zeichnet nur bei Playhead-Wechsel, der bei gestopptem Transport nie kommt.
    // Reiner _draw() statt refresh(): das würde zusätzlich das seqLen-Zahlenfeld
    // anfassen/Canvas-Maße prüfen — unnötiger Overhead beim bloßen Step-Editieren.
    _write(arr) { this.state.set('seqSteps', arr); this._draw(); }
    _w() { return Math.max(120, Math.min(900, this._style.boxSize | 0)); }
    _h() { return Math.max(32, Math.min(240, this._style.boxH | 0)); }

    /** Effektive Werte-Skala: ctrlStyles-Override (Data-Sektion) schlägt den Ziel-Default. */
    _min() { const v = this._style.seqMin; return v != null ? v : this._target.min; }
    _max() { const v = this._style.seqMax; const m = v != null ? v : this._target.max; return m > this._min() ? m : this._min() + 1; }
    _stepSize() { const v = this._style.seqStep; return v != null ? v : (this._target.stepSize || 0); }
    _offMode() { const v = this._style.seqOff; return v != null ? v : this._target.offAllowed !== false; }

    /** Vom gewählten Sq-Ziel aus multiSq.js gesetzt (routing.inputTargets()-Eintrag) — NICHT
     *  persistiert, das ist Aufgabe der ctrlStyles-Overrides. Wechselt das Ziel, ruft
     *  multiSq.js das hier neu, damit Skala/Bedienung sofort mitziehen. */
    setTargetDefaults(t) {
        this._target = { ...DEFAULT_TARGET, ...t };
        this.refresh();
    }

    /** y-Pixel → Rohwert im Zielbereich [min,max], auf stepSize gerastert (0 = stufenlos). */
    _heightAtY(y) {
        const min = this._min(), max = this._max(), step = this._stepSize();
        const norm = Math.max(0, Math.min(1, 1 - y / this._h()));
        let v = min + norm * (max - min);
        if (step > 0) v = Math.round(v / step) * step;
        return Math.max(min, Math.min(max, v));
    }
    /** Rohwert → 0..1 für die Balken-Höhe (Rendering), unabhängig von der Skala. */
    _normOf(v) {
        const min = this._min(), max = this._max();
        return Math.max(0, Math.min(1, (v - min) / (max - min)));
    }

    _build() {
        const box = document.createElement('div'); box.className = 'seq group-extra';
        hint(box, 'Step-Muster: Klick schaltet einen Step an/aus, vertikales Ziehen setzt seine Env-Höhe (Velocity). Läuft die Basisclock („An" + Multiplikator/Teiler), triggert jeder aktive Step die gewählte Output-Quelle.');

        const head = document.createElement('div'); head.className = 'seq-head';
        const lab = document.createElement('span'); lab.className = 'seq-lab'; lab.textContent = 'Steps';
        const num = document.createElement('input'); num.type = 'number'; num.className = 'seq-steps';
        num.min = 1; num.max = SEQ_MAX; num.step = 1; num.value = this._len();
        hint(num, 'Sequenz-Länge (1…' + SEQ_MAX + ' Steps)');
        num.addEventListener('change', () => {
            let v = Math.round(parseFloat(num.value) || 1);
            v = Math.max(1, Math.min(SEQ_MAX, v));
            num.value = v; this.state.set('seqLen', v);
        });
        this._num = num;
        const fill = document.createElement('button'); fill.type = 'button'; fill.className = 'pb-btn seq-ic'; fill.textContent = 'Fill';
        hint(fill, 'Fill: sichtbares Muster über den unsichtbaren Rest wiederholen');
        fill.addEventListener('click', () => this._write(fillSeq(this._steps(), this._len())));
        const s0 = document.createElement('button'); s0.type = 'button'; s0.className = 'pb-btn seq-ic'; s0.textContent = '⟲';
        hint(s0, 'set0: der nächste Trigger startet wieder bei Step 1');
        s0.addEventListener('click', () => this.engine.resetSeq());
        head.append(lab, num, fill, s0);
        // Nach außen exponiert, damit multiSq.js sie einzeln bei GroupHost.registerCtrlStyle
        // anmelden kann (eigene Optik-Settings je Knopf, wie jeder andere Button/Opener).
        this.fillBtn = fill; this.set0Btn = s0;

        const cv = document.createElement('canvas'); cv.className = 'seq-canvas';
        cv.width = this._w(); cv.height = this._h();
        this._cv = cv;
        this._wire(cv);

        box.append(head, cv);
        this.refresh();
        return box;
    }

    _stepAtX(x) { const len = this._len(); return Math.max(0, Math.min(len - 1, Math.floor((x / this._w()) * len))); }

    _wire(cv) {
        let start = null, dragging = false, idx0 = -1;
        const at = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
        const setAt = (p) => {
            const arr = this._steps();
            const i = this._stepAtX(p.x);
            const v = this._heightAtY(p.y);
            arr[i] = v;
            this._lastH[i] = v;
            this._write(arr);
        };
        const onMove = (e) => {
            if (!start) return;
            const p = at(e);
            if (this._offMode()) {
                // Wie bisher: erst ab DRAG_THRESH gilt es als Ziehen (sonst würde jeder
                // Klick winzig verrutschen und den Toggle-Zweig in onUp nie erreichen).
                if (!dragging && (Math.abs(p.x - start.x) > DRAG_THRESH || Math.abs(p.y - start.y) > DRAG_THRESH)) dragging = true;
                if (dragging) setAt(p);
            } else {
                // off AUS (@dpa): kein Sonderfall, jede Bewegung setzt sofort den Wert.
                dragging = true;
                setAt(p);
            }
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            if (start && !dragging) {
                if (this._offMode()) {   // reiner Klick = Gate toggeln (off <-> letzter Wert/max)
                    const arr = this._steps();
                    if (arr[idx0] != null) { this._lastH[idx0] = arr[idx0]; arr[idx0] = null; }
                    else { arr[idx0] = this._lastH[idx0] != null ? this._lastH[idx0] : this._max(); }
                    this._write(arr);
                } else {                 // off AUS: reiner Klick setzt direkt den Wert
                    setAt(start);
                }
            }
            start = null; dragging = false;
        };
        cv.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;   // nur linke Taste editiert Steps — RM ist der Settings-Aufruf
            e.preventDefault();
            const p = at(e);
            start = p; dragging = false; idx0 = this._stepAtX(p.x);
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });
    }

    /** Optik + Data-Sektion über die normale Element-Settings-Kette (ElementSettings Typ
     *  'stepseq'): bg/fg/boxSize/boxH wie bisher, PLUS seqMin/seqMax/seqStep/seqOff (Punkt 1,
     *  ddw.md) — GroupHost.registerCtrlStyle ruft das bei jeder Änderung auf. */
    applyStyle(s) {
        this._style = { ...DEFAULT_STYLE, ...s };
        this.refresh();
    }

    /** Aus dem State neu zeichnen (Recall/Edit). Größe kann sich geändert haben. */
    refresh() {
        if (this._num && document.activeElement !== this._num) this._num.value = this._len();
        if (this._cv.width !== this._w()) this._cv.width = this._w();
        if (this._cv.height !== this._h()) this._cv.height = this._h();
        this._lastPos = -2;   // Neuzeichnen erzwingen
        this._draw();
    }

    /** Im Render-Loop: Playhead nur bei Positionswechsel neu zeichnen. */
    tick() {
        const on = this.engine.running;
        const pos = on ? this.engine.seqPos() : -1;
        if (pos !== this._lastPos) { this._lastPos = pos; this._draw(); }
    }

    _draw() {
        const W = this._w(), H = this._h();
        const barCol = this._style.fg;
        const cx = this._cv.getContext('2d');
        const len = this._len();
        const steps = this._steps();
        const on = this.engine.running;
        const pos = on ? this.engine.seqPos() : -1;
        const bw = W / len;
        cx.clearRect(0, 0, W, H);
        cx.fillStyle = this._style.bg; cx.fillRect(0, 0, W, H);
        for (let i = 0; i < len; i++) {
            const x = i * bw;
            const raw = steps[i];
            if (i === pos) { cx.fillStyle = 'rgba(255,255,255,0.10)'; cx.fillRect(x, 0, bw, H); }
            cx.fillStyle = '#2a2f3a'; cx.fillRect(x + 0.5, H - 1, Math.max(1, bw - 1), 1);
            if (raw != null) {
                const norm = this._normOf(raw);
                const bh = Math.max(norm > 0 ? 1 : 0, norm * (H - 2));   // ein winziger Wert bleibt sichtbar
                cx.fillStyle = i === pos ? '#8ff0c0' : barCol;
                cx.fillRect(x + 0.5, H - bh, Math.max(1, bw - 1), bh);
            }
            if (i > 0 && bw > 3) { cx.fillStyle = 'rgba(0,0,0,0.35)'; cx.fillRect(x, 0, 1, H); }
        }
        cx.strokeStyle = '#2a2f3a'; cx.strokeRect(0.5, 0.5, W - 1, H - 1);
    }
}

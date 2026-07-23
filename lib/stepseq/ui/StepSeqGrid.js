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
 * Bedienung unverändert: Klick auf einen Step = Gate an/aus (0 = off = kein Trigger, die
 * Höhe wird beim Ausschalten gemerkt). Ziehen (> DRAG_THRESH) = Env-Höhe (Velocity) setzen,
 * horizontales Wischen malt mehrere Steps.
 */
import { fillSeq, SEQ_MAX } from '../seqCore.js';
import { hint } from '../../i18n.js';

const DRAG_THRESH = 4;
const DEFAULT_STYLE = { boxSize: 270, boxH: 64, bg: '#0e1116', fg: '#ff9f5a' };

export class StepSeqGrid {
    /**
     * @param {import('../../MiniState.js').MiniState} state
     * @param {import('../StepSeqEngine.js').StepSeqEngine} engine
     */
    constructor(state, engine) {
        this.state = state;
        this.engine = engine;
        this._style = { ...DEFAULT_STYLE };
        this._lastH = new Array(SEQ_MAX).fill(1);   // gemerkte Höhe je Step (Gate-Toggle)
        this._lastPos = -2;
        this.element = this._build();
    }

    _steps() { return (this.state.get('seqSteps') || []).slice(); }
    _len() { return Math.max(1, Math.min(SEQ_MAX, this.state.get('seqLen') | 0)); }
    _write(arr) { this.state.set('seqSteps', arr); }
    _w() { return Math.max(120, Math.min(900, this._style.boxSize | 0)); }
    _h() { return Math.max(32, Math.min(240, this._style.boxH | 0)); }

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

        const cv = document.createElement('canvas'); cv.className = 'seq-canvas';
        cv.width = this._w(); cv.height = this._h();
        this._cv = cv;
        this._wire(cv);

        box.append(head, cv);
        this.refresh();
        return box;
    }

    _stepAtX(x) { const len = this._len(); return Math.max(0, Math.min(len - 1, Math.floor((x / this._w()) * len))); }
    _heightAtY(y) { return Math.max(0, Math.min(1, 1 - y / this._h())); }

    _wire(cv) {
        let start = null, dragging = false, idx0 = -1;
        const at = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
        const onMove = (e) => {
            if (!start) return;
            const p = at(e);
            if (!dragging && (Math.abs(p.x - start.x) > DRAG_THRESH || Math.abs(p.y - start.y) > DRAG_THRESH)) dragging = true;
            if (dragging) {
                const arr = this._steps();
                const i = this._stepAtX(p.x);
                const h = this._heightAtY(p.y);
                arr[i] = h;
                if (h > 0) this._lastH[i] = h;
                this._write(arr);
            }
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            if (start && !dragging) {              // reiner Klick = Gate toggeln
                const arr = this._steps();
                if (arr[idx0] > 0) { this._lastH[idx0] = arr[idx0]; arr[idx0] = 0; }
                else { arr[idx0] = this._lastH[idx0] || 1; }
                this._write(arr);
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

    /** Optik über die normale Element-Settings-Kette (ElementSettings Typ 'stepseq'):
     *  bg/fg/boxSize/boxH — GroupHost.registerCtrlStyle ruft das bei jeder Änderung auf. */
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
            const v = Math.max(0, Math.min(1, steps[i] || 0));
            if (i === pos) { cx.fillStyle = 'rgba(255,255,255,0.10)'; cx.fillRect(x, 0, bw, H); }
            cx.fillStyle = '#2a2f3a'; cx.fillRect(x + 0.5, H - 1, Math.max(1, bw - 1), 1);
            if (v > 0) {
                const bh = v * (H - 2);
                cx.fillStyle = i === pos ? '#8ff0c0' : barCol;
                cx.fillRect(x + 0.5, H - bh, Math.max(1, bw - 1), bh);
            }
            if (i > 0 && bw > 3) { cx.fillStyle = 'rgba(0,0,0,0.35)'; cx.fillRect(x, 0, 1, H); }
        }
        cx.strokeStyle = '#2a2f3a'; cx.strokeRect(0.5, 0.5, W - 1, H - 1);
    }
}

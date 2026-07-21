/**
 * ChordMemory.js — der Akkord-Speicher des Poly-Synth als EIGENER, autarker Control
 * (@dpa 20260722_004312: „er soll autark neben keyboard als eigenen Control `speicher`
 * werden"). Vorher war das Raster im PlayKeyboard eingebettet — jetzt ein selbstständiges
 * `u:speicher`-Control mit eigenen Rechtsklick-Settings, das nur über die schmale Naht des
 * Keyboards (snapshotChord/recallChord/onChordChange) an den gespielten Akkord kommt.
 *
 * Slot-Raster (memCols×memRows, NUR über die Settings einstellbar — keine Panel-Knobs mehr):
 *  • Klick auf einen LEEREN Slot  → snapshotChord() hinein (Slot wird „belegt", färbt sich VG2).
 *  • Klick auf einen BELEGTEN Slot → recallChord() (Keyboard schlägt den Akkord an, schaltet
 *    AkIO mit an); der Slot wird zum „aktiven Slot" (VG3), bis am Keyboard wieder gespielt wird.
 *  • Ist der [R]-Reset-Modus aktiv, LÖSCHT ein Klick auf einen belegten Slot ihn stattdessen.
 *  • Doppelklick auf einen Slot → eigenes Kürzel vergeben (@dpa: „ob es nummern sind oder eigene
 *    Kürzel via doppelclick"); Default-Beschriftung sind Nummern ab 1.
 *
 * Farben (Settings): BG = Rasterfläche, VG1 = leerer Slot, VG2 = belegter Slot, VG3 = aktiver
 * (zuletzt abgerufener) Slot. Slot-Größe = Kantenlänge eines quadratischen Slots.
 *
 * Persistenz: die gemerkten Akkorde (`akMemory`) und Kürzel (`akMemLabels`) liegen im
 * polySynthState und reisen in der Snapshot-/Config-Kette mit; Raster-Maße/Farben/Größe
 * liegen als Control-Style (ctrlStyles['u:speicher']) — beides ohne eigene Persistenz.
 */
import { midiToName } from '../pitch/Scaler.js';
import { hint } from '../../i18n.js';

const DEF = { memCols: 3, memRows: 3, slotSize: 22, bg: '', vg1: '', vg2: '', vg3: '' };

export class ChordMemory {
    /**
     * @param {import('../../MiniState.js').MiniState} state
     * @param {import('./PlayKeyboard.js').PlayKeyboard} keyboard
     */
    constructor(state, keyboard) {
        this.state = state;
        this.keyboard = keyboard;
        this._style = { ...DEF };
        this._resetMode = false;    // [R]: belegten Slot löschen statt abrufen (b:akReset-getrieben)
        this._activeSlot = -1;      // zuletzt abgerufener Slot (VG3-Hervorhebung); -1 = keiner
        this._slotEls = [];

        this.element = document.createElement('div');
        this.element.className = 'speicher';
        hint(this.element, 'Akkord-Speicher — leerer Slot: aktuellen Akkord merken · belegter Slot: abrufen (schaltet AkIO an) · Doppelklick: eigenes Kürzel · bei aktivem [R]: belegten Slot löschen. Rastergröße/Farben in den Settings (Rechtsklick).');

        // Am Keyboard gespielt → die „aktiver Slot"-Hervorhebung (VG3) wieder aufheben.
        keyboard.onChordChange(() => { if (this._activeSlot !== -1) { this._activeSlot = -1; this._paintActive(); } });

        this._build();
        state.subscribe((k) => { if (k === 'akMemory' || k === 'akMemLabels' || k === '*') this._build(); });
    }

    /** Control-Style anwenden (Rastergröße/Farben/Slot-Größe) — von ElementSettings gerufen. */
    applyStyle(s) {
        this._style = { ...DEF, ...(s || {}) };
        this._build();
    }

    /** b:akReset gedrückt → Reset-Modus umschalten (der Button zeigt seinen Zustand selbst). */
    toggleReset() { this._resetMode = !this._resetMode; }

    _cols() { return Math.max(1, Math.min(12, this._style.memCols | 0 || DEF.memCols)); }
    _rows() { return Math.max(1, Math.min(12, this._style.memRows | 0 || DEF.memRows)); }

    /** Beschriftung eines Slots: eigenes Kürzel (akMemLabels), sonst Nummer ab 1. */
    _labelFor(i) {
        const labels = this.state.get('akMemLabels') || {};
        const custom = labels[i];
        return (custom != null && custom !== '') ? String(custom) : String(i + 1);
    }

    _build() {
        const cols = this._cols(), rows = this._rows();
        const size = Math.max(12, Math.min(80, this._style.slotSize | 0 || DEF.slotSize));
        const mem = this.state.get('akMemory') || [];
        const el = this.element;
        el.innerHTML = '';
        el.style.setProperty('--spk-cols', cols);
        el.style.setProperty('--spk-slot', size + 'px');
        if (this._style.bg) el.style.setProperty('--spk-bg', this._style.bg); else el.style.removeProperty('--spk-bg');
        if (this._style.vg1) el.style.setProperty('--spk-vg1', this._style.vg1); else el.style.removeProperty('--spk-vg1');
        if (this._style.vg2) el.style.setProperty('--spk-vg2', this._style.vg2); else el.style.removeProperty('--spk-vg2');
        if (this._style.vg3) el.style.setProperty('--spk-vg3', this._style.vg3); else el.style.removeProperty('--spk-vg3');
        this._slotEls = [];
        for (let i = 0; i < cols * rows; i++) {
            const slot = mem[i];
            const filled = Array.isArray(slot) && slot.length > 0;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'spk-slot' + (filled ? ' filled' : '') + (i === this._activeSlot ? ' active' : '');
            btn.textContent = this._labelFor(i);
            btn.title = filled
                ? (slot.map((s) => midiToName(s.note)).join(' ') + ' — Klick: abrufen · Doppelklick: Kürzel · [R]: löschen')
                : 'Leer — Klick merkt den aktuell aktiven Akkord · Doppelklick: Kürzel';
            btn.addEventListener('click', () => this._onSlotClick(i));
            btn.addEventListener('dblclick', (e) => { e.preventDefault(); this._onSlotRename(i); });
            el.appendChild(btn);
            this._slotEls.push(btn);
        }
    }

    /** Nur die „aktiver Slot"-Klasse neu setzen (ohne vollen Rebuild) — für die VG3-Hervorhebung. */
    _paintActive() {
        this._slotEls.forEach((b, i) => b.classList.toggle('active', i === this._activeSlot));
    }

    /** Klick auf einen Slot: [R] löscht belegten Slot, sonst belegten abrufen / leeren merken. */
    _onSlotClick(i) {
        const mem = (this.state.get('akMemory') || []).slice();
        const slot = mem[i];
        const filled = Array.isArray(slot) && slot.length > 0;
        if (this._resetMode) {
            if (filled) { mem[i] = null; if (i === this._activeSlot) this._activeSlot = -1; this.state.set('akMemory', mem); }
            return;
        }
        if (filled) {
            this.keyboard.recallChord(slot);   // abrufen (schaltet AkIO an)
            this._activeSlot = i;              // dieser Slot ist jetzt der aktive (VG3)
            this._paintActive();
            return;
        }
        const snap = this.keyboard.snapshotChord();   // merken
        if (!snap.length) return;                     // nichts aktiv → nichts speichern
        mem[i] = snap;
        this.state.set('akMemory', mem);
    }

    /** Doppelklick: eigenes Kürzel vergeben (leer = zurück zur Nummer). */
    _onSlotRename(i) {
        const labels = { ...(this.state.get('akMemLabels') || {}) };
        const cur = labels[i] != null ? labels[i] : '';
        const next = window.prompt(`Kürzel für Slot ${i + 1} (leer = Nummer ${i + 1}):`, cur);
        if (next == null) return;                     // abgebrochen
        if (next.trim() === '') delete labels[i]; else labels[i] = next.trim();
        this.state.set('akMemLabels', labels);
    }

    mount(parent) { parent.appendChild(this.element); }
}

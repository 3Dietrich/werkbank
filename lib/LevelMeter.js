/**
 * LevelMeter.js – Pegelanzeige des Master-Ausgangs (@dpa 20260722, ddw.md „ich brauche auch
 * einen LevelMeter (wie in teslacoil), aber auch mit Settings").
 *
 * Senkrechter Canvas-Balken, RMS über ein kurzes Zeitfenster (analyser.getFloatTimeDomainData),
 * mit kurzer Peak-Hold-Linie (klassisches VU-Verhalten: sofort hoch, ~0.8s halten, dann
 * langsam abfallen). Zapft lib/audioBus.js NACH dem Master-Fader ab (zeigt also dessen
 * Wirkung), unabhängig vom Limiter-IO-Schalter (s. audioBus.js-Kopfkommentar).
 *
 * Settings (@dpa: „probier es, ohne mich auszufragen"): nur Balkenfarbe + Größe — ohne
 * eigene Farbe bleibt der eingebaute Grün→Gelb→Rot-Verlauf, mit eigener Farbe wird der
 * Balken einfarbig (vorhersehbar statt zwei Verläufe zu mischen).
 */
import { hint } from './i18n.js';

const MIN_DB = -60, MAX_DB = 6;
const norm = (db) => Math.max(0, Math.min(1, (db - MIN_DB) / (MAX_DB - MIN_DB)));

export class LevelMeter {
    /** @param {() => AnalyserNode|null} getAnalyser */
    constructor(getAnalyser) {
        this._getAnalyser = getAnalyser;
        this._buf = null;
        this._holdDb = MIN_DB;
        this._holdT = 0;
        this._fg = '';
        this.element = document.createElement('canvas');
        this.element.className = 'level-meter';
        this.element.width = 20; this.element.height = 130;
        hint(this.element, 'Pegel des Master-Ausgangs, nach Lautstärke (vor/unabhängig vom Limiter). Rechtsklick = Settings.');
        this._paint();
    }

    /** Rechtsklick-Settings (ElementSettings type 'levelmeter': fg/bg/boxSize/boxH). */
    applyStyle(s) {
        this._fg = s.fg || '';
        this.element.style.background = s.bg || '';
        if (s.boxSize) this.element.width = s.boxSize;
        if (s.boxH) this.element.height = s.boxH;
        this._paint();
    }

    /** Läuft im Render-Loop (wie baseKeyboard.tick/Readout.tick). */
    tick() {
        const an = this._getAnalyser();
        let db = MIN_DB;
        if (an) {
            if (!this._buf || this._buf.length !== an.fftSize) this._buf = new Float32Array(an.fftSize);
            an.getFloatTimeDomainData(this._buf);
            let sum = 0;
            for (let i = 0; i < this._buf.length; i++) sum += this._buf[i] * this._buf[i];
            const rms = Math.sqrt(sum / this._buf.length);
            db = rms > 0 ? 20 * Math.log10(rms) : MIN_DB;
        }
        db = Math.max(MIN_DB, Math.min(MAX_DB, db));
        const now = performance.now();
        if (db >= this._holdDb) { this._holdDb = db; this._holdT = now; }
        else if (now - this._holdT > 800) this._holdDb = Math.max(db, this._holdDb - 0.6);
        this._paint(db);
    }

    _paint(db = MIN_DB) {
        const ctx = this.element.getContext('2d'), w = this.element.width, h = this.element.height;
        ctx.clearRect(0, 0, w, h);
        const barH = norm(db) * h;
        if (this._fg) {
            ctx.fillStyle = this._fg;
        } else {
            const grad = ctx.createLinearGradient(0, h, 0, 0);
            grad.addColorStop(0, '#6ee7a8'); grad.addColorStop(0.75, '#ffd166'); grad.addColorStop(1, '#ff5a5a');
            ctx.fillStyle = grad;
        }
        ctx.fillRect(0, h - barH, w, barH);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, h - norm(this._holdDb) * h - 1, w, 2);
    }

    mount(parent) { parent.appendChild(this.element); }
}

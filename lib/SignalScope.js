/**
 * SignalScope.js — schmales Steuersignal-Oszilloskop zum „Reinklinken" (@dpa 20260726).
 *
 * Zweck: sehen, was ein Modulator (Env, Seq, …) TATSÄCHLICH liefert — in Audiospeed,
 * schmal wie ein Meter, mit einstellbarem Zeitfenster (Buffer). Gedacht als Debug-Helfer,
 * der danach als Anzeige-Control weiterlebt.
 *
 * ── Reinklinken OHNE die Verbindung zu unterbrechen ────────────────────────────
 * Der Scope ist ein eigenes Routing-Modul mit
 *   input  'in'   — hier schickt man die Quelle hin (statt/zusätzlich zum Ziel)
 *   output 'out'  — liefert den EMPFANGENEN Wert unverändert weiter (Passthrough)
 * Wer den Scope „dazwischen" hängt, verliert also nichts: Quelle → Scope.in,
 * Scope.out → ursprüngliches Ziel. Wer nur mitlesen will, schickt die Quelle
 * zusätzlich an Scope.in und lässt die Originalverbindung stehen.
 *
 * ── Darstellung ───────────────────────────────────────────────────────────────
 * Ringpuffer über `bufferMs` (2–100 ms … bis 2 s für langsame Envs), gezeichnet als
 * Kurve auf einem Canvas. Zusätzlich eine Meter-Säule (aktueller Wert) — beides in
 * EINEM schmalen Element, per Settings umschaltbar.
 *
 * ── Sorte (ARCHITEKTUR.md) ────────────────────────────────────────────────────
 * CONTROL — freistehendes Widget mit eigenem mount(), wird per host.mountInGroup()
 * + host.registerCtrlStyle('u:scope_i', 'scope', el, applyStyle) in eine Gruppe
 * gehängt. Optik/Buffer/min/max liegen als ctrlStyle (Rechtsklick-Settings),
 * NICHT als Panel-Knobs.
 */

const DEFAULTS = {
    bufferMs: 40,      // Zeitfenster des Ringpuffers
    minVal: 0,
    maxVal: 1,
    autoRange: true,   // min/max automatisch mitziehen (Steuersignale haben ganz verschiedene Bereiche)
    showMeter: true,   // Meter-Säule rechts
    showCurve: true,   // Kurve
    width: 120,
    height: 34,
    bg: '#0e1116',
    curveColor: '#5ad1ff',
    meterColor: '#82ba90',
    gridColor: 'rgba(255,255,255,0.12)',
};

export class SignalScope {
    /**
     * @param {object} opts
     * @param {string} [opts.label]  Beschriftung (wie bei anderen Controls)
     */
    constructor(opts = {}) {
        this.style = { ...DEFAULTS, ...(opts.style || {}) };
        this.label = opts.label || 'Scope';
        this._buf = [];            // { t: performance.now(), v }
        this._last = 0;
        this._seen = { min: Infinity, max: -Infinity };

        // Eigene Klassennamen (sig-*) — .scope-canvas ist schon vom großen Oszilloskop
        // (lib/Scopes.js + css/main.css) belegt, das würde die Größe überschreiben.
        const wrap = document.createElement('div');
        wrap.className = 'sigscope-field';
        const lab = document.createElement('span');
        lab.className = 'sigscope-label';
        lab.textContent = this.label;
        const canvas = document.createElement('canvas');
        canvas.className = 'sigscope-canvas';
        const read = document.createElement('span');
        read.className = 'sigscope-read';
        wrap.append(lab, canvas, read);

        this.element = wrap;
        this._lab = lab;
        this._canvas = canvas;
        this._read = read;
        this._ctx2d = canvas.getContext('2d');
        this.applyStyle(this.style);
    }

    /** Wert einspeisen (aus dem Routing-write). Wird NICHT gezeichnet — das macht tick(). */
    push(v) {
        const n = Number(v);
        if (!Number.isFinite(n)) return;
        this._last = n;
        if (n < this._seen.min) this._seen.min = n;
        if (n > this._seen.max) this._seen.max = n;
        this._buf.push({ t: performance.now(), v: n });
        this._trim();
    }

    _trim() {
        const cutoff = performance.now() - this.style.bufferMs;
        let i = 0;
        while (i < this._buf.length && this._buf[i].t < cutoff) i++;
        if (i > 0) this._buf.splice(0, i);
    }

    /** Optik/Verhalten aus den Settings (ctrlStyles) anwenden. */
    applyStyle(s = {}) {
        this.style = { ...this.style, ...s };
        const st = this.style;
        const w = Math.max(24, st.width | 0), h = Math.max(12, st.height | 0);
        const dpr = window.devicePixelRatio || 1;
        this._canvas.width = w * dpr;
        this._canvas.height = h * dpr;
        this._canvas.style.width = w + 'px';
        this._canvas.style.height = h + 'px';
        this._ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        this._lab.textContent = st.label || this.label;
        this._lab.style.display = st.labelPos === 'off' ? 'none' : '';
        this.element.style.background = st.bg || '';
        this._read.style.display = st.hideValue ? 'none' : '';
    }

    /** Ringpuffer zeichnen — aus dem Render-Loop aufrufen (wie LevelMeter.tick). */
    tick() {
        const st = this.style;
        const c = this._ctx2d;
        const w = this._canvas.width / (window.devicePixelRatio || 1);
        const h = this._canvas.height / (window.devicePixelRatio || 1);
        this._trim();

        c.clearRect(0, 0, w, h);
        c.fillStyle = st.bg || '#0e1116';
        c.fillRect(0, 0, w, h);

        // Bereich bestimmen
        let lo = st.minVal, hi = st.maxVal;
        if (st.autoRange && this._seen.max > this._seen.min) {
            lo = Math.min(lo, this._seen.min);
            hi = Math.max(hi, this._seen.max);
        }
        if (hi - lo < 1e-9) hi = lo + 1;
        const y = (v) => h - ((v - lo) / (hi - lo)) * h;

        // Null-/Grundlinie
        c.strokeStyle = st.gridColor;
        c.lineWidth = 1;
        c.beginPath();
        const yz = y(lo <= 0 && hi >= 0 ? 0 : lo);
        c.moveTo(0, yz); c.lineTo(w, yz); c.stroke();

        const meterW = st.showMeter ? 6 : 0;
        const curveW = Math.max(2, w - meterW - (meterW ? 2 : 0));

        // Kurve über das Zeitfenster
        if (st.showCurve && this._buf.length > 1) {
            const t1 = performance.now();
            const t0 = t1 - st.bufferMs;
            c.strokeStyle = st.curveColor;
            c.lineWidth = 1.5;
            c.beginPath();
            let started = false;
            for (const p of this._buf) {
                const x = ((p.t - t0) / st.bufferMs) * curveW;
                const py = y(p.v);
                if (!started) { c.moveTo(x, py); started = true; } else c.lineTo(x, py);
            }
            c.stroke();
        }

        // Meter-Säule (aktueller Wert)
        if (st.showMeter) {
            const x0 = w - meterW;
            c.fillStyle = st.gridColor;
            c.fillRect(x0, 0, meterW, h);
            c.fillStyle = st.meterColor;
            const yv = y(this._last);
            const base = y(lo <= 0 && hi >= 0 ? 0 : lo);
            const top = Math.min(yv, base), bot = Math.max(yv, base);
            c.fillRect(x0, top, meterW, Math.max(1, bot - top));
        }

        if (!st.hideValue) {
            const d = Math.abs(this._last) >= 100 ? 0 : Math.abs(this._last) >= 1 ? 2 : 3;
            this._read.textContent = this._last.toFixed(d);
        }
    }

    /** Puffer + Auto-Range zurücksetzen (z.B. nach Zielwechsel). */
    reset() {
        this._buf.length = 0;
        this._last = 0;
        this._seen = { min: Infinity, max: -Infinity };
    }
}

export { DEFAULTS as SCOPE_DEFAULTS };

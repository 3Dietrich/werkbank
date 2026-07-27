/**
 * SignalScope.js — schmales Steuersignal-Oszilloskop, REINE ANZEIGE (@dpa 20260726,
 * Korrektur nach Fehlversuch: „ein Meter ist eine ANZEIGE, die braucht kein Output,
 * sondern die Quelle, die sie anzeigt — OHNE den Fluss zum eigentlichen Ziel zu
 * unterbrechen").
 *
 * Zweck: sehen, was ein Modulator (Env, Seq, …) TATSÄCHLICH liefert — in Audiospeed,
 * schmal wie ein Meter, mit einstellbarem Zeitfenster (Buffer).
 *
 * ── „Reinklinken" heißt hier: LESEN, NICHT VERKABELN ───────────────────────────
 * Der Scope ist KEIN Routing-Modul, hat KEINEN Input-Port, schreibt NIRGENDS hin.
 * Er wählt per PickMenu eine bestehende Quelle (irgendeinen `read()`-fähigen Output-
 * Port, s. `routing.outputSources()`) und liest ihren Wert jeden Frame passiv über
 * `routing.getValue({module, port})` — GENAU dieselbe Methode, mit der auch `flush()`
 * verbundene Ports sampelt. Der bestehende Signalweg (Quelle → echtes Ziel) läuft
 * komplett unabhängig weiter; der Scope kann ihn gar nicht unterbrechen, weil er
 * nirgends im Zustellpfad sitzt.
 *
 * ── Darstellung ───────────────────────────────────────────────────────────────
 * Ringpuffer über `bufferMs` (2 ms … mehrere s für langsame Envs), gezeichnet als
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
    // Genauigkeit (ddw.md 20260727, „frame vs. samplegenau"): 'frame' (Default) liest die
    // Quelle einmal pro Render-Frame passiv via routing.getValue() — das ist das bisherige
    // Verhalten und kann sehr kurze Pulse (kürzer als ein Frame) verpassen/ungenau zeigen.
    // 'sample' hängt sich stattdessen mit einem echten AnalyserNode audio-rate an die Quelle
    // (Vorbild Scopes.js:173) — NUR möglich, wenn die Quelle einen echten AudioNode hat (s.
    // hasNode() unten); sonst fällt 'sample' still auf 'frame' zurück (kein Fehler, s. Grill-
    // Runde @dpa 20260727: Toggle zeigt dann einfach wieder 'frame').
    accuracy: 'frame',
};

// AnalyserNode-Obergrenze (fftSize max. 32768, s. Web-Audio-Spec) — gilt für JEDEN Analyser,
// unabhängig davon, ob man ihn für FFT/Spektrum oder (wie hier) reinen Zeitbereichs-Abgriff
// nutzt. Bei 'sample' wird bufferMs intern darauf geklemmt (Grill-Runde @dpa 20260727).
const MAX_FFT_SIZE = 32768;
const MIN_FFT_SIZE = 32;

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
        // Gewählte Quelle (kein Port am Scope selbst — reines Ablesen fremder Ports).
        this._srcRef = null;   // { module, port } oder null = keine Quelle gewählt
        // Sample-Genauigkeit (s. DEFAULTS.accuracy-Kommentar): _hasNode ist der billige
        // Fähigkeits-Check (kein Erzeugen), _nodeGetter der LAZY Zugriff auf den echten
        // AudioNode — nur aufgerufen, wenn 'sample' tatsächlich aktiv wird.
        this._hasNode = false;
        this._nodeGetter = null;
        this._analyser = null;       // AnalyserNode, nur während 'sample' aktiv ist
        this._analyserSrc = null;    // der daran angeschlossene Quell-Node (zum sauberen disconnect)
        this._analyserBuf = null;    // Float32Array-Lesepuffer
        this._analyserBufferMs = null;   // bufferMs, mit dem der Analyser aktuell aufgebaut ist

        // Eigene Klassennamen (sig-*) — .scope-canvas ist schon vom großen Oszilloskop
        // (lib/Scopes.js + css/main.css) belegt, das würde die Größe überschreiben.
        const wrap = document.createElement('div');
        wrap.className = 'sigscope-field';
        // Kopfzeile: Label + Genauigkeits-Badge NEBENEINANDER (wrap ist column-flex, darum
        // eigene Reihe nötig, sonst würde der Badge unter das Label rutschen).
        const head = document.createElement('div');
        head.className = 'sigscope-head';
        const lab = document.createElement('span');
        lab.className = 'sigscope-label';
        lab.textContent = this.label;
        // Genauigkeits-Badge (ddw.md 20260727, @dpa: „'frame' vielleicht als farblichen oder
        // Icon Hinweis in den Scopes?") — winziger Buchstabe direkt am Scope, damit man auf
        // einen Blick sieht, ob GERADE frame- oder sample-genau angezeigt wird (nicht nur im
        // Settings-Panel sichtbar). F = neutral/gedämpft, S = Akzentfarbe (wie das „!"-CPU-
        // Hinweis-Icon in den Settings).
        const badge = document.createElement('span');
        badge.className = 'sigscope-mode';
        head.append(lab, badge);
        const canvas = document.createElement('canvas');
        canvas.className = 'sigscope-canvas';
        const read = document.createElement('span');
        read.className = 'sigscope-read';
        wrap.append(head, canvas, read);

        this.element = wrap;
        this._lab = lab;
        this._badge = badge;
        this._canvas = canvas;
        this._read = read;
        this._ctx2d = canvas.getContext('2d');
        this.applyStyle(this.style);
    }

    /** Welche Quelle abgelesen wird — {module, port, hasNode?, node?} (aus
     *  routing.outputSources()) oder null (keine Quelle, Scope zeigt nichts). Setzt NIE
     *  etwas an der Quelle selbst. hasNode/node s. DEFAULTS.accuracy-Kommentar. */
    setSource(ref) {
        this._teardownAnalyser();
        this._srcRef = ref ? { module: ref.module, port: ref.port } : null;
        this._hasNode = !!(ref && ref.hasNode);
        this._nodeGetter = (ref && typeof ref.node === 'function') ? ref.node : null;
        this.reset();
        this._syncAccuracy();
    }
    get source() { return this._srcRef; }

    /** Kann die AKTUELLE Quelle 'sample' überhaupt bedienen? (billiger Check, kein Erzeugen —
     *  fürs Ausgrauen des Toggles in den Element-Settings, s. ElementSettings.js). */
    hasNode() { return this._hasNode; }

    /** Effektive Genauigkeit gerade JETZT (fällt still auf 'frame' zurück, wenn die Quelle
     *  keinen Node hat — Grill-Runde @dpa 20260727: „automatisch still auf frame zurückfallen,
     *  keine Fehlermeldung"). */
    _effectiveAccuracy() {
        return (this.style.accuracy === 'sample' && this._hasNode) ? 'sample' : 'frame';
    }

    /** AnalyserNode je nach effektiver Genauigkeit auf-/abbauen (Quellwechsel, Style-Änderung,
     *  bufferMs-Änderung). Nicht-invasiv: `connect()` zapft den Quell-Node nur ab, ohne seinen
     *  bestehenden Signalweg zu verändern (s. Datei-Kopf „Reinklinken heißt LESEN, NICHT
     *  VERKABELN" — gilt für 'sample' genauso wie für 'frame'). */
    _syncAccuracy() {
        const want = this._effectiveAccuracy() === 'sample';
        if (want && !this._analyser) this._setupAnalyser();
        if (!want && this._analyser) this._teardownAnalyser();
        this._paintBadge();
    }

    _setupAnalyser() {
        const node = this._nodeGetter && this._nodeGetter();
        if (!node) return;   // Quelle behauptet hasNode, liefert aber (noch) keinen — bleibt bei frame
        const ctx = node.context;
        const sr = ctx.sampleRate;
        // Buffer-Deckel (Grill-Runde @dpa 20260727): AnalyserNode deckt MAXIMAL MAX_FFT_SIZE
        // Samples ab (≈682ms@48kHz) — bufferMs wird dafür intern geklemmt, nicht als Fehler
        // behandelt. Bei sehr kleinem bufferMs mindestens MIN_FFT_SIZE (Web-Audio-Untergrenze).
        const wantSamples = Math.ceil((this.style.bufferMs / 1000) * sr);
        let fftSize = MIN_FFT_SIZE;
        while (fftSize < wantSamples && fftSize < MAX_FFT_SIZE) fftSize *= 2;
        const an = ctx.createAnalyser();
        an.fftSize = fftSize;
        an.smoothingTimeConstant = 0;   // rohe Samples, keine Glättung — wir wollen die echte Kurve
        node.connect(an);   // Tap, KEIN Umbau des bestehenden Signalwegs (an bleibt unverbunden weiter)
        this._analyser = an;
        this._analyserSrc = node;
        this._analyserBuf = new Float32Array(fftSize);
        this._analyserBufferMs = this.style.bufferMs;
    }

    _teardownAnalyser() {
        if (this._analyser && this._analyserSrc) {
            try { this._analyserSrc.disconnect(this._analyser); } catch { /* schon getrennt */ }
        }
        this._analyser = null;
        this._analyserSrc = null;
        this._analyserBuf = null;
        this._analyserBufferMs = null;
    }

    _paintBadge() {
        const sample = this._effectiveAccuracy() === 'sample';
        this._badge.textContent = sample ? 'S' : 'F';
        this._badge.title = sample
            ? 'sample-genau (AnalyserNode, kann deutlich mehr CPU kosten)'
            : 'frame-genau (einmal pro Anzeige-Frame)';
        this._badge.classList.toggle('sigscope-mode-sample', sample);
    }

    /** Einen Wert ins Ringpuffer-Diagramm aufnehmen (intern, von sample() gerufen). */
    _push(v) {
        const n = Number(v);
        if (!Number.isFinite(n)) return;
        this._last = n;
        if (n < this._seen.min) this._seen.min = n;
        if (n > this._seen.max) this._seen.max = n;
        this._buf.push({ t: performance.now(), v: n });
        this._trim();
    }

    /** Aus dem Render-Loop: die gewählte Quelle PASSIV ablesen (routing.getValue), ohne
     *  irgendetwas zu schreiben. Ohne gewählte Quelle passiert nichts — bewusst KEIN
     *  Default-Wert 0, sonst sähe „keine Quelle" aus wie „Quelle liefert 0". */
    sample(routing) {
        if (!this._srcRef) return;
        const v = routing.getValue(this._srcRef);
        if (v !== undefined) this._push(v);
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
        // bufferMs kann sich geändert haben → fftSize muss neu bestimmt werden. NUR bei
        // tatsächlicher Änderung neu aufbauen (nicht bei jedem Style-Tastendruck den Analyser
        // wegwerfen — applyStyle feuert live bei jeder Feldänderung im Settings-Panel).
        if (this._analyser && this._analyserBufferMs !== st.bufferMs) this._teardownAnalyser();
        this._syncAccuracy();
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

        // Kurve über das Zeitfenster — 'sample': echte Audio-Samples aus dem AnalyserNode
        // (dessen interner Ring-Puffer läuft KONTINUIERLICH auf Audio-Rate, unabhängig davon,
        // wie oft/wann tick() sie ausliest — genau das behebt das "kurze Envs sehen jedes Mal
        // anders/ungenau aus"-Problem, ddw.md 20260727: kein noch so kurzer Puls kann zwischen
        // zwei tick()-Aufrufen verschwinden, wie es beim Frame-Polling passieren kann).
        // 'frame': der bisherige Ringpuffer aus sample()/routing.getValue() (unverändert).
        if (st.showCurve && this._analyser) {
            this._analyser.getFloatTimeDomainData(this._analyserBuf);
            const n = this._analyserBuf.length;
            c.strokeStyle = st.curveColor;
            c.lineWidth = 1.5;
            c.beginPath();
            for (let i = 0; i < n; i++) {
                const x = (i / (n - 1)) * curveW;
                const py = y(this._analyserBuf[i]);
                if (i === 0) c.moveTo(x, py); else c.lineTo(x, py);
            }
            c.stroke();
        } else if (st.showCurve && this._buf.length > 1) {
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

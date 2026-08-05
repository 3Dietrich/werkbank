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
 * gehängt. Die OPTIK dieses Controls selbst (Buffer/min/max/Farben) liegt als ctrlStyle
 * (Rechtsklick-Settings) — das gilt weiterhin NUR für dieses eine Canvas-Widget (Korrektur
 * @dpa 20260804, Grill-Runde „Datei-Kopf lügt": ist keine Aussage über Geschwister-Controls
 * in derselben Gruppe). Sync/Freeze/Trigger-Position/Sync-Offset sind eigene, ECHTE
 * GroupHost-Controls (Buttons/Knobs) NEBEN diesem Widget, s. lib/scope/multiScope.js — dort
 * entscheidet sich pragmatisch, ob sie auf dem Panel oder im Settings-Popup landen.
 *
 * ── Sync/Freeze (ddw.md 20260727_111500, ausgebaut @dpa 20260804) ─────────────────────
 * Zusätzlich zum reinen Anzeige-Modus (`sample()`/`tick()` oben) kann dieser Control per
 * `setSyncOn(true)` einen EIGENEN, dauerhaften ScriptProcessorNode-Tap öffnen (nicht
 * AudioWorklet — Playwright-Sandbox hängt bei `addModule()`, s. lib/debugPanel/
 * DebugRecorder.js-Kopf; ScriptProcessorNode fällt laut test/debugPanel_smoke.py NICHT
 * unter die Headless-Audio-Falle). Der Tap füllt einen zeitgestempelten Ringpuffer
 * (`_tapRing`), aus dem `lib/scope/triggerSync.js` (reine, testbare Funktionen) ein exakt
 * am letzten Beat ausgerichtetes Fenster herausschneidet — Trigger-Position (0..1 im
 * Fenster) und Sync-Offset (ms, verschiebt den Referenz-Beat selbst) sind von außen gesetzt
 * (multiScope.js verdrahtet sie an echte Knob-Controls). NUR möglich, wenn die Quelle einen
 * echten AudioNode hat (`hasNode()`, wie 'sample') — der Sync-Button wird sonst ausgegraut,
 * kein Fehler. `freeze()`/`unfreeze()` sind UNABHÄNGIG von Sync nutzbar (jeder Modus):
 * Erfassung läuft im Hintergrund weiter, Freeze nimmt eine EXPLIZITE Kopie des gerade
 * gezeichneten Fensters, Mouse-Over darauf liest Werte aus der Kopie; Entfrieren springt
 * hart auf live zurück (keine Überblendung, @dpa-Vorgabe).
 *
 * ── Zoom/Pan (Touchpad, @dpa 20260804) ─────────────────────────────────────────
 * `bufferMs` bleibt die VOLL ausgezoomte Ansicht (der eingegebene Puffer, z.B. 100ms) —
 * Zoom cropt rein DARIN, es wird nie mehr Zeit angezeigt als bufferMs abdeckt. Gesten
 * (Vorbild /Users/dpa/hass/sensor-archive/mac/index.html gesturePlugin, Achsen-Lock ~140ms):
 * 2-Finger SENKRECHT (⇅) → zoomen, 2-Finger WAAGERECHT (⇆) → Zeitfenster verschieben.
 * Zoom-Anker: bei aktivem Sync IMMER der Trigger (bleibt beim Zoomen an Ort und Stelle) —
 * sonst die Mausposition. Doppelklick / der ⟲-Button (multiScope.js) setzen auf voll
 * ausgezoomt zurück. Reine Anzeige-Navigation, bewusst NICHT persistiert (wie Sync/Freeze
 * selbst, s. multiScope.js VALUE_KEYS-Kommentar) — nach Reload wieder voll ausgezoomt.
 * `_zoomSpan`/`_zoomStart` sind Anteile (0..1) der VOLLEN t0..t1-Spanne, die JEDER der vier
 * Zeichenpfade (Sync-Ring, Freeze-Ring, Freeze-Points, Live-Analyser, Live-Buf) über
 * `_viewWindow()`/`_drawRingCurve()`/`_drawPointsCurve()` gleich anwendet.
 *
 * ── An/Aus (@dpa 20260805: „braucht noch einen ON/OFF Button, auch CPU entlastet
 * wenn off") ─────────────────────────────────────────────────────────────────
 * `setOn(false)` ist der EINZIGE Schalter, der `sample()`/`tick()` komplett stilllegt
 * (frühes `return`, kein Trim/Draw) UND `_syncAccuracy()`/`_syncTap()` erzwingt, dass
 * AnalyserNode bzw. der ScriptProcessorNode-Tap abgebaut werden — beides ist die
 * eigentliche CPU-Last (Sample-genauer Modus liest audio-rate, Sync hält einen
 * dauerhaften Audio-Thread-Callback offen). Umgesetzt über ein zusätzliches `&& this._on`
 * in den `want`-Bedingungen von `_syncAccuracy()`/`_syncTap()` — EINE Quelle der Wahrheit,
 * kein separater Teardown-Pfad in `setOn()` selbst. `_srcRef`/`_syncOn`/`accuracy` bleiben
 * beim Ausschalten unverändert erhalten, `setOn(true)` baut über dieselben Methoden genau
 * das wieder auf, was vorher aktiv war. Anders als Sync/Freeze/Zoom (reine, absichtlich
 * NICHT persistierte Anzeige-Navigation) ist An/Aus als `scopeOn` in multiScope.js
 * VALUE_KEYS mit drin — der Sinn ist ja gerade, einen nicht gebrauchten Scope dauerhaft
 * (über Reload/Preset hinweg) CPU-schonend abzuschalten, kein transienter UI-Zustand.
 * Visuell: `.sigscope-off` (CSS-Klasse aufs wrap-Element) dimmt die ganze Anzeige — kein
 * eigener Redraw-Pfad nötig, das letzte gezeichnete Bild bleibt (gedimmt) stehen.
 */

import { chooseTriggerWindow, extractRingWindow } from './scope/triggerSync.js';

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

// Kleinstes Zoom-Fenster (Anteil der vollen bufferMs-Spanne, s. Datei-Kopf „Zoom/Pan") —
// verhindert Reinzoomen bis auf eine einzelne Sample-Breite (Rendering würde sonst
// degenerieren). 1% deckt bei typischen Puffergrößen (40–500ms) immer noch mehrere
// Samples ab.
const MIN_ZOOM_SPAN = 0.01;

// Kapazität des Sync-Tap-Ringpuffers (Grill-Runde @dpa 20260804, Sync/Freeze): großzügiger
// fester Sekunden-Deckel, NUR interne Implementierungskapazität (Vorbild LOOKAHEAD_CAPACITY_S
// in lib/audio/limiterProcessor.js) — kein User-Limit. 4s reicht für jeden praktikablen
// bufferMs-Wert plus Toleranz für den gewählten Trigger-Offset.
const TAP_CAPACITY_S = 4;

export class SignalScope {
    /**
     * @param {object} opts
     * @param {string} [opts.label]  Beschriftung (wie bei anderen Controls)
     */
    constructor(opts = {}) {
        this.style = { ...DEFAULTS, ...(opts.style || {}) };
        this.label = opts.label || 'Scope';
        this._on = true;       // An/Aus — steuert Sampling und CPU-Teardown
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

        // ── Sync (Trigger auf den Takt-Beat) — s. Datei-Kopf ────────────────────────────
        this._syncOn = false;
        this._triggerPos = 0.5;      // 0..1, Position des Beats im Anzeige-Fenster (0.5=mittig)
        this._syncOffsetMs = 0;      // verschiebt den Referenz-Beat selbst (± ms, s. Datei-Kopf)
        this._beatTimes = [];        // AudioContext-Sekunden, von außen via addBeat() gefüttert
        this._tapProc = null;        // ScriptProcessorNode (DebugRecorder-Muster, dauerhaft offen)
        this._tapSrc = null;         // der angezapfte Quell-Node
        this._tapSink = null;        // stummer Gain, nur damit onaudioprocess feuert
        this._tapRing = null;        // { samples, capacity, totalWritten, sampleRate, anchorTime }
        this._lastSyncWin = null;    // zuletzt gezeichnetes Sync-Fenster { winStart, winEnd } — fürs Trigger-Drag-Mapping

        // ── Freeze — unabhängig von Sync (s. Datei-Kopf) ────────────────────────────────
        this._frozenSnapshot = null; // { kind:'ring'|'points', data, t0, t1 } oder null = live

        // ── Zoom/Pan (Touchpad, s. Datei-Kopf) — Anteile (0..1) der VOLLEN t0..t1-Spanne.
        // Default = voll ausgezoomt (1/0), identisch zum bisherigen Verhalten.
        this._zoomSpan = 1;
        this._zoomStart = 0;

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
        this._wrap = wrap;

        // Canvas-Interaktionen (Grill-Runde @dpa 20260804): Trigger-Drag nur bei aktivem
        // Sync, Freeze-Readout nur bei aktivem Freeze — überschneidungsfrei, weil ein
        // eingefrorenes Bild kein Sync-Fenster mehr neu zeichnet (mousedown träfe dann ins
        // Leere). `_dragging` unterscheidet reines Hover (Freeze-Readout) von gehaltenem
        // Ziehen (Trigger-Position) auf demselben Canvas.
        let dragging = false;
        canvas.addEventListener('mousedown', (e) => {
            if (!this._syncOn || this._frozenSnapshot) return;
            dragging = true;
            this._dragTriggerFromEvent(e);
        });
        window.addEventListener('mousemove', (e) => {
            if (dragging) { this._dragTriggerFromEvent(e); return; }
            this._hoverReadout(e);
        });
        window.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            if (this._onTriggerPosCommit) this._onTriggerPosCommit(this._triggerPos);
        });
        canvas.addEventListener('mouseleave', () => { this._hoverActive = false; });

        // Touchpad-Zoom/Pan (s. Datei-Kopf) — Achsen-Lock wie im Vorbild-gesturePlugin:
        // beim ersten Scroll-Event einer Geste wird per größerem Delta entschieden, ob es
        // eine H- (Pan) oder V-Geste (Zoom) ist; die Entscheidung bleibt fix, bis ~140ms
        // lang kein Scroll mehr kommt (Finger abgehoben) — sonst würde eine leicht schräge
        // Geste ständig zwischen Zoomen und Verschieben hin- und herspringen.
        let gestureAxis = null, gestureTimer = null;
        const GESTURE_GAP_MS = 140;
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            if (gestureAxis === null)
                gestureAxis = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? 'h' : 'v';
            if (gestureAxis === 'v') {
                // Anker: bei aktivem Sync der Trigger (bleibt beim Zoomen fix), sonst die
                // Mausposition, umgerechnet auf einen Anteil der VOLLEN Spanne.
                const mouseFrac = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
                const anchorFrac = (this._syncOn && this._hasNode)
                    ? this._triggerPos
                    : this._zoomStart + mouseFrac * this._zoomSpan;
                this._zoomBy(Math.exp(e.deltaY * 0.006), anchorFrac);
            } else {
                this._panBy((e.deltaX / Math.max(1, rect.width)) * this._zoomSpan);
            }
            clearTimeout(gestureTimer);
            gestureTimer = setTimeout(() => { gestureAxis = null; }, GESTURE_GAP_MS);
        }, { passive: false });
        // Doppelklick → voll ausgezoomt zurück (wie der ⟲-Button in multiScope.js).
        canvas.addEventListener('dblclick', () => { this._zoomSpan = 1; this._zoomStart = 0; });

        this.applyStyle(this.style);
    }

    /** Welche Quelle abgelesen wird — {module, port, hasNode?, node?} (aus
     *  routing.outputSources()) oder null (keine Quelle, Scope zeigt nichts). Setzt NIE
     *  etwas an der Quelle selbst. hasNode/node s. DEFAULTS.accuracy-Kommentar. */
    setSource(ref) {
        this._teardownAnalyser();
        this._teardownTap();
        this._srcRef = ref ? { module: ref.module, port: ref.port } : null;
        this._hasNode = !!(ref && ref.hasNode);
        this._nodeGetter = (ref && typeof ref.node === 'function') ? ref.node : null;
        this.reset();
        this._syncAccuracy();
        this._syncTap();   // Quellwechsel: Sync-Tap ggf. auf der NEUEN Quelle neu aufbauen
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
     *  VERKABELN" — gilt für 'sample' genauso wie für 'frame'). An/Aus (s. Datei-Kopf) sperrt
     *  den Analyser komplett weg (want &= this._on). */
    _syncAccuracy() {
        const want = this._on && this._effectiveAccuracy() === 'sample';
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

    // ══════════════════════════════════════════════════════════════════════════════════
    // Sync — Trigger auf den Takt-Beat (s. Datei-Kopf)
    // ══════════════════════════════════════════════════════════════════════════════════

    /** An/aus — steuert ob sample()/tick() aktiv sind und ob AnalyserNode/ScriptProcessorNode-Tap
     *  aufgebaut werden (s. Datei-Kopf). Bei `on === false` ist CPU-Last minimal (kein Audio-Tap,
     *  kein Sampling). */
    setOn(on) {
        this._on = !!on;
        this._syncAccuracy();   // teardown/rebuild Analyser je nach this._on
        this._syncTap();        // teardown/rebuild Tap je nach this._on
        this._wrap.classList.toggle('sigscope-off', !this._on);
    }
    get on() { return this._on; }

    /** Sync an/aus (von multiScope.js an einen echten Button-Control gebunden). Ausgegraut/
     *  wirkungslos, wenn die Quelle keinen echten AudioNode hat (`hasNode()===false`, wie
     *  'sample') — kein Fehler, still (Projekt-Konvention). */
    setSyncOn(on) {
        this._syncOn = !!on && this._hasNode;
        this._beatTimes.length = 0;
        this._syncTap();
    }
    get syncOn() { return this._syncOn; }

    /** Ein Beat-Zeitpunkt (AudioContext-Sekunden, aus taktEngine.onClockBeat) — von
     *  multiScope.js zugestellt, solange Sync an ist. Hält nur eine kurze Historie (letzte
     *  8 Beats reichen für jeden praktikablen Trigger-Offset). */
    addBeat(time) {
        if (!this._syncOn) return;
        this._beatTimes.push(time);
        if (this._beatTimes.length > 8) this._beatTimes.shift();
    }

    /** 0..1 — Position des Beats im Anzeige-Fenster (0.5 = mittig, s. Datei-Kopf). */
    setTriggerPos(frac) { this._triggerPos = Math.max(0, Math.min(1, +frac || 0)); }

    /** ± ms — verschiebt den Referenz-Beat SELBST (nicht nur die Anzeige-Position, s.
     *  Datei-Kopf „es muss immer möglich sein, den Klick nach vorne zu ziehen"). */
    setSyncOffsetMs(ms) { this._syncOffsetMs = +ms || 0; }

    /** multiScope.js hängt sich hier ein, um eine per Drag geänderte Trigger-Position zu
     *  persistieren (state.set) — der Drag selbst schreibt NICHT bei jedem mousemove in den
     *  State (Performance/localStorage-Schreibhäufigkeit), nur bei mouseup. */
    onTriggerPosCommit(fn) { this._onTriggerPosCommit = fn || null; }

    _dragTriggerFromEvent(e) {
        const rect = this._canvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        // Kanvas-Fraktion ist eine Fraktion des sichtbaren ZOOM-Fensters, nicht der vollen
        // Spanne — auf die volle Spanne zurückrechnen (s. Datei-Kopf „Zoom/Pan"), sonst
        // würde Ziehen im gezoomten Bild die Trigger-Position falsch (zu grob) versetzen.
        const viewFrac = x / Math.max(1, rect.width);
        this.setTriggerPos(this._zoomStart + viewFrac * this._zoomSpan);
    }

    // ══════════════════════════════════════════════════════════════════════════════════
    // Zoom/Pan — reine Anzeige-Navigation (s. Datei-Kopf)
    // ══════════════════════════════════════════════════════════════════════════════════

    /** Zoomt um `factor` (>1 raus, <1 rein) mit `anchorFrac` (0..1 der VOLLEN Spanne) als
     *  Fixpunkt — bleibt beim Zoomen an derselben Stelle stehen (Standard-Chart-Zoom-Mathe,
     *  s. gesturePlugin in /Users/dpa/hass/sensor-archive/mac/index.html). */
    _zoomBy(factor, anchorFrac) {
        const oldSpan = this._zoomSpan;
        const span = Math.max(MIN_ZOOM_SPAN, Math.min(1, oldSpan * factor));
        let start = anchorFrac - (anchorFrac - this._zoomStart) * (span / oldSpan);
        start = Math.max(0, Math.min(1 - span, start));
        this._zoomSpan = span;
        this._zoomStart = start;
    }

    /** Verschiebt das Zoom-Fenster um `frac` (Anteil der VOLLEN Spanne) — an den Rändern
     *  hart geklemmt (kein Wrap, kein Nachfedern über den Puffer-Rand hinaus). */
    _panBy(frac) {
        this._zoomStart = Math.max(0, Math.min(1 - this._zoomSpan, this._zoomStart + frac));
    }

    /** Liefert das sichtbare [vt0,vt1]-Unterfenster einer vollen [t0,t1]-Spanne, nach
     *  aktuellem Zoom/Pan zugeschnitten. Ohne Zoom (Default zoomSpan=1/zoomStart=0)
     *  identisch zu [t0,t1] — bestehende Aufrufer ändern sich dadurch nicht. */
    _viewWindow(t0, t1) {
        const span = t1 - t0;
        const vt0 = t0 + this._zoomStart * span;
        return [vt0, vt0 + this._zoomSpan * span];
    }

    _setupTap() {
        const node = this._nodeGetter && this._nodeGetter();
        if (!node) return;   // Quelle behauptet hasNode, liefert (noch) keinen — Sync bleibt wirkungslos
        const ctx = node.context;
        const proc = ctx.createScriptProcessor(2048, 1, 1);
        const sink = ctx.createGain();
        sink.gain.value = 0;   // stumm — nur damit onaudioprocess feuert (DebugRecorder-Muster)
        node.connect(proc);
        proc.connect(sink);
        sink.connect(ctx.destination);
        const capacity = Math.max(2048, Math.round(TAP_CAPACITY_S * ctx.sampleRate));
        const ring = { samples: new Float32Array(capacity), capacity, totalWritten: 0, sampleRate: ctx.sampleRate, anchorTime: null };
        proc.onaudioprocess = (e) => {
            const data = e.inputBuffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) {
                ring.samples[ring.totalWritten % capacity] = data[i];
                ring.totalWritten++;
            }
            // Anchor JEDEN Callback neu kalibrieren, NICHT nur einmal beim ersten Aufruf
            // einfrieren (@dpa-Debug-Fund 20260804: ~90-100ms konstanter Versatz, musste über
            // Sync-Offset von Hand ausgeglichen werden). Root Cause: `event.playbackTime`
            // beschreibt „wann wird das NÄCHSTE Output-Paket gespielt" (vorausschauend), NICHT
            // den Erfassungszeitpunkt der `inputBuffer`-Samples (die liegen schon dahinter) —
            // beide Zeiten fallen bei ScriptProcessorNode NICHT zusammen. `ctx.currentTime`
            // SYNCHRON zum Schreiben gelesen und „das neueste Sample entspricht ungefähr JETZT"
            // ist die robustere Referenz; kleine Restabweichung (Main-Thread/Audio-Thread-
            // Versatz, ScriptProcessorNode-typisch) bleibt über den Sync-Offset-Knob feinjustierbar.
            ring.anchorTime = ctx.currentTime - ring.totalWritten / ring.sampleRate;
        };
        this._tapProc = proc;
        this._tapSrc = node;
        this._tapSink = sink;
        this._tapRing = ring;
    }

    _teardownTap() {
        if (this._tapProc) {
            try { this._tapSrc.disconnect(this._tapProc); this._tapProc.disconnect(); this._tapSink.disconnect(); }
            catch { /* schon getrennt */ }
            this._tapProc.onaudioprocess = null;
        }
        this._tapProc = null; this._tapSrc = null; this._tapSink = null; this._tapRing = null;
        this._lastSyncWin = null;
    }

    /** Tap auf-/abbauen je nach Sync-Wunsch — UNABHÄNGIG von `accuracy`/AnalyserNode (s.
     *  Datei-Kopf: additiver, separater Mechanismus, rührt den bestehenden 'frame'/'sample'-
     *  Pfad nicht an). An/Aus (s. Datei-Kopf) sperrt den Tap auch weg (want &= this._on). */
    _syncTap() {
        const want = this._on && this._syncOn && this._hasNode;
        if (want && !this._tapProc) this._setupTap();
        if (!want && this._tapProc) this._teardownTap();
    }

    // ══════════════════════════════════════════════════════════════════════════════════
    // Freeze — unabhängig von Sync (s. Datei-Kopf)
    // ══════════════════════════════════════════════════════════════════════════════════

    /** Nimmt eine EXPLIZITE Kopie dessen, was GERADE gezeichnet wird (Sync-Fenster, Analyser-
     *  Read oder Frame-Puffer-Slice, je nach aktivem Modus) — die Erfassung läuft im
     *  Hintergrund unverändert weiter, nur die ANZEIGE steht still (@dpa 20260804: „die
     *  Anzeige muss genau wissen, wo was steht"). */
    freeze() {
        this._frozenSnapshot = this._computeDrawData() || { kind: 'points', data: [], t0: 0, t1: 1 };
    }

    /** Harter Sprung zurück auf live — KEINE Überblendung (@dpa-Vorgabe, s. Datei-Kopf). */
    unfreeze() { this._frozenSnapshot = null; }
    get frozen() { return !!this._frozenSnapshot; }

    _hoverReadout(e) {
        if (!this._frozenSnapshot) return;
        const rect = this._canvas.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
        const { kind, data, t0, t1 } = this._frozenSnapshot;
        // x ist eine Fraktion des ANGEZEIGTEN (ggf. gezoomten) Fensters, nicht der vollen
        // Spanne — s. Datei-Kopf „Zoom/Pan".
        const [vt0, vt1] = this._viewWindow(t0, t1);
        const t = vt0 + x * (vt1 - vt0);
        let v = null;
        if (kind === 'ring' && data.length) {
            const i = Math.round(((t - t0) / Math.max(1e-9, t1 - t0)) * (data.length - 1));
            v = data[Math.max(0, Math.min(data.length - 1, i))];
        } else if (kind === 'points' && data.length) {
            // nächstliegenden Punkt zeitlich suchen (kleiner Puffer, lineares Suchen unkritisch)
            let best = data[0];
            for (const p of data) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
            v = best.v;
        }
        if (v != null) {
            const d = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 1 ? 2 : 3;
            this._read.textContent = v.toFixed(d) + ' @' + Math.round((t - t0) * 1000) + 'ms';
        }
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
     *  Default-Wert 0, sonst sähe „keine Quelle" aus wie „Quelle liefert 0". Wenn Scope
     *  ausgeschaltet (this._on === false), passiert auch nichts. */
    sample(routing) {
        if (!this._on || !this._srcRef) return;
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

    /** Ringpuffer zeichnen — aus dem Render-Loop aufrufen (wie LevelMeter.tick). Wenn
     *  Scope ausgeschaltet (this._on === false), wird gar nichts gezeichnet. */
    tick() {
        if (!this._on) return;
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

        // Sync/Freeze (@dpa 20260804, s. Datei-Kopf): eigener Zeichenpfad VOR dem
        // bestehenden 'sample'/'frame'-Pfad — greift NUR, wenn tatsächlich ein
        // eingefrorenes Bild oder ein passendes Sync-Fenster vorliegt (chooseTriggerWindow
        // liefert sonst null → stiller Fallback auf den UNVERÄNDERTEN Pfad darunter, kein
        // Doppel-Zeichnen, kein Regressionsrisiko für den bestehenden AnalyserNode/Frame-Pfad).
        // Alle vier Zeichenpfade laufen über _drawRingCurve()/_drawPointsCurve() — die
        // wenden JEWEILS den aktuellen Zoom/Pan-Ausschnitt an (s. Datei-Kopf „Zoom/Pan"),
        // ohne Zoom (Default) identisch zum vorherigen Verhalten.
        const special = this._frozenSnapshot || (this._syncOn ? this._computeDrawData() : null);
        if (st.showCurve && special && special.kind === 'ring' && special.data.length > 1) {
            const [vt0, vt1] = this._drawRingCurve(c, special.data, special.t0, special.t1, curveW, y);
            if (special.triggerT != null && special.triggerT >= vt0 && special.triggerT <= vt1)
                this._drawTriggerLine(c, special.triggerT, vt0, vt1, curveW, h);
        } else if (st.showCurve && special && special.kind === 'points' && special.data.length > 1) {
            this._drawPointsCurve(c, special.data, special.t0, special.t1, curveW, y);
        // Kurve über das Zeitfenster — 'sample': echte Audio-Samples aus dem AnalyserNode
        // (dessen interner Ring-Puffer läuft KONTINUIERLICH auf Audio-Rate, unabhängig davon,
        // wie oft/wann tick() sie ausliest — genau das behebt das "kurze Envs sehen jedes Mal
        // anders/ungenau aus"-Problem, ddw.md 20260727: kein noch so kurzer Puls kann zwischen
        // zwei tick()-Aufrufen verschwinden, wie es beim Frame-Polling passieren kann).
        // 'frame': der bisherige Ringpuffer aus sample()/routing.getValue() (unverändert).
        } else if (st.showCurve && this._analyser) {
            this._analyser.getFloatTimeDomainData(this._analyserBuf);
            const now = performance.now();
            this._drawRingCurve(c, this._analyserBuf, now - st.bufferMs, now, curveW, y);
        } else if (st.showCurve && this._buf.length > 1) {
            const now = performance.now();
            this._drawPointsCurve(c, this._buf, now - st.bufferMs, now, curveW, y);
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

        // Bei Freeze schreibt NICHT tick() den Wert-Text — das macht _hoverReadout() bei
        // Mausbewegung über dem eingefrorenen Bild (sonst würde tick() das Readout jeden
        // Frame mit `_last` überschreiben, bevor man es überhaupt lesen kann).
        if (!st.hideValue && !this._frozenSnapshot) {
            const d = Math.abs(this._last) >= 100 ? 0 : Math.abs(this._last) >= 1 ? 2 : 3;
            this._read.textContent = this._last.toFixed(d);
        }
    }

    /** Ermittelt, was GERADE gezeichnet werden soll — Sync-Fenster (falls Sync an und ein
     *  Beat-Trigger passt) bzw. ein Snapshot des aktuellen Live-Bilds (für freeze() ohne
     *  aktiven Sync). Getrennt von tick() nutzbar, damit freeze() denselben Ausschnitt
     *  einfrieren kann, den tick() gerade zeigen würde. */
    _computeDrawData() {
        if (this._syncOn && this._tapRing && this._tapSrc) {
            const ctx = this._tapSrc.context;
            const bufferSec = this.style.bufferMs / 1000;
            const win = chooseTriggerWindow(this._beatTimes, ctx.currentTime, bufferSec, this._triggerPos, this._syncOffsetMs / 1000);
            if (!win) return null;   // noch kein passender Beat gepuffert — stiller Fallback (Aufrufer zeichnet Live-Pfad)
            const samples = extractRingWindow(this._tapRing, win.winStart, win.winEnd);
            if (!samples) return null;
            this._lastSyncWin = win;
            return { kind: 'ring', data: samples, t0: win.winStart, t1: win.winEnd, triggerT: win.beatTime };
        }
        // Sync aus (z.B. freeze() ohne Sync): Snapshot des Live-Bilds, wie tick() es sonst zeichnen würde.
        if (this._analyser) {
            const buf = new Float32Array(this._analyserBuf.length);
            this._analyser.getFloatTimeDomainData(buf);
            const now = performance.now();
            return { kind: 'ring', data: buf, t0: now - this.style.bufferMs, t1: now };
        }
        if (this._buf.length > 1) {
            const now = performance.now();
            return { kind: 'points', data: this._buf.slice(), t0: now - this.style.bufferMs, t1: now };
        }
        return null;
    }

    /** Ring-Puffer-Kurve zeichnen — `data` ist EIN evenly-spaced Float32Array/Array über
     *  [t0,t1] (Sync-Fenster, Freeze-Snapshot oder ein live AnalyserNode-Read). Wendet den
     *  aktuellen Zoom/Pan-Ausschnitt an (s. Datei-Kopf „Zoom/Pan") — ohne Zoom (Default)
     *  identisch zum bisherigen Verhalten. `_last` wird auf den RECHTEN SICHTBAREN Rand
     *  gesetzt (nicht zwingend das Spannen-Ende — bei Pan kann das auseinanderfallen), damit
     *  Meter/Wert-Text zur gezeichneten Kurve passen. Liefert [vt0,vt1] für den Aufrufer
     *  (z.B. die Trigger-Linie). */
    _drawRingCurve(c, data, t0, t1, curveW, y) {
        const n = data.length;
        const [vt0, vt1] = this._viewWindow(t0, t1);
        const span = Math.max(1e-9, t1 - t0);
        const i0 = Math.max(0, Math.floor(((vt0 - t0) / span) * (n - 1)));
        const i1 = Math.min(n - 1, Math.ceil(((vt1 - t0) / span) * (n - 1)));
        c.strokeStyle = this.style.curveColor;
        c.lineWidth = 1.5;
        c.beginPath();
        let started = false;
        for (let i = i0; i <= i1; i++) {
            const t = t0 + (i / (n - 1)) * span;
            const x = ((t - vt0) / Math.max(1e-9, vt1 - vt0)) * curveW;
            const py = y(data[i]);
            if (!started) { c.moveTo(x, py); started = true; } else c.lineTo(x, py);
        }
        c.stroke();
        if (i1 >= i0) this._last = data[i1];
        return [vt0, vt1];
    }

    /** Punkt-Kurve zeichnen (unregelmäßige Zeitstempel, Frame-Modus/Freeze-ohne-Sync) —
     *  dieselbe Zoom/Pan-Anwendung wie _drawRingCurve, nur auf ein {t,v}-Array statt
     *  evenly-spaced Samples. */
    _drawPointsCurve(c, data, t0, t1, curveW, y) {
        const [vt0, vt1] = this._viewWindow(t0, t1);
        c.strokeStyle = this.style.curveColor;
        c.lineWidth = 1.5;
        c.beginPath();
        let started = false, lastV = null;
        for (const p of data) {
            if (p.t < vt0 || p.t > vt1) continue;
            const x = ((p.t - vt0) / Math.max(1e-9, vt1 - vt0)) * curveW;
            const py = y(p.v);
            if (!started) { c.moveTo(x, py); started = true; } else c.lineTo(x, py);
            lastV = p.v;
        }
        c.stroke();
        if (lastV != null) this._last = lastV;
        return [vt0, vt1];
    }

    /** Dünne Trigger-Linie an der Beat-Position — triggerT und vt0/vt1 (das SICHTBARE,
     *  bereits zoom-zugeschnittene Fenster) kommen vom Aufrufer, der zuvor prüft, ob der
     *  Trigger überhaupt im sichtbaren Bereich liegt (bei starkem Reinzoomen kann er
     *  außerhalb landen — dann wird gar nicht erst gezeichnet). */
    _drawTriggerLine(c, triggerT, vt0, vt1, curveW, h) {
        const x = ((triggerT - vt0) / Math.max(1e-9, vt1 - vt0)) * curveW;
        c.save();
        c.globalAlpha = 0.5;
        c.strokeStyle = this.style.curveColor;
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x, 0); c.lineTo(x, h);
        c.stroke();
        c.restore();
    }

    /** Puffer + Auto-Range + Zoom/Pan zurücksetzen (z.B. nach Zielwechsel, oder der
     *  ⟲-Button in multiScope.js) — alte Zoom-Position würde für ein neues Signal ohnehin
     *  keinen Sinn mehr ergeben. */
    reset() {
        this._buf.length = 0;
        this._last = 0;
        this._seen = { min: Infinity, max: -Infinity };
        this._frozenSnapshot = null;
        this._zoomSpan = 1;
        this._zoomStart = 0;
    }

    /** Aufräumen, wenn diese Scope-Instanz komplett entfernt wird (multiScope.js
     *  teardownLast) — schließt AnalyserNode UND Sync-Tap sauber ab. */
    destroy() {
        this._teardownAnalyser();
        this._teardownTap();
    }
}

export { DEFAULTS as SCOPE_DEFAULTS };

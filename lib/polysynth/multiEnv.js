/**
 * multiEnv.js — Multi-ADSR-Manager für PolySynth (ddw.md 20260725)
 *
 * Vervielfältigbare ADSR-Envelopes nach dem Multi-Sq-Muster: Jede Instanz ist eine
 * eigene GroupHost-Gruppe mit indizierten State-Keys (adsrA_0, adsrD_0, …).
 * Werte-Knobs (A,D,S,R,Peak,GateLen,Len) auf dem Panel; Settings (aktiv, Kurven,
 * Verlauf, Trig/Gate, Skew) im Gruppen-Rechtsklick-Panel via groupKindSettings-Hook.
 *
 * Engine: envCore.js (SR-basiert, setValueCurveAtTime). Ausgabe als Audio-Param-
 * Kurve auf einem GainNode; der aktuelle Wert ist per read() abrufbar (Value-Port).
 *
 * Nahtstellen: init() (Migration + Instanzen bauen), addEnv()/removeEnv() (+/−),
 * reconcile() (Recall), triggerAll() (für alle Instanzen).
 */
import { AdsrCore, msToSamples } from './envCore.js';
import { ensureAudio as ensureBus, getContext } from '../audioBus.js';
import { PickMenu } from '../PickMenu.js';

const VALUE_KEYS = [
    'adsrA', 'adsrD', 'adsrS', 'adsrR', 'adsrPeak', 'adsrGateLen', 'adsrLen',
    'adsrAOn', 'adsrDOn', 'adsrSOn', 'adsrROn', 'adsrInv', 'adsrVerlauf',
    'adsrACurve', 'adsrDCurve', 'adsrRCurve',
    'adsrASkew', 'adsrDSkew', 'adsrRSkew',
    'adsrTrigMode', 'adsrLenUnit', 'adsrOutput',
];

const SRC_TYPE = 'Value';   // Typ des Env-Output-Ports — 'Value' findet alle Value-Ziele
                            // (preQuantMod, Knobs, …); 'OSZ-F' hatte NULL Ziele im Ensemble.
const NEW_DEFAULT_TARGET = '';   // leer = noch kein Ziel gewählt

function envName(i) { return i === 0 ? 'ADSR' : 'ADSR ' + (i + 1); }

function scoped(st, sfx) {
    return { get: (k) => st.get(k + sfx), set: (k, v) => st.set(k + sfx, v) };
}

/**
 * Eine Env-Engine-Instanz. Nutzt AdsrCore für die Kurven und plant sie auf
 * einem ConstantSourceNode via setValueCurveAtTime.
 *
 * WARUM ConstantSourceNode statt GainNode (@dpa 20260726, „nur Nullen bei inv"):
 * `GainNode.gain.value` liefert nach einer automatisierten NEGATIVEN Zuweisung
 * verlässlich `0` zurück (reproduziert in Chromium — Spec erlaubt negative Gain-
 * Automatisierung, der `.value`-Getter zeigt sie aber praktisch nicht an). Jede
 * ADSR mit `inv=on` — z.B. wenn `Peak` über 1 lag und dadurch auf 1 geklemmt
 * wurde, dann `inv` das Vorzeichen dreht — endete dadurch dauerhaft bei 0.
 * `ConstantSourceNode.offset` hat exakt dieselbe AudioParam-API (setValueAtTime,
 * setValueCurveAtTime, cancelScheduledValues), liefert aber auch negative Werte
 * korrekt über `.value` zurück — verifiziert per Playwright-Probe.
 */
class EnvEngine {
    constructor(state) {
        this.state = state;
        this._core = new AdsrCore();
        this._src = null;    // ConstantSourceNode (Werteträger)
        this._getBpm = () => 120;
        this._gate = false;
    }

    _audio() {
        ensureBus();
        const ctx = getContext();
        // Ohne Resume bleibt ein schon anderswo angelegter, aber (noch) suspendierter
        // Context stumm für Automation — setValueCurveAtTime wird nie verarbeitet,
        // offset.value bleibt für immer beim Initialwert 0, EGAL wie/ob getriggert wird
        // (@dpa 20260726: „egal wie ich die Env starte, bleibt bei 000"). Andere Engines
        // (taktmetro/engine.js, polysynth/engine.js) resumen bei jedem Start-Aufruf —
        // hier fehlte das.
        if (ctx.state === 'suspended') ctx.resume();
        if (!this._src) {
            this._src = ctx.createConstantSource();
            this._src.offset.value = 0;
            // MUSS am Audio-Graph hängen, sonst rendert der offset-Param nicht
            // (unverbundene Nodes berechnen ihre Parameter nicht). Über 0-Gain
            // an destination → unhörbar, aber der Param läuft.
            const zero = ctx.createGain();
            zero.gain.value = 0;
            this._src.connect(zero);
            zero.connect(ctx.destination);
            this._src.start();
        }
        return ctx;
    }

    read() {
        return this._src ? this._src.offset.value : 0;
    }

    setBpmSource(fn) { this._getBpm = fn || (() => 120); }

    _cfg() {
        const get = (k) => this.state.get(k);
        const bpm = this._getBpm();
        const lenUnit = get('adsrLenUnit') || 'ms';
        const lenMs = lenUnit === 'beats' ? (get('adsrLen') ?? 0) * 60000 / bpm : (get('adsrLen') ?? 0);
        const sr = this._audio().sampleRate;
        return {
            a: get('adsrA') ?? 0.01,
            d: get('adsrD') ?? 0.15,
            s: get('adsrS') ?? 0.7,
            r: get('adsrR') ?? 0.3,
            peak: get('adsrPeak') ?? 1,
            gateLen: get('adsrGateLen') ?? 0.1,
            aOn: !!get('adsrAOn'),
            dOn: !!get('adsrDOn'),
            sOn: !!get('adsrSOn'),
            rOn: !!get('adsrROn'),
            inv: !!get('adsrInv'),
            verlauf: !!get('adsrVerlauf'),
            aCurve: get('adsrACurve') || 'lin',
            dCurve: get('adsrDCurve') || 'log',
            rCurve: get('adsrRCurve') || 'log',
            aSkew: get('adsrASkew') ?? 1,
            dSkew: get('adsrDSkew') ?? 1,
            rSkew: get('adsrRSkew') ?? 1,
            trigMode: get('adsrTrigMode') || 'trig',
            lenSamples: msToSamples(lenMs, sr),
        };
    }

trigger() {
        const ctx = this._audio();
        const t = ctx.currentTime;
        const cfg = this._cfg();
        const { curve, duration, startOffset } = this._core.trigger(cfg, ctx.sampleRate);
        const param = this._src.offset;
        param.cancelScheduledValues(t);
        param.setValueAtTime(param.value, t);
        // startOffset ist negativ (Outin-Fade- Vorgriff) — bei frischem AudioContext
        // (currentTime < 0.5ms) würde t+startOffset < 0 → RangeError. Auf 0 klemmen;
        // der Fade-Fehler von max. 0.5ms ist unhörbar (ArchiReal.md).
        param.setValueCurveAtTime(curve, Math.max(0, t + startOffset), duration);
        // Nur im GATE-Modus bedeutet ein Trigger „Gate offen, bleibt bis gateOff".
        // Im TRIG-Modus ist der Durchlauf endlich — sonst gilt die Env für immer als
        // aktiv und flush() nagelt das Ziel dauerhaft fest (@dpa 20260726).
        this._gate = cfg.trigMode !== 'trig';
    }

    gateOn() {
        if (this._cfg().trigMode === 'trig') { this.trigger(); return; }
        this._gate = true;
        this.trigger();
    }

    gateOff() {
        if (!this._gate) return;
        const cfg = this._cfg();
        if (cfg.trigMode === 'trig') return;
this._gate = false;
        const ctx = this._audio();
        const t = ctx.currentTime;
        const current = this._src.offset.value;
        const { curve, duration } = this._core.gateOff(cfg, ctx.sampleRate, current);
        const param = this._src.offset;
        param.cancelScheduledValues(t);
        param.setValueAtTime(current, t);
        param.setValueCurveAtTime(curve, t, duration);
    }
}

/**
 * Manager für dynamische ADSR-Instanzen (Multi-Sq-Muster).
 * Jede Instanz registriert sich als eigenes Modul bei der Routing-Registry,
 * bekommt ein Output-PickMenu und liefert ihren Env-Wert an das gewählte Ziel.
 */
export function createEnvManager({ host, state, defs, tpl, routing, getBpm }) {
    const engines = [];
    const pickMenus = [];
    // Ziel-Metadaten (min/max) pro Instanz — flush() braucht sie zum Skalieren in den
    // Zielbereich. Wird beim Bauen gefüllt und beim ↪️-Reload aktualisiert.
    const targetCaches = [];
    const targetsFor = (i) => targetCaches[i] || [];
    const SILENT = 1e-4;          // darunter gilt die Env als „schläft" (s. flush)

    function buildEnv(i) {
        const sfx = '_' + i;
        for (const k of Object.keys(tpl.KNOBS)) defs.KNOBS[k + sfx] = tpl.KNOBS[k];
        for (const k of Object.keys(tpl.DEFAULTS)) defs.DEFAULTS[k + sfx] = tpl.DEFAULTS[k];
        // Gate-Button als echten defs-BUTTON indizieren (ARCHITEKTUR.md: „Buttons → Audio:
        // onAction(id)") — onClick ruft onAction('adsrGate_i'), das werkbank.js an den
        // Manager durchreicht. KeyMidi/Element-Settings/e-Mode kommen so gratis mit.
        for (const k of Object.keys(tpl.BUTTONS)) defs.BUTTONS[k + sfx] = tpl.BUTTONS[k];

        for (const k of VALUE_KEYS) {
            if (state.get(k + sfx) === undefined) state.set(k + sfx, tpl.DEFAULTS[k]);
        }

        host.addGroup({
            name: envName(i),
            knobs: Object.keys(tpl.KNOBS).map((k) => k + sfx),
            buttons: Object.keys(tpl.BUTTONS).map((k) => k + sfx),
            groupKind: 'ADSR',
            instanceSuffix: sfx,
            extraSoundKeys: VALUE_KEYS,
        });

        const st = scoped(state, sfx);
        const eng = new EnvEngine(st);
        eng.setBpmSource(getBpm);
        engines[i] = eng;

        // ── Routing-Registrierung (Output + Gate-Input) ───────────────────────
        const moduleId = 'polysynth.env' + sfx;
        const envLabel = i === 0 ? 'ADSR' : 'ADSR ' + (i + 1);
        routing.registerModule(moduleId, {
            label: envLabel,
            outputs: {
                out: { type: SRC_TYPE, label: 'Env-Wert', read: () => eng.read() },
            },
            inputs: {
                // min/max nötig, sonst filtert inputTargets() den Port weg (Registry.js:
                // „Nur Ports, die eine Wertspanne DEKLARIEREN") — dann wäre die ADSR kein
                // sichtbares Gate-Ziel für Sequenzer (ddw.md: „Gate als Ziel anmelden").
                gate: { type: 'Gate', label: 'Gate', min: 0, max: 1, stepSize: 1, offAllowed: true,
                        write: (v) => { if (v > 0) eng.gateOn(); else eng.gateOff(); } },
            },
        });

        // ── Output-PickMenu + Gate-Button als Controls IN DER GRUPPE ──────────
        const grpEl = host.panel.querySelector(`[data-group="${envName(i)}"]`);
        if (!grpEl) return;

        // Output-PickMenu (Zielbestimmung) — 1:1 das multiSq-Muster: registriertes Control
        // (mountInGroup + noContextOpen) → Rechtsklick öffnet die ECHTEN ElementSettings
        // (Label-Pos/Farben/Größe/Länge), nicht das PickMenu (ARCHITEKTUR.md: „Control
        // (Rest) → ElementSettings"). tailAlign wie bei Sq (@dpa: Ziel-Control zählt,
        // nicht der ISM-Name). Liste wird bei Fuß-↪️ neu geladen; current() gibt den
        // ANZEIGENAMEN zurück (nicht 'modul.port'), sonst zeigt der Button „— kein Ziel —".
        targetCaches[i] = routing.inputTargets(SRC_TYPE);
        const targetFor = (modPort) => targetCaches[i].find((t) => t.module + '.' + t.port === modPort) || null;
        const pickMenu = new PickMenu({
            label: 'Output',
            empty: '— kein Ziel —',
            noContextOpen: true,   // Rechtsklick = ElementSettings, nicht PickMenu auf
            tailAlign: true,
            title: 'Env-Ausgabeziel wählen — Fußzeile: Zielliste aus dem Ensemble neu laden',
            list: () => targetCaches[i],
            current: () => { const t = targetFor(state.get('adsrOutput' + sfx)); return t ? t.name : ''; },
            onPick: (idx, item) => {
                state.set('adsrOutput' + sfx, item.module + '.' + item.port);
            },
            foot: [['load', '↪️ Neu laden', 'Liste der verfügbaren Ziele neu aus dem Ensemble laden (kein Live-Update)', () => {
                targetCaches[i] = routing.inputTargets(SRC_TYPE);
                pickMenu.refresh();
            }]],
        });
        pickMenus[i] = pickMenu;
        // Als registriertes Select-Control in die Gruppe mounten (data-ctrl="s:adsrOutput_i")
        // → Optik (ctrlStyles), Element-Settings per Rechtsklick, e-Mode — alles wie bei Sq.
        host.mountInGroup(envName(i), pickMenu.element, 's:adsrOutput' + sfx);
        // Element-Settings (1:1 das multiSq-Muster): OHNE das hier bubbelt ein Rechtsklick
        // auf den Wrapper zur GRUPPE durch — registerCtrlStyle stoppt die Propagation UND
        // öffnet die echten select-Settings (Label/Label-Pos/Farben/Größe/Länge).
        host.registerCtrlStyle('s:adsrOutput' + sfx, 'select', pickMenu.element, (s) => {
            const lab = pickMenu.element.querySelector('.pm-label');
            if (lab) lab.textContent = s.label || 'Output';
            pickMenu.element.classList.remove('sel-label-top', 'sel-label-left', 'sel-label-right', 'sel-label-bottom', 'sel-label-off');
            pickMenu.element.classList.add('sel-label-' + (s.labelPos || 'top'));
            const btn = pickMenu.element.querySelector('.pm-btn');
            if (btn) {
                btn.style.background = s.bg0 || '';
                btn.style.color = s.fg || '';
                btn.style.fontSize = s.size ? s.size + 'px' : '';
                btn.style.padding = s.pad != null ? s.pad + 'px' : '';
                // boxSize muss den min-width:140px-Boden von .pm-btn unterlaufen können.
                btn.style.width = s.boxSize ? s.boxSize + 'px' : '';
                btn.style.minWidth = s.boxSize ? s.boxSize + 'px' : '';
            }
        }, 'Output');

        // ── Knob-Sichtbarkeit: A/D/S/R nur wenn aktiv ─────────────────────────
        // Selektor über data-ctrl="k:adsrX_i" (GroupHost vergibt das so) — Label-Matching
        // über .knob-label wäre fragil (die Klasse heißt anders als angenommen).
        const knobFor = (key) => grpEl.querySelector(`[data-ctrl="k:${key}${sfx}"]`);
        const updateKnobVisibility = () => {
            for (const [key, onKey] of [['adsrA', 'adsrAOn'], ['adsrD', 'adsrDOn'], ['adsrS', 'adsrSOn'], ['adsrR', 'adsrROn']]) {
                const el = knobFor(key);
                if (el) el.style.display = st.get(onKey) ? '' : 'none';
            }
        };
        updateKnobVisibility();
        // Bei Änderung der Settings-Toggles Sichtbarkeit aktualisieren
        state.subscribe((key) => {
            if (key === 'adsrAOn' + sfx || key === 'adsrDOn' + sfx || key === 'adsrSOn' + sfx || key === 'adsrROn' + sfx) {
                updateKnobVisibility();
            }
        });
    }

    function teardownLast() {
        const i = engines.length - 1;
        if (i < 0) return;
        const sfx = '_' + i;
        const moduleId = 'polysynth.env' + sfx;
        routing.unregisterModule(moduleId);
        if (pickMenus[i]) pickMenus[i].close();
        engines.splice(i, 1); pickMenus.splice(i, 1); targetCaches.splice(i, 1);
        host.removeGroup(envName(i));
        for (const k of VALUE_KEYS) state.remove(k + sfx);
        for (const k of Object.keys(tpl.KNOBS)) delete defs.KNOBS[k + sfx];
        for (const k of Object.keys(tpl.BUTTONS || {})) delete defs.BUTTONS[k + sfx];
        for (const k of Object.keys(tpl.DEFAULTS)) delete defs.DEFAULTS[k + sfx];
    }

    function reconcile() {
        let want = state.get('adsrCount');
        if (!(want >= 1)) want = 1;
        while (engines.length < want) buildEnv(engines.length);
        while (engines.length > want) teardownLast();
        state.set('adsrCount', engines.length);
        return engines.length;
    }

    function init() {
        if (state.get('adsrCount') == null) state.set('adsrCount', 1);
        reconcile();
    }

    function addEnv() {
        state.set('adsrCount', engines.length + 1);
        reconcile();
    }

    function removeEnv() {
        if (engines.length <= 1) return false;
        state.set('adsrCount', engines.length - 1);
        reconcile();
        return true;
    }

    function triggerAll() {
        for (const eng of engines) eng.trigger();
    }

    /** Gate-Klick der Instanz i (vom defs-BUTTON über onAction('adsrGate_i')). */
    function gateAt(i) {
        const eng = engines[i];
        if (!eng) return;
        const cfg = eng._cfg();
        if (cfg.trigMode === 'trig') eng.trigger();
        else eng._gate ? eng.gateOff() : eng.gateOn();
    }

    /** Pro Frame: aktuellen Env-Wert an das gewählte Ziel liefern.
     *
     *  ZWEI Dinge, an denen es vorher scheiterte (@dpa 20260726: „überall wo ich sie
     *  anschließe gehen die Werte direkt auf Minimum, ob getriggert oder nicht"):
     *
     *  1. SKALIERUNG: read() liefert 0..1 (bzw. -1..0 bei inv). Ein Ziel-Knob hat aber
     *     seinen EIGENEN Bereich (z.B. metroCutoff 120..9999). knobWrites klemmt auf
     *     min..max → 0.3 landet immer auf min. Der Env-Wert muss in den Zielbereich
     *     abgebildet werden: out = min + |v| * (max - min). Bei inv (negativ) wird von
     *     OBEN abgezogen: out = max - |v| * (max - min) — „invertiert" heißt am Ziel
     *     „von oben nach unten" statt einer negativen Zahl, die dort nur klemmt.
     *  2. RUHEZUSTAND: eine nie getriggerte (oder abgelaufene) Env steht auf 0. Wer das
     *     jeden Frame sendet, nagelt das Ziel dauerhaft auf sein Minimum — genau das,
     *     was einen von Hand hochgezogenen Regler „sofort zurückspringen" lässt.
     *     Darum: solange die Env schläft (|v| unter Ruheschwelle und kein Gate offen),
     *     wird GAR NICHTS geliefert — auch kein „Ruhewert" hinterher. Das Ziel bleibt
     *     dort stehen, wo die Env es verlassen hat (bzw. wo man es von Hand hinstellt);
     *     das ist das Verhalten, das man von einem Modulator erwartet, der nicht läuft.
     */
    function flush() {
        for (let i = 0; i < engines.length; i++) {
            const sfx = '_' + i;
            const target = state.get('adsrOutput' + sfx);
            if (!target) continue;
            const [mod, port] = target.split('.');
            if (!mod || !port) continue;

            const v = engines[i].read();
            const mag = Math.abs(v);
            if (!(mag > SILENT || engines[i]._gate)) continue;   // Env schläft → schweigen

            const t = targetsFor(i).find((x) => x.module === mod && x.port === port);
            let out = v;
            if (t && t.min != null && t.max != null) {
                const span = t.max - t.min;
                out = v < 0 ? t.max - mag * span : t.min + mag * span;
            }
            routing.deliver(
                { module: 'polysynth.env' + sfx, port: 'out', instance: i },
                { module: mod, port },
                out
            );
        }
    }

    return { init, addEnv, removeEnv, engines, reconcile, triggerAll, flush, gateAt };
}

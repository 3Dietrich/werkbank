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
 * einem GainNode via setValueCurveAtTime.
 */
class EnvEngine {
    constructor(state) {
        this.state = state;
        this._core = new AdsrCore();
        this._gain = null;
        this._getBpm = () => 120;
        this._gate = false;
    }

    _audio() {
        ensureBus();
        const ctx = getContext();
        if (!this._gain) {
            this._gain = ctx.createGain();
            this._gain.gain.value = 0;
            // Der GainNode MUSS am Audio-Graph hängen, sonst wird der gain-Param nicht
            // gerendert und .value bleibt starr auf 0 (Web-Audio: unverbundene Nodes
            // berechnen ihre Parameter nicht). Über 0-Gain an destination → unhörbar,
            // aber der Param läuft und .value liefert den echten Env-Verlauf.
            const zero = ctx.createGain();
            zero.gain.value = 0;
            this._gain.connect(zero);
            zero.connect(ctx.destination);
        }
        return ctx;
    }

    read() {
        return this._gain ? this._gain.gain.value : 0;
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
        const param = this._gain.gain;
        param.cancelScheduledValues(t);
        param.setValueAtTime(param.value, t);
        param.setValueCurveAtTime(curve, t + startOffset, duration);
        this._gate = true;
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
        const current = this._gain.gain.value;
        const { curve, duration } = this._core.gateOff(cfg, ctx.sampleRate, current);
        const param = this._gain.gain;
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

    function buildEnv(i) {
        const sfx = '_' + i;
        for (const k of Object.keys(tpl.KNOBS)) defs.KNOBS[k + sfx] = tpl.KNOBS[k];
        for (const k of Object.keys(tpl.DEFAULTS)) defs.DEFAULTS[k + sfx] = tpl.DEFAULTS[k];

        for (const k of VALUE_KEYS) {
            if (state.get(k + sfx) === undefined) state.set(k + sfx, tpl.DEFAULTS[k]);
        }

        host.addGroup({
            name: envName(i),
            knobs: Object.keys(tpl.KNOBS).map((k) => k + sfx),
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

        // Container für Output + Gate (unter den Knobs)
        const ctrlRow = document.createElement('div');
        ctrlRow.className = 'env-ctrl-row';
        ctrlRow.style.cssText = 'display:flex; gap:8px; align-items:center; margin-top:8px; flex-wrap:wrap;';

        // Gate-Button (manuelles Triggern)
        const gateBtn = document.createElement('button');
        gateBtn.type = 'button';
        gateBtn.className = 'wb-help-btn';
        gateBtn.textContent = '⏵';
        gateBtn.title = 'Gate/Trigger manuell auslösen';
        gateBtn.addEventListener('click', () => {
            const cfg = eng._cfg();
            if (cfg.trigMode === 'trig') eng.trigger();
            else eng._gate ? eng.gateOff() : eng.gateOn();
        });
        ctrlRow.appendChild(gateBtn);

        // Output-PickMenu (Zielbestimmung) — Liste wird bei Fuß-↪️ neu geladen (wie multiSq),
        // current() gibt den ANZEIGENAMEN zurück (nicht 'modul.port'), sonst zeigt der
        // Button trotz gesetztem State „— kein Ziel —".
        let targetsCache = routing.inputTargets(SRC_TYPE);
        const targetFor = (modPort) => targetsCache.find((t) => t.module + '.' + t.port === modPort) || null;
        const pickMenu = new PickMenu({
            label: 'Output',
            empty: '— kein Ziel —',
            title: 'Ziel für den Env-Ausgang wählen — Fußzeile: Zielliste neu laden',
            list: () => targetsCache,
            current: () => { const t = targetFor(state.get('adsrOutput' + sfx)); return t ? t.name : ''; },
            onPick: (idx, item) => {
                state.set('adsrOutput' + sfx, item.module + '.' + item.port);
            },
            foot: [['load', '↪️ Neu laden', 'Liste der verfügbaren Ziele neu aus dem Ensemble laden (kein Live-Update)', () => {
                targetsCache = routing.inputTargets(SRC_TYPE);
                pickMenu.refresh();
            }]],
        });
        pickMenus[i] = pickMenu;
        ctrlRow.appendChild(pickMenu.element);

        grpEl.appendChild(ctrlRow);

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
        engines.splice(i, 1); pickMenus.splice(i, 1);
        host.removeGroup(envName(i));
        for (const k of VALUE_KEYS) state.remove(k + sfx);
        for (const k of Object.keys(tpl.KNOBS)) delete defs.KNOBS[k + sfx];
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

    /** Pro Frame: aktuellen Env-Wert an das gewählte Ziel liefern. */
    function flush() {
        for (let i = 0; i < engines.length; i++) {
            const sfx = '_' + i;
            const target = state.get('adsrOutput' + sfx);
            if (!target) continue;
            const [mod, port] = target.split('.');
            if (!mod || !port) continue;
            routing.deliver(
                { module: 'polysynth.env' + sfx, port: 'out' },
                { module: mod, port },
                engines[i].read()
            );
        }
    }

    return { init, addEnv, removeEnv, engines, reconcile, triggerAll, flush };
}

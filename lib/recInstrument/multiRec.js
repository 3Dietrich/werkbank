/**
 * multiRec.js — Multi-Rec-Manager (@dpa 20260804): Rec von Singleton-ISM zu vervielfältigbarem
 * Instrument umgebaut. Anders als multiEnv.js/multiScope.js (EINE geteilte Engine über N
 * Panel-Instanzen) braucht JEDE Rec-Instanz ihre EIGENE Engine (eigener MediaRecorder, eigener
 * Audio-Tap) — @dpa wörtlich: „da könnte ich mir wünschen, dass sie an mehreren Stellen
 * abgreifen". Trotzdem bleibt das Vervielfältigungs-Muster dasselbe: jede Instanz ist NUR eine
 * GroupHost-Gruppe innerhalb DES EINEN Rec-ISMs (ein `.wb-bench`, eine `InstrumentSettings`-
 * Instanz, ein gemeinsamer `mountGroups()`-Host) — keine N eigenen ISM-Sektionen, keine neue
 * HTML-Struktur nötig (1:1 wie Scope/ADSR).
 *
 * Tap-Punkt = Input-„Port" (@dpa-Policy „alles bekommt seine Ein-/Ausgänge, Panel ODER
 * versteckt in Settings"): ein PickMenu 's:recSrc_i' im Panel, 1:1 das Scope-„Quelle"-Muster,
 * aber GEFILTERT auf `hasNode` (Rec verbindet einen ECHTEN AudioNode, keinen reinen Zahlen-
 * `read()`-Wert). '' (Default, leer = „Master (Ensemble)") bleibt der rohe Master-Bus — s.
 * lib/recInstrument/engine.js (`getInputNode`-Default `getMaster()`), damit Instanz 0 nach
 * dem Umbau GENAU denselben Klang aufnimmt wie der alte Singleton (kein Sound-Unterschied).
 * Jede weitere Instanz kann stattdessen einen anderen `hasNode`-Output wählen (z.B. eine
 * einzelne ADSR aus multiEnv.js, oder den Master-Analyser NACH Fader/Limiter, s.
 * `registerModule('master', …)` in den drei Einstiegsdateien).
 *
 * Geteilt über ALLE Instanzen bleiben (s. lib/recInstrument/defs.js-Kopf):
 *  - `recFormat`/`recMp3Bitrate`/`recMp3Stereo`/`recWavSampleRate`/`recWavBitDepth` — EINE
 *    ISM-weite „Aufnahme-Format"-Einstellung (ddw.md 20260803_135251 Punkt B, liegt in den
 *    Haupt-Settings), nicht pro Instanz dupliziert.
 *  - Takt-Kopplung (getBpm/getBeatsPerBar/isClockRunning/Downbeat-Arming) — EIN Takt fürs
 *    Ensemble (lib/taktmetro/mount.js), jede Instanz armt/stoppt unabhängig auf denselben
 *    Downbeat; der Aufrufer verdrahtet EINMAL `taktEngine.onClockBeat(recManager.handleClockBeat)`
 *    und `taktMount.setOnRunningExtra(...recManager.clockStopped()...)`, der Manager faechert
 *    an alle Instanzen auf.
 *  - `recName`/`recSrc` dagegen sind ECHT pro Instanz (`_i`-Suffix).
 *
 * Migration (@dpa-Auftrag: „localStorage-Kompatibilität mit bestehenden Configs/Presets nicht
 * brechen"): der alte Singleton hatte GENAU EINE Gruppe „Aufnahme" mit Controls 'b:rec'/
 * 'x:recName' (unsuffixed). Instanz 0 behält den GRUPPENNAMEN „Aufnahme" (wie multiScope
 * Instanz 0 „Scope" behält) — Gruppen-Optik (groupPos/groupStyles) braucht darum KEINE
 * Migration. Die CONTROL-IDs ändern sich aber zu 'b:rec_0'/'x:recName_0' (jede Instanz braucht
 * eindeutige IDs) — migrateLegacyIds() hebt vorhandene ctrlStyles/keyBindings/midiBindings der
 * alten IDs einmalig auf die neuen. `recName` (Wert) wird nach `recName_0` kopiert, damit ein
 * vorhandener Dateiname erhalten bleibt. NICHT migriert: ctrlPos/controlOrder (Position
 * INNERHALB der Gruppe) — seltener Sonderfall (Control von Hand im e-Mode verschoben), fällt
 * im Randfall auf die Default-Position zurück, kein Datenverlust bei den eigentlichen Werten.
 */
import { recInstrumentDefs } from './defs.js';
import { createRecEngine } from './engine.js';
import { PickMenu } from '../PickMenu.js';

const VALUE_KEYS = ['recName', 'recSrc'];   // pro Instanz — Rest bleibt ISM-weit geteilt (s. Kopf)

function recGroupName(i) { return i === 0 ? 'Aufnahme' : 'Aufnahme ' + (i + 1); }

/** State-View für EINE Rec-Engine-Instanz: recName/recSrc scoped auf `_i`, alles andere
 *  (recFormat, recMp3-Felder, recWav-Felder) unsuffixed/geteilt durchgereicht — dieselbe
 *  Unterscheidung, die lib/mainSettings.js für das globale Aufnahme-Format schon trifft. */
function scoped(state, sfx) {
    return {
        get: (k) => (VALUE_KEYS.includes(k) ? state.get(k + sfx) : state.get(k)),
        set: (k, v) => (VALUE_KEYS.includes(k) ? state.set(k + sfx, v) : state.set(k, v)),
    };
}

/** Einmalige Migration alter unsuffixed Control-IDs (Singleton-Stand) auf 'id_0' — nur die
 *  flachen Optik-Maps ({id: wert}), s. Datei-Kopf. */
function migrateLegacyIds(state, pairs) {
    for (const mapKey of ['ctrlStyles', 'keyBindings', 'midiBindings']) {
        const cur = state.get(mapKey);
        if (!cur) continue;
        let changed = false;
        const next = { ...cur };
        for (const [oldId, newId] of pairs) {
            if (oldId in next && !(newId in next)) { next[newId] = next[oldId]; delete next[oldId]; changed = true; }
        }
        if (changed) state.set(mapKey, next);
    }
}

/**
 * @param {object} o
 * @param {object} o.host    mountGroups()-Rückgabe des Rec-ISMs (EIN Host für alle Instanzen)
 * @param {object} o.state   Rec-ISM-State (MiniState, `new MiniState(recInstrumentDefs().DEFAULTS, REC_LS)`)
 * @param {object} o.defs    DASSELBE defs-Objekt, mit dem `host` gebaut wurde (BUTTONS/TEXTS
 *        werden hier zur Laufzeit erweitert — GroupHost hält eine lebende Referenz darauf)
 * @param {object} o.routing Routing-Registry (createRoutingRegistry())
 * @param {() => number} o.getBpm
 * @param {() => number} o.getBeatsPerBar
 * @param {() => boolean} o.isClockRunning
 */
export function createRecManager({ host, state, defs, routing, getBpm, getBeatsPerBar, isClockRunning }) {
    const recs = [];   // { engine, pickMenu }
    // hasNode-Only-Filter (Rec braucht einen ECHTEN AudioNode zum Verbinden, kein reiner
    // Zahlen-read() wie beim Scope-„Quelle"-Picker).
    let sourceCache = routing.outputSources().filter((t) => !!t.hasNode);

    /** GroupHost reicht den VOLLEN, indizierten Key ('rec_0', 'rec_1', …) durch (s.
     *  recInstrumentDefs()-Fix im tpl unten) — hier auf die passende Instanz auflösen. */
    function dispatch(id, phase) {
        const at = id.lastIndexOf('_');
        const i = at >= 0 ? parseInt(id.slice(at + 1), 10) : NaN;
        const entry = Number.isFinite(i) ? recs[i] : null;
        if (entry) entry.engine.onAction('rec', phase);
    }
    const tpl = recInstrumentDefs({ onAction: dispatch });

    function resolveNode(sfx) {
        const key = state.get('recSrc' + sfx);
        if (!key) return null;   // '' → Fallback in engine.js: getMaster() (Alt-Verhalten)
        const t = sourceCache.find((x) => x.module + '.' + x.port === key);
        return t && t.hasNode && typeof t.node === 'function' ? t.node() : null;
    }

    function buildRec(i) {
        const sfx = '_' + i;
        for (const k of VALUE_KEYS) {
            if (state.get(k + sfx) === undefined) state.set(k + sfx, tpl.DEFAULTS[k]);
        }
        defs.BUTTONS[('rec' + sfx)] = tpl.BUTTONS.rec;
        defs.TEXTS[('recName' + sfx)] = tpl.TEXTS.recName;

        host.addGroup({
            name: recGroupName(i),
            buttons: ['rec' + sfx],
            texts: ['recName' + sfx],
            groupKind: 'Rec',
            instanceSuffix: sfx,
            extraSoundKeys: VALUE_KEYS,
        });

        const st = scoped(state, sfx);
        const eng = createRecEngine(st, {
            getBpm, getBeatsPerBar, isClockRunning,
            getInputNode: () => resolveNode(sfx),
        });
        eng.onRecording((on) => host.setCtrlOn('b:rec' + sfx, on));
        eng.onRecArmed((armed) => host.setCtrlBlink('b:rec' + sfx, !!armed));

        // Routing-Anmeldung (nur der clock-Input, wie beim alten Singleton — Struktur-Ansicht/
        // künftige Migration; die ECHTE Zustellung bleibt handleClockBeat() unten).
        const moduleId = 'rec' + sfx;
        routing.registerModule(moduleId, {
            label: recGroupName(i),
            latency: eng.latency,
            inputs: { clock: { type: 'Gate', label: 'Clock', write: () => {} } },
        });
        routing.connect({ module: 'takt', port: 'beat' }, { module: moduleId, port: 'clock' }, { active: false });

        // Quelle-PickMenu (Tap-Punkt) — 1:1 das Scope-„Quelle"-Muster (multiScope.js), aber auf
        // hasNode gefiltert (s. sourceCache oben).
        const targetFor = (modPort) => sourceCache.find((t) => t.module + '.' + t.port === modPort) || null;
        const pm = new PickMenu({
            label: 'Quelle',
            empty: 'Master (Ensemble)',
            noContextOpen: true,
            tailAlign: true,
            title: 'Abgriffspunkt dieser Aufnahme wählen (leer = Master-Bus, wie bisher) — Fußzeile: Liste neu laden',
            list: () => sourceCache,
            current: () => { const t = targetFor(state.get('recSrc' + sfx)); return t ? t.name : ''; },
            onPick: (idx, item) => { state.set('recSrc' + sfx, item.module + '.' + item.port); },
            foot: [['load', '↪️ Neu laden', 'Liste der verfügbaren Abgriffspunkte neu aus dem Ensemble laden', () => {
                sourceCache = routing.outputSources().filter((t) => !!t.hasNode);
                pm.refresh();
            }]],
        });
        host.mountInGroup(recGroupName(i), pm.element, 's:recSrc' + sfx);
        host.registerCtrlStyle('s:recSrc' + sfx, 'select', pm.element, (s) => {
            const lab = pm.element.querySelector('.pm-label');
            if (lab) lab.textContent = s.label || 'Quelle';
            pm.element.classList.remove('sel-label-top', 'sel-label-left', 'sel-label-right', 'sel-label-bottom', 'sel-label-off');
            pm.element.classList.add('sel-label-' + (s.labelPos || 'top'));
            const btn = pm.element.querySelector('.pm-btn');
            if (btn) {
                btn.style.background = s.bg0 || '';
                btn.style.color = s.fg || '';
                btn.style.fontSize = s.size ? s.size + 'px' : '';
                btn.style.padding = s.pad != null ? s.pad + 'px' : '';
                btn.style.width = s.boxSize ? s.boxSize + 'px' : '';
                btn.style.minWidth = s.boxSize ? s.boxSize + 'px' : '';
            }
        }, 'Quelle');

        recs[i] = { engine: eng, pickMenu: pm };
    }

    function teardownLast() {
        const i = recs.length - 1;
        if (i < 0) return;
        const sfx = '_' + i;
        const entry = recs[i];
        if (entry.engine.recording()) entry.engine.onAction('rec');   // laufende Aufnahme sauber stoppen
        entry.pickMenu.close();
        routing.unregisterModule('rec' + sfx);
        recs.splice(i, 1);
        host.removeGroup(recGroupName(i));
        for (const k of VALUE_KEYS) state.remove(k + sfx);
        delete defs.BUTTONS['rec' + sfx];
        delete defs.TEXTS['recName' + sfx];
    }

    function reconcile() {
        let want = state.get('recCount');
        if (!(want >= 1)) want = 1;
        while (recs.length < want) buildRec(recs.length);
        while (recs.length > want) teardownLast();
        state.set('recCount', recs.length);
        return recs.length;
    }

    function init() {
        // Migration Singleton → Instanz 0 (nur beim ERSTEN Hochlauf nach dem Umbau — erkennbar
        // daran, dass es noch kein `recCount` gibt).
        if (state.get('recCount') == null) {
            if (state.get('recName_0') === undefined && state.get('recName') !== undefined) {
                state.set('recName_0', state.get('recName'));
            }
            migrateLegacyIds(state, [['b:rec', 'b:rec_0'], ['x:recName', 'x:recName_0']]);
        }
        reconcile();
    }

    function addRec() { state.set('recCount', recs.length + 1); reconcile(); }
    function removeRec() {
        if (recs.length <= 1) return false;
        state.set('recCount', recs.length - 1); reconcile(); return true;
    }

    /** Roher Scheduler-Beat (Takt/Metronom) → an ALLE Instanzen (Downbeat-Arming). */
    function handleClockBeat(time, beatInBar) {
        for (const r of recs) r.engine.handleClockBeat(time, beatInBar);
    }
    /** Takt gestoppt, während eine/mehrere Instanzen noch armed waren → sofort auflösen
     *  (@dpa 20260722_013727: sonst bleibt Rec für immer blinkend hängen). */
    function clockStopped() {
        for (const r of recs) r.engine.clockStopped();
    }

    /** Jede TATSÄCHLICH laufende Aufnahme sofort beenden (🔇 Audio-Reset, alle Einstiege) —
     *  vorher gab's nur EINE Engine, die der Reset-Knopf direkt anfasste; jetzt können
     *  mehrere Instanzen gleichzeitig aufnehmen. */
    function stopAllRecording() {
        for (const r of recs) if (r.engine.recording()) r.engine.onAction('rec');
    }

    return {
        init, addRec, removeRec, reconcile, recs, count: () => recs.length,
        handleClockBeat, clockStopped, stopAllRecording,
    };
}

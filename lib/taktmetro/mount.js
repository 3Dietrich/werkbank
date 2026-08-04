/**
 * lib/taktmetro/mount.js — EIN Mount für Takt/Metronom (@dpa 20260804).
 *
 * Vorher stand dieser Block (State anlegen, Engine bauen, GroupHost mounten, Engine↔Host-
 * Callbacks verdrahten, Routing-Modul registrieren) byte-identisch in overcord/werkbank.js,
 * werkbank-leer/werkbank-leer.js UND pitchosc/pitchosc.js (Dreifachkopie, s. ddw.md
 * 20260804). Takt/Metronom gilt für das GANZE Ensemble — anders als Rec/LevelMeter (die
 * @dpa künftig an mehreren Stellen gleichzeitig abgreifen möchte) kann es davon nur EINE
 * Instanz geben, darum hier direkt dedupliziert (kein Manager-Pattern/Ports-Vervielfältigung
 * nötig wie bei ADSR/Scope) — Rec/LevelMeter bleiben bewusst unangetastet, bis deren
 * Multi-Instanz-Frage (Manager-Pattern) geklärt/gebaut ist.
 *
 * overcords Fassung hatte einen ZUSÄTZLICHEN Zweig in `onAction` (sqManager.armBeatSync()/
 * resyncPhase() bei 'bang'/'bang2' — Stepseq-Resync, existiert nur dort). Das ist KEINE
 * Takt-Logik, sondern eine Naht zu einem anderen Instrument — darum als optionaler
 * `onExtraAction(id, phase)`-Hook nach außen gereicht, statt ihn hier fest zu verdrahten
 * (nur overcord/werkbank.js übergibt ihn).
 *
 * Verwendung (1:1 Ersatz für den alten Block):
 *   const taktMount = mountTaktMetro({ routing, instrumentScaledGetter: () => taktInstr.scaled() });
 *   const { taktState, taktEngine, taktDefs, taktRoot, takt } = taktMount;
 *   const taktInstr = mountInstrumentSettings(benchTakt, taktState, { bodySelector: '#taktgeber', host: takt });
 *   // Rec hängt sich weiterhin an (dasselbe Muster wie vorher, nur über Setter statt Closure-Var):
 *   taktMount.setOnRunningExtra((on) => { if (!on) recEngine.clockStopped(); });
 */
import { lsKey } from '../appId.js';
import { MiniState } from '../MiniState.js';
import { mountGroups } from '../group/GroupHost.js';
import { taktMetroDefs } from './defs.js';
import { createTaktEngine } from './engine.js';
import { knobWrites, buttonWrites } from '../routing/portGen.js';
import { bindPorts } from '../routing/Registry.js';

export function mountTaktMetro({ routing, instrumentScaledGetter, onExtraAction } = {}) {
    const TAKT_LS = lsKey('taktmetro');
    const taktState = new MiniState(taktMetroDefs().DEFAULTS, TAKT_LS);
    const taktRoot = document.querySelector('#taktgeber');
    const taktEngine = createTaktEngine(taktState);
    const taktDefs = taktMetroDefs({
        onAction: (id, phase) => {
            taktEngine.onAction(id, phase);
            if (onExtraAction) onExtraAction(id, phase);
        },
        audioInfo: () => {
            taktEngine.ensureAudio();
            const c = taktEngine.context;
            return c ? { sampleRate: c.sampleRate, baseLatency: c.baseLatency, outputLatency: c.outputLatency, state: c.state } : null;
        },
    });
    // instrumentScaledGetter zeigt auf `taktInstr`, das der Aufrufer ERST NACH diesem Mount
    // anlegen kann (mountInstrumentSettings braucht `host: takt`, den es von hier bekommt) —
    // TDZ-sicher, weil GroupHost `instrumentScaled` erst bei Bedarf aufruft, nie beim Mounten
    // selbst (dasselbe Muster wie im alten, jetzt entfernten Code an Ort und Stelle).
    const taktOpts = { instrumentScaled: () => instrumentScaledGetter() };
    const takt = mountGroups(taktRoot, taktState, taktDefs, taktOpts);

    let _onRunningExtra = () => {};
    taktEngine.onRunning((on, avv) => { takt.setCtrlOn('b:start', on); takt.setCtrlOn('b:startCont', on); _onRunningExtra(on, avv); });
    taktEngine.onBeat((i) => takt.setBeat('u:beatView', i));
    taktEngine.onNudge((liveBpm) => takt.setKnobDisplay('bpm', liveBpm));
    window.__takt = { engine: taktEngine, state: taktState, host: takt };

    if (routing) {
        routing.registerModule('takt', {
            label: 'Takt/Metronom', latency: taktEngine.latency,
            ...bindPorts(taktDefs.ports, {
                outputs: {},
                inputs: {
                    ...knobWrites(taktState, taktDefs.KNOBS),
                    ...buttonWrites(takt.keyMidi, Object.keys(taktDefs.BUTTONS)),
                    // baseFreqIn bleibt Teil der Naht (Modularität) — auch ohne Quelle, die
                    // je verbindet, idempotent/harmlos (1:1 aus dem alten Code übernommen).
                    baseFreqIn: { write: (v) => taktEngine.setBaseFreqIn(v) },
                },
            }),
        });
    }

    return {
        taktState, taktEngine, taktDefs, taktRoot, takt,
        taktLsKey: TAKT_LS,
        // Dieselbe Objekt-Referenz, die mountGroups() oben schon hat (s. Kommentar zu
        // `taktOpts` weiter oben) — der Aufrufer darf `taktOpts.onArrangeChange` NACH
        // diesem Mount noch setzen (Header-Knopf existiert dann erst), GroupHost liest
        // live aus derselben Referenz.
        taktOpts,
        setOnRunningExtra: (fn) => { _onRunningExtra = fn; },
    };
}

/**
 * types.js — Port-Typen-Tabelle + Adapter-Register für die Routing-Registry (Phase 2,
 * PLAN_OPERA.md Z. 87-113 / PHASE2_SPEC.md).
 *
 * `kind` ist aus dem `type` ableitbar (ein Port deklariert nur `type` in seiner defs.js,
 * s. docs/CONTROLS.md) — event = push im Ereignismoment (Registry.emit), value = pro Frame
 * gültig/pull (Registry.flush). Absichtlich KEIN generischer Zahlen-Cast zwischen Typen:
 * jede erlaubte Kreuzung ist eine bewusste Zeile in ADAPTERS, sonst gilt „inkompatibel".
 */
import { midiToFreq } from '../polysynth/pitch/Scaler.js';

export const TYPES = {
    // Üblich 1..99, aber NICHT auf Positivwerte beschränkt — als Gate-Quelle gilt seit
    // @dpa 20260727_144x „0 = aus, alles ANDERE (auch negativ) = an" (s. ADAPTERS unten).
    'AmpEnv':            { kind: 'event' },
    'Gate':              { kind: 'value' },   // 0 = aus, >0 = an/Level
    'OSZ-F':              { kind: 'value' },   // Hz, >0
    'OSZ-P':              { kind: 'value' },   // Phase 0..1
    'BaseFreq-Ton':       { kind: 'value' },   // 0 = kein Ton, 1..12 = Tonklasse
    'Keyboard':           { kind: 'event' },   // {note, vel, on}
    'Keyboard-Speicher':  { kind: 'event' },   // {slot, note, vel, on}, 0 = leerer Slot
    // Punkt 3b (ddw.md 20260724): beliebiger kontinuierlicher Zielwert (Knob/Note-Nummer) für
    // die Sq-Fernsteuerung — `kind` ist hier rein deklarativ (Registry.deliver() ist laut
    // Analyse „kind-agnostisch": es befragt weder connections noch TYPES[type].kind, nur
    // canConnect()+write()). Braucht einen eigenen Typ statt 'Gate', weil AmpEnv->Gate negative
    // Werte auf 0 klemmt (kaputt für Knobs mit negativem min, z.B. kbMidiOffset).
    'Value':              { kind: 'value' },
};

/** Tonklasse (1..12, 0 = kein Ton) → Hz. Anker C2/MIDI 36 — dieselbe Rechnung wie
 *  polysynth/engine.js baseFreq() im Zweig baseSrc==='Ton' (3*12+pc). Reine Pitch-Mathematik
 *  (Scaler.js ist ein DSP-Baustein, kein Verhalten) — die Kopplung ist bewusst, kein Bruch
 *  der Registry-Neutralität. */
export function toneToHz(tone) {
    if (!(tone > 0)) return 0;
    const pc = (Math.round(tone) - 1 + 1200) % 12;   // 1..12 → 0..11, robust gegen Werte <1
    return midiToFreq(36 + pc);
}

/** src-Typ → dst-Typ: Wert-Umrechner. Bewusst klein/explizit statt generisch. */
export const ADAPTERS = {
    // FIX (@dpa 20260727_144x: "alles was SeqOut>0 sendet ist Gate Trigger [...] muss ich
    // korrigieren: zukünftig != 0. Also alles was nicht 0 ist wird als Gate gesendet [...]
    // 0 ist der GateOff"): vorher klemmte dieser Adapter JEDEN negativen Sq-Step-Wert auf 0,
    // BEVOR er den Gate-Consumer (z.B. multiEnv.js gate-write, das seinerseits schon auf
    // v!==0 korrigiert ist) überhaupt erreichte — ein negativer Step (z.B. -0.5) schaltete
    // das Gate fälschlich AUS statt AN. Reiner Pass-Through, „0=aus/alles andere=an" liegt
    // jetzt beim jeweiligen Gate-Consumer (write()), nicht mehr hier.
    'AmpEnv->Gate': (v) => v,
    'Gate->AmpEnv': (v) => (v > 0 ? Math.max(1, Math.min(99, Math.round(v))) : 0),
    'BaseFreq-Ton->OSZ-F': (t) => toneToHz(t),
    // Reiner Pass-Through (Punkt 3b): StepSeqGrid.setTargetDefaults() skaliert die Step-Werte
    // schon aufs Ziel-min..max (s. lib/stepseq/ui/StepSeqGrid.js) — der Port-write() selbst
    // klemmt zur Sicherheit nochmal (s. lib/routing/portGen.js), hier keine Umrechnung nötig.
    'AmpEnv->Value': (v) => v,
};

export function canConnect(srcType, dstType) {
    if (srcType === dstType) return true;
    return typeof ADAPTERS[`${srcType}->${dstType}`] === 'function';
}

/** Liefert den umgerechneten Wert, oder `undefined` bei inkompatiblen Typen (Aufrufer muss
 *  das prüfen — kein stiller Fallback auf den Rohwert). */
export function adaptValue(srcType, dstType, value) {
    if (srcType === dstType) return value;
    const fn = ADAPTERS[`${srcType}->${dstType}`];
    return fn ? fn(value) : undefined;
}

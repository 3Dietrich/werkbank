/**
 * seqCore.js — reine Step-Sequenzer-Logik des Stepsequenzer-ISM.
 *
 * Web-Audio-frei → headless testbar. Aus der alten teslacoil-Datei `lib/stepSeq.js`
 * (Filter & Amp) ins ISM gezogen (Phase 0, PLAN_OPERA.md): das ISM soll NICHT mehr an
 * Alt-Code außerhalb seines Ordners hängen. Nur die vom ISM tatsächlich genutzten Helfer
 * (Dyn-Spreizung war nur im gelöschten StepSeqUI-Widget, darum hier nicht mehr dabei).
 *
 * Wert je Step (Punkt 1, ddw.md — Sq-Outputs pro Ziel, @dpa: „off … als den Wert 0"):
 *   null = off  → kein Trigger (die alte Hüllkurve läuft weiter), UNABHÄNGIG vom Ziel
 *   Zahl = Trigger mit diesem Rohwert — Skala (min/max/stepSize) kommt vom gewählten
 *          Sq-Ziel (routing.inputTargets), NICHT mehr fix 0..1. `0` ist damit bei Zielen
 *          mit offAllowed:false ein ECHTER Wert (z.B. „Gate 0 %"), kein Off-Sentinel mehr.
 */

export const SEQ_MAX = 120;

/**
 * Default-Puffer bauen.
 *   'first' → nur Step 0 = 1, Rest off/null (einmal triggern, dann laufen lassen)
 *   'full'  → alles 1        (jeder Step voll)
 */
export function makeSeqSteps(mode) {
    const a = new Array(SEQ_MAX).fill(mode === 'full' ? 1 : null);
    if (mode === 'first') a[0] = 1;
    return a;
}

/**
 * Nächste Position im Ringlauf.
 *   reset=true → 0 (der „set0"-Knopf: nächster Trigger fängt vorne an)
 *   sonst      → (pos+1) mod length
 * pos startet sinnvoll bei -1 → erster Trigger landet auf 0.
 */
export function seqAdvance(pos, length, reset) {
    const len = Math.max(1, Math.min(SEQ_MAX, length | 0));
    if (reset) return 0;
    return (((pos | 0) + 1) % len + len) % len;
}

/**
 * Fill: das sichtbare Muster [0..length) über den unsichtbaren Rest bis SEQ_MAX
 * kacheln. Nach dem Aufziehen von Steps wiederholt sich so der bisherige Inhalt.
 * Gibt einen NEUEN Array zurück (State-Immutabilität). KEIN 0..1-Clamp mehr (die Skala
 * ist ziel-abhängig) — `null` (off) und Zahlen werden unverändert durchgereicht.
 */
export function fillSeq(steps, length) {
    const len = Math.max(1, Math.min(SEQ_MAX, length | 0));
    const out = new Array(SEQ_MAX);
    for (let i = 0; i < SEQ_MAX; i++) {
        const src = i < len ? i : i % len;
        const v = steps && steps[src];
        out[i] = v == null ? null : v;
    }
    return out;
}

/**
 * envCore.js — reine ADSR-DSP (SR-basiert), DOM-frei, testbar.
 *
 * Liefert Float32Array-Kurven für setValueCurveAtTime(). Alle Zeiten in Samples
 * (0 = 1 Sample, ddw-konform). Spezialfälle exakt nach ddw.md 20260725:
 *   - kein Segment aktiv → 1-Sample-Puls voller Wert, dann 0
 *   - nur A aktiv → Attack + 0.5ms lin-down auf 0
 *   - ADS ohne R → nach Sustain 0.5ms linear auf 0
 *   - ADR bei Trig → D überspringen, direkt A→R
 *   - verlauf off: 0.5ms Outin-Fade vom letzten Wert
 *   - verlauf on: letzter Wert wird übernommen, Attack darauf angesetzt
 *   - inv: Vorzeichen am Ausgang drehen
 *
 * Kurven: lin(t)^skew und log/exp-Rampen mit skew (beide Modi).
 * Alles 0-basiert: Ende immer 0, dazwischen positiv/negativ via inv.
 */

const OUTIN_MS = 0.5;  // Outin-Fade-Dauer in ms

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

/**
 * Wandelt ms in Samples um.
 */
export function msToSamples(ms, sampleRate) {
    return Math.max(0, Math.round(ms * sampleRate / 1000));
}

/**
 * Erzeugt eine Kurve für ein Segment (Attack/Decay/Release).
 * mode: 'lin' | 'log'
 * skew: 0.01–100 (1 = neutral/linear). LIN-Formel (@dpa-Spezifikation ddw.md 20260727):
 *   skew ≤ 1 → t^skew (Ur-Formel, unverändert) — je kleiner, desto steiler der ANFANG.
 *   skew > 1 → 1-(1-t)^skew (Spiegel-Formel, NEU — vorher fälschlich auch t^skew, was
 *   bei skew>1 GENAU DAS GEGENTEIL der dokumentierten Absicht ergab: flacher Anfang
 *   statt steiler). Beide Zweige treffen sich bei skew=1 exakt in „t" (reines Linear) —
 *   entfernt man sich in EINE der beiden Richtungen von 1, wird der Anfang steiler (nicht
 *   „>1 steil, <1 flach" wie der alte, nachweislich falsche Kommentar hier behauptete).
 * from/to: Start-/Endwert (0–1, vor inv)
 * lenSamples: Länge in Samples
 * sr: Sample-Rate
 */
function segmentCurve(from, to, lenSamples, mode, skew, sr) {
    if (lenSamples <= 0) return new Float32Array([to]);
    const curve = new Float32Array(lenSamples);
    const s = Math.max(0.01, Math.min(100, skew || 1));
    // 0 als Endwert: log-Mode kann 0 nicht erreichen (exponential geht nie exakt auf 0),
    // deshalb linear fallen lassen, wenn to===0 oder from===0 (unvermeidbarer Grenzfall).
    const useLin = mode === 'lin' || to === 0 || from === 0;
    if (!useLin) {
        // Log/exp: exponentieller Übergang, skew verändert (als Zeit-Warp VOR der
        // Exponentialformel) nur, WIE SCHNELL der ohnehin exponentielle Verlauf durchlaufen
        // wird — nicht die Log/Log-Bild-Steilheit selbst. Bewusst NICHT die gespiegelte
        // Formel von oben (die ist fürs lineare Segment gedacht) — offene Frage @dpa
        // 20260727 „machen skew bei log Sinn?" noch nicht abschließend geklärt.
        const safeFrom = Math.max(0.0001, Math.abs(from)) * (from < 0 ? -1 : 1);
        const safeTo = Math.max(0.0001, Math.abs(to)) * (to < 0 ? -1 : 1);
        const ratio = safeTo / safeFrom;
        for (let i = 0; i < lenSamples; i++) {
            const t = i / lenSamples;
            const expT = Math.pow(t, s);
            curve[i] = safeFrom * Math.pow(ratio, expT);
        }
    } else {
        // Linear mit skew — s. Kopf-Kommentar: zwei Formeln, die sich bei skew=1 treffen.
        for (let i = 0; i < lenSamples; i++) {
            const t = i / lenSamples;
            const shape = s <= 1 ? Math.pow(t, s) : 1 - Math.pow(1 - t, s);
            curve[i] = from + (to - from) * shape;
        }
    }
    // Exaktes Ende erzwingen (Float-Rundung)
    curve[lenSamples - 1] = to;
    return curve;
}

/**
 * Eine ADSR-Instanz. Erzeugt Kurven für trigger/gateOff.
 */
export class AdsrCore {
    constructor() {
        this._lastLevel = 0;      // letzter Ausgangspegel (für verlauf=on)
        this._gate = false;
    }

    /**
     * Erzeugt die komplette Env-Kurve für einen Trigger.
     * cfg: { a,d,s,r, peak, aOn,dOn,sOn,rOn, inv, verlauf,
     *        aCurve,dCurve,rCurve, aSkew,dSkew,rSkew, trigMode, lenFest, lenSamples, outinSamples }
     * sr: Sample-Rate
     * Rückgabe: { curve: Float32Array, duration: seconds, startOffset: seconds }
     *   startOffset ist negativ, wenn der Outin-Fade vor dem eigentlichen Trigger beginnt.
     */
    trigger(cfg, sr) {
        const aOn = cfg.aOn, dOn = cfg.dOn, sOn = cfg.sOn, rOn = cfg.rOn;
        const inv = cfg.inv ? -1 : 1;
        const peak = Math.max(0.01, Math.min(1, cfg.peak ?? 1));
        const a = Math.max(0, cfg.a ?? 0.01);
        const d = Math.max(0, cfg.d ?? 0.15);
        const s = clamp01(cfg.s ?? 0.7);
        const r = Math.max(0, cfg.r ?? 0.3);
        const trigMode = cfg.trigMode === 'trig';
        const lenSamples = Math.max(0, cfg.lenSamples ?? 0);
        // Len: fest/offen (ddw.md 20260726) — nur im Gate-Modus relevant (Trig ist per
        // Definition immer 'fest', lenSamples/Len bestimmt dort die Länge). 'offen' heißt:
        // KEIN Auto-Close nach Zeit einplanen — der Pegel bleibt auf dem letzten geplanten
        // Wert stehen (AudioParam hält den automatisch, ohne dass wir irgendwas „ewig"
        // vorausberechnen müssten), bis ein ECHTES gateOff() die Kurve abbricht und die
        // Release-Rampe neu plant (s. AdsrCore.gateOff / EnvEngine.gateOff).
        const openHold = !trigMode && cfg.lenFest === false;
        const outinSamples = msToSamples(OUTIN_MS, sr);
        const verlauf = !!cfg.verlauf;
        const aCurve = cfg.aCurve || 'lin', dCurve = cfg.dCurve || 'log', rCurve = cfg.rCurve || 'log';
        const aSkew = cfg.aSkew ?? 1, dSkew = cfg.dSkew ?? 1, rSkew = cfg.rSkew ?? 1;

        // interne Werte immer positiv (0..1), inv wird am Ende auf die ganze Kurve angewendet
        const outPeak = peak;

        // Startwert: verlauf=on → letzter Level (vorzeichenbehaftet), verlauf=off → 0
        const startLevel = verlauf ? this._lastLevel : 0;

        // Outin-Fade: vom aktuellen Level auf 0 in 0.5ms, dann Env starten
        const fadeCurve = segmentCurve(startLevel, 0, outinSamples, 'lin', 1, sr);

        // Hilfsfunktion: Kurve zusammensetzen + inv anwenden
        const finish = (parts) => {
            let totalLen = 0;
            for (const p of parts) totalLen += p.length;
            const total = new Float32Array(totalLen);
            let off = 0;
            for (const p of parts) { total.set(p, off); off += p.length; }
            if (inv < 0) for (let i = 0; i < total.length; i++) total[i] *= -1;
            return { curve: total, duration: total.length / sr, startOffset: -outinSamples / sr };
        };

        // ── Spezialfälle ──────────────────────────────────────────────────────
        // Kein Segment aktiv → 1-Sample-Puls voller Wert, dann 0
        if (!aOn && !dOn && !sOn && !rOn) {
            this._lastLevel = 0;
            return finish([fadeCurve, new Float32Array([outPeak, 0])]);
        }

        // Nur A aktiv → Attack + 0.5ms lin-down auf 0
        if (aOn && !dOn && !sOn && !rOn) {
            const aLen = msToSamples(a * 1000, sr);
            const downLen = msToSamples(OUTIN_MS, sr);
            const aCurveArr = segmentCurve(0, outPeak, aLen, aCurve, aSkew, sr);
            const downCurve = segmentCurve(outPeak, 0, downLen, 'lin', 1, sr);
            this._lastLevel = 0;
            return finish([fadeCurve, aCurveArr, downCurve]);
        }

        // ADS ohne R → nach Sustain 0.5ms linear auf 0
        if (aOn && dOn && sOn && !rOn) {
            const aLen = msToSamples(a * 1000, sr);
            const dLen = msToSamples(d * 1000, sr);
            const aCurveArr = segmentCurve(0, outPeak, aLen, aCurve, aSkew, sr);
            const dCurveArr = segmentCurve(outPeak, outPeak * s, dLen, dCurve, dSkew, sr);
            if (openHold) {
                // offen: nach Decay auf Sustain-Level halten, kein Auto-Drop (s. openHold oben)
                this._lastLevel = outPeak * s * inv;
                return finish([fadeCurve, aCurveArr, dCurveArr]);
            }
            // sustainLen = lenSamples, EGAL ob Trig oder Gate (@dpa 20260727-Korrektur): Len
            // (ms/Beat, via Len-Einheit) bestimmt jetzt BEIDE Fälle einheitlich — kein
            // separates, immer-Sekunden-basiertes gateLen mehr (das nie auf Len-Einheit
            // reagierte, s. defs.js adsrLenFest-Kommentar).
            const sustainLen = lenSamples;
            const downLen = msToSamples(OUTIN_MS, sr);
            const sustainArr = new Float32Array(Math.max(1, sustainLen)).fill(outPeak * s);
            const downCurve = segmentCurve(outPeak * s, 0, downLen, 'lin', 1, sr);
            this._lastLevel = 0;
            return finish([fadeCurve, aCurveArr, dCurveArr, sustainArr, downCurve]);
        }

        // ADR bei Trig → D überspringen, direkt A→R
        if (aOn && dOn && !sOn && rOn && trigMode) {
            const aLen = msToSamples(a * 1000, sr);
            const rLen = msToSamples(r * 1000, sr);
            const aCurveArr = segmentCurve(0, outPeak, aLen, aCurve, aSkew, sr);
            const rCurveArr = segmentCurve(outPeak, 0, rLen, rCurve, rSkew, sr);
            this._lastLevel = 0;
            return finish([fadeCurve, aCurveArr, rCurveArr]);
        }

        // ── Standard-ADSR ─────────────────────────────────────────────────────
        const parts = [fadeCurve];
        let currentLevel = startLevel;

        if (aOn) {
            const aLen = msToSamples(a * 1000, sr);
            const aCurveArr = segmentCurve(currentLevel, outPeak, aLen, aCurve, aSkew, sr);
            parts.push(aCurveArr);
            currentLevel = outPeak;
        }

        if (dOn) {
            const dLen = msToSamples(d * 1000, sr);
            const target = sOn ? outPeak * s : 0;
            const dCurveArr = segmentCurve(currentLevel, target, dLen, dCurve, dSkew, sr);
            parts.push(dCurveArr);
            currentLevel = target;
        }

        if (sOn) {
            if (openHold) {
                // offen: auf dem Sustain-Level halten, KEIN Sustain-/Release-Segment
                // vorausplanen — gateOff() bricht die Kurve ab und plant die Release-Rampe
                // erst, wenn sie wirklich gebraucht wird.
                this._lastLevel = currentLevel * inv;
                return finish(parts);
            }
            // sustainLen = lenSamples, EGAL ob Trig oder Gate (@dpa 20260727-Korrektur): Len
            // (ms/Beat, via Len-Einheit) bestimmt jetzt BEIDE Fälle einheitlich — kein
            // separates, immer-Sekunden-basiertes gateLen mehr (das nie auf Len-Einheit
            // reagierte, s. defs.js adsrLenFest-Kommentar).
            const sustainLen = lenSamples;
            const sustainArr = new Float32Array(Math.max(1, sustainLen)).fill(currentLevel);
            parts.push(sustainArr);
        }

        if (rOn) {
            const rLen = msToSamples(r * 1000, sr);
            const rStart = trigMode && sOn ? msToSamples((cfg.len ?? 0) * 1000, sr) : 0;
            if (rStart > 0) {
                const holdArr = new Float32Array(rStart).fill(currentLevel);
                parts.push(holdArr);
            }
            const rCurveArr = segmentCurve(currentLevel, 0, rLen, rCurve, rSkew, sr);
            parts.push(rCurveArr);
            currentLevel = 0;
        }

        this._lastLevel = currentLevel * inv;
        return finish(parts);
    }

    /**
     * Erzeugt die Release-Kurve für Gate-Modus.
     * currentLevel: aktueller Pegel zum Zeitpunkt von gateOff
     */
    gateOff(cfg, sr, currentLevel) {
        const rOn = cfg.rOn;
        const r = Math.max(0, cfg.r ?? 0.3);
        const inv = cfg.inv ? -1 : 1;
        const rCurve = cfg.rCurve || 'log';
        const rSkew = cfg.rSkew ?? 1;
        const rLen = msToSamples(r * 1000, sr);

        if (!rOn || rLen <= 0) {
            const curve = new Float32Array([currentLevel, 0]);
            this._lastLevel = 0;
            return { curve, duration: 2 / sr, startOffset: 0 };
        }

        const curve = segmentCurve(currentLevel, 0, rLen, rCurve, rSkew, sr);
        this._lastLevel = 0;
        return { curve, duration: curve.length / sr, startOffset: 0 };
    }
}

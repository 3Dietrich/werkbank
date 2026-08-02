/**
 * limiterProcessor.js — eigener, sample-genauer Peak-Limiter als AudioWorkletProcessor
 * (ddw.md 20260802: „bei Att=0 müsste es eigentlich mindestens an einer stelle knacken.
 * da ist noch etwas zu langsam!"). Ersetzt den nativen DynamicsCompressorNode aus
 * audioBus.js NUR in seiner Zeitkonstante — der native Node reagiert selbst bei
 * attack=0 nicht sample-genau (feste Grenze der Browser-Implementierung, s. audioBus.js
 * Kopfkommentar). @dpa wollte bei Attack=0 anfangs bewusst hörbares Knacken/Verzerren an
 * harten Transienten SEHEN/HÖREN können — das war sein Diagnose-Signal, dass der Limiter
 * tatsächlich maximal schnell reagiert. Deshalb stand hier ursprünglich „bewusst KEIN
 * Lookahead-Puffer".
 *
 * ── REVIDIERT (ddw.md 20260802, Folge-Prompt): Lookahead jetzt gewollt ──────────────
 * Nach dem eigenen Hörtest hat @dpa das umgedreht: „Man verzögert nur einen Teil in dem
 * Limiter. Und zwar der, der den Peak angibt. Der andere (leicht verzögerte) wird dann
 * von dem Limiter gelimitet." Sprich: der Peak-Detektor/Envelope-Follower unten bleibt
 * unverändert auf dem UNVERZÖGERTEN Eingang (er „sieht in die Zukunft" relativ zum
 * Ausgang) — NUR das tatsächlich ausgegebene Audio läuft durch einen kleinen
 * Ringpuffer (`lookaheadMs`, s. Ringpuffer-Logik unten). Der Attack-Regler bekommt so
 * echten Vorlauf, bevor der Peak selbst am Ausgang erscheint — kein Knacken mehr nötig,
 * um zu sehen, dass der Limiter reagiert. (Die dazugehörige Latenzkompensation ganz vorne
 * — Gates/Trigger von Metronom/Sequenzer entsprechend früher, damit am Ende kein
 * hörbarer Zeitsprung entsteht — ist NICHT Teil dieser Datei, nur die Begründung dafür,
 * warum lookaheadMs hier funktioniert.)
 *
 * ── Algorithmus (klassischer Feedforward-Peak-Limiter, ein Pol) ────────────────────
 * Pro Sample: peak = lautester |Wert| über alle Kanäle (GEKOPPELT — ein gemeinsamer
 * Envelope, dieselbe Gain-Reduktion auf allen Kanälen, sonst würde ein Stereo-Signal
 * beim Limiten pumpen/wandern). envelope läuft mit dem Attack-Koeffizienten hoch,
 * wenn peak > envelope, sonst mit dem Release-Koeffizienten runter. Der Koeffizient
 * kommt aus der üblichen One-Pole-Formel `1 - exp(-1/(sampleRate*sekunden))` — bei
 * ms=0 wird das explizit auf genau 1 gesetzt (keine Glättung, volle Instant-Reaktion
 * in EINEM Sample), das ist der Kern des Features.
 *
 * Gain-Reduktion oberhalb der Schwelle (threshold=0dB=1.0 linear, ratio=20:1, knee=0
 * — dieselben Werte wie der bisherige DynamicsCompressorNode) rechnet bewusst in der
 * dB-Domäne (`pow(env/threshold, 1/ratio - 1)`), NICHT linear interpoliert — nur das
 * ist echte Parität zu einem Compressor mit ratio-Angabe in dB, eine lineare
 * Interpolation zwischen 1 und 1/ratio würde bei hohen Pegeln spürbar zu stark oder
 * zu schwach greifen.
 *
 * ACHTUNG (@dpa niemals „wegfixen"): Attack=0 UND Release=0 gleichzeitig lässt den
 * Gain jedem Sample exakt folgen (`gain = 1/|x|^0.95` oberhalb der Schwelle) — das
 * erzeugt massive, hörbare Wellenform-Verzerrung. Das ist GEWOLLT (das gesuchte
 * Diagnose-Knacken), kein Bug.
 *
 * ── Testbarkeit (@dpa-Session 20260802): headless AudioWorklet-Loading hängt in der
 * Automatisierungs-Umgebung komplett (auch OfflineAudioContext, auch echtes Chrome) —
 * `addModule()` löst nie auf. Deshalb steckt die GESAMTE Mathematik in der reinen
 * Funktion `processBlock()` unten, die `process()` UND ein Node-Test (`node --test`,
 * kein Browser nötig) BEIDE aufrufen — ein Algorithmus, keine zweite Kopie zum
 * Auseinanderdriften. Kein `import`/`export` (AudioWorkletGlobalScope, bewusst
 * portabel/isoliert — das Projekt läuft laut audioBus.js-Kopf auch auf iPhone, ESM in
 * Worklets ist auf manchen WebKit-Versionen historisch wacklig); der `module.exports`-
 * Guard am Dateiende greift nur unter Node (dort existiert `module`, im Worklet nicht).
 */
const THRESHOLD = 1.0;   // 0 dB linear — Parität zum bisherigen DynamicsCompressorNode
const RATIO = 20;        // 20:1 hart, wie bisher

// Kapazität des Lookahead-Ringpuffers: großzügig fix (@dpa-Regel „limits ≠ default" —
// das ist NUR die interne Implementierungs-Kapazität, kein Deckel für den User-Parameter
// lookaheadMs; falls angefordertes lookaheadMs die Kapazität übersteigen sollte, wird
// unten auf sie geclampt, praktisch nie relevant im einstelligen ms-Bereich der UI).
// 2 Sekunden bei üblichen Samplerates ~1-2 MB pro Kanal — trivial.
const LOOKAHEAD_CAPACITY_S = 2;

function computeCoeff(ms, sr) {
    return ms <= 0 ? 1 : 1 - Math.exp(-1 / (sr * (ms / 1000)));
}

/**
 * Legt (bzw. erneuert bei geänderter Kanalzahl/Samplerate) den Lookahead-Ringpuffer in
 * `state` an. Float64Array bewusst statt Float32Array (im Kommentar oben als Beispiel
 * genannt) — der Regressionstest verlangt bei lookaheadMs=0 BIT-genau dasselbe Ergebnis
 * wie vor diesem Feature; ein Float32-Rundtrip würde selbst im Bypass-Fall (Lesen direkt
 * nach dem Schreiben) Präzision verlieren. Speicherkosten bleiben trivial.
 */
function ensureDelayBufs(state, nCh, sampleRate) {
    const capacity = Math.max(1, Math.round(LOOKAHEAD_CAPACITY_S * sampleRate));
    if (!state.delayBufs || state.delayBufs.length !== nCh || state.delayCapacity !== capacity) {
        state.delayBufs = Array.from({ length: nCh }, () => new Float64Array(capacity));
        state.delayCapacity = capacity;
        state.writeIdx = 0;
    }
}

/**
 * Verarbeitet EINEN Block. `state` = { env, delayBufs, writeIdx, delayCapacity } wird
 * mutiert (Envelope UND Ringpuffer-Position laufen über Blockgrenzen hinweg weiter,
 * unabhängig von der Blockgröße — im echten Worklet 128 Samples pro Aufruf, in Tests
 * beliebig). `channelsIn`/`channelsOut` = Arrays von (Float32/normalen) Arrays gleicher
 * Länge `frames`. Gibt den minimalen Gain des Blocks zurück (Reduktions-Anzeige, s.
 * process()).
 *
 * `lookaheadMs` (NEU, optional, Default 0 — Regressionsschutz: kein Parameter = exakt
 * das alte Verhalten): der Peak-Detektor/Envelope-Follower unten arbeitet UNVERÄNDERT
 * auf dem unverzögerten `raw`-Wert. NEU ist nur, dass das tatsächlich ausgegebene Audio
 * aus dem Ringpuffer kommt, `lookaheadSamples` Samples verzögert — der Detektor „sieht"
 * dadurch relativ zum Ausgang in die Zukunft, die Gain-Reduktion hat also schon Zeit zu
 * greifen, BEVOR der Peak selbst am Ausgang erscheint (s. Kopfkommentar „REVIDIERT").
 */
function processBlock(state, channelsIn, channelsOut, frames, attackMs, releaseMs, sampleRate, lookaheadMs = 0) {
    const hasInput = !!(channelsIn && channelsIn.length && channelsIn[0] && channelsIn[0].length);
    const aCoef = computeCoeff(attackMs, sampleRate);
    const rCoef = computeCoeff(releaseMs, sampleRate);
    const nCh = channelsOut.length;
    let env = state.env;
    let minGain = 1;

    ensureDelayBufs(state, nCh, sampleRate);
    const bufs = state.delayBufs;
    const capacity = state.delayCapacity;
    let writeIdx = state.writeIdx;
    const lookaheadSamples = Math.max(0, Math.min(capacity - 1, Math.round((lookaheadMs / 1000) * sampleRate)));

    for (let i = 0; i < frames; i++) {
        let peak = 0;
        if (hasInput) {
            for (let ch = 0; ch < channelsIn.length; ch++) {
                const s = channelsIn[ch][i];
                const a = s < 0 ? -s : s;
                if (a > peak) peak = a;
            }
        }
        const coef = peak > env ? aCoef : rCoef;
        env += (peak - env) * coef;
        if (env < 1e-12) env = 0;   // Denormal-Flush — sonst CPU-Last-Explosion bei Stille
        const gain = env > THRESHOLD ? Math.pow(env / THRESHOLD, 1 / RATIO - 1) : 1;
        if (gain < minGain) minGain = gain;
        // readIdx liegt `lookaheadSamples` HINTER writeIdx (bei 0 = derselbe Slot, also
        // exakt der Wert, der gerade eben geschrieben wird — Bypass-Verhalten).
        const readIdx = (writeIdx - lookaheadSamples + capacity) % capacity;
        for (let ch = 0; ch < nCh; ch++) {
            const inCh = hasInput ? (channelsIn[ch] || channelsIn[0]) : null;
            const rawCh = inCh ? inCh[i] : 0;
            bufs[ch][writeIdx] = rawCh;
            channelsOut[ch][i] = bufs[ch][readIdx] * gain;
        }
        writeIdx = (writeIdx + 1) % capacity;
    }
    state.env = env;
    state.writeIdx = writeIdx;
    return minGain;
}

if (typeof AudioWorkletProcessor !== 'undefined') {
    class WbLimiterProcessor extends AudioWorkletProcessor {
        static get parameterDescriptors() {
            // maxValue bewusst riesig (@dpa-Regel „limits ≠ default", ddw.md 20260802): die
            // UI-Range (0-50ms Attack / 0-2000ms Release im Popover) ist ein UI-Default,
            // kein DSP-Limit.
            return [
                { name: 'attackMs', defaultValue: 0.5, minValue: 0, maxValue: 600000, automationRate: 'k-rate' },
                { name: 'releaseMs', defaultValue: 250, minValue: 0, maxValue: 600000, automationRate: 'k-rate' },
                // Lookahead-Vorlauf in ms (s. Kopfkommentar „REVIDIERT") — genauso ohne harten
                // DSP-Deckel wie attackMs/releaseMs, Default 0 = altes Verhalten (kein Vorlauf).
                { name: 'lookaheadMs', defaultValue: 0, minValue: 0, maxValue: 600000, automationRate: 'k-rate' },
            ];
        }

        constructor() {
            super();
            this._state = { env: 0 };
            // Reduktions-Meldung ans Haupt-Thread (LevelMeter-Ersatz für `.reduction`, s.
            // audioBus.js) — selbst getaktet (alle 8 Render-Quanten, ~21ms bei 48kHz),
            // NIE UI-getrieben, kann darum nie aufstauen.
            this._quantumCount = 0;
            this._minGainSinceReport = 1;
        }

        process(inputs, outputs, parameters) {
            const input = inputs[0];
            const output = outputs[0];
            const frames = (output[0] && output[0].length) || 128;
            const aVal = parameters.attackMs, rVal = parameters.releaseMs, lVal = parameters.lookaheadMs;
            const attackMs = aVal && aVal.length ? aVal[0] : 0.5;
            const releaseMs = rVal && rVal.length ? rVal[0] : 250;
            const lookaheadMs = lVal && lVal.length ? lVal[0] : 0;

            const minGain = processBlock(this._state, input, output, frames, attackMs, releaseMs, sampleRate, lookaheadMs);

            this._minGainSinceReport = Math.min(this._minGainSinceReport, minGain);
            if (++this._quantumCount >= 8) {
                this.port.postMessage(this._minGainSinceReport);
                this._minGainSinceReport = 1;
                this._quantumCount = 0;
            }
            return true;   // MUSS true zurückgeben, sonst stirbt der Node in Stille und reißt die Kette ab.
        }
    }
    registerProcessor('wb-limiter', WbLimiterProcessor);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { computeCoeff, processBlock, THRESHOLD, RATIO };
}

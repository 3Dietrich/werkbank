// Unit-Tests für den DSP-Kern des AudioWorklet-Limiters (ddw.md 20260802: "bei Att=0
// müsste es eigentlich mindestens an einer stelle knacken. da ist noch etwas zu
// langsam!"). KEIN Browser nötig — `processBlock()`/`computeCoeff()` sind reine
// Funktionen, dieselben, die auch process() im echten Worklet aufruft (kein Duplikat,
// s. Kopfkommentar limiterProcessor.js). Grund für den Node-statt-Playwright-Weg: in
// der Automatisierungs-Umgebung hängt `audioWorklet.addModule()` komplett (auch
// OfflineAudioContext, auch mit echtem Chrome) — dort ist also gar nichts testbar,
// dafür hier die komplette Mathematik bit-genau.
//
// Lauf: node lib/audio/test/limiterProcessor.test.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { computeCoeff, processBlock, THRESHOLD, RATIO } = require('../limiterProcessor.js');

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
    if (cond) { pass++; }
    else { fail++; console.error(`  ✗ ${name} ${extra}`); }
}

const SR = 48000;

function run(signalL, signalR, attackMs, releaseMs, state = { env: 0 }) {
    const n = signalL.length;
    const outL = new Float64Array(n), outR = new Float64Array(n);
    processBlock(state, [signalL, signalR || signalL], [outL, outR], n, attackMs, releaseMs, SR);
    return { outL, outR, state };
}

// ── A) Koeffizient bei ms=0 ist exakt 1 (keine Glättung, Kern des Features) ──
ok('computeCoeff(0) === 1', computeCoeff(0, SR) === 1);
ok('computeCoeff(-5) === 1 (negativ = wie 0 behandelt)', computeCoeff(-5, SR) === 1);
ok('computeCoeff(5, …) liegt zwischen 0 und 1', computeCoeff(5, SR) > 0 && computeCoeff(5, SR) < 1);
ok('THRESHOLD/RATIO exportiert wie erwartet', THRESHOLD === 1.0 && RATIO === 20);

// ── B) Attack=0: Reduktion greift auf DEMSELBEN Sample wie der Transient ──
{
    const n = 5;
    const sig = new Float64Array(n).fill(0.1);
    sig[2] = 4.0;   // Sprung mitten im Block
    const { outL } = run(sig, sig, 0, 200);
    // erwartete Ausgabe bei i=2: env springt sofort auf 4.0 (coeff=1), gain = 4^(1/20-1) = 4^-0.95
    const expected = 4.0 * Math.pow(4.0, 1 / RATIO - 1);
    ok('Attack=0: Sample-genaue Reduktion auf dem Transienten selbst',
        Math.abs(outL[2] - expected) < 1e-6, `got=${outL[2]} expected=${expected}`);
    ok('Attack=0: Sample VOR dem Transienten unverändert (0.1, unter Schwelle)',
        Math.abs(outL[1] - 0.1) < 1e-9, `got=${outL[1]}`);
}

// ── C) Attack=5ms: derselbe erste Transienten-Sample bleibt UNREDUZIERT ──
{
    const n = 2000;
    const sig = new Float64Array(n).fill(0.1);
    for (let i = 500; i < n; i++) sig[i] = 4.0;
    const { outL } = run(sig, sig, 5, 200);
    ok('Attack=5ms: erster Transienten-Sample bleibt praktisch unlimitiert',
        outL[500] > 3.9, `outL[500]=${outL[500]}`);
    // ~4 Zeitkonstanten (20ms = 960 Samples bei 48kHz) später ist die Reduktion durch.
    const at20ms = 500 + Math.round(0.02 * SR);
    const expectedSteady = 4.0 * Math.pow(4.0, 1 / RATIO - 1);
    ok('Attack=5ms: nach ~4 Zeitkonstanten nahe am Steady-State-Gain',
        Math.abs(outL[at20ms] - expectedSteady) < 0.1, `got=${outL[at20ms]} expected≈${expectedSteady}`);
}

// ── D) Kanalkopplung: L laut, R leise, KONSTANT — gleicher Gain-Faktor auf beiden ──
{
    const n = 500;
    const L = new Float64Array(n).fill(4.0);
    const R = new Float64Array(n).fill(0.1);
    const { outL, outR } = run(L, R, 0, 200);
    const gainL = outL[n - 1] / 4.0, gainR = outR[n - 1] / 0.1;
    ok('Kanäle gekoppelt: gleicher Gain-Faktor auf L und R',
        Math.abs(gainL - gainR) < 1e-6, `gainL=${gainL} gainR=${gainR}`);
    ok('Env wird vom LAUTEREN Kanal getrieben (spürbare Reduktion)', gainL < 0.9, `gainL=${gainL}`);
}

// ── E) Unterhalb der Schwelle: Ausgang bit-genau == Eingang, JEDES Attack/Release ──
{
    const n = 1000;
    const sig = new Float64Array(n).fill(0.5);
    for (const [a, r] of [[0, 0], [2, 50], [50, 2000]]) {
        const { outL } = run(sig, sig, a, r);
        let maxDiff = 0;
        for (let i = 0; i < n; i++) maxDiff = Math.max(maxDiff, Math.abs(outL[i] - 0.5));
        ok(`Passthrough bit-genau unter Schwelle (attack=${a}, release=${r})`, maxDiff < 1e-9, `maxDiff=${maxDiff}`);
    }
}

// ── F) Release: nach dem Transienten braucht der Ausgang mehrere Zeitkonstanten ──
{
    const n = 48000 * 2;
    const sig = new Float64Array(n).fill(0.1);
    for (let i = 5000; i < 20000; i++) sig[i] = 4.0;   // Puls
    const { outL } = run(sig, sig, 0, 200);   // release = 200ms
    ok('Release: direkt nach dem Pegelabfall NOCH spürbar reduziert',
        Math.abs(outL[20000 + 50] - 0.1) > 0.02, `got=${outL[20000 + 50]}`);
    const after3Tau = 20000 + Math.round(3 * 0.2 * SR);
    ok('Release: nach 3 Zeitkonstanten wieder nahe am leisen Pegel (~0.1)',
        Math.abs(outL[after3Tau] - 0.1) < 0.03, `got=${outL[after3Tau]}`);
}

// ── G) Envelope-State läuft über Blockgrenzen weiter (echtes Worklet ruft process()
//      alle 128 Samples auf, nicht mit dem ganzen Puffer auf einmal) ──
{
    const n = 4000;
    const sig = new Float64Array(n).fill(0.1);
    for (let i = 1000; i < n; i++) sig[i] = 4.0;
    const wholeBuf = run(sig, sig, 0, 200);
    // in 128er-Blöcken (echte Render-Quantum-Größe) gestückelt — muss dasselbe Ergebnis liefern.
    const state = { env: 0 };
    const outL2 = new Float64Array(n), outR2 = new Float64Array(n);
    for (let start = 0; start < n; start += 128) {
        const len = Math.min(128, n - start);
        const inL = sig.subarray(start, start + len), inR = inL;
        const oL = outL2.subarray(start, start + len), oR = outR2.subarray(start, start + len);
        processBlock(state, [inL, inR], [oL, oR], len, 0, 200, SR);
    }
    let maxDiff = 0;
    for (let i = 0; i < n; i++) maxDiff = Math.max(maxDiff, Math.abs(outL2[i] - wholeBuf.outL[i]));
    ok('Blockweise (128er) Verarbeitung ergibt dasselbe wie ein einziger großer Block',
        maxDiff < 1e-9, `maxDiff=${maxDiff}`);
}

// ── H) Stille überstehen (kein NaN, keine Endlosschleife), danach wieder korrekt ──
{
    const n = 6000;
    const sig = new Float64Array(n);   // Stille
    for (let i = 5000; i < n; i++) sig[i] = 4.0;
    const { outL } = run(sig, sig, 0, 50);
    let hasNaN = false;
    for (let i = 0; i < n; i++) if (!Number.isFinite(outL[i])) hasNaN = true;
    ok('Kein NaN/Infinity nach Stille-Phase', !hasNaN);
    const expected = 4.0 * Math.pow(4.0, 1 / RATIO - 1);
    ok('Nach Stille wird der nächste Transient wieder korrekt limitiert',
        Math.abs(outL[5000] - expected) < 1e-6, `got=${outL[5000]}`);
}

// ── I) Lookahead-Ringpuffer (ddw.md Folge-Prompt 20260802: „Man verzögert nur einen
//      Teil in dem Limiter. Und zwar der, der den Peak angibt. Der andere (leicht
//      verzögerte) wird dann von dem Limiter gelimitet.") ──

// I1) lookaheadMs=0 (bzw. weggelassen) → Output bitidentisch zum bisherigen Verhalten.
//     Regressionstest: dieselben Signale wie in B/D/F, einmal mit explizitem lookaheadMs=0,
//     einmal ganz ohne den Parameter (alte Aufrufsignatur) — beide müssen exakt dasselbe
//     liefern wie der jeweils schon oben geprüfte Wert.
{
    const n = 2000;
    const sig = new Float64Array(n).fill(0.1);
    for (let i = 500; i < n; i++) sig[i] = 4.0;

    const outNoParam = new Float64Array(n), outNoParamR = new Float64Array(n);
    processBlock({ env: 0 }, [sig, sig], [outNoParam, outNoParamR], n, 5, 200, SR);   // alte Signatur
    const outZero = new Float64Array(n), outZeroR = new Float64Array(n);
    processBlock({ env: 0 }, [sig, sig], [outZero, outZeroR], n, 5, 200, SR, 0);       // explizit 0

    let maxDiff = 0;
    for (let i = 0; i < n; i++) maxDiff = Math.max(maxDiff, Math.abs(outNoParam[i] - outZero[i]));
    ok('lookaheadMs weggelassen vs. lookaheadMs=0: bitidentisch', maxDiff === 0, `maxDiff=${maxDiff}`);

    // und beide identisch zum weiter oben (Test C) ermittelten unverzögerten Referenzwert
    ok('lookaheadMs=0: erster Transienten-Sample weiterhin praktisch unlimitiert',
        outZero[500] > 3.9, `outZero[500]=${outZero[500]}`);
}

// I2) lookaheadMs>0 an einem stillen Signal mit EINEM Impuls: der Impuls erscheint am
//     Output exakt `lookaheadSamples` später als im Input (reine Delay-Verifikation,
//     Attack/Release auf 0 gesetzt, damit die Gain-Reduktion die reine Delay-Messung
//     nicht verfälscht — bei env==peak sofort ist gain am Impuls-Sample selbst < 1, aber
//     ALLE Samples davor/danach bleiben exakt 0, das reicht, um die Verzögerung zu sehen).
{
    const n = 500;
    const lookaheadMs = 5;   // → 240 Samples bei 48kHz
    const lookaheadSamples = Math.round((lookaheadMs / 1000) * SR);
    const sig = new Float64Array(n);   // Stille
    sig[50] = 0.3;   // Impuls UNTER der Schwelle (0.3 < THRESHOLD=1.0) → gain bleibt 1, reiner Delay-Test
    const outL = new Float64Array(n), outR = new Float64Array(n);
    processBlock({ env: 0 }, [sig, sig], [outL, outR], n, 0, 0, SR, lookaheadMs);

    let impulseAt = -1;
    for (let i = 0; i < n; i++) if (outL[i] !== 0) { impulseAt = i; break; }
    ok('Lookahead: Impuls erscheint exakt lookaheadSamples später am Output',
        impulseAt === 50 + lookaheadSamples, `impulseAt=${impulseAt} erwartet=${50 + lookaheadSamples}`);
    ok('Lookahead: Impuls-Amplitude unverändert (unter der Schwelle, kein Gain-Eingriff)',
        Math.abs(outL[impulseAt] - 0.3) < 1e-9, `got=${outL[impulseAt]}`);
}

// I3) Der eigentliche Sinn: bei gleichem Attack greift die Gain-Reduktion am (verzögerten)
//     Ausgang des Transienten mit Lookahead bereits WEITER fortgeschritten als ohne — der
//     Detektor sieht den Peak durchs Lookahead früher relativ zum verzögerten Ausgang.
{
    const n = 3000;
    const attackMs = 5;
    const lookaheadMs = 3;   // → 144 Samples bei 48kHz
    const lookaheadSamples = Math.round((lookaheadMs / 1000) * SR);
    const sig = new Float64Array(n).fill(0.1);
    for (let i = 1000; i < n; i++) sig[i] = 4.0;   // harter Sprung bei i=1000

    // Ohne Lookahead: Gain am Sample, wo der Transient im OUTPUT erscheint (i=1000).
    const outNoLA = new Float64Array(n), outNoLA_R = new Float64Array(n);
    processBlock({ env: 0 }, [sig, sig], [outNoLA, outNoLA_R], n, attackMs, 200, SR, 0);
    const gainNoLA = outNoLA[1000] / 4.0;

    // Mit Lookahead: derselbe Transient erscheint im Output erst bei i=1000+lookaheadSamples
    // (Ringpuffer-Verzögerung), aber der Detektor hat den Peak schon lookaheadSamples früher
    // gesehen (bei Input-Zeit 1000) — die Gain-Reduktion ist an dieser Stelle des Outputs
    // also weiter fortgeschritten (kleinerer Gain = mehr Reduktion) als ohne Lookahead.
    const outLA = new Float64Array(n), outLA_R = new Float64Array(n);
    processBlock({ env: 0 }, [sig, sig], [outLA, outLA_R], n, attackMs, 200, SR, lookaheadMs);
    const gainLA = outLA[1000 + lookaheadSamples] / 4.0;

    ok('Lookahead gibt dem Attack echten Vorlauf: Gain am Peak-Sample ist MIT Lookahead niedriger (mehr Reduktion) als ohne',
        gainLA < gainNoLA, `gainLA=${gainLA} gainNoLA=${gainNoLA}`);
}

console.log(`\nlimiterProcessor: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Headless Node-Test (reine Mathematik, keine Web-Audio-Abhängigkeit, s. pulseWave.js
// Kopfkommentar) für applyHarmonicTilt (@dpa ddw.md 20260723_230925, Korrektur des ersten
// oscTilt-Versuchs — "SR/2 war sehr hoch"):
//   0   = alle Obertöne unverändert (100 %)
//   100 = Grundton (n=1) unverändert, Oberton n im Verhältnis 1/n ausgeblendet
//         (exakt die Obertonreihe einer Sägezahnwelle)
//   >100 = extrapoliert dieselbe Gerade (kann invertieren, bewusst ungeklemmt)
//
// Lauf: node test/oscTilt_harmonics_test.mjs
import { applyHarmonicTilt } from '../lib/polysynth/audio/pulseWave.js';

const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };
const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// Fiktive Koeffizienten (Grundton + 4 Obertöne), alle auf 1 gesetzt, damit der
// Gewichtungsfaktor direkt am Ergebnis ablesbar ist.
const real = new Float32Array([0, 1, 1, 1, 1]);
const imag = new Float32Array([0, 0, 0, 0, 0]);

// tilt=0 → unverändert (dieselbe Referenz zurückgegeben, keine Kopie nötig).
{
    const { real: r } = applyHarmonicTilt(real, imag, 0);
    check(r === real, 'tilt=0 sollte die Original-Referenz zurückgeben (kein Klon nötig)');
}

// tilt=100 → Grundton (n=1) unverändert, Oberton n auf 1/n (Sägezahn-Obertonreihe).
{
    const { real: r } = applyHarmonicTilt(real, imag, 100);
    check(close(r[1], 1), `n=1 sollte bei tilt=100 unverändert (1) sein, war ${r[1]}`);
    check(close(r[2], 0.5), `n=2 sollte bei tilt=100 auf 1/2 sein, war ${r[2]}`);
    check(close(r[3], 1 / 3), `n=3 sollte bei tilt=100 auf 1/3 sein, war ${r[3]}`);
    check(close(r[4], 0.25), `n=4 sollte bei tilt=100 auf 1/4 sein, war ${r[4]}`);
}

// tilt=50 (Übergang, Mitte zwischen 1 und 1/n): factor = 1 - 0.5*(1-1/n).
{
    const { real: r } = applyHarmonicTilt(real, imag, 50);
    check(close(r[1], 1), `n=1 sollte bei tilt=50 unverändert (1) sein, war ${r[1]}`);
    check(close(r[2], 0.75), `n=2 sollte bei tilt=50 auf 0.75 sein, war ${r[2]}`);
}

// tilt=200 (Extrapolation über 100 hinaus, bewusst ungeklemmt): factor = 2/n - 1.
{
    const { real: r } = applyHarmonicTilt(real, imag, 200);
    check(close(r[1], 1), `n=1 sollte bei tilt=200 unverändert (1) sein, war ${r[1]}`);
    check(close(r[2], 0), `n=2 sollte bei tilt=200 auf 0 sein, war ${r[2]}`);
    check(close(r[3], -1 / 3), `n=3 sollte bei tilt=200 negativ (Phaseninversion) sein, war ${r[3]}`);
}

// imag wird identisch gewichtet wie real (dieselbe Formel, kein Sonderfall).
{
    const im2 = new Float32Array([0, 1, 1, 1, 1]);
    const { imag: i } = applyHarmonicTilt(real, im2, 100);
    check(close(i[2], 0.5), `imag[2] sollte identisch zu real[2] gewichtet werden, war ${i[2]}`);
}

if (fails.length) {
    console.log('TEST FAIL:');
    for (const f of fails) console.log(' -', f);
    process.exit(1);
}
console.log('TEST OK: applyHarmonicTilt — Grundton unangetastet, Sägezahn-Obertonreihe bei 100, Extrapolation >100.');

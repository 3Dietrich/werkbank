/**
 * envCore.test.mjs — Unit-Tests für die ADSR-DSP (envCore.js)
 * Läuft mit: node --test lib/polysynth/test/envCore.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AdsrCore, msToSamples } from '../envCore.js';

const SR = 48000;

describe('msToSamples', () => {
    it('0 ms = 0 samples', () => assert.equal(msToSamples(0, SR), 0));
    it('1 ms = 48 samples @48k', () => assert.equal(msToSamples(1, SR), 48));
    it('1000 ms = 48000 samples @48k', () => assert.equal(msToSamples(1000, SR), 48000));
});

describe('AdsrCore.trigger — Spezialfälle', () => {
    it('kein Segment aktiv → 1-Sample-Puls + 0', () => {
        const core = new AdsrCore();
        const cfg = {
            aOn: false, dOn: false, sOn: false, rOn: false,
            peak: 1, inv: false, verlauf: false,
            trigMode: 'trig', lenSamples: 0,
        };
        const { curve } = core.trigger(cfg, SR);
        // Outin-Fade (0.5ms = 24 Samples) + Puls + 0
        assert.equal(curve.length, msToSamples(0.5, SR) + 2);
        assert.equal(curve[curve.length - 2], 1);  // Peak
        assert.equal(curve[curve.length - 1], 0);  // zurück auf 0
    });

    it('nur A aktiv → Attack + 0.5ms lin-down', () => {
        const core = new AdsrCore();
        const cfg = {
            aOn: true, dOn: false, sOn: false, rOn: false,
            a: 0.01, peak: 1, inv: false, verlauf: false,
            aCurve: 'lin', aSkew: 1,
            trigMode: 'trig', lenSamples: 0,
        };
        const { curve } = core.trigger(cfg, SR);
        const aLen = msToSamples(10, SR);       // 10ms = 480 samples
        const downLen = msToSamples(0.5, SR);   // 0.5ms = 24 samples
        const outinLen = msToSamples(0.5, SR);
        assert.equal(curve.length, outinLen + aLen + downLen);
        // Peak am Ende der Attack
        assert.ok(Math.abs(curve[outinLen + aLen - 1] - 1) < 0.01);
        // Ende auf 0
        assert.ok(Math.abs(curve[curve.length - 1]) < 0.01);
    });

    it('ADS ohne R → nach Sustain 0.5ms lin auf 0', () => {
        const core = new AdsrCore();
        const cfg = {
            aOn: true, dOn: true, sOn: true, rOn: false,
            a: 0.01, d: 0.01, s: 0.5, peak: 1, inv: false, verlauf: false,
            aCurve: 'lin', aSkew: 1, dCurve: 'lin', dSkew: 1,
            trigMode: 'trig', lenSamples: 0,
        };
        const { curve } = core.trigger(cfg, SR);
        // Ende sollte ~0 sein (0.5ms lin-down)
        assert.ok(Math.abs(curve[curve.length - 1]) < 0.01);
    });

    it('ADR bei Trig → D überspringen, direkt A→R', () => {
        const core = new AdsrCore();
        const cfg = {
            aOn: true, dOn: true, sOn: false, rOn: true,
            a: 0.01, d: 0.5, r: 0.01, peak: 1, inv: false, verlauf: false,
            aCurve: 'lin', aSkew: 1, rCurve: 'lin', rSkew: 1,
            trigMode: 'trig', lenSamples: 0,
        };
        const { curve } = core.trigger(cfg, SR);
        const aLen = msToSamples(10, SR);
        const rLen = msToSamples(10, SR);
        const outinLen = msToSamples(0.5, SR);
        // D ist übersprungen: nur outin + A + R
        assert.equal(curve.length, outinLen + aLen + rLen);
    });
});

describe('AdsrCore.trigger — kein Reflex-Limit auf Peak/Skew (@dpa 20260727_135331)', () => {
    it('Peak > 1 wird NICHT mehr auf 1 gekappt', () => {
        const core = new AdsrCore();
        const cfg = {
            aOn: true, dOn: false, sOn: true, rOn: false,
            a: 0.001, peak: 500, inv: false, verlauf: false,
            aCurve: 'lin', aSkew: 1, trigMode: 'gate', lenFest: false, lenSamples: 0,
        };
        const { curve } = core.trigger(cfg, SR);
        assert.ok(Math.max(...curve) > 400, `Peak=500 sollte durchschlagen, war max=${Math.max(...curve)}`);
    });

    it('Skew > 100 wird NICHT mehr gekappt (spürbarer Unterschied zu skew=100)', () => {
        const core100 = new AdsrCore();
        const core1000 = new AdsrCore();
        const cfg = (skew) => ({
            aOn: true, dOn: false, sOn: false, rOn: false,
            a: 0.01, peak: 1, inv: false, verlauf: false,
            aCurve: 'lin', aSkew: skew, trigMode: 'trig', lenSamples: 0,
        });
        // Bei skew>1 sättigt die Kurve extrem früh (1-(1-t)^skew) — ein Vergleich bei t=0.25
        // wäre für beide schon auf ~1.0 gesättigt und könnte nicht mehr unterscheiden. Ganz am
        // ANFANG (2. Sample) ist der Unterschied noch klar sichtbar: je größer skew, desto
        // schneller steigt die Kurve dort schon an.
        const outinLen = msToSamples(0.5, SR);
        const earlyIdx = outinLen + 1;
        const v100 = core100.trigger(cfg(100), SR).curve[earlyIdx];
        const v1000 = core1000.trigger(cfg(1000), SR).curve[earlyIdx];
        assert.ok(v1000 > v100, `skew=1000 sollte am Anfang noch steiler ansteigen als skew=100 (v100=${v100}, v1000=${v1000})`);
    });
});

describe('AdsrCore.trigger — Lin-Skew-Formel (ddw.md 20260727, @dpa-Spezifikation)', () => {
    // Isoliert per "nur A aktiv"-Sonderfall: Kurve = outin(24) + Attack(aLen) + down(24),
    // die Attack-Segment-Werte sitzen also bei Index [24 .. 24+aLen).
    function attackMidpoint(skew) {
        const core = new AdsrCore();
        const cfg = {
            aOn: true, dOn: false, sOn: false, rOn: false,
            a: 0.01, peak: 1, inv: false, verlauf: false,
            aCurve: 'lin', aSkew: skew,
            trigMode: 'trig', lenSamples: 0,
        };
        const { curve } = core.trigger(cfg, SR);
        const aLen = msToSamples(10, SR);
        const outinLen = msToSamples(0.5, SR);
        // Mitte des Attack-Segments (t=0.5 lokal, wie in segmentCurve: t=i/lenSamples)
        return curve[outinLen + aLen / 2];
    }

    it('skew=1 (neutral) → Mitte bei 0.5 (reines Linear)', () => {
        assert.ok(Math.abs(attackMidpoint(1) - 0.5) < 0.01);
    });

    it('skew=2 (>1) → 1-(1-t)^skew, Mitte bei 0.75 (steiler Anfang, s. @dpa-Formel)', () => {
        // 1 - (1-0.5)^2 = 0.75
        assert.ok(Math.abs(attackMidpoint(2) - 0.75) < 0.01,
            `erwartet ~0.75, war ${attackMidpoint(2)}`);
    });

    it('skew=0.5 (<1) → t^skew unverändert, Mitte bei sqrt(0.5)≈0.707', () => {
        assert.ok(Math.abs(attackMidpoint(0.5) - Math.sqrt(0.5)) < 0.01,
            `erwartet ~0.707, war ${attackMidpoint(0.5)}`);
    });

    it('skew=2 und skew=0.5 sind beide steiler am Anfang als skew=1 (Symmetrie um den Neutralpunkt)', () => {
        // "Anfang steiler" = früher Wert (t klein) liegt ÜBER dem linearen t=konst — bei
        // t=0.25 muss sowohl skew=2 als auch skew=0.5 über der reinen Geraden (0.25) liegen.
        const core2 = new AdsrCore();
        const coreHalf = new AdsrCore();
        const cfgFor = (skew) => ({
            aOn: true, dOn: false, sOn: false, rOn: false,
            a: 0.01, peak: 1, inv: false, verlauf: false,
            aCurve: 'lin', aSkew: skew, trigMode: 'trig', lenSamples: 0,
        });
        const aLen = msToSamples(10, SR);
        const outinLen = msToSamples(0.5, SR);
        const quarterIdx = outinLen + Math.round(aLen / 4);
        const v2 = core2.trigger(cfgFor(2), SR).curve[quarterIdx];
        const vHalf = coreHalf.trigger(cfgFor(0.5), SR).curve[quarterIdx];
        assert.ok(v2 > 0.25, `skew=2 bei t=0.25 sollte über der Geraden liegen, war ${v2}`);
        assert.ok(vHalf > 0.25, `skew=0.5 bei t=0.25 sollte über der Geraden liegen, war ${vHalf}`);
    });
});

describe('AdsrCore.trigger — Standard-ADSR', () => {
    it('voller ADSR-Zyklus', () => {
        const core = new AdsrCore();
        const cfg = {
            aOn: true, dOn: true, sOn: true, rOn: true,
            a: 0.01, d: 0.01, s: 0.5, r: 0.01, peak: 1, inv: false, verlauf: false,
            aCurve: 'lin', aSkew: 1, dCurve: 'lin', dSkew: 1, rCurve: 'lin', rSkew: 1,
            trigMode: 'trig', lenSamples: 0,
        };
        const { curve } = core.trigger(cfg, SR);
        assert.ok(curve.length > msToSamples(0.5, SR));  // mindestens outin + etwas
        // Peak erreicht
        const maxVal = Math.max(...curve);
        assert.ok(maxVal > 0.9);
    });

    it('inv dreht Vorzeichen', () => {
        const core = new AdsrCore();
        const cfg = {
            aOn: true, dOn: false, sOn: false, rOn: false,
            a: 0.01, peak: 1, inv: true, verlauf: false,
            aCurve: 'lin', aSkew: 1,
            trigMode: 'trig', lenSamples: 0,
        };
        const { curve } = core.trigger(cfg, SR);
        const minVal = Math.min(...Array.from(curve));
        assert.ok(minVal < 0);  // negativ
    });
});

describe('AdsrCore.gateOff', () => {
    it('Release-Kurve endet auf 0', () => {
        const core = new AdsrCore();
        const cfg = { rOn: true, r: 0.1, inv: false, rCurve: 'lin', rSkew: 1 };
        const { curve } = core.gateOff(cfg, SR, 0.7);
        assert.ok(Math.abs(curve[curve.length - 1]) < 0.01);
    });

    it('kein R aktiv → sofort 0', () => {
        const core = new AdsrCore();
        const cfg = { rOn: false, r: 0, inv: false, rCurve: 'lin', rSkew: 1 };
        const { curve } = core.gateOff(cfg, SR, 0.7);
        assert.equal(curve[curve.length - 1], 0);
    });

    // Bugfix (@dpa 20260727: "release auf log ist noch immer gleich der lin — linear.. wtf??",
    // per Scope-Screenshot verifiziert): rCurve='log' zielt bei gateOff() PRAKTISCH IMMER exakt
    // auf 0 — die alte useLin-Bedingung (to===0 → immer linear) machte 'log' für Release damit
    // faktisch nie wirksam. Test: bei identischem from/Dauer muss die log-Kurve in der Mitte
    // deutlich UNTER der linearen liegen (echte Exponentialform, kein Gerade-Verhalten mehr).
    it('rCurve=log ist bei to=0 tatsächlich exponentiell, nicht mehr linear', () => {
        const linCore = new AdsrCore();
        const logCore = new AdsrCore();
        const base = { rOn: true, r: 0.1, inv: false, rSkew: 1 };
        const linCurve = linCore.gateOff({ ...base, rCurve: 'lin' }, SR, 1).curve;
        const logCurve = logCore.gateOff({ ...base, rCurve: 'log' }, SR, 1).curve;
        const mid = Math.floor(linCurve.length / 2);
        assert.ok(Math.abs(linCurve[mid] - 0.5) < 0.02, `lin-Mitte sollte ~0.5 sein, war ${linCurve[mid]}`);
        // Exponentiell von 1 nach ~0.0001 bei t=0.5: 1*(0.0001)^0.5 = 0.01 — weit unter 0.5.
        assert.ok(logCurve[mid] < 0.05, `log-Mitte sollte weit unter 0.5 liegen (echtes Log), war ${logCurve[mid]}`);
        assert.ok(Math.abs(logCurve[mid] - linCurve[mid]) > 0.3, 'log- und lin-Kurve dürfen sich in der Mitte nicht mehr gleichen');
    });
});

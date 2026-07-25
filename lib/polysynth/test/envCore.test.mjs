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
});

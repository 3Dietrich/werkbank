/**
 * triggerSync.test.mjs — Unit-Tests für die reine Trigger-Mathematik (triggerSync.js).
 * Läuft mit: node --test lib/scope/test/triggerSync.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chooseTriggerWindow, extractRingWindow, extractFrameWindow } from '../triggerSync.js';

describe('chooseTriggerWindow', () => {
    it('kein Beat vorhanden → null', () => {
        assert.equal(chooseTriggerWindow([], 10, 1, 0.5), null);
    });

    it('Beat zu jung (Fenster reicht in die Zukunft) → null', () => {
        // Beat bei t=9.6, Fenster 1s breit mittig (0.5) → winEnd=10.1 > nowTime=10
        assert.equal(chooseTriggerWindow([9.6], 10, 1, 0.5), null);
    });

    it('genau passender Beat → Fenster korrekt berechnet (offsetFrac=0.5)', () => {
        const r = chooseTriggerWindow([9.5], 10, 1, 0.5);
        assert.ok(r);
        assert.equal(r.beatTime, 9.5);
        assert.equal(r.winStart, 9);
        assert.equal(r.winEnd, 10);
    });

    it('offsetFrac=0 → Fenster beginnt am Beat', () => {
        const r = chooseTriggerWindow([9], 10, 1, 0);
        assert.equal(r.winStart, 9);
        assert.equal(r.winEnd, 10);
    });

    it('offsetFrac=1 → Fenster endet am Beat', () => {
        const r = chooseTriggerWindow([9], 9, 1, 1);
        assert.equal(r.winStart, 8);
        assert.equal(r.winEnd, 9);
    });

    it('mehrere Beats → jüngster passender wird gewählt', () => {
        const r = chooseTriggerWindow([5, 8, 9.5], 10, 1, 0.5);
        assert.equal(r.beatTime, 9.5);
    });

    it('syncOffset verschiebt den Referenz-Beat (negativ = früher)', () => {
        // Beat eigentlich bei 9.5, syncOffset -0.2 → effektiv 9.3, Fenster [8.8, 9.8]
        const r = chooseTriggerWindow([9.5], 10, 1, 0.5, -0.2);
        assert.equal(r.beatTime, 9.3);
        assert.ok(Math.abs(r.winStart - 8.8) < 1e-9);
        assert.ok(Math.abs(r.winEnd - 9.8) < 1e-9);
    });

    it('syncOffset positiv = später, kann Fenster wieder in die Zukunft schieben → null', () => {
        assert.equal(chooseTriggerWindow([9.5], 10, 1, 0.5, 0.6), null);
    });
});

describe('extractRingWindow', () => {
    const sampleRate = 10;   // 10 Samples/Sekunde, einfache Zahlen
    function makeRing(values, capacity, anchorTime = 0) {
        const samples = new Float32Array(capacity);
        let totalWritten = 0;
        for (const v of values) { samples[totalWritten % capacity] = v; totalWritten++; }
        return { samples, capacity, totalWritten, sampleRate, anchorTime };
    }

    it('extrahiert das erwartete Fenster bit-genau', () => {
        const ring = makeRing([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 20);
        // winStart=0.2s → idx 2, winEnd=0.5s → idx 5
        const out = extractRingWindow(ring, 0.2, 0.5);
        assert.deepEqual(Array.from(out), [2, 3, 4]);
    });

    it('Fenster (teilweise) in der Zukunft → null', () => {
        const ring = makeRing([0, 1, 2, 3, 4], 20);
        assert.equal(extractRingWindow(ring, 0.3, 0.8), null);
    });

    it('Fenster schon überschrieben (außerhalb Kapazität) → null', () => {
        const ring = makeRing(Array.from({ length: 30 }, (_, i) => i), 10);   // capacity=10, 30 geschrieben
        // die ersten 20 Samples (idx 0..19) sind längst überschrieben
        assert.equal(extractRingWindow(ring, 0, 0.5), null);
    });

    it('Ringpuffer-Wraparound liefert die richtigen (neueren) Werte', () => {
        const ring = makeRing(Array.from({ length: 15 }, (_, i) => i), 10);   // capacity=10 → 5..14 noch da
        const out = extractRingWindow(ring, 0.6, 0.9);   // idx 6..8 → Werte 6,7,8
        assert.deepEqual(Array.from(out), [6, 7, 8]);
    });
});

describe('extractFrameWindow', () => {
    const buf = [{ t: 1, v: 10 }, { t: 2, v: 20 }, { t: 3, v: 30 }, { t: 4, v: 40 }];

    it('filtert korrekt nach Zeitbereich (inklusive Grenzen)', () => {
        const out = extractFrameWindow(buf, 2, 3);
        assert.deepEqual(out, [{ t: 2, v: 20 }, { t: 3, v: 30 }]);
    });

    it('kein Punkt im Fenster → null', () => {
        assert.equal(extractFrameWindow(buf, 10, 20), null);
    });
});

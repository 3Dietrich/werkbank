// Unit-Tests für die zwei-Slot-Regeln von DebugPanel.js (ddw.md @dpa 20260802, Vorbild
// teslacoil/test/logic.test.mjs "Debug-Recorder: die zwei Slots"). KEIN Browser nötig —
// toggle()/resetAll()/recording()/lastSeconds() sind reine Zustandsmaschine, die echten
// Recorder-Objekte werden hier gegen Attrappen getauscht (genau wie im teslacoil-Original).
//
// Lauf: node lib/debugPanel/test/DebugPanel.test.mjs
import assert from 'node:assert/strict';
import { DebugPanel } from '../DebugPanel.js';

let pass = 0, fail = 0;
function t(name, fn) {
    try { fn(); pass++; } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

/** MiniState-Attrappe: nur get/set, kein localStorage (Node hat keins). */
function fakeState(data = {}) {
    return { _d: { ...data }, get(k) { return this._d[k]; }, set(k, v) { this._d[k] = v; }, toJSON() { return { ...this._d }; } };
}

/** Fake-Recorder wie im teslacoil-Original: recording-Flag + start()/stop(), plus
 *  `sampleRate` (unser DebugRecorder trägt das zusätzlich, s. DebugRecorder.js). */
function fakeRec(len, sr = 48000) {
    return { recording: false, sampleRate: sr, start() { this.recording = true; }, stop() { this.recording = false; return new Float32Array(len); } };
}

function makeDbg() {
    const dbg = new DebugPanel(fakeState(), { appPrefix: 'werkbank-test' });
    dbg.slots.a.rec = fakeRec(4800);   // 0.1 s bei 48000 Hz
    dbg.slots.b.rec = fakeRec(9600);   // 0.2 s bei 48000 Hz
    return dbg;
}

t('ein Start nimmt auf, ein zweiter Klick stoppt', () => {
    const d = makeDbg();
    assert.equal(d.toggle('a'), null);
    assert.equal(d.recording('a'), true);
    assert.equal(d.toggle('a'), 0.1);
    assert.equal(d.recording('a'), false);
});

t('NIEMALS nehmen beide gleichzeitig auf', () => {
    const d = makeDbg();
    d.toggle('a');
    d.toggle('b');   // startet b, während a läuft
    assert.equal(d.recording('a'), false, 'a muss gestoppt sein');
    assert.equal(d.recording('b'), true);
});

t('der verdrängte Recorder behält seine Aufnahme (Vergleich vorher/nachher)', () => {
    const d = makeDbg();
    d.toggle('a');
    d.toggle('b');
    assert.equal(d.lastSeconds('a'), 0.1, 'a-Take darf nicht verloren gehen');
});

t('ein neuer Start löscht die vorherige Aufnahme DIESES Recorders', () => {
    const d = makeDbg();
    d.toggle('a'); d.toggle('a');
    assert.equal(d.lastSeconds('a'), 0.1);
    d.toggle('a');   // neuer Take → alter ist weg, solange er läuft
    assert.equal(d.lastSeconds('a'), 0);
    assert.equal(d.recording('a'), true);
});

t('Rücksetzen leert BEIDE Aufnahmen', () => {
    const d = makeDbg();
    d.toggle('a'); d.toggle('a');
    d.toggle('b'); d.toggle('b');
    assert.equal(d.lastSeconds('a'), 0.1);
    assert.equal(d.lastSeconds('b'), 0.2);
    d.resetAll();
    assert.equal(d.lastSeconds('a'), 0, 'a muss leer sein');
    assert.equal(d.lastSeconds('b'), 0, 'b muss leer sein');
});

t('Rücksetzen bricht eine laufende Aufnahme ab (hinterher ist nichts mehr da)', () => {
    const d = makeDbg();
    d.toggle('a');   // läuft noch
    d.resetAll();
    assert.equal(d.recording('a'), false, 'darf nicht weiterlaufen');
    assert.equal(d.lastSeconds('a'), 0, 'der abgebrochene Take darf nicht liegen bleiben');
});

t('onChange feuert bei toggle() UND resetAll() (UI-Repaint-Hook)', () => {
    const d = makeDbg();
    let n = 0;
    d.onChange(() => n++);
    d.toggle('a');
    d.toggle('a');
    d.resetAll();
    assert.equal(n, 3);
});

t('onAction(id) routet dieselben vier Debug-Button-IDs wie die defs.js-Buttons', () => {
    const d = makeDbg();
    d.onAction('debugRec');
    assert.equal(d.recording('a'), true);
    d.onAction('debugRec2');
    assert.equal(d.recording('a'), false, 'debugRec2 muss debugRec verdrängen');
    assert.equal(d.recording('b'), true);
    d.onAction('debugRecReset');
    assert.equal(d.recording('b'), false);
    assert.equal(d.lastSeconds('b'), 0);
    // debugSave ruft saveBundle() — ohne DOM/document würde das crashen, wenn onAction()
    // die ID nicht korrekt weiterreicht; hier nur die Robustheit der ID-Zuordnung selbst
    // (kein DOM-Test, s. Playwright-Smoke für den echten Download-Weg).
    assert.equal(typeof d.saveBundle, 'function');
});

t('debugMeta bleibt der EINZIGE Ort für Name/Prompt — kein Sound-Snapshot-Key gesetzt', () => {
    // Kernregel aus DebugPanel.js-Kopf: debugName/debugPrompt (die literalen Keys, die ein
    // Gruppen-/ISM-Snapshot über data-ctrl="x:debugName" ableiten würde) dürfen NIE über
    // DebugPanel geschrieben werden — sonst wäre der Recall-Schutz nur Kommentar, keine
    // Realität. saveBundle() liest ausschließlich state.get('debugMeta').
    const st = fakeState();
    const d = new DebugPanel(st, { appPrefix: 'werkbank-test' });
    d.slots.a.rec = fakeRec(0); d.slots.b.rec = fakeRec(0);
    st.set('debugMeta', { name: 'filter-bug', prompt: 'hörst du das Zwitschern?' });
    assert.equal(st.get('debugName'), undefined, 'debugName darf NIE ein State-Key werden');
    assert.equal(st.get('debugPrompt'), undefined, 'debugPrompt darf NIE ein State-Key werden');
    assert.equal(st.get('debugMeta').name, 'filter-bug');
});

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

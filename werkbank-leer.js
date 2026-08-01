/**
 * werkbank-leer.js – baut werkbank-leer.html auf: der ZWEITE, schlankere Pool-Einstieg
 * neben werkbank.js/index.html (@dpa 20260801, mit @dpa vorab durchgeplant).
 *
 * Bewusst ein NEUTRALES leeres Basis-Scaffold: nur die vier "immer dabei"-ISMs
 * (Takt/Metronom, Rec, LevelMeter, Signal-Scopes) + ALLE Header-Funktionen (Tasten/MIDI,
 * Hints, ⚙ Config, ⭐ Ensemble, ⧉ Struktur, Rec-Format, 🔇 Audio-Reset) — KEIN Poly-Synth,
 * KEIN Stepsequenzer. Aus dieser leeren Werkbank heraus kopiert @dpa künftig neue
 * Projekt-HTMLs, sobald ein neues Kernmodul ansteht — der Name "leer" beschreibt genau
 * diesen Bau-Schritt, nicht ein zukünftiges Thema.
 *
 * Die meisten Blöcke sind 1:1 aus werkbank.js abgeleitet (dort ausführlich kommentiert,
 * warum etwas so ist) — Kommentare hier beschränken sich auf das, was sich GEGENÜBER dem
 * Vorbild ändert (weniger ISMs → Header-Funktionen müssen entkoppelt alle VIER hier
 * vorhandenen ISMs bedienen, nicht nur die zwei aus dem Original-Beispiel).
 *
 * State teilt sich ABSICHTLICH mit index.html/werkbank.js: dieselben localStorage-Keys
 * (werkbank_state/werkbank_taktmetro/werkbank_rec/werkbank_levelmeter/werkbank_master/
 * werkbank_scope/werkbank_ensemble) — beide Einstiege zeigen denselben Zustand.
 * index.html/werkbank.js selbst bleiben UNANGETASTET.
 */
import { MiniState } from './lib/MiniState.js';
import { mountInstrumentSettings } from './lib/InstrumentSettings.js';
import { HintBubble } from './lib/HintBubble.js';
import { createMasterVolume, masterVolumeDefaults } from './lib/MasterVolume.js';
import { factoryHint } from './lib/hints.js';
import { hint, setLang, lang as curLang, onLangChange } from './lib/i18n.js';
import { MiniSettings } from './lib/MiniSettings.js';
import { wireGlobalLook } from './lib/globalLook.js';
import { installSelectOnFocus } from './lib/selectOnFocus.js';
import { mountGroups } from './lib/group/GroupHost.js';
import { PickMenu } from './lib/PickMenu.js';
import { createEnsembleStore } from './lib/EnsembleStore.js';
import { ElementSettings } from './lib/ElementSettings.js';
import { taktMetroDefs } from './lib/taktmetro/defs.js';
import { createTaktEngine } from './lib/taktmetro/engine.js';
import { MP3_CBR_PRESETS } from './lib/mp3Encoder.js';
import { WAV_SAMPLE_RATES, WAV_BIT_DEPTHS } from './lib/wavEncoder.js';
import { recInstrumentDefs } from './lib/recInstrument/defs.js';
import { createRecEngine } from './lib/recInstrument/engine.js';
import {
    getContext as getBusContext, getMaster as getBusMaster, getAnalyser as getBusAnalyser,
    setMasterDb as setBusMasterDb,
} from './lib/audioBus.js';
import { createRoutingRegistry, bindPorts } from './lib/routing/Registry.js';
import { knobWrites, buttonWrites } from './lib/routing/portGen.js';
import { createStructureView } from './lib/routing/StructureView.js';
import { LevelMeter } from './lib/LevelMeter.js';
import { createScopeManager } from './lib/scope/multiScope.js';
import { icon } from './lib/icons.js';
import { mdToHtml, htmlToMdApprox } from './lib/miniMarkdown.js';

// Erstbesuch-Demo-Stand (presets/default-config.json) abwarten, BEVOR der erste
// MiniState den localStorage liest (s. werkbank.js-Vorbild, @dpa 20260725: „man muss die
// config hinzu speichern.. sonst klingt alles nichts").
await (window.__defaultConfigReady || Promise.resolve());

// Globaler Fallback-State: von hintResolve() weiter unten genutzt, wenn ein Control zu
// keinem der eigenen Instrumenten-States gehört.
const state = new MiniState();
setLang(state.get('lang') || 'de');
wireGlobalLook(state);
installSelectOnFocus();

// ── Header-Button-Settings (1:1 aus werkbank.js — instrumentunabhängig, generisch) ─────
const hdrElemSettings = new ElementSettings(state);
hdrElemSettings.onApply = (id, style) => {
    const cur = { ...(state.get('ctrlStyles') || {}) };
    if (style && Object.keys(style).length) cur[id] = style; else delete cur[id];
    state.set('ctrlStyles', cur);
};
function wireHeaderBtnSettings(id, btn, defLabel) {
    const field = document.createElement('div'); field.className = 'btn-field hdr-btn-field';
    const labelEl = document.createElement('span'); labelEl.className = 'btn-label';
    field.append(labelEl, btn);
    field.dataset.ctrl = id;
    const baseText = btn.textContent;
    const applyStyle = (s) => {
        labelEl.textContent = s.label || '';
        field.classList.remove('btn-label-top', 'btn-label-left', 'btn-label-right', 'btn-label-bottom', 'btn-label-off');
        field.classList.add('btn-label-' + (s.labelPos || 'off'));
        const onText = s.textOn || baseText, offText = s.textOff || baseText;
        btn._applyBtnStyle = () => {
            const on = btn.classList.contains('active');
            btn.textContent = on ? onText : offText;
            btn.style.background = on ? (s.bgOn || '') : (s.bg || '');
        };
        btn.style.color = s.fg || '';
        btn.style.fontSize = s.size ? s.size + 'px' : '';
        btn.style.padding = s.pad != null ? s.pad + 'px' : '';
        btn.style.width = s.boxSize ? s.boxSize + 'px' : '';
        btn.style.height = s.boxH ? s.boxH + 'px' : '';
        btn._applyBtnStyle();
    };
    new MutationObserver(() => btn._applyBtnStyle && btn._applyBtnStyle())
        .observe(btn, { attributes: true, attributeFilter: ['class'] });
    field.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        hdrElemSettings.open({ id, type: 'button', el: field, defLabel, applyStyle });
    });
    applyStyle((state.get('ctrlStyles') || {})[id] || {});
    return field;
}

// ── Master Volume (1:1 aus werkbank.js) ────────────────────────────────────────────────
const MASTER_LS = 'werkbank_master';
const masterState = new MiniState(masterVolumeDefaults, MASTER_LS);
const masterVolume = createMasterVolume(masterState);
document.querySelector('#master-vol').appendChild(masterVolume.element);
window.__master = { state: masterState, volume: masterVolume };

// ── Routing-Registry (1:1 aus werkbank.js) ─────────────────────────────────────────────
const routing = createRoutingRegistry();
window.__routing = { reg: routing };

// ── Takt + Metronom (1:1 aus werkbank.js Z.143-231, minus Stepseq-Verweise: sqManager
// existiert hier nicht, darum onAction nur noch Attrappe fürs Sq-Sync-Feintuning weglassen) ─
const TAKT_LS = 'werkbank_taktmetro';
const taktState = new MiniState(taktMetroDefs().DEFAULTS, TAKT_LS);
const taktRoot = document.querySelector('#taktgeber');
const taktEngine = createTaktEngine(taktState);
const taktDefs = taktMetroDefs({
    onAction: (id, phase) => { taktEngine.onAction(id, phase); },
    audioInfo: () => {
        taktEngine.ensureAudio();
        const c = taktEngine.context;
        return c ? { sampleRate: c.sampleRate, baseLatency: c.baseLatency, outputLatency: c.outputLatency, state: c.state } : null;
    },
});
const takt = mountGroups(taktRoot, taktState, taktDefs, {
    instrumentScaled: () => taktInstr.scaled(),
});
// _onTaktRunning wird von Rec weiter unten belegt (dasselbe Muster wie werkbank.js): NUR
// EINE Registrierung bei taktEngine.onRunning, Rec hängt sich über diese Closure mit an.
let _onTaktRunning = () => {};
taktEngine.onRunning((on, avv) => { takt.setCtrlOn('b:start', on); takt.setCtrlOn('b:startCont', on); _onTaktRunning(on, avv); });
taktEngine.onBeat((i) => takt.setBeat('u:beatView', i));
taktEngine.onNudge((liveBpm) => takt.setKnobDisplay('bpm', liveBpm));
window.__takt = { engine: taktEngine, state: taktState, host: takt };
routing.registerModule('takt', {
    label: 'Takt/Metronom', latency: taktEngine.latency,
    ...bindPorts(taktDefs.ports, {
        outputs: {},
        inputs: {
            ...knobWrites(taktState, taktDefs.KNOBS),
            ...buttonWrites(takt.keyMidi, Object.keys(taktDefs.BUTTONS)),
            // baseFreqIn bleibt Teil der Naht (Modularität, s. Auftrag) — hier ohne
            // Poly-Synth aber ohne Quelle, die je verbindet. Idempotent/harmlos.
            baseFreqIn: { write: (v) => taktEngine.setBaseFreqIn(v) },
        },
    }),
});

// ── Rec – eigenes Instrument (1:1 aus werkbank.js Z.729-793, minus Stepseq-Fanout) ─────
const REC_LS = 'werkbank_rec';
const recState = new MiniState(recInstrumentDefs().DEFAULTS, REC_LS);
const recRoot = document.querySelector('#rec');
const recEngine = createRecEngine(recState, {
    getBpm: () => taktState.get('bpm'),
    getBeatsPerBar: () => taktState.get('beatsPerBar'),
    isClockRunning: () => taktEngine.running(),
});
const recDefs = recInstrumentDefs({ onAction: (id, phase) => recEngine.onAction(id, phase) });
const rec = mountGroups(recRoot, recState, recDefs, {
    instrumentScaled: () => recInstr.scaled(),
});
// Roher Scheduler-Beat → Rec (Downbeat-Arming). Kein Stepseq hier, also kein Fan-out.
taktEngine.onClockBeat((t, beat) => { recEngine.handleClockBeat(t, beat); });
// Takt gestoppt, während Rec noch auf den nächsten Downbeat wartete → Arm sofort auflösen
// (@dpa 20260722_013727), statt für immer blinkend hängenzubleiben.
_onTaktRunning = (on) => { if (!on) recEngine.clockStopped(); };
recEngine.onRecording((on) => rec.setCtrlOn('b:rec', on));
recEngine.onRecArmed((armed) => rec.setCtrlBlink('b:rec', !!armed));
window.__rec = { engine: recEngine, state: recState, host: rec };
routing.registerModule('rec', {
    label: 'Rec', latency: recEngine.latency,
    ...bindPorts(recDefs.ports, { inputs: { clock: { write: () => {} } } }),
});
routing.connect({ module: 'takt', port: 'beat' }, { module: 'rec', port: 'clock' }, { active: false });
// Debug/Test: direkter Zugriff auf den gemeinsamen Audio-Bus (lib/audioBus.js).
window.__audioBus = { getContext: getBusContext, getMaster: getBusMaster, getAnalyser: getBusAnalyser };

// ── LevelMeter – eigenes Instrument (ISM), 1:1 aus werkbank.js Z.798-812 ───────────────
const LEVELMETER_LS = 'werkbank_levelmeter';
const levelMeterState = new MiniState({}, LEVELMETER_LS);
const levelMeterRoot = document.querySelector('#levelmeter');
const levelMeterHost = mountGroups(levelMeterRoot, levelMeterState, { GROUPS: [{ name: 'Meter' }] });
const levelMeter = new LevelMeter(() => getBusAnalyser());
levelMeterHost.mountInGroup('Meter', levelMeter.element, 'u:meter');
hint(levelMeter.element, 'Ausgangspegel des gesamten Ensembles (dBFS, Peak-Hold).');
levelMeterHost.registerCtrlStyle('u:meter', 'levelmeter', levelMeter.element, (s) => levelMeter.applyStyle(s), 'Level');
levelMeterHost.refresh();
window.__levelMeter = { state: levelMeterState, host: levelMeterHost, meter: levelMeter };

// ── Signal-Scopes – eigenes ISM, 1:1 aus werkbank.js Z.814-937 ─────────────────────────
const SCOPE_LS = 'werkbank_scope';
const scopeState = new MiniState({ scopeCount: 1 }, SCOPE_LS);
const scopeRoot = document.querySelector('#scopes');
const scopeDefs = { GROUPS: [] };
const scopeHost = mountGroups(scopeRoot, scopeState, scopeDefs, {
    groupKindSettings: (kind) => _scopeKindSettings[kind],
});
const scopeManager = createScopeManager({ host: scopeHost, state: scopeState, defs: scopeDefs, routing });
scopeManager.init();
mountInstrumentSettings(document.querySelector('#bench-scope'), scopeState, { defaultName: 'Signal-Scopes' });

// Scope-Settings im Gruppen-Rechtsklick-Panel (kompakt, 2-spaltig — wie ADSR im Original)
const _scopeKindSettings = {
    Scope: (name, pop, st, row, sfx) => {
        if (!sfx) return;
        const i = parseInt(sfx.slice(1), 10);
        const scope = scopeManager.scopes[i];
        if (!scope) return;
        const styles = () => ({ ...(scopeState.get('ctrlStyles') || {}) });
        const cur = () => (styles()['u:scope' + sfx] || {});
        const setStyle = (patch) => {
            const all = styles();
            all['u:scope' + sfx] = { ...(all['u:scope' + sfx] || {}), ...patch };
            scopeState.set('ctrlStyles', all);
            scope.applyStyle(all['u:scope' + sfx]);
        };

        pop.appendChild(Object.assign(document.createElement('div'), { className: 'gs-sep' }));

        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:4px 12px; margin:8px 0;';
        const numField = (label, key, min, max, step, def) => {
            const l = document.createElement('label');
            l.style.cssText = 'display:flex; align-items:center; gap:4px; font-size:11px;';
            const n = document.createElement('input'); n.type = 'number';
            n.min = min; n.max = max; n.step = step;
            n.value = cur()[key] ?? def;
            n.style.cssText = 'width:56px; font-size:11px; padding:1px 2px;';
            n.addEventListener('input', () => {
                const v = Math.max(min, Math.min(max, parseFloat(n.value)));
                if (Number.isFinite(v)) setStyle({ [key]: v });
            });
            l.append(n, document.createTextNode(label));
            grid.appendChild(l);
        };
        const boolField = (label, key, def) => {
            const l = document.createElement('label');
            l.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:11px; cursor:pointer;';
            const cb = document.createElement('input'); cb.type = 'checkbox';
            cb.checked = cur()[key] ?? def;
            cb.addEventListener('change', () => setStyle({ [key]: cb.checked }));
            l.append(cb, document.createTextNode(label));
            grid.appendChild(l);
        };
        // Keine Reflex-Limits (@dpa 20260727), großzügig statt "zur Sicherheit knapp".
        numField('Buffer ms', 'bufferMs', 2, 1000000, 1, 40);
        numField('Breite', 'width', 24, 1000000, 2, 120);
        numField('Höhe', 'height', 12, 1000000, 2, 34);
        numField('min', 'minVal', -1000000, 1000000, 0.1, 0);
        numField('max', 'maxVal', -1000000, 1000000, 0.1, 1);
        boolField('Auto-Range', 'autoRange', true);
        boolField('Meter', 'showMeter', true);
        boolField('Kurve', 'showCurve', true);
        pop.appendChild(grid);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex; gap:8px; margin-top:8px;';
        const copyBtn = document.createElement('button'); copyBtn.className = 'wb-help-btn'; copyBtn.textContent = '+➚';
        hint(copyBtn, 'Kopie dieses Scopes anlegen (übernimmt die Optik)');
        copyBtn.addEventListener('click', () => {
            const src = cur();
            scopeManager.addScope();
            const all = styles();
            all['u:scope_' + (scopeManager.count() - 1)] = { ...src };
            scopeState.set('ctrlStyles', all);
            scopeHost.reapplyCtrlStyles(['u:scope_' + (scopeManager.count() - 1)]);
        });
        const delBtn = document.createElement('button'); delBtn.className = 'wb-help-btn'; delBtn.textContent = '🚮';
        hint(delBtn, 'Diesen Scope löschen (nach Bestätigung)');
        delBtn.addEventListener('click', () => {
            if (!confirm('Scope wirklich löschen?')) return;
            scopeManager.removeScope();
        });
        const resetBtn = document.createElement('button'); resetBtn.className = 'wb-help-btn'; resetBtn.textContent = '⟲';
        hint(resetBtn, 'Puffer + Auto-Range zurücksetzen');
        resetBtn.addEventListener('click', () => scope.reset());
        btnRow.append(copyBtn, delBtn, resetBtn);
        pop.appendChild(btnRow);
    },
};

// Header-Buttons (+/−) für die Scopes, wie bei Sq/ADSR im Original
(() => {
    const h2 = document.querySelector('#bench-scope h2');
    if (!h2) return;
    const wrap = document.createElement('span'); wrap.className = 'sq-edit-ctrls';
    const editBtn = document.createElement('button'); editBtn.type = 'button'; editBtn.className = 'wb-help-btn sq-edit-btn';
    editBtn.appendChild(icon('edit', 12)); hint(editBtn, 'Scopes bearbeiten: hinzufügen/entfernen');
    const addBtn = document.createElement('button'); addBtn.type = 'button'; addBtn.className = 'wb-help-btn sq-pm'; addBtn.textContent = '+';
    hint(addBtn, 'Scope hinzufügen');
    const remBtn = document.createElement('button'); remBtn.type = 'button'; remBtn.className = 'wb-help-btn sq-pm'; remBtn.textContent = '−';
    hint(remBtn, 'Letzten Scope entfernen (mindestens einer bleibt)');
    addBtn.style.display = remBtn.style.display = 'none';
    let editing = false;
    const sync = () => { remBtn.disabled = scopeManager.count() <= 1; };
    editBtn.addEventListener('click', () => {
        editing = !editing;
        addBtn.style.display = remBtn.style.display = editing ? '' : 'none';
        editBtn.classList.toggle('active', editing);
        sync();
    });
    addBtn.addEventListener('click', () => { scopeManager.addScope(); sync(); });
    remBtn.addEventListener('click', () => { scopeManager.removeScope(); sync(); });
    wrap.append(editBtn, addBtn, remBtn);
    h2.appendChild(wrap);
})();
window.__scope = { state: scopeState, host: scopeHost, mgr: scopeManager };

// Render-Loop, GEKÜRZT (@dpa-Auftrag): kein baseKeyboard/toneReadout/freqReadout/sqManager/
// envManager — die gibt es hier nicht (kein Poly-Synth/Stepseq). Übrig bleibt nur, was die
// vier vorhandenen ISMs tatsächlich pro Frame brauchen.
(function tick() {
    levelMeter.tick();
    routing.flush();      // verbundene VALUE-Ports sampeln (Phase 2.3)
    scopeManager.tick();  // Signal-Scopes zeichnen + Passthrough
    requestAnimationFrame(tick);
})();

// ── P3: Tasten/MIDI-Overlay-Schalter im Header (1:1-Muster aus werkbank.js Z.985-986) ──
// Vier ISMs hier statt zwei — jedes hat sein EIGENES KeyMidi (eigener mountGroups-Aufruf),
// darum müssen ALLE VIER geschaltet werden. Im Original (werkbank.js) fehlt das für
// LevelMeter/Scope sogar (Bug, s. ARCHITEKTUR.md-Lücke) — hier bewusst ergänzt, sonst
// reagieren deren Controls (u:meter, s:scopeSrc_i, u:scope_i) nie auf ⌨/🎹.
const keyMidi = takt.keyMidi;
const mkHeaderToggle = (id, label, title, onToggle) => {
    const btn = document.createElement('button');
    btn.className = 'pb-btn'; btn.id = id; btn.type = 'button';
    btn.textContent = label; btn.title = title;
    btn.addEventListener('click', () => {
        const on = btn.classList.toggle('active');
        if (on && btn._radioPeer && btn._radioPeer.classList.contains('active')) {
            btn._radioPeer.classList.remove('active');
            btn._radioPeer._onToggle(false);
        }
        onToggle(on);
    });
    btn._onToggle = onToggle;
    document.querySelector('.topbar-right').appendChild(wireHeaderBtnSettings('hdr:' + id, btn, label));
    return btn;
};
const keyBtn = mkHeaderToggle('keyedit', '⌨ Tasten', 'Tastenbelegung über allen Controls anzeigen/ändern — nur einer von Tasten/MIDI zugleich', (on) => {
    keyMidi.setKeyEdit(on); rec.keyMidi.setKeyEdit(on); levelMeterHost.keyMidi.setKeyEdit(on); scopeHost.keyMidi.setKeyEdit(on);
});
const midiBtn = mkHeaderToggle('midiedit', '🎹 MIDI', 'MIDI-Learn über allen Controls anzeigen/ändern — nur einer von Tasten/MIDI zugleich', (on) => {
    keyMidi.setMidiEdit(on); rec.keyMidi.setMidiEdit(on); levelMeterHost.keyMidi.setMidiEdit(on); scopeHost.keyMidi.setMidiEdit(on);
});
keyBtn._radioPeer = midiBtn; midiBtn._radioPeer = keyBtn;

// ── Help Hints (1:1-Muster aus werkbank.js Z.989-1016), Ternary auf alle vier ISMs ─────
const hintResolve = (el) => {
    const c = el.closest && el.closest('[data-ctrl]');
    if (c) {
        const id = c.dataset.ctrl;
        const st = c.closest('#taktgeber') ? taktState
                 : c.closest('#rec') ? recState
                 : c.closest('#levelmeter') ? levelMeterState
                 : c.closest('#scopes') ? scopeState
                 : state;
        const own = (st.get('hintText') || {})[id];
        return own || factoryHint(id, curLang()) || c.dataset.hint || (el.dataset && el.dataset.hint) || '';
    }
    return (el.dataset && el.dataset.hint) || '';
};
const hintBubble = new HintBubble(hintResolve, { enabled: taktState.get('hintsOn') !== false });
const hintsBtn = mkHeaderToggle('hintsedit', '💬 Hints', 'Hilfe-Blasen bei Maus-Hover für alles an/aus',
    (on) => { hintBubble.enable(on); taktState.set('hintsOn', on); });
if (taktState.get('hintsOn') !== false) hintsBtn.classList.add('active');   // Default: an

// ── Config Export/Import (1:1-Muster aus werkbank.js Z.1018-1029) ─────────────────────
// LS_KEYS enthält 'werkbank_scope' von Anfang an (@dpa-Auftrag: fehlt in index.html/
// werkbank.js als Bug — hier von Anfang an korrekt, kein drittes Mal denselben Fehler).
const LS_KEYS = ['werkbank_state', 'werkbank_taktmetro', 'werkbank_rec', 'werkbank_levelmeter', 'werkbank_master', 'werkbank_ensemble', 'werkbank_scope'];

// ── Ensemble-Snapshot (1:1-Muster aus werkbank.js Z.1031-1050) — @dpa-Auftrag: ALLE VIER
// hier vorhandenen ISMs (Takt, Rec, LevelMeter, Scope) gehören rein, nicht nur eine
// Teilmenge — "Ensemble-Snapshots sollen IMMER ALLES erfassen, was auf der Seite
// audiotechnisch läuft". Master-Volume bleibt bewusst außen vor (wie im Original: „Master
// Fader bleibt extra"), LevelMeter/Scope sind zwar rein visuell/lesend, gehören aber laut
// Auftrag trotzdem in die Liste (LevelMeter liefert dabei schlicht {} zurück — kein
// eigener Sound-Wert vorhanden, keine Gefahr). Scope braucht wie Stepseq im Original einen
// snapExtra/onRecalled-Hook: scopeCount ist ISM-weit (keine Gruppe), allSoundValues()
// erfasst nur die scopeSrc_i-Werte der GERADE existierenden Gruppen — ohne den Hook käme
// nach dem Recall weder die Scope-ANZAHL zurück, noch würden zusätzliche/fehlende Scope-
// Gruppen nachgebaut/abgebaut.
const ENSEMBLE_LS = 'werkbank_ensemble';
const ensembleState = new MiniState({}, ENSEMBLE_LS);
const ensembleStore = createEnsembleStore(ensembleState, [
    { lsKey: TAKT_LS, state: taktState, allSoundValues: () => takt.allSoundValues() },
    { lsKey: REC_LS, state: recState, allSoundValues: () => rec.allSoundValues() },
    { lsKey: LEVELMETER_LS, state: levelMeterState, allSoundValues: () => levelMeterHost.allSoundValues() },
    {
        lsKey: SCOPE_LS, state: scopeState, allSoundValues: () => scopeHost.allSoundValues(),
        snapExtra: () => ({ scopeCount: scopeManager.count() }),
        onRecalled: (extra) => { if (extra && extra.scopeCount) scopeState.set('scopeCount', extra.scopeCount); scopeManager.reconcile(); },
    },
]);
window.__ensemble = { state: ensembleState, store: ensembleStore };
function buildConfig() {
    const ls = {};
    for (const k of LS_KEYS) { const v = localStorage.getItem(k); if (v != null) { try { ls[k] = JSON.parse(v); } catch { /* skip */ } } }
    return { _werkbank: 1, saved: new Date().toISOString(), ls };
}
function applyConfig(obj) {
    const ls = (obj && obj.ls) || obj || {};   // toleriert nacktes { key: data }
    let n = 0;
    for (const k of LS_KEYS) if (ls[k] != null) { localStorage.setItem(k, JSON.stringify(ls[k])); n++; }
    return n;
}
function exportConfig() {
    const blob = new Blob([JSON.stringify(buildConfig(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);   // YYYYMMDDHHMMSS
    a.href = url; a.download = 'werkbank-config-' + ts + '.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const cfgBtn = document.createElement('button');
cfgBtn.className = 'pb-btn'; cfgBtn.id = 'cfgmenu'; cfgBtn.type = 'button';
cfgBtn.textContent = '⚙ Config'; cfgBtn.title = 'Konfiguration exportieren/importieren (zum Übergeben)';
document.querySelector('.topbar-right').appendChild(wireHeaderBtnSettings('hdr:cfgmenu', cfgBtn, '⚙ Config'));
const fileIn = document.createElement('input'); fileIn.type = 'file'; fileIn.accept = '.json,application/json'; fileIn.style.display = 'none';
document.body.appendChild(fileIn);
fileIn.addEventListener('change', () => {
    const f = fileIn.files && fileIn.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { try { const n = applyConfig(JSON.parse(rd.result)); if (n) location.reload(); else alert('Keine passenden Daten in der Datei.'); } catch (e) { alert('Import fehlgeschlagen: ' + e.message); } };
    rd.readAsText(f); fileIn.value = '';
});
function doReset() {
    if (confirm('Wirklich ALLES zurücksetzen? Umbenennungen, Anordnung, Belegungen gehen verloren.')) { LS_KEYS.forEach((k) => localStorage.removeItem(k)); location.reload(); }
}
// main Config (1:1-Muster aus werkbank.js Z.1088-1151): aufgeräumtes Themen-Fenster statt
// schmalem Popup — kennt keine ISM-Namen, wirkt generisch über state/globalLook/i18n.
const cfgPanel = new MiniSettings('⚙ Config');
cfgBtn.addEventListener('click', () => {
    if (cfgPanel.isOpen) { cfgPanel.close(); return; }
    cfgBtn.classList.add('active');
    cfgPanel.open(cfgBtn, ({ color, colorA, num, section, full }) => {
        section('Labels');
        const colorField = color('Farbe', { get: () => state.get('labelColor') || '#8a94a6', set: (v) => state.set('labelColor', v) });
        hint(colorField.closest('.kme-row'), 'Gilt für ALLE Beschriftungen und Werte-Anzeigen auf einmal. Leer bzw. ✕ = wie ausgeliefert. Einzelne Regler-Farben bleiben davon unberührt (Rechtsklick auf den Regler).');
        const sizeField = num('Größe', { min: 6, max: 1000000, get: () => state.get('labelSize') || 10, set: (v) => state.set('labelSize', v) });
        hint(sizeField, 'Schriftgröße der Beschriftungen (px)');
        const bgFallback = 'rgba(0,0,0,0)';
        colorA('Wert-BG', { get: () => state.get('valueBg') || bgFallback, set: (v) => state.set('valueBg', v), fallback: '#000000' });
        const clearBtn = document.createElement('button'); clearBtn.className = 'pb-btn';
        clearBtn.textContent = '✕ Vorgabe entfernen'; hint(clearBtn, 'Vorgabe entfernen (wieder wie ausgeliefert)');
        clearBtn.addEventListener('click', () => {
            state.set('labelColor', ''); state.set('labelSize', ''); state.set('valueBg', '');
            colorField.value = '#8a94a6'; sizeField.value = 10;
            cfgPanel.close(); cfgBtn.click();
        });
        full(clearBtn);

        section('Gruppen-Kopf');
        const ghSize = num('Größe', { min: 8, max: 1000000, get: () => state.get('grpHeadSize') || 10, set: (v) => state.set('grpHeadSize', v) });
        hint(ghSize, 'Schriftgröße der Gruppen-Kopfzeile (px)');
        const ghH = num('Höhe', { min: 0, max: 1000000, get: () => state.get('grpHeadH') || 0, set: (v) => state.set('grpHeadH', v) });
        hint(ghH, 'Mindesthöhe der Gruppen-Kopfzeile in px (0 = wie ausgeliefert)');

        section('Sprache');
        const langRow = document.createElement('div'); langRow.className = 'cfg-btn-row';
        const deBtn = document.createElement('button'); deBtn.className = 'pb-btn'; deBtn.textContent = 'Deutsch';
        const enBtn = document.createElement('button'); enBtn.className = 'pb-btn'; enBtn.textContent = 'English';
        const paintLang = () => { deBtn.classList.toggle('active', curLang() === 'de'); enBtn.classList.toggle('active', curLang() === 'en'); };
        deBtn.addEventListener('click', () => { setLang('de'); state.set('lang', 'de'); paintLang(); });
        enBtn.addEventListener('click', () => { setLang('en'); state.set('lang', 'en'); paintLang(); });
        paintLang();
        langRow.append(deBtn, enBtn);
        full(langRow);
        hint(langRow, 'Sprache der Hinweise und Beschriftungen (selbst vergebene Namen bleiben unverändert)');

        section('Daten');
        const btnRow = document.createElement('div'); btnRow.className = 'cfg-btn-row';
        const mk = (label, title, fn) => { const b = document.createElement('button'); b.className = 'pb-btn'; b.textContent = label; hint(b, title); b.addEventListener('click', fn); return b; };
        btnRow.append(
            mk('⭳ Export', 'Aktuellen Zustand als .json herunterladen', () => exportConfig()),
            mk('⭱ Import', 'Zustand aus einer .json laden (Seite lädt neu)', () => fileIn.click()),
            mk('↺ Reset', 'Alles zurücksetzen (localStorage leeren, Seite lädt neu)', doReset),
        );
        full(btnRow);
    }, () => cfgBtn.classList.remove('active'),
    { get: () => state.get('cfgPanelPos'), set: (pos) => state.set('cfgPanelPos', pos) });
});
window.__cfg = { build: buildConfig, apply: applyConfig };   // Test-/Debug-Haken

// ── Ensemble-Snapshot-Menü im Header (1:1 aus werkbank.js Z.1154-1193) ────────────────
const ensembleMenu = new PickMenu({
    label: '',
    empty: '⭐ Ensemble',
    title: 'Zustand mehrerer Instrumente zusammen speichern/laden (Master-Fader bleibt außen vor)',
    noContextOpen: true,
    list: () => ensembleStore.list(),
    current: () => ensembleState.get('ensembleSnapSel') || '',
    onPick: (i) => ensembleStore.recall(i),
    onUpdate: (i) => ensembleStore.update(i),
    onRename: (i, item, newName) => ensembleStore.rename(i, newName),
    onDelete: (i) => ensembleStore.del(i),
    foot: [['plus', '+ Neu', 'Aktuellen Zustand als neuen Ensemble-Snapshot speichern', () => {
        const nm = prompt('Name für den neuen Ensemble-Snapshot?', 'Snapshot ' + (ensembleStore.list().length + 1));
        if (nm && nm.trim()) ensembleStore.save(nm.trim());
    }]],
});
ensembleMenu.element.dataset.ctrl = 'hdr:ensemble';
const applyEnsembleStyle = (s) => {
    const btn = ensembleMenu.element.querySelector('.pm-btn');
    if (btn) {
        btn.style.background = s.bg0 || '';
        btn.style.color = s.fg || '';
        btn.style.fontSize = s.size ? s.size + 'px' : '';
        btn.style.padding = s.pad != null ? s.pad + 'px' : '';
        btn.style.width = s.boxSize ? s.boxSize + 'px' : '';
    }
};
ensembleMenu.element.addEventListener('contextmenu', (e) => {
    e.preventDefault(); e.stopPropagation();
    hdrElemSettings.open({ id: 'hdr:ensemble', type: 'select', el: ensembleMenu.element, defLabel: 'Ensemble', applyStyle: applyEnsembleStyle });
});
applyEnsembleStyle((state.get('ctrlStyles') || {})['hdr:ensemble'] || {});
document.querySelector('.topbar h1').insertAdjacentElement('afterend', ensembleMenu.element);
window.__ensemble.menu = ensembleMenu;

// ── 🔇 Audio-Reset — ECHTER, STRENGER Reset (@dpa-Auftrag, kein No-Op) ─────────────────
// Anders als index.html/werkbank.js (dort: polySynthEngine.allNotesOff() — das einzige
// hier fehlende Instrument mit potenziell endlos gehaltenen Stimmen) gibt es in diesem
// Scaffold KEIN Poly-Synth. Was hier tatsächlich „hängen" kann, ist (a) ein laufender
// Takt/Metronom-Transport und (b) eine laufende Rec-Aufnahme — beide werden hart beendet.
// Zusätzlich wird der gemeinsame Master-Bus (lib/audioBus.js) kurz auf (praktisch) Stille
// gezogen und sofort auf den gespeicherten Fader-Wert zurückgefahren: ein echter Panik-
// Stop für jeden noch hörbaren Rest, OHNE audioBus.js' bestehende Verbindungen zu trennen
// (kein disconnect() — nur der Gain-Wert kippt kurz, s. audioBus.js setMasterDb()).
const resetBtn = document.createElement('button');
resetBtn.className = 'pb-btn'; resetBtn.id = 'headerreset'; resetBtn.type = 'button';
resetBtn.textContent = '🔇 Audio-Reset'; resetBtn.title = 'Hängende/klingende Noten + laufende Aufnahme sofort beenden (keine Einstellungen betroffen)';
const activateHeaderReset = () => {
    // Takt hart stoppen (wie ein Klick auf '>'), falls er gerade läuft — kaskadiert über
    // taktEngine.onRunning()/_onTaktRunning bis zu recEngine.clockStopped() (löst ein
    // wartendes Rec-Arm sofort auf, statt für immer weiter zu blinken).
    if (taktEngine.running()) taktEngine.onAction('start');
    // Eine TATSÄCHLICH laufende Aufnahme (nicht nur „armed") sofort beenden — nach dem
    // Takt-Stopp schaltet recToggle() SOFORT statt auf den nächsten Downbeat zu warten
    // (isClockRunning() ist jetzt false, s. lib/recInstrument/engine.js recToggle()).
    if (recEngine.recording()) recEngine.onAction('rec');
    // Master-Bus hart durchreißen: Gain kurz auf ~0, dann zurück auf den gespeicherten
    // Fader-Wert (masterState.masterDb).
    if (getBusContext()) {
        setBusMasterDb(-1000);
        setTimeout(() => setBusMasterDb(masterState.get('masterDb') ?? 0), 30);
    }
};
resetBtn.addEventListener('click', activateHeaderReset);
document.querySelector('.topbar-right').appendChild(wireHeaderBtnSettings('hdr:headerreset', resetBtn, '🔇 Audio-Reset'));
keyMidi.register('hdr:headerreset', resetBtn, '🔇 Audio-Reset', activateHeaderReset, { self: true });

// ── Struktur-Ansicht (1:1 aus werkbank.js Z.1214-1231) — zeigt hier nur takt+rec als
// registrierte Module (LevelMeter/Scope registrieren sich bewusst NICHT bei der Registry,
// s. multiScope.js Kopfkommentar: „ein Meter ist eine ANZEIGE ... braucht kein Output"). ──
const structureBtn = document.createElement('button');
structureBtn.className = 'pb-btn'; structureBtn.id = 'structurebtn'; structureBtn.type = 'button';
structureBtn.textContent = '⧉ Struktur'; structureBtn.title = 'Struktur-Ansicht: Module + Verbindungen (nur ansehen)';
document.querySelector('.topbar-right').appendChild(wireHeaderBtnSettings('hdr:structurebtn', structureBtn, '⧉ Struktur'));
const structureView = createStructureView(routing, {
    button: structureBtn,
    posStore: { get: () => state.get('structureViewPos'), set: (pos) => state.set('structureViewPos', pos) },
});
const activateStructureBtn = () => { structureView.isOpen() ? structureView.close() : structureView.open(); };
structureBtn.addEventListener('click', activateStructureBtn);
keyMidi.register('hdr:structurebtn', structureBtn, '⧉ Struktur', activateStructureBtn, { self: true });
window.__structure = { view: structureView };

// ── Aufnahme-Format (1:1 aus werkbank.js Z.1233-1339) ──────────────────────────────────
const REC_FORMATS = [
    { v: 'webm', l: 'WebM/Opus' },
    { v: 'mp3', l: 'MP3' },
    { v: 'wav', l: 'WAV' },
];
const recFmtBtn = document.createElement('button');
recFmtBtn.className = 'pb-btn'; recFmtBtn.id = 'recfmtmenu'; recFmtBtn.type = 'button';
recFmtBtn.textContent = '⚙ Rec-Format'; recFmtBtn.title = 'Aufnahme-Ausgabeformat (global, für alle Aufnahmen)';
document.querySelector('.topbar-right').appendChild(wireHeaderBtnSettings('hdr:recfmtmenu', recFmtBtn, '⚙ Rec-Format'));
let recFmtPop = null;
const closeRecFmt = () => { if (recFmtPop) { recFmtPop.remove(); recFmtPop = null; document.removeEventListener('mousedown', recFmtOutside, true); recFmtBtn.classList.remove('active'); } };
const recFmtOutside = (e) => { if (recFmtPop && !recFmtPop.contains(e.target) && e.target !== recFmtBtn) closeRecFmt(); };
recFmtBtn.addEventListener('click', () => {
    if (recFmtPop) { closeRecFmt(); return; }
    recFmtPop = document.createElement('div'); recFmtPop.className = 'cfg-pop';
    const wrap = document.createElement('label'); wrap.className = 'select-field segment-field';
    const span = document.createElement('span'); span.textContent = 'Format';
    const seg = document.createElement('div'); seg.className = 'segmented';
    const cur = () => recState.get('recFormat') || 'webm';

    const mp3Wrap = document.createElement('label'); mp3Wrap.className = 'select-field segment-field';
    const mp3Span = document.createElement('span'); mp3Span.textContent = 'Bitrate';
    const mp3Seg = document.createElement('div'); mp3Seg.className = 'segmented';
    const curBitrate = () => recState.get('recMp3Bitrate') || 192;
    const mp3PaintBitrate = () => { const c = curBitrate(); mp3Btns.forEach((b, i) => b.classList.toggle('seg-on', MP3_CBR_PRESETS[i] === c)); };
    const mp3Btns = MP3_CBR_PRESETS.map((kbps) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'seg-btn';
        b.textContent = String(kbps); b.title = kbps + ' kbps (CBR)';
        b.addEventListener('click', () => { recState.set('recMp3Bitrate', kbps); mp3PaintBitrate(); });
        mp3Seg.appendChild(b); return b;
    });
    mp3Wrap.appendChild(mp3Span); mp3Wrap.appendChild(mp3Seg);

    const chWrap = document.createElement('label'); chWrap.className = 'select-field segment-field';
    const chSpan = document.createElement('span'); chSpan.textContent = 'Kanäle';
    const chSeg = document.createElement('div'); chSeg.className = 'segmented';
    const CH_OPTS = [{ v: false, l: 'Mono' }, { v: true, l: 'Stereo' }];
    const curStereo = () => recState.get('recMp3Stereo') !== false;
    const chPaint = () => { const c = curStereo(); chBtns.forEach((b, i) => b.classList.toggle('seg-on', CH_OPTS[i].v === c)); };
    const chBtns = CH_OPTS.map((o) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'seg-btn';
        b.textContent = o.l;
        b.addEventListener('click', () => { recState.set('recMp3Stereo', o.v); chPaint(); });
        chSeg.appendChild(b); return b;
    });
    chWrap.appendChild(chSpan); chWrap.appendChild(chSeg);

    const wavRateWrap = document.createElement('label'); wavRateWrap.className = 'select-field segment-field';
    const wavRateSpan = document.createElement('span'); wavRateSpan.textContent = 'Samplerate';
    const wavRateSeg = document.createElement('div'); wavRateSeg.className = 'segmented';
    const curWavRate = () => recState.get('recWavSampleRate') || 44100;
    const wavRatePaint = () => { const c = curWavRate(); wavRateBtns.forEach((b, i) => b.classList.toggle('seg-on', WAV_SAMPLE_RATES[i] === c)); };
    const wavRateBtns = WAV_SAMPLE_RATES.map((rate) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'seg-btn';
        b.textContent = String(rate / 1000); b.title = rate + ' Hz';
        b.addEventListener('click', () => { recState.set('recWavSampleRate', rate); wavRatePaint(); });
        wavRateSeg.appendChild(b); return b;
    });
    wavRateWrap.appendChild(wavRateSpan); wavRateWrap.appendChild(wavRateSeg);

    const wavBitWrap = document.createElement('label'); wavBitWrap.className = 'select-field segment-field';
    const wavBitSpan = document.createElement('span'); wavBitSpan.textContent = 'Bittiefe';
    const wavBitSeg = document.createElement('div'); wavBitSeg.className = 'segmented';
    const curWavBit = () => recState.get('recWavBitDepth') || 16;
    const wavBitPaint = () => { const c = curWavBit(); wavBitBtns.forEach((b, i) => b.classList.toggle('seg-on', WAV_BIT_DEPTHS[i] === c)); };
    const wavBitBtns = WAV_BIT_DEPTHS.map((bd) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'seg-btn';
        b.textContent = bd + ' Bit';
        b.addEventListener('click', () => { recState.set('recWavBitDepth', bd); wavBitPaint(); });
        wavBitSeg.appendChild(b); return b;
    });
    wavBitWrap.appendChild(wavBitSpan); wavBitWrap.appendChild(wavBitSeg);

    const updateFormatVisibility = () => {
        const c = cur();
        const showMp3 = c === 'mp3'; mp3Wrap.style.display = showMp3 ? '' : 'none'; chWrap.style.display = showMp3 ? '' : 'none';
        const showWav = c === 'wav'; wavRateWrap.style.display = showWav ? '' : 'none'; wavBitWrap.style.display = showWav ? '' : 'none';
    };

    const paint = () => { const c = cur(); btns.forEach((b, i) => b.classList.toggle('seg-on', REC_FORMATS[i].v === c)); updateFormatVisibility(); };
    const btns = REC_FORMATS.map((o) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'seg-btn';
        b.textContent = o.l; b.title = 'Aufnahme als ' + o.l + ' speichern';
        b.addEventListener('click', () => { recState.set('recFormat', o.v); paint(); });
        seg.appendChild(b); return b;
    });
    mp3PaintBitrate(); chPaint(); wavRatePaint(); wavBitPaint(); paint();
    wrap.appendChild(span); wrap.appendChild(seg);
    recFmtPop.appendChild(wrap);
    recFmtPop.appendChild(mp3Wrap);
    recFmtPop.appendChild(chWrap);
    recFmtPop.appendChild(wavRateWrap);
    recFmtPop.appendChild(wavBitWrap);
    document.querySelector('.topbar-right').appendChild(recFmtPop);
    recFmtBtn.classList.add('active');
    setTimeout(() => document.addEventListener('mousedown', recFmtOutside, true), 0);
});

// Header-Buttons selbst tasten-/MIDI-zuweisbar (1:1 aus werkbank.js Z.1341-1348)
keyMidi.register('hdr:keyedit', keyBtn, '⌨ Tasten', () => keyBtn.click(), { self: true });
keyMidi.register('hdr:midiedit', midiBtn, '🎹 MIDI', () => midiBtn.click(), { self: true });
keyMidi.register('hdr:hintsedit', hintsBtn, '💬 Hints', () => hintsBtn.click(), { self: true });
keyMidi.register('hdr:cfgmenu', cfgBtn, '⚙ Config', () => cfgBtn.click(), { self: true });
keyMidi.register('hdr:recfmtmenu', recFmtBtn, '⚙ Rec-Format', () => recFmtBtn.click(), { self: true });
// Globale Verteilung (Vorbild Z.1354-1357): analog alle VIER hier vorhandenen ISMs, sonst
// feuern gelernte Tasten auf Rec-/LevelMeter-/Scope-Controls nie (derselbe Bug wie im
// Original bei Stepseq, dort erst nachträglich gefunden — hier von Anfang an vollständig).
window.addEventListener('keydown', (e) => keyMidi.dispatchKey(e));
window.addEventListener('keydown', (e) => rec.keyMidi.dispatchKey(e));
window.addEventListener('keydown', (e) => levelMeterHost.keyMidi.dispatchKey(e));
window.addEventListener('keydown', (e) => scopeHost.keyMidi.dispatchKey(e));

// ESC stuft die Funktionsebenen ab (1:1 aus werkbank.js Z.1359-1373).
window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (keyBtn.classList.contains('active') || midiBtn.classList.contains('active')) {
        if (midiBtn.classList.contains('active')) midiBtn.click();
        if (keyBtn.classList.contains('active')) keyBtn.click();
        e.stopImmediatePropagation(); return;
    }
    if (takt.isArranging && takt.isArranging()) { takt.setArranging(false); e.stopImmediatePropagation(); return; }
});

// ── Übergruppe ein-/ausklappen (1:1 aus werkbank.js Z.1375-1382) ──────────────────────
const benchTakt = document.querySelector('#bench-taktgeber');
const taktCollapse = document.querySelector('#taktCollapse');
const applyBenchCollapse = () => benchTakt.classList.toggle('bench-collapsed', !!taktState.get('benchCollapsed'));
taktCollapse.addEventListener('click', () => { taktState.set('benchCollapsed', !taktState.get('benchCollapsed')); applyBenchCollapse(); });
applyBenchCollapse();

// ── Instrument-Beschreibung: [?]-Popover im ISM-Header (1:1 aus werkbank.js Z.1384-1538),
// nur noch für die zwei ISMs mit eigenem .wb-note-Text (Takt/Metronom + Rec). ─────────────
const BENCH_HELP_EN = {
    'bench-taktgeber': 'Two groups from <b>one</b> declarative defs source (mapped from ' +
        'taktgeber), rendered with teslacoil’s factories. <b>e</b> = arrange mode ' +
        '(groups/controls can be dragged freely). Right-click a group title = settings, ' +
        'right-click a control = its look. Dragged values = a “knob without a knob”. ' +
        'The header switch <b>⌨ Keys/MIDI</b> shows/changes key bindings + MIDI learn ' +
        'across all controls. <b>▶</b> (or the bound key) starts the metronome — real ' +
        'sound from taktgeber’s metro.js/clock.js.',
    'bench-rec': 'Used to be part of Beat+Metronome, now stands on its own: taps the shared ' +
        'master bus (lib/audioBus.js) — all instruments together, not just one. ' +
        'Start/stop still syncs to the next downbeat of the beat/metronome instrument.',
};
function mountBenchHelp(sectionId, state) {
    const section = document.querySelector('#' + sectionId);
    if (!section) return;
    const note = section.querySelector(':scope > .wb-note');
    const h2 = section.querySelector('h2');
    if (!h2) return;
    let defaultBodyHtmlDe = '';
    if (note) {
        const clone = note.cloneNode(true);
        const s = clone.querySelector('summary'); if (s) s.remove();
        defaultBodyHtmlDe = clone.innerHTML.trim();
        note.remove();
    }
    const defaultBodyHtmlEn = BENCH_HELP_EN[sectionId] || defaultBodyHtmlDe;
    const defaultBodyHtml = () => (curLang() === 'en' ? defaultBodyHtmlEn : defaultBodyHtmlDe);
    const instrNameEl = h2.querySelector('.wb-instr-name');
    const defaultInstrName = instrNameEl ? instrNameEl.textContent.trim() : '';

    const btn = document.createElement('button');
    btn.className = 'wb-help-btn'; btn.type = 'button';
    btn.appendChild(icon('info', 14));
    h2.appendChild(btn);
    function updateBtnHint() {
        const md = state.get('instrHelpMd');
        const html = md ? mdToHtml(md) : defaultBodyHtml();
        const tmp = document.createElement('div'); tmp.innerHTML = html;
        const plain = tmp.textContent.trim().replace(/\s+/g, ' ');
        hint(btn, plain || 'Beschreibung');
    }
    updateBtnHint();

    let pop = null, editing = false;
    const close = () => {
        if (!pop) return;
        pop.remove(); pop = null; editing = false; btn.classList.remove('active');
        document.removeEventListener('mousedown', onOut, true);
        document.removeEventListener('keydown', onKey, true);
    };
    const onOut = (e) => { if (pop && !pop.contains(e.target) && e.target !== btn) close(); };
    const onKey = (e) => {
        if (e.key !== 'Escape' || !pop) return;
        e.stopPropagation();
        if (editing) { editing = false; render(); } else close();
    };

    function render() {
        pop.innerHTML = '';
        const head = document.createElement('div'); head.className = 'wb-help-headrow';
        const titleIn = document.createElement('input');
        titleIn.type = 'text'; titleIn.className = 'wb-help-title-input';
        titleIn.value = state.get('instrName') || defaultInstrName;
        titleIn.placeholder = defaultInstrName;
        titleIn.title = 'Instrumenten-Name (überall im Header sichtbar)';
        titleIn.addEventListener('focus', () => titleIn.select());
        titleIn.addEventListener('mousedown', (e) => e.stopPropagation());
        titleIn.addEventListener('input', () => {
            state.set('instrName', titleIn.value);
            if (instrNameEl) instrNameEl.textContent = titleIn.value || defaultInstrName;
        });
        titleIn.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') titleIn.blur(); });
        head.appendChild(titleIn);
        const editBtn = document.createElement('button');
        editBtn.className = 'wb-help-edit'; editBtn.type = 'button';
        editBtn.title = 'Hilfe als Markdown bearbeiten';
        editBtn.appendChild(icon('edit', 13));
        editBtn.addEventListener('click', (e) => { e.stopPropagation(); editing = true; render(); });
        head.appendChild(editBtn);
        pop.appendChild(head);

        if (editing) {
            const ta = document.createElement('textarea'); ta.className = 'wb-help-edit-area';
            ta.value = state.get('instrHelpMd') || htmlToMdApprox(defaultBodyHtml());
            pop.appendChild(ta);
            const foot = document.createElement('div'); foot.className = 'wb-help-foot';
            const save = document.createElement('button'); save.type = 'button'; save.textContent = 'Speichern';
            save.addEventListener('click', (e) => { e.stopPropagation(); state.set('instrHelpMd', ta.value.trim()); editing = false; render(); updateBtnHint(); });
            const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Abbrechen';
            cancel.addEventListener('click', (e) => { e.stopPropagation(); editing = false; render(); });
            foot.append(save, cancel); pop.appendChild(foot);
            ta.focus();
        } else {
            const body = document.createElement('div'); body.className = 'wb-help-body';
            const md = state.get('instrHelpMd');
            body.innerHTML = md ? mdToHtml(md) : defaultBodyHtml();
            pop.appendChild(body);
        }
    }

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (pop) { close(); return; }
        pop = document.createElement('div'); pop.className = 'wb-help-pop';
        document.body.appendChild(pop);
        render();
        btn.classList.add('active');
        const r = btn.getBoundingClientRect();
        pop.style.left = Math.max(8, Math.min(r.right - pop.offsetWidth, window.innerWidth - pop.offsetWidth - 8)) + 'px';
        pop.style.top = (r.bottom + 6) + 'px';
        setTimeout(() => { document.addEventListener('mousedown', onOut, true); document.addEventListener('keydown', onKey, true); }, 0);
    });

    onLangChange(() => { updateBtnHint(); if (pop && !editing) render(); });
}
mountBenchHelp('bench-taktgeber', taktState);
mountBenchHelp('bench-rec', recState);

// ── Instrument-Settings, generalisiert (1:1 aus werkbank.js Z.1544-1566) ──────────────
const taktInstr = mountInstrumentSettings(benchTakt, taktState, { bodySelector: '#taktgeber', host: takt });
const recInstr = mountInstrumentSettings(document.querySelector('#bench-rec'), recState, { bodySelector: '#rec', host: rec });
window.__takt.instr = taktInstr;
window.__rec.instr = recInstr;

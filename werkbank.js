/**
 * werkbank.js – baut die Demo-Seite auf.
 *
 * Bewusst dünn: die Werkbank ist eine SAMMLUNG zum Rüberkopieren, kein eigenes Produkt.
 * Alles Interessante steckt in lib/ (unverändert aus teslacoil). Diese Datei stellt die
 * Bausteine nur hin und hängt sie an den MiniState – sie ist selbst NICHT zum Kopieren
 * gedacht und darf deshalb kurz und schlicht bleiben.
 */
import { Knob } from './lib/Knob.js';
import { KnobMetaEditor } from './lib/KnobMetaEditor.js';
import { ElementSettings } from './lib/ElementSettings.js';
import { StepSeqUI } from './lib/StepSeqUI.js';
import { MiniState } from './lib/MiniState.js';
import { mountInstrumentSettings } from './lib/InstrumentSettings.js';
import { HintBubble } from './lib/HintBubble.js';
import { createMasterVolume, masterVolumeDefaults } from './lib/MasterVolume.js';
import { factoryHint } from './lib/hints.js';
import { hint } from './lib/i18n.js';
import { targetKind, globalKeyOk, arrowKeyOk } from './lib/keyRoute.js';
import { mountGroups, kbStyle } from './lib/group/GroupHost.js';
import { taktMetroDefs } from './lib/taktmetro/defs.js';
import { createTaktEngine } from './lib/taktmetro/engine.js';
import { MP3_CBR_PRESETS } from './lib/mp3Encoder.js';
import { WAV_SAMPLE_RATES, WAV_BIT_DEPTHS } from './lib/wavEncoder.js';
import { polySynthDefs } from './lib/polysynth/defs.js';
import { createPolySynthEngine } from './lib/polysynth/engine.js';
import { PlayKeyboard } from './lib/polysynth/ui/PlayKeyboard.js';
import { ChordMemory } from './lib/polysynth/ui/ChordMemory.js';
import { BaseKeyboard } from './lib/polysynth/ui/BaseKeyboard.js';
import { Readout } from './lib/polysynth/ui/Readout.js';
import { midiToName, freqToMidi } from './lib/polysynth/pitch/Scaler.js';
import { recInstrumentDefs } from './lib/recInstrument/defs.js';
import { createRecEngine } from './lib/recInstrument/engine.js';
import { getContext as getBusContext, getMaster as getBusMaster, getAnalyser as getBusAnalyser } from './lib/audioBus.js';
import { LevelMeter } from './lib/LevelMeter.js';
import { icon } from './lib/icons.js';
import { mdToHtml, htmlToMdApprox } from './lib/miniMarkdown.js';

const state = new MiniState({
    ampSeqLen: 8,
    ampSeqSteps: [1, 0, 0.6, 0, 1, 0.3, 0, 0.8],
    seqStyles: { amp: { w: 270, h: 64, bg: '#0e1116', col: 'rgba(255,159,90,1)' } },
});

const metaEditor = new KnobMetaEditor(state);
const elemSettings = new ElementSettings(state);

// ── Master Volume (@dpa 20260722, ddw.md „wir brauchen einen Master Volume") ──────────
// Header-Fader, eigener State (nicht an ein Instrument gebunden — wirkt auf lib/audioBus.js,
// den GEMEINSAMEN Master-Bus aller Instrumente). Muss vor den Instrumenten stehen: sie rufen
// beim ersten Ton audioBus.ensureAudio() auf, createMasterVolume() legt die Volume/Limiter-
// Kette mit den GESPEICHERTEN Werten an (statt später mit hart verdrahteten Defaults).
const MASTER_LS = 'werkbank_master';
const masterState = new MiniState(masterVolumeDefaults, MASTER_LS);
const masterVolume = createMasterVolume(masterState);
document.querySelector('#master-vol').appendChild(masterVolume.element);
window.__master = { state: masterState, volume: masterVolume };

// ── Knobs / Fader ──────────────────────────────────────────────────────────────
// Absichtlich EINE Definition pro Gestalt aus derselben Klasse – das ist die Aussage
// des Bausteins: Knob und Fader sind nicht zwei Dinge.
const DEMO_KNOBS = [
    { key: 'cutoff', label: 'Cutoff', min: 20, max: 18000, curve: 'log', unit: 'Hz', decimals: 0, value: 800 },
    { key: 'reso', label: 'Reso', min: 0.1, max: 20, curve: 'log', unit: 'Q', decimals: 1, value: 2 },
    { key: 'level', label: 'Level', min: 0, max: 1, curve: 'linear', unit: '', decimals: 2, value: 0.7,
      shape: 'faderVert', faderLen: 110 },
    { key: 'mix', label: 'Dry/Wet', min: 0, max: 1, curve: 'linear', unit: '', decimals: 2, value: 0.35,
      shape: 'faderHoriz', faderLen: 140 },
];

const knobRow = document.querySelector('#knobs');
for (const def of DEMO_KNOBS) {
    // Gespeicherte Optik gewinnt über die Demo-Vorgabe → Änderungen überleben den Reload.
    const saved = (state.get('knobMeta') || {})[def.key] || {};
    const knob = new Knob({
        id: 'knob_' + def.key,
        ...def,
        ...saved,
        onChange: (v) => state.set('val_' + def.key, v),
    });
    knob._defaultMeta = knob.getMeta();   // Original-Range/Kurve für „Zurücksetzen"
    knob.element.dataset.ctrl = 'k:' + def.key;   // Kennung für Hilfe-Text (kme-help)
    knob.element.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation(); metaEditor.open(knob);
    });
    knobRow.appendChild(knob.element);
}
// Meta-Änderungen sichern (der Editor meldet sie über onApply(knob), Meta via getMeta()).
metaEditor.onApply = (knob) => {
    const all = { ...(state.get('knobMeta') || {}) };
    all[knob.id.replace(/^knob_/, '')] = knob.getMeta();
    state.set('knobMeta', all);
};

// ── Select / Toggle / Readout ──────────────────────────────────────────────────
const ctrlRow = document.querySelector('#ctrls');

/** Ein Control als style-bar registrieren – wie in teslacoils app.js (registerCtrlStyle). */
function wireSettings(id, type, el, applyStyle, defLabel) {
    const saved = (state.get('ctrlStyles') || {})[id];
    if (saved) applyStyle(saved);
    el.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        elemSettings.open({ id, type, el, defLabel, applyStyle });
    });
}
elemSettings.onApply = (id, style) => {
    const cur = { ...(state.get('ctrlStyles') || {}) };
    if (style && Object.keys(style).length) cur[id] = style; else delete cur[id];
    state.set('ctrlStyles', cur);
};

{   // Select
    const wrap = document.createElement('label'); wrap.className = 'select-field';
    const span = document.createElement('span'); span.textContent = 'Filter-Typ';
    const sel = document.createElement('select');
    ['LP', 'HP', 'BP', 'Ladder-org'].forEach((o) => {
        const opt = document.createElement('option'); opt.value = opt.textContent = o; sel.appendChild(opt);
    });
    wrap.append(span, sel); ctrlRow.appendChild(wrap);
    wireSettings('s:filterType', 'select', wrap, (s) => {
        span.textContent = s.label || 'Filter-Typ';
        span.style.display = s.labelOn === false ? 'none' : '';
        sel.style.background = s.bg || '';
        sel.style.color = s.fg || '';
        sel.style.fontSize = s.size ? s.size + 'px' : '';
        sel.style.width = s.boxSize ? s.boxSize + 'px' : '';
    }, 'Filter-Typ');
}
{   // Toggle
    const wrap = document.createElement('label'); wrap.className = 'select-field toggle-field';
    const chk = document.createElement('input'); chk.type = 'checkbox'; chk.checked = true;
    const span = document.createElement('span'); span.textContent = 'aktiv';
    wrap.append(chk, span); ctrlRow.appendChild(wrap);
    wireSettings('t:active', 'toggle', wrap, (s) => {
        span.textContent = s.label || 'aktiv';
        wrap.classList.remove('tgl-label-top', 'tgl-label-bottom', 'tgl-label-left', 'tgl-label-right');
        if (s.labelPos) wrap.classList.add('tgl-label-' + s.labelPos);
    }, 'aktiv');
}
{   // Readout
    const out = document.createElement('div'); out.className = 'base-readout';
    ctrlRow.appendChild(out);
    let hz = 110;
    setInterval(() => { hz = 100 + Math.round(Math.sin(Date.now() / 900) * 40); out.textContent = hz + ' Hz'; }, 80);
    wireSettings('u:readout', 'readout', out, (s) => {
        out.style.fontSize = s.fontSize ? s.fontSize + 'px' : '';
        out.style.width = s.boxSize ? s.boxSize + 'px' : '';
        out.style.color = s.fg || '';
    }, 'Readout');
}

// ── Step-Sequenzer ─────────────────────────────────────────────────────────────
// StepSeqUI braucht eine Engine, die ihm sagt, wo der Abspielkopf steht:
// { running, seqPos(which), resetSeq(which) }. Das ist seine einzige Nahtstelle nach
// unten – in teslacoil ist das die TeslaEngine, hier eine Attrappe mit laufendem Kopf.
// Genau diese Naht soll die Werkbank zeigen: wer den Baustein kopiert, muss NUR diese
// drei Dinge liefern, nicht die halbe Engine.
const fakeEngine = {
    running: true,
    _t0: performance.now(),
    seqPos(which) {
        const len = Math.max(1, state.get(which + 'SeqLen') | 0);
        return Math.floor((performance.now() - this._t0) / 250) % len;   // ~4 Steps/s
    },
    resetSeq() { this._t0 = performance.now(); },
};
const seqUI = new StepSeqUI(state, fakeEngine, 'amp');
document.querySelector('#seq').appendChild(seqUI.element);
// Der Render-Loop selbst steht GANZ UNTEN in dieser Datei (nach der Poly-Synth-Initialisierung):
// er ruft sich beim ersten Mal SYNCHRON selbst auf (IIFE), bräuchte also baseKeyboard/
// toneReadout/freqReadout schon an dieser Stelle — die werden aber erst weiter unten gebaut
// (TDZ-Fehler „Cannot access before initialization").

// ── Tasten-Regel: live zeigen, wem die Taste gehört ────────────────────────────
// Der Baustein selbst entscheidet nichts über die Tasten – er BEANTWORTET nur die Frage.
// Genau das macht die Sonde hier sichtbar, statt es zu behaupten.
const verdict = document.querySelector('#verdict');
window.addEventListener('keydown', (e) => {
    const keys = { ' ': 'Space', 'e': "'e'", 'ArrowUp': '↑', 'ArrowDown': '↓', 'ArrowLeft': '←', 'ArrowRight': '→' };
    const name = keys[e.key];
    if (!name) return;
    const kind = targetKind(e.target);
    const arrow = name.length === 1;
    const mine = arrow ? arrowKeyOk(e.target) : globalKeyOk(e.target);
    const tag = (e.target.tagName || 'BODY').toLowerCase() + (e.target.type ? `[${e.target.type}]` : '');
    verdict.innerHTML = `${name} auf &lt;${tag}&gt; = '${kind}'<br>→ <span class="${mine ? 'wb-global' : 'wb-local'}">`
        + `${mine ? 'GLOBAL (Shortcut greift)' : 'LOKAL (Element behält sie)'}</span>`;
});

// ── Takt + Metronom – Neu-Port (P1) + echter Ton (P4) ──────────────────────────
// Der frühere Mount lief über taktgebers eigene ui.js (der „eigene Scheiß"). Jetzt füttert
// EINE deklarative defs-Quelle (lib/taktmetro/defs.js, gemappt aus taktgeber-Manifest +
// Defaults) teslacoils Fabriken via mountGroups — zwei Gruppen, im e-Mode ('e') frei
// verschiebbar. Eigener MiniState mit eigenem localStorage-Key = klare, isolierte Naht.
// P4: die Action-Buttons treiben jetzt die echte Audio-Engine (metro.js/clock.js aus
// taktgeber). onAction(id, phase) — phase ('down'/'up') MUSS durchgereicht werden, sonst
// wirken die Gate-Knöpfe −/+ nicht als gehaltener ASR-Nudge (@dpa 20260720, Punkt C).
const TAKT_LS = 'werkbank_taktmetro';
const taktState = new MiniState(taktMetroDefs().DEFAULTS, TAKT_LS);
const taktRoot = document.querySelector('#taktgeber');
const taktEngine = createTaktEngine(taktState);
// audioInfo: echte Latenz/Samplerate fürs Tab-Sonderfenster (Punkt A). ensureAudio() baut den
// Context (bleibt stumm bis Start) → SR + Basislatenz sind sofort echt, Ausgabelatenz sobald bekannt.
const taktDefs = taktMetroDefs({
    onAction: (id, phase) => taktEngine.onAction(id, phase),
    audioInfo: () => {
        taktEngine.ensureAudio();
        const c = taktEngine.context;
        return c ? { sampleRate: c.sampleRate, baseLatency: c.baseLatency, outputLatency: c.outputLatency, state: c.state } : null;
    },
});
const takt = mountGroups(taktRoot, taktState, taktDefs, {
    instrumentScaled: () => taktInstr.scaled(),
});
// Der Start-Knopf trägt den ON-Zustand (Metronom läuft) → nutzt die „BG an"-Farbe (Task D).
// (recEngine hängt sich hier per _onTaktRunning mit an, sobald es weiter unten existiert —
// onRunning ist ein Einzel-Callback, s. taktmetro/engine.js, deshalb NUR EINE Registrierung.)
let _onTaktRunning = () => {};
taktEngine.onRunning((on) => { takt.setCtrlOn('b:start', on); _onTaktRunning(on); });
// Die Takt-Anzeige leuchtet auf dem laufenden Beat (zeit-ausgerichtet vom Engine).
taktEngine.onBeat((i) => takt.setBeat('u:beatView', i));
// BPM-Anzeige folgt dem Anschieben +/− (@dpa 20260720, Punkt): der ±-Schub wird SICHTBAR, ohne
// den gespeicherten bpm zu ändern. Bias zurück auf 0 → liveBpm == bpm → Anzeige steht wieder original.
taktEngine.onNudge((liveBpm) => takt.setKnobDisplay('bpm', liveBpm));
// Debug/Headless-Test-Haken (wie _selftest.html sein __host): Zugriff auf Engine/State/Host.
window.__takt = { engine: taktEngine, state: taktState, host: takt };

// ── Poly-Synth – Base-Frq + Audio-Osz, Port aus teslacoil (Schritt 1, @dpa 20260721) ──
// Eigener MiniState + eigene deklarative defs-Quelle, gemountet über dieselbe
// GroupHost-Fabrik. Der anfängliche Test-Ton (Übergangslösung, bevor die Voice-Engine
// stand) ist wieder entfernt (@dpa 20260721_203557: „durch die echte Voice-Engine jetzt
// überflüssig") — Base-Frq hört man jetzt direkt über gespielte Noten.
const POLYSYNTH_LS = 'werkbank_polysynth';
const polySynthState = new MiniState(polySynthDefs().DEFAULTS, POLYSYNTH_LS);
const polySynthRoot = document.querySelector('#polysynth');
// [R] ist ein durchschaltbarer Button (@dpa 20260722_004312, Zyklus @dpa 20260722 ddw.md):
// sein Klick fährt die ChordMemory-Methode an (chordMemory wird gleich darunter gebaut — die
// Closure liest die Bindung erst beim Klick, also nach der Zuweisung, kein TDZ-Problem).
const polySynthDefsObj = polySynthDefs({
    onAction: (id) => {
        // Hold ist jetzt ein Button statt einer Checkbox (@dpa 20260722, ddw.md), der
        // Zustand bleibt aber weiterhin der echte polySynthState-Key (kbHold), damit
        // PlayKeyboard/Config-Snapshot unverändert bleiben — nur der Klick flippt ihn hier.
        // ([R]/akReset ist seit @dpa 20260722_194404 ein generischer wechselButton mit
        // eigenem State-Key — braucht keine onAction-Verdrahtung mehr, s. defs.js WECHSEL.)
        if (id === 'kbHold') polySynthState.set('kbHold', !polySynthState.get('kbHold'));
        // Akkord-Transponieren (@dpa 20260722_152438, ddw.md): +/- verschieben den GERADE
        // klingenden Akkord live um einen Halbton (polySynthKeyboard wird weiter unten gebaut
        // — TDZ-sicher wie chordMemory, die Closure liest erst beim Klick).
        else if (id === 'chordUp') polySynthKeyboard.transposeActive(1);
        else if (id === 'chordDown') polySynthKeyboard.transposeActive(-1);
    },
});
const polySynth = mountGroups(polySynthRoot, polySynthState, polySynthDefsObj, {
    instrumentScaled: () => polySynthInstr.scaled(),
});
// BUTTONS hängen (anders als TOGGLES) nicht automatisch am State — b:kbHold muss seinen
// isOn-Zustand explizit nachgezogen bekommen, auch wenn kbHold NICHT per Klick, sondern
// z.B. per Config-/Snapshot-Restore verändert wird.
const syncHoldButton = () => polySynth.setCtrlOn('b:kbHold', !!polySynthState.get('kbHold'));
syncHoldButton();
polySynthState.subscribe((k) => { if (k === 'kbHold' || k === '*') syncHoldButton(); });
const polySynthEngine = createPolySynthEngine(polySynthState);
polySynthEngine.setBpmSource(() => taktState.get('bpm'));   // baseSrc='Tempo' folgt dem Taktmetro-Tempo
// Ändert sich das Takt-BPM, während baseSrc='Tempo' läuft, müssen bereits GEHALTENE Voices
// live nachgezogen werden (@dpa 20260722_155726) — die Anzeige folgt sowieso über den
// Render-Loop, aber ohne diesen Hook bliebe eine gerade klingende Note auf der alten
// Beat-Frequenz stehen, bis sie neu angeschlagen wird.
taktState.subscribe((k) => { if (k === 'bpm' || k === '*') polySynthEngine.notifyTempoChange(); });
// Basis-Tonklassen-Brett (@dpa 20260722_013727: „Quelle Ton: das KB fehlt!") — bei Quelle
// „Ton" bedienbar (wählt baseNote), sonst reine Anzeige, wo die klingende BaseFrq liegt.
// War schon fertig gebaut (BaseKeyboard.js), nur nie gemountet — tickt im selben Render-Loop
// wie seqUI (s. unten).
const baseKeyboard = new BaseKeyboard(polySynthState, () => polySynthEngine.baseFreq());
polySynth.mountInGroup('Base-Frq', baseKeyboard.element, 'u:baseKb');
polySynth.registerCtrlStyle('u:baseKb', 'keyboard', baseKeyboard.element, kbStyle(baseKeyboard.element), 'Ton-Wahl');
// „Besonderer" MIDI-Learn genau wie bei u:playKb (@dpa 20260722_203201: „genauso wie in
// Keyboard/Keyboard" — kein eigener „MIDI lernen"-Button im Panel mehr): im normalen Tasten-/
// MIDI-Overlay auf das Ton-Wahl-Control gelernt, die EINE gelernte Note kalibriert die
// baseMidiOctave (s. BaseKeyboard.calibrateMidiOctave). midiOnly: kein ⌨-Tastenfeld, nur 🎹.
// customBanner: „Bereich" (baseMidiRange) lebt im Lern-Banner statt als eigener Panel-Toggle.
const baseKbBanner = () => {
    const wrap = document.createElement('span'); wrap.className = 'km-b-kbcal';
    const rangeLabel = document.createElement('label'); rangeLabel.className = 'km-b-kbcal-range';
    const range = document.createElement('input'); range.type = 'checkbox';
    range.checked = !!polySynthState.get('baseMidiRange');
    range.addEventListener('change', () => polySynthState.set('baseMidiRange', range.checked));
    rangeLabel.append(range, 'Bereich');
    wrap.append(rangeLabel);
    return wrap;
};
polySynth.keyMidi.register('u:baseKb', baseKeyboard.element, 'Ton-Wahl', () => {}, { midiOnly: true, customBanner: baseKbBanner });
// „Nur eine Note, kein zweiter Druck" — dieselbe Naht wie bei u:playKb (s.u.): die frisch
// gelernte Bindung wird direkt zur Kalibrierung genutzt und sofort wieder gelöscht.
polySynthState.subscribe((k) => {
    if (k !== 'midiBindings') return;
    const b = (polySynthState.get('midiBindings') || {})['u:baseKb'];
    if (!b || b.type !== 'note') return;
    baseKeyboard.calibrateMidiOctave(b.data1);
    const rest = { ...polySynthState.get('midiBindings') };
    delete rest['u:baseKb'];
    polySynthState.set('midiBindings', rest);
});
// Freq-Anzeige (@dpa 20260722_013727: „die Freq Anzeige fehlt auch... geteilt in mehrere
// Control readout und texts: 'Tone', Freq") — zwei eigenständige, einzeln verschiebbare
// Readouts (Control-Sorte `readout`, s. Readout.js) statt einer kombinierten Anzeige.
const toneReadout = new Readout(
    () => midiToName(freqToMidi(polySynthEngine.baseFreq())),
    'Tonklasse + Oktave der aktuell klingenden Base-Frq (z.B. „C-1").',
);
const freqReadout = new Readout(
    () => polySynthEngine.baseFreq().toFixed(1) + ' Hz',
    'Die aktuell klingende Base-Frq in Hz.',
);
polySynth.mountInGroup('Base-Frq', toneReadout.element, 'u:toneReadout');
polySynth.mountInGroup('Base-Frq', freqReadout.element, 'u:freqReadout');
polySynth.registerCtrlStyle('u:toneReadout', 'readout', toneReadout.element, (s) => {
    toneReadout.element.style.fontSize = s.fontSize ? s.fontSize + 'px' : '';
    toneReadout.element.style.width = s.boxSize ? s.boxSize + 'px' : '';
    toneReadout.element.style.color = s.fg || '';
}, 'Tone');
polySynth.registerCtrlStyle('u:freqReadout', 'readout', freqReadout.element, (s) => {
    freqReadout.element.style.fontSize = s.fontSize ? s.fontSize + 'px' : '';
    freqReadout.element.style.width = s.boxSize ? s.boxSize + 'px' : '';
    freqReadout.element.style.color = s.fg || '';
}, 'Freq');
// Base-Frq-Sichtbarkeit je Quelle (@dpa 20260722_042020, ddw.md): Harmonize/Pitchglide/
// Anzeigen sind IMMER sichtbar; Quelle „Ton" ist die einzige, zu der KB+Kammerton gehören
// (Freq/Tempo blenden beide aus); Base-Freq-Knob gehört umgekehrt nur zu Quelle „Freq"
// (Ton nimmt die Note vom KB, Tempo das Tempo — der Knob wäre dort wirkungslos).
const baseHzEl = polySynthRoot.querySelector('[data-ctrl="k:baseHz"]');
const kammertonEl = polySynthRoot.querySelector('[data-ctrl="k:kammerton"]');
const syncBaseFreqVisibility = () => {
    const src = polySynthState.get('baseSrc');
    if (baseHzEl) baseHzEl.style.display = src === 'Freq' ? '' : 'none';
    const tonOnly = src === 'Ton' ? '' : 'none';
    if (kammertonEl) kammertonEl.style.display = tonOnly;
    baseKeyboard.element.style.display = tonOnly;
};
syncBaseFreqVisibility();
polySynthState.subscribe((k) => { if (k === 'baseSrc' || k === '*') syncBaseFreqVisibility(); });
// Osz-Knobs passend zur Engine ein-/ausblenden (@dpa 20260722_013727): Sine-FM zeigt FM, verbirgt
// PW — Square-PW umgekehrt. Die eigentliche Klangfarben-Nachführung gehaltener Töne lebt in
// engine.js (retimbreHeld).
const dutyEl = polySynthRoot.querySelector('[data-ctrl="k:duty"]');
const fmEl = polySynthRoot.querySelector('[data-ctrl="k:fmFeedback"]');
const syncOscKnobVisibility = () => {
    const sine = polySynthState.get('oscEngine') === 'Sine-FM';
    if (dutyEl) dutyEl.style.display = sine ? 'none' : '';
    if (fmEl) fmEl.style.display = sine ? '' : 'none';
};
syncOscKnobVisibility();
polySynthState.subscribe((k) => { if (k === 'oscEngine' || k === '*') syncOscKnobVisibility(); });
// Spiel-Tastatur: echtes u:playKb-Control (@dpa 20260721_203557 — vorher ein loses
// Geschwister-Element neben dem Panel, ohne Rechtsklick-Settings). Strukturell in die
// GroupHost-Gruppe "Keyboard" gehängt (mountInGroup), Optik über dieselbe kbStyle-Anwendung
// wie teslacoils/werkbanks Base-Frq-Keyboard (Größe/Farbe/Tastenabstand).
const polySynthKeyboard = new PlayKeyboard(polySynthState, polySynthEngine);
polySynth.mountInGroup('Keyboard', polySynthKeyboard.element, 'u:playKb');
polySynth.registerCtrlStyle('u:playKb', 'keyboard', polySynthKeyboard.element, kbStyle(polySynthKeyboard.element), 'Keyboard');
// „Besonderer" MIDI-Learn (@dpa 20260722_155726: „nur eine Note eingegeben werden muss,
// statt jede Taste einzeln … im MIDI-learn mode, nicht als extra Button"): im normalen
// Tasten-/MIDI-Overlay (⌨/🎹-Header) auf das Keyboard-Control selbst gelernt — die EINE
// gelernte Note kalibriert kbMidiOffset (s. PlayKeyboard.calibrateMidiOffset), keine
// Notendauer-Auslösung. midiOnly (@dpa 20260722_172315: „Controls die mehr als ein On/Off
// haben bitte aus Tasten learn ausschließen"): kein ⌨-Tastenfeld, nur der 🎹-Teil.
// customBanner (@dpa 20260722_194404: „Midi-Offset/Bereich … sollen in (den speziellen)
// Midilearn fenster"): Offset-Zahl + Bereich-Haken leben jetzt IM Lern-Banner statt als
// eigene Knobs im Keyboard-Panel (defs.js GROUPS.Keyboard hat sie darum nicht mehr).
const playKbBanner = () => {
    const wrap = document.createElement('span'); wrap.className = 'km-b-kbcal';
    const offLabel = document.createElement('span'); offLabel.textContent = 'Offset';
    const off = document.createElement('input');
    off.type = 'number'; off.min = -4; off.max = 4; off.step = 1;
    off.value = polySynthState.get('kbMidiOffset') || 0;
    off.addEventListener('change', () => polySynthState.set('kbMidiOffset', Math.max(-4, Math.min(4, off.valueAsNumber | 0))));
    const rangeLabel = document.createElement('label'); rangeLabel.className = 'km-b-kbcal-range';
    const range = document.createElement('input'); range.type = 'checkbox';
    range.checked = !!polySynthState.get('kbMidiRange');
    range.addEventListener('change', () => polySynthState.set('kbMidiRange', range.checked));
    rangeLabel.append(range, 'Bereich');
    wrap.append(offLabel, off, rangeLabel);
    return wrap;
};
polySynth.keyMidi.register('u:playKb', polySynthKeyboard.element, 'Keyboard', () => {}, { midiOnly: true, customBanner: playKbBanner });
// „Nur eine Note, kein zweiter Druck": Midi.js braucht die ERSTE Note zum Lernen der
// Bindung selbst (die löst noch KEIN activate() aus, s. Midi._handle) — ein zweiter Druck
// bräuchte es sonst erst zum tatsächlichen Auslösen. Wir hören stattdessen direkt auf die
// frisch gelernte Bindung (midiBindings-State) und entfernen sie SOFORT wieder, damit keine
// dauerhafte Notenbindung liegen bleibt — rein optisch bleibt der offene Lern-Banner (kann
// mit ✕ geschlossen werden).
polySynthState.subscribe((k) => {
    if (k !== 'midiBindings') return;
    const b = (polySynthState.get('midiBindings') || {})['u:playKb'];
    if (!b || b.type !== 'note') return;
    polySynthKeyboard.calibrateMidiOffset(b.data1);
    const rest = { ...polySynthState.get('midiBindings') };
    delete rest['u:playKb'];
    polySynthState.set('midiBindings', rest);
});
// Akkord-Speicher: autarker Control NEBEN dem Keyboard (@dpa 20260722_004312) — kommt über
// snapshotChord/gateChordOn/releaseChordGate/onChordChange an den gespielten Akkord, eigene
// Settings (u:speicher). keyMidi mitgegeben (@dpa 20260722_033950): jeder Slot meldet sich
// einzeln zum Tasten-/MIDI-Learn an (u:speicher:<i>), s. ChordMemory.js Kopf-Kommentar.
const chordMemory = new ChordMemory(polySynthState, polySynthKeyboard, polySynth.keyMidi);
polySynth.mountInGroup('Keyboard', chordMemory.element, 'u:speicher');
polySynth.registerCtrlStyle('u:speicher', 'speicher', chordMemory.element, (s) => chordMemory.applyStyle(s), 'Speicher');
// Positions-Nachzügler (@dpa 20260722_013727: „packt nach dem Reload die Tastatur ganz links
// hin, ein kurzer Gang in e-Mode bereinigt das"): applyCtrlPos() lief beim Seitenaufbau schon
// VOR diesen beiden mountInGroup()-Aufrufen (die Gruppe „Keyboard" war zu dem Zeitpunkt also
// schon "freeGroups"-eingefroren, ohne dass playKb/speicher überhaupt existierten) — genau das
// holt ein e-Mode-Besuch nach, weil er freezeGroup() für JEDE Gruppe erneut aufruft. refresh()
// tut exakt das, ohne dass @dpa dafür erst in e-Mode wechseln muss.
polySynth.refresh();
window.__polysynth = { state: polySynthState, host: polySynth, engine: polySynthEngine, keyboard: polySynthKeyboard, memory: chordMemory, baseKeyboard };
// Render-Loop steht GANZ UNTEN in dieser Datei (nach LevelMeter) — ruft sich beim ersten Mal
// SYNCHRON selbst auf (IIFE), bräuchte levelMeter also schon hier (TDZ-Fehler), das aber
// erst weiter unten gebaut wird (s. Kommentar dort, gleiches Muster wie oben bei baseKeyboard).

// ── Rec – eigenes Instrument (@dpa 20260721: „Rec nicht in Poly drin, sondern als Extra
// Instrument") ────────────────────────────────────────────────────────────────────────
// War Teil von taktmetro/defs.js (Gruppe „Aufnahme") — jetzt eigenständig, weil Rec
// „alles Hörbare" abnehmen soll (lib/audioBus.js, gemeinsamer Master), nicht an EIN
// Instrument gebunden. Start/Stop-Sync (Downbeat-Arming) hängt weiterhin am Takt: das
// Taktmetro-Instrument liefert seine rohen Scheduler-Beats über onClockBeat() nach außen.
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
taktEngine.onClockBeat((t, beat) => recEngine.handleClockBeat(t, beat));
// Takt gestoppt, während Rec noch auf den nächsten Downbeat wartete → Arm sofort auflösen
// (@dpa 20260722_013727), statt für immer blinkend hängenzubleiben. Hängt sich an den EINEN
// taktEngine.onRunning-Callback an (s. _onTaktRunning oben, Zeile ~203) statt ihn zu überschreiben.
_onTaktRunning = (on) => { if (!on) recEngine.clockStopped(); };
// Rec-Knopf: ON-Farbe folgt der TATSÄCHLICHEN Aufnahme (nicht dem Klick), Blinken zeigt
// den „armed, wartet auf nächsten Takt-Downbeat"-Zustand (Rec-Instrument-TODO 5).
recEngine.onRecording((on) => rec.setCtrlOn('b:rec', on));
recEngine.onRecArmed((armed) => rec.setCtrlBlink('b:rec', !!armed));
window.__rec = { engine: recEngine, state: recState, host: rec };
// Debug/Test: direkter Zugriff auf den gemeinsamen Audio-Bus (lib/audioBus.js).
window.__audioBus = { getContext: getBusContext, getMaster: getBusMaster, getAnalyser: getBusAnalyser };

// ── LevelMeter – eigenes Instrument (ISM), @dpa 20260722 (ddw.md) ──────────────────────
// "soll dem Level ISM angehören, aber kein Header besitzen und keinen extra BG" — trotzdem
// ein ECHTES GroupHost-Control (mountGroups mit genau einer, leeren Gruppe), damit es wie
// jedes andere Control im e-Mode verschiebbar ist und Rechtsklick-Settings bekommt; Kopf-
// zeile/Hintergrund sind nur weggestylt (css/werkbank.css #levelmeter/.wb-bare).
const LEVELMETER_LS = 'werkbank_levelmeter';
const levelMeterState = new MiniState({}, LEVELMETER_LS);
const levelMeterRoot = document.querySelector('#levelmeter');
const levelMeterHost = mountGroups(levelMeterRoot, levelMeterState, { GROUPS: [{ name: 'Meter' }] });
const levelMeter = new LevelMeter(() => getBusAnalyser());
levelMeterHost.mountInGroup('Meter', levelMeter.element, 'u:meter');
levelMeterHost.registerCtrlStyle('u:meter', 'levelmeter', levelMeter.element, (s) => levelMeter.applyStyle(s), 'Level');
levelMeterHost.refresh();
window.__levelMeter = { state: levelMeterState, host: levelMeterHost, meter: levelMeter };

// Render-Loop: seqUI-Abspielkopf, Base-Frq-Anzeigen (baseKeyboard/Tone-/Freq-Readout) UND
// LevelMeter zeichnen sich nicht von allein — tickt wie in teslacoil.
(function tick() {
    seqUI.tick();
    baseKeyboard.tick(); toneReadout.tick(); freqReadout.tick();
    levelMeter.tick();
    requestAnimationFrame(tick);
})();

// ── P3: Tasten/MIDI-Overlay-Schalter im Header (K5) ─────────────────────────────
// Ein Schalter „neben Helphints" (die Werkbank hat keine Helphints, also in der Topbar):
// an → alles dunkler, über jedem Control seine Tastenbelegung + 🎹, an Ort und Stelle
// änderbar. Aus → normal bedienbar, die Belegungen wirken (Space startet, 1/2 = !/!!, …).
const keyMidi = takt.keyMidi;
// Zwei getrennte Header-Schalter (@dpa 20260719_040136: „zwei buttons, bei einzeln …
// übersichtlicher"): einer für Tasten, einer für MIDI. Jeder zeigt/versteckt seinen Teil
// des Badges über allen Controls.
// Radio-Verhalten (@dpa 20260719_120425: „bitte nur einen von beiden aktivieren"):
// das Einschalten des einen schaltet den anderen aus — wie ein Selector.
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
    document.querySelector('.topbar-right').appendChild(btn);
    return btn;
};
// Jedes Instrument hat sein EIGENES KeyMidi (eigener mountGroups-Aufruf) — der globale
// Header-Schalter muss deshalb BEIDE zugleich schalten (Poly-Synth-Instrument Schritt 1,
// @dpa 20260721: die neuen Base-Frq/Audio-Osz-Controls sollen wie taktgeber lernbar sein).
const keyBtn = mkHeaderToggle('keyedit', '⌨ Tasten', 'Tastenbelegung über allen Controls anzeigen/ändern — nur einer von Tasten/MIDI zugleich', (on) => { keyMidi.setKeyEdit(on); polySynth.keyMidi.setKeyEdit(on); rec.keyMidi.setKeyEdit(on); });
const midiBtn = mkHeaderToggle('midiedit', '🎹 MIDI', 'MIDI-Learn über allen Controls anzeigen/ändern — nur einer von Tasten/MIDI zugleich', (on) => { keyMidi.setMidiEdit(on); polySynth.keyMidi.setMidiEdit(on); rec.keyMidi.setMidiEdit(on); });
keyBtn._radioPeer = midiBtn; midiBtn._radioPeer = keyBtn;

// ── Help Hints (@dpa 20260720): die (editierten bzw. Auslieferungs-)Hilfetexte als Hover-Blase
// über allen Controls; ein Header-Knopf „Hints" neben „MIDI" schaltet sie global an/aus. ──
const hintResolve = (el) => {
    const c = el.closest && el.closest('[data-ctrl]');
    if (c) {
        const id = c.dataset.ctrl;
        // Jedes Instrument hat sein EIGENES hintText im eigenen State (@dpa 20260722_013727:
        // Bugfix — vorher fiel Poly-Synth/Rec immer auf das globale `state` zurück, darum
        // tauchten dort editierte Hilfe-Texte nie als Hover-Blase auf).
        const st = c.closest('#taktgeber') ? taktState
                 : c.closest('#polysynth') ? polySynthState
                 : c.closest('#rec') ? recState
                 : state;
        const own = (st.get('hintText') || {})[id];
        return own || factoryHint(id, 'de') || c.dataset.hint || (el.dataset && el.dataset.hint) || '';
    }
    return (el.dataset && el.dataset.hint) || '';
};
const hintBubble = new HintBubble(hintResolve, { enabled: taktState.get('hintsOn') !== false });
const hintsBtn = mkHeaderToggle('hintsedit', '💬 Hints', 'Hilfe-Blasen bei Maus-Hover für alles an/aus',
    (on) => { hintBubble.enable(on); taktState.set('hintsOn', on); });
if (taktState.get('hintsOn') !== false) hintsBtn.classList.add('active');   // Default: an

// ── Config Export/Import (@dpa 20260720): State-Datei(en) sichern/laden — so kann @dpa mir
// seinen kompletten Werkbank-Zustand (Umbenennungen, Anordnung, Belegungen, Optik) übergeben.
// BUGFIX (@dpa 20260722_172315 entdeckt: exportierte Datei enthielt kein Poly-Synth-Layout):
// hier standen nur die ZWEI ursprünglichen MiniStates (Haupt + Takt/Metronom) — Poly-Synth/
// Rec/LevelMeter/Master-Volume kamen alle SPÄTER dazu und wurden nie ergänzt, darum fehlten
// sie in jedem Export UND beim „Zurücksetzen" (das damit auch nie vollständig zurücksetzte).
const LS_KEYS = ['werkbank_state', 'werkbank_taktmetro', 'werkbank_polysynth', 'werkbank_rec', 'werkbank_levelmeter', 'werkbank_master'];
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
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);   // YYYYMMDDHHMMSS, ohne den Millisekunden-Punkt
    a.href = url; a.download = 'werkbank-config-' + ts + '.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const cfgBtn = document.createElement('button');
cfgBtn.className = 'pb-btn'; cfgBtn.id = 'cfgmenu'; cfgBtn.type = 'button';
cfgBtn.textContent = '⚙ Config'; cfgBtn.title = 'Konfiguration exportieren/importieren (zum Übergeben)';
document.querySelector('.topbar-right').appendChild(cfgBtn);
const fileIn = document.createElement('input'); fileIn.type = 'file'; fileIn.accept = '.json,application/json'; fileIn.style.display = 'none';
document.body.appendChild(fileIn);
fileIn.addEventListener('change', () => {
    const f = fileIn.files && fileIn.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { try { const n = applyConfig(JSON.parse(rd.result)); if (n) location.reload(); else alert('Keine passenden Daten in der Datei.'); } catch (e) { alert('Import fehlgeschlagen: ' + e.message); } };
    rd.readAsText(f); fileIn.value = '';
});
let cfgPop = null;
const closeCfg = () => { if (cfgPop) { cfgPop.remove(); cfgPop = null; document.removeEventListener('mousedown', cfgOutside, true); cfgBtn.classList.remove('active'); } };
const cfgOutside = (e) => { if (cfgPop && !cfgPop.contains(e.target) && e.target !== cfgBtn) closeCfg(); };
cfgBtn.addEventListener('click', () => {
    if (cfgPop) { closeCfg(); return; }
    cfgPop = document.createElement('div'); cfgPop.className = 'cfg-pop';
    const mk = (label, title, fn) => { const b = document.createElement('button'); b.className = 'pb-btn'; b.textContent = label; b.title = title; b.addEventListener('click', () => { fn(); }); return b; };
    cfgPop.append(
        mk('⭳ Export', 'Aktuellen Zustand als .json herunterladen', () => { exportConfig(); closeCfg(); }),
        mk('⭱ Import', 'Zustand aus einer .json laden (Seite lädt neu)', () => { fileIn.click(); }),
        mk('↺ Reset', 'Alles zurücksetzen (localStorage leeren, Seite lädt neu)', () => {
            if (confirm('Wirklich ALLES zurücksetzen? Umbenennungen, Anordnung, Belegungen gehen verloren.')) { LS_KEYS.forEach((k) => localStorage.removeItem(k)); location.reload(); }
        }),
    );
    document.querySelector('.topbar-right').appendChild(cfgPop);
    cfgBtn.classList.add('active');
    setTimeout(() => document.addEventListener('mousedown', cfgOutside, true), 0);
});
window.__cfg = { build: buildConfig, apply: applyConfig };   // Test-/Debug-Haken

// ── Aufnahme-Format (Rec-Instrument-TODO 2, @dpa 20260721): globaler App-Default fürs
// Rec-Ausgabeformat — EIN Wert für alle Aufnahmen, keine Pro-Instanz-Einstellung. Die
// eigentlichen Encoder für MP3 (lamejs) und WAV (PCM-Writer) sind eigene Folge-Schritte
// (TODO 3/4); bis die stehen, speichert dieser Schalter nur die Auswahl in taktState —
// recStart() (engine.js) nimmt bis dahin unverändert immer webm/opus auf. ──
const REC_FORMATS = [
    { v: 'webm', l: 'WebM/Opus' },
    { v: 'mp3', l: 'MP3' },
    { v: 'wav', l: 'WAV' },
];
const recFmtBtn = document.createElement('button');
recFmtBtn.className = 'pb-btn'; recFmtBtn.id = 'recfmtmenu'; recFmtBtn.type = 'button';
recFmtBtn.textContent = '⚙ Rec-Format'; recFmtBtn.title = 'Aufnahme-Ausgabeformat (global, für alle Aufnahmen)';
document.querySelector('.topbar-right').appendChild(recFmtBtn);
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

    // MP3-Unterzeilen (Bitrate + Mono/Stereo, Rec-Instrument-TODO 3) — nur sichtbar bei
    // recFormat==='mp3'. Nur CBR (@dpa-Entscheidung 20260721: VBR fehlt lamejs strukturell,
    // siehe lib/vendor/lame.js); Qualität fest auf 3, kein UI-Feld dafür.
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

    // WAV-Unterzeilen (Samplerate + Bittiefe, Rec-Instrument-TODO 4) — nur sichtbar bei
    // recFormat==='wav'. Resampling linear, kein Dithering (siehe lib/wavEncoder.js).
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

// Die Haupt-Buttons SELBST tasten-/MIDI-zuweisbar (@dpa 20260719_120425): self-Targets —
// kein Badge über dem Button, das Learning erscheint DARUNTER (mit [↵] bei der Taste).
keyMidi.register('hdr:keyedit', keyBtn, '⌨ Tasten', () => keyBtn.click(), { self: true });
keyMidi.register('hdr:midiedit', midiBtn, '🎹 MIDI', () => midiBtn.click(), { self: true });
// Hints + Config ebenso lernbar (@dpa 20260720: „'Hints' und 'Config' kriegen auch tasten und midi learn").
keyMidi.register('hdr:hintsedit', hintsBtn, '💬 Hints', () => hintsBtn.click(), { self: true });
keyMidi.register('hdr:cfgmenu', cfgBtn, '⚙ Config', () => cfgBtn.click(), { self: true });
keyMidi.register('hdr:recfmtmenu', recFmtBtn, '⚙ Rec-Format', () => recFmtBtn.click(), { self: true });
// Globale Verteilung: ein belegter Tastendruck löst sein Control aus (nur außerhalb des
// Overlay-Modus; KeyMidi selbst hält sich von echter Texteingabe fern). Jedes Instrument hat
// sein EIGENES KeyMidi (eigener mountGroups-Aufruf, s.o.) — bisher wurde nur takt.keyMidi
// verteilt, darum feuerten gelernte Tasten auf Poly-Synth-/Rec-Controls (z.B. Akkord-Speicher-
// Slots) nie (@dpa 20260722_155726: "die gesetzten shortcuts funktionieren nicht").
window.addEventListener('keydown', (e) => keyMidi.dispatchKey(e));
window.addEventListener('keydown', (e) => polySynth.keyMidi.dispatchKey(e));
window.addEventListener('keydown', (e) => rec.keyMidi.dispatchKey(e));

// ESC stuft die Funktionsebenen ab (@dpa 20260720, Punkt D): pro ESC eine grobe Ebene, von
// innen nach außen. Fenster mit eigenem ESC (Settings/Farbwähler) + ein laufender Lern-Vorgang
// (Horchen/Banner) fangen ESC vorher per capture ab; GroupHost räumt danach Gruppen-Fenster +
// Auswahl (stopImmediatePropagation). Kommt ESC bis hierher, folgt: (1) Lern-Overlay verlassen
// — über Button-Klick, damit dessen .active synchron bleibt (früher nur MIDI, jetzt auch Tasten,
// löst @dpa 20260719 ab) — dann (2) Anordnen-Modus verlassen.
window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (keyBtn.classList.contains('active') || midiBtn.classList.contains('active')) {
        if (midiBtn.classList.contains('active')) midiBtn.click();
        if (keyBtn.classList.contains('active')) keyBtn.click();
        e.stopImmediatePropagation(); return;
    }
    if (takt.isArranging && takt.isArranging()) { takt.setArranging(false); e.stopImmediatePropagation(); return; }
});

// ── Übergruppe ein-/ausklappen (@dpa 20260718_203341) ──────────────────────────
// Icon links an der Headline; eingeklappt ist der Hauptschirm leer (okay). Zustand im
// eigenen State (überlebt Reload wie alles andere).
const benchTakt = document.querySelector('#bench-taktgeber');
const taktCollapse = document.querySelector('#taktCollapse');
const applyBenchCollapse = () => benchTakt.classList.toggle('bench-collapsed', !!taktState.get('benchCollapsed'));
taktCollapse.addEventListener('click', () => { taktState.set('benchCollapsed', !taktState.get('benchCollapsed')); applyBenchCollapse(); });
applyBenchCollapse();

// ── Instrument-Beschreibung: raus aus dem Body → aufklappbares [?] rechts im Header
//    (@dpa 20260720: „nimmt immer Platz ein"). Die wb-note (summary=Titel + Fließtext)
//    wandert in ein schwebendes Popover, das ein [?] rechts in der Headline öffnet.
//    @dpa 20260721_203557: „das für alle ISM" (bisher nur Takt+Metronom) + im Popover ein
//    Edit-Symbol, das die Hilfe als Markdown editierbar macht (`state.instrHelpMd`
//    überschreibt den mitgelieferten HTML-Text dauerhaft, überlebt den Reload). ─────
function mountBenchHelp(sectionId, state) {
    const section = document.querySelector('#' + sectionId);
    if (!section) return;
    const note = section.querySelector(':scope > .wb-note');
    const h2 = section.querySelector('h2');
    if (!h2) return;
    let defaultBodyHtml = '';
    if (note) {
        const clone = note.cloneNode(true);
        const s = clone.querySelector('summary'); if (s) s.remove();
        defaultBodyHtml = clone.innerHTML.trim();
        note.remove();
    }
    // Titel im Popover = der Instrumenten-Name selbst, direkt editierbar (@dpa 20260722_130710:
    // „auch den Titel editierbar machen … beides, es braucht keine extra Überschrift") — die
    // alte separate <summary>-Überschrift ist raus, statt zwei Titeln (Popover-Caption +
    // Instrumenten-Name) gibt es jetzt nur noch EINEN. Teilt sich den `instrName`-State-Key mit
    // lib/InstrumentSettings.js (Rechtsklick-Kopfzeile → „Name"), also dieselbe Naht, kein
    // zweiter Persistenz-Pfad — hier zusätzlich noch das `.wb-instr-name`-Span direkt
    // nachgezogen, weil InstrumentSettings' eigenes applyName() an dieser Stelle noch nicht
    // gemountet ist (Aufruf-Reihenfolge in werkbank.js: mountBenchHelp vor mountInstrumentSettings).
    const instrNameEl = h2.querySelector('.wb-instr-name');
    const defaultInstrName = instrNameEl ? instrNameEl.textContent.trim() : '';

    // @dpa 20260722_130710 (ddw.md, image-16/17): das Icon soll wie ein „i"-Info-Kreis
    // aussehen statt ein reines "?"-Zeichen (lib/icons.js: 'info'), UND bei Hover die
    // ECHTE Beschreibung zeigen — nicht den generischen title="Beschreibung anzeigen"
    // ("sinnloser Hint"). updateBtnHint() (unten in render()) hält den Hover-Text mit dem
    // jeweils aktuellen Beschreibungstext synchron (auch nach dem Markdown-Editieren).
    const btn = document.createElement('button');
    btn.className = 'wb-help-btn'; btn.type = 'button';
    btn.appendChild(icon('info', 14));
    h2.appendChild(btn);
    /** Hover-Hint des [?]-Buttons auf den AKTUELLEN Beschreibungstext ziehen (Klartext, kein
     *  Markdown/HTML — die Blase zeigt textContent, s. HintBubble.js). */
    function updateBtnHint() {
        const md = state.get('instrHelpMd');
        const html = md ? mdToHtml(md) : defaultBodyHtml;
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
        // Klick in Werteingaben selektiert immer den gesamten Inhalt (Music-weit, s. Memory).
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
            ta.value = state.get('instrHelpMd') || htmlToMdApprox(defaultBodyHtml);
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
            body.innerHTML = md ? mdToHtml(md) : defaultBodyHtml;
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
}
mountBenchHelp('bench-taktgeber', taktState);
mountBenchHelp('bench-polysynth', polySynthState);
mountBenchHelp('bench-rec', recState);

// ── Instrument-Settings, generalisiert (@dpa 20260721: „Instrument allgemein: mit eigen
// Einstellungen, erstmal gleich wie Gruppen") + Verschieben via Header ──────────────────
// lib/InstrumentSettings.js ersetzt den früheren Einzelbau (nur für taktgeber): BG-Farbe +
// Größe % wie bei Gruppen, dazu Drag am Header. Jedes Instrument bekommt das jetzt gleich.
const taktInstr = mountInstrumentSettings(benchTakt, taktState, { bodySelector: '#taktgeber' });
const polySynthInstr = mountInstrumentSettings(document.querySelector('#bench-polysynth'), polySynthState, { bodySelector: '#polysynth' });
const recInstr = mountInstrumentSettings(document.querySelector('#bench-rec'), recState, { bodySelector: '#rec' });

// „Zurücksetzen"-Knopf entfernt (@dpa 20260719_040136). Reset weiterhin über die Konsole:
//   MiniState.reset(); MiniState.reset('werkbank_taktmetro'); location.reload();

/**
 * werkbank-leer.js – baut werkbank-leer/index.html auf (URL /werkbank-leer): der ZWEITE,
 * schlankere Pool-Einstieg neben werkbank.js/index.html (@dpa 20260801, vorab durchgeplant).
 *
 * Liegt seit @dpa dd.md 20260801_3 in einem EIGENEN ORDNER (saubere URL ohne .html, Dateien
 * eines Projekts beisammen). Die geteilten lib/+css/ liegen daher eine Ebene höher (../).
 * Achtung: Unterordner trennen KEINE Daten – localStorage hängt am Origin (Port), nicht am
 * Pfad. Die Trennung macht allein data-app/lsKey (s.u.).
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
 * EIGENER State, eigene Demo-Datei (@dpa dd.md 20260801_2): alle localStorage-Keys tragen
 * das Präfix dieses Einstiegs (werkbank-leer_*, aus <html data-app>, s. lib/appId.js), der
 * Erstbesuch-Stand kommt aus presets/werkbank-leer-config.json. BIS DAHIN teilte sich
 * dieser Einstieg seine Keys mit index.html — das war gewollt, solange alle Pool-Einstiege
 * ohnehin in einem Datentopf lagen (gleicher Port = gleicher localStorage), hieß aber auch:
 * ein Demo-Export von hier bestimmte den Erstbesuch von index.html gleich mit. Jetzt hat
 * jede HTML ihre eigene Ansicht + Grundeinstellung, auch künftige Kopien dieser Datei.
 * index.html/werkbank.js selbst bleiben UNANGETASTET (deren Keys heißen unverändert
 * werkbank_*, weil 'werkbank' der Default von data-app ist — keine Migration nötig).
 */
import { APP, lsKey } from '../lib/appId.js';
import { MiniState } from '../lib/MiniState.js';
import { mountInstrumentSettings } from '../lib/InstrumentSettings.js';
import { HintBubble } from '../lib/HintBubble.js';
import { createMasterVolume, masterVolumeDefaults } from '../lib/MasterVolume.js';
import { factoryHint } from '../lib/hints.js';
import { hint, text as i18nText, setLang, lang as curLang } from '../lib/i18n.js';
import { SettingsWindow } from '../lib/SettingsWindow.js';
import { buildMainSettings } from '../lib/mainSettings.js';
import { openNewEntryFlow, isOutsourceMode } from '../lib/newEntryFlow.js';
import { makeConfigIO } from '../lib/configIO.js';
import { wireGlobalLook } from '../lib/globalLook.js';
import { installSelectOnFocus } from '../lib/selectOnFocus.js';
import { mountGroups } from '../lib/group/GroupHost.js';
import { createEnsembleStore, mountEnsembleMenu } from '../lib/EnsembleStore.js';
import { ElementSettings } from '../lib/ElementSettings.js';
import { makeWireHeaderBtnSettings, makeHeaderToggle } from '../lib/headerBtn.js';
import { mountTaktMetro } from '../lib/taktmetro/mount.js';
import { recInstrumentDefs } from '../lib/recInstrument/defs.js';
import { createRecEngine } from '../lib/recInstrument/engine.js';
import { debugPanelDefs } from '../lib/debugPanel/defs.js';
import { DebugPanel } from '../lib/debugPanel/DebugPanel.js';
import { mountDebugGroup } from '../lib/debugPanel/mount.js';
import {
    getContext as getBusContext, getMaster as getBusMaster, getAnalyser as getBusAnalyser,
    getLimiter as getBusLimiter, getWaveshaper as getBusWaveshaper, setMasterDb as setBusMasterDb,
} from '../lib/audioBus.js';
import { createRoutingRegistry, bindPorts } from '../lib/routing/Registry.js';
import { createStructureView } from '../lib/routing/StructureView.js';
import { LevelMeter } from '../lib/LevelMeter.js';
import { createScopeManager, createScopeSettingsHook } from '../lib/scope/multiScope.js';
import { icon } from '../lib/icons.js';
import { mountBenchHelp } from '../lib/benchHelp.js';

// Erstbesuch-Demo-Stand (presets/default-config.json) abwarten, BEVOR der erste
// MiniState den localStorage liest (s. werkbank.js-Vorbild, @dpa 20260725: „man muss die
// config hinzu speichern.. sonst klingt alles nichts").
await (window.__defaultConfigReady || Promise.resolve());

// Globaler Fallback-State: von hintResolve() weiter unten genutzt, wenn ein Control zu
// keinem der eigenen Instrumenten-States gehört.
const state = new MiniState({}, lsKey('state'));
setLang(state.get('lang') || 'de');
wireGlobalLook(state);
installSelectOnFocus();

// ── "+ Neu"-Karte (@dpa ddw.md 20260803-Rebuild, s. lib/newEntryFlow.js-Kopf + index.html-
// Kommentar an der Karte): ruft denselben Ablauf wie der kleine Knopf in den Einstellungen
// auf — EINE Logik, zwei Auslöser. Kein eigener State/keine defs — bewusst kein ISM/Control.
//
// NUR im Original werkbank-leer sichtbar (@dpa ddw.md 20260803_122138 Punkt 3: "die zentrale
// mittige NEU auf dem Panel NUR in WB-leer"). tools/new-entry.mjs kopiert index.html
// VERBATIM (samt Karten-Markup) in jeden neuen Klon — diese Datei hier wird dabei zu
// <slug>.js umbenannt, LÄUFT ALSO AUCH IM KLON.
//
// BUGFIX (mit Playwright gefunden, s. test/newEntryFlow_smoke.py Punkt 8): ein direkter
// String-Vergleich `APP === 'werkbank-leer'` HIER wäre falsch — new-entry.mjs schreibt beim
// Kopieren JEDES Vorkommen von `sourceSlug` (Default exakt der String "werkbank-leer") in
// DIESER Datei blind auf den neuen Slug um (`js.split(sourceSlug).join(slug)`, s. dortiger
// Kopf). Ein hier stehendes `'werkbank-leer'`-Literal würde also im Klon MIT umgeschrieben
// (z.B. zu `'debug-inspect-clone'`) und der Vergleich wäre im Klon fälschlich IMMER wahr.
// `isOutsourceMode()` (lib/newEntryFlow.js) ist deshalb die einzig sichere Quelle: lib/ wird
// beim Klonen NICHT angefasst, der Vergleich bleibt unverändert in jeder Kopie korrekt.
const newEntryCard = document.querySelector('#newEntryCard');
if (newEntryCard) {
    if (!isOutsourceMode()) {
        newEntryCard.addEventListener('click', (e) => openNewEntryFlow(e.currentTarget));
        // Karte ausblenden, solange das "Neues Projekt starten"-Fenster offen ist (@dpa
        // ddw.md 20260803_135251 Punkt 3: "in dem zweiten Fenster ... ist unten noch immer
        // das +Neu Fenster ... das kann weg"). newEntryFlow.js kennt die Karte NICHT direkt
        // (dieselbe Datei bedient auch den kleinen "+ Neu"-Knopf im Einstellungs-Fenster, der
        // keine Karte hat) — sie meldet Öffnen/Schließen stattdessen generisch per Event.
        // `placeNewEntryCard` ist eine gehoistete Funktionsdeklaration (steht syntaktisch
        // weiter unten in dieser Datei) — im Modul-Scope schon hier gültig aufrufbar.
        window.addEventListener('werkbank:new-entry-flow', (e) => {
            newEntryCard.hidden = !!(e.detail && e.detail.open);
            if (!newEntryCard.hidden) placeNewEntryCard();
        });
    } else {
        newEntryCard.remove();
    }
}

// ── Header-Button-Settings (1:1 aus werkbank.js — instrumentunabhängig, generisch) ─────
const hdrElemSettings = new ElementSettings(state);
hdrElemSettings.onApply = (id, style) => {
    const cur = { ...(state.get('ctrlStyles') || {}) };
    if (style && Object.keys(style).length) cur[id] = style; else delete cur[id];
    state.set('ctrlStyles', cur);
};
// wireHeaderBtnSettings() selbst kommt seit @dpa 20260804 aus lib/headerBtn.js (war bis auf
// Kommentare byte-identisch dreifach dupliziert — dasselbe Duplikat-Risiko wie bei
// ADSR/Scope/mountBenchHelp, s. lib/adsrPanel.js-Kommentar).
const wireHeaderBtnSettings = makeWireHeaderBtnSettings({ hdrElemSettings, state });

// ── Master Volume (1:1 aus werkbank.js) ────────────────────────────────────────────────
const MASTER_LS = lsKey('master');
const masterState = new MiniState(masterVolumeDefaults, MASTER_LS);
const masterVolume = createMasterVolume(masterState);
document.querySelector('#master-vol').appendChild(masterVolume.element);
window.__master = { state: masterState, volume: masterVolume };

// ── Routing-Registry (1:1 aus werkbank.js) ─────────────────────────────────────────────
const routing = createRoutingRegistry();
window.__routing = { reg: routing };

// ── Master-Bus-Output (1:1 aus werkbank.js, ddw.md 20260802 „Ein-/Ausgänge-Kette", Wave 1)
// EIN Output-Tap auf den geteilten Analyser aus audioBus.js — hängt dort automatisch nach
// Limiter/Fader um (s. audioBus.js setLimiterOn()), read() liefert einen billigen linearen
// Peak (0..1) als frame-Fallback, hasNode/node erlauben die genaue "sample"-Kurve am Scope.
let _masterPeakBuf = null;
routing.registerModule('master', {
    label: 'Master',
    outputs: {
        out: {
            type: 'Value', label: 'Output',
            read: () => {
                const a = getBusAnalyser();
                if (!a) return 0;
                if (!_masterPeakBuf || _masterPeakBuf.length !== a.fftSize) _masterPeakBuf = new Float32Array(a.fftSize);
                a.getFloatTimeDomainData(_masterPeakBuf);
                let peak = 0;
                for (let i = 0; i < _masterPeakBuf.length; i++) { const v = Math.abs(_masterPeakBuf[i]); if (v > peak) peak = v; }
                return peak;
            },
            hasNode: true, node: () => getBusAnalyser(),
        },
    },
    inputs: {},
});

// ── Takt + Metronom — dedupliziert in lib/taktmetro/mount.js (@dpa 20260804, Takt gilt
// fürs ganze Ensemble = Singleton, anders als Rec/LevelMeter, die erst ihr Manager-Pattern
// brauchen, s. mount.js-Kopf). Kein onExtraAction hier — Stepseq gibt es in werkbank-leer
// nicht. -----------------------------------------------------------------------------
const taktMount = mountTaktMetro({ routing, instrumentScaledGetter: () => taktInstr.scaled() });
const { taktState, taktEngine, taktDefs, taktRoot, takt, taktOpts, taktLsKey: TAKT_LS } = taktMount;

// ── Rec – eigenes Instrument (1:1 aus werkbank.js Z.729-793, minus Stepseq-Fanout) ─────
const REC_LS = lsKey('rec');
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
taktMount.setOnRunningExtra((on) => { if (!on) recEngine.clockStopped(); });
recEngine.onRecording((on) => rec.setCtrlOn('b:rec', on));
recEngine.onRecArmed((armed) => rec.setCtrlBlink('b:rec', !!armed));
window.__rec = { engine: recEngine, state: recState, host: rec };
routing.registerModule('rec', {
    label: 'Rec', latency: recEngine.latency,
    ...bindPorts(recDefs.ports, { inputs: { clock: { write: () => {} } } }),
});
routing.connect({ module: 'takt', port: 'beat' }, { module: 'rec', port: 'clock' }, { active: false });
// Debug/Test: direkter Zugriff auf den gemeinsamen Audio-Bus (lib/audioBus.js).
window.__audioBus = {
    getContext: getBusContext, getMaster: getBusMaster, getAnalyser: getBusAnalyser,
    getLimiter: getBusLimiter, getWaveshaper: getBusWaveshaper,
};

// ── LevelMeter – eigenes Instrument (ISM), 1:1 aus werkbank.js Z.798-812 ───────────────
const LEVELMETER_LS = lsKey('levelmeter');
const levelMeterState = new MiniState({}, LEVELMETER_LS);
const levelMeterRoot = document.querySelector('#levelmeter');
const levelMeterHost = mountGroups(levelMeterRoot, levelMeterState, { GROUPS: [{ name: 'Meter' }] });
const levelMeter = new LevelMeter(() => getBusAnalyser(), () => getBusLimiter());
levelMeterHost.mountInGroup('Meter', levelMeter.element, 'u:meter');
hint(levelMeter.element, 'Ausgangspegel des gesamten Ensembles (dBFS, Peak-Hold).');
levelMeterHost.registerCtrlStyle('u:meter', 'levelmeter', levelMeter.element, (s) => levelMeter.applyStyle(s), 'Level');
levelMeterHost.refresh();
// ISM-Settings + Sichtbarkeits-Toggle (ddw.md 20260803_135251) — LevelMeter hat KEINEN h2
// (bewusst „kein Header", s. Kommentar oben), darum defaultName explizit mitgeben (sonst
// bliebe der Name in der Haupt-Settings-Liste leer, s. lib/InstrumentSettings.js-Kopf).
const levelMeterInstr = mountInstrumentSettings(document.querySelector('#bench-levelmeter'), levelMeterState, { defaultName: 'Meter' });
window.__levelMeter = { state: levelMeterState, host: levelMeterHost, meter: levelMeter, instr: levelMeterInstr };

// ── Signal-Scopes – eigenes ISM, 1:1 aus werkbank.js Z.814-937 ─────────────────────────
const SCOPE_LS = lsKey('scope');
const scopeState = new MiniState({ scopeCount: 1 }, SCOPE_LS);
const scopeRoot = document.querySelector('#scopes');
const scopeDefs = { GROUPS: [] };
const scopeHost = mountGroups(scopeRoot, scopeState, scopeDefs, {
    groupKindSettings: (kind) => _scopeKindSettings[kind],
});
const scopeManager = createScopeManager({ host: scopeHost, state: scopeState, defs: scopeDefs, routing });
scopeManager.init();
const scopeInstr = mountInstrumentSettings(document.querySelector('#bench-scope'), scopeState, { defaultName: 'Signal-Scopes' });

// Gruppen-Rechtsklick-Panel der Scope-Gruppe (@dpa ddw.md 20260802 Punkt 3, 1:1 aus
// overcord/werkbank.js): NUR noch die Instanz-AKTIONEN (Kopie/Löschen/Puffer zurücksetzen)
// — Buffer/Breite/Höhe/min/max/Auto-Range/Meter/Kurve/Genauigkeit sind umgezogen ins
// Scope-EIGENE Rechtsklick-Settings (ElementSettings.js, `_fieldsFor('scope')`), damit
// „Scope-Settings" und „Scope-Gruppen-Settings" sich nicht mehr überlappen.
// Settings-Hook kommt seit @dpa 20260804 aus lib/scope/multiScope.js (createScopeSettingsHook)
// statt hier dupliziert zu stehen — war byte-identisch in overcord/werkbank-leer/pitchosc
// (dasselbe Duplikat-Risiko wie bei ADSR, s. lib/adsrPanel.js-Kommentar).
const _scopeKindSettings = {
    Scope: createScopeSettingsHook({ scopeManager, state: scopeState, host: scopeHost }),
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
window.__scope.instr = scopeInstr;   // wie __takt/__rec/__levelMeter (Konsistenz + Test-Haken)

// ── Debug – eigenes Instrument (@dpa ddw.md 20260802: „bei teslacoil die debug Gruppe..
// die will ich auch in beiden, werkbank-leer und overcord") ────────────────────────────
// Bündelt Audio (WAV, 2 Slots a/b) + Screenshot (PNG, alle sichtbaren Canvas gestapelt) +
// Zustand (voller Config-Dump, s.u. buildConfig) + Begleit-Prompt zu Dateien — zum
// Hochladen an eine KI. KEIN Sound-Parameter (s. lib/debugPanel/DebugPanel.js-Kopf):
// debugName/debugPrompt hängen an einem eigenen Optik-Key (debugMeta), nicht an
// data-ctrl-Werten — darum auch bewusst NICHT im ensembleStore weiter unten (wie
// Master-Volume: kein Sound-Snapshot-Teilnehmer). `getFullState` reicht den fertigen
// Config-Export dieser Seite durch (buildConfig() ist weiter unten deklariert — als
// `function` gehoisted, hier als LAZY-Closure unproblematisch, da erst beim tatsächlichen
// „Debug speichern"-Klick ausgewertet).
const DEBUG_LS = lsKey('debug');
const debugState = new MiniState(debugPanelDefs().DEFAULTS, DEBUG_LS);
const debugRoot = document.querySelector('#debug');
const dbg = new DebugPanel(debugState, { appPrefix: APP, getFullState: () => buildConfig() });
const debugDefs = debugPanelDefs({ onAction: (id) => dbg.onAction(id) });
const debugHost = mountGroups(debugRoot, debugState, debugDefs, {});
mountDebugGroup(debugHost, debugState, dbg);
const debugInstr = mountInstrumentSettings(document.querySelector('#bench-debug'), debugState, { bodySelector: '#debug', host: debugHost });
window.__debug = { state: debugState, host: debugHost, panel: dbg };
window.__debug.instr = debugInstr;   // wie __takt/__rec/__levelMeter (Konsistenz + Test-Haken)

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
// mkHeaderToggle() selbst (reine Button-Mechanik) kommt seit @dpa 20260804 aus
// lib/headerBtn.js (war byte-identisch dreifach dupliziert). Die Host-Listen der einzelnen
// Buttons (s.u.) bleiben bewusst hier — s. headerBtn.js-Kommentar zu makeHeaderToggle().
const mkHeaderToggle = makeHeaderToggle(wireHeaderBtnSettings);
const keyBtn = mkHeaderToggle('keyedit', '⌨ Tasten', 'Tastenbelegung über allen Controls anzeigen/ändern — nur einer von Tasten/MIDI zugleich', (on) => {
    keyMidi.setKeyEdit(on); rec.keyMidi.setKeyEdit(on); levelMeterHost.keyMidi.setKeyEdit(on); scopeHost.keyMidi.setKeyEdit(on); debugHost.keyMidi.setKeyEdit(on);
});
const midiBtn = mkHeaderToggle('midiedit', '🎹 MIDI', 'MIDI-Learn über allen Controls anzeigen/ändern — nur einer von Tasten/MIDI zugleich', (on) => {
    keyMidi.setMidiEdit(on); rec.keyMidi.setMidiEdit(on); levelMeterHost.keyMidi.setMidiEdit(on); scopeHost.keyMidi.setMidiEdit(on); debugHost.keyMidi.setMidiEdit(on);
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
                 : c.closest('#debug') ? debugState
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

// ── e-Mode-Header-Knopf (@dpa ddw.md 20260802 Punkt 6, 1:1 aus overcord/werkbank.js):
// löst denselben Pfad wie die Taste 'e' aus (ein echtes Tastendruck-Event, s. dortiger
// Kommentar) statt jeden Host einzeln zu setArranging() zu zwingen. `takt` als
// repräsentativer Host für den Knopf-Zustand.
const arrangeBtn = mkHeaderToggle('arrangemode', '⇄ Anordnen',
    'Anordnen-Modus (Taste e) — Gruppen/Controls frei verschiebbar', (on) => {
        if (!!on !== !!takt.isArranging()) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true, cancelable: true }));
    });
taktOpts.onArrangeChange = (on) => arrangeBtn.classList.toggle('active', !!on);
if (takt.isArranging()) arrangeBtn.classList.add('active');

// ── Config Export/Import (1:1-Muster aus werkbank.js Z.1018-1029) ─────────────────────
// LS_KEYS enthält 'scope' von Anfang an (@dpa-Auftrag: fehlt in index.html/werkbank.js
// als Bug — hier von Anfang an korrekt, kein drittes Mal denselben Fehler).
// Die Keys tragen das Präfix DIESES Einstiegs (lsKey, s. lib/appId.js) — ein Export von
// hier fasst also nur werkbank-leer-Daten an, nicht die von index.html.
const LS_KEYS = ['state', 'taktmetro', 'rec', 'levelmeter', 'master', 'ensemble', 'scope', 'debug'].map(lsKey);

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
const ENSEMBLE_LS = lsKey('ensemble');
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
// buildConfig/applyConfig/exportConfig/backups kommen seit @dpa 20260804 aus
// lib/configIO.js (war byte-identisch dreifach dupliziert — dasselbe Duplikat-Risiko wie
// bei ADSR/Scope/mountBenchHelp/headerBtn, s. lib/adsrPanel.js-Kommentar). NUR `LS_KEYS`
// bleibt bewusst lokal/vollständig gepflegt — s. configIO.js-Kopf.
const { buildConfig, applyConfig, exportConfig, doReset, backups } = makeConfigIO(LS_KEYS, APP);
// Kein festes Icon mehr (@dpa 20260803: „Settings hat einen eingebauten '⚙︎' Icon, was ich
// nicht beeinflussen kann — weg mit diesem Icon, ich habe ja 🛠️", 1:1-Fix aus werkbank.js) —
// nur noch der Text-Span, frei über die Rechtsklick-Optik (ctrlStyles hdr:cfgmenu) bestimmbar.
const cfgBtn = document.createElement('button');
cfgBtn.className = 'pb-btn hdr-btn-ico'; cfgBtn.id = 'cfgmenu'; cfgBtn.type = 'button';
const cfgBtnText = document.createElement('span'); cfgBtnText.className = 'hdr-btn-text';
i18nText(cfgBtnText, 'Einstellungen');
cfgBtn.appendChild(cfgBtnText);
hint(cfgBtn, 'Einstellungen für die ganze Werkbank (Sprache, Darstellung, Daten)');
document.querySelector('.topbar-right').appendChild(wireHeaderBtnSettings('hdr:cfgmenu', cfgBtn, 'Einstellungen'));
const fileIn = document.createElement('input'); fileIn.type = 'file'; fileIn.accept = '.json,application/json'; fileIn.style.display = 'none';
document.body.appendChild(fileIn);
fileIn.addEventListener('change', () => {
    const f = fileIn.files && fileIn.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { try { const n = applyConfig(JSON.parse(rd.result)); if (n) location.reload(); else alert('Keine passenden Daten in der Datei.'); } catch (e) { alert('Import fehlgeschlagen: ' + e.message); } };
    rd.readAsText(f); fileIn.value = '';
});
// doReset kommt jetzt ebenfalls aus makeConfigIO() oben.
// ⚙ = echtes Einstellungs-Fenster (1:1-Muster aus werkbank.js, @dpa dd.md 20260802).
// Der INHALT kommt aus lib/mainSettings.js — identisch für alle Pool-Einstiege; hier steht
// nur, was diesem Einstieg gehört: sein state und seine Daten-Aktionen (eigene LS_KEYS).
const cfgWin = new SettingsWindow('Einstellungen');
const openCfg = () => {
    cfgBtn.classList.add('active');
    cfgWin.open((f) => buildMainSettings(f, {
        state,
        onExport: () => exportConfig(),
        onImport: () => fileIn.click(),
        onReset: doReset,
        onNewEntry: (btn) => openNewEntryFlow(btn),
        reopen: () => { cfgWin.close(); openCfg(); },
        backups,
        // Aufnahme-Format (ddw.md 20260803_135251 Punkt B): aus dem Header hierher
        // umgezogen, s. Kommentar bei der alten Stelle weiter oben.
        recState,
        // ISM-Sichtbarkeit (ddw.md 20260803_135251): die fünf „Standard"-ISMs dieses
        // Einstiegs — mainSettings.js zeigt daraus die Unterrubrik der ausgeblendeten.
        isms: [
            { name: 'Tempo & MM', instr: taktInstr },
            { name: 'Scope', instr: scopeInstr },
            { name: 'Debug', instr: debugInstr },
            { name: 'Rec', instr: recInstr },
            // noHeader: LevelMeter hat kein h2 (kein Rechtsklick-Weg möglich) — mainSettings.js
            // listet es darum IMMER hier, nicht nur wenn schon ausgeblendet (ddw.md 20260803).
            { name: 'Meter', instr: levelMeterInstr, noHeader: true },
        ],
    }), () => cfgBtn.classList.remove('active'));
};
cfgBtn.addEventListener('click', () => { cfgWin.isOpen ? cfgWin.close() : openCfg(); });
window.__cfg = { build: buildConfig, apply: applyConfig };   // Test-/Debug-Haken

// mountEnsembleMenu() kommt seit @dpa 20260804 aus lib/EnsembleStore.js (war bis auf
// Kommentare byte-identisch dreifach dupliziert — dasselbe Duplikat-Risiko wie bei
// ADSR/Scope/mountBenchHelp/headerBtn/configIO, s. lib/adsrPanel.js-Kommentar). Kommt genau
// EINMAL pro Ensemble vor (Header-Chrome, nicht vervielfältigbar wie ADSR/Scope).
const ensembleMenu = mountEnsembleMenu({ ensembleStore, ensembleState, hdrElemSettings, state });
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

// Aufnahme-Format ist ddw.md 20260803_135251 Punkt B aus dem Header IN die Haupt-Settings
// umgezogen (⚙ Einstellungen → „Aufnahme-Format") — s. Kommentar an derselben Stelle in
// overcord/werkbank.js für den vollen Hintergrund. State-Keys unverändert (recState).

// Header-Buttons selbst tasten-/MIDI-zuweisbar (1:1 aus werkbank.js Z.1341-1348)
keyMidi.register('hdr:keyedit', keyBtn, '⌨ Tasten', () => keyBtn.click(), { self: true });
keyMidi.register('hdr:midiedit', midiBtn, '🎹 MIDI', () => midiBtn.click(), { self: true });
keyMidi.register('hdr:hintsedit', hintsBtn, '💬 Hints', () => hintsBtn.click(), { self: true });
keyMidi.register('hdr:arrangemode', arrangeBtn, '⇄ Anordnen', () => arrangeBtn.click(), { self: true });
// Lim (1:1 aus overcord/werkbank.js, ddw.md 20260802 Punkt 7). WS hat kein eigenes Learn
// mehr — s. Kommentar dort (ddw.md 20260802_234615 Punkt 1, WS zog ins Lim-Popover).
keyMidi.register('hdr:limbtn', masterVolume.limBtn, 'Lim', () => masterVolume.limBtn.click(), { self: true });
keyMidi.register('hdr:cfgmenu', cfgBtn, 'Einstellungen', () => cfgBtn.click(), { self: true });
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
// mountBenchHelp() selbst kommt seit @dpa 20260804 aus lib/benchHelp.js (war byte-
// identisch dreifach dupliziert in overcord/werkbank-leer/pitchosc — dasselbe Duplikat-
// Risiko wie bei ADSR/Scope, s. lib/adsrPanel.js-Kommentar) — hier nur noch die EN-
// Übersetzungstabelle (pro Datei unterschiedlich) + die Aufrufe.
mountBenchHelp('bench-taktgeber', taktState, BENCH_HELP_EN);
mountBenchHelp('bench-rec', recState, BENCH_HELP_EN);

// ── Instrument-Settings, generalisiert (1:1 aus werkbank.js Z.1544-1566) ──────────────
const taktInstr = mountInstrumentSettings(benchTakt, taktState, { bodySelector: '#taktgeber', host: takt });
const recInstr = mountInstrumentSettings(document.querySelector('#bench-rec'), recState, { bodySelector: '#rec', host: rec });
window.__takt.instr = taktInstr;
window.__rec.instr = recInstr;

// ── "+ Neu"-Karte positionieren (@dpa ddw.md 20260803_122138 Punkt 1, NEU gebaut ddw.md
// 20260803_135251 Punkt 1: "jetzt ist es ganz unten, versteckt" — der ERSTE Fix vermied nur
// Überlappung, landete dabei aber am Ende des Dokumentflusses, weit UNTER dem sichtbaren
// Fensterausschnitt, s. ddw/image-13.png). MUSS weiterhin nach den mountInstrumentSettings()-
// Aufrufen oben laufen: die wenden `instrPos` an (s. lib/InstrumentSettings.js `applyPos()`)
// und setzen dabei `position:absolute` + `left`/`top` auf JEDES der vier Instrumente — das
// kann aus dem gezogenen Zustand von @dpa kommen ODER schon aus der mitgelieferten Demo
// (presets/werkbank-leer-config.json trägt für alle vier ISMs bereits eigene instrPos-Werte).
//
// Neuer Ansatz: statt "unterhalb aller Instrumente" wird die GRÖSSTE zusammenhängende freie
// Rechteck-Fläche INNERHALB des gerade sichtbaren Fensterausschnitts gesucht (`window.
// innerHeight`, NICHT die Dokumentgesamthöhe, @dpa-Auftrag) — Vorbild ddw/image-13 Kopie.png
// ("hier hin", mittig zwischen den bestehenden Instrumenten). Klassisches "größtes freies
// Rechteck unter Hindernissen"-Problem, hier per Brute-Force über die Kandidaten-Koordinaten
// der Hindernis-Kanten gelöst (kein externes Paket nötig — bei üblicherweise < 10 Instrumenten
// trivial schnell, läuft nur bei Laden/Resize/Popup-Schließen, nicht pro Frame).
//
// Koordinatenbasis: `offsetTop`/`offsetLeft`/`offsetWidth`/`offsetHeight` der Instrumente
// (wie zuvor — dieselbe Basis, die `instrPos` selbst benutzt, robust gegen den `transform`
// der Karte). Um daraus den GERADE SICHTBAREN Ausschnitt zu bestimmen, wird EINMAL
// `#app.getBoundingClientRect()` gemessen (aktuelle Lage von #app zum Browser-Fenster,
// ändert sich mit jedem Scroll) und daraus der sichtbare Bereich in #app-lokale Koordinaten
// zurückgerechnet — kein zweites, inkonsistentes Koordinatensystem.
//
// Fallback (@dpa-Auftrag: "sinnvoll degradieren statt zu überlappen"): reicht die größte freie
// Fläche nicht für die Karte in normaler Breite, wird die Karte auf die tatsächlich freie
// Breite/Höhe VERKLEINERT (nötigenfalls mit eigenem Scrollbalken) statt über ein Instrument zu
// ragen. Nur wenn der sichtbare Ausschnitt de facto GAR keine freie Fläche mehr hat (extrem
// kleines Fenster + viele große Instrumente gleichzeitig — praktisch kaum erreichbar), fällt
// die Funktion auf die alte Notlösung zurück (unterhalb aller Instrumente im Dokumentfluss,
// erfordert dann wieder Scrollen) — besser als irgendwo hinein zu überlappen.
function placeNewEntryCard() {
    if (!newEntryCard || !newEntryCard.isConnected || newEntryCard.hidden) return;
    const appEl = document.querySelector('#app');
    if (!appEl) return;

    // Sichtbaren Ausschnitt von #app in #app-LOKALEN (offset-)Koordinaten bestimmen: der
    // Browser-Viewport ist [0, innerWidth] × [0, innerHeight] in Fenster-Koordinaten; appRect.
    // left/top ist die aktuelle Lage von #app IM Fenster — die Umrechnung ist simple Subtraktion.
    // BUGFIX (mit Playwright gefunden): NICHT zusätzlich gegen `appEl.offsetWidth/offsetHeight`
    // clampen — sobald alle vier ISMs per instrPos `position:absolute` sind (die mitgelieferte
    // Demo tut das von Anfang an, s.o.), trägt KEIN Kind mehr zur eigenen Boxgröße von #app bei
    // (absolut positionierte Kinder verlassen den normalen Fluss) — #app schrumpft dann auf
    // seine reine Innenabstand-Höhe (hier ~24px), obwohl die Instrumente selbst weiterhin ganz
    // normal sichtbar irgendwo auf der Seite stehen (kein `overflow:hidden` an #app). Ein Clamp
    // auf `offsetHeight` hätte hier fälschlich fast den gesamten sichtbaren Bereich als "nicht
    // zu #app gehörig" verworfen und Hindernisse unterhalb davon ignoriert (Overlap-Risiko).
    // Einzig der Fenster-Viewport selbst begrenzt den Suchraum.
    const appRect = appEl.getBoundingClientRect();
    const viewX0 = Math.max(0, -appRect.left);
    const viewX1 = window.innerWidth - appRect.left;
    const viewY0 = Math.max(0, -appRect.top);
    const viewY1 = window.innerHeight - appRect.top;
    const MIN_SPAN = 40;   // #app selbst kaum/nicht sichtbar (extrem verscrollt) — nichts zu tun
    if (viewX1 - viewX0 < MIN_SPAN || viewY1 - viewY0 < MIN_SPAN) return;

    // Belegte Flächen: alle sichtbaren `.wb-bench` außer dem LevelMeter-Viewport-Overlay
    // (css/werkbank.css #bench-levelmeter ist `position:fixed`, deckt absichtlich den ganzen
    // Viewport ab und zählt nicht als "belegte Fläche"). Auf den sichtbaren Ausschnitt geclippt
    // — ein Instrument, das @dpa weit nach unten gezogen hat, blockiert oben nichts.
    const obstacles = [];
    appEl.querySelectorAll('.wb-bench').forEach((el) => {
        if (el.id === 'bench-levelmeter') return;
        const l = el.offsetLeft, t = el.offsetTop, r = l + el.offsetWidth, b = t + el.offsetHeight;
        if (r <= viewX0 || l >= viewX1 || b <= viewY0 || t >= viewY1) return;   // außerhalb des sichtbaren Ausschnitts
        obstacles.push({ l: Math.max(l, viewX0), t: Math.max(t, viewY0), r: Math.min(r, viewX1), b: Math.min(b, viewY1) });
    });

    // Größtes freies Rechteck: Kandidaten-Koordinaten = Rand des sichtbaren Ausschnitts +
    // jede Hindernis-Kante, dann alle Kombinationen prüfen (klassischer Brute-Force-Ansatz für
    // dieses Problem bei kleiner Hindernis-Zahl).
    const xs = new Set([viewX0, viewX1]);
    const ys = new Set([viewY0, viewY1]);
    obstacles.forEach((o) => { xs.add(o.l); xs.add(o.r); ys.add(o.t); ys.add(o.b); });
    const xList = [...xs].sort((a, b) => a - b);
    const yList = [...ys].sort((a, b) => a - b);
    let best = null;   // { l, t, r, b, area }
    for (let i = 0; i < xList.length; i++) {
        for (let j = i + 1; j < xList.length; j++) {
            const l = xList[i], r = xList[j];
            if (r - l < 20) continue;
            for (let k = 0; k < yList.length; k++) {
                for (let m = k + 1; m < yList.length; m++) {
                    const t = yList[k], b = yList[m];
                    if (b - t < 20) continue;
                    const area = (r - l) * (b - t);
                    if (best && area <= best.area) continue;
                    const free = !obstacles.some((o) => l < o.r && r > o.l && t < o.b && b > o.t);
                    if (free) best = { l, t, r, b, area };
                }
            }
        }
    }

    const PAD = 16;   // Sicherheitsabstand der Karte zu Instrumenten/Rand
    const naturalW = Math.min(640, appEl.offsetWidth);
    const CARD_MIN_W = 260, CARD_MIN_H = 110;   // ungefähre Mindestgröße, unterhalb derer die Karte kaum noch lesbar wäre

    if (best && (best.r - best.l) >= CARD_MIN_W + PAD * 2 && (best.b - best.t) >= CARD_MIN_H + PAD * 2) {
        // Normalfall: genug Platz — Karte in natürlicher Breite (max. 640px) MITTIG in die
        // größte freie Fläche setzen (waagerecht UND senkrecht, @dpa: "in die mitte").
        const w = Math.min(naturalW, best.r - best.l - PAD * 2);
        newEntryCard.style.width = w + 'px';
        newEntryCard.style.maxHeight = ''; newEntryCard.style.overflowY = '';
        newEntryCard.style.position = 'absolute';
        newEntryCard.style.left = (best.l + (best.r - best.l) / 2) + 'px';
        newEntryCard.style.top = (best.t + (best.b - best.t) / 2) + 'px';
        newEntryCard.style.transform = 'translate(-50%, -50%)';
    } else if (best && best.area > 0) {
        // Degradieren statt überlappen: die größte freie Fläche reicht nicht für die volle
        // Karte — auf die tatsächlich freie Breite/Höhe schrumpfen, bei Bedarf mit eigenem
        // Scrollbalken (overflow-y), statt über ein Instrument zu ragen.
        const w = Math.max(140, best.r - best.l - PAD * 2);
        const h = Math.max(70, best.b - best.t - PAD * 2);
        newEntryCard.style.width = w + 'px';
        newEntryCard.style.maxHeight = h + 'px';
        newEntryCard.style.overflowY = 'auto';
        newEntryCard.style.position = 'absolute';
        newEntryCard.style.left = (best.l + (best.r - best.l) / 2) + 'px';
        newEntryCard.style.top = (best.t + (best.b - best.t) / 2) + 'px';
        newEntryCard.style.transform = 'translate(-50%, -50%)';
    } else {
        // Letzter Ausweg (sichtbarer Ausschnitt de facto komplett belegt, praktisch kaum
        // erreichbar): wie in der Vorfassung unterhalb aller Instrumente im Dokumentfluss
        // anhängen — erfordert dann Scrollen, aber KEINE Überlappung.
        let maxBottom = 0;
        appEl.querySelectorAll('.wb-bench').forEach((el) => {
            if (el.id === 'bench-levelmeter') return;
            maxBottom = Math.max(maxBottom, el.offsetTop + el.offsetHeight);
        });
        newEntryCard.style.width = '';
        newEntryCard.style.maxHeight = ''; newEntryCard.style.overflowY = '';
        newEntryCard.style.position = 'absolute';
        newEntryCard.style.top = (maxBottom + 12) + 'px';
        newEntryCard.style.left = '50%';
        newEntryCard.style.transform = 'translateX(-50%)';
    }
}
// `.isConnected` statt nur der Variable: im Klon (APP !== 'werkbank-leer') wurde die Karte
// oben schon per `.remove()` aus dem DOM genommen — die JS-Variable bleibt zwar ein gültiger
// Elementverweis, aber ohne DOM-Anbindung gibt es nichts zu positionieren/neu zu vermessen.
if (newEntryCard && newEntryCard.isConnected) {
    // Doppeltes requestAnimationFrame statt eines direkten Aufrufs (BUGFIX, mit Playwright
    // gefunden): an dieser Stelle im Skript hat GroupHost die Taktgeber/Rec-Controls zwar
    // schon MONTIERT, aber der Browser hat das dadurch geänderte Layout (z.B. die volle Höhe
    // der TEMPO/METRONOM-Panels) noch nicht zwingend fertig eingetaktet — ein sofortiger
    // Aufruf maß hier nachweislich eine noch zu NIEDRIGE `offsetHeight` und platzierte die
    // Karte zu weit oben (potenzieller Overlap). Zwei rAF-Umläufe warten zuverlässig einen
    // vollständigen Layout-/Paint-Zyklus ab, bevor gemessen wird (Standardmuster für "nach dem
    // nächsten fertigen Layout").
    requestAnimationFrame(() => requestAnimationFrame(placeNewEntryCard));
    // Fenstergröße ändert sowohl den sichtbaren Ausschnitt (innerHeight/innerWidth) als auch
    // die Layout-Positionen der NICHT gezogenen Instrumente (#app's eigenes Grid-Reflow) — bei
    // beidem neu vermessen. Scroll ändert ebenfalls, welcher Ausschnitt gerade sichtbar ist.
    window.addEventListener('resize', placeNewEntryCard);
    window.addEventListener('scroll', placeNewEntryCard, { passive: true });
}

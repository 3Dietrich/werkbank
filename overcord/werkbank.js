/**
 * werkbank.js – baut die Demo-Seite auf.
 *
 * Bewusst dünn: die Werkbank ist eine SAMMLUNG zum Rüberkopieren, kein eigenes Produkt.
 * Alles Interessante steckt in lib/ (unverändert aus teslacoil). Diese Datei stellt die
 * Bausteine nur hin und hängt sie an den MiniState – sie ist selbst NICHT zum Kopieren
 * gedacht und darf deshalb kurz und schlicht bleiben.
 *
 * Eigener Datentopf je Einstieg (@dpa dd.md 20260801_2): die localStorage-Keys kommen aus
 * lib/appId.js (`<html data-app>`). Für DIESE Seite ist das der Default 'werkbank', die
 * Keys heißen also unverändert werkbank_* — die Trennung kostet index.html nichts.
 */
import { APP, lsKey, toOwnKey } from '../lib/appId.js';
import { MiniState } from '../lib/MiniState.js';
import { mountInstrumentSettings } from '../lib/InstrumentSettings.js';
import { HintBubble } from '../lib/HintBubble.js';
import { createMasterVolume, masterVolumeDefaults } from '../lib/MasterVolume.js';
import { factoryHint } from '../lib/hints.js';
import { hint, text as i18nText, setLang, lang as curLang, onLangChange } from '../lib/i18n.js';
import { SettingsWindow } from '../lib/SettingsWindow.js';
import { buildMainSettings } from '../lib/mainSettings.js';
import { wireGlobalLook } from '../lib/globalLook.js';
import { installSelectOnFocus } from '../lib/selectOnFocus.js';
import { mountGroups, kbStyle } from '../lib/group/GroupHost.js';
import { PickMenu } from '../lib/PickMenu.js';
import { createEnsembleStore } from '../lib/EnsembleStore.js';
import { ElementSettings } from '../lib/ElementSettings.js';
import { taktMetroDefs } from '../lib/taktmetro/defs.js';
import { createTaktEngine } from '../lib/taktmetro/engine.js';
import { MP3_CBR_PRESETS } from '../lib/mp3Encoder.js';
import { WAV_SAMPLE_RATES, WAV_BIT_DEPTHS } from '../lib/wavEncoder.js';
import { polySynthDefs } from '../lib/polysynth/defs.js';
import { createPolySynthEngine } from '../lib/polysynth/engine.js';
import { PlayKeyboard } from '../lib/polysynth/ui/PlayKeyboard.js';
import { ChordMemory } from '../lib/polysynth/ui/ChordMemory.js';
import { BaseKeyboard } from '../lib/polysynth/ui/BaseKeyboard.js';
import { Readout } from '../lib/polysynth/ui/Readout.js';
import { midiToName, freqToMidi, NOTE_NAMES } from '../lib/polysynth/pitch/Scaler.js';
import { stepSeqDefs } from '../lib/stepseq/defs.js';
import { createStepSeqEngine } from '../lib/stepseq/engine.js';
import { StepSeqGrid } from '../lib/stepseq/ui/StepSeqGrid.js';
import { createSqManager } from '../lib/stepseq/multiSq.js';
import { makeWorkerTicker } from '../lib/workerTicker.js';
import { recInstrumentDefs } from '../lib/recInstrument/defs.js';
import { createRecEngine } from '../lib/recInstrument/engine.js';
import { getContext as getBusContext, getMaster as getBusMaster, getAnalyser as getBusAnalyser, getLimiter as getBusLimiter, getWaveshaper as getBusWaveshaper } from '../lib/audioBus.js';
import { createRoutingRegistry, bindPorts } from '../lib/routing/Registry.js';
import { knobWrites, buttonWrites } from '../lib/routing/portGen.js';
import { createStructureView } from '../lib/routing/StructureView.js';
import { LevelMeter } from '../lib/LevelMeter.js';
import { createScopeManager } from '../lib/scope/multiScope.js';
import { icon } from '../lib/icons.js';
import { mdToHtml, htmlToMdApprox } from '../lib/miniMarkdown.js';

// Erstbesuch-Demo-Stand (presets/default-config.json) abwarten, BEVOR der erste
// MiniState den localStorage liest (@dpa 20260725: „man muss die config hinzu
// speichern.. sonst klingt alles nichts"). Das Modul ist in index.html VOR dieser
// Datei eingebunden und legt das Promise schon beim Import an; fehlt es (alte
// index.html-Caches, Tests, die werkbank.js direkt laden), ist der Fallback ein
// sofort erfülltes Promise — Verhalten wie bisher.
await (window.__defaultConfigReady || Promise.resolve());

// Globaler Fallback-State: wird von hintResolve() weiter unten genutzt, wenn ein Control
// zu keinem der eigenen Instrumenten-States gehört (s. Kommentar dort).
const state = new MiniState({}, lsKey('state'));
// Sprache SOFORT setzen, bevor irgendein hint()/text() weiter unten aufgerufen wird (@dpa
// ddw.md 20260724, main Config „Deutsch/Englisch") — jedes Element entsteht dann gleich in
// der richtigen Sprache, kein Nachzeichnen nötig. state.get('lang') war schon vor dieser
// Funktion als LAYOUT_KEY reserviert (PresetManager.js), aber nie tatsächlich gelesen.
setLang(state.get('lang') || 'de');
// Label-Farbe/-Größe/Wert-BG + Gruppen-Header-Größe/-Höhe (@dpa ddw.md 20260724): CSS-Vars
// sofort + bei jeder Änderung anwenden (s. lib/globalLook.js).
wireGlobalLook(state);
// Zahl-/Text-Eingabefelder selektieren beim Fokussieren ihren ganzen Inhalt — auch beim
// Anklicken, nicht nur per Tab (ddw.md 20260727_135331, s. lib/selectOnFocus.js).
installSelectOnFocus();

// ── Header-Button-Settings (@dpa 20260723_1500ff: „die Header-Buttons bitte mit `Button`
// settings") ─────────────────────────────────────────────────────────────────────────
// Dieselbe Rechtsklick-Optik wie jeder normale Button-Control (GroupHost.registerCtrlStyle),
// von Hand nachgebaut — der Header ist keine Gruppe (gleiches Muster wie MasterVolume.js).
// Persistenz in state.ctrlStyles (globaler werkbank_state), Panel bleibt „rein optisch"
// (ElementSettings.js-Doktrin): btnMode ist Teil des generischen 'button'-Feldsatzes und
// bleibt im Panel sichtbar, wirkt hier aber bewusst NICHT — jeder Header-Button hat sein
// eigenes, festverdrahtetes Klick-Verhalten (Reset=einmalig, Config/Struktur/Rec-Format=
// auf/zu, Tasten/MIDI/Hints=Dauer-Toggle über `.active`).
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
    // Der sichtbare Text lebt in einem eigenen Span (@dpa dd.md 20260802, Zahnrad im ⚙-Knopf):
    // Umbenennen schrieb bisher `btn.textContent`, und das ersetzt ALLE Kinder — ein SVG-Icon
    // im Button wäre beim ersten applyStyle() still verschwunden. Der Aufrufer darf jetzt ein
    // Icon vor den Text hängen; angefasst wird nur noch der Span.
    let txtEl = btn.querySelector('.hdr-btn-text');
    if (!txtEl) {
        txtEl = document.createElement('span'); txtEl.className = 'hdr-btn-text';
        txtEl.textContent = btn.textContent; btn.textContent = ''; btn.appendChild(txtEl);
    }
    const baseText = txtEl.textContent;
    const applyStyle = (s) => {
        labelEl.textContent = s.label || '';
        field.classList.remove('btn-label-top', 'btn-label-left', 'btn-label-right', 'btn-label-bottom', 'btn-label-off');
        field.classList.add('btn-label-' + (s.labelPos || 'off'));
        const onText = s.textOn || baseText, offText = s.textOff || baseText;
        btn._applyBtnStyle = () => {
            const on = btn.classList.contains('active');
            txtEl.textContent = on ? onText : offText;
            btn.style.background = on ? (s.bgOn || '') : (s.bg || '');
        };
        btn.style.color = s.fg || '';
        btn.style.fontSize = s.size ? s.size + 'px' : '';
        btn.style.padding = s.pad != null ? s.pad + 'px' : '';
        btn.style.width = s.boxSize ? s.boxSize + 'px' : '';
        btn.style.height = s.boxH ? s.boxH + 'px' : '';
        btn._applyBtnStyle();
    };
    // `.active` wird von jedem Header-Button anders/eigenständig geschaltet (s.o.) — statt
    // an jeder Stelle einzeln nachzuziehen, EIN MutationObserver auf die Klasse: repaint
    // (Text/BG) läuft dann für alle 7 Buttons automatisch mit, ohne deren Klick-Logik anzufassen.
    new MutationObserver(() => btn._applyBtnStyle && btn._applyBtnStyle())
        .observe(btn, { attributes: true, attributeFilter: ['class'] });
    field.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        hdrElemSettings.open({ id, type: 'button', el: field, defLabel, applyStyle });
    });
    applyStyle((state.get('ctrlStyles') || {})[id] || {});
    return field;
}

// ── Master Volume (@dpa 20260722, ddw.md „wir brauchen einen Master Volume") ──────────
// Header-Fader, eigener State (nicht an ein Instrument gebunden — wirkt auf lib/audioBus.js,
// den GEMEINSAMEN Master-Bus aller Instrumente). Muss vor den Instrumenten stehen: sie rufen
// beim ersten Ton audioBus.ensureAudio() auf, createMasterVolume() legt die Volume/Limiter-
// Kette mit den GESPEICHERTEN Werten an (statt später mit hart verdrahteten Defaults).
const MASTER_LS = lsKey('master');
const masterState = new MiniState(masterVolumeDefaults, MASTER_LS);
const masterVolume = createMasterVolume(masterState);
document.querySelector('#master-vol').appendChild(masterVolume.element);
window.__master = { state: masterState, volume: masterVolume };

// ── Routing-Registry (Phase 2.3, PLAN_OPERA.md/PHASE2_SPEC.md) ────────────────────────
// Zentrale Wahrheit über ISM-Ports + ihre Verbindungen. Muss VOR den Instrumenten stehen
// (die melden sich direkt nach ihrem jeweiligen createXEngine() an). Migrationsweg bewusst
// zweistufig: erst deklarieren + bestehende Verbindungen eintragen (Paket B, s.u. bei den
// einzelnen Instrumenten), danach EINE Zustellung nach der anderen auf reg.emit()/reg.flush()
// heben statt alles auf einmal (Paket C) — momentan nur Stepseq→Poly migriert (s. dort).
const routing = createRoutingRegistry();
window.__routing = { reg: routing };

// ── Master-Bus-Output (ddw.md 20260802, „Ein-/Ausgänge-Kette", Wave 1) ────────────────
// EIN Output-Tap auf den geteilten Analyser aus audioBus.js. Der hängt dort schon
// automatisch um (nach dem Limiter bei [Lim] an, direkt nach dem Fader bei [Lim] aus, s.
// audioBus.js setLimiterOn()) — der Scope zeigt darüber also automatisch das begrenzte
// ODER das rohe Signal, je nach Limiter-Stand, ohne dass hier irgendeine eigene
// Umschaltlogik nötig wäre (@dpa: „mit Lim=off kann man sehen was den Limiter zum
// Clippen bringt"). read() liefert einen billigen linearen Peak (0..1, „frame"-Fallback,
// dieselbe Rechnung wie LevelMeter.js tick()); die genaue Kurve gibt's am Scope selbst
// über Umschalten auf "sample" (hasNode/node, dasselbe Muster wie die ADSR in multiEnv.js).
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

// ── Takt + Metronom – Neu-Port (P1) + echter Ton (P4) ──────────────────────────
// Der frühere Mount lief über taktgebers eigene ui.js (der „eigene Scheiß"). Jetzt füttert
// EINE deklarative defs-Quelle (lib/taktmetro/defs.js, gemappt aus taktgeber-Manifest +
// Defaults) teslacoils Fabriken via mountGroups — zwei Gruppen, im e-Mode ('e') frei
// verschiebbar. Eigener MiniState mit eigenem localStorage-Key = klare, isolierte Naht.
// P4: die Action-Buttons treiben jetzt die echte Audio-Engine (metro.js/clock.js aus
// taktgeber). onAction(id, phase) — phase ('down'/'up') MUSS durchgereicht werden, sonst
// wirken die Gate-Knöpfe −/+ nicht als gehaltener ASR-Nudge (@dpa 20260720, Punkt C).
const TAKT_LS = lsKey('taktmetro');
const taktState = new MiniState(taktMetroDefs().DEFAULTS, TAKT_LS);
const taktRoot = document.querySelector('#taktgeber');
const taktEngine = createTaktEngine(taktState);
// audioInfo: echte Latenz/Samplerate fürs Tab-Sonderfenster (Punkt A). ensureAudio() baut den
// Context (bleibt stumm bis Start) → SR + Basislatenz sind sofort echt, Ausgabelatenz sobald bekannt.
const taktDefs = taktMetroDefs({
    onAction: (id, phase) => {
        taktEngine.onAction(id, phase);
        // Resync reicht ans Sequenzer-ISM weiter (@dpa 20260723_1400/1427/1455: „Metronom
        // springt, Sequenzer läuft stur weiter" / „! funktioniert noch immer nicht" / "'!'
        // soll auf den BPM-Schlag synchron syncen, nicht sofort bei jeder Geschwindigkeit").
        // Zwei Fälle, bewusst UNTERSCHIEDLICH behandelt:
        //  - 'bang' ('!', weich): bewegt KEINE Audio-Zeit (Clock.resync(false) setzt nur
        //    beatInBar=0, `_next` bleibt stehen — „der Takt läuft unbeirrt weiter"). Der
        //    Sequenzer bekommt darum auch keinen sofortigen Trigger, sondern armBeatSync():
        //    exakt der NÄCHSTE rohe Beat (nicht der nächste Sequenzer-eigene Sub-Trigger bei
        //    seqMult/seqDiv≠1/1) wird zum neuen Anker + Step 0 — BPM-Schlag und Seq.-Anfang
        //    bleiben so synchron, egal welche Geschwindigkeit eingestellt ist.
        //  - 'bang2' ('!!', hart): reicht den Phasen-Sprung EXPLIZIT an resyncPhase() weiter.
        //    Die Zeit-Heuristik in stepSeqEngine.handleClockBeat (4A.3) erkennt Sprünge nur,
        //    wenn sie GENUG vom alten Raster abweichen — liegt der Resync zufällig nah dran,
        //    verfehlt sie das knapp. Dieser Pfad ist der garantierte, kein Ersatz für die
        //    Heuristik (die bleibt für Reanchor/Tempo-Sprung ohne Tastendruck).
        // sqManager verteilt an ALLE Sq-Engines (Multi-Sq) — existiert erst weiter unten
        // (TDZ-sicher, Closure liest erst beim Klick, dasselbe Muster wie chordUp/chordDown).
        if (id === 'bang') sqManager.armBeatSync();
        else if (id === 'bang2') sqManager.resyncPhase();
    },
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
// Beide Start-Knöpfe (>/|>, ddw.md 20260724_212747) tragen den „Transport läuft"-Zustand:
// egal welcher gestartet hat, beide leuchten, und ein Druck auf einen von beiden stoppt.
// `avv` (nur bei on=true belegt) unterscheidet '>' (alles von vorne) von '|>' (weiter).
taktEngine.onRunning((on, avv) => { takt.setCtrlOn('b:start', on); takt.setCtrlOn('b:startCont', on); _onTaktRunning(on, avv); });
// Die Takt-Anzeige leuchtet auf dem laufenden Beat (zeit-ausgerichtet vom Engine).
taktEngine.onBeat((i) => takt.setBeat('u:beatView', i));
// BPM-Anzeige folgt dem Anschieben +/− (@dpa 20260720, Punkt): der ±-Schub wird SICHTBAR, ohne
// den gespeicherten bpm zu ändern. Bias zurück auf 0 → liveBpm == bpm → Anzeige steht wieder original.
taktEngine.onNudge((liveBpm) => takt.setKnobDisplay('bpm', liveBpm));
// Debug/Headless-Test-Haken (wie _selftest.html sein __host): Zugriff auf Engine/State/Host.
window.__takt = { engine: taktEngine, state: taktState, host: takt };
// Routing-Anmeldung (Paket B): der `beat`-Output ist ein EVENT-Port ohne read() — seine
// tatsächliche Zustellung an Rec läuft weiterhin über taktEngine.onClockBeat() (unverändert,
// s. weiter unten); die Registry kennt die Verbindung nur für die Struktur-Ansicht (Phase 3).
routing.registerModule('takt', {
    label: 'Takt/Metronom', latency: taktEngine.latency,
    ...bindPorts(taktDefs.ports, {
        outputs: {},
        // Punkt 3b (ddw.md 20260724, Phase B): ALLE Takt/Metronom-Knobs + -Buttons als Sq-
        // Ziele — dieselbe Brücke wie beim Poly-Synth (portGen.js), `takt.keyMidi` ist DIESES
        // Instruments eigene KeyMidi-Instanz (nicht die globale `keyMidi`-Konstante weiter
        // unten, die IST takt.keyMidi, aber existiert an dieser Stelle im Datei-Fluss noch
        // nicht — s. TDZ-Hinweis dort).
        inputs: {
            ...knobWrites(taktState, taktDefs.KNOBS),
            ...buttonWrites(takt.keyMidi, Object.keys(taktDefs.BUTTONS)),
            // Base-Frq als Modulations-Quelle (ddw.md 20260724_212747, teslacoil-Parität): der
            // gefaltete Wert landet über setBaseFreqIn im Metro-Cutoff, sobald metroCutoffQuant an
            // ist. Die Verbindung selbst wird direkt darunter hergestellt (routing.connect).
            baseFreqIn: { write: (v) => taktEngine.setBaseFreqIn(v) },
        },
    }),
});

// ── Poly-Synth – Base-Frq + Audio-Osz, Port aus teslacoil (Schritt 1, @dpa 20260721) ──
// Eigener MiniState + eigene deklarative defs-Quelle, gemountet über dieselbe
// GroupHost-Fabrik. Der anfängliche Test-Ton (Übergangslösung, bevor die Voice-Engine
// stand) ist wieder entfernt (@dpa 20260721_203557: „durch die echte Voice-Engine jetzt
// überflüssig") — Base-Frq hört man jetzt direkt über gespielte Noten.
const POLYSYNTH_LS = lsKey('polysynth');
const polySynthState = new MiniState(polySynthDefs().DEFAULTS, POLYSYNTH_LS);
const polySynthRoot = document.querySelector('#polysynth');
// [R] ist ein durchschaltbarer Button (@dpa 20260722_004312, Zyklus @dpa 20260722 ddw.md):
// sein Klick fährt die ChordMemory-Methode an (chordMemory wird gleich darunter gebaut — die
// Closure liest die Bindung erst beim Klick, also nach der Zuweisung, kein TDZ-Problem).
// Preview-Zustand für den Amp-Env „►"-Button (s. onAction 'adsrGate' unten) — hält fest, ob
// der Referenzton gerade klingt, damit ein Klick im Modus=gate ihn toggeln kann.
let previewHeld = false;
const polySynthDefsObj = polySynthDefs({
    onAction: (id, phase) => {
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
        // ADSR-Gate-Buttons (ddw.md 20260725): indiziert 'adsrGate_i' → envManager.gateAt(i).
        // TDZ-sicher wie polySynthKeyboard: envManager wird weiter unten gebaut, die Closure
        // greift erst beim Klick zu. phase ('down'/'up') MUSS durchgereicht werden (Bugfix
        // ddw.md 20260727, „Button triggert bei Release statt Press"): steht der Button per
        // Element-Settings auf btnMode='gate', feuert GroupHost fire() ZWEIMAL (down UND up)
        // — ohne Phase triggerte gateAt() im Trig-Modus beide Male, wobei der zweite (Release-)
        // Trigger die kaum begonnene erste Kurve per cancelScheduledValues() sofort wegwischte.
        else if (id.startsWith('adsrGate_')) envManager.gateAt(parseInt(id.slice(9), 10), phase);
        // Amp-Env „►" (dd.md 20260802, 3. Runde, @dpa: "Button '►' ... fehlt noch"): bare Key
        // (kein sfx) — Amp-Env hat keine einzelne Instanz zum Gaten (polyphon, s. defs.js
        // BUTTONS-Kommentar), darum Preview/Audition auf einem festen Referenzton (Middle C)
        // über die reale Engine — man hört die Hüllkurve 1:1 wie beim Spielen (Peak/Kurven/
        // Skew/Modus/Fest). Verhalten 1:1 wie multiEnv.js gateAt() gespiegelt: Modus=trig →
        // ein Klick = ein Trigger (phase 'up' unterdrückt den Doppel-Fire bei Gate-Button-UI);
        // Modus=gate → toggelt noteOn/noteOff (funktioniert sowohl per einfachem Klick — kein
        // phase — als auch per echtem Halten, falls @dpa den Button per Element-Settings auf
        // btnMode='gate' stellt).
        else if (id === 'adsrGate') {
            const PREVIEW_NOTE = 60;
            if ((polySynthState.get('adsrTrigMode') || 'gate') === 'trig') {
                if (phase !== 'up') polySynthEngine.noteOn(PREVIEW_NOTE, 127);
            } else if (previewHeld) {
                polySynthEngine.noteOff(PREVIEW_NOTE);
                previewHeld = false;
            } else {
                polySynthEngine.noteOn(PREVIEW_NOTE, 127);
                previewHeld = true;
            }
        }
        // Len: fest/offen (ddw.md 20260726): reiner Boolean-Flip im State — die Sichtbarkeits-
        // und setCtrlOn-Nachführung übernimmt multiEnv.js (state.subscribe), wie bei kbHold.
        else if (id.startsWith('adsrLenFest_')) {
            const sfx = id.slice('adsrLenFest'.length);
            const cur = polySynthState.get('adsrLenFest' + sfx) !== false;   // Default fest
            polySynthState.set('adsrLenFest' + sfx, !cur);
        }
        // Amp-Env „Fest" (dd.md 20260802, 2. Runde): bare Key (kein sfx, s. defs.js
        // GROUPS['Amp-Env']) — derselbe Flip wie oben, nur ohne multiEnv.js als Nachführer
        // (syncFestButton unten übernimmt das b:adsrLenFest-Sync, analog syncHoldButton).
        else if (id === 'adsrLenFest') {
            const cur = polySynthState.get('adsrLenFest') !== false;
            polySynthState.set('adsrLenFest', !cur);
        }
    },
});
const polySynth = mountGroups(polySynthRoot, polySynthState, polySynthDefsObj, {
    instrumentScaled: () => polySynthInstr.scaled(),
    groupKindSettings: (kind) => _groupKindSettings[kind],   // lazy: _groupKindSettings kommt später
});
// BUTTONS hängen (anders als TOGGLES) nicht automatisch am State — b:kbHold muss seinen
// isOn-Zustand explizit nachgezogen bekommen, auch wenn kbHold NICHT per Klick, sondern
// z.B. per Config-/Snapshot-Restore verändert wird.
const syncHoldButton = () => polySynth.setCtrlOn('b:kbHold', !!polySynthState.get('kbHold'));
syncHoldButton();
polySynthState.subscribe((k) => { if (k === 'kbHold' || k === '*') syncHoldButton(); });
// Amp-Env „Fest"-Button (dd.md 20260802, 2. Runde): analog syncHoldButton — b:adsrLenFest
// (bare, kein sfx) muss auch bei Config-/Snapshot-Restore visuell nachgezogen werden.
const syncAmpFestButton = () => polySynth.setCtrlOn('b:adsrLenFest', polySynthState.get('adsrLenFest') !== false);
syncAmpFestButton();
polySynthState.subscribe((k) => { if (k === 'adsrLenFest' || k === '*') syncAmpFestButton(); });
const polySynthEngine = createPolySynthEngine(polySynthState);
polySynthEngine.setBpmSource(() => taktState.get('bpm'));   // baseSrc='Tempo' folgt dem Taktmetro-Tempo
// Ändert sich das Takt-BPM, während baseSrc='Tempo' läuft, müssen bereits GEHALTENE Voices
// live nachgezogen werden (@dpa 20260722_155726) — die Anzeige folgt sowieso über den
// Render-Loop, aber ohne diesen Hook bliebe eine gerade klingende Note auf der alten
// Beat-Frequenz stehen, bis sie neu angeschlagen wird.
taktState.subscribe((k) => { if (k === 'bpm' || k === '*') polySynthEngine.notifyTempoChange(); });
// Basis-Tonklassen-Brett (@dpa 20260722_013727: „Quelle Ton: das KB fehlt!") — bei Quelle
// „Ton" bedienbar (wählt baseNote), sonst reine Anzeige, wo die klingende BaseFrq liegt.
// War schon fertig gebaut (BaseKeyboard.js), nur nie gemountet — tickt im Render-Loop
// ganz unten in dieser Datei.
const baseKeyboard = new BaseKeyboard(polySynthState, () => polySynthEngine.baseFreq());
polySynth.mountInGroup('Base-Frq', baseKeyboard.element, 'u:baseKb');
polySynth.registerCtrlStyle('u:baseKb', 'keyboard', baseKeyboard.element, kbStyle(baseKeyboard.element), 'Ton-Wahl');
hint(baseKeyboard.element, 'Nur bei Quelle „Ton" bedienbar: wählt die Tonklasse der Basis. Sonst reine Anzeige, wo die klingende Base-Frq liegt.');
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
// gelernte Bindung kalibriert die Oktave UND bleibt jetzt bestehen (PLAN_OPERA.md 1.2 —
// vorher sofort wieder gelöscht, damit war der Kanal nie tatsächlich gelernt). Der Kanal
// wird nach baseMidiChannel gespiegelt, wo BaseKeyboard._onMidiMessage ihn als aktiven
// Filter nutzt (0 = alle Kanäle).
polySynthState.subscribe((k) => {
    if (k !== 'midiBindings') return;
    const b = (polySynthState.get('midiBindings') || {})['u:baseKb'];
    if (!b || b.type !== 'note') return;
    baseKeyboard.calibrateMidiOctave(b.data1);
    polySynthState.set('baseMidiChannel', b.ch || 0);
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
hint(polySynthKeyboard.element, 'Spiel-Tastatur — klicken oder MIDI spielt eine Note. Bereich/Oktaven in den Settings.');
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
// frisch gelernte Bindung (midiBindings-State) und kalibrieren daraus — die Bindung bleibt
// jetzt BESTEHEN (PLAN_OPERA.md 1.2 — vorher sofort wieder gelöscht, damit war der Kanal nie
// tatsächlich gelernt; der no-op-`activate` oben macht das gefahrlos, Midi.js löst über die
// Bindung nichts mehr aus). Der Kanal wird nach kbMidiChannel gespiegelt, wo
// PlayKeyboard._onMidiMessage ihn als aktiven Filter nutzt (0 = alle Kanäle).
polySynthState.subscribe((k) => {
    if (k !== 'midiBindings') return;
    const b = (polySynthState.get('midiBindings') || {})['u:playKb'];
    if (!b || b.type !== 'note') return;
    polySynthKeyboard.calibrateMidiOffset(b.data1);
    polySynthState.set('kbMidiChannel', b.ch || 0);
});
// Akkord-Speicher: autarker Control NEBEN dem Keyboard (@dpa 20260722_004312) — kommt über
// snapshotChord/gateChordOn/releaseChordGate/onChordChange an den gespielten Akkord, eigene
// Settings (u:speicher). keyMidi mitgegeben (@dpa 20260722_033950): jeder Slot meldet sich
// einzeln zum Tasten-/MIDI-Learn an (u:speicher:<i>), s. ChordMemory.js Kopf-Kommentar.
const chordMemory = new ChordMemory(polySynthState, polySynthKeyboard, polySynth.keyMidi);
polySynth.mountInGroup('Keyboard', chordMemory.element, 'u:speicher');
polySynth.registerCtrlStyle('u:speicher', 'speicher', chordMemory.element, (s) => chordMemory.applyStyle(s), 'Speicher');
hint(chordMemory.element, 'Akkord-Speicher: leerer Slot merkt den gerade gespielten Akkord, belegter Slot ist ein Gate (halten = klingt). [R] schaltet das Verhalten um.');
// Positions-Nachzügler (@dpa 20260722_013727: „packt nach dem Reload die Tastatur ganz links
// hin, ein kurzer Gang in e-Mode bereinigt das"): applyCtrlPos() lief beim Seitenaufbau schon
// VOR diesen beiden mountInGroup()-Aufrufen (die Gruppe „Keyboard" war zu dem Zeitpunkt also
// schon "freeGroups"-eingefroren, ohne dass playKb/speicher überhaupt existierten) — genau das
// holt ein e-Mode-Besuch nach, weil er freezeGroup() für JEDE Gruppe erneut aufruft. refresh()
// tut exakt das, ohne dass @dpa dafür erst in e-Mode wechseln muss.
polySynth.refresh();
window.__polysynth = { state: polySynthState, host: polySynth, engine: polySynthEngine, keyboard: polySynthKeyboard, memory: chordMemory, baseKeyboard };
// Routing-Anmeldung (Paket B/C): `baseFreq`/`baseTone` sind echte VALUE-Ports (read() ist
// gefahrlos additiv, wird nur bei einer Verbindung gesampelt). `trig` ist die AKTIVE Ziel-
// Bindung für die Stepseq-Migration (Paket C, s. dort) — write() ruft direkt die Engine.
routing.registerModule('polysynth', {
    label: 'Poly-Synth', latency: polySynthEngine.latency,
    ...bindPorts(polySynthDefsObj.ports, {
        outputs: {
            baseFreq: { read: () => polySynthEngine.baseFreq() },
            baseTone: { read: () => polySynthEngine.baseTone() },
        },
        inputs: {
            // meta.srcId (Bugfix „lautes Getöse" bei 2+ aktiven Sq, ddw.md 20260724_192304):
            // durchgereicht an triggerFromEnv/playRemote, damit ihr Legato-Gedächtnis PRO
            // SQ-KLON läuft statt in einer einzigen geteilten Variable — s. Registry.js
            // deliver()-Kommentar.
            trig: { write: (v, meta) => polySynthEngine.triggerFromEnv(v, meta && meta.srcId) },
            // Punkt 3b (ddw.md 20260724): ALLE Knobs + die drei freigegebenen Buttons als
            // Sq-Ziele — write()-Bindungen aus derselben KNOBS/BUTTONS-Quelle wie das Panel
            // (portGen.js), `polySynth.keyMidi` ist die EIGENE KeyMidi-Instanz dieses
            // mountGroups()-Aufrufs (nicht die globale `keyMidi`-Konstante weiter unten, die
            // ist taktmetro's — jedes Instrument hat sein eigenes, s. GroupHost.js mountGroups).
            ...knobWrites(polySynthState, polySynthDefsObj.KNOBS),
            ...buttonWrites(polySynth.keyMidi, ['chordUp', 'chordDown', 'kbHold']),
            speicher: { write: (v) => { if (v > 0) chordMemory.triggerSlot(Math.round(v) - 1); } },
            note: { write: (v, meta) => polySynthKeyboard.playRemote(Math.round(v), meta && meta.srcId) },
            // Ton-Wahl als Sq-Ziel (@dpa ddw.md 20260724_153349): moduloed auf 1..12, damit
            // auch Werte außerhalb des Ports-Bereichs (z.B. eine Sq-Skala mit anderem Min/Max)
            // eine gültige Tonklasse ergeben, statt am Rand einzurasten.
            tonWahl: { write: (v) => polySynthState.set('baseNote', NOTE_NAMES[((Math.round(v) - 1) % 12 + 12) % 12]) },
            // Akkord-Frequenz-Modulation (ddw.md 20260725, Multi-ADSR Sonderwunsch):
            // preQuantMod — VOR der Quantisierung (harmonicSnap), postQuantMod — NACH der
            // Überblendung roh↔gerastet. Beide multiplizieren die Frequenz mit (1 + mod).
            preQuantMod: { write: (v) => polySynthEngine.setPreModValue(v) },
            postQuantMod: { write: (v) => polySynthEngine.setPostModValue(v) },
        },
    }),
});
// Base-Frq als Quelle fürs Metronom (ddw.md 20260724_212747, korrigiert 233253): dauerhafte
// VALUE-Verbindung polysynth.baseFreq → takt.baseFreqIn. Der Wert fließt jeden Frame über
// flush() (billig), WIRKT aber nur, wenn das Metronom-Toggle „Quant" (metroCutoffQuant) an ist
// (dann rasten die Metro-Cutoffs auf Base-Frq-Vielfache). connect() ist idempotent (dedupliziert
// gegen die persistierte Verbindungsliste), der erste echte VALUE-Modulationsweg der Werkbank.
routing.connect({ module: 'polysynth', port: 'baseFreq' }, { module: 'takt', port: 'baseFreqIn' });

// ── Multi-ADSR (ddw.md 20260725) ───────────────────────────────────────────────────────
// Vervielfältigbare ADSR-Envelopes ALS TEIL des Poly-Synth (eigene Groups, gemeinsamer State).
// Werte-Knobs (A,D,S,R,Peak,GateLen,Len) auf dem Panel; Settings (aktiv, Kurven, Verlauf,
// Trig/Gate, Skew) im Gruppen-Rechtsklick-Panel via groupKindSettings-Hook.
import { createEnvManager, wireAdsrKnobVisibility } from '../lib/polysynth/multiEnv.js';
// Amp-Env (dd.md 20260802, 2. Runde: "das ist noch nicht die ADSR!! Was machst Du denn??"):
// dieselbe Sichtbarkeits-Verdrahtung wie jede Multi-ADSR-Instanz, nur sfx='' — sonst zeigt
// das Panel A/D/S/R und BEIDE Len-Knobs immer, unabhängig von den Settings-Toggles.
wireAdsrKnobVisibility({ host: polySynth, state: polySynthState, groupName: 'Amp-Env', sfx: '' });
const adsrTpl = {
    KNOBS: { ...polySynthDefsObj.ADSR_KNOBS },
    BUTTONS: { ...polySynthDefsObj.ADSR_BUTTONS },
    DEFAULTS: { ...polySynthDefsObj.ADSR_DEFAULTS },
};
const envManager = createEnvManager({
    host: polySynth, state: polySynthState, defs: polySynthDefsObj,
    tpl: adsrTpl, routing,
    getBpm: () => taktState.get('bpm'),
});
envManager.init();
polySynth.refresh();

// groupKindSettings: ADSR-Settings ins Gruppen-Rechtsklick-Panel einhängen.
const _adsrSettingsToggles = polySynthDefsObj.ADSR_SETTINGS_TOGGLES;
const _adsrSettingsSelects = polySynthDefsObj.ADSR_SETTINGS_SELECTS;
const _adsrSettingsSkews = polySynthDefsObj.ADSR_SETTINGS_SKEWS;
const _adsrSettingsNums = polySynthDefsObj.ADSR_SETTINGS_NUMS;
const _groupKindSettings = {
    // Amp-Env teilt sich seit dd.md 20260802 den groupKind 'ADSR' mit Multi-ADSR (gemeinsamer
    // Combo-/Snapshot-Pool) und hat seit dd.md 20260802 (2. Runde, @dpa: "alles von ADSR
    // einfach rein!") auch dieselben STATE-KEYS wie eine Instanz — nur unsuffixed (sfx='').
    // get/set (k+sfx) liest darum für Amp-Env automatisch die bloßen adsr*-Keys, exakt wie für
    // eine echte Instanz — keine Sonderbehandlung nötig. Einzige Ausnahme: Copy/Delete (unten)
    // wirken auf envManager.engines, das Amp-Env nicht kennt — die bleiben sfx-only.
    ADSR: (name, pop, st, row, sfx) => {
        const get = (k) => polySynthState.get(k + sfx);
        const set = (k, v) => polySynthState.set(k + sfx, v);

        // Trennlinie
        const sep = document.createElement('div'); sep.className = 'gs-sep'; pop.appendChild(sep);

        // ── Compact-Grid: 2 Spalten (Toggles links, Selects rechts) ──────────
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:4px 12px; margin:8px 0;';

        // Toggles: A/D/S/R aktiv, Inv, Verlauf
        const toggleCol = document.createElement('div');
        for (const [key, cfg] of Object.entries(_adsrSettingsToggles)) {
            const r = document.createElement('label');
            r.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:11px; cursor:pointer;';
            const cb = document.createElement('input'); cb.type = 'checkbox';
            cb.checked = get(key) ?? polySynthDefsObj.ADSR_DEFAULTS[key];
            cb.addEventListener('change', () => set(key, cb.checked));
            r.appendChild(cb);
            r.appendChild(document.createTextNode(cfg.label));
            toggleCol.appendChild(r);
        }
        grid.appendChild(toggleCol);

        // Selects: Kurven, Modus, Len-Einheit
        const selectCol = document.createElement('div');
        for (const [key, cfg] of Object.entries(_adsrSettingsSelects)) {
            const r = document.createElement('label');
            r.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:11px; cursor:pointer;';
            const sel = document.createElement('select');
            sel.style.cssText = 'font-size:11px; padding:1px 4px;';
            for (const o of cfg.options) {
                const opt = document.createElement('option'); opt.value = o; opt.textContent = o;
                sel.appendChild(opt);
            }
            sel.value = get(key) ?? polySynthDefsObj.ADSR_DEFAULTS[key];
            sel.addEventListener('change', () => set(key, sel.value));
            r.appendChild(sel);
            r.appendChild(document.createTextNode(cfg.label));
            selectCol.appendChild(r);
        }
        grid.appendChild(selectCol);
        pop.appendChild(grid);

        // ── Skew-Zeile: A/D/R-Skew als kompakte Zahlenfelder ──────────────────
        const skewRow = document.createElement('div');
        skewRow.style.cssText = 'display:flex; gap:8px; align-items:center; font-size:11px; margin:4px 0;';
        const skewLabel = document.createElement('span'); skewLabel.textContent = 'Skew:'; skewRow.appendChild(skewLabel);
        for (const [key, cfg] of Object.entries(_adsrSettingsSkews)) {
            const l = document.createElement('label');
            l.style.cssText = 'display:flex; align-items:center; gap:2px;';
            const num = document.createElement('input'); num.type = 'number';
            num.min = cfg.min; num.max = cfg.max; num.step = 0.1;
            num.value = get(key) ?? cfg.default;
            num.style.cssText = 'width:40px; font-size:11px; padding:1px 2px;';
            num.addEventListener('input', () => {
                const v = Math.max(cfg.min, Math.min(cfg.max, parseFloat(num.value) || cfg.default));
                set(key, v);
            });
            l.appendChild(num);
            l.appendChild(document.createTextNode(cfg.label.replace('-Skew', '')));
            skewRow.appendChild(l);
        }
        pop.appendChild(skewRow);

        // ── Nullpunktversatz-Zeile (ddw.md 20260727, „Bug2"): bewusst Setting statt
        // Panel-Knob (@dpa: „was man später vielleicht auf das Panel schalten kann,
        // siehe todos") — s. defs.js ADSR_SETTINGS_NUMS-Kommentar.
        const numRow = document.createElement('div');
        numRow.style.cssText = 'display:flex; gap:8px; align-items:center; font-size:11px; margin:4px 0;';
        for (const [key, cfg] of Object.entries(_adsrSettingsNums)) {
            const l = document.createElement('label');
            l.style.cssText = 'display:flex; align-items:center; gap:4px;';
            const num = document.createElement('input'); num.type = 'number';
            num.min = cfg.min; num.max = cfg.max; num.step = 0.01;
            num.value = get(key) ?? cfg.default;
            num.style.cssText = 'width:56px; font-size:11px; padding:1px 2px;';
            hint(l, 'Ruhepunkt der Env verschieben (0 = wie bisher; 1 = z.B. für Frequenz-Ziele, die um 1 statt 0 herum arbeiten).');
            num.addEventListener('input', () => {
                const v = Math.max(cfg.min, Math.min(cfg.max, parseFloat(num.value) || cfg.default));
                set(key, v);
            });
            l.appendChild(document.createTextNode(cfg.label));
            l.appendChild(num);
            numRow.appendChild(l);
        }
        pop.appendChild(numRow);

        // ── Buttons: +➚ (Kopie) und 🚮 (löschen) — NUR für echte Multi-ADSR-Instanzen.
        // Amp-Env (sfx='') ist kein envManager-Engine-Eintrag — "Löschen" würde hier die
        // LETZTE Multi-ADSR-Instanz treffen statt Amp-Env selbst (falscher Button-Ziel-Bug),
        // darum bewusst weggelassen statt eines irreführenden Buttons.
        if (sfx) {
            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex; gap:8px; margin-top:8px;';
            const copyBtn = document.createElement('button'); copyBtn.className = 'wb-help-btn'; copyBtn.textContent = '+➚';
            hint(copyBtn, 'Kopie dieser ADSR anlegen');
            copyBtn.addEventListener('click', () => {
                const curVals = {};
                for (const k of Object.keys(polySynthDefsObj.ADSR_DEFAULTS)) {
                    curVals[k] = polySynthState.get(k + sfx) ?? polySynthDefsObj.ADSR_DEFAULTS[k];
                }
                envManager.addEnv();
                const newSfx = '_' + (envManager.engines.length - 1);
                for (const [k, v] of Object.entries(curVals)) polySynthState.set(k + newSfx, v);
            });
            const delBtn = document.createElement('button'); delBtn.className = 'wb-help-btn'; delBtn.textContent = '🚮';
            hint(delBtn, 'Diese ADSR löschen (nach Bestätigung)');
            delBtn.addEventListener('click', () => {
                if (!confirm('ADSR wirklich löschen?')) return;
                envManager.removeEnv();
            });
            btnRow.appendChild(copyBtn); btnRow.appendChild(delBtn);
            pop.appendChild(btnRow);
        }
    },
};

// Header-Buttons für Multi-ADSR (im Poly-Synth-Header, wie Sq)
(() => {
    const h2 = document.querySelector('#bench-polysynth h2');
    if (!h2) return;
    const wrap = document.createElement('span'); wrap.className = 'sq-edit-ctrls';
    const editBtn = document.createElement('button'); editBtn.type = 'button'; editBtn.className = 'wb-help-btn sq-edit-btn';
    editBtn.appendChild(icon('edit', 12)); hint(editBtn, 'ADSR bearbeiten: hinzufügen/entfernen');
    const addBtn = document.createElement('button'); addBtn.type = 'button'; addBtn.className = 'wb-help-btn sq-pm'; addBtn.textContent = '+';
    hint(addBtn, 'ADSR hinzufügen');
    const remBtn = document.createElement('button'); remBtn.type = 'button'; remBtn.className = 'wb-help-btn sq-pm'; remBtn.textContent = '−';
    hint(remBtn, 'Letzte ADSR entfernen (mindestens eine bleibt)');
    addBtn.style.display = remBtn.style.display = 'none';
    let editing = false;
    const sync = () => { remBtn.disabled = envManager.engines.length <= 1; };
    editBtn.addEventListener('click', () => {
        editing = !editing;
        addBtn.style.display = remBtn.style.display = editing ? '' : 'none';
        editBtn.classList.toggle('active', editing);
        sync();
    });
    addBtn.addEventListener('click', () => { envManager.addEnv(); sync(); });
    remBtn.addEventListener('click', () => { envManager.removeEnv(); sync(); });
    wrap.append(editBtn, addBtn, remBtn);
    h2.appendChild(wrap);
})();
window.__env = { mgr: envManager };

// Render-Loop steht GANZ UNTEN in dieser Datei (nach LevelMeter) — ruft sich beim ersten Mal
// SYNCHRON selbst auf (IIFE), bräuchte levelMeter also schon hier (TDZ-Fehler), das aber
// erst weiter unten gebaut wird (s. Kommentar dort, gleiches Muster wie oben bei baseKeyboard).

// ── Stepsequenzer – eigenes ISM (@dpa 20260722_203201, ddw.md: „neues ISM Stepsequenzer:
// Stepsequenzer, Basisclock (n*BaseFreq) mit Teiler (Clock/n) als trigger source. Erstmal
// aus teslacoil 'rüberkopieren' und technisch einbinden. er kriegt ein Output selector - die
// kriegen im Moment AmpEnv mit OSZ") ─────────────────────────────────────────────────────
// Eigener MiniState/eigene Gruppe wie Rec/Takt+Metronom. PHASE4_SPEC.md Paket 4A: die
// Basisclock hängt jetzt am Takt-Tempo (getBeatDurMs-Closure, nur LESEND) statt an Poly-
// Synths BaseFreq — @dpas Kern-Vorwurf „Null mit Tempo/Start/Sync verbunden" (ddw.md
// 20260723_124045). Start/Stop-Kopplung (_onTaktRunning) und Beat-Anker (onClockBeat) s.u.
const STEPSEQ_LS = lsKey('stepseq');
const stepSeqDefsObj = stepSeqDefs();
// Multi-Sq (@dpa 20260723_140151, Entscheidung „Sq = eigene Gruppe"): die flachen Template-
// Einträge aus stepSeqDefs() werden zur PRO-SQ-VORLAGE (sqTpl); die Live-defs-Objekte, die
// mountGroups per Referenz behält, starten LEER und werden vom Sq-Manager je Sequenzer
// indiziert befüllt (seqMult_0, seqMult_1, …). So baut JEDE Sq — auch die erste — über
// denselben dynamischen addGroup-Weg, statt einen statischen Sonderpfad für Sq 0 zu pflegen.
const sqTpl = {
    KNOBS: { ...stepSeqDefsObj.KNOBS }, SELECTS: { ...stepSeqDefsObj.SELECTS },
    TOGGLES: { ...stepSeqDefsObj.TOGGLES }, DEFAULTS: { ...stepSeqDefsObj.DEFAULTS },
    // Default-Grid-Ansicht eines neuen Sq (@dpa 20260725, Seq-0-Optik) — buildSq() nutzt sie.
    GRID_STYLE: { ...stepSeqDefsObj.GRID_STYLE },
};
stepSeqDefsObj.KNOBS = {}; stepSeqDefsObj.SELECTS = {}; stepSeqDefsObj.TOGGLES = {};
stepSeqDefsObj.DEFAULTS = {}; stepSeqDefsObj.GROUPS = [];
const stepSeqState = new MiniState({}, STEPSEQ_LS);
const stepSeqRoot = document.querySelector('#stepseq');
const stepSeq = mountGroups(stepSeqRoot, stepSeqState, stepSeqDefsObj, {
    instrumentScaled: () => stepSeqInstr.scaled(),
});
const getBeatDurMs = () => 60000 / Math.max(1, taktState.get('bpm'));
// Ein Manager für N Sequenzer-Gruppen: baut/entfernt Sqs (die beiden ISM-Buttons), verteilt
// Clock/Transport an ALLE Engines/Grids. engine.js + StepSeqGrid.js bleiben unverändert — sie
// bekommen über einen scoped State-View ihre flachen Keys auf die indizierten umgeschrieben.
// Output-Routing (@dpa: „Output selector — AmpEnv mit OSZ"): alle Sqs teilen sich vorerst den
// einen 'stepseq→polysynth.trig'-Weg; pro-Sq-Outputs (Punkt 1, BaseFreq/Keyboard/Speicher/
// AmpEnv-Gate) baut Sonnet darauf auf. Zustellung läuft seit Phase 2 Paket C über die Registry
// (routing.emit), die gehaltene-Note-Verwaltung liegt gekapselt in polySynthEngine.triggerFromEnv().
const sqManager = createSqManager({
    host: stepSeq, state: stepSeqState, defs: stepSeqDefsObj, tpl: sqTpl,
    getBeatDurMs, routing, createEngine: createStepSeqEngine,
    makeGrid: (st, eng) => new StepSeqGrid(st, eng),
});
sqManager.init();   // Migration Alt-Stand (flache Keys → Sq 0), dann alle gespeicherten Sqs bauen
stepSeq.refresh();
window.__stepseq = { state: stepSeqState, host: stepSeq, mgr: sqManager };
// Routing-Anmeldung + die migrierte Verbindung (Paket C, PHASE2_SPEC.md Punkt 6): Stepseq.amp
// → Poly.trig ist die ECHTE Zustellung (oben routing.emit), nicht nur deklariert.
routing.registerModule('stepseq', {
    label: 'Stepsequenzer', latency: sqManager.latency,
    ...bindPorts(stepSeqDefsObj.ports, {}),
});
routing.connect({ module: 'stepseq', port: 'amp' }, { module: 'polysynth', port: 'trig' });
// Sq-Editiersteuerung im ISM-Header (@dpa 20260723_140151): ein ✎-Toggle blendet [+]/[−] ein,
// die eine Sequenzer-Gruppe anhängen bzw. die letzte entfernen — „von ISM aus delegiert …
// braucht nur die zwei Buttons" (@dpa: logischer als ein Button-Paar pro Gruppe). Sitzt im
// h2 direkt vor dem i-Info-Icon (das mountBenchHelp später anhängt).
(() => {
    const h2 = document.querySelector('#bench-stepseq h2');
    if (!h2) return;
    const wrap = document.createElement('span'); wrap.className = 'sq-edit-ctrls';
    const editBtn = document.createElement('button'); editBtn.type = 'button'; editBtn.className = 'wb-help-btn sq-edit-btn';
    editBtn.appendChild(icon('edit', 12)); hint(editBtn, 'Sequenzer bearbeiten: hinzufügen/entfernen');
    const addBtn = document.createElement('button'); addBtn.type = 'button'; addBtn.className = 'wb-help-btn sq-pm'; addBtn.textContent = '+';
    hint(addBtn, 'Sequenzer hinzufügen');
    const remBtn = document.createElement('button'); remBtn.type = 'button'; remBtn.className = 'wb-help-btn sq-pm'; remBtn.textContent = '−';
    hint(remBtn, 'Letzten Sequenzer entfernen (mindestens einer bleibt)');
    addBtn.style.display = remBtn.style.display = 'none';
    let editing = false;
    const sync = () => { remBtn.disabled = sqManager.count() <= 1; };
    editBtn.addEventListener('click', () => {
        editing = !editing;
        addBtn.style.display = remBtn.style.display = editing ? '' : 'none';
        editBtn.classList.toggle('active', editing);
        sync();
    });
    addBtn.addEventListener('click', () => { sqManager.addSq(); sync(); });
    remBtn.addEventListener('click', () => { sqManager.removeSq(); sync(); });
    wrap.append(editBtn, addBtn, remBtn);
    h2.appendChild(wrap);
})();

// ── Rec – eigenes Instrument (@dpa 20260721: „Rec nicht in Poly drin, sondern als Extra
// Instrument") ────────────────────────────────────────────────────────────────────────
// War Teil von taktmetro/defs.js (Gruppe „Aufnahme") — jetzt eigenständig, weil Rec
// „alles Hörbare" abnehmen soll (lib/audioBus.js, gemeinsamer Master), nicht an EIN
// Instrument gebunden. Start/Stop-Sync (Downbeat-Arming) hängt weiterhin am Takt: das
// Taktmetro-Instrument liefert seine rohen Scheduler-Beats über onClockBeat() nach außen.
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
// Roher Scheduler-Beat, fan-out an Rec (Downbeat-Arming) UND Stepseq (Beat-Anker,
// PHASE4_SPEC.md 4A.3 — taktEngine.onClockBeat ist ein Einzel-Callback, deshalb hier
// gebündelt statt überschrieben).
// `t` ist AudioContext-Zeit in SEKUNDEN (dieselbe Größe, mit der scheduleBeat/metroTick
// oben rechnen) — stepSeqEngine.tick() läuft dagegen auf performance.now()-Millisekunden
// (rAF-Render-Loop). Umrechnen wie recEngine.handleClockBeat/scheduleBeat es schon tun
// ((t - ctx.currentTime) = Vorlauf in Sekunden, ×1000 auf die reale Uhr draufaddiert) —
// ohne diese Umrechnung bleibt der Beat-Anker witzlos (@dpa 20260723_1400: „!! springt
// beim Metronom, aber der Sequenzer läuft stur weiter" — genau dieser Bug: der Anker
// verglich Audio-Sekunden mit rAF-Millisekunden und korrigierte de facto nie etwas).
taktEngine.onClockBeat((t, beat) => {
    recEngine.handleClockBeat(t, beat);
    const ctx = taktEngine.context;
    const beatMs = ctx ? performance.now() + (t - ctx.currentTime) * 1000 : performance.now();
    sqManager.handleClockBeat(beatMs);
});
// Takt gestoppt, während Rec noch auf den nächsten Downbeat wartete → Arm sofort auflösen
// (@dpa 20260722_013727), statt für immer blinkend hängenzubleiben. Stepseq hängt hier mit
// dran (PHASE4_SPEC.md 4A.4): Start armt auf Step 0 (Downbeat-phasengleich), Stop lässt die
// Position auf -1 verfallen. Hängt sich an den EINEN taktEngine.onRunning-Callback an
// (s. _onTaktRunning oben, Zeile ~92) statt ihn zu überschreiben.
// Worker-getriebener Antrieb für den Seq-Transport (ddw.md 20260724_212747, „stabiler
// Bus"): der rAF-Loop unten tickt sqManager nur, solange der Tab sichtbar ist — im
// Hintergrund friert rAF ein und die Sequenzer „senden nichts mehr". Dieser Ticker läuft
// im Worker (nicht gedrosselt) und treibt denselben tick() unabhängig vom Tab-Fokus weiter.
// Nur bei laufendem Transport aktiv (tick() ist ohne Transport ohnehin ein No-op); der
// Doppelantrieb rAF+Worker ist unschädlich, weil tick() gegen `nextAt` idempotent ist.
const seqTicker = makeWorkerTicker(20, (nowMs) => sqManager.tick(nowMs));
_onTaktRunning = (on, avv = true) => {
    if (!on) recEngine.clockStopped();
    sqManager.transport(on, avv);   // avv=false ('|>') → Sequenzer laufen ab Position weiter
    on ? seqTicker.start() : seqTicker.stop();
};
// Rec-Knopf: ON-Farbe folgt der TATSÄCHLICHEN Aufnahme (nicht dem Klick), Blinken zeigt
// den „armed, wartet auf nächsten Takt-Downbeat"-Zustand (Rec-Instrument-TODO 5).
recEngine.onRecording((on) => rec.setCtrlOn('b:rec', on));
recEngine.onRecArmed((armed) => rec.setCtrlBlink('b:rec', !!armed));
window.__rec = { engine: recEngine, state: recState, host: rec };
// Routing-Anmeldung (Paket B): der `clock`-Input ist noch nicht die aktive Zustellung — die
// echte Verbindung bleibt taktEngine.onClockBeat(recEngine.handleClockBeat) oben (braucht Zeit
// UND beatInBar, ein skalarer Gate-Wert reicht dafür nicht). write() ist ein Platzhalter für
// eine spätere Migration mit einem passenderen Payload/Adapter (s. PHASE2_SPEC.md, offene
// Mikro-Entscheidung); die Registry kennt die Verbindung nur für die Struktur-Ansicht.
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

// ── LevelMeter – eigenes Instrument (ISM), @dpa 20260722 (ddw.md) ──────────────────────
// "soll dem Level ISM angehören, aber kein Header besitzen und keinen extra BG" — trotzdem
// ein ECHTES GroupHost-Control (mountGroups mit genau einer, leeren Gruppe), damit es wie
// jedes andere Control im e-Mode verschiebbar ist und Rechtsklick-Settings bekommt; Kopf-
// zeile/Hintergrund sind nur weggestylt (css/werkbank.css #levelmeter/.wb-bare).
const LEVELMETER_LS = lsKey('levelmeter');
const levelMeterState = new MiniState({}, LEVELMETER_LS);
const levelMeterRoot = document.querySelector('#levelmeter');
const levelMeterHost = mountGroups(levelMeterRoot, levelMeterState, { GROUPS: [{ name: 'Meter' }] });
const levelMeter = new LevelMeter(() => getBusAnalyser(), () => getBusLimiter());
levelMeterHost.mountInGroup('Meter', levelMeter.element, 'u:meter');
hint(levelMeter.element, 'Ausgangspegel des gesamten Ensembles (dBFS, Peak-Hold).');
levelMeterHost.registerCtrlStyle('u:meter', 'levelmeter', levelMeter.element, (s) => levelMeter.applyStyle(s), 'Level');
levelMeterHost.refresh();
window.__levelMeter = { state: levelMeterState, host: levelMeterHost, meter: levelMeter };

// ── Signal-Scopes – eigenes ISM (@dpa 20260726) ────────────────────────────────────
// Schmale Steuersignal-Oszilloskope zum „Reinklinken": Quelle → scope_i.in zeigt an,
// scope_i.out reicht denselben Wert optional weiter (Passthrough), sodass eine
// bestehende Verbindung NICHT unterbrochen werden muss. Vervielfältigbar wie ADSR,
// Settings (Buffer/min/max/Auto-Range/Meter/Kurve/Maße/Farben + ➚/🚮) per Rechtsklick.
const SCOPE_LS = lsKey('scope');
const scopeState = new MiniState({ scopeCount: 1 }, SCOPE_LS);
const scopeRoot = document.querySelector('#scopes');
const scopeDefs = { GROUPS: [] };
const scopeHost = mountGroups(scopeRoot, scopeState, scopeDefs, {
    groupKindSettings: (kind) => _scopeKindSettings[kind],
});
const scopeManager = createScopeManager({ host: scopeHost, state: scopeState, defs: scopeDefs, routing });
scopeManager.init();
mountInstrumentSettings(document.querySelector('#bench-scope'), scopeState, { defaultName: 'Signal-Scopes' });

// Scope-Settings im Gruppen-Rechtsklick-Panel (kompakt, 2-spaltig — wie ADSR)
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
        // @dpa 20260727: keine Reflex-Limits, weder bei Werten NOCH bei Pixel-Maßen ("stell
        // Dir ein 8k Display vor") — großzügig statt "zur Sicherheit knapp", überall.
        // bufferMs klemmt intern ohnehin an der Web-Audio-FFT-Grenze (SignalScope.js).
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

// Header-Buttons (+/−) für die Scopes, wie bei Sq/ADSR
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

// Render-Loop: Base-Frq-Anzeigen (baseKeyboard/Tone-/Freq-Readout) UND LevelMeter zeichnen
// sich nicht von allein — tickt wie in teslacoil.
(function tick(nowMs) {
    baseKeyboard.tick(); toneReadout.tick(); freqReadout.tick();
    levelMeter.tick();
    sqManager.tick(nowMs);
    routing.flush();   // verbundene VALUE-Ports sampeln (Phase 2.3) — Event-Ports laufen über emit()
    envManager.flush();   // Multi-ADSR: Env-Werte an gewählte Ziele liefern (ddw.md 20260725)
    scopeManager.tick();  // Signal-Scopes zeichnen + Passthrough (@dpa 20260726)
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
    document.querySelector('.topbar-right').appendChild(wireHeaderBtnSettings('hdr:' + id, btn, label));
    return btn;
};
// Jedes Instrument hat sein EIGENES KeyMidi (eigener mountGroups-Aufruf) — der globale
// Header-Schalter muss deshalb BEIDE zugleich schalten (Poly-Synth-Instrument Schritt 1,
// @dpa 20260721: die neuen Base-Frq/Audio-Osz-Controls sollen wie taktgeber lernbar sein).
// Bugfix (@dpa 20260723_124045, ddw.md: „Sequenzer ist immer noch in einem veralteten ISM
// Hülle"): stepSeq.keyMidi fehlte hier UND im globalen Tastendruck-Dispatch (s.u.) — Stepseq
// wurde später als die anderen drei ISMs angeflanscht, diese zwei Stellen wurden dabei nicht
// nachgezogen. Tasten/MIDI-Learn wirkte über Stepseqs Controls (seqEnabled/seqOutput/
// seqMult/seqDiv/u:seqGrid) dadurch NIE — kein Architektur-Thema, schlicht vergessen.
const keyBtn = mkHeaderToggle('keyedit', '⌨ Tasten', 'Tastenbelegung über allen Controls anzeigen/ändern — nur einer von Tasten/MIDI zugleich', (on) => { keyMidi.setKeyEdit(on); polySynth.keyMidi.setKeyEdit(on); stepSeq.keyMidi.setKeyEdit(on); rec.keyMidi.setKeyEdit(on); });
const midiBtn = mkHeaderToggle('midiedit', '🎹 MIDI', 'MIDI-Learn über allen Controls anzeigen/ändern — nur einer von Tasten/MIDI zugleich', (on) => { keyMidi.setMidiEdit(on); polySynth.keyMidi.setMidiEdit(on); stepSeq.keyMidi.setMidiEdit(on); rec.keyMidi.setMidiEdit(on); });
keyBtn._radioPeer = midiBtn; midiBtn._radioPeer = keyBtn;

// ── Help Hints (@dpa 20260720): die (editierten bzw. Auslieferungs-)Hilfetexte als Hover-Blase
// über allen Controls; ein Header-Knopf „Hints" neben „MIDI" schaltet sie global an/aus. ──
const hintResolve = (el) => {
    const c = el.closest && el.closest('[data-ctrl]');
    if (c) {
        const id = c.dataset.ctrl;
        // Jedes Instrument hat sein EIGENES hintText im eigenen State (@dpa 20260722_013727:
        // Bugfix — vorher fiel Poly-Synth/Rec immer auf das globale `state` zurück, darum
        // tauchten dort editierte Hilfe-Texte nie als Hover-Blase auf). Stepseq fehlte hier
        // ebenfalls (@dpa 20260723_124045, s. Kommentar am keyBtn/midiBtn oben) — nachgezogen.
        const st = c.closest('#taktgeber') ? taktState
                 : c.closest('#polysynth') ? polySynthState
                 : c.closest('#stepseq') ? stepSeqState
                 : c.closest('#rec') ? recState
                 : state;
        const own = (st.get('hintText') || {})[id];
        // Bugfix (@dpa ddw.md 20260724_153349, „De/En: die Hilfstexte auch!"): hier stand fest
        // 'de' — die Hover-Hilfe für Controls blieb deutsch, egal was in main Config/Sprache
        // steht. ElementSettings.js/KnobMetaEditor.js riefen factoryHint() schon korrekt mit
        // lang() auf, nur dieser Hover-Pfad nicht.
        return own || factoryHint(id, curLang()) || c.dataset.hint || (el.dataset && el.dataset.hint) || '';
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
// Derselbe Fehler wiederholt sich (gefunden 20260724 beim Combo-/Snapshot-Speicher-Umbau):
// 'werkbank_stepseq' fehlte hier seit dessen Einführung — jeder Export/Reset ließ den
// kompletten Sequenzer-Stand (inkl. seiner künftigen Combo-/Snapshot-Pools) außen vor.
// 'werkbank_ensemble' (neu, s.u.) MUSS von Anfang an rein — genau dieser Fehler soll sich
// kein drittes Mal wiederholen.
// 'scope' war GENAU dieses dritte Mal (@dpa dd.md 20260801_2, beim Einstiegs-Trennen
// aufgefallen): das Signal-Scope-ISM fehlte hier seit seiner Einführung, werkbank-leer.js
// führt es von Anfang an mit. Jetzt auch hier — Export/Reset erfassen den Scope-Stand.
// Die Keys tragen das Präfix DIESES Einstiegs (lsKey, s. lib/appId.js); für index.html ist
// das unverändert 'werkbank_…', weil 'werkbank' der data-app-Default ist.
const LS_KEYS = ['state', 'taktmetro', 'polysynth', 'stepseq', 'rec', 'levelmeter', 'master', 'ensemble', 'scope'].map(lsKey);

// ── Ensemble-Snapshot (@dpa 20260724, ddw.md „header Ensemble Snapshots") — vierte und
// äußerste Ebene des Combo-/Snapshot-Speichers: EIN benannter Zustand über mehrere
// Instrumente hinweg. Master-Volume/LevelMeter bewusst NICHT dabei (@dpa: „Master Fader
// bleibt extra") — sie fehlen einfach in der instruments-Liste, kein Sonderfall im Store.
const ENSEMBLE_LS = lsKey('ensemble');
const ensembleState = new MiniState({}, ENSEMBLE_LS);
const ensembleStore = createEnsembleStore(ensembleState, [
    { lsKey: TAKT_LS, state: taktState, allSoundValues: () => takt.allSoundValues() },
    { lsKey: POLYSYNTH_LS, state: polySynthState, allSoundValues: () => polySynth.allSoundValues() },
    // Stepseq: Anzahl + Ansicht der Sqs sind ISM-weit (keine Gruppe) → mit sichern, und nach
    // dem Recall Struktur+Optik angleichen (sonst käme aus dem Ensemble-Snapshot die Sequenzer-
    // Anzahl/Ansicht ebenso wenig zurück wie beim ISM-Snapshot, @dpa 20260725).
    {
        lsKey: STEPSEQ_LS, state: stepSeqState, allSoundValues: () => stepSeq.allSoundValues(),
        snapExtra: () => sqManager.snapshotExtra(),
        onRecalled: (extra, values) => sqManager.recallSnapshot(extra, values),
    },
    { lsKey: REC_LS, state: recState, allSoundValues: () => rec.allSoundValues() },
]);
window.__ensemble = { state: ensembleState, store: ensembleStore };
function buildConfig() {
    const ls = {};
    for (const k of LS_KEYS) { const v = localStorage.getItem(k); if (v != null) { try { ls[k] = JSON.parse(v); } catch { /* skip */ } } }
    return { _werkbank: 1, saved: new Date().toISOString(), ls };
}
function applyConfig(obj) {
    const ls = (obj && obj.ls) || obj || {};   // toleriert nacktes { key: data }
    // Fremde Präfixe umbiegen (@dpa dd.md 20260801_2): eine Export-Datei trägt die Keys
    // DER SEITE, auf der sie entstand (und jede Datei von vor der Einstiegs-Trennung
    // durchweg 'werkbank_…'). Ohne das Umbiegen ließe sich ein Export nur dort wieder
    // einlesen, wo er gemacht wurde. Erst auf die eigenen Keys normalisieren, dann wie
    // gehabt nur die BEKANNTEN Bereiche übernehmen (nichts Fremdes in den localStorage).
    const own = {};
    for (const [k, v] of Object.entries(ls)) own[toOwnKey(k)] = v;
    let n = 0;
    for (const k of LS_KEYS) if (own[k] != null) { localStorage.setItem(k, JSON.stringify(own[k])); n++; }
    return n;
}
function exportConfig() {
    const blob = new Blob([JSON.stringify(buildConfig(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);   // YYYYMMDDHHMMSS, ohne den Millisekunden-Punkt
    // Dateiname trägt den Ensemble-Namen (@dpa dd.md 20260802: "sollten ihren Namen vom
    // Ensemblenamen übernehmen") — sonst heißen Exports aus verschiedenen Einstiegen gleich.
    a.href = url; a.download = APP + '-config-' + ts + '.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// Zahnrad statt ⚙-Glyph (@dpa dd.md 20260802: „Auch das schöne Zahnrad icon"): das SVG aus
// lib/icons.js füllt seinen Rahmen aus, ein Unicode-⚙ tut das je nach Systemfont nicht (s.
// Kopf von icons.js). Der Text sitzt im .hdr-btn-text-Span, damit das Umbenennen über die
// Rechtsklick-Settings das Icon nicht mitlöscht.
const cfgBtn = document.createElement('button');
cfgBtn.className = 'pb-btn hdr-btn-ico'; cfgBtn.id = 'cfgmenu'; cfgBtn.type = 'button';
cfgBtn.appendChild(icon('gear', 14));
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
// Reset-Logik EINMAL (PLAN_OPERA.md 1.3): bisher nur versteckt unter ⚙ Config → ↺ Reset
// erreichbar — jetzt zusätzlich ein sichtbarer Header-Button (s.u.), beide rufen dieselbe
// Funktion, derselbe Bestätigungsdialog.
function doReset() {
    if (confirm('Wirklich ALLES zurücksetzen? Umbenennungen, Anordnung, Belegungen gehen verloren.')) { LS_KEYS.forEach((k) => localStorage.removeItem(k)); location.reload(); }
}
// ⚙ = ein echtes EINSTELLUNGS-FENSTER (@dpa dd.md 20260802: „es ist derzeit zu wenig
// ‚Einstellungs'-mäßig … das ganze graue Fenster design"). Bis hierhin war es ein
// MiniSettings-Popover, also dieselbe Chrome, die auch ein Rechtsklick auf EIN Element
// aufmacht — man sah dem ⚙ nicht an, dass es das ganze Werkzeug meint. Jetzt: modales
// Fenster über abgedunkeltem Grund (lib/SettingsWindow.js), Themen-Abschnitte mit
// Reichweite und Erklärung hinter dem i-Icon, Inhalt gemeinsam mit allen anderen
// Pool-Einstiegen (lib/mainSettings.js).
const cfgWin = new SettingsWindow('Einstellungen');
const openCfg = () => {
    cfgBtn.classList.add('active');
    cfgWin.open((f) => buildMainSettings(f, {
        state,
        onExport: () => exportConfig(),
        onImport: () => fileIn.click(),
        onReset: doReset,
        reopen: () => { cfgWin.close(); openCfg(); },
    }), () => cfgBtn.classList.remove('active'));
};
cfgBtn.addEventListener('click', () => { cfgWin.isOpen ? cfgWin.close() : openCfg(); });
window.__cfg = { build: buildConfig, apply: applyConfig };   // Test-/Debug-Haken

// Ensemble-Snapshot-Menü im Header (@dpa 20260724, Feinschliff 20260724_114012: rechts neben
// „Werkbank" statt bei ⚙ Config, UND mit echten Rechtsklick-Settings wie ein normales
// select-Control) — direkt als PickMenu, kein eigener Toggle-Knopf nötig (PickMenu bringt
// Knopf+Popup schon mit, wie beim Sq-Output-Menü). noContextOpen: die eigene Optik-
// Rechtsklick-Kette unten (hdrElemSettings, dasselbe Muster wie wireHeaderBtnSettings) soll
// den Rechtsklick bekommen, nicht PickMenus eingebautes „geh auf".
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

// Sichtbarer Header-Button (PLAN_OPERA.md 1.3, @dpa 20260723: „Header/Reset: falsch verstanden!
// Es soll hängendes Audio reseten! NICHT alles! Nur das momentane Audio" — der volle Wipe
// (localStorage leeren) bleibt bewusst NUR im ⚙ Config-Menü (doReset oben, absichtlich weniger
// erreichbar für eine so folgenreiche Aktion). Der schnell erreichbare Header-Button ist ein
// Panik-Knopf: klingende/hängende Voices sofort stumm, aber Einstellungen/Anordnung/Transport
// bleiben unangetastet.
const resetBtn = document.createElement('button');
resetBtn.className = 'pb-btn'; resetBtn.id = 'headerreset'; resetBtn.type = 'button';
resetBtn.textContent = '🔇 Audio-Reset'; resetBtn.title = 'Hängende/klingende Noten sofort stummschalten (keine Einstellungen betroffen)';
const activateHeaderReset = () => { polySynthEngine.allNotesOff(); };
resetBtn.addEventListener('click', activateHeaderReset);
document.querySelector('.topbar-right').appendChild(wireHeaderBtnSettings('hdr:headerreset', resetBtn, '🔇 Audio-Reset'));
// MIDI-/Tasten-Learn (@dpa ddw.md 20260723_210324, „soll auch 'learn' kriegen"). `self:true`
// (@dpa 20260724_003531, image-3/4.png: „beide auf beidem nicht" — OHNE das Flag landet die
// Registrierung im Badge-Overlay-Pfad statt in der Banner-Zeile, in der ALLE Geschwister-
// Header-Buttons (Tasten/MIDI/Hints/Config/Rec-Format) ihr Learn-Panel zeigen, s. `hdr:keyedit`
// unten — ohne das Flag blieb Reset optisch unsichtbar dabei).
keyMidi.register('hdr:headerreset', resetBtn, '🔇 Audio-Reset', activateHeaderReset, { self: true });

// Struktur-Ansicht (Phase 3, PLAN_OPERA.md/PHASE3_SPEC.md): read-only Karte der
// Routing-Registry — macht die seit Phase 2 bestehende, aber unsichtbare Verkabelung
// endlich sichtbar (@dpa 20260723: „ich sehe davon NICHTS"). Toggle wie der Config-Knopf,
// kein Radio-Peer der Tasten/MIDI-Schalter.
const structureBtn = document.createElement('button');
structureBtn.className = 'pb-btn'; structureBtn.id = 'structurebtn'; structureBtn.type = 'button';
structureBtn.textContent = '⧉ Struktur'; structureBtn.title = 'Struktur-Ansicht: Module + Verbindungen (nur ansehen)';
document.querySelector('.topbar-right').appendChild(wireHeaderBtnSettings('hdr:structurebtn', structureBtn, '⧉ Struktur'));
const structureView = createStructureView(routing, {
    button: structureBtn,
    // Position merken (ddw.md 20260726): wie groupSettingsPos in GroupHost.js.
    posStore: { get: () => state.get('structureViewPos'), set: (pos) => state.set('structureViewPos', pos) },
});
const activateStructureBtn = () => { structureView.isOpen() ? structureView.close() : structureView.open(); };
structureBtn.addEventListener('click', activateStructureBtn);
// MIDI-/Tasten-Learn (@dpa ddw.md 20260723_210324) — `self:true`, s. Kommentar bei headerreset oben.
keyMidi.register('hdr:structurebtn', structureBtn, '⧉ Struktur', activateStructureBtn, { self: true });
window.__structure = { view: structureView };

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
keyMidi.register('hdr:cfgmenu', cfgBtn, 'Einstellungen', () => cfgBtn.click(), { self: true });
keyMidi.register('hdr:recfmtmenu', recFmtBtn, '⚙ Rec-Format', () => recFmtBtn.click(), { self: true });
// Globale Verteilung: ein belegter Tastendruck löst sein Control aus (nur außerhalb des
// Overlay-Modus; KeyMidi selbst hält sich von echter Texteingabe fern). Jedes Instrument hat
// sein EIGENES KeyMidi (eigener mountGroups-Aufruf, s.o.) — bisher wurde nur takt.keyMidi
// verteilt, darum feuerten gelernte Tasten auf Poly-Synth-/Rec-Controls (z.B. Akkord-Speicher-
// Slots) nie (@dpa 20260722_155726: "die gesetzten shortcuts funktionieren nicht").
window.addEventListener('keydown', (e) => keyMidi.dispatchKey(e));
window.addEventListener('keydown', (e) => polySynth.keyMidi.dispatchKey(e));
window.addEventListener('keydown', (e) => stepSeq.keyMidi.dispatchKey(e));
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
// EN-Fassung der Auslieferungs-Hilfetexte (@dpa ddw.md 20260724_183901, "fehlende
// Übersetzungen: ... alle ISM Hilfen"). Die DEUTSCHEN Texte bleiben in index.html
// (.wb-note) — der deutsche Text IST auch hier das Original, das die Nutzer:innen zuerst
// sehen; Englisch steht daneben, keyed über die section-Id (nicht über den Wortlaut, der
// ist mehrsätziges HTML). state.instrHelpMd (Markdown-Override, s.u.) schlägt BEIDE.
const BENCH_HELP_EN = {
    'bench-taktgeber': 'Two groups from <b>one</b> declarative defs source (mapped from ' +
        'taktgeber), rendered with teslacoil’s factories. <b>e</b> = arrange mode ' +
        '(groups/controls can be dragged freely). Right-click a group title = settings, ' +
        'right-click a control = its look. Dragged values = a “knob without a knob”. ' +
        'The header switch <b>⌨ Keys/MIDI</b> shows/changes key bindings + MIDI learn ' +
        'across all controls. <b>▶</b> (or the bound key) starts the metronome — real ' +
        'sound from taktgeber’s metro.js/clock.js.',
    'bench-polysynth': 'Polyphonic voice engine (poly, stealing, Osc2/detune), base-freq ' +
        'quantisation with pitch glide, real ADSR per voice, and a play keyboard (mouse + ' +
        'MIDI, hold toggle). Played directly via the keyboard — no separate test tone ' +
        'anymore.',
    'bench-stepseq': 'Its own trigger clock, locked to the beat tempo (no longer to the ' +
        'Poly-Synth base freq): 1/1 (multiplier=1, divider=1) hits exactly one beat, the ' +
        'multiplier multiplies, the divider divides. Only runs while transport is running, ' +
        'starts in phase with it at step 0. The output choice decides where an active step ' +
        'fires — currently only “AmpEnv+OSZ” (triggers a hit on the Poly-Synth, ' +
        'using its amp envelope/oscillator).',
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

    // Sprachwechsel (@dpa ddw.md 20260724_183901): Hover-Hint sofort neu ziehen, ein OFFENES
    // Popover (nur wenn nicht gerade editiert wird — sonst risse es den Editor-Text weg) neu
    // rendern, statt erst beim nächsten Öffnen die neue Sprache zu zeigen.
    onLangChange(() => { updateBtnHint(); if (pop && !editing) render(); });
}
mountBenchHelp('bench-taktgeber', taktState);
mountBenchHelp('bench-polysynth', polySynthState);
mountBenchHelp('bench-stepseq', stepSeqState);
mountBenchHelp('bench-rec', recState);

// ── Instrument-Settings, generalisiert (@dpa 20260721: „Instrument allgemein: mit eigen
// Einstellungen, erstmal gleich wie Gruppen") + Verschieben via Header ──────────────────
// lib/InstrumentSettings.js ersetzt den früheren Einzelbau (nur für taktgeber): BG-Farbe +
// Größe % wie bei Gruppen, dazu Drag am Header. Jedes Instrument bekommt das jetzt gleich.
// opts.host (@dpa 20260724, ISM-Snapshot): jedes Instrument reicht seine mountGroups()-
// Rückgabe mit rein — InstrumentSettings.js nutzt host.allSoundValues() für den Snapshot.
const taktInstr = mountInstrumentSettings(benchTakt, taktState, { bodySelector: '#taktgeber', host: takt });
const polySynthInstr = mountInstrumentSettings(document.querySelector('#bench-polysynth'), polySynthState, { bodySelector: '#polysynth', host: polySynth });
const stepSeqInstr = mountInstrumentSettings(document.querySelector('#bench-stepseq'), stepSeqState, {
    bodySelector: '#stepseq', host: stepSeq,
    // sqCount + volle Sq-Ansicht gehören zu keiner Gruppe (ISM-weit) → allSoundValues() erfasst
    // sie nicht. Ohne sie käme nach dem Recall weder die Sq-ANZAHL noch die ANSICHT der neu
    // gebauten Sequenzer zurück (@dpa 20260725: Snapshot stellte gelöschte Sequenzer + deren
    // Ansichten nicht wieder her). recallSnapshot() setzt Anzahl, stellt die Optik her und baut.
    snapExtra: () => sqManager.snapshotExtra(),
    onSnapRecalled: (extra, values) => sqManager.recallSnapshot(extra, values),
});
const recInstr = mountInstrumentSettings(document.querySelector('#bench-rec'), recState, { bodySelector: '#rec', host: rec });
window.__takt.instr = taktInstr;
window.__polysynth.instr = polySynthInstr;
window.__stepseq.instr = stepSeqInstr;
window.__rec.instr = recInstr;

// „Zurücksetzen"-Knopf entfernt (@dpa 20260719_040136). Reset weiterhin über die Konsole:
//   MiniState.reset(); MiniState.reset('werkbank_taktmetro'); location.reload();

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
import { targetKind, globalKeyOk, arrowKeyOk } from './lib/keyRoute.js';
import { mountGroups } from './lib/group/GroupHost.js';
import { taktMetroDefs } from './lib/taktmetro/defs.js';
import { createTaktEngine } from './lib/taktmetro/engine.js';

const state = new MiniState({
    ampSeqLen: 8,
    ampSeqSteps: [1, 0, 0.6, 0, 1, 0.3, 0, 0.8],
    seqStyles: { amp: { w: 270, h: 64, bg: '#0e1116', col: 'rgba(255,159,90,1)' } },
});

const metaEditor = new KnobMetaEditor(state);
const elemSettings = new ElementSettings(state);

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
// Der Abspielkopf zeichnet sich nicht von allein – in teslacoil tickt ihn der Render-Loop.
(function tick() { seqUI.tick(); requestAnimationFrame(tick); })();

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
// taktgeber). onAction(id) hat dieselbe Signatur wie die alte Attrappe — die defs bleiben
// audio-blind.
const TAKT_LS = 'werkbank_taktmetro';
const taktState = new MiniState(taktMetroDefs().DEFAULTS, TAKT_LS);
const taktRoot = document.querySelector('#taktgeber');
const taktEngine = createTaktEngine(taktState);
const taktDefs = taktMetroDefs({ onAction: (id) => taktEngine.onAction(id) });
const takt = mountGroups(taktRoot, taktState, taktDefs, {});
// Der Start-Knopf trägt den ON-Zustand (Metronom läuft) → nutzt die „BG an"-Farbe (Task D).
taktEngine.onRunning((on) => takt.setCtrlOn('b:start', on));
// Die Takt-Anzeige leuchtet auf dem laufenden Beat (zeit-ausgerichtet vom Engine).
taktEngine.onBeat((i) => takt.setBeat('u:beatView', i));

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
const keyBtn = mkHeaderToggle('keyedit', '⌨ Tasten', 'Tastenbelegung über allen Controls anzeigen/ändern — nur einer von Tasten/MIDI zugleich', (on) => keyMidi.setKeyEdit(on));
const midiBtn = mkHeaderToggle('midiedit', '🎹 MIDI', 'MIDI-Learn über allen Controls anzeigen/ändern — nur einer von Tasten/MIDI zugleich', (on) => keyMidi.setMidiEdit(on));
keyBtn._radioPeer = midiBtn; midiBtn._radioPeer = keyBtn;
// Die Haupt-Buttons SELBST tasten-/MIDI-zuweisbar (@dpa 20260719_120425): self-Targets —
// kein Badge über dem Button, das Learning erscheint DARUNTER (mit [↵] bei der Taste).
keyMidi.register('hdr:keyedit', keyBtn, '⌨ Tasten', () => keyBtn.click(), { self: true });
keyMidi.register('hdr:midiedit', midiBtn, '🎹 MIDI', () => midiBtn.click(), { self: true });
// Globale Verteilung: ein belegter Tastendruck löst sein Control aus (nur außerhalb des
// Overlay-Modus; KeyMidi selbst hält sich von echter Texteingabe fern).
window.addEventListener('keydown', (e) => keyMidi.dispatchKey(e));

// ESC verlässt den MIDI-Learn-Modus (NICHT den Tasten-Modus — @dpa 20260719). Läuft über
// den Button-Klick, damit dessen .active-Zustand synchron bleibt. Ein aktiver Lern-Vorgang
// (Banner/Horchen) fängt ESC vorher per capture ab → erst zweites ESC verlässt den Modus.
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && midiBtn.classList.contains('active')) midiBtn.click();
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
//    wandert in ein schwebendes Popover, das ein [?] rechts in der Headline öffnet. ─────
function mountBenchHelp(sectionId) {
    const section = document.querySelector('#' + sectionId);
    if (!section) return;
    const note = section.querySelector(':scope > .wb-note');
    const h2 = section.querySelector('h2');
    if (!note || !h2) return;
    const summary = note.querySelector('summary');
    const title = summary ? summary.textContent.trim() : '';
    const clone = note.cloneNode(true);
    const s = clone.querySelector('summary'); if (s) s.remove();
    const bodyHtml = clone.innerHTML.trim();
    note.remove();

    const btn = document.createElement('button');
    btn.className = 'wb-help-btn'; btn.type = 'button'; btn.textContent = '?';
    btn.title = 'Beschreibung anzeigen';
    h2.appendChild(btn);

    let pop = null;
    const close = () => {
        if (!pop) return;
        pop.remove(); pop = null; btn.classList.remove('active');
        document.removeEventListener('mousedown', onOut, true);
        document.removeEventListener('keydown', onKey, true);
    };
    const onOut = (e) => { if (pop && !pop.contains(e.target) && e.target !== btn) close(); };
    const onKey = (e) => { if (e.key === 'Escape' && pop) { e.stopPropagation(); close(); } };
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (pop) { close(); return; }
        pop = document.createElement('div'); pop.className = 'wb-help-pop';
        pop.innerHTML = (title ? `<div class="wb-help-title">${title}</div>` : '') + `<div class="wb-help-body">${bodyHtml}</div>`;
        document.body.appendChild(pop);
        btn.classList.add('active');
        const r = btn.getBoundingClientRect();
        pop.style.left = Math.max(8, Math.min(r.right - pop.offsetWidth, window.innerWidth - pop.offsetWidth - 8)) + 'px';
        pop.style.top = (r.bottom + 6) + 'px';
        setTimeout(() => { document.addEventListener('mousedown', onOut, true); document.addEventListener('keydown', onKey, true); }, 0);
    });
}
mountBenchHelp('bench-taktgeber');

// „Zurücksetzen"-Knopf entfernt (@dpa 20260719_040136). Reset weiterhin über die Konsole:
//   MiniState.reset(); MiniState.reset('werkbank_taktmetro'); location.reload();

/**
 * GroupHost.js — teslacoils Gruppen + Free-Canvas-e-Mode als eigenständiger Baustein.
 *
 * Das ist das lange offene „Gruppe als Baustein" (README → „Noch offen"). Der Code ist
 * ein **treuer Port** aus teslacoils `js/app.js` (Control-Fabriken + Anordnen-Modus +
 * Gruppen-Positionen/-Settings), NICHT ein Nachbau — genau das Nachbauen war in taktgeber
 * „eigener Scheiß" geworden. Die teslacoil-Domäne (Skaler/Reverb/BaseFrq/Seq/Debug) bleibt
 * draußen; hier lebt nur das Generische.
 *
 * ── Die Naht ────────────────────────────────────────────────────────────────────────
 * `mountGroups(root, state, defs, opts)`:
 *   state — braucht `get(key)`, `set(key,val)`, `subscribe((key,data)=>…)` (MiniState kann das).
 *   defs  — DEKLARATIV, ein Ort pro Modul:
 *     { KNOBS, SELECTS, SEGMENTS, TOGGLES, TEXTS, NOTES, BUTTONS, DEFAULTS, GROUPS }
 *     KNOBS[key]   = { label, min, max, step?, curve?, unit?, decimals?, formatValue?, meta? }
 *                    meta = Default-Gestalt (z.B. { viewSize:'none' } = „ohne Knob")
 *     SELECTS[key] = { label, options:[str], optionTitles?:{opt:info} }
 *     SEGMENTS[key]= { label, options:[{ v, l, title? }] }   (neue Sorte aus taktgeber)
 *     TOGGLES[key] = { label, title? }
 *     TEXTS[key]   = { label, lines?, placeholder?, labelOn? }
 *     NOTES[key]   = { label }
 *     BUTTONS[key] = { label, icon?, title?, onClick(key) }
 *     DEFAULTS[key]= Auslieferungswert (Doppelklick auf einen Knob springt dorthin)
 *     GROUPS = [ { name, selects?, segments?, toggles?, inlineKnobs?, knobs?, texts?, notes?, buttons? } ]
 *   opts  — { onArrangeChange?(on) }  (z.B. um einen Header-Schalter zu spiegeln)
 *
 * Rückgabe: { panel, setArranging(on), isArranging(), refresh() }.
 *
 * Persistenz-Keys im State (Optik-Ebene, wie teslacoils LAYOUT_KEYS):
 *   ctrlStyles · knobMeta · ctrlPos · groupPos · groupStyles · groupOrder · controlOrder
 */
import { Knob } from '../Knob.js';
import { KnobMetaEditor } from '../KnobMetaEditor.js';
import { ElementSettings } from '../ElementSettings.js';
import { icon } from '../icons.js';
import { hint, text as i18nText } from '../i18n.js';
import { globalKeyOk, arrowKeyOk } from '../keyRoute.js';
import { parseHex, parseA, hexA } from '../rgba.js';
import { upgradeColorInputs } from '../colorPick.js';
import { makeDraggable } from '../dragPanel.js';
import { Midi } from '../keymidi/Midi.js';
import { KeyMidi } from '../keymidi/KeyMidi.js';
import { normOptions } from '../optionNotation.js';
import { createSizeHintSystem } from '../SizeHint.js';
import { PickMenu } from '../PickMenu.js';
import { renameIn, stripSuffix, addSuffix, groupValueKeys } from '../soundKeys.js';

/**
 * Optik eines Keyboard-Bretts (Control-Sorte `keyboard`, 1:1 teslacoils `kbStyle` —
 * Base-Keyboard UND Poly-Synth-Spieltastatur teilen sie sich): Werte gehen als CSS-
 * Variablen ans Brett, die Tasten (`.kb-key`) errechnen sich selbst daraus (12 gleich
 * breite Spalten je Oktave). `boxSize`/`boxH` sind EINE Taste, nicht das ganze Brett.
 * Modulebene statt in der `mountGroups`-Closure, weil auch ENGINE-gebundene, außerhalb von
 * `defs` gebaute Keyboard-Controls (z.B. `lib/polysynth/ui/PlayKeyboard.js`, @dpa
 * 20260721_203557) dieselbe Optik-Anwendung brauchen, s. `registerCtrlStyle`/`mountInGroup`.
 */
export function kbStyle(el) {
    return (s) => {
        el.style.setProperty('--kb-key-w', s.boxSize ? s.boxSize + 'px' : '');
        el.style.setProperty('--kb-key-h', s.boxH ? s.boxH + 'px' : '');
        el.style.setProperty('--kb-gap', s.gap != null ? s.gap + 'px' : '');
        el.style.setProperty('--kb-on', s.fg || '');
        el.style.background = s.bg || '';
        // Anordnung (@dpa 20260721_205531): Oktaven-Zeilen gestapelt (Default) vs. eine
        // durchgehende horizontale Reihe — reine Optik-Klasse, keine DOM-Änderung nötig.
        el.classList.toggle('kb-horiz', !!s.horiz);
    };
}

export function mountGroups(root, state, defs, opts = {}) {
    const KNOBS = defs.KNOBS || {}, SELECTS = defs.SELECTS || {}, TOGGLES = defs.TOGGLES || {};
    const TEXTS = defs.TEXTS || {}, NOTES = defs.NOTES || {}, BUTTONS = defs.BUTTONS || {};
    const SEGMENTS = defs.SEGMENTS || {}, DISPLAYS = defs.DISPLAYS || {};
    const WECHSEL = defs.WECHSEL || {};
    const DEFAULTS = defs.DEFAULTS || {}, GROUPS = defs.GROUPS || [];

    const metaEditor = new KnobMetaEditor(state);
    const elemSettings = new ElementSettings(state);
    // Meta-Änderungen (KnobMetaEditor) landen in knobMeta (Optik), pro Knob-Key.
    metaEditor.onApply = (knob) => {
        const all = { ...(state.get('knobMeta') || {}) };
        all[knob.id.replace(/^knob_/, '')] = knob.getMeta();
        state.set('knobMeta', all);
    };
    // Element-Settings (Select/Toggle/Text/Note/Button) landen in ctrlStyles, pro data-ctrl-id.
    elemSettings.onApply = (id, style) => {
        const cur = { ...(state.get('ctrlStyles') || {}) };
        if (style && Object.keys(style).length) cur[id] = style; else delete cur[id];
        state.set('ctrlStyles', cur);
    };

    const panel = document.createElement('div'); panel.className = 'panel group-panel';

    // ── Tasten/MIDI-Overlay (P3, K5) ────────────────────────────────────────────────
    // Ein Header-Schalter (in werkbank.js) blendet über jedem Control seine Tastenbelegung
    // + 🎹 ein, an Ort und Stelle änderbar. Die Fabriken melden ihre Controls unten mit an;
    // `activate` weiß, wie man das jeweilige Control per Taste/MIDI auslöst. globalKeyOk
    // hält die Verteilung von echter Texteingabe fern.
    const midi = new Midi(state);
    const keyMidi = new KeyMidi(state, { panel, midi, keyOk: globalKeyOk });

    // ── Laufzeit-Zustand des e-Mode (mirror teslacoil) ─────────────────────────────
    let arranging = false;
    let ctrlDrag = null;                 // { row, el } während eines Reorder-Drags
    const arrangeRows = [];              // { el, rowId }
    const GRID = 10;                     // Raster px (Shift = 1px fein)
    const snapAxis = (v, rem, fine) => fine ? Math.round(v) : Math.round((v - rem) / GRID) * GRID + rem;
    const mod = (v, m) => ((v % m) + m) % m;
    const freeGroups = new Set();        // Gruppen im Free-Canvas-Modus
    const groupEls = new Map();          // name → { g, body, title, collapseBtn }
    // Combo-/Snapshot-Pool (@dpa 20260724): mehrere Gruppen-INSTANZEN können sich eine
    // Gruppen-ART teilen (z.B. alle vom Sq-Manager erzeugten Klone) — der Pool selbst hängt
    // an groupKindOf (Default = eigener Name, für alle bestehenden statischen Gruppen also
    // No-op), Instanz-Suffix macht Keys/IDs kanonisch (s. lib/soundKeys.js).
    const groupKindOf = new Map();       // literal name → Gruppen-Art (Pool-Schlüssel)
    const groupSuffixOf = new Map();     // literal name → Instanz-Suffix ('' bei statischen Gruppen)
    const groupExtraKeys = new Map();    // literal name → kanonische Zusatz-Keys ohne data-ctrl
    const knobsById = new Map();
    const _lastNorm = new Map();         // key → letzte Norm (für das Parallel-Delta)
    let _knobSync = false;               // Guard: Parallel-Verteilung nicht rekursiv fan-outen
    const beatSetters = new Map();       // id → (beatIndex)=>void  (Takt-Anzeige, vom Takt getrieben)
    const ctrlBindings = new Map();      // key → (data) => UI aktualisieren
    const ctrlEls = new Map();           // key → DOM-Wrapper
    const styleTargets = new Map();      // id → { type, el, applyStyle }
    const ctrlOnSetters = new Map();     // id → (on:boolean)=>void  (ON-Zustand, z.B. Start-Knopf)
    const ctrlBlinkSetters = new Map();  // id → (on:boolean)=>void  (Blink-Wartezustand, z.B. Rec „armed")
    const sizeHint = createSizeHintSystem(state);   // Größen-Änderungs-Hinweis (@dpa 20260721)
    // Welche Quelle skaliert dieses Control gerade (Gruppe/Instrument/beides)? Instrument-
    // Skalierung liegt AUSSERHALB von GroupHost (werkbank.js, benchScale) — deshalb von
    // dort per opts.instrumentScaled() reingereicht, statt hier zu raten.
    function sizeSourceLabel(el) {
        const g = el && el.closest ? el.closest('[data-group]') : null;
        const gName = g ? g.dataset.group : null;
        const styles = state.get('groupStyles') || {};
        const groupScaled = !!(gName && styles[gName] && styles[gName].scale && styles[gName].scale !== 100);
        const instrScaled = !!(opts.instrumentScaled && opts.instrumentScaled());
        if (groupScaled && instrScaled) return 'Größe via Gruppe und Instrument geändert.';
        if (groupScaled) return 'Größe via Gruppe geändert.';
        if (instrScaled) return 'Größe via Instrument geändert.';
        return null;
    }

    // ── Element-Settings registrieren (Rechtsklick, kein Wert-Verstellen) ──────────
    function registerCtrlStyle(id, type, el, applyStyle, defLabel, extra = {}) {
        styleTargets.set(id, { type, el, applyStyle });
        const saved = (state.get('ctrlStyles') || {})[id];
        if (saved) applyStyle(saved);
        el.addEventListener('contextmenu', (e) => {
            e.preventDefault(); e.stopPropagation();
            // extra trägt z.B. defOptions (Select/Segment) fürs Vorbefüllen der Kurzschrift.
            elemSettings.open({ id, type, el, defLabel, applyStyle, ...extra });
            sizeHint.showInline(elemSettings.panel, sizeSourceLabel(el));
        });
    }

    // ── Label-Drag für Controls OHNE Knob (vertikal ziehen = Wert ändern) ──────────
    function wireLabelDrag(wrap, valueEl, makeApply) {
        wrap.addEventListener('mousedown', (e) => {
            if (arranging) return;
            if (e.button !== 0) return;
            if (e.target === valueEl || valueEl.contains(e.target)) return;
            e.preventDefault();
            const startY = e.clientY;
            const apply = makeApply();
            let dragged = false;
            const onMove = (ev) => {
                const dy = startY - ev.clientY;
                if (!dragged && Math.abs(dy) < 4) return;
                dragged = true; apply(dy);
            };
            const onUp = () => {
                window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
                if (dragged) { const kill = (ce) => { ce.stopPropagation(); ce.preventDefault(); wrap.removeEventListener('click', kill, true); }; wrap.addEventListener('click', kill, true); }
            };
            window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
        });
    }

    // ── Control-Fabriken ───────────────────────────────────────────────────────────
    function makeSelect(key) {
        const cfg = SELECTS[key];
        // Optionen sind FEST (@dpa 20260719_030544: Anzahl kommt aus dem Code) — in den
        // Settings werden nur die Namen umbenannt (optLabels, index-gleich).
        const opts = normOptions(cfg.options);
        const wrap = document.createElement('label'); wrap.className = 'select-field';
        const span = document.createElement('span'); span.textContent = cfg.label;
        const sel = document.createElement('select');
        const optEls = opts.map((o) => { const opt = document.createElement('option'); opt.value = o.v; opt.textContent = o.l; sel.appendChild(opt); return opt; });
        sel.value = state.get(key);
        // Anzeige-Namen aus optLabels (leer/fehlt = Standard-Name der Option).
        const relabel = (labels) => optEls.forEach((opt, i) => { opt.textContent = (labels && labels[i]) ? labels[i] : opts[i].l; });
        const applyTitle = () => { if (cfg.optionTitles) hint(sel, cfg.optionTitles[sel.value] || ''); };
        applyTitle();
        sel.addEventListener('change', () => { state.set(key, sel.value); applyTitle(); });
        span.classList.add('ctrl-label-drag'); wrap.classList.add('ctrl-label-drag');
        wireLabelDrag(wrap, sel, () => {
            const baseIdx = opts.findIndex((o) => o.v === sel.value);
            return (dy) => {
                const idx = Math.max(0, Math.min(opts.length - 1, baseIdx + Math.round(dy / 18)));
                if (opts[idx].v !== sel.value) { sel.value = opts[idx].v; state.set(key, sel.value); applyTitle(); }
            };
        });
        wrap.appendChild(span); wrap.appendChild(sel);
        wrap.dataset.ctrl = 's:' + key;
        ctrlBindings.set(key, (data) => { sel.value = data[key]; applyTitle(); });
        ctrlEls.set(key, wrap);
        registerCtrlStyle('s:' + key, 'select', wrap, (s) => {
            relabel(s.optLabels);
            span.textContent = s.label || cfg.label;
            // Label-Position wie beim Knob/Toggle (@dpa 20260723_857ff), ersetzt das alte
            // reine An/Aus (labelOn) — 'off' blendet den Label-Text komplett aus.
            wrap.classList.remove('sel-label-top', 'sel-label-left', 'sel-label-right', 'sel-label-bottom', 'sel-label-off');
            wrap.classList.add('sel-label-' + (s.labelPos || 'top'));
            // BG0 = Grundhintergrund, VG = Text; Schriftgröße + Padding (@dpa 20260719_030544:
            // „Länge weg, dafür Schriftgröße und Padding") — 'Länge' ist zurück als Menü-Breite
            // (@dpa 20260723_857ff): boxSize, 0/leer = auto.
            sel.style.background = s.bg0 || s.bg || ''; sel.style.color = s.fg || '';
            sel.style.fontSize = s.size ? s.size + 'px' : '';
            sel.style.padding = s.pad != null ? s.pad + 'px' : '';
            sel.style.width = s.boxSize ? s.boxSize + 'px' : '';
        }, cfg.label, { defOptions: opts });
        // Taste/MIDI: schaltet eine Stufe weiter (rundum).
        keyMidi.register('s:' + key, wrap, cfg.label, () => {
            const i = opts.findIndex((o) => o.v === sel.value), n = opts[(i + 1) % opts.length];
            sel.value = n.v; state.set(key, n.v); applyTitle();
        });
        return wrap;
    }
    function makeToggle(key) {
        const cfg = TOGGLES[key];
        const wrap = document.createElement('label'); wrap.className = 'select-field toggle-field';
        const chk = document.createElement('input'); chk.type = 'checkbox'; chk.checked = state.get(key);
        chk.addEventListener('change', () => state.set(key, chk.checked));
        const span = document.createElement('span'); span.textContent = cfg.label;
        if (cfg.title) hint(wrap, cfg.title);
        span.classList.add('ctrl-label-drag'); wrap.classList.add('ctrl-label-drag');
        wireLabelDrag(wrap, chk, () => (dy) => {
            const want = dy > 10 ? true : dy < -10 ? false : chk.checked;
            if (want !== chk.checked) { chk.checked = want; state.set(key, want); }
        });
        wrap.appendChild(chk); wrap.appendChild(span);
        wrap.dataset.ctrl = 't:' + key;
        ctrlBindings.set(key, (data) => { chk.checked = !!data[key]; });
        ctrlEls.set(key, wrap);
        registerCtrlStyle('t:' + key, 'toggle', wrap, (s) => {
            span.textContent = s.label || cfg.label;
            wrap.classList.remove('tgl-label-top', 'tgl-label-bottom', 'tgl-label-left', 'tgl-label-right');
            if (s.labelPos) wrap.classList.add('tgl-label-' + s.labelPos);
        }, cfg.label);
        // Taste/MIDI: kippt den Schalter (MIDI-Note-on ebenfalls Kippen — reicht fürs Metronom).
        keyMidi.register('t:' + key, wrap, cfg.label, () => { chk.checked = !chk.checked; state.set(key, chk.checked); });
        return wrap;
    }
    // Segment: neue Control-Sorte aus taktgeber (K5). Nebeneinanderliegende Knöpfe, genau
    // einer aktiv — z.B. Tap-Modus „1 · konstant / 2 · folgend". Der Wert ist der `v` der
    // Option (Zahl oder String); Label-Ziehen schaltet durch (wie beim Select).
    function makeSegment(key) {
        const cfg = SEGMENTS[key];
        // Optionen FEST (Original-Werttypen; tapMode ist z.B. eine Zahl). In den Settings
        // werden nur die Namen umbenannt (optLabels, index-gleich), @dpa 20260719_030544.
        const opts = cfg.options.map((o) => ({ v: o.v, l: o.l, title: o.title }));
        let curBg0 = '', curBg1 = '', curFg = '';
        const wrap = document.createElement('label'); wrap.className = 'select-field segment-field';
        const span = document.createElement('span'); span.textContent = cfg.label;
        const seg = document.createElement('div'); seg.className = 'segmented';
        const cur = () => String(state.get(key));
        // BG0 = Grund, BG1 = aktiver Knopf, VG = Text.
        const paint = () => {
            const c = cur();
            btns.forEach((b, i) => {
                const on = String(opts[i].v) === c;
                b.classList.toggle('seg-on', on);
                b.style.background = on ? (curBg1 || '') : (curBg0 || '');
                b.style.color = curFg || '';
            });
        };
        const btns = opts.map((o) => {
            const b = document.createElement('button'); b.type = 'button'; b.className = 'seg-btn';
            b.textContent = o.l; b.dataset.val = String(o.v);
            if (o.title) hint(b, o.title);
            b.addEventListener('click', () => { if (arranging) return; state.set(key, o.v); paint(); });
            seg.appendChild(b); return b;
        });
        // Anzeige-Namen aus optLabels (leer/fehlt = Standard-Name).
        const relabel = (labels) => btns.forEach((b, i) => { b.textContent = (labels && labels[i]) ? labels[i] : opts[i].l; });
        paint();
        span.classList.add('ctrl-label-drag'); wrap.classList.add('ctrl-label-drag');
        wireLabelDrag(wrap, seg, () => {
            const baseIdx = Math.max(0, opts.findIndex((o) => String(o.v) === cur()));
            return (dy) => {
                const idx = Math.max(0, Math.min(opts.length - 1, baseIdx + Math.round(dy / 18)));
                const o = opts[idx];
                if (String(o.v) !== cur()) { state.set(key, o.v); paint(); }
            };
        });
        wrap.appendChild(span); wrap.appendChild(seg);
        wrap.dataset.ctrl = 'g:' + key;
        ctrlBindings.set(key, () => paint());
        ctrlEls.set(key, wrap);
        // Optik (@dpa 20260719_030544): Namen umbenennen; BG0/BG1/VG; Schriftgröße + Padding.
        registerCtrlStyle('g:' + key, 'select', wrap, (s) => {
            relabel(s.optLabels);
            span.textContent = s.label || cfg.label;
            wrap.classList.remove('sel-label-top', 'sel-label-left', 'sel-label-right', 'sel-label-bottom', 'sel-label-off');
            wrap.classList.add('sel-label-' + (s.labelPos || 'top'));
            curBg0 = s.bg0 || s.bg || ''; curBg1 = s.bg1 || ''; curFg = s.fg || '';
            seg.style.padding = s.pad != null ? s.pad + 'px' : '';
            seg.style.width = s.boxSize ? s.boxSize + 'px' : '';
            btns.forEach((b) => { b.style.fontSize = s.size ? s.size + 'px' : ''; });
            paint();
        }, cfg.label, { defOptions: opts });
        // Taste/MIDI: schaltet eine Stufe weiter (rundum).
        keyMidi.register('g:' + key, wrap, cfg.label, () => {
            const i = Math.max(0, opts.findIndex((x) => String(x.v) === cur())), n = opts[(i + 1) % opts.length];
            state.set(key, n.v); paint();
        });
        return wrap;
    }
    // Wechsel-Button (@dpa 20260722_194404, ddw.md: „ein besseres Kürzel für wechselButton"
    // — `w:`): ein Knopf, der bei jedem Klick eine Stufe weiterschaltet (rundum), wie das
    // bisherige Speicher-„R" (blinkender dritter Zustand), aber generalisiert auf n Stufen
    // mit je eigener Caption + Farbe + Kurzbeschreibung. Die MENGE/FUNKTION jeder Stufe gibt
    // der Aufrufer vor (cfg.modes + onClick(idx,mode) entscheidet, was Stufe i TUT) — die
    // Settings (ElementSettings type 'wechsel') erlauben Umbenennen/Umfärben/Umsortieren und,
    // über `n`, auch mehr/weniger Stufen ANZUZEIGEN als im Code vorgegeben (zusätzliche
    // Stufen bleiben ohne eigene Funktion, bis der Aufrufer sie auch behandelt).
    function makeWechsel(key) {
        const cfg = WECHSEL[key];
        const wrap = document.createElement('div'); wrap.className = 'btn-field wechsel-field';
        const btnContainer = document.createElement('div'); btnContainer.className = 'btn-container';
        const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'pb-btn ctrl-btn';
        if (cfg.title) hint(btn, cfg.title);
        btnContainer.appendChild(btn); wrap.appendChild(btnContainer);
        wrap.dataset.ctrl = 'w:' + key;
        let modes = (cfg.modes || []).map((m) => ({ ...m }));
        const cur = () => { const n = Math.max(1, modes.length); return ((state.get(key) | 0) % n + n) % n; };
        const paint = () => {
            const m = modes[cur()] || {};
            btn.textContent = m.caption || '';
            btn.style.background = m.color || '';
            hint(btn, m.desc || cfg.title || '');
        };
        paint();
        const cycle = () => {
            const n = Math.max(1, modes.length);
            const next = (cur() + 1) % n;
            state.set(key, next); paint();
            if (cfg.onClick) cfg.onClick(next, modes[next]);
        };
        btn.addEventListener('click', () => { if (!arranging) cycle(); });
        wrap.dataset.ctrl = 'w:' + key;
        ctrlBindings.set(key, () => paint());
        ctrlEls.set(key, wrap);
        // Settings (@dpa 20260722_194404): Tabelle mit n Zeilen (Caption/Farbe/Beschreibung,
        // umsortierbar) — defModes liefert die KI-vorgefertigten Stufen fürs Vorbefüllen.
        registerCtrlStyle('w:' + key, 'wechsel', wrap, (s) => {
            modes = (s.modes && s.modes.length ? s.modes : cfg.modes || []).map((m) => ({ ...m }));
            paint();
        }, cfg.label, { defModes: cfg.modes || [] });
        // Taste/MIDI: schaltet genauso eine Stufe weiter.
        keyMidi.register('w:' + key, wrap, cfg.label, () => cycle());
        return wrap;
    }
    // Tab-Fokus erkennen (Tab → ganzen Textinhalt selektieren, Maus-Klick nicht).
    let focusByTab = false;
    window.addEventListener('keydown', (e) => { if (e.key === 'Tab') focusByTab = true; }, true);
    window.addEventListener('mousedown', () => { focusByTab = false; }, true);
    function makeText(key) {
        const cfg = TEXTS[key];
        const wrap = document.createElement('label'); wrap.className = 'select-field text-field';
        const span = document.createElement('span'); span.textContent = cfg.label;
        const inp = document.createElement(cfg.lines ? 'textarea' : 'input');
        if (cfg.lines) inp.rows = cfg.lines; else inp.type = 'text';
        inp.className = 'gs-text' + (cfg.lines ? ' text-multiline' : '');
        inp.placeholder = cfg.placeholder || '';
        inp.value = state.get(key) ?? '';
        inp.addEventListener('input', () => state.set(key, inp.value));
        inp.addEventListener('focus', () => { if (focusByTab) inp.select(); });
        wrap.appendChild(span); wrap.appendChild(inp);
        wrap.dataset.ctrl = 'x:' + key;
        ctrlBindings.set(key, (data) => { const v = data[key] ?? ''; if (inp.value !== v) inp.value = v; });
        ctrlEls.set(key, wrap);
        const applyStyle = (s) => {
            span.textContent = s.label || cfg.label;
            span.style.display = (s.labelOn ?? cfg.labelOn ?? true) === false ? 'none' : '';
            inp.style.background = s.bg || ''; inp.style.color = s.fg || '';
            inp.style.fontSize = s.size ? s.size + 'px' : '';
            inp.style.width = s.boxSize ? s.boxSize + 'px' : '';
            inp.style.height = s.boxH ? s.boxH + 'px' : '';
        };
        applyStyle({});
        registerCtrlStyle('x:' + key, 'text', wrap, applyStyle, cfg.label);
        if (cfg.lines) {
            const refit = () => {
                const g = wrap.closest('.group');
                if (g && inp.offsetWidth + 40 > 380) g.style.maxWidth = 'none';
                if (g && g.dataset.group) sizeFreeGroup(g.dataset.group);
                sizePanel();
            };
            const persist = () => {
                const w = Math.round(inp.offsetWidth), h = Math.round(inp.offsetHeight);
                const cur = { ...((state.get('ctrlStyles') || {})['x:' + key] || {}) };
                if (cur.boxSize === w && cur.boxH === h) return;
                cur.boxSize = w; cur.boxH = h;
                const all = { ...state.get('ctrlStyles') }; all['x:' + key] = cur;
                state.set('ctrlStyles', all);
            };
            inp.addEventListener('mouseup', persist);
            if (window.ResizeObserver) new ResizeObserver(refit).observe(inp); else refit();
        }
        return wrap;
    }
    function makeNote(key) {
        const cfg = NOTES[key];
        const wrap = document.createElement('div'); wrap.className = 'group-extra note-field';
        wrap.textContent = cfg.label;
        wrap.dataset.ctrl = 'n:' + key;
        registerCtrlStyle('n:' + key, 'note', wrap, (s) => {
            wrap.textContent = s.label || cfg.label;
            wrap.style.color = s.fg || '';
            wrap.style.fontSize = s.fontSize ? s.fontSize + 'px' : '';
            wrap.style.width = s.boxSize ? s.boxSize + 'px' : '';
        }, cfg.label);
        return wrap;
    }
    // Anzeige (UNIKAT-Sorte, @dpa 20260718_203341): die sich anpassende Takt-Beat-Anzeige aus
    // taktgeber — ein Punkt je Beat (Anzahl = countKey, i.d.R. beatsPerBar), der erste ist der
    // Hauptbeat. Der laufende Takt hebt den aktuellen Beat hervor (setBeat, vom Engine getrieben).
    // Rein optisch/gesteuert, kein eigener Wert.
    function makeDisplay(key) {
        const cfg = DISPLAYS[key];
        const countKey = cfg.countKey || 'beatsPerBar';
        const wrap = document.createElement('div'); wrap.className = 'display-field beat-view';
        if (cfg.title) hint(wrap, cfg.title);
        const build = () => {
            const cur = [...wrap.children].findIndex((d) => d.classList.contains('beat-hit'));
            wrap.innerHTML = '';
            const n = Math.max(1, state.get(countKey) | 0);
            for (let i = 0; i < n; i++) {
                const d = document.createElement('div'); d.className = 'beat-dot' + (i === 0 ? ' beat-main' : '');
                if (i === cur) d.classList.add('beat-hit');
                wrap.appendChild(d);
            }
        };
        build();
        wrap.dataset.ctrl = 'u:' + key;
        // Anzahl folgt beatsPerBar (oder countKey): neu bauen, wenn er sich ändert.
        state.subscribe((k) => { if (k === countKey || k === '*') build(); });
        ctrlEls.set(key, wrap);
        beatSetters.set('u:' + key, (i) => { [...wrap.children].forEach((d, idx) => d.classList.toggle('beat-hit', idx === i)); });
        // Settings (@dpa 20260718_203341): Haupt-/Nebenbeat-/BG-Farbe, Beat-Größe, Abstände,
        // Radius (0=eckig…1=rund), Padding, Breite/Höhe (0=auto). Als CSS-Variablen, damit die
        // einzelnen Punkte sie erben.
        registerCtrlStyle('u:' + key, 'beatview', wrap, (s) => {
            wrap.style.background = s.bg || '';
            wrap.style.gap = s.gap != null ? s.gap + 'px' : '';
            wrap.style.padding = s.pad != null ? s.pad + 'px' : '';
            wrap.style.width = s.boxSize ? s.boxSize + 'px' : '';
            wrap.style.height = s.boxH ? s.boxH + 'px' : '';
            wrap.style.setProperty('--beat-size', s.beatSize ? s.beatSize + 'px' : '');
            // radius 0..1 → 0%..50% (eckig…rund). Default (unset) bleibt der kleine CSS-Radius.
            wrap.style.setProperty('--beat-radius', s.radius != null ? (Math.max(0, Math.min(1, s.radius)) * 50) + '%' : '');
            wrap.style.setProperty('--beat-main', s.mainColor || '');
            wrap.style.setProperty('--beat-sub', s.subColor || '');
        }, cfg.label);
        return wrap;
    }
    function makeButton(key) {
        const cfg = BUTTONS[key];
        const onClick = cfg.onClick || (() => {});
        const wrap = document.createElement('div'); wrap.className = 'btn-field';
        const btnContainer = document.createElement('div'); btnContainer.className = 'btn-container';
        const label = document.createElement('span'); label.className = 'btn-label';
        const btn = document.createElement('button'); btn.className = 'pb-btn ctrl-btn';
        if (cfg.title) hint(btn, cfg.title);
        btnContainer.appendChild(btn);
        wrap.appendChild(label); wrap.appendChild(btnContainer);
        wrap.dataset.ctrl = 'b:' + key;
        // Knopf-Inhalt (@dpa 20260719_030544/040136/120425): NICHT das Label — zwei Texte je Zustand
        // („an"/„aus"), Default beide = Manifest-Label. paint zeigt textOn (Caption), solange der Knopf
        // aktiv ist, sonst textOff, und markiert den Aktiv-Zustand sichtbar (ctrl-on).
        // labelPos positioniert das ÄUSSERE Label (span.btn-label), Caption bleibt im Button zentriert.
        let isOn = false, isBlinking = false, curBg = '', curBgOn = '', curBgBlink = '',
            textOn = cfg.label, textOff = cfg.label, textBlink = '', outerLabel = '', labelOff = false;
        const defMode = cfg.mode || 'toggle';
        let mode = defMode;   // 'toggle' | 'trigger' | 'gate' (aus ctrlStyles.btnMode, sonst defMode)
        // Dritter Zustand über den Blink-Wartezustand (@dpa 20260722_152438, ddw.md „R":
        // „unterschiedliche Farben … für jede Selektion eine andere BG-Farbe und eigenen
        // Caption-Text") — genutzt von Controls mit mehr als zwei Zuständen (z.B. ChordMemory-
        // Zyklus 'off'/'rename'/'reset', gemappt auf isOn+isBlinking, s. werkbank.js). Ohne
        // eigens gesetzten textBlink/bgBlink verhält sich ein Button GENAU wie vorher (Fallback
        // auf textOn/bgOn) — rückwärtskompatibel für alle Buttons mit nur zwei Zuständen.
        const paint = () => {
            btn.textContent = '';
            const caption = (isBlinking && textBlink) ? textBlink : (isOn && textOn) ? textOn : textOff;
            if (!caption && cfg.icon) { btn.classList.add('ctrl-btn-ico'); btn.appendChild(icon(cfg.icon)); }
            else { btn.classList.remove('ctrl-btn-ico'); btn.textContent = caption; }
            btn.style.background = (isBlinking && curBgBlink) ? curBgBlink : (isOn && curBgOn) ? curBgOn : (curBg || '');
            btn.classList.toggle('ctrl-on', isOn);
            label.textContent = outerLabel;
            // 'off' (labelPos=Ohne): Text bleibt gespeichert, wird aber nicht gezeigt.
            label.style.display = (outerLabel && !labelOff) ? '' : 'none';
        };
        paint();
        btn.refresh = paint;
        // Klick/Taste/MIDI: löst aus UND schaltet den Aktiv-Zustand um (@dpa 20260719_040136:
        // „müssen auch aktiv anzeigen … Text an/aus muss mit Button an/aus umschalten"). Extern
        // getriebene Knöpfe (Start via engine.onRunning→setCtrlOn) richten isOn danach gerade.
        // Modusabhängiges Verhalten (@dpa 20260719):
        //  • toggle:  an/aus je Klick (Zustand bleibt)
        //  • trigger: Impuls – snappt ON, fadet dann nach OFF (D-Env-Gefühl, .btn-fade)
        //  • gate:    ON solange gedrückt (echtes Halten mit der Maus, s. mousedown)
        // phase: bei Gate 'down' (Drücken) bzw. 'up' (Loslassen) — so kann ein Verbraucher eine
        // Halte-Funktion bauen (z.B. ASR-Tempo-Nudge der +/−-Knöpfe, engine.js). Trigger/Toggle
        // rufen ohne phase (undefined) → für sie ändert sich nichts (rückwärtskompatibel).
        const fire = (phase) => { if (!arranging) onClick(key, phase); };
        // Jeder Trigger bekommt einen eigenen sichtbaren Flash (@dpa 20260720: „jeden trigger …
        // anzeigen, d.h. auch Midi und tastatur shortcut"). Bug vorher: bei zwei schnell
        // hintereinander eintreffenden Triggern (MIDI-Burst, Tastatur-Repeat) kollidierten zwei
        // requestAnimationFrame-Callbacks im selben Frame und der zweite Flash wurde nie sichtbar
        // gerendert. Fix: laufenden Fade-Timer immer canceln + Reflow erzwingen, bevor neu gezündet
        // wird — jeder Trigger snappt so sicher sichtbar an, auch wenn der vorige noch faedete.
        let fadeTimer = 0;
        const flashTrigger = () => {
            if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = 0; }
            btn.classList.remove('btn-fade'); isOn = true; paint();          // ohne Transition: snappt an
            void btn.offsetWidth;                                            // Reflow: „an" wird sicher gerendert
            fadeTimer = setTimeout(() => { btn.classList.add('btn-fade'); isOn = false; paint(); fadeTimer = 0; }, 16);
        };
        // Klick/Taste/MIDI ohne Halten (Gate wird hier zum kurzen Impuls, damit auch
        // Tastatur/MIDI Feedback + Aktion geben; echtes Halten macht der mousedown-Pfad).
        // Der Impuls schickt down→up (kurze Attack, dann Release), damit ein ASR-Verbraucher
        // auch per Taste/MIDI einen Antippen-Nudge bekommt.
        const activate = () => {
            if (arranging) return;
            if (mode === 'toggle') { isOn = !isOn; fire(); paint(); }
            else if (mode === 'gate') { btn.classList.remove('btn-fade'); isOn = true; paint(); fire('down'); setTimeout(() => { isOn = false; paint(); fire('up'); }, 120); }
            else { fire(); flashTrigger(); }
        };
        // `toggle` per Maus (@dpa 20260722_013727): asymmetrisch wie ein echter Umschalter —
        // AUS→AN reagiert SOFORT beim Runterdrücken, AN→AUS erst beim Loslassen (auch außerhalb
        // des Buttons, wie beim Gate). Taste/MIDI bleiben unverändert ein einziger voller Flip
        // (kein Down/Up-Gefühl über die Fernbedienung, s. `activate`/`keyMidi.register`).
        btn.addEventListener('click', () => { if (mode === 'trigger') activate(); }); // toggle/gate laufen über mousedown/up
        btn.addEventListener('mousedown', (e) => {
            if (arranging || e.button !== 0) return;
            if (mode === 'gate') {
                e.preventDefault();
                btn.classList.remove('btn-fade'); isOn = true; paint(); fire('down');
                const up = () => { isOn = false; paint(); fire('up'); window.removeEventListener('mouseup', up); };
                window.addEventListener('mouseup', up);
            } else if (mode === 'toggle') {
                e.preventDefault();
                if (!isOn) { activate(); return; }   // AUS→AN: sofort
                const up = () => { activate(); window.removeEventListener('mouseup', up); };   // AN→AUS: bei Loslassen
                window.addEventListener('mouseup', up);
            }
        });
        keyMidi.register('b:' + key, wrap, cfg.label, activate);
        ctrlOnSetters.set('b:' + key, (on) => { btn.classList.remove('btn-fade'); isOn = !!on; paint(); });
        // Blink-Wartezustand (Rec-Instrument-TODO 5, @dpa 20260721): „armed", bis ein extern
        // getriebenes Ereignis (nächster Takt-Downbeat) den Knopf tatsächlich schaltet. Malt
        // jetzt auch Caption/BG neu (s.o.), falls textBlink/bgBlink gesetzt sind.
        ctrlBlinkSetters.set('b:' + key, (on) => { btn.classList.toggle('ctrl-blink', !!on); isBlinking = !!on; paint(); });
        registerCtrlStyle('b:' + key, 'button', wrap, (s) => {
            outerLabel = s.label || '';
            textOn = s.textOn || cfg.label; textOff = s.textOff || cfg.label; textBlink = s.textBlink || '';
            curBg = s.bg || ''; curBgOn = s.bgOn || ''; curBgBlink = s.bgBlink || '';
            btn.style.color = s.fg || '';
            btn.style.fontSize = s.size ? s.size + 'px' : '';
            btn.style.padding = s.pad != null ? s.pad + 'px' : '';
            btn.style.width = s.boxSize ? s.boxSize + 'px' : '';
            btn.style.height = s.boxH ? s.boxH + 'px' : '';
            const w = s.boxSize || 0, h = s.boxH || 0;
            const box = (w && h) ? Math.min(w, h) : (w || h);
            btn.style.setProperty('--ico', box ? Math.max(12, box - 8) + 'px' : '');
            // labelPos positioniert das ÄUSSERE Label (@dpa 20260719_120425). Button-Caption bleibt immer zentriert.
            wrap.classList.remove('btn-label-top', 'btn-label-left', 'btn-label-right', 'btn-label-bottom', 'btn-label-off');
            if (s.labelPos) wrap.classList.add('btn-label-' + s.labelPos); else wrap.classList.add('btn-label-bottom');
            labelOff = (s.labelPos === 'off');
            mode = s.btnMode || defMode;
            if (mode !== 'gate') isOn = false;   // Moduswechsel weg von Gate: nicht in ON hängenbleiben
            paint();
        }, cfg.label, { defMode, hasBlink: !!cfg.hasBlink });
        return wrap;
    }
    // Sonderfenster-Opener (UNIKAT, @dpa 20260719_033654): ein Knopf, der ein schwebendes
    // Panel öffnet, in dem eine Auswahl echter Controls (Segmente/Knobs) kompakt zusammen
    // steht — für Technik, die nicht dauernd auf dem Panel liegen soll (Tab/Tempo + Latenz).
    // Die Controls sind echt (an den State gebunden, eigene Rechtsklick-Settings).
    function makeSpecial(cfg) {
        const wrap = document.createElement('div'); wrap.className = 'btn-field';
        const btn = document.createElement('button'); btn.className = 'pb-btn ctrl-btn special-open';
        hint(btn, cfg.title || 'Sondereinstellungen öffnen');
        wrap.appendChild(btn);
        wrap.dataset.ctrl = 'u:' + cfg.key;
        // Der Opener ist button-ähnlich (@dpa 20260719_040136): Text „an" (offen) / „aus" (zu),
        // dazu Farben/Größe/Padding — nur Label/L.Pos nicht. paintOpener spiegelt den Offen-Zustand.
        let oTextOn = cfg.label, oTextOff = cfg.label, oBg = '', oBgOn = '';
        const paintOpener = () => {
            const open = !!pop;
            btn.textContent = (open && oTextOn) ? oTextOn : oTextOff;
            btn.style.background = (open && oBgOn) ? oBgOn : (oBg || '');
            btn.classList.toggle('ctrl-on', open);
        };
        // Inhalt EINMAL bauen (nicht bei jedem Öffnen neu registrieren), dann nur ein-/aushängen.
        const content = document.createElement('div'); content.className = 'special-body';
        // Live-Audio-Zeile (echte Latenz/Samplerate): cfg.audioInfo() liefert die Rohwerte,
        // hier formatiert (@dpa 20260720 „genau"). Wird beim Öffnen refresht + während offen getickt.
        let audioEl = null, audioTimer = 0;
        const refreshAudio = () => {
            if (!audioEl) return;
            const a = cfg.audioInfo && cfg.audioInfo();
            if (!a) { audioEl.textContent = 'Audio: — (bereit nach dem ersten Klick)'; return; }
            const srk = a.sampleRate ? (a.sampleRate / 1000) : 0;
            const sr = srk ? (Number.isInteger(srk) ? srk : srk.toFixed(1)) + ' kHz' : '—';
            const base = a.baseLatency != null ? a.baseLatency * 1000 : null;
            const out = a.outputLatency ? a.outputLatency * 1000 : null;
            const tot = (base || 0) + (out || 0);
            const parts = [];
            if (base != null) parts.push('Basis ' + base.toFixed(1) + ' ms');
            if (out) parts.push('Ausgabe ' + out.toFixed(1) + ' ms');
            audioEl.textContent = 'Samplerate ' + sr + ' · Latenz ' + tot.toFixed(1) + ' ms'
                + (parts.length ? ' (' + parts.join(' + ') + ')' : '');
        };
        if (cfg.layout === 'table') {
            // Tabelle: Beschreibung + Zeilen [Label | Einstellung | Hilfstext] (@dpa 20260720).
            content.classList.add('special-table');
            if (cfg.desc) { const d = document.createElement('div'); d.className = 'special-desc'; d.textContent = cfg.desc; content.appendChild(d); }
            const table = document.createElement('div'); table.className = 'special-rows';
            const addRow = (labelTxt, infoTxt, mountFn) => {
                const row = document.createElement('div'); row.className = 'special-row';
                const l = document.createElement('div'); l.className = 'special-cell-label'; l.textContent = labelTxt || '';
                const c = document.createElement('div'); c.className = 'special-cell-ctrl';
                const h = document.createElement('div'); h.className = 'special-cell-hint'; h.textContent = infoTxt || '';
                mountFn(c);
                row.appendChild(l); row.appendChild(c); row.appendChild(h); table.appendChild(row);
            };
            (cfg.segments || []).forEach((k) => addRow(SEGMENTS[k].label, SEGMENTS[k].info, (cell) => cell.appendChild(makeSegment(k))));
            (cfg.knobs || []).forEach((k) => addRow(KNOBS[k].label, KNOBS[k].info, (cell) => makeKnob(k).mount(cell)));
            content.appendChild(table);
            if (cfg.audioInfo) { audioEl = document.createElement('div'); audioEl.className = 'special-audio'; content.appendChild(audioEl); }
        } else {
            if (cfg.note) { const n = document.createElement('div'); n.className = 'special-note'; n.textContent = cfg.note; content.appendChild(n); }
            if ((cfg.segments || []).length) {
                const ctrls = document.createElement('div'); ctrls.className = 'group-ctrls';
                (cfg.segments || []).forEach((k) => ctrls.appendChild(makeSegment(k)));
                content.appendChild(ctrls);
            }
            if ((cfg.knobs || []).length) {
                const krow = document.createElement('div'); krow.className = 'knob-row';
                (cfg.knobs || []).forEach((k) => makeKnob(k).mount(krow));
                content.appendChild(krow);
            }
        }
        let pop = null;
        // Außenklick schließt — ABER nicht, wenn man ein Settings-Panel eines Controls aus
        // dem Fenster bedient (die schweben außerhalb: KnobMetaEditor/ElementSettings, deren
        // ?-Popover, Gruppen-Settings). Sonst risse der erste Klick ins Panel das Fenster weg.
        const outside = (e) => {
            if (!pop || pop.contains(e.target) || e.target === btn) return;
            if (e.target.closest && e.target.closest('.knob-meta-editor, .es-help-pop, .group-settings, .cp-pop')) return;
            close();
        };
        function close() {
            if (audioTimer) { clearInterval(audioTimer); audioTimer = 0; }
            if (pop) { pop.remove(); pop = null; document.removeEventListener('mousedown', outside, true); paintOpener(); }
        }
        paintOpener();
        btn.addEventListener('click', () => {
            if (arranging) return;
            if (pop) { close(); return; }
            pop = document.createElement('div'); pop.className = 'special-pop';
            if (cfg.layout === 'table') pop.classList.add('special-pop-table');   // feste Breite (@dpa 20260720)
            const head = document.createElement('div'); head.className = 'special-head';
            const t = document.createElement('span'); t.textContent = cfg.label; head.appendChild(t);
            const x = document.createElement('button'); x.className = 'kme-x'; x.textContent = '✕'; x.addEventListener('click', close); head.appendChild(x);
            pop.appendChild(head); pop.appendChild(content);
            document.body.appendChild(pop); paintOpener();
            const r = btn.getBoundingClientRect();
            pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + 'px';
            pop.style.top = Math.min(r.bottom + 4, window.innerHeight - pop.offsetHeight - 8) + 'px';
            makeDraggable(pop, head);   // am Kopf verschiebbar (@dpa 20260720)
            // Audio-Info live halten, solange offen (Latenz/SR erscheinen, sobald der Context da ist).
            if (audioEl) { refreshAudio(); audioTimer = setInterval(refreshAudio, 1000); }
            setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
        });
        // Settings wie ein Button, aber ohne Label/L.Pos (@dpa 20260719_040136). Text an/aus
        // ändert die Opener-Beschriftung sichtbar (offen/zu).
        registerCtrlStyle('u:' + cfg.key, 'opener', wrap, (s) => {
            oTextOn = s.textOn || cfg.label; oTextOff = s.textOff || cfg.label;
            oBg = s.bg || ''; oBgOn = s.bgOn || '';
            btn.style.color = s.fg || '';
            btn.style.fontSize = s.size ? s.size + 'px' : '';
            btn.style.padding = s.pad != null ? s.pad + 'px' : '';
            btn.style.width = s.boxSize ? s.boxSize + 'px' : '';
            btn.style.height = s.boxH ? s.boxH + 'px' : '';
            paintOpener();
        }, cfg.label);
        ctrlEls.set(cfg.key, wrap);
        return wrap;
    }
    function makeKnob(key) {
        const def = KNOBS[key];
        const saved = (state.get('knobMeta') || {})[key] || {};   // gespeicherte Optik gewinnt
        const knob = new Knob({
            id: 'knob_' + key,
            label: def.label, min: def.min, max: def.max, step: def.step ?? 0,
            curve: def.curve, unit: def.unit, decimals: def.decimals, formatValue: def.formatValue,
            value: state.get(key),
            defaultValue: DEFAULTS[key],
            // Parallel-Werte (@dpa 20260719_120425): sind mehrere Controls selektiert
            // (Shift+Klick im p-Mode) und dieser Knob ist dabei, wandern die anderen
            // selektierten Knobs um dasselbe Norm-Delta mit (Verhältnisse bleiben).
            onChange: (val) => {
                state.set(key, val);
                const now = knob._normValue, prev = _lastNorm.get(key) ?? now;
                _lastNorm.set(key, now);
                const d = now - prev;
                if (_knobSync || !d || arranging) return;
                if (selected.size > 1 && selected.has(knob.element)) {
                    _knobSync = true;
                    for (const el of selected) {
                        const k2 = el._knob;
                        if (!k2 || k2 === knob) continue;
                        k2._normValue = Math.max(0, Math.min(1, k2._normValue + d));
                        k2._updateVisual();
                        if (k2.onChange) k2.onChange(k2.value);
                    }
                    _knobSync = false;
                }
            },
            ...(def.meta || {}),   // Default-Gestalt aus der def (z.B. viewSize:'none' = „ohne Knob")
            ...saved,              // gespeicherte Nutzer-Optik gewinnt darüber
        });
        knob._defaultMeta = knob.getMeta();
        knob._factoryLabel = def.label;   // Ur-Label (Punkt H): Placeholder, wenn der Name geleert wird
        if (def.title) hint(knob.element, def.title);   // wie bei Toggle/Select/Display (PHASE4_SPEC.md 4A.5)
        knob.element._knob = knob;   // Rückweg Auswahl-Element → Knob (Parallel-Werte)
        knob.element.dataset.ctrl = 'k:' + key;
        knob.element.addEventListener('contextmenu', (e) => {
            e.preventDefault(); e.stopPropagation();
            metaEditor.open(knob);
            sizeHint.showInline(metaEditor.panel, sizeSourceLabel(knob.element));
        });
        knobsById.set(key, knob);
        ctrlEls.set(key, knob.element);
        // Wert-Recall wie bei Selects/Toggles (CODE_REVIEW #1, @dpa 20260719): setzt die
        // Engine state.set('bpm',…) via Tap/Nudge, folgt der Regler jetzt auch optisch.
        // setValueSilent = kein onChange → keine Rückkopplung; identischer Wert = nichts tun.
        ctrlBindings.set(key, (data) => {
            const v = data[key];
            if (v == null || Math.abs(v - knob.value) < 1e-9) return;
            knob.setValueSilent(v);
        });
        // Taste/MIDI: ein Regler ist stufenlos (continuous) — MIDI-CC folgt dem 0..1-Wert,
        // ein Tastendruck schiebt ihn eine Stufe höher (rundum, damit die Taste nie „tot" ist).
        keyMidi.register('k:' + key, knob.element, def.label, (e) => {
            if (e && e.type === 'cc') { knob.value = def.min + (def.max - def.min) * e.value01; return; }
            const st = def.step || (def.max - def.min) / 100;
            let v = (knob.value ?? def.min) + st;
            if (v > def.max) v = def.min;
            knob.value = v;
        }, { continuous: true });
        return knob;
    }

    // ── e-Mode: Auswahl als Menge (Multi-Select) ────────────────────────────────────
    const selected = new Set();
    function clearSelection() { for (const s of selected) s.classList.remove('arrange-selected'); selected.clear(); }
    function addSelected(el) { if (el && !selected.has(el)) { selected.add(el); el.classList.add('arrange-selected'); } }
    function removeSelected(el) { if (selected.has(el)) { selected.delete(el); el.classList.remove('arrange-selected'); } }
    function setSelected(el, additive = false) {
        if (!el) { clearSelection(); return; }
        const isGroup = el.classList.contains('group');
        const hasGroup = [...selected].some((s) => s.classList.contains('group'));
        if (isGroup || hasGroup || !additive) { clearSelection(); addSelected(el); return; }
        if (selected.has(el)) removeSelected(el); else addSelected(el);
    }

    // ── e-Mode: Panel schluckt Bedienung + Gummiband-Auswahl ────────────────────────
    panel.addEventListener('click', (e) => {
        if (!arranging) return;
        if (e.target.closest('.group-collapse')) return;
        e.preventDefault(); e.stopPropagation();
    }, true);
    let _band = null;
    panel.addEventListener('mousedown', (e) => {
        if (!arranging || e.button !== 0) return;
        if (e.target.closest('[data-ctrl], .group-title-bar')) return;
        e.preventDefault();
        const pr = panel.getBoundingClientRect();
        const x0 = e.clientX, y0 = e.clientY;
        const additive = e.shiftKey || e.metaKey;
        if (!additive) clearSelection();
        const box = document.createElement('div'); box.className = 'select-band';
        panel.appendChild(box); _band = box;
        const draw = (ev) => {
            const x = Math.min(x0, ev.clientX), y = Math.min(y0, ev.clientY);
            const w = Math.abs(ev.clientX - x0), h = Math.abs(ev.clientY - y0);
            box.style.left = (x - pr.left + panel.scrollLeft) + 'px';
            box.style.top = (y - pr.top + panel.scrollTop) + 'px';
            box.style.width = w + 'px'; box.style.height = h + 'px';
            const r = { left: x, top: y, right: x + w, bottom: y + h };
            for (const el of panel.querySelectorAll('[data-ctrl]')) {
                if (el.offsetParent === null) continue;
                const b = el.getBoundingClientRect();
                const hit = b.right > r.left && b.left < r.right && b.bottom > r.top && b.top < r.bottom;
                if (hit) addSelected(el); else if (!additive) removeSelected(el);
            }
        };
        const up = () => {
            window.removeEventListener('mousemove', draw); window.removeEventListener('mouseup', up);
            if (_band) { _band.remove(); _band = null; }
        };
        window.addEventListener('mousemove', draw); window.addEventListener('mouseup', up);
    });

    // ── Multi-Select auch im p-Mode (@dpa 20260719_120425) ──────────────────────────
    // Shift+Klick auf ein Control nimmt es in die Auswahl auf (ohne es zu bedienen);
    // ein einfacher Klick woanders „macht sein Ding" und löst die Auswahl auf.
    // Zweck: im p-Mode parallel Werte ändern (s. Knob-Sync in makeKnob).
    panel.addEventListener('mousedown', (e) => {
        if (arranging || e.button !== 0) return;
        if (keyMidi && keyMidi.isEdit && keyMidi.isEdit()) return;   // Overlay: nur Radio (KeyMidi), kein Multi-Select
        const ctrl = e.target.closest('[data-ctrl]');
        if (e.shiftKey && ctrl) {
            // NICHT sofort selektieren/blocken (@dpa 20260720, Punkt F): shift+ZIEHEN soll den
            // Knob FEIN ziehen. Nur ein shift-KLICK (ohne Bewegung) schaltet die Auswahl. Deshalb
            // Bewegung abwarten und den Knob-Drag durchlassen (kein preventDefault/stopPropagation).
            const sx = e.clientX, sy = e.clientY; let moved = false;
            const mv = (ev) => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4) moved = true; };
            const up = () => {
                window.removeEventListener('mousemove', mv, true); window.removeEventListener('mouseup', up, true);
                if (!moved) { if (selected.has(ctrl)) removeSelected(ctrl); else addSelected(ctrl); }
            };
            window.addEventListener('mousemove', mv, true); window.addEventListener('mouseup', up, true);
            return;
        }
        if (selected.size && (!ctrl || !selected.has(ctrl))) clearSelection();
    }, true);

    // ── Reorder-Zeilen (dragover/drop) — Reihenfolge in controlOrder ────────────────
    function wireArrange(row, rowId) {
        row.addEventListener('dragover', (e) => {
            if (!arranging || !ctrlDrag || ctrlDrag.row !== row) return;
            e.preventDefault(); e.stopPropagation();
        });
        row.addEventListener('drop', (e) => {
            if (!arranging || !ctrlDrag || ctrlDrag.row !== row) return;
            e.preventDefault(); e.stopPropagation();
            const target = e.target.closest('[data-ctrl]');
            if (!target || target === ctrlDrag.el || target.parentElement !== row) return;
            const rect = target.getBoundingClientRect();
            const after = e.clientX > rect.left + rect.width / 2;
            row.insertBefore(ctrlDrag.el, after ? target.nextSibling : target);
            persistControlOrder(rowId, row);
        });
    }
    function registerArrange(el, rowId) {
        arrangeRows.push({ el, rowId }); wireArrange(el, rowId);
        [...el.children].forEach((c) => { if (c.dataset.ctrl) wireCtrlMove(c); });
    }

    // ── Free-Canvas: Einheiten absolut platzieren, Gruppe umschließt den Inhalt ──────
    function unitList(name) {
        const e = groupEls.get(name); if (!e) return [];
        return [...e.body.querySelectorAll(':scope > [data-ctrl]')];
    }
    function freezeGroup(name) {
        const e = groupEls.get(name); if (!e) return;
        const body = e.body;
        const stored = (state.get('ctrlPos') || {})[name] || {};
        if (!freeGroups.has(name)) {
            const flat = [];
            for (const child of [...body.children]) {
                if (child.classList.contains('knob-row') || child.classList.contains('group-ctrls')) {
                    for (const c of [...child.children]) if (c.dataset.ctrl) flat.push(c);
                } else if (child.dataset.ctrl) { flat.push(child); }
            }
            const nat = new Map(); const hidden = [];
            {
                const br = body.getBoundingClientRect();
                flat.forEach((u) => {
                    if (u.offsetParent === null) { hidden.push(u); return; }
                    const r = u.getBoundingClientRect();
                    nat.set(u, { x: Math.round(r.left - br.left), y: Math.round(r.top - br.top) });
                });
            }
            const wasHidden = new Set(hidden);
            if (hidden.length) {
                hidden.forEach((u) => { u.style.display = ''; });
                const br2 = body.getBoundingClientRect();
                hidden.forEach((u) => { const r = u.getBoundingClientRect(); nat.set(u, { x: Math.round(r.left - br2.left), y: Math.round(r.top - br2.top) }); });
                hidden.forEach((u) => { u.style.display = 'none'; });
            }
            for (const child of [...body.children]) {
                if (child.classList.contains('knob-row') || child.classList.contains('group-ctrls')) {
                    for (const c of [...child.children]) if (c.dataset.ctrl) body.appendChild(c);
                    child.remove();
                }
            }
            body.classList.add('free-canvas');
            flat.forEach((u) => {
                const p = stored[u.dataset.ctrl] || nat.get(u) || { x: 0, y: 0 };
                u.style.position = 'absolute'; u.style.left = Math.max(0, p.x) + 'px'; u.style.top = Math.max(0, p.y) + 'px';
            });
            if (Object.keys(stored).length) {
                let below = 0;
                flat.forEach((u) => { if (!stored[u.dataset.ctrl]) return; below = Math.max(below, (parseFloat(u.style.top) || 0) + u.offsetHeight); });
                flat.forEach((u) => {
                    if (stored[u.dataset.ctrl]) return;
                    u.style.left = '0px'; u.style.top = (Math.ceil(below / GRID) * GRID + GRID) + 'px';
                    below += u.offsetHeight + GRID;
                });
            }
            wasHidden.forEach((u) => { u.style.display = 'none'; });
            freeGroups.add(name);
        } else {
            // BUGFIX (@dpa 20260722_172315: „andere Ordnung/sizes bei aktivem learn (nicht
            // e-mode!)"): Controls, die per mountInGroup() ERST NACH der ersten Freeze in eine
            // schon eingefrorene Gruppe nachgereicht werden (u:playKb/u:speicher/u:baseKb/…,
            // s. werkbank.js „Positions-Nachzügler"), laufen über DIESEN Zweig statt den
            // Erstaufbau oben — der setzte bisher nur left/top, nie `position:absolute`. Ohne
            // eigene position blieb das Control also in Wahrheit `position:static` (left/top
            // wirkungslos) — bis irgendein SPÄTERER CSS-Regelwechsel (z.B. .keyedit/.midiedit
            // setzt `position:relative` auf [data-ctrl]) die bis dahin schlafenden left/top-
            // Werte plötzlich aktivierte: genau der beobachtete Sprung beim Aktivieren von
            // Tasten-/MIDI-Learn.
            unitList(name).forEach((u) => { const p = stored[u.dataset.ctrl]; if (p) { u.style.position = 'absolute'; u.style.left = Math.max(0, p.x) + 'px'; u.style.top = Math.max(0, p.y) + 'px'; } });
        }
        sizeFreeGroup(name);
    }
    function sizeFreeGroup(name) {
        const e = groupEls.get(name); if (!e || !freeGroups.has(name)) return;
        let maxR = 0, maxB = 0;
        unitList(name).forEach((u) => {
            if (u.offsetParent === null) return;
            maxR = Math.max(maxR, u.offsetLeft + u.offsetWidth);
            maxB = Math.max(maxB, u.offsetTop + u.offsetHeight);
        });
        e.body.style.width = maxR + 'px'; e.body.style.height = maxB + 'px';
        e.g.style.maxWidth = 'none';
        sizePanel();
    }
    function wireCtrlMove(el) {
        el.addEventListener('mousedown', (e) => {
            if (!arranging) return;
            e.preventDefault(); e.stopPropagation();
            if (e.shiftKey || e.metaKey) { setSelected(el, true); return; }
            if (!selected.has(el)) setSelected(el);
            const movers = [...selected].filter((s) => s.dataset.ctrl && !s.classList.contains('group'));
            if (!movers.includes(el)) movers.push(el);
            const groups = new Set(); const starts = new Map();
            for (const m of movers) {
                const nm = m.closest('.group') && m.closest('.group').dataset.group; if (!nm) continue;
                if (!freeGroups.has(nm)) freezeGroup(nm);
                groups.add(nm);
                starts.set(m, { x: parseFloat(m.style.left) || 0, y: parseFloat(m.style.top) || 0, name: nm });
            }
            let minX = Infinity, minY = Infinity;
            for (const st of starts.values()) { minX = Math.min(minX, st.x); minY = Math.min(minY, st.y); }
            const sx = e.clientX, sy = e.clientY;
            let started = false;
            movers.forEach((m) => m.classList.add('ctrl-moving'));
            const onMove = (ev) => {
                const rdx = ev.clientX - sx, rdy = ev.clientY - sy;
                if (!started && Math.hypot(rdx, rdy) < 4) return;
                started = true;
                let dx, dy;
                if (ev.shiftKey) {
                    dx = Math.max(Math.round(rdx), -minX); dy = Math.max(Math.round(rdy), -minY);
                } else {
                    dx = Math.max(Math.round(rdx / GRID) * GRID, -Math.floor(minX / GRID) * GRID);
                    dy = Math.max(Math.round(rdy / GRID) * GRID, -Math.floor(minY / GRID) * GRID);
                }
                for (const [m, st] of starts) { const x = st.x + dx, y = st.y + dy; m.style.left = x + 'px'; m.style.top = y + 'px'; m._pend = { x, y }; }
            };
            const onUp = () => {
                window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
                const all = { ...state.get('ctrlPos') };
                for (const [m, st] of starts) {
                    m.classList.remove('ctrl-moving');
                    const p = m._pend || { x: st.x, y: st.y };
                    all[st.name] = { ...(all[st.name] || {}), [m.dataset.ctrl]: p };
                }
                state.set('ctrlPos', all);
                for (const nm of groups) sizeFreeGroup(nm);
            };
            window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
        });
    }
    function makeMovable(el, id) { if (el) { el.dataset.ctrl = id; wireCtrlMove(el); } return el; }
    function applyCtrlPos(data) {
        const cp = (data && data.ctrlPos) || {};
        for (const name of Object.keys(cp)) if (cp[name] && Object.keys(cp[name]).length) freezeGroup(name);
    }
    function nudgeSelected(dx, dy, fine) {
        if (!selected.size) return;
        const step = fine ? 1 : GRID;
        const groupSel = [...selected].find((s) => s.classList.contains('group'));
        if (groupSel) {
            const nm = groupSel.dataset.group;
            const pos = { ...state.get('groupPos') };
            const p = pos[nm] || { x: parseFloat(groupSel.style.left) || 0, y: parseFloat(groupSel.style.top) || 0 };
            pos[nm] = { x: Math.max(0, p.x + dx * step), y: Math.max(0, p.y + dy * step) };
            state.set('groupPos', pos);
            return;
        }
        const ctrls = [...selected].filter((s) => s.dataset.ctrl);
        const groups = new Set();
        for (const el of ctrls) { const nm = el.closest('.group') && el.closest('.group').dataset.group; if (nm) { if (!freeGroups.has(nm)) freezeGroup(nm); groups.add(nm); } }
        let minX = Infinity, minY = Infinity;
        for (const el of ctrls) { minX = Math.min(minX, parseFloat(el.style.left) || 0); minY = Math.min(minY, parseFloat(el.style.top) || 0); }
        const lo = (m) => fine ? -m : -Math.floor(m / GRID) * GRID;
        const mx = Math.max(dx * step, lo(minX)), my = Math.max(dy * step, lo(minY));
        const all = { ...state.get('ctrlPos') };
        for (const el of ctrls) {
            const name = el.closest('.group') && el.closest('.group').dataset.group; if (!name) continue;
            const x = (parseFloat(el.style.left) || 0) + mx, y = (parseFloat(el.style.top) || 0) + my;
            el.style.left = x + 'px'; el.style.top = y + 'px';
            all[name] = { ...(all[name] || {}), [el.dataset.ctrl]: { x, y } };
        }
        state.set('ctrlPos', all);
        for (const nm of groups) sizeFreeGroup(nm);
    }
    function persistControlOrder(rowId, row) {
        const order = [...row.children].map((c) => c.dataset.ctrl).filter(Boolean);
        state.set('controlOrder', { ...state.get('controlOrder'), [rowId]: order });
    }
    function applyControlOrder(data) {
        const co = (data && data.controlOrder) || {};
        for (const { el, rowId } of arrangeRows) {
            const order = co[rowId]; if (!order) continue;
            order.forEach((id) => { const c = [...el.children].find((x) => x.dataset.ctrl === id); if (c) el.appendChild(c); });
        }
    }

    // ── Gruppen bauen ───────────────────────────────────────────────────────────────
    // buildGroup baut GENAU EINE Gruppe. Früher inline in `for (const grp of GROUPS)`;
    // als Funktion herausgezogen, damit addGroup() (Multi-Sq, @dpa 20260723) zur Laufzeit
    // exakt dieselbe Bau-Logik nutzt, statt einen zweiten, driftenden Pfad zu pflegen.
    function buildGroup(grp) {
        const g = document.createElement('div'); g.className = 'group'; g.dataset.group = grp.name;
        const bar = document.createElement('div'); bar.className = 'group-title-bar';
        const collapseBtn = document.createElement('button'); collapseBtn.className = 'group-collapse'; collapseBtn.appendChild(icon('caret')); hint(collapseBtn, 'Ein-/Ausklappen');
        const h = document.createElement('div'); h.className = 'group-title'; h.textContent = grp.name; hint(h, 'Ziehen zum Verschieben · Rechtsklick = Einstellungen');
        bar.appendChild(collapseBtn); bar.appendChild(h); g.appendChild(bar);

        const body = document.createElement('div'); body.className = 'group-body';

        // Selects + Toggles + Buttons + inline-Knobs (obere Reihe)
        const selKeys = grp.selects || [], togKeys = grp.toggles || [], btnKeys = grp.buttons || [], inlineKeys = grp.inlineKnobs || [];
        const segKeys = grp.segments || [], specialCfgs = grp.specials || [], wechKeys = grp.wechsel || [];
        let ctrls = null;
        if (selKeys.length || segKeys.length || togKeys.length || btnKeys.length || inlineKeys.length || specialCfgs.length || wechKeys.length) {
            ctrls = document.createElement('div'); ctrls.className = 'group-ctrls';
            selKeys.forEach((k) => ctrls.appendChild(makeSelect(k)));
            segKeys.forEach((k) => ctrls.appendChild(makeSegment(k)));
            togKeys.forEach((k) => ctrls.appendChild(makeToggle(k)));
            btnKeys.forEach((k) => ctrls.appendChild(makeButton(k)));
            wechKeys.forEach((k) => ctrls.appendChild(makeWechsel(k)));
            specialCfgs.forEach((c) => ctrls.appendChild(makeSpecial(c)));
            inlineKeys.forEach((k) => makeKnob(k).mount(ctrls));
            body.appendChild(ctrls);
        }
        // Regler
        const knobRow = document.createElement('div'); knobRow.className = 'knob-row';
        (grp.knobs || []).forEach((k) => makeKnob(k).mount(knobRow));
        body.appendChild(knobRow);
        // Notizen + Texte + Anzeigen (freie Einheiten, einzeln verschiebbar)
        (grp.notes || []).forEach((k) => body.appendChild(makeMovable(makeNote(k), 'n:' + k)));
        (grp.texts || []).forEach((k) => body.appendChild(makeText(k)));
        (grp.displays || []).forEach((k) => body.appendChild(makeMovable(makeDisplay(k), 'u:' + k)));

        g.appendChild(body);
        collapseBtn.addEventListener('click', () => setGroupCollapsed(grp.name, !groupCollapsed(grp.name)));
        g.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const at = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, width: 0, height: 0 }) };
            openGroupSettings(grp.name, at);
        });
        // Titelleiste ziehen → feste Gruppen-Position (Optik).
        bar.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return;
            e.preventDefault();
            setSelected(g);
            const pr = panel.getBoundingClientRect();
            const gr = g.getBoundingClientRect();
            const ox = e.clientX - gr.left, oy = e.clientY - gr.top;
            let remX = mod(parseFloat(g.style.left) || 0, GRID), remY = mod(parseFloat(g.style.top) || 0, GRID);
            g.classList.add('dragging');
            const onMove = (ev) => {
                let nx = Math.max(0, ev.clientX - pr.left - ox + panel.scrollLeft);
                let ny = Math.max(0, ev.clientY - pr.top - oy + panel.scrollTop);
                if (ev.shiftKey) { nx = Math.round(nx); ny = Math.round(ny); remX = mod(nx, GRID); remY = mod(ny, GRID); }
                else { nx = Math.max(0, snapAxis(nx, remX, false)); ny = Math.max(0, snapAxis(ny, remY, false)); }
                g.style.left = nx + 'px'; g.style.top = ny + 'px';
            };
            const onUp = () => {
                window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
                g.classList.remove('dragging');
                const pos = { ...state.get('groupPos') };
                pos[grp.name] = { x: parseFloat(g.style.left) || 0, y: parseFloat(g.style.top) || 0 };
                state.set('groupPos', pos); sizePanel();
            };
            window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
        });

        groupEls.set(grp.name, { g, body, title: h, collapseBtn });
        groupKindOf.set(grp.name, grp.groupKind || grp.name);
        groupSuffixOf.set(grp.name, grp.instanceSuffix || '');
        groupExtraKeys.set(grp.name, grp.extraSoundKeys || []);
        if (ctrls) registerArrange(ctrls, grp.name + ':ctrls');
        registerArrange(knobRow, grp.name + ':knobs');
        panel.appendChild(g);
        return g;
    }
    for (const grp of GROUPS) buildGroup(grp);
    root.appendChild(panel);

    // ── Laufzeit-Gruppen (Multi-Sq, @dpa 20260723_140151) ──────────────────────────
    // addGroup/removeGroup bauen bzw. entfernen eine Gruppe NACH dem Erst-Aufbau. Saubere
    // Trennung (GroupHost bleibt audio-/domänen-agnostisch, s. Kopfkommentar): der Aufrufer
    // (Sq-Manager, werkbank.js) erweitert VORHER die defs-Objekte (KNOBS/SELECTS/TOGGLES/
    // DEFAULTS) um die indizierten Keys und setzt deren Werte in den State; GroupHost baut
    // nur DOM + wendet die vorhandene Optik an. Umgekehrt räumt removeGroup das gruppen-
    // NAMENS-basierte Optik-State (groupPos/groupStyles/controlOrder/ctrlPos) + die Control-
    // Maps der Gruppe auf; die indizierten WERT-Keys sowie ctrlStyles/knobMeta räumt der
    // Aufrufer (nur er kennt die genauen Keys/IDs seiner Sq).
    function addGroup(grp) {
        const g = buildGroup(grp);
        const data = state.toJSON ? state.toJSON() : {};
        applyGroupStyles(data); applyControlOrder(data); applyCtrlPos(data);
        applyGroupPositions();
        for (const fn of ctrlBindings.values()) fn(data);   // Werte-Recall der neuen Controls
        return g;
    }
    function removeGroup(name) {
        const e = groupEls.get(name);
        if (e) {
            // Control-Maps dieser Gruppe best-effort bereinigen (kein Geister-Update, kein
            // Leak). data-ctrl trägt 's:'/'t:'/'g:'/'k:'/… + key — id vor dem ':' = Style-ID,
            // dahinter = Wert-Key.
            e.g.querySelectorAll('[data-ctrl]').forEach((el) => {
                const id = el.dataset.ctrl; const key = id.slice(id.indexOf(':') + 1);
                styleTargets.delete(id); ctrlOnSetters.delete(id); ctrlBlinkSetters.delete(id); beatSetters.delete(id);
                ctrlBindings.delete(key); ctrlEls.delete(key); knobsById.delete(key);
            });
            e.g.remove(); groupEls.delete(name);
        }
        freeGroups.delete(name);
        for (let i = arrangeRows.length - 1; i >= 0; i--) {
            const rid = arrangeRows[i].rowId;
            if (rid === name || (rid && rid.startsWith(name + ':'))) arrangeRows.splice(i, 1);
        }
        const del = (k) => {
            const o = { ...(state.get(k) || {}) }; let ch = false;
            for (const p of Object.keys(o)) if (p === name || p.startsWith(name + ':')) { delete o[p]; ch = true; }
            if (ch) state.set(k, o);
        };
        del('groupPos'); del('groupStyles'); del('ctrlPos'); del('controlOrder');
        applyGroupPositions();
    }

    // ── Gruppen-Positionen (feste x/y, Shelf-Pack für neue) ─────────────────────────
    const GROUP_GAP = 12;
    function autoFlow(pos, names) {
        const panelW = panel.clientWidth || (window.innerWidth - 80);
        let startY = 0;
        for (const [n, e] of groupEls) if (pos[n]) startY = Math.max(startY, (pos[n].y || 0) + e.g.offsetHeight + GROUP_GAP);
        let x = 0, y = Object.keys(pos).length ? startY : 0, rowH = 0;
        for (const name of names) {
            const e = groupEls.get(name); if (!e) continue;
            const w = e.g.offsetWidth, hh = e.g.offsetHeight;
            if (x > 0 && x + w > panelW) { x = 0; y += rowH + GROUP_GAP; rowH = 0; }
            pos[name] = { x, y };
            x += w + GROUP_GAP; rowH = Math.max(rowH, hh);
        }
        return pos;
    }
    function applyGroupPositions() {
        const pos = { ...state.get('groupPos') };
        const stored = state.get('groupOrder') || [];
        const order = [...groupEls.keys()].sort((a, b) => ((stored.indexOf(a) + 1 || 99) - (stored.indexOf(b) + 1 || 99)));
        const missing = order.filter((n) => !pos[n]);
        if (missing.length) autoFlow(pos, missing);
        for (const name of order) { const e = groupEls.get(name), p = pos[name]; if (e && p) { e.g.style.left = p.x + 'px'; e.g.style.top = p.y + 'px'; } }
        if (missing.length) state.set('groupPos', pos);
        sizePanel();
    }
    function groupCollapsed(name) { const st = (state.get('groupStyles') || {})[name]; return !!(st && st.collapsed); }
    function setGroupStyle(name, patch) {
        const styles = { ...(state.get('groupStyles') || {}) };
        styles[name] = { ...(styles[name] || {}), ...patch };
        state.set('groupStyles', styles);
    }
    function setGroupCollapsed(name, on) { setGroupStyle(name, { collapsed: on }); }
    function applyGroupStyles(data) {
        const styles = (data && data.groupStyles) || {};
        for (const [name, e] of groupEls) {
            const st = styles[name] || {};
            e.g.style.background = st.bg || '';
            e.title.style.color = st.headColor || '';
            e.title.textContent = st.name || name;
            e.g.style.width = st.width ? st.width + 'px' : '';
            e.g.style.maxWidth = st.width ? st.width + 'px' : (freeGroups.has(name) ? 'none' : '');
            e.g.style.minHeight = st.height ? st.height + 'px' : '';
            // Größe % (@dpa 20260720): skaliert nur den BODY, der HEADER bleibt konstant
            // (@dpa: „der Gruppen Header soll sich nicht in der Größe verändern"). `zoom` reflowt
            // die Nachbarn mit; der reservierte Platz wächst über sizePanel (bounding rects) mit.
            e.g.style.zoom = '';   // evtl. Alt-Stand entfernen (Zoom liegt jetzt am Body)
            e.body.style.zoom = (st.scale && st.scale !== 100) ? (st.scale / 100) : '';
            const col = !!st.collapsed;
            e.body.style.display = col ? 'none' : '';
            e.collapseBtn.classList.toggle('collapsed', col);
        }
        sizePanel();
    }
    let _sizeRaf = null;
    function sizePanel() {
        cancelAnimationFrame(_sizeRaf);
        _sizeRaf = requestAnimationFrame(() => {
            // getBoundingClientRect statt offset* (@dpa 20260720): Bounding-Rects spiegeln den
            // ZOOM (Größe %), offsetHeight/-Width nicht → sonst blieb der reservierte Platz zu
            // klein und skalierte Gruppen überlappten die Nachbarn (RP-Problem).
            const pr = panel.getBoundingClientRect();
            let maxB = 0, maxR = 0;
            for (const { g } of groupEls.values()) {
                const r = g.getBoundingClientRect();
                maxB = Math.max(maxB, (r.bottom - pr.top) + panel.scrollTop);
                maxR = Math.max(maxR, (r.right - pr.left) + panel.scrollLeft);
            }
            panel.style.height = Math.ceil(maxB) + 'px'; panel.style.width = Math.ceil(maxR) + 'px';
        });
    }

    // ── Combo (Optik) — Pool pro Gruppen-Art, @dpa 20260724 ─────────────────────────
    // Nachgerüstet ggü. dem Lean-Port-Kommentar unten: @dpa wollte Gruppen-Combo/-Snapshot
    // doch, mit einer Besonderheit ggü. teslacoil — „alle Klone haben gemeinsam den Pool":
    // die LISTE gespeicherter Combos hängt an groupKindOf.get(name) (geteilt zwischen allen
    // Instanzen derselben Art), welcher Eintrag GERADE geladen ist (…Sel) bleibt literal pro
    // Instanz-Name (reine Anzeige-Bequemlichkeit, keine Frage der Datenhaltung).
    function _comboPayloadOf(name) {
        const suffix = groupSuffixOf.get(name) || '';
        const e = groupEls.get(name);
        const ctrlStylesAll = state.get('ctrlStyles') || {};
        const knobMetaAll = state.get('knobMeta') || {};
        const ctrlStyles = {}, knobMeta = {};
        if (e) {
            e.g.querySelectorAll('[data-ctrl]').forEach((el) => {
                const id = el.dataset.ctrl;
                if (ctrlStylesAll[id] !== undefined) ctrlStyles[stripSuffix(id, suffix)] = ctrlStylesAll[id];
                if (id.startsWith('k:')) {
                    const key = id.slice(2);
                    if (knobMetaAll[key] !== undefined) knobMeta[stripSuffix(key, suffix)] = knobMetaAll[key];
                }
            });
        }
        const ctrlPosAll = (state.get('ctrlPos') || {})[name] || {};
        const ctrlPos = {};
        for (const [id, pos] of Object.entries(ctrlPosAll)) ctrlPos[stripSuffix(id, suffix)] = pos;
        const controlOrderAll = state.get('controlOrder') || {};
        const controlOrder = {};
        for (const part of ['ctrls', 'knobs']) {
            const order = controlOrderAll[name + ':' + part];
            if (order) controlOrder[part] = order.map((id) => stripSuffix(id, suffix));
        }
        // Nur die Gruppen-EIGENE Erscheinung (Rahmen/Größe) — bewusst OHNE 'name' (Umbenennung
        // ist Identität der Instanz, kein Look) und OHNE 'collapsed' (flüchtiger UI-Zustand).
        const gs = (state.get('groupStyles') || {})[name] || {};
        const groupStyle = {};
        for (const k of ['bg', 'headColor', 'width', 'height', 'scale']) if (gs[k] !== undefined) groupStyle[k] = gs[k];
        return { ctrlStyles, knobMeta, ctrlPos, controlOrder, groupStyle };
    }
    /** Kanonisches Payload auf EINE konkrete Instanz anwenden — Optik direkt neu malen
     *  (styleTargets/knobsById, wie ElementSettings/KnobMetaEditor es auch tun), Positionen/
     *  Reihenfolge/Rahmen über state.set (die bestehende state.subscribe-Kette unten malt die). */
    function _applyCombo(name, payload) {
        const suffix = groupSuffixOf.get(name) || '';
        if (payload.ctrlStyles && Object.keys(payload.ctrlStyles).length) {
            const cur = { ...(state.get('ctrlStyles') || {}) };
            for (const [ckey, style] of Object.entries(payload.ctrlStyles)) {
                const litId = addSuffix(ckey, suffix);
                cur[litId] = style;
                const target = styleTargets.get(litId);
                if (target) target.applyStyle(style);
            }
            state.set('ctrlStyles', cur);
        }
        if (payload.knobMeta && Object.keys(payload.knobMeta).length) {
            const cur = { ...(state.get('knobMeta') || {}) };
            for (const [ckey, meta] of Object.entries(payload.knobMeta)) {
                const litKey = addSuffix(ckey, suffix);
                cur[litKey] = meta;
                const knob = knobsById.get(litKey);
                if (knob) knob.setMeta(meta);
            }
            state.set('knobMeta', cur);
        }
        if (payload.ctrlPos && Object.keys(payload.ctrlPos).length) {
            const all = { ...state.get('ctrlPos') };
            const inner = { ...(all[name] || {}) };
            for (const [ckey, pos] of Object.entries(payload.ctrlPos)) inner[addSuffix(ckey, suffix)] = pos;
            all[name] = inner;
            state.set('ctrlPos', all);
        }
        if (payload.controlOrder && Object.keys(payload.controlOrder).length) {
            const all = { ...state.get('controlOrder') };
            for (const [part, order] of Object.entries(payload.controlOrder)) all[name + ':' + part] = order.map((ckey) => addSuffix(ckey, suffix));
            state.set('controlOrder', all);
        }
        if (payload.groupStyle && Object.keys(payload.groupStyle).length) setGroupStyle(name, payload.groupStyle);
    }
    function listGroupCombos(name) { return (state.get('groupCombos') || {})[groupKindOf.get(name)] || []; }
    function saveGroupCombo(name, entryName) {
        const kind = groupKindOf.get(name);
        const all = { ...(state.get('groupCombos') || {}) };
        const list = (all[kind] || []).slice();
        const entry = { name: entryName, ts: Date.now(), ..._comboPayloadOf(name) };
        const at = list.findIndex((it) => it.name === entryName);
        if (at >= 0) list[at] = entry; else list.push(entry);
        all[kind] = list; state.set('groupCombos', all);
        const sel = { ...(state.get('groupComboSel') || {}) }; sel[name] = entryName; state.set('groupComboSel', sel);
        return list;
    }
    function updateGroupCombo(name, index) {
        const kind = groupKindOf.get(name);
        const all = { ...(state.get('groupCombos') || {}) };
        const list = (all[kind] || []).slice();
        if (!list[index]) return false;
        list[index] = { ...list[index], ts: Date.now(), ..._comboPayloadOf(name) };
        all[kind] = list; state.set('groupCombos', all);
        return true;
    }
    /** Umbenennen wirkt auf den ganzen Pool (die Sel-Zeiger ALLER Instanzen dieser Art, die
     *  gerade den umbenannten Eintrag geladen haben, folgen dem neuen Namen mit). */
    function renameGroupCombo(name, index, newName) {
        const kind = groupKindOf.get(name);
        const all = { ...(state.get('groupCombos') || {}) };
        const list = (all[kind] || []).slice();
        const oldName = list[index] && list[index].name;
        const err = renameIn(list, index, newName);
        if (!err && oldName) {
            all[kind] = list; state.set('groupCombos', all);
            const sel = { ...(state.get('groupComboSel') || {}) };
            let ch = false;
            for (const [litName, selName] of Object.entries(sel)) {
                if (selName === oldName && groupKindOf.get(litName) === kind) { sel[litName] = list[index].name; ch = true; }
            }
            if (ch) state.set('groupComboSel', sel);
        }
        return err;
    }
    function deleteGroupCombo(name, index) {
        const kind = groupKindOf.get(name);
        const all = { ...(state.get('groupCombos') || {}) };
        const list = (all[kind] || []).slice();
        const removed = list[index];
        list.splice(index, 1);
        all[kind] = list; state.set('groupCombos', all);
        if (removed) {
            const sel = { ...(state.get('groupComboSel') || {}) };
            let ch = false;
            for (const [litName, selName] of Object.entries(sel)) {
                if (selName === removed.name && groupKindOf.get(litName) === kind) { delete sel[litName]; ch = true; }
            }
            if (ch) state.set('groupComboSel', sel);
        }
        return list;
    }
    function recallGroupCombo(name, index) {
        const entry = listGroupCombos(name)[index];
        if (!entry) return false;
        _applyCombo(name, entry);
        const sel = { ...(state.get('groupComboSel') || {}) }; sel[name] = entry.name; state.set('groupComboSel', sel);
        return true;
    }

    // ── Gruppen-Settings (Rechtsklick): Name · Combo · BG · Head · Breite · Höhe ───
    let _settingsPop = null, _settingsKey = null, _settingsCombo = null;
    function closeGroupSettings() {
        if (!_settingsPop) return;
        if (_settingsCombo) { _settingsCombo.close(); _settingsCombo = null; }
        _settingsPop.remove(); _settingsPop = null;
        document.removeEventListener('mousedown', _outsideClose, true);
        if (_settingsKey) { document.removeEventListener('keydown', _settingsKey, true); _settingsKey = null; }
    }
    function _outsideClose(e) {
        if (e.target.closest && e.target.closest('.cp-pop')) return;   // eigener Farbwähler zählt als drinnen
        if (_settingsPop && !_settingsPop.contains(e.target)) closeGroupSettings();
    }
    function openGroupSettings(name, anchor) {
        closeGroupSettings();
        const st = (state.get('groupStyles') || {})[name] || {};
        const pop = document.createElement('div'); pop.className = 'group-settings';
        // Kopfzeile wie bei den Control-Settings (verschiebbar, ✕), aber ohne Control-Namen –
        // Titel ist der Gruppenname (@dpa 20260719).
        const header = document.createElement('div'); header.className = 'gs-header';
        const titleEl = document.createElement('span'); titleEl.className = 'gs-title'; titleEl.textContent = st.name || name;
        const closeBtn = document.createElement('button'); closeBtn.className = 'kme-close'; closeBtn.textContent = '✕'; closeBtn.title = 'Schließen';
        closeBtn.addEventListener('click', closeGroupSettings);
        header.append(titleEl, closeBtn); pop.appendChild(header);
        const row = (label, ...els) => { const r = document.createElement('div'); r.className = 'gs-row'; const l = document.createElement('span'); l.className = 'gs-lab'; l.textContent = label; r.appendChild(l); els.forEach((e) => r.appendChild(e)); pop.appendChild(r); };

        const nameIn = document.createElement('input'); nameIn.type = 'text'; nameIn.value = st.name || name; nameIn.className = 'gs-text';
        nameIn.addEventListener('input', () => { setGroupStyle(name, { name: nameIn.value || name }); titleEl.textContent = nameIn.value || name; });
        row('Name', nameIn);

        // Combo (Optik, @dpa 20260724) — Pool pro Gruppen-Art, s. saveGroupCombo/recallGroupCombo.
        const comboMenu = new PickMenu({
            label: 'Combo',
            empty: '— kein Combo —',
            title: 'Optik dieser Gruppe speichern/laden',
            list: () => listGroupCombos(name),
            current: () => (state.get('groupComboSel') || {})[name] || '',
            onPick: (i) => recallGroupCombo(name, i),
            onUpdate: (i) => updateGroupCombo(name, i),
            onRename: (i, item, newName) => renameGroupCombo(name, i, newName),
            onDelete: (i) => deleteGroupCombo(name, i),
            foot: [['plus', '+ Neu', 'Aktuelle Optik als neuen Combo speichern', () => {
                const nm = prompt('Name für den neuen Combo?', 'Combo ' + (listGroupCombos(name).length + 1));
                if (nm && nm.trim()) saveGroupCombo(name, nm.trim());
            }]],
        });
        _settingsCombo = comboMenu;
        if (groupSuffixOf.get(name)) hint(comboMenu.element, `Gilt für alle „${groupKindOf.get(name)}"-Klone — gemeinsamer Speicher.`);
        pop.appendChild(comboMenu.element);

        // Farbe kompakt wie in den Control-Settings (ElementSettings): Farbfeld + ✕ statt
        // eines platzraubenden horizontalen Faders (@dpa 20260718). Die Deckkraft, die vorher
        // ein eigener Alpha-Slider war, steckt jetzt in einem schmalen Zahlenfeld (%), damit
        // Gruppen weiter halbtransparent sein können, ohne dass ein Fader die Zeile aufbläht.
        const mkColor = (labelTxt, prop, defHex) => {
            const col = document.createElement('input'); col.type = 'color'; col.value = parseHex(st[prop], defHex);
            const a = document.createElement('input'); a.type = 'number'; a.className = 'gs-alpha-num';
            a.min = 0; a.max = 100; a.step = 5; hint(a, 'Deckkraft %');
            a.value = Math.round(parseA(st[prop], 1) * 100);
            // Deckkraft in % sichtbar beschriftet (@dpa 20260719: das nackte „100" war unklar).
            const pct = document.createElement('span'); pct.className = 'gs-pct'; pct.textContent = '%';
            const clr = document.createElement('button'); clr.className = 'kme-x'; clr.textContent = '✕'; hint(clr, 'Farbe entfernen');
            const apply = () => setGroupStyle(name, { [prop]: hexA(col.value, Math.max(0, Math.min(1, (parseFloat(a.value) || 0) / 100))) });
            col.addEventListener('input', apply); a.addEventListener('input', apply);
            clr.addEventListener('click', () => setGroupStyle(name, { [prop]: undefined }));
            row(labelTxt, col, a, pct, clr);
        };
        mkColor('BG', 'bg', '#1c2027');
        // „VG" = Vordergrund/Schrift des Gruppenkopfs (vorher „Head", @dpa 20260719).
        mkColor('VG', 'headColor', '#8a93a3');

        // Breite/Höhe als Zahlenfelder wie 'Breite'/'Höhe' in den Control-Settings; leer/0 = auto.
        const sizeGrid = document.createElement('div'); sizeGrid.className = 'kme-grid gs-size-grid';
        const mkSize = (labelTxt, prop, max) => {
            const r = document.createElement('div'); r.className = 'kme-row';
            const l = document.createElement('label'); l.textContent = labelTxt; r.appendChild(l);
            const num = document.createElement('input'); num.type = 'number'; num.min = 0; num.max = max; num.step = 2;
            num.value = st[prop] || ''; num.placeholder = 'auto';
            num.addEventListener('input', () => { const v = parseInt(num.value, 10); setGroupStyle(name, { [prop]: v > 0 ? v : undefined }); });
            r.appendChild(num); sizeGrid.appendChild(r);
        };
        mkSize('Breite', 'width', 800);
        mkSize('Höhe', 'height', 800);
        // Größe % (@dpa 20260720, Punkt G): [50–200]%, skaliert die ganze Gruppe (100 = neutral).
        (() => {
            const r = document.createElement('div'); r.className = 'kme-row';
            const l = document.createElement('label'); l.textContent = 'Größe %'; r.appendChild(l);
            const num = document.createElement('input'); num.type = 'number'; num.min = 50; num.max = 200; num.step = 5;
            num.value = st.scale || 100; hint(num, 'Gruppengröße in Prozent [50–200]');
            num.addEventListener('input', () => {
                const v = Math.max(50, Math.min(200, parseInt(num.value, 10) || 100));
                setGroupStyle(name, { scale: v !== 100 ? v : undefined });
            });
            r.appendChild(num); sizeGrid.appendChild(r);
        })();
        pop.appendChild(sizeGrid);

        // Unaufdringlicher Hinweis (@dpa 20260720): bei Größe ≠ 100 % sind Breite/Höhe nur
        // Grundmaße vor der Skalierung — die angezeigten Zahlen stimmen nicht 1:1 mit dem, was
        // man sieht. Nur zeigen, wenn tatsächlich skaliert wird.
        if (st.scale && st.scale !== 100) {
            const note = document.createElement('div'); note.className = 'gs-scale-note';
            note.textContent = `Breite/Höhe sind Grundmaße — dargestellt × ${st.scale} %.`;
            pop.appendChild(note);
        }

        // Kein „Fertig"-Knopf mehr – die Felder wirken live; stattdessen ein Fußhinweis.
        const foot = document.createElement('div'); foot.className = 'gs-foot';
        foot.textContent = 'Enter = Übernehmen · ESC = Verlassen';
        pop.appendChild(foot);

        const r = anchor.getBoundingClientRect();
        pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 280))}px`;
        pop.style.top = `${r.bottom + 4}px`;
        document.body.appendChild(pop);
        upgradeColorInputs(pop);   // eigener kompakter Farbwähler statt des nativen (@dpa 20260719_120425)
        _settingsPop = pop;
        makeDraggable(pop, header);   // an der Kopfzeile verschiebbar wie die anderen Settings
        setTimeout(() => document.addEventListener('mousedown', _outsideClose, true), 0);
        // Enter übernimmt (Felder wirken ohnehin live) · ESC verlässt. Offener Farbwähler
        // fängt seine eigenen Tasten ab – hier nicht schließen, während man eine Farbe wählt.
        _settingsKey = (e) => {
            if (!_settingsPop) return;
            if (e.target.closest && e.target.closest('.cp-pop')) return;
            if (e.key === 'Enter' || e.key === 'Escape') { e.stopPropagation(); closeGroupSettings(); }
        };
        document.addEventListener('keydown', _settingsKey, true);
    }

    // ── Anordnen-Modus an/aus ───────────────────────────────────────────────────────
    let _arrangeHint = null;
    function setArranging(on) {
        arranging = on;
        panel.classList.toggle('arranging', on);
        for (const kn of knobsById.values()) { kn.locked = on; if (on) kn.element.classList.remove('knob-selected'); }
        for (const { el } of arrangeRows) [...el.children].forEach((c) => { if (c.dataset.ctrl) c.draggable = false; });
        if (on) { for (const name of groupEls.keys()) freezeGroup(name); }
        // Selektion beim Umschalten BEHALTEN (@dpa 20260719_120425): er togglet ständig
        // e-Mode an/aus, um die Platzierung ohne Rahmen zu prüfen — jedes Mal neu
        // selektieren war unnötig. Aufräumen macht Escape / Klick ins Leere.
        if (on && !_arrangeHint) {
            _arrangeHint = document.createElement('div'); _arrangeHint.className = 'arrange-hint';
            i18nText(_arrangeHint, 'Anordnen-Modus – Element klicken/ziehen (10px-Raster · Shift 1px · Pfeiltasten)');
            document.body.appendChild(_arrangeHint);
        } else if (!on && _arrangeHint) { _arrangeHint.remove(); _arrangeHint = null; }
        if (opts.onArrangeChange) opts.onArrangeChange(on);
    }

    // ── Tastatur: e = Anordnen · Pfeile bewegen Auswahl · Esc räumt auf ─────────────
    window.addEventListener('keydown', (e) => {
        const globalOk = globalKeyOk(e.target);
        if (e.key === 'Escape') {
            // Gestufte Funktionsebenen (@dpa 20260720, Punkt D): pro ESC nur EINE Ebene abbauen,
            // von innen nach außen. Fenster mit eigenem ESC (KnobMetaEditor/Farbwähler/Gruppen-
            // Settings/…) fangen ihren ESC schon in der Capture-Phase ab und kommen hier nicht an.
            // Hier: (1) offenes Gruppen-Settings-Fenster, (2) aktive Auswahl. Bleibt danach noch
            // etwas offen (Lern-Overlay, Anordnen-Modus), macht das der Orchestrator (werkbank.js)
            // — deshalb NUR bei behandelter Ebene stopImmediatePropagation, sonst durchreichen.
            if (_settingsPop) { closeGroupSettings(); e.stopImmediatePropagation(); return; }
            if (selected.size) { clearSelection(); e.stopImmediatePropagation(); return; }
            const ae = document.activeElement;
            if (ae && ae !== document.body && ae.tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) {
                ae.blur(); e.stopImmediatePropagation(); return;
            }
            return;   // nichts Lokales offen → ESC an werkbank.js weiterreichen (Overlay/Anordnen)
        }
        if (globalOk && (e.key === 'e' || e.key === 'E') && !e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault(); setArranging(!arranging); return;
        }
        if (arranging && selected.size && globalOk && e.key.startsWith('Arrow')) {
            const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
            if (d) { e.preventDefault(); nudgeSelected(d[0], d[1], e.shiftKey); return; }
        }
    });

    // ── Recall: Optik/Positionen anwenden (Init + auf State-Änderung) ───────────────
    function applyAll(data) {
        applyGroupStyles(data);
        applyControlOrder(data);
        applyCtrlPos(data);
        applyGroupPositions();
    }
    applyAll(state.toJSON ? state.toJSON() : {});
    state.subscribe((key, data) => {
        if (key === 'groupStyles') applyGroupStyles(data);
        else if (key === 'groupPos' || key === 'groupOrder') applyGroupPositions();
        else if (key === 'controlOrder') applyControlOrder(data);
        else if (key === 'ctrlPos') applyCtrlPos(data);
        // Recall der Werte (Selects/Toggles/Texte) — Knobs binden sich selbst über onChange.
        if (ctrlBindings.size) for (const [k, fn] of ctrlBindings) if (key === k || key === '*') fn(data);
    });

    return {
        panel, setArranging, isArranging: () => arranging, keyMidi,
        /** Ein fertig gebautes, ENGINE-gebundenes Control-Element (z.B. ein eigenständiges
         *  Keyboard-Widget, das eine eigene Voice-Engine ansteuert) strukturell in eine
         *  Gruppe hängen + als beweglich markieren (@dpa 20260721_203557: „gehört strukturell
         *  in die Gruppe", statt als loses Geschwister neben dem Panel). GroupHost bleibt
         *  Audio-agnostisch — der Aufrufer bringt Element + Engine-Bindung schon fertig mit. */
        mountInGroup: (groupName, el, ctrlId) => {
            const g = [...panel.querySelectorAll('.group')].find((x) => x.dataset.group === groupName);
            const body = g && g.querySelector('.group-body');
            if (body) body.appendChild(makeMovable(el, ctrlId));
        },
        /** Rechtsklick-Settings für ein extern gebautes Control registrieren (s. mountInGroup). */
        registerCtrlStyle,
        /** Eine Gruppe zur Laufzeit bauen bzw. entfernen (Multi-Sq). Aufrufer erweitert vorher
         *  die defs/State-Keys (addGroup) bzw. räumt seine indizierten Wert-Keys selbst auf
         *  (removeGroup räumt nur das gruppen-namensbasierte Optik-State + Control-Maps). */
        addGroup, removeGroup,
        /** Vorhandene Gruppennamen (für den Sq-Manager: Migration/Recall der Sq-Liste). */
        groupNames: () => [...groupEls.keys()],
        /** Combo (Optik) — Pool pro Gruppen-Art, s. Kopfkommentar bei _comboPayloadOf. */
        listGroupCombos, saveGroupCombo, updateGroupCombo, renameGroupCombo, deleteGroupCombo, recallGroupCombo,
        /** ON-Zustand eines Controls setzen (z.B. Start-Knopf, solange das Metronom läuft). */
        setCtrlOn: (id, on) => { const f = ctrlOnSetters.get(id); if (f) f(on); },
        /** Blink-Wartezustand eines Controls setzen (z.B. Rec „armed" bis zum nächsten Downbeat). */
        setCtrlBlink: (id, on) => { const f = ctrlBlinkSetters.get(id); if (f) f(on); },
        /** Aktuellen Beat in einer Takt-Anzeige hervorheben (vom Takt getrieben). */
        setBeat: (id, i) => { const f = beatSetters.get(id); if (f) f(i); },
        /** Nur die ANZEIGE eines Reglers setzen, ohne den State zu ändern (z.B. BPM folgt dem
         *  Anschieben +/−, @dpa 20260720). setValueSilent → kein onChange, kein state.set. */
        setKnobDisplay: (key, v) => { const k = knobsById.get(key); if (k) k.setValueSilent(v); },
        refresh: () => applyAll(state.toJSON ? state.toJSON() : {}),
    };
}

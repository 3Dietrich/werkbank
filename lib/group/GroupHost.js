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
 *   opts  — { onArrangeChange?(on), arrangeKeyOf?() }  (onArrangeChange: z.B. um einen Header-
 *     Schalter zu spiegeln; arrangeKeyOf: liefert die aktuell GELERNTE Anordnen-Taste (leer =
 *     nichts gelernt → Default 'e'/'E' bleibt aktiv), s. Kommentar am Tastatur-Listener unten)
 *
 * Rückgabe: { panel, setArranging(on), isArranging(), refresh() }.
 *
 * Persistenz-Keys im State (Optik-Ebene, wie teslacoils LAYOUT_KEYS):
 *   ctrlStyles · knobMeta · ctrlPos · groupPos · groupStyles · groupOrder · controlOrder ·
 *   ctrlOffPanel (dd.md 20260801: Control auf dem Panel vs. nur in den Gruppen-Settings,
 *   flache Map data-ctrl-ID → true, nur „aus dem Panel" wird eingetragen)
 */
import { Knob } from '../Knob.js';
import { KnobMetaEditor } from '../KnobMetaEditor.js';
import { ElementSettings } from '../ElementSettings.js';
import { icon } from '../icons.js';
import { hint, text as i18nText, stopText, t as i18nT, lang as i18nLang, onLangChange } from '../i18n.js';
import { factoryHint } from '../hints.js';
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
    // Panel?-Umschalter (@dpa dd.md 20260801): die beiden Settings-Panels rufen diese Hooks,
    // um den Auf-dem-Panel-Zustand eines Controls zu lesen/zu setzen – isOffPanel/setOffPanel
    // sind weiter unten definiert (Funktionsdeklarationen sind gehoisted, die Zuweisung hier
    // funktioniert unabhängig von der Reihenfolge im Quelltext). Beide Panels bringen No-Op-
    // Defaults mit, falls sie ohne GroupHost laufen (Selbsttest) – hier werden sie überschrieben.
    metaEditor.offPanelGet = (id) => isOffPanel(id);
    metaEditor.onOffPanel = (id, off) => setOffPanel(id, off);
    elemSettings.offPanelGet = (id) => isOffPanel(id);
    elemSettings.onOffPanel = (id, off) => setOffPanel(id, off);
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
    // literal name → kanonische Keys, die der COMBO (Optik) NICHT erfasst/recallt (@dpa
    // ddw.md 20260724: „Combo soll nicht den 'Steps'-Inhalt speichern/recallen" — seqLen ist
    // ein normaler Knob und würde sonst wie jeder andere in jeden Sequenzer-Combo einfließen,
    // sobald er einmal Meta bekommt). Snapshot bleibt unberührt (extraSoundKeys/groupValueKeys).
    const groupComboExcludeKeys = new Map();
    // literal name → { bareKey: string[] } — FEIN-Ausschluss INNERHALB eines Controls (@dpa
    // ddw.md 20260724_192304: Steps-ANSICHT — Farben/Breite/Höhe — soll ins Combo, aber
    // min/max/stepSize (die Data-Sektion) nicht, obwohl beides im selben ctrlStyles-Eintrag
    // von u:seqGrid steckt). Anders als groupComboExcludeKeys (schließt den KOMPLETTEN
    // Control-Eintrag aus) werden hier nur einzelne FELDER aus dem Objekt gestrichen, der Rest
    // bleibt normaler Combo-Inhalt.
    const groupComboExcludeFields = new Map();
    const knobsById = new Map();
    const _lastNorm = new Map();         // key → letzte Norm (für das Parallel-Delta)
    let _knobSync = false;               // Guard: Parallel-Verteilung nicht rekursiv fan-outen
    const beatSetters = new Map();       // id → (beatIndex)=>void  (Takt-Anzeige, vom Takt getrieben)
    const ctrlBindings = new Map();      // key → (data) => UI aktualisieren
    const ctrlEls = new Map();           // key → DOM-Wrapper
    const styleTargets = new Map();      // id → { type, el, applyStyle }
    // id → () => void, öffnet die normalen Control-Settings dieses Controls (@dpa dd.md
    // 20260801, Punkt „Rechtsklick auf eine Off-Panel-Zeile"): registerCtrlStyle merkt sich
    // hier pro id EINMAL, wie man die Settings öffnet, statt die Argument-Liste (id, type, el,
    // defLabel, applyStyle, extra) an zwei Stellen im Code zu pflegen.
    const ctrlOpenFns = new Map();
    // key → () => void, schaltet einen Wechsel-Button (w:) eine Stufe weiter — von
    // renderOffPanelList() wiederverwendet, damit die Zyklus-Logik (inkl. cfg.onClick) nur
    // in makeWechsel() lebt statt zweimal geschrieben zu werden.
    const wechselCycle = new Map();
    // bareKey → (data)=>void, hält eine offene Off-Panel-Zeile (Gruppen-Settings) mit dem
    // State synchron — dieselbe Dispatch-Idee wie ctrlBindings, nur für die parallele
    // Mini-UI (s. renderOffPanelList). Wird bei jedem Rendern der Liste geleert/neu befüllt,
    // ist also nur gefüllt, solange tatsächlich ein Gruppen-Settings-Fenster offen ist.
    const offPanelRowSync = new Map();
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
        console.log('[GroupHost.registerCtrlStyle] CALLED for id:', id, 'type:', type);
        styleTargets.set(id, { type, el, applyStyle });
        const saved = (state.get('ctrlStyles') || {})[id];
        console.log('[GroupHost.registerCtrlStyle] saved from state:', saved);
        // BUGFIX (@dpa 20260805): applyStyle IMMER aufrufen, auch bei erstem Laden ohne gespeicherte Stile
        // Vorher: nur wenn `saved` truthy (beim 1. Laden war saved undefined → Callback lief nie)
        // Signal-Scope bekam seine boxSize nie zugewiesen → blieb bei Canvas-Defaults (120×34)
        console.log('[GroupHost.registerCtrlStyle] calling applyStyle with:', saved || {});
        applyStyle(saved || {});
        // BUGFIX (@dpa dd.md 20260802, „DSR"/Multi-ADSR „Out"-Ziel: nach Reload wieder auf dem
        // Panel, obwohl vorher explizit ausgeblendet): applyOffPanel() (unten) läuft NUR beim
        // Erst-Aufbau bzw. bei addGroup() — Controls, die (wie multiEnv.js' PickMenu-„Out") ERST
        // NACH host.addGroup() per registerCtrlStyle() dazukommen, verpassen diesen Durchlauf,
        // weil sie zu dem Zeitpunkt noch gar nicht in `styleTargets` standen. Die persistierte
        // Flagge (ctrlOffPanel) blieb darum unangewendet — der Control tauchte nach jedem Reload
        // wieder auf dem Panel auf. Hier direkt bei der Registrierung nachholen, statt auf einen
        // erneuten globalen applyOffPanel()-Lauf zu hoffen.
        el.classList.toggle('ctrl-offpanel', isOffPanel(id));
        // Öffnen-Funktion EINMAL merken (@dpa dd.md 20260801): die Off-Panel-Liste in den
        // Gruppen-Settings braucht denselben Rechtsklick-Aufruf (Punkt „Rechtsklick auf eine
        // Zeile") — hier statt einer zweiten, driftenden Argument-Liste nur die fertige
        // Funktion wiederverwenden. extra trägt z.B. defOptions (Select/Segment) fürs
        // Vorbefüllen der Kurzschrift.
        const open = () => {
            elemSettings.open({ id, type, el, defLabel, applyStyle, ...extra });
            sizeHint.showInline(elemSettings.panel, sizeSourceLabel(el));
        };
        ctrlOpenFns.set(id, open);
        el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); open(); });
    }

    /** ctrlStyles aus dem State auf die LEBENDEN Controls anwenden (merge pro ID — ein
     *  extern geschriebener Stil ersetzt nicht still andere Felder desselben Controls).
     *  Bisher lief das nur beim Init (registerCtrlStyle) und im Combo-Recall (_applyCombo);
     *  der Sq-Snapshot-Recall (multiSq.restoreViews) schrieb nur in den State, ohne neu zu
     *  malen (@dpa 20260725: „Höhen-Darstellung erst beim Anfassen von max aktualisiert").
     *  `ids` optional einschränken (Default: alle registrierten). */
    function reapplyCtrlStyles(ids) {
        const cs = state.get('ctrlStyles') || {};
        for (const [id, target] of styleTargets) {
            if (ids && !ids.includes(id)) continue;
            const s = cs[id];
            if (s) target.applyStyle({ ...s });
        }
    }
    /** knobMeta aus dem State auf die lebenden Knobs anwenden (gleiches Muster). */
    function reapplyKnobMeta(keys) {
        const km = state.get('knobMeta') || {};
        for (const [key, knob] of knobsById) {
            if (keys && !keys.includes(key)) continue;
            const m = km[key];
            if (m) knob.setMeta(m);
        }
    }

    // ── Panel?-Umschalter (@dpa dd.md 20260801) ─────────────────────────────────────
    // Eigene Ebene, NICHT zu verwechseln mit der Knob-Gestalt „Ohne" (viewSize:'none' –
    // Knob ohne Dial, aber weiterhin AUF dem Panel). Hier geht es ums OB überhaupt: ein
    // Control bleibt komplett gebaut und im Gruppen-DOM stehen (data-ctrl bleibt auffindbar
    // für _comboPayloadOf()/removeGroup(), die über querySelectorAll('[data-ctrl]') gehen –
    // ein Verschieben/Entfernen aus dem DOM würde ein off-panel Control still aus jedem
    // Combo/Snapshot herausfallen lassen, ein echter Datenverlust-Fallstrick), es wird nur
    // per CSS-Klasse `ctrl-offpanel` ausgeblendet und stattdessen als kompakte Zeile in den
    // Gruppen-Settings gezeigt (renderOffPanelList, bei openGroupSettings).
    function ctrlElById(id) {
        const t = styleTargets.get(id);
        if (t) return t.el;
        if (id.startsWith('k:')) { const k = knobsById.get(id.slice(2)); return k ? k.element : null; }
        return null;
    }
    function isOffPanel(id) { return !!(state.get('ctrlOffPanel') || {})[id]; }
    function setOffPanel(id, off) {
        const all = { ...(state.get('ctrlOffPanel') || {}) };
        // Nur „aus dem Panel" wird eingetragen (@dpa-Vertrag) – „an" löscht den Eintrag,
        // statt ihn auf false stehen zu lassen (sonst wächst die Map nur, nie zurück).
        if (off) all[id] = true; else delete all[id];
        state.set('ctrlOffPanel', all);   // triggert applyOffPanel() über die subscribe-Kette unten
        // Solange ein Gruppen-Settings-Fenster offen ist, muss dessen Off-Panel-Liste sofort
        // mitgehen (Control kam gerade dazu/ging gerade raus) – s. openGroupSettings.
        if (_offPanelListName) renderOffPanelList(_offPanelListName, _offPanelListEl);
    }
    /** ctrlOffPanel aus dem State auf alle lebenden Controls anwenden – Init, Recall/Import
     *  ('*') und Laufzeit-Gruppen (addGroup), s. Aufrufer unten. */
    function applyOffPanel() {
        const flags = state.get('ctrlOffPanel') || {};
        const ids = new Set([...styleTargets.keys(), ...[...knobsById.keys()].map((k) => 'k:' + k)]);
        for (const id of ids) {
            const el = ctrlElById(id);
            if (!el) continue;
            const off = !!flags[id];
            el.classList.toggle('ctrl-offpanel', off);
            // BUGFIX (gefunden beim Test-Aufräumen, todos.md 20260802_131434): freezeGroup()
            // (Free-Canvas, s. dort) schaltet ein zum Einfrierzeitpunkt off-panel geschaltetes
            // Control kurz auf style.display='' (um seine natürliche Position auszumessen)
            // und danach wieder AUSDRÜCKLICH per style.display='none' zurück — ein Inline-
            // Override, das die .ctrl-offpanel-Klasse (display:none!important) gar nicht
            // gebraucht hätte. Schaltet man Off-Panel SPÄTER (Gruppen-Settings) wieder aus,
            // entfernte classList.toggle oben bisher nur die CSS-Klasse — das liegen gebliebene
            // Inline-style hielt den Control trotzdem unsichtbar, weil ohne Klasse gar keine
            // Regel mehr griff, die es hätte überschreiben können. Beim Einschalten (off=true)
            // bleibt hier bewusst nichts zu tun: die Klasse allein reicht dafür (!important).
            if (!off && el.style.display === 'none') el.style.display = '';
        }
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
        const span = document.createElement('span'); i18nText(span, cfg.label);
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
            if (s.label) { stopText(span); span.textContent = s.label; } else { i18nText(span, cfg.label); }
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
        const span = document.createElement('span'); i18nText(span, cfg.label);
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
            if (s.label) { stopText(span); span.textContent = s.label; } else { i18nText(span, cfg.label); }
            // 'off' fehlte hier (@dpa 20260724_122929 aufgefallen: Label blieb nach Wechsel WEG
            // von 'off' unsichtbar) — anders als bei select/segment/button, die 'off' schon
            // immer mit entfernt haben.
            wrap.classList.remove('tgl-label-top', 'tgl-label-bottom', 'tgl-label-left', 'tgl-label-right', 'tgl-label-off');
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
        const span = document.createElement('span'); i18nText(span, cfg.label);
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
            if (s.label) { stopText(span); span.textContent = s.label; } else { i18nText(span, cfg.label); }
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
        // Off-Panel-Liste (@dpa dd.md 20260801) schaltet über denselben cycle() weiter statt
        // die Zyklus-Logik (inkl. cfg.onClick) ein zweites Mal nachzubauen.
        wechselCycle.set(key, cycle);
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
        // Select-all beim Fokussieren (Klick UND Tab) — jetzt global, s. lib/selectOnFocus.js
        // (ddw.md 20260727_135331: bisher hier extra auf Tab beschränkt, @dpa will beides).
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
        i18nText(wrap, cfg.label);
        wrap.dataset.ctrl = 'n:' + key;
        registerCtrlStyle('n:' + key, 'note', wrap, (s) => {
            if (s.label) { stopText(wrap); wrap.textContent = s.label; } else { i18nText(wrap, cfg.label); }
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
        // Die 1 pulsiert zusätzlich (@dpa ddw.md 20260724_192304: „auf der 1 pulsieren, also
        // d-Env trigger" — dasselbe Attack-dann-Fade-Gefühl wie makeButton()s flashTrigger/
        // .btn-fade): snapt hart an, fadet dann über CSS-Transition zurück. Reflow-Trick wie
        // dort, damit ein Trigger auf der 1 sicher sichtbar zündet, auch wenn der vorige
        // Beat-Puls noch faedet (schnelles Tempo).
        let pulseTimer = 0;
        const pulseMain = () => {
            const dot = wrap.children[0]; if (!dot) return;
            if (pulseTimer) { clearTimeout(pulseTimer); pulseTimer = 0; }
            dot.classList.remove('beat-pulse-fade'); dot.classList.add('beat-pulse');
            void dot.offsetWidth;   // Reflow: „an" wird sicher gerendert
            pulseTimer = setTimeout(() => { dot.classList.add('beat-pulse-fade'); dot.classList.remove('beat-pulse'); pulseTimer = 0; }, 16);
        };
        beatSetters.set('u:' + key, (i) => {
            [...wrap.children].forEach((d, idx) => d.classList.toggle('beat-hit', idx === i));
            if (i === 0) pulseMain();
        });
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
            custTextOn = '', custTextOff = '', textBlink = '', outerLabel = '', labelOff = false;
        const defMode = cfg.mode || 'toggle';
        let mode = defMode;   // 'toggle' | 'trigger' | 'gate' | 'nix' (aus ctrlStyles.btnMode, sonst defMode)
        // Dritter Zustand über den Blink-Wartezustand (@dpa 20260722_152438, ddw.md „R":
        // „unterschiedliche Farben … für jede Selektion eine andere BG-Farbe und eigenen
        // Caption-Text") — genutzt von Controls mit mehr als zwei Zuständen (z.B. ChordMemory-
        // Zyklus 'off'/'rename'/'reset', gemappt auf isOn+isBlinking, s. werkbank.js). Ohne
        // eigens gesetzten textBlink/bgBlink verhält sich ein Button GENAU wie vorher (Fallback
        // auf textOn/bgOn) — rückwärtskompatibel für alle Buttons mit nur zwei Zuständen.
        const paint = () => {
            btn.textContent = '';
            // textOn/textOff: eigener Text (custTextOn/Off) schlägt das übersetzte Shipped-Label
            // (@dpa ddw.md 20260724, main Config „Deutsch/Englisch") — bei jedem paint() frisch
            // aufgelöst, damit ein Sprachwechsel auch ohne Zutun sofort greift (s. onLangChange
            // unten). Eigene Texte werden NIE übersetzt (i18n.js-Regel).
            const textOn = custTextOn || i18nT(cfg.label), textOff = custTextOff || i18nT(cfg.label);
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
        onLangChange(paint);
        // Klick/Taste/MIDI: löst aus UND schaltet den Aktiv-Zustand um (@dpa 20260719_040136:
        // „müssen auch aktiv anzeigen … Text an/aus muss mit Button an/aus umschalten"). Extern
        // getriebene Knöpfe (Start via engine.onRunning→setCtrlOn) richten isOn danach gerade.
        // Modusabhängiges Verhalten (@dpa 20260719):
        //  • toggle:  an/aus je Klick (Zustand bleibt)
        //  • trigger: Impuls – snappt ON, fadet dann nach OFF (D-Env-Gefühl, .btn-fade)
        //  • gate:    ON solange gedrückt (echtes Halten mit der Maus, s. mousedown)
        //  • nix:     feuert die Aktion beim Drücken/Aktivieren wie trigger, aber OHNE
        //             visuelles ON (BG bleibt dauerhaft aus, kein flashTrigger, @dpa 20260724)
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
            else if (mode === 'nix') { fire(); }   // feuert, bleibt aber ohne ON-Anzeige
            else { fire(); flashTrigger(); }
        };
        // `toggle` per Maus (@dpa 20260722_013727): asymmetrisch wie ein echter Umschalter —
        // AUS→AN reagiert SOFORT beim Runterdrücken, AN→AUS erst beim Loslassen (auch außerhalb
        // des Buttons, wie beim Gate). Taste/MIDI bleiben unverändert ein einziger voller Flip
        // (kein Down/Up-Gefühl über die Fernbedienung, s. `activate`/`keyMidi.register`).
        // `trigger`/`nix` per Maus feuern auf MOUSEDOWN, nicht erst beim Click/Loslassen (@dpa
        // 20260724: "Modus=Trigger soll beim CLICKEN (Mouse DOWN) triggern"). Kein separater
        // click-Listener mehr nötig — sonst würde der Klick nach dem mousedown-activate() ein
        // zweites Mal feuern.
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
            } else if (mode === 'trigger' || mode === 'nix') {
                e.preventDefault();
                activate();
            }
        });
        keyMidi.register('b:' + key, wrap, cfg.label, activate);
        ctrlOnSetters.set('b:' + key, (on) => { btn.classList.remove('btn-fade'); isOn = (mode === 'nix') ? false : !!on; paint(); });
        // Blink-Wartezustand (Rec-Instrument-TODO 5, @dpa 20260721): „armed", bis ein extern
        // getriebenes Ereignis (nächster Takt-Downbeat) den Knopf tatsächlich schaltet. Malt
        // jetzt auch Caption/BG neu (s.o.), falls textBlink/bgBlink gesetzt sind.
        ctrlBlinkSetters.set('b:' + key, (on) => { btn.classList.toggle('ctrl-blink', !!on); isBlinking = !!on; paint(); });
        registerCtrlStyle('b:' + key, 'button', wrap, (s) => {
            outerLabel = s.label || '';
            custTextOn = s.textOn || ''; custTextOff = s.textOff || ''; textBlink = s.textBlink || '';
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
        let oCustTextOn = '', oCustTextOff = '', oBg = '', oBgOn = '';
        const paintOpener = () => {
            const open = !!pop;
            const oTextOn = oCustTextOn || i18nT(cfg.label), oTextOff = oCustTextOff || i18nT(cfg.label);
            btn.textContent = (open && oTextOn) ? oTextOn : oTextOff;
            btn.style.background = (open && oBgOn) ? oBgOn : (oBg || '');
            btn.classList.toggle('ctrl-on', open);
        };
        onLangChange(paintOpener);
        // Inhalt EINMAL bauen (nicht bei jedem Öffnen neu registrieren), dann nur ein-/aushängen.
        const content = document.createElement('div'); content.className = 'special-body';
        // Live-Audio-Zeile (echte Latenz/Samplerate): cfg.audioInfo() liefert die Rohwerte,
        // hier formatiert (@dpa 20260720 „genau"). Wird beim Öffnen refresht + während offen getickt.
        let audioEl = null, audioTimer = 0;
        const refreshAudio = () => {
            if (!audioEl) return;
            const a = cfg.audioInfo && cfg.audioInfo();
            if (!a) { audioEl.textContent = i18nT('Audio: — (bereit nach dem ersten Klick)'); return; }
            const srk = a.sampleRate ? (a.sampleRate / 1000) : 0;
            const sr = srk ? (Number.isInteger(srk) ? srk : srk.toFixed(1)) + ' kHz' : '—';
            const base = a.baseLatency != null ? a.baseLatency * 1000 : null;
            const out = a.outputLatency ? a.outputLatency * 1000 : null;
            const tot = (base || 0) + (out || 0);
            const parts = [];
            if (base != null) parts.push(i18nT('Basis') + ' ' + base.toFixed(1) + ' ms');
            if (out) parts.push(i18nT('Ausgabe') + ' ' + out.toFixed(1) + ' ms');
            audioEl.textContent = i18nT('Samplerate') + ' ' + sr + ' · ' + i18nT('Latenz') + ' ' + tot.toFixed(1) + ' ms'
                + (parts.length ? ' (' + parts.join(' + ') + ')' : '');
        };
        if (cfg.layout === 'table') {
            // Tabelle: Beschreibung + Zeilen [Label | Einstellung | Hilfstext] (@dpa 20260720).
            // i18n (@dpa ddw.md 20260724_153349, „die Hilfstexte auch! vorallem!"): dieser Pfad
            // lief bisher komplett AM i18n-System vorbei (reines textContent, nie t()/hint()
            // aufgerufen) — die Hilfstext-Spalte blieb deutsch, egal was in main Config/Sprache
            // steht. Label über i18nText() (derselbe DE-Text-ist-Schlüssel-Weg wie Knob-Labels,
            // wechselt live mit). Hilfstext über factoryHint(id) (hints.js), Fallback auf den
            // rohen info-Text, falls es dafür noch keinen ID-Eintrag gibt — dann live über
            // repaintHints() bei Sprachwechsel neu gezeichnet (factoryHint() hängt NICHT am
            // i18nText-Mechanismus, der repaintet nur seine eigene Merkliste).
            content.classList.add('special-table');
            const hintCells = [];   // {el, id, fallback} für den Sprachwechsel-Repaint unten
            if (cfg.desc) { const d = document.createElement('div'); d.className = 'special-desc'; i18nText(d, cfg.desc); content.appendChild(d); }
            const table = document.createElement('div'); table.className = 'special-rows';
            const addRow = (labelTxt, infoId, infoFallback, mountFn) => {
                const row = document.createElement('div'); row.className = 'special-row';
                const l = document.createElement('div'); l.className = 'special-cell-label'; i18nText(l, labelTxt || '');
                const c = document.createElement('div'); c.className = 'special-cell-ctrl';
                const h = document.createElement('div'); h.className = 'special-cell-hint';
                hintCells.push({ el: h, id: infoId, fallback: infoFallback || '' });
                mountFn(c);
                row.appendChild(l); row.appendChild(c); row.appendChild(h); table.appendChild(row);
            };
            (cfg.segments || []).forEach((k) => addRow(SEGMENTS[k].label, 'g:' + k, SEGMENTS[k].info, (cell) => cell.appendChild(makeSegment(k))));
            (cfg.knobs || []).forEach((k) => addRow(KNOBS[k].label, 'k:' + k, KNOBS[k].info, (cell) => makeKnob(k).mount(cell)));
            const repaintHints = () => { for (const { el, id, fallback } of hintCells) el.textContent = factoryHint(id, i18nLang()) || i18nT(fallback); };
            repaintHints();
            onLangChange(repaintHints);
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
            const titleSpan = document.createElement('span'); i18nText(titleSpan, cfg.label); head.appendChild(titleSpan);
            const x = document.createElement('button'); x.className = 'kme-x'; x.textContent = '✕'; x.addEventListener('click', close); head.appendChild(x);
            pop.appendChild(head); pop.appendChild(content);
            document.body.appendChild(pop); paintOpener();
            // Position merken (ddw.md 20260726, wie groupSettingsPos oben) — je Sonderfenster
            // (cfg.key) ein eigener Key, sonst würden z.B. Tab/Tempo- und Latenz-Fenster
            // verschiedener Instrumente sich gegenseitig die Position überschreiben.
            const savedPos = state.get('specialPopPos_' + cfg.key);
            if (savedPos) {
                pop.style.left = savedPos.x + 'px';
                pop.style.top = savedPos.y + 'px';
            } else {
                const r = btn.getBoundingClientRect();
                pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + 'px';
                pop.style.top = Math.min(r.bottom + 4, window.innerHeight - pop.offsetHeight - 8) + 'px';
            }
            makeDraggable(pop, head, (pos) => state.set('specialPopPos_' + cfg.key, pos));   // am Kopf verschiebbar (@dpa 20260720)
            // Audio-Info live halten, solange offen (Latenz/SR erscheinen, sobald der Context da ist).
            if (audioEl) { refreshAudio(); audioTimer = setInterval(refreshAudio, 1000); }
            setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
        });
        // Settings wie ein Button, aber ohne Label/L.Pos (@dpa 20260719_040136). Text an/aus
        // ändert die Opener-Beschriftung sichtbar (offen/zu).
        registerCtrlStyle('u:' + cfg.key, 'opener', wrap, (s) => {
            oCustTextOn = s.textOn || ''; oCustTextOff = s.textOff || '';
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
    // BUGFIX (@dpa: „Controls überlappen initial, erst e-Mode raus/rein repariert es"):
    // Nachzügler-Controls kommen per mountInGroup() strukturell IN eine Gruppe, oft ERST
    // NACHDEM diese schon eingefroren ist (Debug-Panel: buildGroup() macht nur die BUTTONS
    // aus defs.BUTTONS, `mountDebugGroup()` hängt die Name-/Prompt-Textfelder erst DANACH
    // an; Scope/Env/Sq/Rec/Meter-Klone bauen ihre Gruppe über addGroup() und hängen PickMenu
    // + eigentliches Widget ebenfalls erst NACH addGroup()'s eigenem applyCtrlPos() an, s.
    // multiScope.js/multiEnv.js/multiSq.js/multiRec.js/multiLevelMeter.js/adsrPanel.js).
    // Ist die Gruppe zu diesem Zeitpunkt schon `free-canvas` (Vorbedingung: IRGENDEIN Control
    // der Gruppe hatte schon einen gespeicherten ctrlPos-Eintrag, z.B. aus einer älteren
    // Config von VOR diesem neuen Control, oder aus einem Snapshot/Import) galt für das neu
    // angehängte Control bisher NUR die CSS-Regel `.group-body.free-canvas > [data-ctrl] {
    // position:absolute }` OHNE eigenes left/top — der Browser fällt dann auf die „static
    // position" zurück, die bei lauter bereits absolut positionierten Geschwistern faktisch
    // (0,0) ergibt: das Control landete unsichtbar exakt auf einem anderen (genau das von
    // @dpa gemeldete Bild: Prompt-Textfeld über einem gespeicherten Eintrags-Titel). Bisher
    // reparierte sich das erst beim NÄCHSTEN e-Mode-Toggle, und selbst dann nur für Controls,
    // die zufällig schon einen gespeicherten Wert hatten (s. Kommentar bei freezeGroup()s
    // "else"-Zweig) — ein NIE positioniertes Control blieb für immer bei (0,0) hängen.
    // Fix: sofort beim Anhängen selbst positionieren (gespeicherte Position übernehmen, sonst
    // unter den Rest der Gruppe stapeln) — dieselbe Stapel-Logik wie im Erstaufbau oben.
    function placeLateUnit(name, el) {
        const id = el.dataset.ctrl; if (!id) return;
        const stored = (state.get('ctrlPos') || {})[name] || {};
        const p = stored[id];
        if (p) {
            el.style.position = 'absolute'; el.style.left = Math.max(0, p.x) + 'px'; el.style.top = Math.max(0, p.y) + 'px';
        } else {
            let below = 0;
            unitList(name).forEach((u) => {
                if (u === el || u.offsetParent === null) return;
                below = Math.max(below, (parseFloat(u.style.top) || 0) + u.offsetHeight);
            });
            el.style.position = 'absolute'; el.style.left = '0px';
            el.style.top = (Math.ceil(below / GRID) * GRID + GRID) + 'px';
        }
        sizeFreeGroup(name);
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
        const h = document.createElement('div'); h.className = 'group-title'; i18nText(h, grp.name); hint(h, 'Ziehen zum Verschieben · Rechtsklick = Einstellungen');
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

        groupEls.set(grp.name, { g, body, title: h, collapseBtn, bar });
        groupKindOf.set(grp.name, grp.groupKind || grp.name);
        groupSuffixOf.set(grp.name, grp.instanceSuffix || '');
        groupExtraKeys.set(grp.name, grp.extraSoundKeys || []);
        groupComboExcludeKeys.set(grp.name, grp.comboExcludeKeys || []);
        groupComboExcludeFields.set(grp.name, grp.comboExcludeFields || {});
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
        applyOffPanel();   // Panel?-Flags auf die neu gebauten Controls anwenden (@dpa dd.md 20260801)
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
        // Nur die Sel-ZEIGER dieser Instanz (literal) — der Combo-/Snapshot-POOL selbst hängt
        // an groupKindOf(name), nicht am Instanznamen, und bleibt für gleichartige Klone
        // (bzw. eine später neu angelegte Instanz) unangetastet stehen (@dpa 20260724).
        del('groupComboSel'); del('groupSnapSel');
        groupKindOf.delete(name); groupSuffixOf.delete(name); groupExtraKeys.delete(name);
        groupComboExcludeKeys.delete(name); groupComboExcludeFields.delete(name);
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
            // Kopfzeilen-Hintergrund (ddw.md 20260802_234615 Punkt 3: "BG Farbe für Gruppen
            // header fehlt") — die Titelleiste bekam ihr eigenes --panel2-Absetzen erst kürzlich
            // (Gruppen-Header-Commit), aber noch KEIN User-Setting dafür. `st.bg` oben färbt nur
            // den BODY; leer = CSS-Default (var(--panel2)) bleibt bestehen, exakt wie bei `bg`.
            e.bar.style.background = st.headBg || '';
            e.title.style.color = st.headColor || '';
            e.title.textContent = st.name || name;
            const col = !!st.collapsed;
            // Zusammengeklappt IGNORIERT gesetzte Breite/Höhe (@dpa ddw.md 20260805 Bugfix:
            // „das klappt die Gruppe zusammen, aber noch nicht richtig: es soll auch Gruppen
            // mit Settings 'Breite'/'Höhe' > 0 zusammenklappen"). Vorher blieb `e.g.style.width`/
            // `minHeight` trotz versteckten Bodys auf dem eingestellten Maß stehen — die Gruppe
            // schrumpfte nie auf reine Header-Größe. col muss daher VOR width/height feststehen.
            e.g.style.width = (!col && st.width) ? st.width + 'px' : '';
            e.g.style.maxWidth = (!col && st.width) ? st.width + 'px' : (freeGroups.has(name) ? 'none' : '');
            e.g.style.minHeight = (!col && st.height) ? st.height + 'px' : '';
            // Größe % (@dpa 20260720): skaliert nur den BODY, der HEADER bleibt konstant
            // (@dpa: „der Gruppen Header soll sich nicht in der Größe verändern"). `zoom` reflowt
            // die Nachbarn mit; der reservierte Platz wächst über sizePanel (bounding rects) mit.
            e.g.style.zoom = '';   // evtl. Alt-Stand entfernen (Zoom liegt jetzt am Body)
            e.body.style.zoom = (st.scale && st.scale !== 100) ? (st.scale / 100) : '';
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
        const exclude = groupComboExcludeKeys.get(name) || [];
        const excludeFields = groupComboExcludeFields.get(name) || {};
        const e = groupEls.get(name);
        const ctrlStylesAll = state.get('ctrlStyles') || {};
        const knobMetaAll = state.get('knobMeta') || {};
        const ctrlStyles = {}, knobMeta = {};
        if (e) {
            e.g.querySelectorAll('[data-ctrl]').forEach((el) => {
                const id = el.dataset.ctrl;
                const bareKey = stripSuffix(id.slice(id.indexOf(':') + 1), suffix);
                if (exclude.includes(bareKey)) return;   // z.B. 'seqLen' (StepSeq „Steps") — nur Snapshot, kein Combo
                if (ctrlStylesAll[id] !== undefined) {
                    // Fein-Ausschluss (@dpa ddw.md 20260724_192304): einzelne FELDER eines
                    // Controls (z.B. u:seqGrids seqMin/seqMax/seqStep — die Data-Sektion)
                    // bleiben draußen, der Rest (Farben/Breite/Höhe) geht normal ins Combo.
                    const fields = excludeFields[bareKey];
                    if (fields && fields.length) {
                        const filtered = { ...ctrlStylesAll[id] };
                        for (const f of fields) delete filtered[f];
                        if (Object.keys(filtered).length) ctrlStyles[stripSuffix(id, suffix)] = filtered;
                    } else {
                        ctrlStyles[stripSuffix(id, suffix)] = ctrlStylesAll[id];
                    }
                }
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
        for (const k of ['bg', 'headColor', 'headBg', 'width', 'height', 'scale']) if (gs[k] !== undefined) groupStyle[k] = gs[k];
        return { ctrlStyles, knobMeta, ctrlPos, controlOrder, groupStyle };
    }
    /** Kanonisches Payload auf EINE konkrete Instanz anwenden — Optik direkt neu malen
     *  (styleTargets/knobsById, wie ElementSettings/KnobMetaEditor es auch tun), Positionen/
     *  Reihenfolge/Rahmen über state.set (die bestehende state.subscribe-Kette unten malt die). */
    function _applyCombo(name, payload) {
        const suffix = groupSuffixOf.get(name) || '';
        const exclude = groupComboExcludeKeys.get(name) || [];
        if (payload.ctrlStyles && Object.keys(payload.ctrlStyles).length) {
            const cur = { ...(state.get('ctrlStyles') || {}) };
            for (const [ckey, style] of Object.entries(payload.ctrlStyles)) {
                const bareKey = ckey.slice(ckey.indexOf(':') + 1);
                if (exclude.includes(bareKey)) continue;   // Alt-Combos: falls doch mal gespeichert, beim Laden ignorieren
                const litId = addSuffix(ckey, suffix);
                // MERGE statt Ersetzen (@dpa ddw.md 20260724_192304): ein fein-ausgeschlossenes
                // Feld (z.B. u:seqGrids seqMin/seqMax/seqStep) fehlt im gespeicherten Payload
                // komplett — ein Replace würde es beim Recall auf den Style-Default zurückwerfen
                // statt es einfach unangetastet zu lassen ("Inhalt und min,max,stepsize bleibt").
                const merged = { ...(cur[litId] || {}), ...style };
                cur[litId] = merged;
                const target = styleTargets.get(litId);
                if (target) target.applyStyle(merged);
            }
            state.set('ctrlStyles', cur);
        }
        if (payload.knobMeta && Object.keys(payload.knobMeta).length) {
            const cur = { ...(state.get('knobMeta') || {}) };
            for (const [ckey, meta] of Object.entries(payload.knobMeta)) {
                if (exclude.includes(ckey)) continue;
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

    // ── Snapshot (Werte) — dasselbe Pool-Prinzip wie Combo, aber Sound statt Optik. @dpa
    // 20260724: "alles dabei. Auch jeder Button, auch der Inhalt vom Speicher.. alles was
    // diesen Teil betrifft" — KEINE Filterung nach Control-Typ, nur die Trennung optisch
    // (Combo) / nicht-optisch (Snapshot). groupValueKeys() liefert die literalen Kandidaten-
    // Keys dieser Instanz (DOM + extraSoundKeys); ob ein Key wirklich einen State-Wert hat,
    // entscheidet hier der Filter `state.get(k) !== undefined`.
    function _snapValuesOf(name) {
        const suffix = groupSuffixOf.get(name) || '';
        const e = groupEls.get(name);
        const litKeys = groupValueKeys(e && e.g, groupExtraKeys.get(name) || [], suffix);
        const values = {};
        for (const litKey of litKeys) {
            const v = state.get(litKey);
            if (v !== undefined) values[stripSuffix(litKey, suffix)] = v;
        }
        return values;
    }
    function _applySnap(name, values) {
        const suffix = groupSuffixOf.get(name) || '';
        for (const [ckey, val] of Object.entries(values || {})) state.set(addSuffix(ckey, suffix), val);
    }
    function listGroupSnaps(name) { return (state.get('groupSnaps') || {})[groupKindOf.get(name)] || []; }
    function saveGroupSnap(name, entryName) {
        const kind = groupKindOf.get(name);
        const all = { ...(state.get('groupSnaps') || {}) };
        const list = (all[kind] || []).slice();
        const entry = { name: entryName, ts: Date.now(), values: _snapValuesOf(name) };
        const at = list.findIndex((it) => it.name === entryName);
        if (at >= 0) list[at] = entry; else list.push(entry);
        all[kind] = list; state.set('groupSnaps', all);
        const sel = { ...(state.get('groupSnapSel') || {}) }; sel[name] = entryName; state.set('groupSnapSel', sel);
        return list;
    }
    function updateGroupSnap(name, index) {
        const kind = groupKindOf.get(name);
        const all = { ...(state.get('groupSnaps') || {}) };
        const list = (all[kind] || []).slice();
        if (!list[index]) return false;
        list[index] = { ...list[index], ts: Date.now(), values: _snapValuesOf(name) };
        all[kind] = list; state.set('groupSnaps', all);
        return true;
    }
    function renameGroupSnap(name, index, newName) {
        const kind = groupKindOf.get(name);
        const all = { ...(state.get('groupSnaps') || {}) };
        const list = (all[kind] || []).slice();
        const oldName = list[index] && list[index].name;
        const err = renameIn(list, index, newName);
        if (!err && oldName) {
            all[kind] = list; state.set('groupSnaps', all);
            const sel = { ...(state.get('groupSnapSel') || {}) };
            let ch = false;
            for (const [litName, selName] of Object.entries(sel)) {
                if (selName === oldName && groupKindOf.get(litName) === kind) { sel[litName] = list[index].name; ch = true; }
            }
            if (ch) state.set('groupSnapSel', sel);
        }
        return err;
    }
    function deleteGroupSnap(name, index) {
        const kind = groupKindOf.get(name);
        const all = { ...(state.get('groupSnaps') || {}) };
        const list = (all[kind] || []).slice();
        const removed = list[index];
        list.splice(index, 1);
        all[kind] = list; state.set('groupSnaps', all);
        if (removed) {
            const sel = { ...(state.get('groupSnapSel') || {}) };
            let ch = false;
            for (const [litName, selName] of Object.entries(sel)) {
                if (selName === removed.name && groupKindOf.get(litName) === kind) { delete sel[litName]; ch = true; }
            }
            if (ch) state.set('groupSnapSel', sel);
        }
        return list;
    }
    function recallGroupSnap(name, index) {
        const entry = listGroupSnaps(name)[index];
        if (!entry) return false;
        _applySnap(name, entry.values);
        const sel = { ...(state.get('groupSnapSel') || {}) }; sel[name] = entry.name; state.set('groupSnapSel', sel);
        return true;
    }
    /** ALLE Wert-Keys ÜBER ALLE Gruppen dieses ISM, literal (NICHT kanonisiert) — anders als
     *  _snapValuesOf() für den Gruppen-Pool: ein ISM-Snapshot braucht die tatsächlichen,
     *  instanzgenauen Keys (Sq1s 'seqMult_0' und Sq2s 'seqMult_1' dürfen sich hier NICHT
     *  beide auf ein kanonisches 'seqMult' abbilden, sonst überschreibt eine Gruppe die
     *  andere beim Zusammenführen). Für ISM-Settings.js (Snapshot ohne Klon-Pool-Konzept). */
    function allSoundValues() {
        const out = {};
        for (const name of groupEls.keys()) {
            const e = groupEls.get(name);
            const litKeys = groupValueKeys(e.g, groupExtraKeys.get(name) || [], groupSuffixOf.get(name) || '');
            for (const litKey of litKeys) {
                const v = state.get(litKey);
                if (v !== undefined) out[litKey] = v;
            }
        }
        return out;
    }

    // ── Gruppen-Settings (Rechtsklick): Name · Combo · Snapshot · BG · Head · Breite · Höhe ──
    let _settingsPop = null, _settingsKey = null, _settingsCombo = null, _settingsSnap = null;
    // Off-Panel-Liste (@dpa dd.md 20260801): welche Gruppe/welcher Container gerade offen
    // ist, damit setOffPanel() sie bei jedem Umschalten live nachzeichnen kann.
    let _offPanelListName = null, _offPanelListEl = null;
    function closeGroupSettings() {
        if (!_settingsPop) return;
        if (_settingsCombo) { _settingsCombo.close(); _settingsCombo = null; }
        if (_settingsSnap) { _settingsSnap.close(); _settingsSnap = null; }
        _settingsPop.remove(); _settingsPop = null;
        _offPanelListName = null; _offPanelListEl = null; offPanelRowSync.clear();
        document.removeEventListener('mousedown', _outsideClose, true);
        if (_settingsKey) { document.removeEventListener('keydown', _settingsKey, true); _settingsKey = null; }
    }
    function _outsideClose(e) {
        // eigener Farbwähler UND die eingehängten Combo-/Snapshot-PickMenus zählen als drinnen
        // (@dpa 20260724_114012 Bugfix: deren Dropdown hängt an <body>, NICHT im .group-settings-
        // Panel — ohne diese Ausnahme schloss ein Klick auf „+ Neu" das GANZE Panel schon auf
        // mousedown, bevor der eigentliche Save-Klick überhaupt ankam → Speichern wirkte, als
        // täte es nichts, der Pool blieb leer). Ein aus der Off-Panel-Liste geöffnetes Control-
        // Settings-Fenster (@dpa dd.md 20260801: KnobMetaEditor/ElementSettings, beide tragen
        // die Klasse .knob-meta-editor) zählt ebenfalls als drinnen — sonst reißt der erste
        // Klick hinein die Gruppen-Settings weg, bevor der Panel?-Umschalter greifen kann.
        if (e.target.closest && e.target.closest('.cp-pop, .pm-pop, .knob-meta-editor')) return;
        if (_settingsPop && !_settingsPop.contains(e.target)) closeGroupSettings();
    }
    /** Wert-Zeile einer Off-Panel-Sorte bauen (@dpa dd.md 20260801) — einheitlich und
     *  platzsparend: „Label, Value", KEINE Nachbildung der Panel-Optik. Die echten Controls
     *  bleiben unangetastet im Gruppen-DOM (nur per CSS ausgeblendet); das hier sind eigene,
     *  einfache Eingabe-Elemente auf demselben State-Key. Rechtsklick öffnet dieselben
     *  Control-Settings wie am Panel-Element (Tontechnik bleibt erreichbar, dort auch der
     *  Weg zurück aufs Panel). */
    function makeOffPanelRow(id) {
        const type = id[0], key = id.slice(id.indexOf(':') + 1);
        const row = document.createElement('div'); row.className = 'gs-op-row';
        const lab = document.createElement('span'); lab.className = 'gs-op-lab';
        const val = document.createElement('div'); val.className = 'gs-op-val';
        row.append(lab, val);
        // Ein selbst vergebenes Label gewinnt immer und geht NIE durch i18n (Projektregel);
        // sonst das Factory-Label, live übersetzbar wie überall sonst.
        const setLabel = (cfgLabel) => {
            const custom = type === 'k' ? (state.get('knobMeta') || {})[key]?.label
                : (state.get('ctrlStyles') || {})[id]?.label;
            if (custom) { stopText(lab); lab.textContent = custom; } else i18nText(lab, cfgLabel);
        };
        row.addEventListener('contextmenu', (e) => {
            e.preventDefault(); e.stopPropagation();
            if (type === 'k') {
                const knob = knobsById.get(key);
                metaEditor.open(knob);
                sizeHint.showInline(metaEditor.panel, sizeSourceLabel(knob.element));
            } else {
                const open = ctrlOpenFns.get(id);
                if (open) open();
            }
        });

        if (type === 'k') {
            const def = KNOBS[key], knob = knobsById.get(key);
            setLabel(def.label);
            // EFFEKTIVE Min/Max/Einheit (knob.getMeta()), nicht die defs — der Nutzer kann sie
            // längst über den Regler-Editor verstellt haben.
            const meta = knob.getMeta();
            const num = document.createElement('input'); num.type = 'number';
            num.min = meta.min; num.max = meta.max; num.step = meta.step || 'any';
            num.value = knob.value;
            num.addEventListener('input', () => { const v = parseFloat(num.value); if (!Number.isNaN(v)) knob.value = v; });
            val.appendChild(num);
            if (meta.unit && meta.unit.trim()) { const u = document.createElement('span'); u.className = 'gs-op-unit'; u.textContent = meta.unit.trim(); val.appendChild(u); }
            offPanelRowSync.set(key, () => { if (document.activeElement !== num) num.value = knob.value; });
        } else if (type === 't') {
            const cfg = TOGGLES[key];
            setLabel(cfg.label);
            const chk = document.createElement('input'); chk.type = 'checkbox'; chk.checked = !!state.get(key);
            chk.addEventListener('change', () => state.set(key, chk.checked));
            val.appendChild(chk);
            offPanelRowSync.set(key, () => { chk.checked = !!state.get(key); });
        } else if (type === 's' || type === 'g') {
            const cfg = type === 's' ? SELECTS[key] : SEGMENTS[key];
            // BUGFIX (@dpa dd.md 20260802, „DSR"/Multi-ADSR: Out versteckt -> Settings gehen
            // nicht mehr auf): nicht jedes 's:'-Control kommt aus den statischen SELECTS-defs.
            // Multi-ADSRs „Out"-Ziel (adsrOutput, multiEnv.js) ist ein PickMenu mit dynamischen
            // Routing-Zielen, per mountInGroup()/registerCtrlStyle() eigenständig gebaut — nie
            // in SELECTS eingetragen. `cfg` war hier undefined -> `cfg.label` warf eine
            // TypeError, die renderOffPanelList() (und damit das GANZE Settings-Popup dieser
            // Gruppe) mitten im Aufbau abbrach, ohne sichtbare Fehlermeldung ("Settings gehen
            // nicht mehr auf"). Ohne defs-Eintrag kein generisches <select> möglich -> wie bei
            // n:/u: nur Label + aktueller Rohwert, kein Crash. Rechtsklick öffnet weiterhin die
            // ECHTEN Control-Settings (ctrlOpenFns, s.o.) für volle Bedienung.
            if (!cfg) {
                setLabel(key);
                // PickMenu-Ziele (wie multiEnv.js' „Out") haben auf dem echten Panel einen
                // Namen + Caret-Symbol (.pm-btn/.pm-caret, PickMenu.js) — die reine Text-
                // Anzeige hier hatte KEIN Symbol (@dpa dd.md 20260802, image-5.png: „vom Panel
                // weggeschaltetes Output hat noch kein Symbol"). Den echten Button spiegeln
                // (Text+Caret klonen, Klick reicht durch), statt ihn nur als rohen Wert
                // abzuschreiben — bleibt trotzdem crashsicher, falls kein .pm-btn existiert.
                const real = styleTargets.get(id);
                const realBtn = real && real.el ? real.el.querySelector('.pm-btn') : null;
                if (realBtn) {
                    const mirror = document.createElement('button'); mirror.type = 'button'; mirror.className = 'pm-btn gs-op-pm-mirror';
                    const paint = () => { mirror.innerHTML = ''; [...realBtn.childNodes].forEach((n) => mirror.appendChild(n.cloneNode(true))); };
                    paint();
                    mirror.addEventListener('click', () => realBtn.click());
                    val.appendChild(mirror);
                    offPanelRowSync.set(key, paint);
                } else {
                    const val2 = document.createElement('span'); val2.className = 'gs-op-none';
                    val2.textContent = state.get(key) || '–';
                    val.appendChild(val2);
                    offPanelRowSync.set(key, () => { val2.textContent = state.get(key) || '–'; });
                }
                return row;
            }
            setLabel(cfg.label);
            const opts = normOptions(cfg.options);
            const sel = document.createElement('select');
            // Options-Werttyp bleibt der ORIGINAL-Typ (tapMode ist z.B. eine Zahl) — über den
            // Index statt über sel.value (immer String) gemappt, damit kein Typ verlorengeht.
            opts.forEach((o, i) => { const op = document.createElement('option'); op.value = String(i); op.textContent = o.l; sel.appendChild(op); });
            const findIdx = () => Math.max(0, opts.findIndex((o) => String(o.v) === String(state.get(key))));
            sel.value = String(findIdx());
            sel.addEventListener('change', () => state.set(key, opts[+sel.value].v));
            val.appendChild(sel);
            offPanelRowSync.set(key, () => { sel.value = String(findIdx()); });
        } else if (type === 'x') {
            const cfg = TEXTS[key];
            setLabel(cfg.label);
            const inp = document.createElement('input'); inp.type = 'text'; inp.value = state.get(key) ?? '';
            inp.addEventListener('input', () => state.set(key, inp.value));
            val.appendChild(inp);
            offPanelRowSync.set(key, () => { if (document.activeElement !== inp) inp.value = state.get(key) ?? ''; });
        } else if (type === 'b') {
            const cfg = BUTTONS[key];
            setLabel(cfg.label);
            const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'pb-btn';
            i18nText(btn, cfg.label);
            btn.addEventListener('click', () => { if (cfg.onClick) cfg.onClick(key); });
            val.appendChild(btn);
        } else if (type === 'w') {
            const cfg = WECHSEL[key];
            setLabel(cfg.label);
            const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'pb-btn';
            const modesOf = () => { const cs = (state.get('ctrlStyles') || {})[id]; return (cs && cs.modes && cs.modes.length) ? cs.modes : (cfg.modes || []); };
            const paintBtn = () => { const modes = modesOf(); const n = Math.max(1, modes.length); const i = ((state.get(key) | 0) % n + n) % n; btn.textContent = (modes[i] || {}).caption || ''; };
            paintBtn();
            btn.addEventListener('click', () => { const cyc = wechselCycle.get(key); if (cyc) cyc(); paintBtn(); });
            val.appendChild(btn);
            offPanelRowSync.set(key, paintBtn);
        } else if (type === 'u' && (styleTargets.get(id) || {}).type === 'opener') {
            // Sonderfenster-Opener (@dpa dd.md 20260801_2, „Kleindarstellung" für UNIKAT-
            // Settings, Bsp. „⚙ Tab"): hat sehr wohl eine Aktion, obwohl er keinen Wert im
            // State trägt - ein gleich großer symbolischer Knopf löst SIE aus (echter Klick
            // auf den weiterhin gebauten, nur unsichtbaren Panel-Knopf), Rechtsklick bleibt
            // wie bei jeder anderen Zeile der Weg zu seinen eigenen Settings.
            const specialCfg = GROUPS.flatMap((g) => g.specials || []).find((s) => s.key === key) || {};
            setLabel(specialCfg.label || key);
            const realBtn = styleTargets.get(id).el.querySelector('button');
            const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'pb-btn';
            btn.textContent = realBtn ? realBtn.textContent : (specialCfg.label || '⚙');
            btn.addEventListener('click', () => { if (realBtn) realBtn.click(); });
            val.appendChild(btn);
        } else {
            // n:/u: – tragen keinen eigenen Wert (reines Label bzw. reine Anzeige, z.B.
            // Takt-Beat-Anzeige oder ein Keyboard-Brett - dafür gibt es keine sinnvolle
            // Wert-Zeile). Bisher stand hier NUR der Strich – anders als bei jeder anderen
            // Sorte (Select/Toggle/Text/Button/…) gab es kein sichtbares Zeichen dafür, dass
            // Rechtsklick trotzdem zu den echten Settings führt (@dpa ddw.md 20260802: „Note
            // hat noch kein Icon für die Panel-weg --> Settings Anzeige"). Zahnrad-Icon als
            // Klick-Knopf schließt die Lücke – ruft dieselbe open()-Funktion wie der
            // Rechtsklick auf die Zeile (ctrlOpenFns, s.o.), nur jetzt entdeckbar/sichtbar.
            const cfg = (type === 'n' ? NOTES : DISPLAYS)[key] || {};
            setLabel(cfg.label || key);
            const gearBtn = document.createElement('button'); gearBtn.type = 'button'; gearBtn.className = 'gs-op-settings-btn';
            hint(gearBtn, 'Settings öffnen');
            gearBtn.appendChild(icon('gear'));
            gearBtn.addEventListener('click', () => { const open = ctrlOpenFns.get(id); if (open) open(); });
            val.appendChild(gearBtn);
        }
        return row;
    }
    /** Off-Panel-Liste einer Gruppe komplett neu zeichnen (@dpa dd.md 20260801) — bei jedem
     *  Öffnen der Gruppen-Settings UND bei jedem setOffPanel(), solange sie offen sind. Leer
     *  = Container bleibt leer (CSS `.gs-offpanel:empty` blendet ihn aus, kein leerer Kasten). */
    function renderOffPanelList(name, container) {
        offPanelRowSync.clear();
        container.innerHTML = '';
        const e = groupEls.get(name);
        if (!e) return;
        const ids = [...e.g.querySelectorAll('[data-ctrl]')].map((el) => el.dataset.ctrl).filter((id) => isOffPanel(id));
        if (!ids.length) return;
        const head = document.createElement('div'); head.className = 'gs-offpanel-head';
        i18nText(head, 'Nicht auf dem Panel');
        container.appendChild(head);
        for (const id of ids) container.appendChild(makeOffPanelRow(id));
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

        // Snapshot (Werte, @dpa 20260724) — gleiches Pool-Prinzip wie Combo, s. saveGroupSnap.
        const snapMenu = new PickMenu({
            label: 'Snapshot',
            empty: '— kein Snapshot —',
            title: 'Werte dieser Gruppe speichern/laden',
            list: () => listGroupSnaps(name),
            current: () => (state.get('groupSnapSel') || {})[name] || '',
            onPick: (i) => recallGroupSnap(name, i),
            onUpdate: (i) => updateGroupSnap(name, i),
            onRename: (i, item, newName) => renameGroupSnap(name, i, newName),
            onDelete: (i) => deleteGroupSnap(name, i),
            foot: [['plus', '+ Neu', 'Aktuelle Werte als neuen Snapshot speichern', () => {
                const nm = prompt('Name für den neuen Snapshot?', 'Snapshot ' + (listGroupSnaps(name).length + 1));
                if (nm && nm.trim()) saveGroupSnap(name, nm.trim());
            }]],
        });
        _settingsSnap = snapMenu;
        if (groupSuffixOf.get(name)) hint(snapMenu.element, `Gilt für alle „${groupKindOf.get(name)}"-Klone — gemeinsamer Speicher.`);
        pop.appendChild(snapMenu.element);

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
        // Kopfzeilen-Hintergrund separat von „BG" (das ist der BODY, s. e.g.style.background
        // oben) — @dpa ddw.md 20260802_234615 Punkt 3. Default-Hex = der bisherige CSS-Wert
        // var(--panel2), damit der Farbwähler beim ersten Öffnen genau das zeigt, was ohnehin
        // schon sichtbar ist (kein Sprung).
        mkColor('Kopf-BG', 'headBg', '#232833');

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
        // @dpa 20260727: "stell Dir ein 8k Display vor" — Bildschirmgröße ist KEIN Grund für
        // eine knappe Decke, großzügig statt "zur Sicherheit" eng.
        mkSize('Breite', 'width', 1000000);
        mkSize('Höhe', 'height', 1000000);
        // Größe % (@dpa 20260720, Punkt G): skaliert die ganze Gruppe (100 = neutral).
        (() => {
            const r = document.createElement('div'); r.className = 'kme-row';
            const l = document.createElement('label'); l.textContent = 'Größe %'; r.appendChild(l);
            const num = document.createElement('input'); num.type = 'number'; num.min = 1; num.max = 1000000; num.step = 5;
            num.value = st.scale || 100; hint(num, 'Gruppengröße in Prozent');
            num.addEventListener('input', () => {
                const v = Math.max(1, Math.min(1000000, parseInt(num.value, 10) || 100));
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

        // Erweiterungspunkt für gruppenspezifische Extra-Settings (z.B. ADSR: A/D/S/R aktiv,
        // Trig/Gate, Verlauf, Skew). Der Hook wird über `groupKindSettings(kind)` abgefragt
        // (lazy, damit er auch nach mountGroups definiert werden kann) und bekommt
        // (name, pop, st, row, suffix). Kein Hook → altes Verhalten.
        const _gks = opts.groupKindSettings || (() => undefined);
        const _hook = _gks(groupKindOf.get(name));
        if (_hook) _hook(name, pop, st, row, groupSuffixOf.get(name) || '');

        // Off-Panel-Liste (@dpa dd.md 20260801): Controls dieser Gruppe, die gerade NICHT
        // auf dem Panel sitzen, tauchen hier als kompakte Label+Wert-Zeilen auf – sonst
        // wären sie nirgends mehr zu bedienen. Leer = Sektion bleibt weg (CSS :empty).
        const offPanel = document.createElement('div'); offPanel.className = 'gs-offpanel';
        pop.appendChild(offPanel);
        _offPanelListName = name; _offPanelListEl = offPanel;
        renderOffPanelList(name, offPanel);

        // Kein „Fertig"-Knopf mehr – die Felder wirken live; stattdessen ein Fußhinweis.
        const foot = document.createElement('div'); foot.className = 'gs-foot';
        i18nText(foot, 'Enter = Übernehmen · ESC = Verlassen');
        pop.appendChild(foot);

        // Position merken (@dpa ddw.md 20260726: „Positionen aller verschiebbarer Fenster
        // sollen sich merken, wenn sie geschlossen werden") — verschobene Position aus
        // `groupSettingsPos` schlägt die sonst übliche Anker-Berechnung (neben dem Rechtsklick).
        // Höhe ERST nach dem Anhängen messbar (offsetHeight ist 0 vor dem Append) — darum
        // hier anhängen, BEVOR die Top-Position geclampt wird (@dpa-Bug 20260804: die
        // ADSR-Zusatzfelder aus groupKindSettings, s. lib/adsrPanel.js, machen dieses Popup
        // spürbar höher als die alten reinen Style-Settings; ohne Clamp lief es bei Gruppen
        // im unteren Seitenbereich unten aus dem Fenster – sichtbar blieb nur der obere,
        // generische Teil (Farbe/Größe), der ADSR-spezifische Rest war unerreichbar. Gleiches
        // Muster wie die Anker-Berechnung von .special-pop weiter oben in dieser Datei).
        document.body.appendChild(pop);
        const savedPos = state.get('groupSettingsPos');
        if (savedPos) {
            pop.style.left = savedPos.x + 'px';
            pop.style.top = savedPos.y + 'px';
        } else {
            const r = anchor.getBoundingClientRect();
            pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 280))}px`;
            pop.style.top = `${Math.max(8, Math.min(r.bottom + 4, window.innerHeight - pop.offsetHeight - 8))}px`;
        }
        upgradeColorInputs(pop);   // eigener kompakter Farbwähler statt des nativen (@dpa 20260719_120425)
        _settingsPop = pop;
        makeDraggable(pop, header, (pos) => state.set('groupSettingsPos', pos));   // an der Kopfzeile verschiebbar wie die anderen Settings
        setTimeout(() => document.addEventListener('mousedown', _outsideClose, true), 0);
        // Enter übernimmt (Felder wirken ohnehin live) · ESC verlässt. Offener Farbwähler
        // fängt seine eigenen Tasten ab – hier nicht schließen, während man eine Farbe wählt.
        _settingsKey = (e) => {
            if (!_settingsPop) return;
            if (e.target.closest && e.target.closest('.cp-pop, .pm-pop')) return;
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

    // ── Tastatur: Anordnen (Default 'e', lernbar) · Pfeile bewegen Auswahl · Esc räumt auf ──
    // BUGFIX (@dpa: "der Tastaturshortcut ist für e-mode festgelötet, das muss er nicht mehr,
    // weil es einen 'learnbaren' header button dafür gibt"): der Header-Knopf "⇄ Anordnen"
    // ist längst über KeyMidi lernbar (`keyMidi.register('hdr:arrangemode', …)`, s. werkbank.js)
    // — aber DIESER Listener hier (GENERISCH, ein Exemplar PRO mountGroups()-Aufruf/ISM) kannte
    // die gelernte Taste nie: er sitzt im audio-/header-agnostischen GroupHost, kennt weder den
    // GLOBALEN Header-State noch die ID 'hdr:arrangemode' (jedes ISM bringt sein EIGENES `state`
    // mit). Statt das hier fest zu verdrahten, reicht der Aufrufer optional `opts.arrangeKeyOf()`
    // rein (liefert die aktuell gelernte Taste oder '' für "nichts gelernt, noch nie geändert").
    // Ohne diese Option (z.B. lib/group/_selftest.html) bleibt exakt das alte Verhalten (fest
    // 'e'/'E', case-insensitive) — reines Additiv, kein Verhaltensbruch für Bestandsnutzer.
    const isArrangeKeyPress = (e) => {
        const learned = opts.arrangeKeyOf ? opts.arrangeKeyOf() : '';
        return learned ? e.key === learned : (e.key === 'e' || e.key === 'E');
    };
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
        if (globalOk && isArrangeKeyPress(e) && !e.metaKey && !e.ctrlKey && !e.altKey) {
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
    // Off-Panel-Flags MÜSSEN vor applyAll() greifen (@dpa dd.md 20260802, B.1-Fix): freeGroups
    // messen ihre Body-Größe per offsetWidth/-Height (sizeFreeGroup, s.o.) – liefe applyOffPanel()
    // erst danach, wären zu diesem Zeitpunkt noch Panel?-aus-Controls sichtbar und blähten die
    // gemessene (und dann fest verdrahtete) Gruppen-Höhe/-Breite auf. Genau das korrigierte sich
    // bisher erst beim nächsten e-Mode-Toggle (setArranging() misst über freezeGroup() neu, dann
    // sind die Controls längst display:none) – jetzt stimmt es schon beim ersten Mount.
    applyOffPanel();   // gespeicherte Panel?-Flags beim Start anwenden (@dpa dd.md 20260801)
    applyAll(state.toJSON ? state.toJSON() : {});
    state.subscribe((key, data) => {
        if (key === 'groupStyles') applyGroupStyles(data);
        else if (key === 'groupPos' || key === 'groupOrder') applyGroupPositions();
        else if (key === 'controlOrder') applyControlOrder(data);
        else if (key === 'ctrlPos') applyCtrlPos(data);
        else if (key === 'ctrlOffPanel') applyOffPanel();
        // Recall der Werte (Selects/Toggles/Texte) — Knobs binden sich selbst über onChange.
        if (ctrlBindings.size) for (const [k, fn] of ctrlBindings) if (key === k || key === '*') fn(data);
        // Off-Panel-Zeilen (@dpa dd.md 20260801): dieselbe Dispatch-Logik wie ctrlBindings,
        // nur für die parallele Mini-UI in den Gruppen-Settings (nur gefüllt, solange offen).
        if (offPanelRowSync.size) for (const [k, fn] of offPanelRowSync) if (key === k || key === '*') fn(data);
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
            if (!body) return;
            body.appendChild(makeMovable(el, ctrlId));
            // Nachzügler in eine schon eingefrorene Gruppe: sofort selbst positionieren
            // (s. placeLateUnit()-Kopf) statt auf implizites CSS-position:absolute ohne
            // left/top zu vertrauen — das ließ das Control bislang bei (0,0) hängen.
            if (freeGroups.has(groupName)) placeLateUnit(groupName, el);
        },
        /** Rechtsklick-Settings für ein extern gebautes Control registrieren (s. mountInGroup). */
        registerCtrlStyle,
        /** ctrlStyles/knobMeta aus dem State auf lebende Controls neu anwenden (Snapshot-
         *  Recall, der die Optik-Maps extern beschrieben hat — s. reapplyCtrlStyles). */
        reapplyCtrlStyles, reapplyKnobMeta,
        /** Eine Gruppe zur Laufzeit bauen bzw. entfernen (Multi-Sq). Aufrufer erweitert vorher
         *  die defs/State-Keys (addGroup) bzw. räumt seine indizierten Wert-Keys selbst auf
         *  (removeGroup räumt nur das gruppen-namensbasierte Optik-State + Control-Maps). */
        addGroup, removeGroup,
        /** Vorhandene Gruppennamen (für den Sq-Manager: Migration/Recall der Sq-Liste). */
        groupNames: () => [...groupEls.keys()],
        /** Combo (Optik) — Pool pro Gruppen-Art, s. Kopfkommentar bei _comboPayloadOf. */
        listGroupCombos, saveGroupCombo, updateGroupCombo, renameGroupCombo, deleteGroupCombo, recallGroupCombo,
        /** Snapshot (Werte) — dasselbe Pool-Prinzip, s. Kopfkommentar bei _snapValuesOf. */
        listGroupSnaps, saveGroupSnap, updateGroupSnap, renameGroupSnap, deleteGroupSnap, recallGroupSnap,
        /** Alle Wert-Keys über alle Gruppen dieses ISM (literal) — für den ISM-Snapshot. */
        allSoundValues,
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

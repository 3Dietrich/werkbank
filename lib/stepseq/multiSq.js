/**
 * multiSq.js — Multi-Sequenzer-Verwaltung fürs Stepsequenzer-ISM (@dpa 20260723_140151:
 * „mach eine Funktion in Sequenzer ISM … [+] fügt einen Sq hinzu, [-] entfernt … *kein Sq*
 * darf nicht vorkommen"). Datenmodell laut @dpa-Entscheidung: „Sq = eigene Gruppe" — jeder
 * Sequenzer ist eine eigenständige GroupHost-Gruppe im selben ISM, mit indizierten State-
 * Keys (seqMult_0, seqMult_1, …), eigener Engine + eigenem Grid + eigenem Routing.
 *
 * Warum ein eigener Manager statt allem in werkbank.js: die Sq-Verwaltung (Bauen/Entfernen/
 * Fan-out an alle Engines/Grids + Migration des Alt-Stands) ist ein zusammenhängender
 * Zustand, der sonst quer über werkbank.js verstreut läge. GroupHost bleibt audio-agnostisch
 * (addGroup/removeGroup bauen nur DOM + Optik), engine.js und StepSeqGrid.js bleiben
 * UNVERÄNDERT — sie bekommen über `scoped()` einen State-View, der ihre flachen Keys
 * (seqLen/seqSteps/…) transparent auf die indizierten (seqLen_i/…) umschreibt.
 *
 * Nahtstellen nach werkbank.js: init() (Migration + Sqs bauen), addSq()/removeSq() (die
 * beiden ISM-Buttons), sowie der Fan-out tick()/handleClockBeat()/transport()/armBeatSync()/
 * resyncPhase() — ersetzen die früheren Einzelaufrufe an die eine stepSeqEngine.
 *
 * Output-Ziel pro Sq (Punkt 1, ddw.md, @dpas Entscheidung): kein festes Enum mehr, sondern
 * eine PickMenu (dieselbe Bauart wie die Design-Presets-Menüs in ElementSettings.js) — nur
 * auswählbar, nicht umbenennbar/löschbar. Die Liste kommt aus `routing.inputTargets('AmpEnv')`
 * (jedes Modul deklariert seine Ziel-Ports SELBST an seinen eigenen `ports.inputs`, s.
 * lib/routing/Registry.js) und wird NUR bei Klick auf den ↪️-Eintrag in der Menü-Fußzeile neu
 * gezogen (@dpa: „kein Live-Update, ein Reload-Button — der gehört nicht in die Gruppenansicht").
 * Persistiert wird ein `'modul.port'`-String je Sq (`seqOutput_i`); fehlt das Zielmodul beim
 * Neuladen (noch) in der Registry, bleibt der Wert unangetastet stehen (kein Datenverlust) —
 * der Trigger-Callback liefert dann einfach nichts zu (No-op), bis der Reload es findet.
 */
import { makeSeqSteps } from './seqCore.js';
import { PickMenu } from '../PickMenu.js';

const SRC_TYPE = 'AmpEnv';   // Typ des Sq-eigenen Output-Ports 'amp' (s. stepseq/defs.js ports.outputs)
const OLD_OUTPUT_ENUM = 'AmpEnv+OSZ';   // Alt-Wert vor Punkt 1 → migriert auf 'polysynth.trig'
const NEW_DEFAULT_TARGET = 'polysynth.trig';

/** State-View, der die flachen Keys eines Bausteins (engine.js/StepSeqGrid.js lesen/schreiben
 *  seqLen/seqSteps/seqMult/seqDiv/seqEnabled/seqOutput) transparent auf die indizierten Keys
 *  (…_i) des gemeinsamen ISM-State umlenkt. Nur get/set — mehr brauchen weder Engine noch Grid. */
function scoped(state, sfx) {
    return { get: (k) => state.get(k + sfx), set: (k, v) => state.set(k + sfx, v) };
}

// Die sechs Wert-Keys eines Sq (Reihenfolge egal). seqSteps ist ein ARRAY → pro Sq eine
// frische Kopie (makeSeqSteps), nie das geteilte Template-Array, sonst hingen alle Sqs am
// selben Muster.
const VALUE_KEYS = ['seqEnabled', 'seqOutput', 'seqMult', 'seqDiv', 'seqLen', 'seqSteps'];

/** Optik-IDs eines Sq (data-ctrl-Präfixe wie in GroupHost): Select 's:', Toggle 't:',
 *  Knob 'k:', Grid 'u:'. Für Migration (Umbenennen) + removeSq (Aufräumen). */
function ctrlIds(sfx) {
    // seqLen ist seit @dpa 20260724_122929 ein normaler Knob (k:seqLen) statt eines eigenen
    // Unikat-Controls (u:seqSteps) — landet darum in knobMetaKeys() statt hier separat.
    return ['s:seqOutput' + sfx, 't:seqEnabled' + sfx, 'k:seqMult' + sfx, 'k:seqDiv' + sfx, 'k:seqLen' + sfx,
        'u:seqGrid' + sfx, 'u:seqFill' + sfx, 'u:seqSet0' + sfx];
}
/** Fill/set0 als ECHTE Modus-Buttons (@dpa 20260724_122929: "Typ 'button'", dann 20260724:
 * "Fill und set0 Sind noch nicht angeschlossen" — sie trugen bislang nur einen festen
 * click-Listener, das Modus-Dropdown (Trigger/Gate/Umschalter/nix, s. GroupHost.makeButton())
 * griff nicht). Verkabelt HIER (statt in GroupHost.js), weil host.isArranging() hier bereits
 * in Scope ist und fillNow()/resetNow() an dieser Stelle bekannt sind — dieselbe Logik wie
 * GroupHost.makeButton()s activate()/paint(), nur lokal für die zwei Sq-Sonderbuttons.
 * @param {object} o
 * @param {HTMLButtonElement} o.btn
 * @param {HTMLElement} o.wrap
 * @param {HTMLElement} o.labelEl
 * @param {string} o.defText
 * @param {() => void} o.fire  die eigentliche Aktion (fillNow/resetNow)
 * @param {() => boolean} o.isArranging  host.isArranging — sperrt Klicks im e-Mode
 * @returns {(s: object) => void} applyStyle-Callback für registerCtrlStyle
 */
function wireModeButton({ btn, wrap, labelEl, defText, fire, isArranging }) {
    let isOn = false, mode = 'trigger', textOn = defText, textOff = defText, curBg = '', curBgOn = '', fadeTimer = 0;
    const paint = () => {
        btn.textContent = (isOn && textOn) ? textOn : textOff;
        btn.style.background = (isOn && curBgOn) ? curBgOn : (curBg || '');
        btn.classList.toggle('ctrl-on', isOn);
    };
    const flashTrigger = () => {
        if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = 0; }
        btn.classList.remove('btn-fade'); isOn = true; paint();
        void btn.offsetWidth;
        fadeTimer = setTimeout(() => { btn.classList.add('btn-fade'); isOn = false; paint(); fadeTimer = 0; }, 16);
    };
    const activate = () => {
        if (mode === 'toggle') { isOn = !isOn; fire(); paint(); }
        else if (mode === 'gate') { btn.classList.remove('btn-fade'); isOn = true; paint(); fire(); setTimeout(() => { isOn = false; paint(); }, 120); }
        else if (mode === 'nix') { fire(); }
        else { fire(); flashTrigger(); }
    };
    // Trigger/nix feuern auf MOUSEDOWN (@dpa 20260724, s. GroupHost.js makeButton()); toggle/
    // gate laufen wie dort asymmetrisch über mousedown/mouseup.
    btn.addEventListener('mousedown', (e) => {
        if (isArranging() || e.button !== 0) return;
        if (mode === 'gate') {
            e.preventDefault();
            btn.classList.remove('btn-fade'); isOn = true; paint(); fire();
            const up = () => { isOn = false; paint(); window.removeEventListener('mouseup', up); };
            window.addEventListener('mouseup', up);
        } else if (mode === 'toggle') {
            e.preventDefault();
            if (!isOn) { activate(); return; }
            const up = () => { activate(); window.removeEventListener('mouseup', up); };
            window.addEventListener('mouseup', up);
        } else if (mode === 'trigger' || mode === 'nix') {
            e.preventDefault();
            activate();
        }
    });
    return (s) => {
        textOn = s.textOn || defText; textOff = s.textOff || defText;
        curBg = s.bg || ''; curBgOn = s.bgOn || '';
        btn.style.color = s.fg || '';
        btn.style.fontSize = s.size ? s.size + 'px' : '';
        btn.style.padding = s.pad != null ? s.pad + 'px' : '';
        btn.style.width = s.boxSize ? s.boxSize + 'px' : '';
        btn.style.height = s.boxH ? s.boxH + 'px' : '';
        if (wrap && labelEl) {
            labelEl.textContent = s.label || '';
            wrap.classList.remove('btn-label-top', 'btn-label-left', 'btn-label-right', 'btn-label-bottom', 'btn-label-off');
            wrap.classList.add('btn-label-' + (s.labelPos || 'bottom'));
        }
        mode = s.btnMode || 'trigger';
        if (mode !== 'gate') isOn = false;
        paint();
    };
}
function knobMetaKeys(sfx) { return ['seqMult' + sfx, 'seqDiv' + sfx, 'seqLen' + sfx]; }

/** Sq 0 behält den Alt-Gruppennamen 'Stepsequenzer' (damit gespeicherte groupPos/groupStyles/
 *  controlOrder/ctrlPos des bestehenden Layouts 1:1 erhalten bleiben); ab Sq 2 durchnummeriert. */
function sqName(i) { return i === 0 ? 'Stepsequenzer' : 'Sequenzer ' + (i + 1); }

/**
 * @param {object} o
 * @param {*} o.host    mountGroups-Rückgabe (addGroup/removeGroup/mountInGroup/registerCtrlStyle)
 * @param {import('../MiniState.js').MiniState} o.state  gemeinsamer ISM-State
 * @param {object} o.defs  LIVE-defs, die mountGroups hält (KNOBS/SELECTS/TOGGLES/DEFAULTS werden mutiert)
 * @param {object} o.tpl   Template-Einträge unter flachen Keys ({KNOBS,SELECTS,TOGGLES,DEFAULTS})
 * @param {() => number} o.getBeatDurMs
 * @param {object} o.routing
 * @param {Function} o.createEngine  createStepSeqEngine
 * @param {(scopedState, engine) => object} o.makeGrid  liefert ein StepSeqGrid
 */
export function createSqManager({ host, state, defs, tpl, getBeatDurMs, routing, createEngine, makeGrid }) {
    const engines = [];    // index i → Engine der Sq i (kompakt gehalten via splice)
    const grids = [];      // index i → StepSeqGrid der Sq i
    const pickMenus = [];  // index i → seqOutput-PickMenu der Sq i
    let transportOn = false;
    let targetsCache = [];   // routing.inputTargets(SRC_TYPE)-Schnappschuss, nur per ↪️ erneuert

    function loadTargets() { targetsCache = routing.inputTargets(SRC_TYPE); return targetsCache; }
    function targetFor(ref) { return ref && targetsCache.find((t) => t.module + '.' + t.port === ref); }

    // ── State-Helfer für die geschachtelten Optik-Maps ─────────────────────────────
    function renameMap(mapKey, idMap) {
        const m = { ...(state.get(mapKey) || {}) }; let ch = false;
        for (const [from, to] of Object.entries(idMap)) if (m[from] !== undefined) { m[to] = m[from]; delete m[from]; ch = true; }
        if (ch) state.set(mapKey, m);
    }
    function removeIds(mapKey, ids) {
        const m = { ...(state.get(mapKey) || {}) }; let ch = false;
        for (const id of ids) if (m[id] !== undefined) { delete m[id]; ch = true; }
        if (ch) state.set(mapKey, m);
    }

    // ── Migration: Alt-Stand (EIN Sequenzer mit flachen Keys) → Sq 0 (…_0) ─────────
    // Nur einmal (Flag = das Vorhandensein von sqCount). Rettet neben den Wert-Keys auch die
    // GESAMTE Optik von Sq 0 (ctrlStyles/knobMeta/controlOrder/ctrlPos), sonst zerfiele @dpas
    // sorgfältig angeordnetes Sequenzer-Layout beim ersten Laden des neuen Modells.
    function migrate() {
        if (state.get('sqCount') != null) return;
        const hadOld = VALUE_KEYS.some((k) => state.get(k) !== undefined);
        if (hadOld) {
            for (const k of VALUE_KEYS) {
                const v = state.get(k);
                if (v !== undefined) { state.set(k + '_0', v); state.remove(k); }
            }
            const idMap = {
                's:seqOutput': 's:seqOutput_0', 't:seqEnabled': 't:seqEnabled_0',
                'k:seqMult': 'k:seqMult_0', 'k:seqDiv': 'k:seqDiv_0', 'u:seqGrid': 'u:seqGrid_0',
            };
            renameMap('ctrlStyles', idMap);
            renameMap('knobMeta', { seqMult: 'seqMult_0', seqDiv: 'seqDiv_0' });
            // controlOrder: { rowId: [ctrlId,…] } — IDs in den Reihenfolge-Arrays umschreiben.
            const co = { ...(state.get('controlOrder') || {}) }; let coCh = false;
            for (const rid of Object.keys(co)) {
                if (!Array.isArray(co[rid])) continue;
                const mapped = co[rid].map((id) => idMap[id] || id);
                if (mapped.some((x, j) => x !== co[rid][j])) { co[rid] = mapped; coCh = true; }
            }
            if (coCh) state.set('controlOrder', co);
            // ctrlPos: { groupName: { ctrlId: {x,y} } } — nur die 'Stepsequenzer'-Gruppe.
            const cp = { ...(state.get('ctrlPos') || {}) };
            if (cp['Stepsequenzer']) {
                const inner = { ...cp['Stepsequenzer'] }; let ch = false;
                for (const [from, to] of Object.entries(idMap)) if (inner[from] !== undefined) { inner[to] = inner[from]; delete inner[from]; ch = true; }
                if (ch) { cp['Stepsequenzer'] = inner; state.set('ctrlPos', cp); }
            }
        }
        if (!(state.get('sqCount') >= 1)) state.set('sqCount', 1);
    }

    // ── Migration: Output-Ziel-Umbau (Punkt 1, ddw.md) — EIGENES, von `migrate()`
    // unabhängiges Flag, weil @dpas Sq-State schon VOR diesem Umbau `sqCount` hatte
    // (migrate() oben ist für ihn längst ein No-op). Läuft darum separat, garantiert genau
    // einmal: altes Enum 'AmpEnv+OSZ' → 'polysynth.trig', und der alte 0=off-Sentinel in
    // seqSteps → null (Punkt 1: 0 ist jetzt bei manchen Zielen ein ECHTER Wert). Die
    // Umwandlung 0→null ist verhaltensgleich zur alten Semantik (0 bedeutete dort IMMER
    // „kein Trigger", s. altes engine.js `v > 0`) — kein Klangunterschied für Alt-Stände.
    function migrateTargets() {
        if (state.get('seqTargetMigrated')) return;
        const n = state.get('sqCount') || 1;
        for (let i = 0; i < n; i++) {
            const sfx = '_' + i;
            if (state.get('seqOutput' + sfx) === OLD_OUTPUT_ENUM) state.set('seqOutput' + sfx, NEW_DEFAULT_TARGET);
            const steps = state.get('seqSteps' + sfx);
            if (Array.isArray(steps) && steps.some((v) => v === 0)) {
                state.set('seqSteps' + sfx, steps.map((v) => (v === 0 ? null : v)));
            }
        }
        state.set('seqTargetMigrated', true);
    }

    // ── Eine Sq bauen (defs indiziert erweitern → State-Defaults → Gruppe → Engine+Grid) ──
    function buildSq(i) {
        const sfx = '_' + i;
        // 1) defs live um die indizierten Keys erweitern (mountGroups' makeKnob/makeSelect
        //    lesen KNOBS[key]/SELECTS[key] LIVE — dieselbe Objekt-Referenz).
        for (const k of Object.keys(tpl.KNOBS)) defs.KNOBS[k + sfx] = tpl.KNOBS[k];
        for (const k of Object.keys(tpl.SELECTS)) defs.SELECTS[k + sfx] = tpl.SELECTS[k];
        for (const k of Object.keys(tpl.TOGGLES)) defs.TOGGLES[k + sfx] = tpl.TOGGLES[k];
        for (const k of Object.keys(tpl.DEFAULTS)) defs.DEFAULTS[k + sfx] = tpl.DEFAULTS[k];
        // 2) State-Defaults nur setzen, wo noch nichts steht (Recall gewinnt). seqSteps: frische Kopie.
        for (const k of VALUE_KEYS) {
            if (state.get(k + sfx) === undefined) {
                state.set(k + sfx, k === 'seqSteps' ? makeSeqSteps('first') : tpl.DEFAULTS[k]);
            }
        }
        // 3) Gruppe bauen (Toggles/Knobs indiziert — seqOutput ist KEIN GroupHost-Select mehr,
        //    s. Kopfkommentar, tpl.SELECTS ist seit Punkt 1 leer).
        host.addGroup({
            name: sqName(i),
            toggles: Object.keys(tpl.TOGGLES).map((k) => k + sfx),
            selects: Object.keys(tpl.SELECTS).map((k) => k + sfx),
            knobs: Object.keys(tpl.KNOBS).map((k) => k + sfx),
            // Combo/Snapshot-Pool (@dpa 20260724): "alle Klone haben gemeinsam den Pool" —
            // jede Sq teilt sich EINEN Combo- und EINEN Snapshot-Speicher, unabhängig vom
            // literalen Anzeigenamen (sqName gibt "Stepsequenzer"/"Sequenzer N" zurück).
            // VALUE_KEYS explizit statt dem DOM-Automatismus zu vertrauen: 'u:seqGrid'+sfx
            // zeigt zwar 'seqLen' im Kopf, das Pattern-Array 'seqSteps' hat aber KEINE
            // eigene data-ctrl-Entsprechung — ein zufälliger Namenstreffer wäre kein
            // verlässlicher Mechanismus.
            groupKind: 'Sequenzer',
            instanceSuffix: sfx,
            extraSoundKeys: VALUE_KEYS,
            // ddw.md @dpa 20260724: „Combo soll nicht den 'Steps'-Inhalt speichern/recallen" —
            // seqLen ('Steps') ist ein normaler Knob und würde sonst wie jeder andere ganz
            // automatisch in den geteilten Sequenzer-Combo einfließen. Snapshot bleibt
            // unberührt (das läuft über extraSoundKeys/VALUE_KEYS oben, nicht hier).
            comboExcludeKeys: ['seqLen'],
        });
        // 4) Engine + Grid an den scoped State hängen; Trigger liefert GEZIELT an das pro-Sq
        //    gewählte Ziel (routing.deliver — mehrere Sqs teilen sich denselben Output-Port
        //    'amp', ein emit()-Fan-out über alle verbundenen Ziele wäre hier falsch).
        const st = scoped(state, sfx);
        const eng = createEngine(st, getBeatDurMs, (v) => {
            const ref = state.get('seqOutput' + sfx);
            const dot = ref && ref.indexOf('.');
            if (!ref || dot < 0) return;   // kein/ungültiges Ziel (noch) gewählt → No-op
            routing.deliver({ module: 'stepseq', port: 'amp' }, { module: ref.slice(0, dot), port: ref.slice(dot + 1) }, v);
        });
        const grid = makeGrid(st, eng);
        // Werte-Skala des Grids auf das AKTUELL gewählte Ziel einstellen, bevor es zum
        // ersten Mal zeichnet — sonst zeigt es kurz den 0..1-Fallback.
        grid.setTargetDefaults(targetFor(state.get('seqOutput' + sfx)) || {});
        host.mountInGroup(sqName(i), grid.element, 'u:seqGrid' + sfx);
        host.registerCtrlStyle('u:seqGrid' + sfx, 'stepseq', grid.element, (s) => grid.applyStyle(s), 'Steps');
        // Fill/set0 (@dpa 20260724: "Speicher wie bei Control/Knob-Settings", dann
        // 20260724_114012: "mach die Elemente im e-mode verschiebbar") — eigene Optik-
        // Registrierung UND eigenes mountInGroup je Element (statt geteilter Grid-Farbe/
        // -Position), damit sie im e-Mode wie jeder andere Control einzeln verschiebbar sind.
        // registerCtrlStyle/mountInGroup hängen am WRAPPER (fillWrap/set0Wrap), nicht am
        // rohen <button> — der hat im e-Mode pointer-events:none (css/main.css, wie jeder
        // andere Button-Control auch), der Wrapper dahinter bleibt greifbar. Steps (seqLen)
        // ist seit @dpa 20260724_122929 ein normaler Knob (s. defs.js KNOBS.seqLen) — der
        // läuft komplett über host.addGroup()/knobs oben, braucht hier kein eigenes Mounten.
        host.mountInGroup(sqName(i), grid.fillWrap, 'u:seqFill' + sfx);
        const applyFillStyle = wireModeButton({
            btn: grid.fillBtn, wrap: grid.fillWrap, labelEl: grid.fillLabel, defText: 'Fill',
            fire: () => grid.fillNow(), isArranging: host.isArranging,
        });
        host.registerCtrlStyle('u:seqFill' + sfx, 'button', grid.fillWrap, applyFillStyle, 'Fill');
        host.mountInGroup(sqName(i), grid.set0Wrap, 'u:seqSet0' + sfx);
        const applySet0Style = wireModeButton({
            btn: grid.set0Btn, wrap: grid.set0Wrap, labelEl: grid.set0Label, defText: '⟲',
            fire: () => grid.resetNow(), isArranging: host.isArranging,
        });
        host.registerCtrlStyle('u:seqSet0' + sfx, 'button', grid.set0Wrap, applySet0Style, 'Reset');

        // 5) seqOutput-PickMenu (Punkt 1): nur wählen (kein onUpdate/onRename/onDelete),
        //    ↪️ „Neu laden" sitzt in der Fußzeile, NICHT in der Gruppenansicht.
        // noContextOpen (@dpa ddw.md 20260723_210324): Rechtsklick soll HIER die normalen
        // Element-Settings liefern (wie jedes andere Control), nicht PickMenus „geh auf".
        const pm = new PickMenu({
            label: 'Output',
            empty: '— kein Ziel —',
            noContextOpen: true,
            // (@dpa ddw.md 20260724): Instrumente-Namen sind wenig aussagekräftig, das
            // Control-Ziel dahinter ("Höhen-Dämpf") schon — darum rechtsbündig/Kürzung
            // am Anfang, NUR für dieses eine Menü (s. PickMenu.js cfg.tailAlign).
            tailAlign: true,
            title: 'Sq-Ausgabeziel wählen — Fußzeile: Zielliste aus dem Ensemble neu laden',
            list: () => targetsCache,
            current: () => { const t = targetFor(state.get('seqOutput' + sfx)); return t ? t.name : ''; },
            onPick: (idx, item) => {
                state.set('seqOutput' + sfx, item.module + '.' + item.port);
                grid.setTargetDefaults(item);
            },
            foot: [['load', '↪️ Neu laden', 'Liste der verfügbaren Ziele neu aus dem Ensemble laden (kein Live-Update)', () => {
                loadTargets();
                pm.refresh();
                const t = targetFor(state.get('seqOutput' + sfx));
                if (t) grid.setTargetDefaults(t);
            }]],
        });
        host.mountInGroup(sqName(i), pm.element, 's:seqOutput' + sfx);
        // Element-Settings (Punkt 3a, ddw.md): OHNE das hier bubbelt ein Rechtsklick auf den
        // Wrapper (außerhalb von .pm-btn) zur GRUPPE durch (mountInGroup registriert selbst
        // keine registerCtrlStyle, anders als beim Grid direkt darüber) — GroupHost.
        // registerCtrlStyle stoppt die Propagation UND öffnet die echten select-Settings.
        host.registerCtrlStyle('s:seqOutput' + sfx, 'select', pm.element, (s) => {
            const lab = pm.element.querySelector('.pm-label');
            if (lab) lab.textContent = s.label || 'Output';
            // Label-Pos (@dpa 20260724_114012: "funktioniert hier noch nicht, bei anderen
            // select schon") — dieselben sel-label-*-Klassen wie GroupHost.makeSelect, nur am
            // .pickmenu-Wrapper statt am .select-field (s. css/main.css).
            pm.element.classList.remove('sel-label-top', 'sel-label-left', 'sel-label-right', 'sel-label-bottom', 'sel-label-off');
            pm.element.classList.add('sel-label-' + (s.labelPos || 'top'));
            const btn = pm.element.querySelector('.pm-btn');
            if (btn) {
                btn.style.background = s.bg0 || '';
                btn.style.color = s.fg || '';
                btn.style.fontSize = s.size ? s.size + 'px' : '';
                btn.style.padding = s.pad != null ? s.pad + 'px' : '';
                // Länge (@dpa 20260724_114012: "funktioniert hier noch nicht") — .pm-btn hat
                // per CSS min-width:140px (Default für normale Snapshot-/Combo-Knöpfe); ein
                // gesetztes boxSize muss diesen Boden per Inline-Style selbst unterlaufen
                // können, sonst greift „kleiner machen" nie unter 140px.
                btn.style.width = s.boxSize ? s.boxSize + 'px' : '';
                btn.style.minWidth = s.boxSize ? s.boxSize + 'px' : '';
            }
        }, 'Output');

        engines[i] = eng; grids[i] = grid; pickMenus[i] = pm;
        if (transportOn) eng.transportStarted();
    }

    return {
        init() {
            migrate();
            migrateTargets();
            loadTargets();
            const n = state.get('sqCount') || 1;
            for (let i = 0; i < n; i++) buildSq(i);
        },
        /** [+]: eine Sq hinten anhängen. */
        addSq() {
            const n = state.get('sqCount') || 0;
            buildSq(n);
            state.set('sqCount', n + 1);
        },
        /** [-]: die letzte Sq entfernen (nie unter 1 — „*kein Sq* darf nicht vorkommen"). */
        removeSq() {
            const n = state.get('sqCount') || 0;
            if (n <= 1) return false;
            const i = n - 1, sfx = '_' + i;
            if (engines[i] && engines[i].transportStopped) engines[i].transportStopped();
            if (pickMenus[i]) pickMenus[i].close();   // Popup hängt an <body>, s. PickMenu.js — sonst Leiche im DOM
            engines.splice(i, 1); grids.splice(i, 1); pickMenus.splice(i, 1);
            host.removeGroup(sqName(i));   // DOM + gruppen-namens-State + Control-Maps
            for (const k of VALUE_KEYS) state.remove(k + sfx);
            for (const k of Object.keys(tpl.KNOBS)) delete defs.KNOBS[k + sfx];
            for (const k of Object.keys(tpl.SELECTS)) delete defs.SELECTS[k + sfx];
            for (const k of Object.keys(tpl.TOGGLES)) delete defs.TOGGLES[k + sfx];
            for (const k of Object.keys(tpl.DEFAULTS)) delete defs.DEFAULTS[k + sfx];
            removeIds('ctrlStyles', ctrlIds(sfx));
            removeIds('knobMeta', knobMetaKeys(sfx));
            state.set('sqCount', n - 1);
            return true;
        },
        count() { return state.get('sqCount') || 0; },
        // ── Fan-out (ersetzt die Einzelaufrufe an die frühere eine stepSeqEngine) ──────
        tick(nowMs) { for (const e of engines) if (e) e.tick(nowMs); for (const g of grids) if (g) g.tick(); },
        handleClockBeat(ms) { for (const e of engines) if (e) e.handleClockBeat(ms); },
        armBeatSync() { for (const e of engines) if (e) e.armBeatSync(); },
        resyncPhase() { for (const e of engines) if (e) e.resyncPhase(); },
        transport(on) { transportOn = on; for (const e of engines) if (e) (on ? e.transportStarted() : e.transportStopped()); },
        latency() { return engines[0] ? engines[0].latency() : 0; },
        engineAt: (i) => engines[i],   // Debug/Test: Engine einer einzelnen Sq (window.__stepseq.mgr.engineAt(0))
    };
}

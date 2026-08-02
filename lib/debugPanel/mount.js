/**
 * mount.js — die zwei Debug-Textfelder (Name/Prompt) + die Rec/Rec2-ON-Anzeige.
 *
 * Name/Prompt laufen BEWUSST NICHT über die generische TEXTS-Fabrik (lib/group/GroupHost.js
 * `makeText`) — die hängt ihren Wert an einen literalen `data-ctrl`-State-Key, und genau
 * DAS ist der Sound-Snapshot-Pfad, den DebugPanel.js-Kopf ausdrücklich vermeiden will (ein
 * alter Gruppen-/ISM-Snapshot darf @dpas laufende Debug-Notiz nie überschreiben). Trotzdem
 * bekommen die Felder ein `data-ctrl` (über `host.mountInGroup`) — sonst würde sie
 * GroupHost.js beim Einschalten des e-Mode (`freezeGroup()`, hängt an `data-ctrl` zum
 * Überleben) beim ersten Anordnen ersatzlos aus dem DOM entfernen.
 *
 * Der Ausweg: der WERT hängt an einem eigenen top-level Optik-Key `debugMeta`
 * (`{name, prompt}`), exakt dasselbe Muster wie `ctrlStyles`/`knobMeta`/`groupPos` — die
 * Gruppen-/ISM-Snapshot-Funktionen (`_snapValuesOf`/`allSoundValues`) fassen NUR literale
 * `state.get(dataCtrlKey)`-Werte an, nie eigene Top-Level-Dictionaries. `debugMeta`
 * persistiert ganz normal über MiniState (localStorage) — überlebt also einen Reload,
 * ohne je Teil eines Sound-Recalls zu werden. Optik (Label/Farbe/Größe) läuft trotzdem
 * ganz normal über `registerCtrlStyle`/`ctrlStyles` — das ist ein ANDERER State-Key
 * (kollidiert nicht mit `debugMeta`) und identisch zu jedem generischen Text-Control.
 */

function updateDebugMeta(state, patch) {
    const cur = { ...(state.get('debugMeta') || {}) };
    Object.assign(cur, patch);
    state.set('debugMeta', cur);
}

/** Baut EIN Optik-Textfeld, DOM-/CSS-identisch zu GroupHost.js' generischer `makeText()`
 *  (dieselben Klassen, damit es aussieht wie jeder andere Control), aber mit Wert-Bindung
 *  an `debugMeta[field]` statt an `state.get(key)`. */
function makeMetaText(host, state, groupName, ctrlId, field, cfg) {
    const wrap = document.createElement('label'); wrap.className = 'select-field text-field';
    const span = document.createElement('span'); span.textContent = cfg.label;
    const inp = document.createElement(cfg.lines ? 'textarea' : 'input');
    if (cfg.lines) inp.rows = cfg.lines; else inp.type = 'text';
    inp.className = 'gs-text' + (cfg.lines ? ' text-multiline' : '');
    inp.placeholder = cfg.placeholder || '';
    inp.value = (state.get('debugMeta') || {})[field] || '';
    inp.addEventListener('input', () => updateDebugMeta(state, { [field]: inp.value }));
    wrap.appendChild(span); wrap.appendChild(inp);
    host.mountInGroup(groupName, wrap, ctrlId);
    // Recall von außen (Config-Import, anderer Tab via storage-Event o.ä.): Feld nachziehen.
    state.subscribe((key, data) => {
        if (key !== 'debugMeta' && key !== '*') return;
        const v = (data.debugMeta || {})[field] || '';
        if (inp.value !== v) inp.value = v;
    });
    const applyStyle = (s) => {
        span.textContent = s.label || cfg.label;
        span.style.display = (s.labelOn ?? cfg.labelOn ?? true) === false ? 'none' : '';
        inp.style.background = s.bg || ''; inp.style.color = s.fg || '';
        inp.style.fontSize = s.size ? s.size + 'px' : '';
        inp.style.width = s.boxSize ? s.boxSize + 'px' : '';
        inp.style.height = s.boxH ? s.boxH + 'px' : '';
    };
    applyStyle({});
    host.registerCtrlStyle(ctrlId, 'text', wrap, applyStyle, cfg.label);
    return wrap;
}

/**
 * Debug-Gruppe fertig verdrahten — nach `mountGroups(root, state, debugPanelDefs(...))`
 * aufrufen (die Gruppe 'Debug' muss schon existieren, s. defs.js GROUPS).
 * @param {ReturnType<import('../group/GroupHost.js').mountGroups>} host
 * @param {import('../MiniState.js').MiniState} state
 * @param {import('./DebugPanel.js').DebugPanel} dbg
 */
export function mountDebugGroup(host, state, dbg) {
    makeMetaText(host, state, 'Debug', 'x:debugName', 'name',
        { label: 'Name', placeholder: 'z.B. filter-bug' });
    makeMetaText(host, state, 'Debug', 'x:debugPrompt', 'prompt',
        { label: 'Text', labelOn: false, lines: 3, placeholder: 'z.B. „hörst du das Zwitschern bei Step 3?"' });

    // Rec/Rec2 zeigen ihren ON-Zustand über die normale Button-ON-Klasse (setCtrlOn) — wie
    // beim bestehenden Rec-Instrument (lib/recInstrument/), NICHT über einen dynamischen
    // Sekunden-Text im Label (teslacoils Extra „⏺ Rec · 2.3 s" ist dort möglich, weil
    // makeButton() dort einen dritten Callback-Parameter für den Text hat — Werkbanks
    // generische Button-Fabrik kennt nur EIN statisches Label + ON/OFF-Klasse, s.
    // lib/group/GroupHost.js `makeButton`). Ein Start kann den JEWEILS ANDEREN Slot
    // stoppen (DebugPanel.toggle()) — darum werden nach JEDER Änderung BEIDE Knöpfe neu
    // gemalt, nicht nur der geklickte (paintRec-Muster aus teslacoil/werkbank.js:rec).
    const paintRec = () => {
        host.setCtrlOn('b:debugRec', dbg.recording('a'));
        host.setCtrlOn('b:debugRec2', dbg.recording('b'));
    };
    dbg.onChange(paintRec);
    paintRec();
}

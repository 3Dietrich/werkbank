/**
 * multiScope.js — Manager für vervielfältigbare Signal-Scopes, REINE ANZEIGE.
 * (@dpa 20260726, Korrektur nach Fehlversuch: „ein Meter ist eine ANZEIGE die
 * braucht kein Output, sondern die Quelle, die sie anzeigt — OHNE den Fluss zum
 * eigentlichen Ziel zu unterbrechen".)
 *
 * Gleiches Vervielfältigungs-Muster wie multiEnv/multiSq (Header +/−, Settings mit
 * +➚/🚮), aber KEIN Routing-Modul, KEIN Input-Port, KEIN Output-Port, KEIN write()
 * — der Scope registriert sich NICHT bei der Registry. Er wählt per PickMenu eine
 * bestehende Quelle aus `routing.outputSources()` (alle Module mit lesbaren
 * Output-Ports) und liest sie jeden Frame passiv mit `routing.getValue()` — exakt
 * dieselbe Methode, mit der `flush()` verbundene Ports sampelt. Der bestehende
 * Signalweg (Quelle → echtes Ziel) bleibt dadurch komplett unberührt.
 */
import { SignalScope } from '../SignalScope.js';
import { PickMenu } from '../PickMenu.js';
import { hint } from '../i18n.js';

// scopeTriggerPos/scopeSyncOffset sind ECHTE Sound-Werte (Trigger-Position/Zeitversatz),
// scopeSync/scopeFreeze bewusst NICHT hier drin (transiente Button-Zustände, wie Recs
// 'rec'-Button — ein wiederhergestelltes Preset soll nicht „eingefroren"/„mitten im Sync"
// aufwachen, @dpa 20260804 Grill-Runde). ABER scopeOn IST hier mit drin, weil der Sinn
// gerade ist, einen nicht gebrauchten Scope dauerhaft CPU-schonend abzuschalten (kein
// AnalyserNode/Tap-Aufbau) — sollte sich über Presets/Reload erhalten (@dpa 20260805).
const VALUE_KEYS = ['scopeSrc', 'scopeOn', 'scopeTriggerPos', 'scopeSyncOffset'];

function scopeName(i) { return i === 0 ? 'Scope' : 'Scope ' + (i + 1); }

/** Sync/Freeze/On/Trigger-Pos/Sync-Offset als ECHTE GroupHost-Controls (Buttons/Knobs) —
 *  nicht handverdrahtete Spezial-DOM-Elemente (@dpa 20260804 Grill-Runde: „bitte passende
 *  Controls für alle Anzeigen und Bedienelemente"). Vorbild: lib/recInstrument/defs.js
 *  (BUTTONS-Fabrik mit injiziertem onClick). */
function scopeSyncFreezeTpl({ onSyncClick, onFreezeClick, onToggleClick }) {
    return {
        BUTTONS: {
            scopeOn: {
                label: '⏻', mode: 'toggle', onClick: (k, phase) => onToggleClick(k, phase),
                title: 'Schaltet die Anzeige ein/aus. Ausgeschaltet entlastet die CPU deutlich (kein Sampling, kein Audio-Tap).',
            },
            scopeSync: {
                label: 'Sync', mode: 'toggle', onClick: (k, phase) => onSyncClick(k, phase),
                title: 'Rastet die Anzeige auf den Takt-Beat ein (Trigger) — Ziehen direkt auf der Kurve verschiebt die Trigger-Position. Nur bei einer Quelle mit echtem Audio-Signal möglich.',
            },
            scopeFreeze: {
                label: 'Freeze', mode: 'toggle', onClick: (k, phase) => onFreezeClick(k, phase),
                title: 'Friert die Anzeige ein (Erfassung läuft im Hintergrund weiter) — Mauszeiger auf dem eingefrorenen Bild liest Werte ab. Beim Lösen springt die Anzeige hart zurück auf live.',
            },
        },
        KNOBS: {
            scopeTriggerPos: {
                label: 'Trigger-Pos', min: 0, max: 1, step: 0.01, decimals: 2, meta: { viewSize: 'none' },
                info: 'Position des Beats im Sync-Anzeigefenster (0=Fensteranfang, 0.5=Mitte, 1=Fensterende) — auch direkt auf der Kurve per Ziehen einstellbar.',
            },
            scopeSyncOffset: {
                label: 'Sync-Offset', min: -500, max: 500, step: 1, unit: ' ms', decimals: 0, meta: { viewSize: 'none' },
                info: 'Verschiebt den Referenz-Beat SELBST (negativ = gilt als früher geschehen) — z.B. um die Latenz einer Modulationskette vor der Anzeige auszugleichen.',
            },
        },
    };
}

export function createScopeManager({ host, state, defs, routing, onClockBeat }) {
    const scopes = [];
    const pickMenus = [];
    const beatUnsubs = [];   // je Instanz: Unsubscribe-Fn vom Beat-Listener, oder null (Sync aus)
    let sourceCache = routing.outputSources();

    function idxOf(id) {
        const at = id.lastIndexOf('_');
        const i = at >= 0 ? parseInt(id.slice(at + 1), 10) : NaN;
        return Number.isFinite(i) && scopes[i] ? i : null;
    }
    function dispatchToggle(id) {
        const i = idxOf(id);
        if (i == null) return;
        const scope = scopes[i];
        const on = !scope.on;
        scope.setOn(on);
        host.setCtrlOn('b:scopeOn_' + i, scope.on);
        state.set('scopeOn_' + i, scope.on);
    }
    function dispatchSync(id) {
        const i = idxOf(id);
        if (i == null) return;
        const scope = scopes[i];
        const on = !scope.syncOn;
        scope.setSyncOn(on);
        host.setCtrlOn('b:scopeSync_' + i, scope.syncOn);   // scope.syncOn statt `on`: hasNode-Gate kann on stumm auf false halten
        if (beatUnsubs[i]) { beatUnsubs[i](); beatUnsubs[i] = null; }
        if (scope.syncOn && onClockBeat) beatUnsubs[i] = onClockBeat((time) => scope.addBeat(time));
    }
    function dispatchFreeze(id) {
        const i = idxOf(id);
        if (i == null) return;
        const scope = scopes[i];
        if (scope.frozen) scope.unfreeze(); else scope.freeze();
        host.setCtrlOn('b:scopeFreeze_' + i, scope.frozen);
    }
    const tpl = scopeSyncFreezeTpl({ onSyncClick: dispatchSync, onFreezeClick: dispatchFreeze, onToggleClick: dispatchToggle });

    // scopeOn/Trigger-Pos/Sync-Offset können sowohl vom Knob/Button (state.set über GroupHost)
    // als auch vom Canvas-Drag (scope.onTriggerPosCommit → state.set, s. buildScope) geändert
    // werden — EIN zentraler Subscribe hält den Scope in beiden Richtungen synchron.
    state.subscribe((k, d) => {
        let m = /^scopeOn_(\d+)$/.exec(k);
        if (m) { const s = scopes[+m[1]]; if (s) s.setOn(d[k]); return; }
        m = /^scopeTriggerPos_(\d+)$/.exec(k);
        if (m) { const s = scopes[+m[1]]; if (s) s.setTriggerPos(d[k]); return; }
        m = /^scopeSyncOffset_(\d+)$/.exec(k);
        if (m) { const s = scopes[+m[1]]; if (s) s.setSyncOffsetMs(d[k]); }
    });

    function buildScope(i) {
        const sfx = '_' + i;
        if (state.get('scopeSrc' + sfx) === undefined) state.set('scopeSrc' + sfx, '');
        if (state.get('scopeOn' + sfx) === undefined) state.set('scopeOn' + sfx, true);
        if (state.get('scopeTriggerPos' + sfx) === undefined) state.set('scopeTriggerPos' + sfx, 0.5);
        if (state.get('scopeSyncOffset' + sfx) === undefined) state.set('scopeSyncOffset' + sfx, 0);

        defs.BUTTONS['scopeOn' + sfx] = tpl.BUTTONS.scopeOn;
        defs.BUTTONS['scopeSync' + sfx] = tpl.BUTTONS.scopeSync;
        defs.BUTTONS['scopeFreeze' + sfx] = tpl.BUTTONS.scopeFreeze;
        defs.KNOBS['scopeTriggerPos' + sfx] = tpl.KNOBS.scopeTriggerPos;
        defs.KNOBS['scopeSyncOffset' + sfx] = tpl.KNOBS.scopeSyncOffset;

        host.addGroup({
            name: scopeName(i),
            buttons: ['scopeOn' + sfx, 'scopeSync' + sfx, 'scopeFreeze' + sfx],
            knobs: ['scopeTriggerPos' + sfx, 'scopeSyncOffset' + sfx],
            groupKind: 'Scope',
            instanceSuffix: sfx,
            extraSoundKeys: VALUE_KEYS,
        });

        const scope = new SignalScope({ label: scopeName(i) });
        scopes[i] = scope;
        beatUnsubs[i] = null;
        scope.setOn(state.get('scopeOn' + sfx));
        scope.setTriggerPos(state.get('scopeTriggerPos' + sfx));
        scope.setSyncOffsetMs(state.get('scopeSyncOffset' + sfx));
        // Drag auf der Kurve schreibt NUR bei mouseup in den State (nicht bei jedem
        // mousemove — Performance/localStorage-Schreibhäufigkeit, s. SignalScope.js).
        scope.onTriggerPosCommit((v) => state.set('scopeTriggerPos' + sfx, v));

        // Quellen-PickMenu — reines Ablesen. KEIN Ziel, KEIN Passthrough, KEINE
        // Wertspannen-Pflicht (anders als bei inputTargets(): hier wird nichts
        // geschrieben, also gibt es auch kein Clamping-Risiko).
        const targetFor = (modPort) => sourceCache.find((t) => t.module + '.' + t.port === modPort) || null;

        // Gespeicherte Quelle wiederherstellen — über targetFor (statt {module,port} pur),
        // damit hasNode/node (Scope-„sample"-Genauigkeit, ddw.md 20260727) gleich mitkommen.
        const saved = state.get('scopeSrc' + sfx);
        if (saved) {
            const t = targetFor(saved);
            if (t) scope.setSource(t);
            else {
                // Quelle (noch) nicht im gecachten Ensemble gefunden (z.B. vor dem ↪️-Reload) —
                // altes Fallback ohne Node-Metadaten, wie bisher.
                const dot = saved.lastIndexOf('.');
                const mod = dot >= 0 ? saved.slice(0, dot) : '';
                const port = dot >= 0 ? saved.slice(dot + 1) : '';
                if (mod && port) scope.setSource({ module: mod, port });
            }
        }

        const pm = new PickMenu({
            label: 'Quelle',
            empty: '— keine Quelle —',
            noContextOpen: true,
            tailAlign: true,
            title: 'Anzuzeigende Quelle wählen (reines Mitlesen, verändert nichts) — Fußzeile: Liste neu laden',
            list: () => sourceCache,
            current: () => { const t = targetFor(state.get('scopeSrc' + sfx)); return t ? t.name : ''; },
            onPick: (idx, item) => {
                state.set('scopeSrc' + sfx, item.module + '.' + item.port);
                scope.setSource(item);
            },
            foot: [['load', '↪️ Neu laden', 'Quellenliste neu aus dem Ensemble laden', () => {
                sourceCache = routing.outputSources();
                pm.refresh();
            }]],
        });
        pickMenus[i] = pm;

        host.mountInGroup(scopeName(i), pm.element, 's:scopeSrc' + sfx);
        host.registerCtrlStyle('s:scopeSrc' + sfx, 'select', pm.element, (s) => {
            const lab = pm.element.querySelector('.pm-label');
            if (lab) lab.textContent = s.label || 'Quelle';
            pm.element.classList.remove('sel-label-top', 'sel-label-left', 'sel-label-right', 'sel-label-bottom', 'sel-label-off');
            pm.element.classList.add('sel-label-' + (s.labelPos || 'top'));
            const btn = pm.element.querySelector('.pm-btn');
            if (btn) {
                btn.style.background = s.bg0 || '';
                btn.style.color = s.fg || '';
                btn.style.fontSize = s.size ? s.size + 'px' : '';
                btn.style.padding = s.pad != null ? s.pad + 'px' : '';
                btn.style.width = s.boxSize ? s.boxSize + 'px' : '';
                btn.style.minWidth = s.boxSize ? s.boxSize + 'px' : '';
            }
        }, 'Quelle');

        host.mountInGroup(scopeName(i), scope.element, 'u:scope' + sfx);
        // sampleCapable (ddw.md 20260727, Grill-Runde): live-Funktion statt statischem Wert —
        // ElementSettings ruft sie bei JEDEM Öffnen des Panels frisch ab, damit das Ausgrauen
        // des Genauigkeit-Toggles die AKTUELL gewählte Quelle widerspiegelt, nicht den Stand
        // beim Bauen der Gruppe.
        // BUGFIX (@dpa ddw.md 20260802: „Umschaltung Frame/Sample führt immer zu einer
        // Minifizierung"): hier stand vorher `{ ...SCOPE_DEFAULTS, ...s }` — SCOPE_DEFAULTS
        // (width:120,height:34,…) wurde damit bei JEDEM Apply neu über den laufenden Stil
        // gemerget und warf jede vorher gesetzte Größe zurück auf die Werkseinstellung,
        // sobald IRGENDEIN Feld (z.B. nur „Genauigkeit") geändert wurde. SignalScope.js hat
        // seine Defaults schon im Konstruktor (`{...DEFAULTS, ...opts.style}`) — hier reicht
        // das reine Patch `s`, applyStyle() merged es additiv auf den bestehenden Stand.
        // boxSize/boxH sind die GENERISCHEN Breite/Höhe-Felder aus ElementSettings (@dpa
        // ddw.md 20260802 Punkt 3: Scope-Settings bekommen ALLE scope-eigenen Einstellungen,
        // inkl. Größe) — SignalScope kennt intern weiterhin width/height, hier gemappt.
        host.registerCtrlStyle('u:scope' + sfx, 'scope', scope.element, (s) => {
            const patch = { ...s };
            if (s.boxSize) patch.width = s.boxSize;
            if (s.boxH) patch.height = s.boxH;
            scope.applyStyle(patch);
            scope.element.offsetHeight;  // Force reflow — behebt Größenproblem beim initialen Laden
        }, scopeName(i), { sampleCapable: () => scope.hasNode() });
    }

    function teardownLast() {
        const i = scopes.length - 1;
        if (i < 0) return;
        const sfx = '_' + i;
        if (pickMenus[i]) pickMenus[i].close();
        if (beatUnsubs[i]) beatUnsubs[i]();
        if (scopes[i]) scopes[i].destroy();
        scopes.splice(i, 1); pickMenus.splice(i, 1); beatUnsubs.splice(i, 1);
        host.removeGroup(scopeName(i));
        for (const k of VALUE_KEYS) state.remove(k + sfx);
        delete defs.BUTTONS['scopeOn' + sfx]; delete defs.BUTTONS['scopeSync' + sfx]; delete defs.BUTTONS['scopeFreeze' + sfx];
        delete defs.KNOBS['scopeTriggerPos' + sfx]; delete defs.KNOBS['scopeSyncOffset' + sfx];
    }

    function reconcile() {
        let want = state.get('scopeCount');
        if (!(want >= 1)) want = 1;
        while (scopes.length < want) buildScope(scopes.length);
        while (scopes.length > want) teardownLast();
        state.set('scopeCount', scopes.length);
        return scopes.length;
    }

    function init() {
        if (state.get('scopeCount') == null) state.set('scopeCount', 1);
        reconcile();
    }

    function addScope() { state.set('scopeCount', scopes.length + 1); reconcile(); }
    function removeScope() {
        if (scopes.length <= 1) return false;
        state.set('scopeCount', scopes.length - 1); reconcile(); return true;
    }

    /** Aus dem Render-Loop: jeder Scope liest passiv seine Quelle und zeichnet. */
    function tick() {
        for (const scope of scopes) {
            scope.sample(routing);
            scope.tick();
        }
    }

    return { init, addScope, removeScope, reconcile, tick, scopes, count: () => scopes.length };
}

/**
 * groupKindSettings-Hook fürs Gruppen-Rechtsklick-Panel (+➚/🚮/⟲) — bisher DREIFACH
 * byte-identisch dupliziert in overcord/werkbank.js, werkbank-leer/werkbank-leer.js und
 * pitchosc/pitchosc.js (@dpa 20260804, Auslöser: „wie sieht es mit all den anderen
 * Elementen aus?" nach dem gleichen Fund bei ADSR — s. lib/adsrPanel.js). Jetzt EINE
 * Quelle, jeder Einstiegspunkt ruft sie nur noch mit seinen eigenen
 * scopeManager/state/host-Instanzen auf:
 *
 *   const _scopeKindSettings = { Scope: createScopeSettingsHook({ scopeManager, state: scopeState, host: scopeHost }) };
 */
export function createScopeSettingsHook({ scopeManager, state, host }) {
    return (name, pop, st, row, sfx) => {
        if (!sfx) return;
        const i = parseInt(sfx.slice(1), 10);
        const scope = scopeManager.scopes[i];
        if (!scope) return;
        const styles = () => ({ ...(state.get('ctrlStyles') || {}) });
        const cur = () => (styles()['u:scope' + sfx] || {});

        pop.appendChild(Object.assign(document.createElement('div'), { className: 'gs-sep' }));

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex; gap:8px; margin-top:8px;';
        const copyBtn = document.createElement('button'); copyBtn.className = 'wb-help-btn'; copyBtn.textContent = '+➚';
        hint(copyBtn, 'Kopie dieses Scopes anlegen (übernimmt die Optik)');
        copyBtn.addEventListener('click', () => {
            const src = cur();
            scopeManager.addScope();
            const all = styles();
            all['u:scope_' + (scopeManager.count() - 1)] = { ...src };
            state.set('ctrlStyles', all);
            host.reapplyCtrlStyles(['u:scope_' + (scopeManager.count() - 1)]);
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
    };
}

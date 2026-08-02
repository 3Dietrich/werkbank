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

const VALUE_KEYS = ['scopeSrc'];

function scopeName(i) { return i === 0 ? 'Scope' : 'Scope ' + (i + 1); }

export function createScopeManager({ host, state, defs, routing }) {
    const scopes = [];
    const pickMenus = [];
    let sourceCache = routing.outputSources();

    function buildScope(i) {
        const sfx = '_' + i;
        if (state.get('scopeSrc' + sfx) === undefined) state.set('scopeSrc' + sfx, '');

        host.addGroup({
            name: scopeName(i),
            groupKind: 'Scope',
            instanceSuffix: sfx,
            extraSoundKeys: VALUE_KEYS,
        });

        const scope = new SignalScope({ label: scopeName(i) });
        scopes[i] = scope;

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
        }, scopeName(i), { sampleCapable: () => scope.hasNode() });
    }

    function teardownLast() {
        const i = scopes.length - 1;
        if (i < 0) return;
        const sfx = '_' + i;
        if (pickMenus[i]) pickMenus[i].close();
        scopes.splice(i, 1); pickMenus.splice(i, 1);
        host.removeGroup(scopeName(i));
        for (const k of VALUE_KEYS) state.remove(k + sfx);
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

/**
 * multiScope.js — Manager für vervielfältigbare Signal-Scopes (@dpa 20260726).
 *
 * Gleiches Muster wie multiEnv/multiSq: jede Instanz ist eine eigene GroupHost-Gruppe
 * mit indizierten State-Keys, eigenem Routing-Modul und eigenem Ziel-PickMenu.
 *
 * Reinklinken ohne Unterbrechung (s. SignalScope.js Kopf):
 *   Quelle → scope_i.in      (der Scope zeigt an)
 *   scope_i.out → Weiterziel (optional, per PickMenu gewählt → Passthrough)
 * Ohne gewähltes Weiterziel ist der Scope ein reiner Mithörer/Anzeiger.
 *
 * Settings (Rechtsklick auf die Gruppe): Buffer-ms, min/max, Auto-Range, Meter/Kurve,
 * Breite/Höhe/Farben — plus „+➚" (Kopie) und „🚮" (löschen), wie bei ADSR.
 */
import { SignalScope, SCOPE_DEFAULTS } from '../SignalScope.js';
import { PickMenu } from '../PickMenu.js';

const SRC_TYPE = 'Value';
const VALUE_KEYS = ['scopeOut'];

function scopeName(i) { return i === 0 ? 'Scope' : 'Scope ' + (i + 1); }

export function createScopeManager({ host, state, defs, routing }) {
    const scopes = [];
    const pickMenus = [];
    const targetCaches = [];

    function buildScope(i) {
        const sfx = '_' + i;
        if (state.get('scopeOut' + sfx) === undefined) state.set('scopeOut' + sfx, '');

        host.addGroup({
            name: scopeName(i),
            groupKind: 'Scope',
            instanceSuffix: sfx,
            extraSoundKeys: VALUE_KEYS,
        });

        const scope = new SignalScope({ label: scopeName(i) });
        scopes[i] = scope;

        // ── Routing: 'in' (anzeigen + optional weiterreichen), 'out' (Passthrough) ──
        const moduleId = 'scope' + sfx;
        routing.registerModule(moduleId, {
            label: scopeName(i),
            outputs: {
                // read() = letzter empfangener Wert → Value-Port, per flush() weiterreichbar
                out: { type: SRC_TYPE, label: 'Durchgang', read: () => scope._last },
            },
            inputs: {
                // min/max nötig, damit der Scope in den Ziel-Menüs anderer Module auftaucht
                // (Registry.inputTargets filtert Ports ohne Wertspanne weg).
                in: { type: SRC_TYPE, label: 'Signal', min: -1, max: 1, stepSize: 0, offAllowed: true,
                      write: (v) => scope.push(v) },
            },
        });

        // Control in die Gruppe (mountInGroup + registerCtrlStyle → Rechtsklick-Settings)
        host.mountInGroup(scopeName(i), scope.element, 'u:scope' + sfx);
        host.registerCtrlStyle('u:scope' + sfx, 'scope', scope.element, (s) => {
            scope.applyStyle({ ...SCOPE_DEFAULTS, ...s });
        }, scopeName(i));

        // Weiterziel-PickMenu (Passthrough) — dieselbe Bauart wie das ADSR-Output-Menü
        targetCaches[i] = routing.inputTargets(SRC_TYPE).filter((t) => t.module !== moduleId);
        const targetFor = (mp) => targetCaches[i].find((t) => t.module + '.' + t.port === mp) || null;
        const pm = new PickMenu({
            label: 'weiter →',
            empty: '— nur anzeigen —',
            noContextOpen: true,
            tailAlign: true,
            title: 'Signal zusätzlich weiterreichen (Passthrough) — Fußzeile: Zielliste neu laden',
            list: () => targetCaches[i],
            current: () => { const t = targetFor(state.get('scopeOut' + sfx)); return t ? t.name : ''; },
            onPick: (idx, item) => state.set('scopeOut' + sfx, item.module + '.' + item.port),
            foot: [['load', '↪️ Neu laden', 'Zielliste neu aus dem Ensemble laden', () => {
                targetCaches[i] = routing.inputTargets(SRC_TYPE).filter((t) => t.module !== moduleId);
                pm.refresh();
            }]],
        });
        pickMenus[i] = pm;
        host.mountInGroup(scopeName(i), pm.element, 's:scopeOut' + sfx);
        host.registerCtrlStyle('s:scopeOut' + sfx, 'select', pm.element, (s) => {
            const lab = pm.element.querySelector('.pm-label');
            if (lab) lab.textContent = s.label || 'weiter →';
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
        }, 'weiter →');
    }

    function teardownLast() {
        const i = scopes.length - 1;
        if (i < 0) return;
        const sfx = '_' + i;
        routing.unregisterModule('scope' + sfx);
        if (pickMenus[i]) pickMenus[i].close();
        scopes.splice(i, 1); pickMenus.splice(i, 1); targetCaches.splice(i, 1);
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

    /** Zeichnen + Passthrough — aus dem Render-Loop. */
    function tick() {
        for (let i = 0; i < scopes.length; i++) {
            scopes[i].tick();
            const target = state.get('scopeOut_' + i);
            if (!target) continue;
            const [mod, port] = target.split('.');
            if (!mod || !port) continue;
            routing.deliver({ module: 'scope_' + i, port: 'out', instance: i },
                            { module: mod, port }, scopes[i]._last);
        }
    }

    return { init, addScope, removeScope, reconcile, tick, scopes, count: () => scopes.length };
}

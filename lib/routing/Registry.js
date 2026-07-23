/**
 * Registry.js — zentrale Routing-Registry (Phase 2.3, PLAN_OPERA.md Z. 109-113 /
 * PHASE2_SPEC.md). Factory `createRoutingRegistry()` — keine Klasse, gleiche Naht wie die
 * ISM-Engines (createTaktEngine/createPolySynthEngine/...).
 *
 * Zwei Zustellwege, weil die bestehenden harten Verdrahtungen real zweierlei sind:
 *  - `emit(src, value)`  — Event/Puls, synchron im Ereignismoment (Stepseq-Trigger, Clock-Beat).
 *  - `flush()`           — Wert/pull, einmal pro Render-Frame gesampelt (Tempo, BaseFreq, ...).
 * Ein Port ist das eine ODER das andere (s. lib/routing/types.js TYPES[type].kind); welcher
 * Weg zieht, entscheidet allein, ob der Output-Port ein `read()` hat (value) oder nicht (event).
 *
 * Migrationsweg (PHASE2_SPEC.md „Migrationsweg"): Verbindungen können deklariert/verbunden
 * werden, OHNE dass eine bestehende harte Verdrahtung sofort ersetzt wird — `connect()` ist
 * reine Buchführung für die Struktur-Ansicht (Phase 3), bis ein ISM seine Zustellung
 * tatsächlich auf `emit()`/`flush()` umstellt.
 *
 * Phase 3 (PHASE3_SPEC.md 3.3) ergänzt zwei additive Dinge für die Struktur-Ansicht:
 * `connect(src, dst, {active:false})` markiert eine nur-deklarierte (noch klassisch
 * zugestellte) Verbindung ehrlich als solche, und `onActivity(fn)`/`offActivity(fn)` melden
 * jeden über `emit()` zugestellten Event-Puls — NUR solange mindestens ein Listener lauscht
 * (zugeklappte Struktur-Ansicht = null Overhead).
 */
import { canConnect, adaptValue } from './types.js';

/** defs.js liefert `ports` (id/label/type, reine Metadaten) — dieser Helfer mischt sie mit
 *  den Verhaltens-Closures (read/write) aus dem engine/werkbank.js zu den Buckets, die
 *  `registerModule` erwartet. Metadaten bleiben Sache der defs, Verhalten Sache des Aufrufers
 *  — dieselbe Trennung wie GROUPS/BUTTONS (defs kennt die id, onAction das Verhalten). */
export function bindPorts(defsPorts, bindings = {}) {
    const build = (list, binds) => {
        const out = {};
        for (const p of list || []) {
            const b = binds[p.id] || {};
            out[p.id] = { type: p.type, label: p.label, read: b.read, write: b.write };
        }
        return out;
    };
    return {
        outputs: build(defsPorts && defsPorts.outputs, bindings.outputs || {}),
        inputs: build(defsPorts && defsPorts.inputs, bindings.inputs || {}),
    };
}

export function createRoutingRegistry({ stateKey = 'werkbank_routing' } = {}) {
    const modules = new Map();   // moduleId -> { label, latency, outputs:{id:{type,label,read}}, inputs:{id:{type,label,write}} }
    let connections = [];        // [{ src:{module,port}, dst:{module,port}, active }]
    const activityListeners = new Set();   // (Phase 3.3) nur befüllt, solange die Struktur-Ansicht offen ist

    function load() {
        try {
            const raw = localStorage.getItem(stateKey);
            const arr = raw ? JSON.parse(raw) : [];
            connections = Array.isArray(arr) ? arr : [];
        } catch { connections = []; }
    }
    function persist() {
        try { localStorage.setItem(stateKey, JSON.stringify(connections)); }
        catch { /* Storage evtl. voll/deaktiviert — Verbindung bleibt für diese Session gültig */ }
    }
    load();

    function registerModule(id, def = {}) {
        modules.set(id, {
            label: def.label || id,
            latency: typeof def.latency === 'function' ? def.latency : null,
            outputs: def.outputs || {},
            inputs: def.inputs || {},
        });
    }
    /** Phase 4 (mehrere Stepseq-Instanzen): Modul wieder abmelden, seine Verbindungen fallen weg. */
    function unregisterModule(id) {
        modules.delete(id);
        connections = connections.filter((c) => c.src.module !== id && c.dst.module !== id);
        persist();
    }

    function findPort(ref, dir) {
        const mod = ref && modules.get(ref.module);
        if (!mod) return null;
        const bucket = dir === 'out' ? mod.outputs : mod.inputs;
        const port = bucket[ref.port];
        return port ? { port } : null;
    }

    function sameRef(a, b) { return a.module === b.module && a.port === b.port; }

    /** `active:false` (Phase 3, PHASE3_SPEC.md 3.3) = „nur deklariert, Zustellung läuft noch
     *  klassisch" (z.B. Takt.beat→Rec.clock über taktEngine.onClockBeat) — die Struktur-Ansicht
     *  zeigt das ehrlich anders als eine ECHT über die Registry laufende Verbindung. Default
     *  `true`, weil die meisten Aufrufer (s. Stepseq→Poly) die reale Zustellung sind. */
    function connect(src, dst, { active = true } = {}) {
        const s = findPort(src, 'out'), d = findPort(dst, 'in');
        if (!s || !d) return false;
        if (!canConnect(s.port.type, d.port.type)) return false;
        const existing = connections.find((c) => sameRef(c.src, src) && sameRef(c.dst, dst));
        if (existing) {
            if (existing.active !== active) { existing.active = active; persist(); }
            return true;
        }
        connections.push({ src: { ...src }, dst: { ...dst }, active });
        persist();
        return true;
    }
    function disconnect(src, dst) {
        connections = connections.filter((c) => !(sameRef(c.src, src) && sameRef(c.dst, dst)));
        persist();
    }

    /** Nur Verbindungen, deren Module+Ports GERADE angemeldet sind — stale Refs (Port/Modul
     *  existiert nicht mehr) still verwerfen statt zu crashen, dasselbe Muster wie ctrlPos mit
     *  fehlenden Controls. */
    function liveConnections() {
        return connections.filter((c) => findPort(c.src, 'out') && findPort(c.dst, 'in'));
    }

    function emit(src, value) {
        const s = findPort(src, 'out');
        if (!s) return;
        for (const c of liveConnections()) {
            if (!sameRef(c.src, src)) continue;
            const d = findPort(c.dst, 'in');
            if (!d || !d.port.write) continue;
            const v = adaptValue(s.port.type, d.port.type, value);
            if (v === undefined) continue;
            d.port.write(v, { srcType: s.port.type });
            // Live-Puls für die Struktur-Ansicht (PHASE3_SPEC.md 3.3/3.5) — NUR wenn wirklich
            // jemand zuhört (Fenster offen), sonst zugeklappt exakt der alte Overhead: null.
            if (activityListeners.size) {
                for (const fn of activityListeners) fn({ src: { ...c.src }, dst: { ...c.dst }, type: s.port.type });
            }
        }
    }

    /** Registriert einen Aktivitäts-Listener (Struktur-Ansicht, Phase 3) — feuert bei jedem
     *  über emit() zugestellten Event. Rückgabe: Deregistrierer. flush() (Value-Ports) meldet
     *  NICHTS — die sind per Definition dauernd „aktiv", kein Puls-Feuerwerk pro Frame nötig. */
    function onActivity(fn) {
        activityListeners.add(fn);
        return () => activityListeners.delete(fn);
    }
    function offActivity(fn) { activityListeners.delete(fn); }

    function getValue(ref) {
        const s = findPort(ref, 'out');
        return s && s.port.read ? s.port.read() : undefined;
    }

    /** In den Render-Loop hängen (einmal pro Frame): sampelt NUR verbundene value-Outputs
     *  (kein `read` = Event-Port = wird hier übersprungen, keine Kosten ohne Verbindung). */
    function flush() {
        for (const c of liveConnections()) {
            const s = findPort(c.src, 'out');
            if (!s || !s.port.read) continue;
            const d = findPort(c.dst, 'in');
            if (!d || !d.port.write) continue;
            const v = adaptValue(s.port.type, d.port.type, s.port.read());
            if (v !== undefined) d.port.write(v, { srcType: s.port.type });
        }
    }

    /** Für die Struktur-Ansicht (Phase 3, read-only). */
    function connectionsList() {
        return liveConnections().map((c) => ({
            src: { ...c.src }, dst: { ...c.dst },
            type: findPort(c.src, 'out').port.type,
            active: c.active !== false,   // ältere/persistierte Einträge ohne das Feld = aktiv
        }));
    }
    function modulesList() {
        const portList = (bucket) => Object.entries(bucket).map(([id, p]) => ({ id, label: p.label, type: p.type }));
        return [...modules.entries()].map(([id, m]) => ({
            id, label: m.label,
            latency: m.latency ? m.latency() : null,
            outputs: portList(m.outputs),
            inputs: portList(m.inputs),
        }));
    }

    return {
        registerModule, unregisterModule,
        connect, disconnect,
        connections: connectionsList, modules: modulesList,
        emit, getValue, flush,
        onActivity, offActivity,
    };
}

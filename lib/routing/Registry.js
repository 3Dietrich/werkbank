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
import { t } from '../i18n.js';

/** defs.js liefert `ports` (id/label/type, reine Metadaten) — dieser Helfer mischt sie mit
 *  den Verhaltens-Closures (read/write) aus dem engine/werkbank.js zu den Buckets, die
 *  `registerModule` erwartet. Metadaten bleiben Sache der defs, Verhalten Sache des Aufrufers
 *  — dieselbe Trennung wie GROUPS/BUTTONS (defs kennt die id, onAction das Verhalten). */
export function bindPorts(defsPorts, bindings = {}) {
    const build = (list, binds) => {
        const out = {};
        for (const p of list || []) {
            const b = binds[p.id] || {};
            // min/max/stepSize/offAllowed (Punkt 1, ddw.md): Ziel-Ergonomie sitzt an der
            // PORT-INSTANZ (defs.js), nicht am Typ (types.js TYPES bleibt reine
            // Zustellweg-Mechanik) — zwei Ports desselben Typs können unterschiedliche
            // sinnvolle Bereiche haben. Rein additiv durchgereicht, bricht nichts.
            out[p.id] = {
                type: p.type, label: p.label, read: b.read, write: b.write,
                min: p.min, max: p.max, stepSize: p.stepSize, offAllowed: p.offAllowed,
            };
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

    /** Alle Input-Ports IM ENSEMBLE, die einen `srcType`-Output annehmen könnten (Punkt 1,
     *  ddw.md: Sq-Ziele deklarieren sich dezentral an ihren eigenen `ports.inputs`, kein
     *  zentraler Katalog). Nur real beschreibbare Ports (`write` gesetzt), gefiltert über
     *  dasselbe `canConnect` wie `connect()` — automatisch jedes künftige, kompatible Ziel,
     *  ohne dass hier jemand Namen pflegen muss. */
    function inputTargets(srcType) {
        const out = [];
        for (const [mid, m] of modules) {
            for (const [pid, p] of Object.entries(m.inputs)) {
                if (!p.write) continue;
                if (!canConnect(srcType, p.type)) continue;
                // Nur Ports, die eine Wertspanne DEKLARIEREN, sind als Sq-Ziel gemeint (ddw.md
                // 20260723_210324, @dpa: „'Rec > Clock' … von der Bezeichnung her sinnlos" —
                // der Port hat keine min/max, war nie für Sq-Fernsteuerung gedacht, taucht aber
                // wegen des AmpEnv->Gate-Adapters mit auf). Selbst-dokumentierend, kein Flag
                // nötig: „Sq-fernsteuerbar" heißt „bringt eine sinnvolle Wertspanne mit".
                if (p.min == null || p.max == null) continue;
                // Übersetzt (@dpa ddw.md 20260724, main Config): dieselben Label-Strings, die
                // auch am Control selbst stehen — kein separates Register nötig. Nur beim
                // Neu-Laden der Zielliste wirksam (↪️-Knopf), nicht live bei Sprachwechsel,
                // wie der Rest dieser Liste auch (@dpa: „kein Live-Update, ein Reload-Button").
                out.push({
                    name: `${t(m.label)} → ${t(p.label)}`, module: mid, port: pid,
                    type: p.type, min: p.min, max: p.max, stepSize: p.stepSize, offAllowed: p.offAllowed,
                });
            }
        }
        return out;
    }

    /** Gezielte Einmal-Zustellung an GENAU ein Ziel, UNABHÄNGIG von `connections` (Punkt 1:
     *  mehrere Sqs teilen sich denselben Output-Port `stepseq.amp`, aber jede Sq soll an ihr
     *  EIGENES gewähltes Ziel liefern — ein `emit()`-Fan-out über alle verbundenen Ziele wäre
     *  hier falsch). Dieselbe Adapt-/Aktivitäts-Logik wie `emit()`, nur ohne die
     *  connections-Liste zu befragen.
     *
     *  `srcRef.instance` (@dpa ddw.md 20260724_192304, Bugfix „lautes Getöse"): mehrere Sq-
     *  Klone teilen sich denselben registrierten Modul-Namen 'stepseq' (nur EIN Eintrag in
     *  `modules`, s. multiSq.js Kopfkommentar Punkt 4) — ein Ziel-write() konnte darum nicht
     *  unterscheiden, WELCHER Klon gerade liefert. Ziele mit eigenem Legato-Gedächtnis
     *  (triggerFromEnv/playRemote: „dieselbe Note hält, bis der NÄCHSTE Trigger sie ablöst")
     *  hielten das in EINER einzigen Variable fest — zwei unabhängig laufende Sq-Klone auf
     *  demselben Ziel rissen sich die Note gegenseitig ab (Wippe zwischen zwei Tönen), das
     *  klang als Getöse. `srcId` (Modul + optionale Instanz-Kennung) gibt jedem Ziel die
     *  Möglichkeit, sein Legato-Gedächtnis PRO QUELLE zu führen, statt global. */
    function deliver(srcRef, dstRef, value) {
        const s = findPort(srcRef, 'out'), d = findPort(dstRef, 'in');
        if (!s || !d || !d.port.write) return;
        const v = adaptValue(s.port.type, d.port.type, value);
        if (v === undefined) return;
        const srcId = srcRef.instance != null ? `${srcRef.module}#${srcRef.instance}` : srcRef.module;
        d.port.write(v, { srcType: s.port.type, srcId });
        if (activityListeners.size) {
            for (const fn of activityListeners) fn({ src: { ...srcRef }, dst: { ...dstRef }, type: s.port.type });
        }
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
        emit, deliver, inputTargets, getValue, flush,
        onActivity, offActivity,
    };
}
